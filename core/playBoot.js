// brainGames/core/playBoot.js
// Wires up brainGames/play.html. Reads ?game=<id>, enforces a brain-input
// gate modal, hands the game off to BrainGamesRunner, and drives the TV
// channel-change controls (knob click + keyboard shortcuts + explicit
// CH-/CH+ buttons) so the user can rotate through cartridges without
// bouncing back to the deck.
//
// Session persistence: BrainGamesSession (sessionStorage) auto-restores
// the simulator and input-detection state so the gate doesn't nag the user
// to reconnect every channel change.

(function (global) {
  'use strict';

  var state = {
    keyboardOn: false,
    mouseOn: false,
    brainOn: false,
    simulator: null,
    muse: null,
    gameId: null,
    loaded: false,
    readoutTimer: null,
    manifest: null
  };

  function $(id) { return document.getElementById(id); }

  function session() { return global.BrainGamesSession; }

  function getGameIdFromUrl() {
    try {
      var params = new URLSearchParams(global.location.search || '');
      return params.get('game');
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // Channel UI (top bar + TV channel readout + knob)
  // ---------------------------------------------------------------------

  function formatChannelNumber(i) {
    var n = (i + 1).toString();
    return n.length < 2 ? '0' + n : n;
  }

  function setChannelDisplayFromId(id) {
    var ch = $('tv-channel-num');
    if (!ch) return;
    if (!id) { ch.textContent = '--'; return; }
    // Prefer manifest index; fall back to first two chars of id.
    if (state.manifest) {
      for (var i = 0; i < state.manifest.length; i++) {
        if (state.manifest[i] && state.manifest[i].id === id) {
          ch.textContent = formatChannelNumber(i);
          return;
        }
      }
    }
    ch.textContent = id.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '01';
  }

  function setTopBarTitle(id) {
    var t = $('game-title');
    if (t) t.textContent = id ? id : 'NO GAME';
    setChannelDisplayFromId(id);
  }

  async function loadManifest() {
    try {
      var res = await fetch('./games/manifest.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      if (Array.isArray(data)) {
        state.manifest = data;
        setChannelDisplayFromId(state.gameId);
      }
    } catch (e) {
      // Manifest fetch failure isn't fatal — the channel readout just
      // stays on its fallback two-letter code and the switcher falls back
      // to disabled.
      console.warn('[playBoot] manifest fetch failed:', e && e.message);
    }
  }

  function currentIndex() {
    if (!state.manifest || !state.gameId) return -1;
    for (var i = 0; i < state.manifest.length; i++) {
      if (state.manifest[i] && state.manifest[i].id === state.gameId) return i;
    }
    return -1;
  }

  function switchChannel(delta) {
    if (!state.manifest || state.manifest.length === 0) return;
    var idx = currentIndex();
    var n = state.manifest.length;
    // If we couldn't find the current game in the manifest, just jump to 0.
    var nextIdx = idx < 0 ? 0 : ((idx + delta) % n + n) % n;
    var nextEntry = state.manifest[nextIdx];
    if (!nextEntry || !nextEntry.id || nextEntry.id === state.gameId) return;

    // Spin the channel knob for physical feedback.
    spinKnob('knob-channel', delta > 0 ? 120 : -120);

    // Navigate — the session-storage flags mean we land straight back
    // into the game without the gate modal popping up again.
    var url = './play.html?game=' + encodeURIComponent(nextEntry.id);
    global.location.href = url;
  }

  function spinKnob(dataName, deg) {
    // Rotate the knob pointer briefly for a satisfying click feel.
    var knobs = document.querySelectorAll('.tv-knob[data-knob="' + dataName + '"]');
    if (!knobs.length) return;
    for (var i = 0; i < knobs.length; i++) {
      var knob = knobs[i];
      var pointer = knob.querySelector('.tv-knob-pointer');
      if (!pointer) continue;
      var currentRot = parseFloat(knob.dataset.rot || '0');
      var nextRot = currentRot + deg;
      knob.dataset.rot = nextRot;
      pointer.style.transition = 'transform 180ms cubic-bezier(.5,.05,.3,1)';
      pointer.style.transform = 'translateX(-50%) rotate(' + nextRot + 'deg)';
    }
  }

  function wireChannelControls() {
    var knob = document.querySelector('.tv-knob[data-knob="knob-channel"]');
    if (knob) {
      knob.style.cursor = 'pointer';
      knob.title = 'Click to change channel (next cartridge)';
      knob.addEventListener('click', function () { switchChannel(+1); });
      knob.addEventListener('contextmenu', function (e) {
        // Right-click on the knob goes back one channel.
        e.preventDefault();
        switchChannel(-1);
      });
    }

    var next = $('btn-ch-next');
    if (next) next.addEventListener('click', function () { switchChannel(+1); });
    var prev = $('btn-ch-prev');
    if (prev) prev.addEventListener('click', function () { switchChannel(-1); });

    // Keyboard shortcuts: [ previous, ] next. Ignore when a game might
    // legitimately want those keys (none of our games currently bind
    // them, but leaving modifier-checks in case that changes later).
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ']') { e.preventDefault(); switchChannel(+1); }
      else if (e.key === '[') { e.preventDefault(); switchChannel(-1); }
    });
  }

  // ---------------------------------------------------------------------
  // EEG readout (top bar)
  // ---------------------------------------------------------------------

  function updateReadout() {
    var el = $('live-readout');
    if (!el) return;
    var d = global.eegData;
    if (!d) { el.textContent = 'ATT --- MED ---'; return; }
    var att = (typeof d.attention === 'number') ? d.attention.toFixed(2) : '---';
    var med = (typeof d.meditation === 'number') ? d.meditation.toFixed(2) : '---';
    el.textContent = 'ATT ' + att + '  MED ' + med;
  }

  // ---------------------------------------------------------------------
  // Connection gate
  // ---------------------------------------------------------------------

  function wireInputDetection() {
    var s = session();
    if (s) {
      if (s.isKeyboardSeen()) state.keyboardOn = true;
      if (s.isMouseSeen())    state.mouseOn    = true;
    }
    document.addEventListener('keydown', function () {
      state.keyboardOn = true;
      if (s) s.setKeyboardSeen();
      refreshGate();
    }, { passive: true });
    var onMouse = function () {
      state.mouseOn = true;
      if (s) s.setMouseSeen();
      refreshGate();
    };
    document.addEventListener('mousemove', onMouse, { passive: true });
    document.addEventListener('click',    onMouse, { passive: true });
  }

  function watchBrain() {
    setInterval(function () {
      state.brainOn = !!(global.eegData && global.eegData.connected);
      refreshGate();
    }, 400);
  }

  function showModal(show) {
    var m = $('gate-modal');
    if (!m) return;
    if (show) m.classList.remove('hidden');
    else m.classList.add('hidden');
  }

  function refreshGate() {
    var brainReady = state.brainOn || (state.simulator && state.simulator.isRunning);
    if (!brainReady) {
      showModal(true);
      return;
    }
    showModal(false);
    if (!state.loaded && state.gameId) {
      state.loaded = true;
      loadGame(state.gameId);
    }
  }

  async function loadGame(id) {
    if (!global.BrainGamesRunner || typeof global.BrainGamesRunner.load !== 'function') {
      console.error('BrainGamesRunner missing');
      return;
    }
    try {
      await global.BrainGamesRunner.load(id);
    } catch (err) {
      console.error('Failed to load game ' + id + ': ' + (err && err.message));
      var banner = document.createElement('div');
      banner.style.cssText = 'position:absolute;inset:auto 16px 16px 16px;padding:14px;background:#3b1f5a;color:#ff4aa0;border:3px solid #ff4aa0;font-family:"Press Start 2P",monospace;font-size:12px;z-index:60;';
      banner.textContent = 'GAME LOAD FAILED: ' + (err && err.message ? err.message : 'unknown error');
      document.body.appendChild(banner);
      state.loaded = false;
    }
  }

  function startSimulator() {
    if (typeof global.EEGSimulator !== 'function') {
      alert('EEG simulator unavailable.');
      return;
    }
    if (!state.simulator) state.simulator = new global.EEGSimulator();
    if (!state.simulator.isRunning) state.simulator.start();
    state.brainOn = true;
    if (session()) session().setSimulatorActive(true);
    refreshGate();
  }

  async function connectMuse() {
    if (typeof global.MuseEEGManager !== 'function') {
      alert('MuseEEGManager unavailable.');
      return;
    }
    if (!state.muse) state.muse = new global.MuseEEGManager();
    var btn = $('modal-muse');
    if (btn) { btn.disabled = true; btn.textContent = 'CONNECTING...'; }
    try {
      await state.muse.connect();
      state.brainOn = true;
      refreshGate();
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'CONNECT MUSE'; }
      alert('Could not connect to Muse: ' + (err && err.message ? err.message : err));
    }
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------

  function init() {
    state.gameId = getGameIdFromUrl();
    setTopBarTitle(state.gameId);

    loadManifest();
    wireInputDetection();
    wireChannelControls();
    watchBrain();

    var simBtn = $('modal-sim');
    if (simBtn) simBtn.addEventListener('click', startSimulator);
    var museBtn = $('modal-muse');
    if (museBtn) museBtn.addEventListener('click', connectMuse);

    state.readoutTimer = setInterval(updateReadout, 250);
    updateReadout();

    // Auto-resume the simulator if the user previously enabled it in this
    // tab. The gate modal will close automatically once eegData.connected
    // flips true (via watchBrain's 400 ms tick).
    if (session() && session().isSimulatorActive()) {
      startSimulator();
    }

    refreshGate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.BrainGamesPlay = {
    getState: function () { return state; },
    next: function () { switchChannel(+1); },
    prev: function () { switchChannel(-1); }
  };
})(typeof window !== 'undefined' ? window : this);
