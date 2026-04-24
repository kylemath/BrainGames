// brainGames/core/museManager.js
// Globals-only module. Declares window.MuseEEGManager. All DOM writes and
// references to the parent project's `logger` have been stripped; use
// `onLog(msg, level)` and `onStatus(text, status)` callbacks (both optional,
// default to console/no-op). Signal-processing math is preserved verbatim.

(function (global) {
  'use strict';

  function MuseEEGManager() {
    this.muse = null;
    this.isConnected = false;
    this.dataBuffer = [];
    this.samplingRate = 256;
    this.bufferSize = 256; // 1 second of data
    this.subscriptions = [];

    // Optional callbacks. Defaults are safe no-ops / console.
    var self = this;
    this.onLog = function (msg, level) {
      if (typeof console === 'undefined') return;
      if (level === 'error') console.error(msg);
      else if (level === 'warning') console.warn(msg);
      else console.log(msg);
    };
    this.onStatus = function (/* text, status */) {};
    this.onUpdate = function (/* eegData */) {};

    // Internal helper to call onLog safely.
    this._log = function (msg, level) {
      try { self.onLog(msg, level || 'info'); } catch (e) { /* ignore */ }
    };
    this._status = function (text, status) {
      try { self.onStatus(text, status || ''); } catch (e) { /* ignore */ }
    };
  }

  MuseEEGManager.prototype.connect = async function () {
    var eegData = global.eegData;
    try {
      this._log('=== ATTEMPTING TO CONNECT TO MUSE ===', 'info');

      this._log('Step 1: Checking Web Bluetooth support...', 'info');
      if (!global.navigator || !global.navigator.bluetooth) {
        throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Opera.');
      }
      this._log('Web Bluetooth is supported', 'success');

      this._log('Step 2: Checking if muse-js library is loaded...', 'info');
      if (!global.muse) {
        throw new Error('muse-js library not loaded! The script may have failed to load. Check your internet connection.');
      }
      if (!global.muse.MuseClient) {
        throw new Error('MuseClient not found in muse-js library! The library may be corrupted or outdated.');
      }
      this._log('muse-js library is loaded correctly', 'success');

      this._log('Step 3: Creating MuseClient instance...', 'info');
      this.muse = new global.muse.MuseClient();
      this._log('MuseClient created successfully', 'success');

      this._log('Step 4: Opening Bluetooth device selector...', 'info');
      this._log('Please select your Muse device from the popup', 'info');
      await this.muse.connect();
      this._log('Device paired successfully', 'success');

      this._log('Step 5: Setting up data subscriptions...', 'info');

      var self = this;
      var eegSubscription = this.muse.eegReadings.subscribe(function (reading) {
        self.processEEGReading(reading);
      });
      this.subscriptions.push(eegSubscription);
      this._log('EEG data subscription active', 'success');

      var accelSubscription = this.muse.accelerometerData.subscribe(function (/* accel */) {
        // Movement detection can be added here later.
      });
      this.subscriptions.push(accelSubscription);

      var telemetrySubscription = this.muse.telemetryData.subscribe(function (telemetry) {
        if (telemetry && telemetry.batteryLevel !== undefined) {
          self._log('Battery Level: ' + telemetry.batteryLevel.toFixed(1) + '%', 'success');
        }
      });
      this.subscriptions.push(telemetrySubscription);

      var statusSubscription = this.muse.connectionStatus.subscribe(function (status) {
        if (!status) {
          self._log('Connection lost! Please check your device.', 'error');
          self.isConnected = false;
          if (eegData) eegData.connected = false;
          self._status('Connection lost', 'error');
        }
      });
      this.subscriptions.push(statusSubscription);

      this._log('All subscriptions configured', 'success');

      this._log('Step 6: Starting EEG data stream...', 'info');
      await this.muse.start();

      this.isConnected = true;
      if (eegData) eegData.connected = true;
      this._status('Connected to Muse', 'connected');

      this._log('SUCCESS! Muse is connected and streaming data', 'success');
    } catch (error) {
      this._log('Connection failed: ' + error.message, 'error');
      this.isConnected = false;
      if (eegData) eegData.connected = false;

      var errorMsg = 'Connection failed';
      var helpText = '';
      if (error.name === 'NotFoundError' || (error.message && error.message.indexOf('cancelled') !== -1)) {
        errorMsg = 'No device selected';
        helpText = 'Tip: Make sure to select a Muse device from the Bluetooth pairing dialog.';
      } else if (error.message && (error.message.indexOf('Bluetooth') !== -1 || error.message.indexOf('GATT') !== -1)) {
        errorMsg = 'Bluetooth connection failed';
        helpText = 'Troubleshooting: charge + power on device, enable Bluetooth, try toggling the device, move within 10 feet.';
      } else if (error.message && error.message.indexOf('not supported') !== -1) {
        errorMsg = 'Browser not compatible';
        helpText = 'Tip: Please use Chrome, Edge, or Opera browser to connect to Muse devices.';
      } else if (error.message && error.message.indexOf('library') !== -1) {
        errorMsg = 'Library loading error';
        helpText = 'Tip: The muse-js library failed to load. Check your internet connection and refresh the page.';
      } else {
        errorMsg = 'Connection error: ' + error.message;
        helpText = 'Tip: Try refreshing the page and attempting to connect again.';
      }
      this._status(errorMsg, 'error');
      this._log(helpText, 'warning');
      throw error;
    }
  };

  MuseEEGManager.prototype.processEEGReading = function (reading) {
    var eegData = global.eegData;
    if (!eegData) return;

    // Muse sends: 0 = TP9, 1 = AF7, 2 = AF8, 3 = TP10
    var electrodeMap = ['TP9', 'AF7', 'AF8', 'TP10'];
    var electrodeName = typeof reading.electrode === 'number'
      ? electrodeMap[reading.electrode]
      : reading.electrode;

    if (this.dataBuffer.length < 5) {
      var first = reading.samples && reading.samples[0] !== undefined ? reading.samples[0].toFixed(2) : 'n/a';
      this._log('EEG data received from ' + electrodeName + ': ' + reading.samples.length + ' samples, first value: ' + first + ' uV', 'success');
    }
    if (this.dataBuffer.length === 4) {
      this._log('All 4 EEG channels are transmitting data successfully!', 'success');
    }

    this.dataBuffer.push({
      electrode: electrodeName,
      samples: reading.samples,
      timestamp: Date.now()
    });

    if (this.dataBuffer.length > this.bufferSize * 4) {
      this.dataBuffer = this.dataBuffer.slice(-this.bufferSize * 4);
    }

    var electrodeIndex = typeof reading.electrode === 'number'
      ? reading.electrode
      : electrodeMap.indexOf(reading.electrode);

    if (electrodeIndex !== -1 && reading.samples.length > 0) {
      eegData.raw[electrodeIndex] = reading.samples[reading.samples.length - 1];
    }

    if (!eegData.rawHistory[electrodeName]) {
      eegData.rawHistory[electrodeName] = [];
    }
    for (var s = 0; s < reading.samples.length; s++) {
      eegData.rawHistory[electrodeName].push(reading.samples[s]);
    }

    if (eegData.rawHistory[electrodeName].length > eegData.historyLength) {
      eegData.rawHistory[electrodeName] = eegData.rawHistory[electrodeName].slice(-eegData.historyLength);
    }

    if (this.dataBuffer.length % 32 === 0) {
      this.calculateFrequencyBands();
    }

    if (this.dataBuffer.length % 100 === 0) {
      var dataRate = (this.dataBuffer.length / 4).toFixed(0);
      this._status('Connected (' + dataRate + ' packets/ch)', 'connected');
    }
  };

  MuseEEGManager.prototype.calculateFrequencyBands = function () {
    var eegData = global.eegData;
    if (!eegData) return;

    var recentData = this.dataBuffer.slice(-64);
    if (recentData.length < 64) return;

    var electrodeData = { TP9: [], AF7: [], AF8: [], TP10: [] };
    for (var r = 0; r < recentData.length; r++) {
      var reading = recentData[r];
      if (electrodeData[reading.electrode]) {
        for (var q = 0; q < reading.samples.length; q++) {
          electrodeData[reading.electrode].push(reading.samples[q]);
        }
      }
    }

    var totalVariance = 0;
    var totalMean = 0;
    var electrodeCount = 0;

    var keys = Object.keys(electrodeData);
    for (var k = 0; k < keys.length; k++) {
      var electrode = keys[k];
      var samples = electrodeData[electrode].slice(-64);
      if (samples.length >= 64) {
        var variance = this.calculateVariance(samples);
        var mean = 0;
        for (var a = 0; a < samples.length; a++) mean += samples[a];
        mean = mean / samples.length;
        totalVariance += variance;
        totalMean += Math.abs(mean);
        electrodeCount++;
      }
    }

    if (electrodeCount > 0) {
      var avgVariance = totalVariance / electrodeCount;
      // totalMean averaged for parity with original even if unused downstream.
      var avgMean = totalMean / electrodeCount; // eslint-disable-line no-unused-vars

      eegData.alpha = Math.max(0, Math.min(1, avgVariance * 0.001));
      eegData.beta  = Math.max(0, Math.min(1, avgVariance * 0.0008));
      eegData.theta = Math.max(0, Math.min(1, avgVariance * 0.0012));
      eegData.delta = Math.max(0, Math.min(1, avgVariance * 0.0015));
      eegData.gamma = Math.max(0, Math.min(1, avgVariance * 0.0005));

      eegData.attention = Math.max(0, Math.min(1, (eegData.beta + eegData.gamma) / 2));
      eegData.meditation = Math.max(0, Math.min(1, (eegData.alpha + eegData.theta) / 2));

      if (this.dataBuffer.length % 320 === 0 && typeof console !== 'undefined') {
        console.log('Frequency bands updated:', {
          alpha: eegData.alpha.toFixed(3),
          beta: eegData.beta.toFixed(3),
          theta: eegData.theta.toFixed(3),
          variance: avgVariance.toFixed(2)
        });
      }
    }

    eegData.connected = this.isConnected;

    if (typeof this.onUpdate === 'function') {
      try {
        this.onUpdate({
          alpha: eegData.alpha,
          beta: eegData.beta,
          theta: eegData.theta,
          delta: eegData.delta,
          gamma: eegData.gamma,
          attention: eegData.attention,
          meditation: eegData.meditation,
          connected: eegData.connected
        });
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('MuseEEGManager.onUpdate threw:', e);
      }
    }
  };

  MuseEEGManager.prototype.calculateVariance = function (samples) {
    var mean = 0;
    for (var i = 0; i < samples.length; i++) mean += samples[i];
    mean = mean / samples.length;
    var variance = 0;
    for (var j = 0; j < samples.length; j++) variance += Math.pow(samples[j] - mean, 2);
    variance = variance / samples.length;
    return Math.sqrt(variance);
  };

  MuseEEGManager.prototype.setupEEGCharacteristics = async function () {
    // Set up EEG characteristics after device initialization.
    // (They only appear after start() sends commands.)
    try {
      if (!this.muse || !this.muse._museService) {
        this._log('No service reference available, EEG may already be set up', 'warning');
        return;
      }

      var EEG_CHARACTERISTICS = [
        '273e0003-4c4d-454d-96be-f03bac821358', // TP9
        '273e0004-4c4d-454d-96be-f03bac821358', // AF7
        '273e0005-4c4d-454d-96be-f03bac821358', // AF8
        '273e0006-4c4d-454d-96be-f03bac821358'  // TP10
      ];

      this._log('Waiting for EEG characteristics to appear...', 'info');
      await new Promise(function (resolve) { setTimeout(resolve, 1500); });

      this._log('Fetching EEG characteristics...', 'info');
      var eegObservables = [];

      var self = this;
      for (var i = 0; i < 4; i++) {
        try {
          var characteristic = await this.muse._museService.getCharacteristic(EEG_CHARACTERISTICS[i]);
          this._log('Got EEG channel ' + i, 'success');

          await characteristic.startNotifications();
          this._log('  Notifications started for channel ' + i, 'info');

          (function (channelIndex, ch) {
            ch.addEventListener('characteristicvaluechanged', function (event) {
              var data = event.target.value;
              var view = new DataView(data.buffer);
              var index = view.getUint16(0);
              var samples = self.decodeEEGSamples(new Uint8Array(data.buffer).subarray(2));

              var reading = {
                electrode: channelIndex,
                index: index,
                samples: samples,
                timestamp: Date.now()
              };
              self.processEEGReading(reading);
            });
          })(i, characteristic);

          eegObservables.push(characteristic);
        } catch (error) {
          this._log('Could not get EEG channel ' + i + ': ' + error.message, 'warning');
        }
      }

      if (eegObservables.length > 0) {
        this._log('EEG characteristics set up successfully! (' + eegObservables.length + ' channels)', 'success');
      } else {
        this._log('No EEG characteristics could be set up', 'error');
      }
    } catch (error) {
      this._log('Error setting up EEG characteristics: ' + error.message, 'error');
    }
  };

  MuseEEGManager.prototype.decodeEEGSamples = function (data) {
    var samples = [];
    for (var i = 0; i < 12; i++) {
      var byteIndex = i * 1.5;
      var sample;
      if (i % 2 === 0) {
        sample = (data[Math.floor(byteIndex)] << 4) | (data[Math.floor(byteIndex) + 1] >> 4);
      } else {
        sample = ((data[Math.floor(byteIndex)] & 0x0F) << 8) | data[Math.floor(byteIndex) + 1];
      }
      if (sample > 2047) sample -= 4096;
      samples.push(sample * 0.48828125);
    }
    return samples;
  };

  MuseEEGManager.prototype.disconnect = function () {
    var eegData = global.eegData;
    this._log('Disconnecting from Muse...', 'info');

    if (this.subscriptions && this.subscriptions.length > 0) {
      this._log('Unsubscribing from ' + this.subscriptions.length + ' data subscriptions', 'info');
      for (var i = 0; i < this.subscriptions.length; i++) {
        try { this.subscriptions[i].unsubscribe(); }
        catch (e) { this._log('Warning during unsubscribe: ' + e.message, 'warning'); }
      }
      this.subscriptions = [];
      this._log('All subscriptions closed', 'success');
    }

    if (this.muse) {
      try {
        this.muse.disconnect();
        this._log('Muse device disconnected successfully', 'success');
      } catch (e) {
        this._log('Warning during disconnect: ' + e.message, 'warning');
      }
      this.muse = null;
    }

    this.isConnected = false;
    if (eegData) eegData.connected = false;
    this._status('Disconnected', '');
    this._log('Ready to connect to a new device', 'info');
  };

  global.MuseEEGManager = MuseEEGManager;
})(typeof window !== 'undefined' ? window : this);
