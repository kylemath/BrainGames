/**
 * muse-browser.js — Zero-Dependency WebBluetooth GATT Client for InteraXon Muse
 * Supports:
 *   - Muse S Athena (Gen 3 / MS-03): Multiplexed universal sensor characteristic (273e0013)
 *   - Muse 2 & Classic Muse S: Per-sensor characteristics (273e0003..0006, 0009..000b)
 *   - Muse 2016 (MU-02): Two-Phase lazy GATT discovery (Control + 4 EEG characteristics)
 *
 * Exposes a drop-in `window.muse = { MuseClient, zipSamples, ... }` API with lightweight
 * zero-dependency Observable/Subject streams (including `.pipe()` support).
 */
(function (global) {
  'use strict';

  const MUSE_SERVICE = 0xfe8d; // 65165
  const CONTROL_CHAR_UUID = '273e0001-4c4d-454d-96be-f03bac821358';
  const TELEMETRY_CHAR_UUID = '273e000b-4c4d-454d-96be-f03bac821358';
  const GYROSCOPE_CHAR_UUID = '273e0009-4c4d-454d-96be-f03bac821358';
  const ACCELEROMETER_CHAR_UUID = '273e000a-4c4d-454d-96be-f03bac821358';
  const ATHENA_DATA_CHAR_UUID = '273e0013-4c4d-454d-96be-f03bac821358';
  const ATHENA_DATA2_CHAR_UUID = '273e0014-4c4d-454d-96be-f03bac821358';

  const EEG_UUIDS = [
    '273e0003-4c4d-454d-96be-f03bac821358', // Channel 0: TP9 (Left Temporal)
    '273e0004-4c4d-454d-96be-f03bac821358', // Channel 1: AF7 (Left Anterior Frontal)
    '273e0005-4c4d-454d-96be-f03bac821358', // Channel 2: AF8 (Right Anterior Frontal)
    '273e0006-4c4d-454d-96be-f03bac821358', // Channel 3: TP10 (Right Temporal)
    '273e0007-4c4d-454d-96be-f03bac821358'  // Channel 4: AUX (Right Auxiliary)
  ];

  const PPG_UUIDS = [
    '273e000f-4c4d-454d-96be-f03bac821358', // Ambient
    '273e0010-4c4d-454d-96be-f03bac821358', // Infrared
    '273e0011-4c4d-454d-96be-f03bac821358'  // Red
  ];

  const EEG_FREQUENCY = 256;
  const EEG_SAMPLES_PER_READING = 12;
  const PPG_FREQUENCY = 64;
  const PPG_SAMPLES_PER_READING = 6;
  const CHANNEL_NAMES = ['TP9', 'AF7', 'AF8', 'TP10', 'AUX'];
  const PPG_CHANNEL_NAMES = ['ambient', 'infrared', 'red', 'optics4'];

  // Muse S Athena constants
  const ATHENA_EEG_SCALE = 1450 / 16383;
  const ATHENA_EEG_MIDPOINT = 8192;
  const ATHENA_DEFAULT_PRESET = 'p1035';
  const PACKET_HEADER_SIZE = 9;
  const SUBPACKET_HEADER_SIZE = 5;
  const ATHENA_ACCEL_SCALE = 1 / 16384;
  const ATHENA_GYRO_SCALE = -0.0074768;

  const ATHENA_TAGS = {
    0x11: { type: 'eeg', channels: 4, samples: 4, bytes: 28 },
    0x12: { type: 'eeg', channels: 8, samples: 2, bytes: 28 },
    0x34: { type: 'optics', channels: 4, samples: 3, bytes: 30 },
    0x35: { type: 'optics', channels: 8, samples: 2, bytes: 40 },
    0x36: { type: 'optics', channels: 16, samples: 1, bytes: 40 },
    0x47: { type: 'motion', channels: 6, samples: 3, bytes: 36 },
    0x53: { type: 'drlref', channels: 2, samples: 6, bytes: 24 },
    0x88: { type: 'battery', channels: 1, samples: 1, bytes: 20, variableLength: true },
    0x98: { type: 'battery', channels: 1, samples: 1, bytes: 20 }
  };

  /**
   * Minimal RxJS-compatible Subject for zero-dependency reactive streaming.
   */
  class SimpleSubject {
    constructor() {
      this._listeners = new Set();
    }

    subscribe(observerOrNext, errorFn, completeFn) {
      const listener = typeof observerOrNext === 'function'
        ? { next: observerOrNext, error: errorFn || null, complete: completeFn || null }
        : (observerOrNext || {});
      this._listeners.add(listener);
      return {
        unsubscribe: () => {
          this._listeners.delete(listener);
        }
      };
    }

    next(value) {
      for (const listener of Array.from(this._listeners)) {
        if (typeof listener.next === 'function') {
          try {
            listener.next(value);
          } catch (err) {
            console.error('[muse-browser] Observer error:', err);
          }
        }
      }
    }

    complete() {
      for (const listener of Array.from(this._listeners)) {
        if (typeof listener.complete === 'function') {
          listener.complete();
        }
      }
      this._listeners.clear();
    }

    pipe(...operations) {
      return operations.reduce((prev, fn) => fn(prev), this);
    }
  }

  /**
   * Minimal RxJS-compatible BehaviorSubject that emits its current value upon subscription.
   */
  class BehaviorSubject extends SimpleSubject {
    constructor(initialValue) {
      super();
      this._value = initialValue;
    }

    get value() {
      return this._value;
    }

    subscribe(observerOrNext, errorFn, completeFn) {
      const sub = super.subscribe(observerOrNext, errorFn, completeFn);
      const fn = typeof observerOrNext === 'function' ? observerOrNext : (observerOrNext && observerOrNext.next);
      if (typeof fn === 'function') {
        try {
          fn(this._value);
        } catch (err) {
          console.error('[muse-browser] BehaviorSubject initial emit error:', err);
        }
      }
      return sub;
    }

    next(value) {
      this._value = value;
      super.next(value);
    }
  }

  /**
   * Encode an ASCII control command as a length-prefixed byte array terminated by newline (0x0A).
   * Format: [cmd.length + 1, ...charCodes, 0x0a]
   */
  function encodeCommand(cmd) {
    const encoded = new Uint8Array(cmd.length + 2);
    encoded[0] = cmd.length + 1;
    for (let i = 0; i < cmd.length; i++) {
      encoded[i + 1] = cmd.charCodeAt(i);
    }
    encoded[cmd.length + 1] = 0x0a;
    return encoded;
  }

  /**
   * Decode twelve packed 12-bit unsigned offset-binary EEG samples from an 18-byte payload (bytes 2..19).
   * Scale factor: 1000 / 2048 = 0.48828125 uV per LSB centered at 2048 (0x800).
   */
  function decodeEEGSamples(bytes) {
    const samples = new Array(12);
    for (let i = 0; i < 12; i++) {
      const byteOffset = Math.floor(i * 1.5);
      let raw12;
      if (i % 2 === 0) {
        raw12 = (bytes[byteOffset] << 4) | (bytes[byteOffset + 1] >> 4);
      } else {
        raw12 = ((bytes[byteOffset] & 0x0f) << 8) | bytes[byteOffset + 1];
      }
      samples[i] = 0.48828125 * (raw12 - 2048);
    }
    return samples;
  }

  /**
   * Decode six packed 24-bit unsigned PPG samples from an 18-byte payload.
   */
  function decodePPGSamples(bytes) {
    const samples = new Array(6);
    for (let i = 0; i < 6; i++) {
      const b = i * 3;
      samples[i] = (bytes[b] << 16) | (bytes[b + 1] << 8) | bytes[b + 2];
    }
    return samples;
  }

  /**
   * Decode Muse telemetry notification packet (battery, fuel gauge, ADC voltage, temperature).
   */
  function decodeTelemetry(dataView) {
    return {
      sequenceId: dataView.getUint16(0),
      batteryLevel: dataView.getUint16(2) / 512.0,
      fuelGaugeVoltage: dataView.getUint16(4) * 2.2,
      adcVoltage: dataView.getUint16(6),
      temperature: dataView.getUint16(8)
    };
  }

  /**
   * Decode 3-axis accelerometer or gyroscope notification packet.
   */
  function decodeImuPacket(dataView, scale) {
    const samples = [];
    for (let ofs = 2; ofs <= 14; ofs += 6) {
      samples.push({
        x: dataView.getInt16(ofs) * scale,
        y: dataView.getInt16(ofs + 2) * scale,
        z: dataView.getInt16(ofs + 4) * scale
      });
    }
    return {
      sequenceId: dataView.getUint16(0),
      samples: samples
    };
  }

  /**
   * Unpack unsigned integers from a little-endian bitstream, LSB first (Muse S Athena).
   */
  function unpackLE(bytes, offset, count, bits) {
    const values = new Array(count);
    const mask = (1 << bits) - 1;
    let acc = 0;
    let accBits = 0;
    let pos = offset;
    for (let i = 0; i < count; i++) {
      while (accBits < bits) {
        acc |= bytes[pos++] << accBits;
        accBits += 8;
      }
      values[i] = acc & mask;
      acc >>>= bits;
      accBits -= bits;
    }
    return values;
  }

  function athenaEegToMicrovolts(x) {
    return (x - ATHENA_EEG_MIDPOINT) * ATHENA_EEG_SCALE;
  }

  function deinterleave(values, channels, samples) {
    const out = [];
    for (let ch = 0; ch < channels; ch++) {
      const column = new Array(samples);
      for (let s = 0; s < samples; s++) {
        column[s] = values[s * channels + ch];
      }
      out.push(column);
    }
    return out;
  }

  function decodeAthenaPayload(spec, bytes, p) {
    const n = spec.channels * spec.samples;
    switch (spec.type) {
      case 'eeg': {
        const raw = deinterleave(unpackLE(bytes, p, n, 14), spec.channels, spec.samples);
        return { raw, values: raw.map((ch) => ch.map(athenaEegToMicrovolts)) };
      }
      case 'optics': {
        const raw = deinterleave(unpackLE(bytes, p, n, 20), spec.channels, spec.samples);
        return { raw, values: raw };
      }
      case 'motion': {
        const dv = new DataView(bytes.buffer, bytes.byteOffset + p, spec.bytes);
        const values = [];
        for (let i = 0; i < n; i++) {
          const v = dv.getInt16(i * 2, true);
          values.push(i % 6 < 3 ? v * ATHENA_ACCEL_SCALE : v * ATHENA_GYRO_SCALE);
        }
        return { raw: null, values: deinterleave(values, spec.channels, spec.samples) };
      }
      case 'drlref': {
        const dv = new DataView(bytes.buffer, bytes.byteOffset + p, spec.bytes);
        const values = [];
        for (let i = 0; i < n; i++) {
          values.push(dv.getUint16(i * 2, true));
        }
        return { raw: null, values: deinterleave(values, spec.channels, spec.samples) };
      }
      case 'battery': {
        const percent = Math.min(100, Math.max(0, (bytes[p] | (bytes[p + 1] << 8)) / 256));
        return { raw: null, values: [[percent]] };
      }
    }
  }

  /**
   * Parse one notification from the Muse S Athena multiplexed data characteristic (273e0013).
   */
  function parseAthenaNotification(bytes, onSubpacket) {
    let packets = 0;
    let subpackets = 0;
    let skippedBytes = 0;
    let offset = 0;

    while (offset < bytes.length) {
      const length = bytes[offset];
      if (length < PACKET_HEADER_SIZE + SUBPACKET_HEADER_SIZE || offset + length > bytes.length) {
        skippedBytes += bytes.length - offset;
        break;
      }
      const end = offset + length;
      const packetCounter = bytes[offset + 1] | (bytes[offset + 2] << 8);
      let i = offset + PACKET_HEADER_SIZE;

      while (i + SUBPACKET_HEADER_SIZE <= end) {
        const tag = bytes[i];
        const spec = ATHENA_TAGS[tag];
        if (!spec) break;
        const p = i + SUBPACKET_HEADER_SIZE;

        if (spec.variableLength) {
          if (p + 2 > end) break;
          const decoded = decodeAthenaPayload(spec, bytes, p);
          onSubpacket({
            type: spec.type,
            tag,
            index: bytes[i + 1],
            packetCounter,
            raw: decoded.raw,
            values: decoded.values
          });
          subpackets++;
          const fixedNext = p + spec.bytes;
          if (fixedNext <= end && (fixedNext === end || ATHENA_TAGS[bytes[fixedNext]])) {
            i = fixedNext;
          } else {
            i = end;
          }
          continue;
        }

        if (p + spec.bytes > end) break;
        const decoded = decodeAthenaPayload(spec, bytes, p);
        onSubpacket({
          type: spec.type,
          tag,
          index: bytes[i + 1],
          packetCounter,
          raw: decoded.raw,
          values: decoded.values
        });
        subpackets++;
        i = p + spec.bytes;
      }

      skippedBytes += end - i;
      packets++;
      offset = end;
    }

    return { packets, subpackets, skippedBytes };
  }

  /**
   * Synchronize multi-channel EEG readings across TP9, AF7, AF8, and TP10 by packet index.
   * Supports both 12-sample Classic packets and 4/2-sample Muse S Athena subpackets.
   */
  function zipSamples(eegReadingsSubject) {
    const out = new SimpleSubject();
    const pendingByIndex = new Map();

    eegReadingsSubject.subscribe((reading) => {
      const ch = typeof reading.electrode === 'number'
        ? reading.electrode
        : CHANNEL_NAMES.indexOf(reading.electrode);
      if (ch < 0 || ch >= 4) return;

      const idx = reading.index;
      if (!pendingByIndex.has(idx)) {
        pendingByIndex.set(idx, {
          packets: [null, null, null, null],
          timestamp: reading.timestamp
        });
      }
      const entry = pendingByIndex.get(idx);
      entry.packets[ch] = reading.samples;

      if (entry.packets[0] && entry.packets[1] && entry.packets[2] && entry.packets[3]) {
        pendingByIndex.delete(idx);
        const dt = 1000.0 / EEG_FREQUENCY;
        const numSamples = entry.packets[0].length;
        for (let s = 0; s < numSamples; s++) {
          out.next({
            index: idx,
            timestamp: entry.timestamp + s * dt,
            data: [
              entry.packets[0][s],
              entry.packets[1][s],
              entry.packets[2][s],
              entry.packets[3][s]
            ]
          });
        }
      }

      // Bound map size if packets drop
      if (pendingByIndex.size > 64) {
        const oldestKey = pendingByIndex.keys().next().value;
        pendingByIndex.delete(oldestKey);
      }
    });

    return out;
  }

  /**
   * Unified Muse WebBluetooth Client (Muse S Athena, Muse S, Muse 2, Muse 2016).
   */
  class MuseClient {
    constructor() {
      this.enableAux = false;
      this.enablePpg = false;
      this.isAthena = false;
      this.preset = null;
      this.deviceName = '';
      this.gatt = null;
      this.service = null;
      this.controlChar = null;
      this.eegCharacteristics = [];
      this.ppgCharacteristics = [];
      this.lastIndex = null;
      this.lastTimestamp = null;
      this._controlBuffer = '';
      this._gattQueue = Promise.resolve();
      this._boundListeners = [];
      this._athenaSeqTracker = new Map();
      this._athenaStartWallTime = null;
      this._athenaReceivedEEG = false;

      // Reactive streams
      this.connectionStatus = new BehaviorSubject(false);
      this.eegReadings = new SimpleSubject();
      this.ppgReadings = new SimpleSubject();
      this.telemetryData = new SimpleSubject();
      this.accelerometerData = new SimpleSubject();
      this.gyroscopeData = new SimpleSubject();
      this.controlResponses = new SimpleSubject();
      this.eventMarkers = new SimpleSubject();
    }

    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Serialize GATT operations on the single-flight WebBluetooth peripheral queue
     * and retry transient 'GATT operation already in progress' / discovery errors.
     */
    _enqueueGatt(fn, retries = 3, backoffMs = 120) {
      const runWithRetry = async () => {
        let lastErr;
        for (let attempt = 0; attempt < retries; attempt++) {
          try {
            return await fn();
          } catch (err) {
            lastErr = err;
            await this.delay(backoffMs * (attempt + 1));
          }
        }
        throw lastErr;
      };
      const next = this._gattQueue.then(runWithRetry, runWithRetry);
      this._gattQueue = next.catch(() => {});
      return next;
    }

    _addCharListener(char, handler) {
      char.addEventListener('characteristicvaluechanged', handler);
      this._boundListeners.push({ char, handler });
    }

    _cleanupListeners() {
      for (const { char, handler } of this._boundListeners) {
        try {
          char.removeEventListener('characteristicvaluechanged', handler);
        } catch (_) {}
      }
      this._boundListeners = [];
      this.eegCharacteristics = [];
      this.ppgCharacteristics = [];
      this.controlChar = null;
      this._controlBuffer = '';
    }

    _trackAthenaSubpacket(tag, seqIndex, samplesPerSubpacket, sampleRate) {
      if (this._athenaStartWallTime === null) {
        this._athenaStartWallTime = Date.now();
      }
      const key = `tag_${tag}`;
      const last = this._athenaSeqTracker.get(key);
      let unwrappedCount = 0;
      if (last) {
        const step = (seqIndex - last.seq + 256) % 256 || 1;
        unwrappedCount = last.count + step;
      }
      this._athenaSeqTracker.set(key, { seq: seqIndex, count: unwrappedCount });
      const sampleIndex = unwrappedCount * samplesPerSubpacket;
      const timestamp = this._athenaStartWallTime + (sampleIndex * 1000.0) / sampleRate;
      return { unwrappedCount, timestamp };
    }

    /**
     * Phase 1: Connect to GATT service 0xFE8D and bind the Control characteristic (273e0001).
     */
    async connect(gatt) {
      this._cleanupListeners();
      this.isAthena = false;
      this._athenaSeqTracker.clear();
      this._athenaStartWallTime = null;
      this._athenaReceivedEEG = false;

      if (gatt) {
        this.gatt = gatt;
      } else {
        const device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [MUSE_SERVICE] }, { namePrefix: 'Muse' }],
          optionalServices: [MUSE_SERVICE]
        });
        this.gatt = await device.gatt.connect();
      }

      this.deviceName = (this.gatt.device && this.gatt.device.name) || 'Muse';
      this.service = await this._enqueueGatt(() => this.gatt.getPrimaryService(MUSE_SERVICE));

      // Listen for unexpected GATT disconnection
      if (this.gatt.device) {
        this.gatt.device.addEventListener('gattserverdisconnected', () => {
          this._cleanupListeners();
          this.gatt = null;
          this.service = null;
          this.connectionStatus.next(false);
        }, { once: true });
      }

      // Bind Control characteristic (273e0001)
      this.controlChar = await this._enqueueGatt(() => this.service.getCharacteristic(CONTROL_CHAR_UUID));
      await this._enqueueGatt(() => this.controlChar.startNotifications());
      this._addCharListener(this.controlChar, (event) => {
        const dv = event.target.value;
        const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
        const len = bytes[0];
        let str = '';
        for (let i = 1; i <= len && i < bytes.length; i++) {
          str += String.fromCharCode(bytes[i]);
        }
        this._controlBuffer += str;
        if (this._controlBuffer.length > 4096) {
          this._controlBuffer = this._controlBuffer.slice(-1024);
        }
        const startIdx = this._controlBuffer.indexOf('{');
        const endIdx = this._controlBuffer.indexOf('}');
        if (startIdx !== -1 && endIdx > startIdx) {
          const jsonCandidate = this._controlBuffer.slice(startIdx, endIdx + 1);
          this._controlBuffer = this._controlBuffer.slice(endIdx + 1);
          try {
            this.controlResponses.next(JSON.parse(jsonCandidate));
          } catch (_) {}
        }
      });

      this.connectionStatus.next(true);
    }

    async sendCommand(cmd) {
      if (!this.controlChar) {
        throw new Error('Muse Control characteristic (273e0001) is not connected.');
      }
      const payload = encodeCommand(cmd);
      await this._enqueueGatt(async () => {
        if (typeof this.controlChar.writeValueWithoutResponse === 'function') {
          await this.controlChar.writeValueWithoutResponse(payload);
        } else {
          await this.controlChar.writeValue(payload);
        }
      });
    }

    /**
     * Phase 2: Detect Muse S Athena (273e0013) vs Classic Muse (273e0003..0006),
     * subscribe to sensor notifications, and run the appropriate startup handshake.
     */
    async start() {
      if (!this.service || !this.controlChar) {
        throw new Error('Call connect() before start().');
      }

      // Check whether this headband is a Muse S Athena (exposes 273e0013)
      let byUuid = new Map();
      try {
        const allChars = await this._enqueueGatt(() => this.service.getCharacteristics(), 2, 150);
        byUuid = new Map(allChars.map((c) => [c.uuid.toLowerCase(), c]));
      } catch (_) {}

      let athenaDataChar = byUuid.get(ATHENA_DATA_CHAR_UUID) || null;
      if (!athenaDataChar && !byUuid.has(EEG_UUIDS[0])) {
        try {
          athenaDataChar = await this._enqueueGatt(() => this.service.getCharacteristic(ATHENA_DATA_CHAR_UUID), 1, 50);
        } catch (_) {}
      }

      if (athenaDataChar && !byUuid.has(EEG_UUIDS[0])) {
        this.isAthena = true;
        await this._startAthena(athenaDataChar, byUuid.get(ATHENA_DATA2_CHAR_UUID) || null);
        return;
      }

      // Classic Muse (Muse 2016, Muse 2, Classic Muse S)
      this.isAthena = false;
      await this.pause();
      await this.delay(100);
      await this.sendCommand('v1');
      await this.delay(100);

      const basePreset = this.enableAux ? 'p20' : 'p21';
      await this.sendCommand(basePreset);
      await this.delay(100);

      let preset = basePreset;
      if (this.enablePpg) {
        preset = this.enableAux ? 'p51' : 'p50';
        await this.sendCommand(preset);
        await this.delay(100);
      }
      this.preset = preset;

      await this.sendCommand('s');
      await this.delay(100);
      await this.resume();

      // Settle delay for Muse 2016 / Muse 2 / Muse S firmware to expose EEG UUIDs in GATT table
      await this.delay(500);

      this.eegCharacteristics = [];
      const channelCount = this.enableAux ? 5 : 4;
      let boundChars = [];

      try {
        const allChars = await this._enqueueGatt(() => this.service.getCharacteristics(), 2, 150);
        const charMap = new Map(allChars.map((c) => [c.uuid.toLowerCase(), c]));
        for (let ch = 0; ch < channelCount; ch++) {
          const target = charMap.get(EEG_UUIDS[ch]);
          if (target) boundChars.push({ ch, char: target });
        }
      } catch (_) {}

      if (boundChars.length === 0) {
        for (let ch = 0; ch < channelCount; ch++) {
          try {
            const char = await this._enqueueGatt(() => this.service.getCharacteristic(EEG_UUIDS[ch]), 3, 200);
            boundChars.push({ ch, char });
          } catch (err) {
            console.warn(`[muse-browser] EEG channel ${CHANNEL_NAMES[ch]} unavailable:`, err.message);
          }
        }
      }

      for (const { ch, char } of boundChars) {
        await this._enqueueGatt(() => char.startNotifications(), 3, 150);
        this._addCharListener(char, (event) => {
          const dataView = event.target.value;
          const eventIndex = dataView.getUint16(0);
          const payload = new Uint8Array(dataView.buffer, dataView.byteOffset + 2, 18);
          const samples = decodeEEGSamples(payload);
          const timestamp = this.getTimestamp(eventIndex, EEG_SAMPLES_PER_READING, EEG_FREQUENCY);
          this.eegReadings.next({
            electrode: ch,
            channelName: CHANNEL_NAMES[ch],
            index: eventIndex,
            samples: samples,
            timestamp: timestamp
          });
        });
        this.eegCharacteristics.push(char);
      }

      // Optional non-fatal binding for Telemetry, Accelerometer, and Gyroscope
      try {
        const telemChar = await this._enqueueGatt(() => this.service.getCharacteristic(TELEMETRY_CHAR_UUID), 1, 50);
        await this._enqueueGatt(() => telemChar.startNotifications(), 2, 100);
        this._addCharListener(telemChar, (event) => {
          this.telemetryData.next(decodeTelemetry(event.target.value));
        });
      } catch (_) {}

      try {
        const accelChar = await this._enqueueGatt(() => this.service.getCharacteristic(ACCELEROMETER_CHAR_UUID), 1, 50);
        await this._enqueueGatt(() => accelChar.startNotifications(), 2, 100);
        this._addCharListener(accelChar, (event) => {
          this.accelerometerData.next(decodeImuPacket(event.target.value, 0.0000610352));
        });
      } catch (_) {}

      try {
        const gyroChar = await this._enqueueGatt(() => this.service.getCharacteristic(GYROSCOPE_CHAR_UUID), 1, 50);
        await this._enqueueGatt(() => gyroChar.startNotifications(), 2, 100);
        this._addCharListener(gyroChar, (event) => {
          this.gyroscopeData.next(decodeImuPacket(event.target.value, 0.0074768));
        });
      } catch (_) {}

      if (this.enablePpg) {
        this.ppgCharacteristics = [];
        for (let p = 0; p < PPG_UUIDS.length; p++) {
          try {
            const ppgChar = await this._enqueueGatt(() => this.service.getCharacteristic(PPG_UUIDS[p]), 2, 100);
            await this._enqueueGatt(() => ppgChar.startNotifications(), 2, 100);
            this._addCharListener(ppgChar, (event) => {
              const dv = event.target.value;
              const idx = dv.getUint16(0);
              const bytes = new Uint8Array(dv.buffer, dv.byteOffset + 2, 18);
              this.ppgReadings.next({
                index: idx,
                ppgChannel: p,
                channelName: PPG_CHANNEL_NAMES[p] || `ppg${p}`,
                samples: decodePPGSamples(bytes),
                timestamp: this.getTimestamp(idx, PPG_SAMPLES_PER_READING, PPG_FREQUENCY)
              });
            });
            this.ppgCharacteristics.push(ppgChar);
          } catch (_) {}
        }
      }
    }

    async _startAthena(dataChar, data2Char) {
      const handleAthenaEvent = (event) => {
        const dv = event.target.value;
        const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
        parseAthenaNotification(bytes, (sub) => {
          if (sub.type === 'eeg') {
            this._athenaReceivedEEG = true;
            const nSamples = sub.values[0] ? sub.values[0].length : 4;
            const tracked = this._trackAthenaSubpacket(sub.tag, sub.index, nSamples, EEG_FREQUENCY);
            const maxCh = this.enableAux ? Math.min(sub.values.length, 5) : Math.min(sub.values.length, 4);
            for (let ch = 0; ch < maxCh; ch++) {
              this.eegReadings.next({
                electrode: ch,
                channelName: CHANNEL_NAMES[ch],
                index: tracked.unwrappedCount,
                samples: sub.values[ch],
                timestamp: tracked.timestamp
              });
            }
          } else if (sub.type === 'optics') {
            const nSamples = sub.values[0] ? sub.values[0].length : 3;
            const tracked = this._trackAthenaSubpacket(sub.tag, sub.index, nSamples, PPG_FREQUENCY);
            const maxPpg = Math.min(sub.values.length, 4);
            for (let ch = 0; ch < maxPpg; ch++) {
              this.ppgReadings.next({
                index: tracked.unwrappedCount,
                ppgChannel: ch,
                channelName: PPG_CHANNEL_NAMES[ch] || `optics${ch + 1}`,
                samples: sub.values[ch],
                timestamp: tracked.timestamp
              });
            }
          } else if (sub.type === 'motion') {
            this.accelerometerData.next({
              sequenceId: sub.index,
              samples: [0, 1, 2].map((i) => ({
                x: sub.values[0][i],
                y: sub.values[1][i],
                z: sub.values[2][i]
              }))
            });
            this.gyroscopeData.next({
              sequenceId: sub.index,
              samples: [0, 1, 2].map((i) => ({
                x: sub.values[3][i],
                y: sub.values[4][i],
                z: sub.values[5][i]
              }))
            });
          } else if (sub.type === 'battery') {
            this.telemetryData.next({
              sequenceId: sub.index,
              batteryLevel: sub.values[0][0],
              fuelGaugeVoltage: 0,
              adcVoltage: 0,
              temperature: 0
            });
          }
        });
      };

      await this._enqueueGatt(() => dataChar.startNotifications(), 3, 150);
      this._addCharListener(dataChar, handleAthenaEvent);
      this.eegCharacteristics = [dataChar];

      if (data2Char) {
        try {
          await this._enqueueGatt(() => data2Char.startNotifications(), 2, 100);
          this._addCharListener(data2Char, handleAthenaEvent);
        } catch (_) {}
      }

      const preset = this.preset || (this.enableAux ? 'p1045' : ATHENA_DEFAULT_PRESET);
      this.preset = preset;
      const sequence = [
        ['v6', 200],
        ['s', 200],
        ['h', 200],
        [preset, 200],
        ['s', 200],
        ['dc001', 50],
        ['dc001', 100],
        ['L1', 300],
        ['s', 200]
      ];
      for (const [cmd, delayMs] of sequence) {
        await this.sendCommand(cmd);
        await this.delay(delayMs);
      }

      for (let waited = 0; waited < 1500 && !this._athenaReceivedEEG; waited += 100) {
        await this.delay(100);
      }
      if (!this._athenaReceivedEEG) {
        await this.sendCommand('d');
        for (let waited = 0; waited < 1500 && !this._athenaReceivedEEG; waited += 100) {
          await this.delay(100);
        }
      }
    }

    async pause() {
      await this.sendCommand('h');
    }

    async resume() {
      if (this.isAthena) {
        await this.sendCommand('dc001');
        await this.delay(50);
        await this.sendCommand('dc001');
        return;
      }
      await this.sendCommand('d');
    }

    async deviceInfo() {
      await this.sendCommand('v1');
    }

    async injectMarker(value, timestamp = Date.now()) {
      this.eventMarkers.next({ value, timestamp });
    }

    disconnect() {
      if (this.isAthena && this.controlChar && this.gatt && this.gatt.connected) {
        this.sendCommand('h').catch(() => {});
      }
      this._cleanupListeners();
      if (this.gatt) {
        this.lastIndex = null;
        this.lastTimestamp = null;
        this._athenaSeqTracker.clear();
        this._athenaStartWallTime = null;
        try {
          this.gatt.disconnect();
        } catch (_) {}
        this.gatt = null;
        this.service = null;
        this.connectionStatus.next(false);
      }
    }

    getTimestamp(eventIndex, samplesPerReading, frequency) {
      const readingDelta = 1000.0 * (1.0 / frequency) * samplesPerReading;
      if (this.lastIndex === null || this.lastTimestamp === null) {
        this.lastIndex = eventIndex;
        this.lastTimestamp = Date.now() - readingDelta;
      }
      while (this.lastIndex - eventIndex > 4096) {
        eventIndex += 65536;
      }
      if (eventIndex === this.lastIndex) {
        return this.lastTimestamp;
      }
      if (eventIndex > this.lastIndex) {
        this.lastTimestamp += readingDelta * (eventIndex - this.lastIndex);
        this.lastIndex = eventIndex;
        return this.lastTimestamp;
      }
      return this.lastTimestamp - readingDelta * (this.lastIndex - eventIndex);
    }
  }

  global.muse = {
    MuseClient: MuseClient,
    zipSamples: zipSamples,
    decodeEEGSamples: decodeEEGSamples,
    encodeCommand: encodeCommand,
    parseAthenaNotification: parseAthenaNotification,
    unpackLE: unpackLE,
    athenaEegToMicrovolts: athenaEegToMicrovolts,
    ATHENA_DATA_CHARACTERISTIC: ATHENA_DATA_CHAR_UUID,
    ATHENA_EEG_SCALE: ATHENA_EEG_SCALE,
    MUSE_SERVICE: MUSE_SERVICE,
    EEG_FREQUENCY: EEG_FREQUENCY,
    EEG_SAMPLES_PER_READING: EEG_SAMPLES_PER_READING,
    channelNames: CHANNEL_NAMES,
    ppgChannelNames: PPG_CHANNEL_NAMES
  };

  console.log('✅ Zero-dependency Muse WebBluetooth client (muse-browser.js) loaded [Muse 2016 / Muse 2 / Muse S / Muse S Athena]!');
})(typeof window !== 'undefined' ? window : globalThis);
