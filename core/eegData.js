// brainGames/core/eegData.js
// Globals-only module (no ES module syntax). Exposes window.eegData with the
// same shape used throughout the parent project's index.html so sketches can
// read band power, raw samples, and epoch buffers in exactly the same way.

(function (global) {
  'use strict';

  var eegData = {
    // Frequency bands (0..1 normalised)
    alpha: 0,
    beta: 0,
    theta: 0,
    delta: 0,
    gamma: 0,

    // Current samples: TP9, AF7, AF8, TP10 (most-recent value per channel)
    raw: [0, 0, 0, 0],

    // Raw history buffers (up to historyLength samples each)
    rawHistory: {
      TP9: [],
      AF7: [],
      AF8: [],
      TP10: []
    },

    historyLength: 1000,
    sampleRate: 256,

    // PPG / Optical channels (Muse 2, Muse S, Muse S Athena @ 64 Hz)
    ppg: [0, 0, 0, 0],
    ppgNormalized: [0, 0, 0, 0],
    ppgPulse: 0,
    heartRate: 0,
    ppgSampleRate: 64,
    ppgHistoryLength: 256,
    ppgHistory: {
      ambient: [],
      infrared: [],
      red: [],
      optics4: []
    },

    attention: 0,
    meditation: 0,
    connected: false,

    getRawChannel: function (channel, numSamples) {
      if (numSamples === undefined) numSamples = 100;
      var channelData = this.rawHistory[channel] || [];
      return channelData.slice(-numSamples);
    },

    getAllChannels: function (numSamples) {
      if (numSamples === undefined) numSamples = 100;
      return {
        TP9: this.getRawChannel('TP9', numSamples),
        AF7: this.getRawChannel('AF7', numSamples),
        AF8: this.getRawChannel('AF8', numSamples),
        TP10: this.getRawChannel('TP10', numSamples)
      };
    },

    getChannelNames: function () {
      return ['TP9', 'AF7', 'AF8', 'TP10'];
    },

    getPPGChannel: function (channel, numSamples) {
      if (channel === undefined) channel = 'infrared';
      if (numSamples === undefined) numSamples = 64;
      var aliasMap = {
        0: 'ambient', '0': 'ambient', 'ambient': 'ambient', 'ppg1': 'ambient', 'li_730': 'ambient',
        1: 'infrared', '1': 'infrared', 'infrared': 'infrared', 'ir': 'infrared', 'ppg2': 'infrared', 'ri_730': 'infrared',
        2: 'red', '2': 'red', 'red': 'red', 'ppg3': 'red', 'li_850': 'red',
        3: 'optics4', '3': 'optics4', 'optics4': 'optics4', 'ppg4': 'optics4', 'ri_850': 'optics4'
      };
      var key = aliasMap[typeof channel === 'string' ? channel.toLowerCase() : channel] || channel;
      var channelData = (this.ppgHistory && this.ppgHistory[key]) || [];
      return channelData.slice(-numSamples);
    },

    getAllPPGChannels: function (numSamples) {
      if (numSamples === undefined) numSamples = 64;
      return {
        ambient: this.getPPGChannel('ambient', numSamples),
        infrared: this.getPPGChannel('infrared', numSamples),
        red: this.getPPGChannel('red', numSamples),
        optics4: this.getPPGChannel('optics4', numSamples)
      };
    },

    getPPGChannelNames: function () {
      return ['ambient', 'infrared', 'red', 'optics4'];
    },

    // Most recent N samples transposed so each entry is [TP9, AF7, AF8, TP10]
    getRecentEpoch: function (numSamples) {
      if (numSamples === undefined) numSamples = 100;
      var channels = this.getAllChannels(numSamples);
      var epoch = [];
      for (var i = 0; i < numSamples; i++) {
        epoch.push([
          channels.TP9[i] || 0,
          channels.AF7[i] || 0,
          channels.AF8[i] || 0,
          channels.TP10[i] || 0
        ]);
      }
      return epoch;
    }
  };

  global.eegData = eegData;
})(typeof window !== 'undefined' ? window : this);
