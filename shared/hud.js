// BGShared.hud - shared HUD widgets: bars, stat boxes, result overlays, top strip
// Globals-only. Depends on p5 globals and optionally BGShared.PALETTE /
// BGShared.drawPixelBorder (loaded in any order — we look them up at call time).
(function () {
  window.BGShared = window.BGShared || {};

  function PAL() {
    return (window.BGShared && window.BGShared.PALETTE) || {
      deepPurple: "#3b1f5a",
      acidYellow: "#f7d51d",
      neonPink:   "#ff4aa0",
      crtGreen:   "#6cff83",
      chromeGrey: "#c0c0c0",
      ink:        "#0a0614",
      shadow:     "#1a0f2e",
      dim:        "#8a7ba8"
    };
  }

  function toColor(c) {
    if (window.BGShared && window.BGShared.toColor) return window.BGShared.toColor(c);
    if (c && typeof c === "object" && typeof c.levels !== "undefined") return c;
    if (typeof c === "string") return color(c);
    return color(255);
  }

  // drawBar(x, y, w, h, val, label, col)
  // Pixel-bordered horizontal meter, fill proportional to val (0..1) with
  // optional label drawn below.
  function drawBar(x, y, w, h, val, label, col) {
    var pal = PAL();
    var fillCol = toColor(col || pal.acidYellow);
    var v = Math.max(0, Math.min(1, typeof val === "number" ? val : 0));

    // Background
    noStroke();
    fill(pal.shadow);
    rect(x, y, w, h, 2);
    // Fill
    fill(fillCol);
    rect(x, y, w * v, h, 2);
    // Pixel border
    noFill();
    stroke(pal.chromeGrey);
    strokeWeight(1);
    rect(x, y, w, h, 2);
    noStroke();
    strokeWeight(1);

    if (label) {
      fill("#ffffff");
      textAlign(LEFT, TOP);
      textSize(9);
      text(label + " " + v.toFixed(2), x, y + h + 2);
    }
  }

  // drawStatBox(x, y, label, val, col)
  // Small chrome-bordered stat tile. Backward compatible with existing
  // games' signatures — width/height are fixed defaults.
  function drawStatBox(x, y, label, val, col) {
    var pal = PAL();
    var accent = toColor(col || pal.acidYellow);
    var bw = 88, bh = 52;
    noStroke();
    fill(pal.ink);
    rect(x - bw / 2, y, bw, bh, 6);
    // Accent bar top
    fill(accent);
    rect(x - bw / 2, y, bw, 4, 3);
    // Chrome frame
    noFill();
    stroke(pal.chromeGrey);
    strokeWeight(1);
    rect(x - bw / 2, y, bw, bh, 6);
    noStroke();
    // Value
    fill(accent);
    textAlign(CENTER, CENTER);
    textSize(14);
    text(String(val), x, y + 22);
    // Label
    fill(pal.dim);
    textSize(9);
    text(String(label), x, y + 40);
  }

  // drawResultOverlay({kind, text, sub, pts})
  // Transient overlay. kind in {hit, miss, perfect, fail, combo}.
  function drawResultOverlay(opts) {
    opts = opts || {};
    var pal = PAL();
    var kind = opts.kind || "hit";
    var label = opts.text || "";
    var sub = opts.sub || "";
    var pts = opts.pts;

    var primary, bg, shadowA;
    switch (kind) {
      case "perfect":
        primary = pal.crtGreen;
        bg = color(20, 70, 40, 180);
        shadowA = 200;
        break;
      case "combo":
        primary = pal.neonPink;
        bg = color(90, 30, 80, 180);
        shadowA = 200;
        break;
      case "miss":
      case "fail":
        primary = "#ff6b6b";
        bg = color(40, 10, 20, 170);
        shadowA = 140;
        break;
      case "hit":
      default:
        primary = pal.acidYellow;
        bg = color(55, 30, 90, 180);
        shadowA = 200;
        break;
    }

    var panelW = width * 0.40;
    var panelH = height * 0.22;
    var px = width / 2 - panelW / 2;
    var py = height * 0.24;

    noStroke();
    fill(0, 0, 0, shadowA);
    rect(px + 4, py + 5, panelW, panelH, 12);
    fill(bg);
    rect(px, py, panelW, panelH, 12);
    noFill();
    strokeWeight(2);
    stroke(primary);
    rect(px, py, panelW, panelH, 12);
    noStroke();

    fill(primary);
    textAlign(CENTER, CENTER);
    textSize(28);
    text(label || kind.toUpperCase(), width / 2, py + panelH * 0.30);

    if (typeof pts === "number" && pts > 0) {
      fill("#ffffff");
      textSize(16);
      text("+" + pts + " pts", width / 2, py + panelH * 0.58);
    } else if (sub) {
      fill(pal.chromeGrey);
      textSize(12);
      text(sub, width / 2, py + panelH * 0.62);
    }
    if (sub && typeof pts === "number" && pts > 0) {
      fill(pal.chromeGrey);
      textSize(11);
      text(sub, width / 2, py + panelH * 0.82);
    }
  }

  // drawTopHud({eeg, score, time, palette})
  // Single-line top strip showing attention/meditation meters on the left,
  // score in the middle, and remaining time on the right.
  function drawTopHud(opts) {
    opts = opts || {};
    var pal = opts.palette || PAL();
    var eeg = opts.eeg || {};
    var score = (opts.score != null) ? opts.score : 0;
    var seconds = (typeof opts.time === "number") ? opts.time : null;

    var stripH = 34;
    noStroke();
    fill(0, 0, 0, 190);
    rect(0, 0, width, stripH);
    fill(pal.neonPink);
    rect(0, stripH, width, 2);

    // Attention meter
    var att = typeof eeg.attention === "number" ? eeg.attention : 0;
    var med = typeof eeg.meditation === "number" ? eeg.meditation : 0;
    drawMeter(8, 8, 110, 8, att, "ATT", pal.acidYellow, pal);
    drawMeter(130, 8, 110, 8, med, "MED", pal.crtGreen, pal);

    // Score (centre)
    fill(pal.acidYellow);
    textAlign(CENTER, CENTER);
    textSize(15);
    text(String(score), width / 2, stripH / 2 - 1);
    fill(pal.dim);
    textSize(8);
    text("SCORE", width / 2, stripH - 8);

    // Timer (right)
    if (seconds != null) {
      var urgent = seconds <= 10;
      fill(urgent ? "#ff6b6b" : pal.crtGreen);
      textAlign(RIGHT, CENTER);
      textSize(15);
      text(Math.max(0, Math.ceil(seconds)) + "s", width - 10, stripH / 2 - 1);
      fill(pal.dim);
      textSize(8);
      text("TIME", width - 24, stripH - 8);
    }
  }

  // Internal helper for the top-strip compact meter (label-left, no decimals).
  function drawMeter(x, y, w, h, val, label, col, pal) {
    var v = Math.max(0, Math.min(1, typeof val === "number" ? val : 0));
    noStroke();
    fill(pal.shadow);
    rect(x + 28, y, w, h, 2);
    fill(col);
    rect(x + 28, y, w * v, h, 2);
    noFill();
    stroke(pal.chromeGrey);
    strokeWeight(1);
    rect(x + 28, y, w, h, 2);
    noStroke();
    fill(col);
    textAlign(LEFT, CENTER);
    textSize(9);
    text(label, x, y + h / 2 - 1);
    fill("#ffffff");
    textAlign(RIGHT, CENTER);
    textSize(9);
    text(v.toFixed(2), x + 28 + w - 4, y + h + 8);
  }

  window.BGShared.drawBar = drawBar;
  window.BGShared.drawStatBox = drawStatBox;
  window.BGShared.drawResultOverlay = drawResultOverlay;
  window.BGShared.drawTopHud = drawTopHud;
})();
