// BGShared.eegSmoothing - rolling averages, grace buffer, safe EEG read
// Globals-only. No implicit top-level globals. All exports hang off window.BGShared.
(function () {
  window.BGShared = window.BGShared || {};

  // makeSmoother(n) — closure-backed rolling average over last n pushes.
  // Returns { push(v), value(), history(), clear() }.
  function makeSmoother(n) {
    var size = Math.max(1, n | 0);
    var buf = [];
    return {
      push: function (v) {
        var num = (typeof v === "number" && isFinite(v)) ? v : 0;
        buf.push(num);
        if (buf.length > size) buf.shift();
        return this.value();
      },
      value: function () {
        if (buf.length === 0) return 0;
        var s = 0;
        for (var i = 0; i < buf.length; i++) s += buf[i];
        return s / buf.length;
      },
      history: function () { return buf.slice(); },
      clear: function () { buf.length = 0; },
      size: function () { return size; }
    };
  }

  // makeGraceBuffer({window, threshold}) — boolean gate used by games to
  // detect "held focus" above each player's own recent median.
  // ok() returns true when the fraction of pushes in the window that are
  // >= median(window) is >= threshold (0..1).
  function makeGraceBuffer(opts) {
    opts = opts || {};
    var win = Math.max(2, opts.window || 30);
    var thr = opts.threshold != null ? opts.threshold : 0.6;
    var buf = [];

    function median(arr) {
      if (arr.length === 0) return 0;
      var sorted = arr.slice().sort(function (a, b) { return a - b; });
      var mid = sorted.length >> 1;
      if (sorted.length % 2 === 1) return sorted[mid];
      return (sorted[mid - 1] + sorted[mid]) * 0.5;
    }

    return {
      push: function (v) {
        var num = (typeof v === "number" && isFinite(v)) ? v : 0;
        buf.push(num);
        if (buf.length > win) buf.shift();
        return this.ok();
      },
      ok: function () {
        if (buf.length < win) return false;
        var m = median(buf);
        var hits = 0;
        for (var i = 0; i < buf.length; i++) if (buf[i] >= m) hits++;
        return (hits / buf.length) >= thr;
      },
      fraction: function () {
        if (buf.length === 0) return 0;
        var m = median(buf);
        var hits = 0;
        for (var i = 0; i < buf.length; i++) if (buf[i] >= m) hits++;
        return hits / buf.length;
      },
      clear: function () { buf.length = 0; },
      length: function () { return buf.length; },
      windowSize: function () { return win; },
      threshold: function () { return thr; }
    };
  }

  // readEEG(opts) — safely read window.eegData even if it's missing or
  // partial. Always returns a populated object so games never throw.
  // opts.defaults lets callers override defaults for specific keys.
  function readEEG(opts) {
    opts = opts || {};
    var defaults = {
      attention:  0,
      meditation: 0,
      delta:      0,
      theta:      0,
      alpha:      0,
      beta:       0,
      gamma:      0,
      connected:  false
    };
    if (opts.defaults) {
      for (var k in opts.defaults) {
        if (Object.prototype.hasOwnProperty.call(opts.defaults, k)) {
          defaults[k] = opts.defaults[k];
        }
      }
    }
    var src = (typeof window !== "undefined" && window.eegData) ? window.eegData : null;
    if (!src) return defaults;
    var out = {};
    for (var key in defaults) {
      if (Object.prototype.hasOwnProperty.call(defaults, key)) {
        var v = src[key];
        if (key === "connected") {
          out[key] = (v === true);
        } else if (typeof v === "number" && isFinite(v)) {
          out[key] = v;
        } else {
          out[key] = defaults[key];
        }
      }
    }
    return out;
  }

  window.BGShared.makeSmoother = makeSmoother;
  window.BGShared.makeGraceBuffer = makeGraceBuffer;
  window.BGShared.readEEG = readEEG;
})();
