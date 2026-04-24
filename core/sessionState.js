// brainGames/core/sessionState.js
// Tiny persistence layer used by pickerBoot.js and playBoot.js.
//
// Scope is the browser tab (sessionStorage): once the user has pressed
// USE SIMULATOR, or tapped the keyboard / moved the mouse, those facts
// persist across navigations between index.html and play.html without
// leaking into other tabs.
//
// Muse state is intentionally NOT persisted — Web Bluetooth requires a
// user gesture for every new page load, so attempting to auto-restore a
// Muse connection would just fail silently.

(function (global) {
  'use strict';

  var KEYS = {
    simulator: 'bg.simulatorActive',
    keyboard:  'bg.keyboardSeen',
    mouse:     'bg.mouseSeen'
  };

  function get(key) {
    try { return global.sessionStorage.getItem(key) === '1'; }
    catch (e) { return false; }
  }

  function set(key, value) {
    try { global.sessionStorage.setItem(key, value ? '1' : '0'); }
    catch (e) { /* storage may be blocked (Safari private mode, etc.) */ }
  }

  function clear(key) {
    try { global.sessionStorage.removeItem(key); }
    catch (e) { /* ignore */ }
  }

  global.BrainGamesSession = {
    // Simulator
    isSimulatorActive: function () { return get(KEYS.simulator); },
    setSimulatorActive: function (v) { set(KEYS.simulator, v); },
    clearSimulator: function () { clear(KEYS.simulator); },

    // Keyboard
    isKeyboardSeen: function () { return get(KEYS.keyboard); },
    setKeyboardSeen: function () { set(KEYS.keyboard, true); },

    // Mouse
    isMouseSeen: function () { return get(KEYS.mouse); },
    setMouseSeen: function () { set(KEYS.mouse, true); },

    // Clear everything. Exposed for debugging.
    resetAll: function () {
      clear(KEYS.simulator);
      clear(KEYS.keyboard);
      clear(KEYS.mouse);
    }
  };
})(typeof window !== 'undefined' ? window : this);
