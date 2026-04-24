// BGShared.intro - shared intro and summary overlay panels
// Globals-only. Depends on p5 globals. Safe to load in any order; uses
// BGShared.PALETTE / drawChromeText / drawCrtPanel / blinker when available.
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

  function drawChrome(txt, x, y, size) {
    if (window.BGShared && window.BGShared.drawChromeText) {
      window.BGShared.drawChromeText(txt, x, y, size);
    } else {
      var pal = PAL();
      textSize(size || 24);
      fill(0, 0, 0, 110); text(txt, x + 2, y + 2);
      fill(pal.neonPink);  text(txt, x, y + 1);
      fill(pal.acidYellow); text(txt, x, y);
    }
  }

  function drawPanelFrame(x, y, w, h) {
    if (window.BGShared && window.BGShared.drawCrtPanel) {
      window.BGShared.drawCrtPanel(x, y, w, h, {});
      return;
    }
    var pal = PAL();
    noStroke();
    fill(0, 0, 0, 190);
    rect(x, y, w, h, 12);
    noFill();
    strokeWeight(3);
    stroke(pal.neonPink);
    rect(x, y, w, h, 12);
    strokeWeight(1);
    stroke(pal.acidYellow);
    rect(x + 4, y + 4, w - 8, h - 8, 9);
    noStroke();
  }

  function blink(rate) {
    if (window.BGShared && window.BGShared.blinker) return window.BGShared.blinker(rate);
    if (typeof frameCount === "undefined") return 1;
    return (Math.floor(frameCount / (rate || 30)) % 2 === 0) ? 1 : 0;
  }

  // Word-wrap helper (very simple; p5's text() wraps with textWrap in newer
  // p5, but we avoid that dependency).
  function wrapLines(str, maxCharsPerLine) {
    if (!str) return [];
    var words = String(str).split(/\s+/);
    var lines = [];
    var line = "";
    for (var i = 0; i < words.length; i++) {
      var candidate = line.length === 0 ? words[i] : line + " " + words[i];
      if (candidate.length > maxCharsPerLine && line.length > 0) {
        lines.push(line);
        line = words[i];
      } else {
        line = candidate;
      }
    }
    if (line.length > 0) lines.push(line);
    return lines;
  }

  // drawIntroPanel({title, blurb, mappings, introTimer, startHint})
  //   title       — string
  //   blurb       — string (wrapped)
  //   mappings    — array of { label, desc, color? }
  //   introTimer  — number (frames remaining; null to wait for keypress)
  //   startHint   — string shown when timer expires (defaults to "PRESS SPACE TO START")
  function drawIntroPanel(opts) {
    opts = opts || {};
    var pal = PAL();
    var title    = opts.title || "Brainimation";
    var blurb    = opts.blurb || "";
    var mappings = Array.isArray(opts.mappings) ? opts.mappings : [];
    var timer    = (opts.introTimer === null || opts.introTimer === undefined) ? null : opts.introTimer;
    var hint     = opts.startHint || "PRESS SPACE TO START";

    var px = width * 0.08;
    var py = height * 0.06;
    var pw = width * 0.84;
    var ph = height * 0.88;

    drawPanelFrame(px, py, pw, ph);

    // Title — chrome text
    textAlign(CENTER, CENTER);
    drawChrome(title, width / 2, py + 44, 30);

    // Separator
    stroke(pal.neonPink);
    strokeWeight(1);
    line(px + 30, py + 72, px + pw - 30, py + 72);
    noStroke();

    // Blurb
    fill("#ffffff");
    textAlign(CENTER, TOP);
    textSize(13);
    var blurbLines = wrapLines(blurb, 68);
    var blurbY = py + 86;
    for (var i = 0; i < blurbLines.length; i++) {
      text(blurbLines[i], width / 2, blurbY + i * 18);
    }
    var mapTop = blurbY + Math.max(blurbLines.length, 1) * 18 + 18;

    // Mappings section header
    fill(pal.acidYellow);
    textAlign(CENTER, TOP);
    textSize(12);
    text("EEG MAPPINGS", width / 2, mapTop);
    mapTop += 22;

    var rowH = 46;
    for (var m = 0; m < mappings.length; m++) {
      var item = mappings[m];
      var accent = item.color || pal.crtGreen;
      var rowY = mapTop + m * rowH;
      // Bullet dot
      fill(accent);
      noStroke();
      ellipse(px + 34, rowY + 10, 8, 8);
      // Label
      fill(accent);
      textAlign(LEFT, TOP);
      textSize(13);
      text(String(item.label || ""), px + 48, rowY);
      // Description
      fill(pal.chromeGrey);
      textSize(11);
      var descLines = wrapLines(String(item.desc || ""), 82);
      for (var d = 0; d < descLines.length && d < 2; d++) {
        text(descLines[d], px + 48, rowY + 18 + d * 14);
      }
    }

    // Countdown bar or start hint
    var footerY = py + ph - 58;
    if (timer != null && timer > 0) {
      var secs = Math.ceil(timer / 30);
      var total = opts.introTotalFrames || 300;
      var frac = Math.max(0, Math.min(1, timer / total));
      var barW = pw * 0.55;
      var barX = width / 2 - barW / 2;
      noStroke();
      fill(pal.shadow);
      rect(barX, footerY, barW, 10, 4);
      fill(pal.acidYellow);
      rect(barX, footerY, barW * frac, 10, 4);
      noFill();
      stroke(pal.chromeGrey);
      strokeWeight(1);
      rect(barX, footerY, barW, 10, 4);
      noStroke();
      fill(pal.chromeGrey);
      textAlign(CENTER, TOP);
      textSize(11);
      text("Reading... " + secs + "s", width / 2, footerY + 18);
    } else {
      if (blink(30)) {
        fill(pal.acidYellow);
        textAlign(CENTER, CENTER);
        textSize(14);
        text(hint, width / 2, footerY + 12);
      }
    }
  }

  // drawSummaryPanel({title, stats, message, restartHint})
  //   title       — string (default "GAME OVER")
  //   stats       — array of { label, value, color? }
  //   message     — flavour string
  //   restartHint — string shown blinking at bottom
  function drawSummaryPanel(opts) {
    opts = opts || {};
    var pal = PAL();
    var title    = opts.title || "GAME OVER";
    var stats    = Array.isArray(opts.stats) ? opts.stats : [];
    var message  = opts.message || "";
    var restart  = opts.restartHint || "PRESS SPACE TO PLAY AGAIN";

    var px = width * 0.06;
    var py = height * 0.05;
    var pw = width * 0.88;
    var ph = height * 0.90;

    drawPanelFrame(px, py, pw, ph);

    textAlign(CENTER, CENTER);
    drawChrome(title, width / 2, py + 50, 34);

    stroke(pal.acidYellow);
    strokeWeight(1);
    line(px + 30, py + 86, px + pw - 30, py + 86);
    noStroke();

    // Stats grid — up to 5 across, then wrap
    var perRow = Math.min(stats.length || 1, 5);
    var colW = pw / Math.max(1, perRow);
    var rowY = py + 116;
    for (var i = 0; i < stats.length; i++) {
      var s = stats[i];
      var colIdx = i % perRow;
      var rowIdx = Math.floor(i / perRow);
      var cx = px + colIdx * colW + colW / 2;
      var cy = rowY + rowIdx * 72;
      if (window.BGShared && window.BGShared.drawStatBox) {
        window.BGShared.drawStatBox(cx, cy, s.label || "", s.value != null ? s.value : "", s.color || pal.acidYellow);
      } else {
        // Inline fallback
        noStroke();
        fill(pal.ink);
        rect(cx - 44, cy, 88, 52, 6);
        fill(s.color || pal.acidYellow);
        textAlign(CENTER, CENTER);
        textSize(14);
        text(String(s.value != null ? s.value : ""), cx, cy + 22);
        fill(pal.dim);
        textSize(9);
        text(String(s.label || ""), cx, cy + 40);
      }
    }

    // Flavour message
    var msgY = py + ph - 90;
    fill(pal.crtGreen);
    textAlign(CENTER, CENTER);
    textSize(12);
    var msgLines = wrapLines(message, 72);
    for (var m = 0; m < msgLines.length && m < 3; m++) {
      text(msgLines[m], width / 2, msgY + m * 16);
    }

    // Restart hint — blinking
    if (blink(30)) {
      fill(pal.acidYellow);
      textAlign(CENTER, CENTER);
      textSize(13);
      text(restart, width / 2, py + ph - 30);
    }
  }

  window.BGShared.drawIntroPanel = drawIntroPanel;
  window.BGShared.drawSummaryPanel = drawSummaryPanel;
})();
