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
