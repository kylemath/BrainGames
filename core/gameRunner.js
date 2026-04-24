// brainGames/core/gameRunner.js
// Exposes window.BrainGamesRunner = { load(gameId), stop(), getCanvas, ... }.
//
// Given a gameId, fetches `games/<gameId>.js` from the same directory this
// script lives under (resolved at load time), executes the source so that it
// writes setup/draw/keyPressed/keyReleased/mousePressed to `window`, and then
// spins up a new p5() instance in global mode. A previously-loaded game's
// globals are cleared so switching games leaves no ghost handlers behind.
//
// Host pages provide a #game-container element where the canvas is mounted.
// Canvas fills the viewport minus a 48px top status bar.

(function (global) {
  'use strict';

  if (!global.document) return; // non-browser env; nothing to do.

  var STATUS_BAR_HEIGHT = 48;

  // Classic 4:3 CRT tube size. The original Brainimation sketches were
  // authored against a canvas of roughly this aspect ratio and font size, so
  // forcing every game to this tube keeps hard-coded pixel dimensions
  // (TARGET_RADIUS, grid cell sizes, HUD fonts) reading the way their
  // authors intended. The surrounding TV chrome in `play.html` renders at
  // this native resolution and CSS-scales down on smaller viewports.
  var TUBE_WIDTH = 800;
  var TUBE_HEIGHT = 600;

  // Resolve the path of this script so we can locate sibling `games/` and
  // `core/` folders reliably regardless of where the HTML lives.
  function resolveBasePath() {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      if (src.indexOf('gameRunner.js') !== -1) {
        // strip the filename to get core/ path, then go up one to brainGames/.
        var coreUrl = src.substring(0, src.lastIndexOf('/'));
        return coreUrl.substring(0, coreUrl.lastIndexOf('/')) + '/';
      }
    }
    return './';
  }

  var BASE_PATH = resolveBasePath();

  // Keys that each user sketch may write to `window`. Tracked so we can wipe
  // them before loading the next game.
  var P5_HOOK_KEYS = [
    'setup', 'draw', 'windowResized', 'preload',
    'mousePressed', 'mouseReleased', 'mouseClicked', 'mouseMoved', 'mouseDragged', 'mouseWheel',
    'keyPressed', 'keyReleased', 'keyTyped',
    'touchStarted', 'touchMoved', 'touchEnded'
  ];

  // Additional globals declared by the sketch (var/function at top level) that
  // we want to clear between loads. Populated dynamically.
  var userDeclaredGlobals = new Set();

  var currentP5 = null;
  var currentCanvasEl = null;
  var containerEl = null;

  function getContainer() {
    if (containerEl && document.body.contains(containerEl)) return containerEl;
    containerEl = document.getElementById('game-container');
    if (!containerEl) {
      // No TV-set wrapper present — fall back to a simple fixed-size box,
      // centred in the viewport, so the sketch still renders at its native
      // tube resolution.
      containerEl = document.createElement('div');
      containerEl.id = 'game-container';
      containerEl.style.position = 'relative';
      containerEl.style.width = TUBE_WIDTH + 'px';
      containerEl.style.height = TUBE_HEIGHT + 'px';
      containerEl.style.margin = '24px auto';
      document.body.appendChild(containerEl);
    }
    return containerEl;
  }

  function removeCanvas() {
    if (currentP5) {
      try { currentP5.remove(); } catch (e) { /* ignore */ }
      currentP5 = null;
    }
    if (currentCanvasEl && currentCanvasEl.parentNode) {
      currentCanvasEl.parentNode.removeChild(currentCanvasEl);
    }
    currentCanvasEl = null;
  }

  // Public helper for layout code / games.
  global.removeCanvas = removeCanvas;
  global.getP5Canvas = function () { return currentCanvasEl; };

  function clearUserGlobals() {
    for (var i = 0; i < P5_HOOK_KEYS.length; i++) {
      try { global[P5_HOOK_KEYS[i]] = undefined; } catch (e) { /* ignore */ }
    }
    userDeclaredGlobals.forEach(function (key) {
      try { global[key] = undefined; } catch (e) { /* ignore */ }
    });
    userDeclaredGlobals = new Set();
  }

  function snapshotWindowKeys() {
    // Only count own, enumerable string keys. This is a best-effort snapshot.
    var keys = {};
    for (var k in global) {
      if (Object.prototype.hasOwnProperty.call(global, k)) {
        keys[k] = true;
      }
    }
    return keys;
  }

  function recordNewGlobals(before) {
    for (var k in global) {
      if (!Object.prototype.hasOwnProperty.call(global, k)) continue;
      if (before[k]) continue;
      if (P5_HOOK_KEYS.indexOf(k) !== -1) continue;
      // Preserve framework-owned globals.
      if (k === 'BrainGamesRunner' || k === 'eegData' || k === 'EEGSimulator' ||
          k === 'MuseEEGManager' || k === 'muse' || k === 'removeCanvas' ||
          k === 'getP5Canvas' || k === 'p5') continue;
      userDeclaredGlobals.add(k);
    }
  }

  function waitForDomReady() {
    return new Promise(function (resolve) {
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        resolve();
      } else {
        document.addEventListener('DOMContentLoaded', function onDomReady() {
          document.removeEventListener('DOMContentLoaded', onDomReady);
          resolve();
        });
      }
    });
  }

  async function load(gameId) {
    if (!gameId || typeof gameId !== 'string') {
      throw new Error('BrainGamesRunner.load: gameId is required');
    }
    if (typeof global.p5 !== 'function') {
      throw new Error('BrainGamesRunner.load: p5 is not loaded on window');
    }

    // p5 1.7 global mode waits for DOMContentLoaded before running setup on
    // its first instance. If load() is called before the DOM is ready, the
    // canvas won't appear until later. Wait explicitly so the caller can
    // `await` load() and then see the canvas in place.
    await waitForDomReady();

    // Tear down any previous game.
    removeCanvas();
    clearUserGlobals();

    var url = BASE_PATH + 'games/' + gameId + '.js';
    var response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('BrainGamesRunner.load: failed to fetch ' + url + ' (HTTP ' + response.status + ')');
    }
    var source = await response.text();

    // Execute in global scope so that `function setup()` / `let x = ...` land
    // on `window`. Using `new Function('window', source).call(window, window)`
    // would sandbox the source; tests show p5 sketches need true global scope,
    // which is what (0, eval)(...) provides.
    var before = snapshotWindowKeys();
    try {
      (0, eval)(source);
    } catch (err) {
      throw new Error('BrainGamesRunner.load: game source threw: ' + (err && err.message ? err.message : err));
    }
    recordNewGlobals(before);

    // Sketch-host contract:
    //   - Every game ends up on exactly ONE canvas sized TUBE_WIDTH × TUBE_HEIGHT.
    //   - `createCanvas(...)` calls from the sketch are honoured (so p5's
    //     internal state initialises normally), but we ignore the arguments
    //     and always produce the tube size. This preserves hard-coded pixel
    //     layouts in the original sketches.
    //   - `windowWidth` / `windowHeight` are shimmed during setup to the
    //     tube dimensions so games that read them for grid math (e.g.
    //     snakeFeast's cell-count derivation) stay consistent with the
    //     canvas they actually draw to.
    //   - The canvas is synchronously parented into `#game-container`
    //     (which lives inside the TV chrome in play.html).
    var userSetup = global.setup;
    var container = getContainer();

    // `load()` awaits this so the caller (e.g. playBoot) can trust that when
    // the promise resolves, the canvas is mounted and setup has run.
    var setupDone = null;
    var setupDonePromise = new Promise(function (resolve) { setupDone = resolve; });

    global.setup = function brainGamesSetup() {
      var userCanvasRenderer = null;

      // IMPORTANT: capture the real createCanvas HERE, not outside, because
      // p5 only attaches its instance methods (createCanvas, fill, etc.)
      // to `window` AFTER `new p5()` but BEFORE calling setup(). Capturing
      // at load() time would see `undefined`.
      var realCreateCanvas = global.createCanvas;

      if (typeof realCreateCanvas === 'function') {
        global.createCanvas = function brainGamesCreateCanvas(/* w, h, renderer */) {
          // Ignore any w/h the sketch passed; keep optional renderer arg
          // (P2D / WEBGL). Fall back to P2D if not specified.
          var rendererArg = arguments.length >= 3 ? arguments[2] : undefined;
          userCanvasRenderer = (typeof rendererArg === 'undefined')
            ? realCreateCanvas(TUBE_WIDTH, TUBE_HEIGHT)
            : realCreateCanvas(TUBE_WIDTH, TUBE_HEIGHT, rendererArg);
          return userCanvasRenderer;
        };
      }

      // Force windowWidth/windowHeight to the tube dimensions so sketches
      // that use them for layout (e.g. `createCanvas(windowWidth, windowHeight - 48)`
      // or `cols = windowWidth / cellPx`) stay self-consistent.
      global.windowWidth = TUBE_WIDTH;
      global.windowHeight = TUBE_HEIGHT + STATUS_BAR_HEIGHT;

      if (typeof userSetup === 'function') {
        try {
          userSetup();
        } catch (e) {
          console.error('[BrainGamesRunner] user setup() threw:', e);
        }
      }

      // Restore the real createCanvas in case the sketch's later code
      // (e.g. its own windowResized) wants to call it.
      if (typeof realCreateCanvas === 'function') {
        global.createCanvas = realCreateCanvas;
      }

      // If the game didn't call createCanvas itself (legacy sketches),
      // do it for them at the tube size.
      if (!userCanvasRenderer && typeof realCreateCanvas === 'function') {
        try {
          userCanvasRenderer = realCreateCanvas(TUBE_WIDTH, TUBE_HEIGHT);
        } catch (e) {
          console.error('[BrainGamesRunner] fallback createCanvas failed:', e);
        }
      }

      // Find the live canvas and parent it into #game-container.
      var canvasEl = null;
      if (userCanvasRenderer) {
        canvasEl = userCanvasRenderer.canvas || userCanvasRenderer.elt || null;
      }
      if (!canvasEl) {
        var canvases = document.getElementsByTagName('canvas');
        canvasEl = canvases[canvases.length - 1] || null;
      }
      currentCanvasEl = canvasEl;

      if (currentCanvasEl && currentCanvasEl.parentNode !== container) {
        try { container.appendChild(currentCanvasEl); } catch (e) { /* ignore */ }
      }
      if (currentCanvasEl) {
        // Let the surrounding TV CSS size the displayed canvas via CSS —
        // the backing buffer stays at the tube resolution (TUBE_WIDTH ×
        // TUBE_HEIGHT) so rendering is always pixel-accurate.
        currentCanvasEl.style.display = 'block';
        currentCanvasEl.style.width = '100%';
        currentCanvasEl.style.height = '100%';
      }

      // Signal to `load()` that setup completed and the canvas is mounted.
      try { setupDone(); } catch (e) { /* already resolved */ }
    };
    userDeclaredGlobals.add('setup');

    // A canvas of fixed tube size doesn't need to react to browser resize,
    // but we still install a no-op resized handler so p5 doesn't complain
    // and so any user-defined resized hook is preserved verbatim.
    if (typeof global.windowResized !== 'function') {
      global.windowResized = function brainGamesWindowResized() {
        // no-op: the tube is a fixed 800x600 backing buffer.
        // CSS in main.css handles visual scaling via transform.
      };
      userDeclaredGlobals.add('windowResized');
    }

    // Hand off to p5 in global mode. p5 auto-attaches via window.setup/draw.
    // Note: p5 schedules the first setup() call via setTimeout(fn, 1), so the
    // canvas is created asynchronously. The mount logic above runs inside our
    // wrapped setup, which is the first point at which the canvas exists.
    currentP5 = new global.p5();

    // Wait for setup() to run (with a generous timeout) so callers see a
    // mounted canvas when load() resolves.
    await Promise.race([
      setupDonePromise,
      new Promise(function (resolve) { setTimeout(resolve, 3000); })
    ]);

    return { gameId: gameId, canvas: currentCanvasEl };
  }

  function stop() {
    removeCanvas();
    clearUserGlobals();
  }

  global.BrainGamesRunner = {
    load: load,
    stop: stop,
    getCanvas: function () { return currentCanvasEl; },
    getContainer: getContainer,
    STATUS_BAR_HEIGHT: STATUS_BAR_HEIGHT
  };
})(typeof window !== 'undefined' ? window : this);
