// brainGames/core/eegSimulator.js
// Globals-only module. Declares window.EEGSimulator. Math is identical to the
// original EEGSimulator in the parent index.html, but all getElementById calls
// have been removed; consumers can subscribe via `onUpdate` instead.

(function (global) {
  'use strict';

  function EEGSimulator() {
    this.isRunning = false;
    this.startTime = Date.now();
    this.updateInterval = null;
    this.baseAttention = 0.5;
    this.baseMeditation = 0.3;
    this.noiseLevel = 0.1;
    // Optional callback: (eegSnapshot) => void. Defaults to no-op.
    this.onUpdate = function () {};
  }

  EEGSimulator.prototype.start = function () {
    var self = this;
    this.isRunning = true;
    this.startTime = Date.now();
    this.updateInterval = setInterval(function () {
      self.generateData();
    }, 50);
  };

  EEGSimulator.prototype.stop = function () {
    this.isRunning = false;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  };

  EEGSimulator.prototype.setAttention = function (value) {
    this.baseAttention = parseFloat(value);
  };

  EEGSimulator.prototype.setMeditation = function (value) {
    this.baseMeditation = parseFloat(value);
  };

  EEGSimulator.prototype.generateData = function () {
    var eegData = global.eegData;
    if (!eegData) return; // eegData.js must load first.

    var time = (Date.now() - this.startTime) / 1000;
    var noiseLevel = this.noiseLevel;
    var noise = function () {
      return (Math.random() - 0.5) * noiseLevel;
    };

    // Alpha waves (8-12 Hz)
    var alphaBase = this.baseMeditation * 0.8 + 0.1;
    eegData.alpha = Math.max(0, Math.min(1,
      alphaBase + Math.sin(time * 10) * 0.1 + noise()
    ));

    // Beta waves (13-30 Hz)
    var betaBase = this.baseAttention * 0.7 + 0.2;
    eegData.beta = Math.max(0, Math.min(1,
      betaBase + Math.sin(time * 20) * 0.15 + noise()
    ));

    // Theta waves (4-8 Hz)
    var thetaBase = this.baseMeditation * 0.6 + 0.1;
    eegData.theta = Math.max(0, Math.min(1,
      thetaBase + Math.sin(time * 6) * 0.12 + noise()
    ));

    // Delta waves (0.5-4 Hz)
    eegData.delta = Math.max(0, Math.min(1,
      0.1 + Math.sin(time * 2) * 0.05 + noise()
    ));

    // Gamma waves (30+ Hz)
    eegData.gamma = Math.max(0, Math.min(1,
      0.2 + Math.sin(time * 40) * this.baseAttention * 0.3 + noise()
    ));

    // Realistic raw samples per channel
    var channels = ['TP9', 'AF7', 'AF8', 'TP10'];
    for (var i = 0; i < 4; i++) {
      var channel = channels[i];
      var sample = 0;

      sample += Math.sin(time * 2 * Math.PI * (9 + i * 0.5)) * eegData.alpha * 30;
      sample += Math.sin(time * 2 * Math.PI * (18 + i * 1.5)) * eegData.beta * 20;
      sample += Math.sin(time * 2 * Math.PI * (6 + i * 0.3)) * eegData.theta * 25;
      sample += Math.sin(time * 2 * Math.PI * (2 + i * 0.2)) * eegData.delta * 40;
      sample += Math.sin(time * 2 * Math.PI * (35 + i * 2)) * eegData.gamma * 10;

      sample += noise() * 15;
      sample += Math.sin(time * 2 * Math.PI * 0.1) * 5;

      // Frontal blink artifacts
      if (i >= 1 && i <= 2 && Math.random() < 0.001) {
        sample += (Math.random() - 0.5) * 200;
      }

      eegData.raw[i] = sample;

      if (!eegData.rawHistory[channel]) {
        eegData.rawHistory[channel] = [];
      }
      eegData.rawHistory[channel].push(sample);

      if (eegData.rawHistory[channel].length > eegData.historyLength) {
        eegData.rawHistory[channel] = eegData.rawHistory[channel].slice(-eegData.historyLength);
      }
    }

    eegData.attention = Math.max(0, Math.min(1,
      this.baseAttention + Math.sin(time * 0.5) * 0.1 + noise() * 0.05
    ));

    eegData.meditation = Math.max(0, Math.min(1,
      this.baseMeditation + Math.cos(time * 0.3) * 0.1 + noise() * 0.05
    ));

    eegData.connected = true;

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
      } catch (err) {
        // Swallow consumer errors so the simulation keeps running.
        if (typeof console !== 'undefined') console.warn('EEGSimulator.onUpdate threw:', err);
      }
    }
  };

  global.EEGSimulator = EEGSimulator;
})(typeof window !== 'undefined' ? window : this);
