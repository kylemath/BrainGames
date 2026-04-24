// BGShared.styling90s - retro 90s palette + pixel chrome + scanlines
// Globals-only. Safe to load in any order after p5.js.
// All helpers call p5 globals (fill/rect/stroke/text/etc.) implicitly.
(function () {
  window.BGShared = window.BGShared || {};

  // Palette — MUST match brainGames/styles/main.css (M1 contract)
  var PALETTE = {
    deepPurple: "#3b1f5a",
    acidYellow: "#f7d51d",
    neonPink:   "#ff4aa0",
    crtGreen:   "#6cff83",
    chromeGrey: "#c0c0c0",
    // Common neutrals used by helpers
    ink:        "#0a0614",
    shadow:     "#1a0f2e",
    highlight:  "#ffffff",
    dim:        "#8a7ba8"
  };

  // Convert a #rrggbb string into a p5 color, or pass through p5 colors.
  function toColor(c) {
    if (c && typeof c === "object" && typeof c.levels !== "undefined") return c;
    if (typeof c === "string") return color(c);
    return color(255);
  }

  // Pixel border — two-tone chrome frame (outer light, inner dark)
  // Paints a 2px outer bevel and a 2px inner bevel.
  function drawPixelBorder(x, y, w, h, col1, col2) {
    var c1 = toColor(col1 || PALETTE.chromeGrey);
    var c2 = toColor(col2 || PALETTE.deepPurple);
    noFill();
    strokeWeight(2);
    stroke(c1);
    rect(x, y, w, h);
    stroke(c2);
    rect(x + 2, y + 2, w - 4, h - 4);
    noStroke();
    strokeWeight(1);
  }

  // Scanline overlay — cheap CRT effect, drawn on top of canvas.
  // Optional opts { alpha, spacing, tint } for fine-tuning.
  function drawScanlineOverlay(opts) {
    opts = opts || {};
    var a = opts.alpha != null ? opts.alpha : 38;
    var sp = opts.spacing != null ? opts.spacing : 3;
    var tint = toColor(opts.tint || "#000000");
    var lv = tint.levels || [0, 0, 0, 255];
    stroke(lv[0], lv[1], lv[2], a);
    strokeWeight(1);
    for (var y = 0; y < height; y += sp) {
      line(0, y, width, y);
    }
    noStroke();
  }

  // Chrome text — two-tone gradient (top light, bottom purple).
  // Uses current textAlign/textFont. Caller sets alignment.
  function drawChromeText(txt, x, y, size) {
    size = size || 24;
    textSize(size);
    // Shadow pass
    fill(0, 0, 0, 110);
    text(txt, x + 2, y + 2);
    // Bottom tone (neon pink / deep purple)
    fill(PALETTE.neonPink);
    text(txt, x, y + 1);
    // Top tone (acid yellow / highlight)
    fill(PALETTE.acidYellow);
    text(txt, x, y);
  }

  // Blinker — returns 0 or 1 based on frameCount + rate (frames per half-cycle).
  // rate defaults to 30 frames.
  function blinker(rate) {
    rate = rate || 30;
    if (typeof frameCount === "undefined") return 1;
    return (Math.floor(frameCount / rate) % 2 === 0) ? 1 : 0;
  }

  // Fill a vertical gradient background rectangle between two colors.
  // Exposed as a convenience for other helpers (crowd/intro use this).
  function fillVerticalGradient(x, y, w, h, top, bottom) {
    var ct = toColor(top);
    var cb = toColor(bottom);
    for (var i = 0; i < h; i++) {
      var t = h > 1 ? (i / (h - 1)) : 0;
      stroke(lerpColor(ct, cb, t));
      line(x, y + i, x + w, y + i);
    }
    noStroke();
  }

  // CRT panel — rounded rect with neon border and dark inner fill.
  // Used by intro/summary overlays.
  function drawCrtPanel(x, y, w, h, opts) {
    opts = opts || {};
    var bgCol = toColor(opts.bg || PALETTE.ink);
    var borderA = toColor(opts.borderA || PALETTE.neonPink);
    var borderB = toColor(opts.borderB || PALETTE.acidYellow);
    var radius = opts.radius != null ? opts.radius : 10;
    // Shadow
    noStroke();
    fill(0, 0, 0, 170);
    rect(x + 4, y + 5, w, h, radius);
    // Fill
    fill(bgCol);
    rect(x, y, w, h, radius);
    // Outer neon
    noFill();
    strokeWeight(3);
    stroke(borderA);
    rect(x, y, w, h, radius);
    // Inner acid
    strokeWeight(1);
    stroke(borderB);
    rect(x + 4, y + 4, w - 8, h - 8, Math.max(0, radius - 3));
    noStroke();
    strokeWeight(1);
  }

  window.BGShared.PALETTE = PALETTE;
  window.BGShared.toColor = toColor;
  window.BGShared.drawPixelBorder = drawPixelBorder;
  window.BGShared.drawScanlineOverlay = drawScanlineOverlay;
  window.BGShared.drawChromeText = drawChromeText;
  window.BGShared.blinker = blinker;
  window.BGShared.fillVerticalGradient = fillVerticalGradient;
  window.BGShared.drawCrtPanel = drawCrtPanel;
})();
