// brainGames/core/pickerBoot.js
// Wires up the cartridge-deck picker page: three-light connection gate,
// simulator / Muse buttons, and 12 placeholder slots until the manifest is
// wired in by Manager M4. Pure globals; expects eegData/EEGSimulator/
// MuseEEGManager to already be defined on window.

(function (global) {
  'use strict';

  var state = {
    keyboardOn: false,
    mouseOn: false,
    brainOn: false,
    simulator: null,
    muse: null,
    lastConnectionMode: null // 'simulator' | 'muse' | null
  };

  function $(id) { return document.getElementById(id); }

  function setLight(name, on) {
    var el = $('light-' + name);
    if (!el) return;
    if (on) el.classList.add('on');
    else el.classList.remove('on');
    state[name + 'On'] = !!on;
    updateGate();
  }

  function updateGate() {
    var wrap = $('deck-wrap');
    var status = $('gate-status');
    var allOn = state.keyboardOn && state.mouseOn && state.brainOn;
    if (!wrap) return;
    if (allOn) {
      wrap.classList.remove('locked');
      if (status) status.textContent = 'ALL SYSTEMS GREEN — SELECT A CARTRIDGE';
    } else {
      wrap.classList.add('locked');
      if (status) {
        var missing = [];
        if (!state.keyboardOn) missing.push('KEYBOARD');
        if (!state.mouseOn)    missing.push('MOUSE');
        if (!state.brainOn)    missing.push('BRAIN');
        status.textContent = 'WAITING FOR: ' + missing.join(' / ');
      }
    }
  }

  function wireInputDetection() {
    var session = global.BrainGamesSession;

    // Restore previously-seen input state (persisted across navigations
    // within this tab). The lights come up green immediately so the user
    // doesn't have to re-tap the keyboard and jiggle the mouse every time
    // they bounce between the deck and a cartridge.
    if (session) {
      if (session.isKeyboardSeen()) setLight('keyboard', true);
      if (session.isMouseSeen())    setLight('mouse',    true);
    }

    document.addEventListener('keydown', function () {
      if (!state.keyboardOn) setLight('keyboard', true);
      if (session) session.setKeyboardSeen();
    }, { passive: true });

    var onMouse = function () {
      if (!state.mouseOn) setLight('mouse', true);
      if (session) session.setMouseSeen();
    };
    document.addEventListener('mousemove', onMouse, { passive: true });
    document.addEventListener('click',    onMouse, { passive: true });
  }

  function watchEegConnection() {
    // Poll window.eegData.connected so we catch both the simulator path and
    // the Muse path without coupling to either manager.
    setInterval(function () {
      var connected = !!(global.eegData && global.eegData.connected);
      if (connected && !state.brainOn) setLight('brain', true);
      // If the brain goes away (Muse disconnect), reflect that.
      if (!connected && state.brainOn && state.lastConnectionMode !== 'simulator') {
        setLight('brain', false);
      }
    }, 400);
  }

  function startSimulator() {
    if (typeof global.EEGSimulator !== 'function') {
      alert('EEG simulator is unavailable. Check that core/eegSimulator.js loaded.');
      return;
    }
    if (!state.simulator) state.simulator = new global.EEGSimulator();
    if (!state.simulator.isRunning) state.simulator.start();
    state.lastConnectionMode = 'simulator';
    setLight('brain', true);
    updateSimButtonState();
    if (global.BrainGamesSession) global.BrainGamesSession.setSimulatorActive(true);
  }

  function stopSimulator() {
    if (state.simulator && state.simulator.isRunning) state.simulator.stop();
    if (global.eegData) global.eegData.connected = false;
    state.lastConnectionMode = null;
    setLight('brain', false);
    updateSimButtonState();
    if (global.BrainGamesSession) global.BrainGamesSession.clearSimulator();
  }

  function updateSimButtonState() {
    var btn = $('btn-simulator');
    if (!btn) return;
    if (state.simulator && state.simulator.isRunning) {
      btn.textContent = 'STOP SIMULATOR';
      btn.classList.add('accent-pink');
    } else {
      btn.textContent = 'USE SIMULATOR';
      btn.classList.remove('accent-pink');
    }
  }

  async function connectMuse() {
    if (typeof global.MuseEEGManager !== 'function') {
      alert('MuseEEGManager is unavailable. Check that core/museManager.js loaded.');
      return;
    }
    if (!state.muse) state.muse = new global.MuseEEGManager();

    var logEl = $('muse-log');
    state.muse.onLog = function (msg, level) {
      if (typeof console !== 'undefined') console.log('[muse][' + (level || 'info') + '] ' + msg);
      if (logEl) {
        logEl.textContent = msg;
        logEl.dataset.level = level || 'info';
      }
    };
    state.muse.onStatus = function (text) {
      if (logEl) logEl.textContent = text;
    };

    var btn = $('btn-muse');
    if (btn) { btn.disabled = true; btn.textContent = 'CONNECTING...'; }
    try {
      await state.muse.connect();
      state.lastConnectionMode = 'muse';
      setLight('brain', true);
      if (btn) { btn.textContent = 'MUSE CONNECTED'; btn.classList.add('accent-green'); }
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'CONNECT MUSE'; }
      alert('Could not connect to Muse: ' + (err && err.message ? err.message : err));
    }
  }

  function buildPlaceholderGrid() {
    var grid = $('cartridge-grid');
    if (!grid) return;
    stopPreviewLoop();
    grid.innerHTML = '';
    for (var i = 1; i <= 12; i++) {
      var card = document.createElement('div');
      card.className = 'cartridge empty';
      card.setAttribute('role', 'presentation');

      var id = document.createElement('div');
      id.className = 'slot-id';
      id.textContent = 'SLOT ' + (i < 10 ? '0' + i : i);

      var body = document.createElement('div');
      body.className = 'slot-body';
      body.textContent = 'SLOT EMPTY — AWAITING MANIFEST';

      card.appendChild(id);
      card.appendChild(body);
      grid.appendChild(card);
    }
  }

  // ------------------------------------------------------------------
  // Manifest-driven card rendering + shared live-preview loop (I2).
  // ------------------------------------------------------------------

  // Palette is snapshot from :root at load time so previews match CSS.
  var palette = (function () {
    var fallback = {
      purple: '#3b1f5a',
      yellow: '#f7d51d',
      pink:   '#ff4aa0',
      green:  '#6cff83',
      chrome: '#c0c0c0',
      ink:    '#0a0614'
    };
    try {
      var cs = global.getComputedStyle ? global.getComputedStyle(document.documentElement) : null;
      if (!cs) return fallback;
      var pick = function (name, def) {
        var v = cs.getPropertyValue(name);
        v = v && v.trim();
        return v || def;
      };
      return {
        purple: pick('--c-purple', fallback.purple),
        yellow: pick('--c-yellow', fallback.yellow),
        pink:   pick('--c-pink',   fallback.pink),
        green:  pick('--c-green',  fallback.green),
        chrome: pick('--c-chrome', fallback.chrome),
        ink:    '#0a0614'
      };
    } catch (e) {
      return fallback;
    }
  })();

  // Per-id draw functions. Signature: (ctx, t, w, h, p) where t is seconds.
  // Each function is responsible for clearing its own background on every
  // frame. Keep each draw to ~<30 simple 2D ops.
  var previewDraws = {
    snakeFeast: function (ctx, t, w, h, p) {
      ctx.fillStyle = p.ink; ctx.fillRect(0, 0, w, h);
      var cols = 16, rows = 10;
      var cw = w / cols, ch = h / rows;
      // Pellet
      var px = Math.floor((Math.sin(t * 0.7) * 0.5 + 0.5) * (cols - 1));
      var py = Math.floor((Math.cos(t * 0.5) * 0.5 + 0.5) * (rows - 1));
      ctx.fillStyle = p.pink;
      ctx.fillRect(px * cw + 1, py * ch + 1, cw - 2, ch - 2);
      // Snake of 6 segments moving along a diagonal sinusoid.
      for (var i = 0; i < 6; i++) {
        var s = t * 2 - i * 0.35;
        var sx = (Math.floor(s) % cols + cols) % cols;
        var sy = (Math.floor(s * 0.6) % rows + rows) % rows;
        ctx.fillStyle = i === 0 ? p.yellow : p.green;
        ctx.fillRect(sx * cw + 1, sy * ch + 1, cw - 2, ch - 2);
      }
    },
    Brainvaders: function (ctx, t, w, h, p) {
      ctx.fillStyle = p.ink; ctx.fillRect(0, 0, w, h);
      var rowY = ((t * 14) % (h + 20)) - 10;
      var ncols = 6;
      var step = w / (ncols + 1);
      for (var i = 0; i < ncols; i++) {
        var x = step * (i + 1);
        // 3x3 alien pixel cluster
        ctx.fillStyle = (i % 2 === 0) ? p.green : p.pink;
        ctx.fillRect(x - 6, rowY,     4, 4);
        ctx.fillRect(x + 2, rowY,     4, 4);
        ctx.fillRect(x - 6, rowY + 4, 12, 4);
        ctx.fillRect(x - 10, rowY + 8, 4, 4);
        ctx.fillRect(x + 6,  rowY + 8, 4, 4);
      }
      // Player base
      ctx.fillStyle = p.yellow;
      ctx.fillRect(w / 2 - 10, h - 10, 20, 4);
    },
    ZenBreakout: function (ctx, t, w, h, p) {
      ctx.fillStyle = p.ink; ctx.fillRect(0, 0, w, h);
      // Brick row
      var bricks = 8;
      var bw = w / bricks;
      for (var i = 0; i < bricks; i++) {
        var gone = (Math.floor(t * 1.3) % bricks) === i;
        if (gone) continue;
        ctx.fillStyle = (i % 2 === 0) ? p.pink : p.yellow;
        ctx.fillRect(i * bw + 2, 8, bw - 4, 10);
      }
      // Ball
      var bx = (Math.sin(t * 2.4) * 0.5 + 0.5) * (w - 10) + 5;
      var by = 40 + Math.abs(Math.sin(t * 3.1)) * 30;
      ctx.fillStyle = p.chrome;
      ctx.fillRect(bx - 3, by - 3, 6, 6);
      // Paddle
      var px2 = (Math.sin(t * 2.0) * 0.5 + 0.5) * (w - 30) + 5;
      ctx.fillStyle = p.green;
      ctx.fillRect(px2, h - 10, 30, 5);
    },
    GolfShooter: function (ctx, t, w, h, p) {
      ctx.fillStyle = p.ink; ctx.fillRect(0, 0, w, h);
      // Ground
      ctx.fillStyle = p.green;
      ctx.fillRect(0, h - 8, w, 8);
      // Tee
      ctx.fillStyle = p.chrome;
      ctx.fillRect(8, h - 14, 3, 6);
      // Arcing ball
      var phase = (t % 2.2) / 2.2;
      var bx = 10 + phase * (w - 20);
      var by = (h - 14) - Math.sin(phase * Math.PI) * (h * 0.7);
      ctx.fillStyle = p.yellow;
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fill();
      // Hole
      ctx.fillStyle = p.ink;
      ctx.fillRect(w - 14, h - 10, 6, 2);
    },
    archeryShooter: function (ctx, t, w, h, p) {
      ctx.fillStyle = p.ink; ctx.fillRect(0, 0, w, h);
      var cx = w * 0.65, cy = h * 0.5;
      var pulse = 1 + Math.sin(t * 3) * 0.08;
      var rings = [
        [p.chrome, 28],
        [p.pink,   20],
        [p.yellow, 12],
        [p.green,   6]
      ];
      for (var i = 0; i < rings.length; i++) {
        ctx.strokeStyle = rings[i][0];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, rings[i][1] * pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Arrow oscillating on left
      var ay = cy + Math.sin(t * 2) * 12;
      ctx.strokeStyle = p.chrome;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(4, ay);
      ctx.lineTo(cx - 32, ay);
      ctx.stroke();
      ctx.fillStyle = p.yellow;
      ctx.fillRect(cx - 34, ay - 2, 4, 4);
    },
    bballShooter: function (ctx, t, w, h, p) {
      ctx.fillStyle = p.ink; ctx.fillRect(0, 0, w, h);
      // Hoop
      var hx = w - 22, hy = h * 0.4;
      ctx.strokeStyle = p.pink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + 14, hy);
      ctx.stroke();
      ctx.strokeStyle = p.chrome;
      ctx.lineWidth = 1;
      for (var i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(hx + 2 + i * 3, hy);
        ctx.lineTo(hx + 2 + i * 3, hy + 8);
        ctx.stroke();
      }
      // Ball bouncing off rim
      var phase = (t * 1.2) % 1;
      var bx = 12 + phase * (w - 40);
      var by = hy + 10 + Math.abs(Math.sin(phase * Math.PI * 2)) * 20;
      ctx.fillStyle = p.yellow;
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fill();
    },
    soccerPenalty: function (ctx, t, w, h, p) {
      ctx.fillStyle = p.ink; ctx.fillRect(0, 0, w, h);
      // Goal frame
      ctx.strokeStyle = p.chrome;
      ctx.lineWidth = 2;
      ctx.strokeRect(w - 40, 14, 34, h - 30);
      // Net hint
      ctx.strokeStyle = 'rgba(192,192,192,0.35)';
      ctx.lineWidth = 1;
      for (var i = 1; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(w - 40, 14 + i * ((h - 30) / 5));
        ctx.lineTo(w - 6, 14 + i * ((h - 30) / 5));
        ctx.stroke();
      }
      // Keeper sliding
      var kx = (w - 40) + 4 + (Math.sin(t * 2.2) * 0.5 + 0.5) * 22;
      ctx.fillStyle = p.pink;
      ctx.fillRect(kx, h / 2 - 6, 4, 12);
      // Ball traveling toward goal
      var phase = (t % 1.8) / 1.8;
      var bx = 10 + phase * (w - 60);
      var by = h - 18 - Math.sin(phase * Math.PI) * 14;
      ctx.fillStyle = p.yellow;
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
    },
    RowingCalm: function (ctx, t, w, h, p) {
      ctx.fillStyle = p.ink; ctx.fillRect(0, 0, w, h);
      // Sine water
      ctx.strokeStyle = p.green;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var x = 0; x <= w; x += 4) {
        var y = h * 0.65 + Math.sin((x * 0.08) + t * 1.4) * 6;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Boat
      var bx = w / 2 + Math.sin(t * 0.8) * 10;
      var by = h * 0.62 + Math.sin((bx * 0.08) + t * 1.4) * 6;
      ctx.fillStyle = p.chrome;
      ctx.fillRect(bx - 10, by - 4, 20, 6);
      // Oars dipping
      var oar = Math.sin(t * 2.5) * 6;
      ctx.strokeStyle = p.yellow;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx - 10, by - 2);
      ctx.lineTo(bx - 20, by + 4 + oar);
      ctx.moveTo(bx + 10, by - 2);
      ctx.lineTo(bx + 20, by + 4 - oar);
      ctx.stroke();
    },
    balanceBeam: function (ctx, t, w, h, p) {
      ctx.fillStyle = p.ink; ctx.fillRect(0, 0, w, h);
      // Beam
      var beamY = h * 0.72;
      ctx.strokeStyle = p.chrome;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(10, beamY);
      ctx.lineTo(w - 10, beamY);
      ctx.stroke();
      // Stick figure swaying
      var cx = w / 2 + Math.sin(t * 1.6) * 10;
      var headY = beamY - 30;
      ctx.strokeStyle = p.yellow;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, headY, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, headY + 5);
      ctx.lineTo(cx, beamY);
      // Arms splayed for balance
      var arm = Math.sin(t * 1.6) * 0.4;
      ctx.moveTo(cx - 10, headY + 14 + arm * 6);
      ctx.lineTo(cx + 10, headY + 14 - arm * 6);
      // Legs
      ctx.moveTo(cx, beamY);
      ctx.lineTo(cx - 6, beamY + 6);
      ctx.moveTo(cx, beamY);
      ctx.lineTo(cx + 6, beamY + 6);
      ctx.stroke();
    },
    balloonPop: function (ctx, t, w, h, p) {
      ctx.fillStyle = p.ink; ctx.fillRect(0, 0, w, h);
      var cycle = (t % 2.4) / 2.4;
      var popping = cycle > 0.92;
      var r = 10 + cycle * 24;
      var cx = w / 2, cy = h / 2 + 4;
      if (!popping) {
        // Balloon body
        ctx.fillStyle = p.pink;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.25, 0, Math.PI * 2);
        ctx.fill();
        // String
        ctx.strokeStyle = p.chrome;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy + r);
        ctx.lineTo(cx, cy + r + 18);
        ctx.stroke();
      } else {
        // Burst fragments
        ctx.strokeStyle = p.yellow;
        ctx.lineWidth = 2;
        var n = 8;
        var burst = (cycle - 0.92) / 0.08;
        for (var i = 0; i < n; i++) {
          var ang = (i / n) * Math.PI * 2;
          var r1 = r * (0.6 + burst * 0.4);
          var r2 = r * (1.0 + burst * 0.8);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
          ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
          ctx.stroke();
        }
      }
    },
    deepDiver: function (ctx, t, w, h, p) {
      // Water gradient (simple)
      ctx.fillStyle = p.ink; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(59,31,90,0.55)';
      ctx.fillRect(0, 0, w, h);
      // Descending diver silhouette
      var dy = ((t * 14) % (h + 30)) - 10;
      var dx = w / 2 + Math.sin(t * 0.8) * 8;
      ctx.fillStyle = p.chrome;
      ctx.fillRect(dx - 3, dy,     6, 10);  // body
      ctx.fillRect(dx - 5, dy + 10, 10, 2); // arms
      ctx.fillRect(dx - 2, dy + 12, 2, 6);  // leg
      ctx.fillRect(dx,     dy + 12, 2, 6);
      // Bubbles rising
      for (var i = 0; i < 4; i++) {
        var bt = (t * 0.9 + i * 0.6) % 1;
        var by = h - bt * h;
        var bx = (i * 37 + 15) % w;
        ctx.fillStyle = p.green;
        ctx.beginPath();
        ctx.arc(bx, by, 2 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
      }
    },
    mazeFocus: function (ctx, t, w, h, p) {
      ctx.fillStyle = p.ink; ctx.fillRect(0, 0, w, h);
      // Simple grid
      ctx.strokeStyle = 'rgba(192,192,192,0.3)';
      ctx.lineWidth = 1;
      var cells = 8, cs = Math.min(w, h * 1.6) / cells;
      var ox = (w - cs * cells) / 2;
      var oy = (h - cs * 5) / 2;
      for (var gx = 0; gx <= cells; gx++) {
        ctx.beginPath();
        ctx.moveTo(ox + gx * cs, oy);
        ctx.lineTo(ox + gx * cs, oy + cs * 5);
        ctx.stroke();
      }
      for (var gy = 0; gy <= 5; gy++) {
        ctx.beginPath();
        ctx.moveTo(ox,            oy + gy * cs);
        ctx.lineTo(ox + cs * cells, oy + gy * cs);
        ctx.stroke();
      }
      // Path waypoints
      var path = [[0,2],[1,2],[2,2],[2,1],[3,1],[4,1],[4,2],[5,2],[6,2],[7,2]];
      var phase = (t * 0.9) % path.length;
      var idx = Math.floor(phase);
      var frac = phase - idx;
      var a = path[idx];
      var b = path[(idx + 1) % path.length];
      var dx2 = a[0] + (b[0] - a[0]) * frac;
      var dy2 = a[1] + (b[1] - a[1]) * frac;
      // Trail
      ctx.fillStyle = p.green;
      for (var k = 0; k < 4; k++) {
        var j = (idx - k + path.length) % path.length;
        var pt = path[j];
        ctx.globalAlpha = 0.2 + (4 - k) * 0.15;
        ctx.fillRect(ox + pt[0] * cs + 2, oy + pt[1] * cs + 2, cs - 4, cs - 4);
      }
      ctx.globalAlpha = 1;
      // Dot
      ctx.fillStyle = p.yellow;
      ctx.beginPath();
      ctx.arc(ox + dx2 * cs + cs / 2, oy + dy2 * cs + cs / 2, cs * 0.28, 0, Math.PI * 2);
      ctx.fill();
    },
    eegFPS: function (ctx, t, w, h, p) {
      // Pseudo-3D cartridge preview: gridded floor, drifting target cubes,
      // a center crosshair that pulses with a fake "focus" oscillation.
      ctx.fillStyle = p.ink; ctx.fillRect(0, 0, w, h);

      // Sky / horizon split
      var horizonY = h * 0.55;
      ctx.fillStyle = 'rgba(59,31,90,0.7)';
      ctx.fillRect(0, 0, w, horizonY);
      ctx.fillStyle = p.pink;
      ctx.fillRect(0, horizonY - 1, w, 1);

      // Perspective grid lines (z-stripes)
      ctx.strokeStyle = 'rgba(108,255,131,0.55)';
      ctx.lineWidth = 1;
      for (var i = 1; i <= 4; i++) {
        var lineY = horizonY + Math.pow(i / 4, 1.6) * (h - horizonY);
        ctx.beginPath();
        ctx.moveTo(0, lineY);
        ctx.lineTo(w, lineY);
        ctx.stroke();
      }
      // Vanishing-point stripes
      var vx = w / 2;
      ctx.strokeStyle = 'rgba(108,255,131,0.35)';
      for (var k = -3; k <= 3; k++) {
        ctx.beginPath();
        ctx.moveTo(vx + k * 18, horizonY);
        ctx.lineTo(vx + k * (w / 2), h);
        ctx.stroke();
      }

      // Target cubes drifting across, scaled by depth
      for (var n = 0; n < 3; n++) {
        var phase = ((t * 0.6) + n * 0.7) % 1;
        var depth = 0.25 + (1 - phase) * 0.75;       // 1.0 = far, 0.25 = near
        var sz = 8 + (1 - depth) * 14;
        var cx = w * 0.5 + Math.sin((t * 0.9) + n * 1.4) * (w * 0.32) * (1 - depth);
        var cy = horizonY - 6 - (1 - depth) * 14 + Math.cos((t * 1.3) + n) * 3;
        var col = (n === 0) ? p.green : (n === 1) ? p.yellow : p.pink;
        // Top face (lighter)
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(cx - sz / 2 + 2, cy - sz / 2 - 3, sz, 3);
        // Front face
        ctx.fillStyle = col;
        ctx.fillRect(cx - sz / 2, cy - sz / 2, sz, sz);
        ctx.strokeStyle = p.chrome;
        ctx.strokeRect(cx - sz / 2 + 0.5, cy - sz / 2 + 0.5, sz - 1, sz - 1);
      }

      // Crosshair (pulses with a sine — the "focus" tightening / loosening)
      var pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
      var rR = 8 + pulse * 14;
      ctx.strokeStyle = p.green;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, rR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = p.yellow;
      ctx.beginPath();
      ctx.moveTo(w / 2 - rR, h / 2); ctx.lineTo(w / 2 - rR + 4, h / 2);
      ctx.moveTo(w / 2 + rR, h / 2); ctx.lineTo(w / 2 + rR - 4, h / 2);
      ctx.moveTo(w / 2, h / 2 - rR); ctx.lineTo(w / 2, h / 2 - rR + 4);
      ctx.moveTo(w / 2, h / 2 + rR); ctx.lineTo(w / 2, h / 2 + rR - 4);
      ctx.stroke();
      ctx.fillStyle = p.pink;
      ctx.fillRect(w / 2 - 1, h / 2 - 1, 2, 2);

      // Tiny gun corner
      ctx.fillStyle = p.chrome;
      ctx.fillRect(w - 22, h - 12, 18, 8);
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(w - 14, h - 18, 8, 6);
    },
    reactionRace: function (ctx, t, w, h, p) {
      ctx.fillStyle = p.ink; ctx.fillRect(0, 0, w, h);
      var n = 5;
      var gap = 8;
      var lightW = (w - gap * (n + 1)) / n;
      var lightH = Math.min(h - 20, lightW * 1.4);
      var y = (h - lightH) / 2;
      var cycle = 1.6;
      var phase = (t % cycle) / cycle;
      var lit = Math.floor(phase * (n + 1));
      for (var i = 0; i < n; i++) {
        var x = gap + i * (lightW + gap);
        var on = lit > i && lit <= n;
        ctx.strokeStyle = p.chrome;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, lightW, lightH);
        ctx.fillStyle = on ? p.pink : 'rgba(10,6,20,0.9)';
        ctx.fillRect(x + 2, y + 2, lightW - 4, lightH - 4);
      }
    }
  };

  function genericPreviewDraw(id) {
    return function (ctx, t, w, h, p) {
      ctx.fillStyle = p.ink; ctx.fillRect(0, 0, w, h);
      var pulse = 0.55 + Math.sin(t * 3) * 0.45;
      ctx.fillStyle = pulse > 0.5 ? p.chrome : p.yellow;
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var label = (id || 'CARTRIDGE').toUpperCase();
      if (label.length > 14) label = label.slice(0, 14);
      ctx.fillText(label, w / 2, h / 2);
      // Chrome bracket
      ctx.strokeStyle = p.chrome;
      ctx.lineWidth = 1;
      ctx.strokeRect(4, 4, w - 8, h - 8);
    };
  }

  // Shared preview-loop state
  var previewEntries = []; // { id, canvas, ctx, draw, visible }
  var previewRafId = null;
  var previewObserver = null;
  var previewLastFrame = 0;
  var PREVIEW_FPS = 24;
  var PREVIEW_FRAME_MS = 1000 / PREVIEW_FPS;

  function stopPreviewLoop() {
    if (previewRafId != null && global.cancelAnimationFrame) {
      global.cancelAnimationFrame(previewRafId);
    }
    previewRafId = null;
    if (previewObserver && previewObserver.disconnect) {
      try { previewObserver.disconnect(); } catch (e) { /* ignore */ }
    }
    previewObserver = null;
    previewEntries = [];
  }

  function startPreviewLoop() {
    if (!global.requestAnimationFrame) return;
    if (previewRafId != null) return;
    var loop = function (now) {
      previewRafId = global.requestAnimationFrame(loop);
      if (!previewLastFrame) previewLastFrame = now;
      if (now - previewLastFrame < PREVIEW_FRAME_MS) return;
      previewLastFrame = now;
      var t = (global.performance ? global.performance.now() : Date.now()) / 1000;
      for (var i = 0; i < previewEntries.length; i++) {
        var e = previewEntries[i];
        if (!e.visible) continue;
        try {
          e.draw(e.ctx, t, e.canvas.width, e.canvas.height, palette);
        } catch (err) {
          if (typeof console !== 'undefined') console.warn('[picker] preview draw failed for', e.id, err);
        }
      }
    };
    previewRafId = global.requestAnimationFrame(loop);
  }

  function observePreview(entry) {
    if (typeof global.IntersectionObserver !== 'function') {
      entry.visible = true;
      return;
    }
    if (!previewObserver) {
      previewObserver = new global.IntersectionObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var r = records[i];
          for (var j = 0; j < previewEntries.length; j++) {
            if (previewEntries[j].canvas === r.target) {
              previewEntries[j].visible = r.isIntersecting;
              break;
            }
          }
        }
      }, { threshold: 0.01 });
    }
    entry.visible = false;
    previewObserver.observe(entry.canvas);
  }

  function isDeckUnlocked() {
    var wrap = $('deck-wrap');
    if (wrap && wrap.classList) return !wrap.classList.contains('locked');
    return !!(state.keyboardOn && state.mouseOn && state.brainOn);
  }

  function shakeCard(card) {
    if (!card || !card.classList) return;
    card.classList.remove('cart-shake');
    // Force reflow so re-adding the class restarts the animation.
    // eslint-disable-next-line no-unused-expressions
    void card.offsetWidth;
    card.classList.add('cart-shake');
    global.setTimeout(function () {
      if (card && card.classList) card.classList.remove('cart-shake');
    }, 450);
  }

  function handlePlayClick(entry, card) {
    if (isDeckUnlocked()) {
      var id = entry && entry.id ? String(entry.id) : '';
      if (!id) return;
      global.location.href = './play.html?game=' + encodeURIComponent(id);
      return;
    }
    shakeCard(card);
    var gate = document.querySelector('.gate');
    if (gate && gate.scrollIntoView) {
      try { gate.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      catch (e) { gate.scrollIntoView(); }
    }
  }

  function buildManifestGrid(entries) {
    var grid = $('cartridge-grid');
    if (!grid) return;
    stopPreviewLoop();
    grid.innerHTML = '';

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i] || {};
      var id = entry.id || ('slot-' + (i + 1));
      var title = entry.title || id;
      var category = entry.category || '';
      var mapping = entry.mappingOneLiner || '';

      var card = document.createElement('article');
      card.className = 'cart-card';
      card.setAttribute('data-id', id);

      var header = document.createElement('header');
      header.className = 'cart-label';

      var titleEl = document.createElement('span');
      titleEl.className = 'cart-title';
      titleEl.textContent = String(title);

      var catEl = document.createElement('span');
      catEl.className = 'cart-cat';
      catEl.textContent = String(category);

      header.appendChild(titleEl);
      header.appendChild(catEl);

      var canvas = document.createElement('canvas');
      canvas.className = 'cart-preview';
      canvas.width = 160;
      canvas.height = 100;

      var mappingEl = document.createElement('p');
      mappingEl.className = 'cart-mapping';
      mappingEl.textContent = String(mapping);

      var btn = document.createElement('button');
      btn.className = 'cart-play pixel-btn';
      btn.type = 'button';
      btn.textContent = 'PLAY';
      (function (boundEntry, boundCard) {
        btn.addEventListener('click', function () {
          handlePlayClick(boundEntry, boundCard);
        });
      })(entry, card);

      card.appendChild(header);
      card.appendChild(canvas);
      card.appendChild(mappingEl);
      card.appendChild(btn);
      grid.appendChild(card);

      var drawFn = previewDraws[id] || genericPreviewDraw(id);
      var ctx = null;
      try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
      if (ctx) {
        var previewEntry = {
          id: id,
          canvas: canvas,
          ctx: ctx,
          draw: drawFn,
          visible: true
        };
        previewEntries.push(previewEntry);
        observePreview(previewEntry);
      }
    }

    startPreviewLoop();
  }

  function rebuildGrid(entries) {
    if (Array.isArray(entries) && entries.length > 0) {
      buildManifestGrid(entries);
    } else {
      buildPlaceholderGrid();
    }
  }

  function fetchManifest() {
    if (typeof global.fetch !== 'function') return;
    var url = './games/manifest.json';
    global.fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      if (Array.isArray(data) && data.length > 0) {
        // Sort by numeric order if present; stable-ish fallback to file order.
        var sorted = data.slice().sort(function (a, b) {
          var ao = (a && typeof a.order === 'number') ? a.order : 9999;
          var bo = (b && typeof b.order === 'number') ? b.order : 9999;
          return ao - bo;
        });
        rebuildGrid(sorted);
      } else {
        if (typeof console !== 'undefined') console.warn('[picker] manifest empty or not an array, keeping placeholders');
      }
    }).catch(function (err) {
      if (typeof console !== 'undefined') console.warn('[picker] manifest fetch failed, keeping placeholders:', err && err.message ? err.message : err);
    });
  }

  function init() {
    buildPlaceholderGrid();
    fetchManifest();
    wireInputDetection();
    watchEegConnection();

    var simBtn = $('btn-simulator');
    if (simBtn) {
      simBtn.addEventListener('click', function () {
        if (state.simulator && state.simulator.isRunning) stopSimulator();
        else startSimulator();
      });
    }

    var museBtn = $('btn-muse');
    if (museBtn) {
      museBtn.addEventListener('click', function () {
        if (state.muse && state.muse.isConnected) {
          state.muse.disconnect();
          state.lastConnectionMode = null;
          setLight('brain', false);
          museBtn.textContent = 'CONNECT MUSE';
          museBtn.classList.remove('accent-green');
          museBtn.disabled = false;
        } else {
          connectMuse();
        }
      });
    }

    updateGate();
    updateSimButtonState();

    // Auto-resume the simulator if the user previously enabled it in this
    // tab. This keeps the BRAIN gate green after navigating back from a
    // cartridge without forcing the user to click USE SIMULATOR again.
    if (global.BrainGamesSession && global.BrainGamesSession.isSimulatorActive()) {
      startSimulator();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose minimal debug hooks so M4 can integrate cleanly.
  global.BrainGamesPicker = {
    setLight: setLight,
    getState: function () { return state; },
    rebuildGrid: rebuildGrid,
    buildPlaceholderGrid: buildPlaceholderGrid,
    fetchManifest: fetchManifest,
    getPreviewPalette: function () { return palette; }
  };
})(typeof window !== 'undefined' ? window : this);
