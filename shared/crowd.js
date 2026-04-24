// BGShared.crowd - stadium backdrops, animated crowd rows, retro scoreboard
// Globals-only. Uses p5 globals. Safe to load in any order.
//
// Modes: "court" (basketball), "field" (soccer), "range" (archery),
//        "green" (golf). Each mode draws a full-screen backdrop.
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

  function fillGradient(x, y, w, h, top, bottom) {
    if (window.BGShared && window.BGShared.fillVerticalGradient) {
      window.BGShared.fillVerticalGradient(x, y, w, h, top, bottom);
      return;
    }
    var ct = (typeof top === "string") ? color(top) : top;
    var cb = (typeof bottom === "string") ? color(bottom) : bottom;
    for (var i = 0; i < h; i++) {
      var t = h > 1 ? (i / (h - 1)) : 0;
      stroke(lerpColor(ct, cb, t));
      line(x, y + i, x + w, y + i);
    }
    noStroke();
  }

  // Deterministic little PRNG so crowd layout is stable per-seed (no flicker).
  function lcg(seed) {
    var s = (seed | 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) | 0;
      return ((s >>> 0) % 1000) / 1000;
    };
  }

  // Default cheerful crowd palette (hats/shirts of fans).
  var CROWD_SHIRTS = [
    "#e84a4a", "#ffffff", "#2f6cd6", "#f7d51d",
    "#3bb870", "#a32fb8", "#ff7a2f", "#2fc7c7",
    "#ff4aa0", "#6cff83"
  ];
  var SKIN_TONES = ["#f1c9a5", "#d8a074", "#a87050", "#70432a"];

  // drawCrowd({x, y, w, h, cheer, palette, seed})
  // Draws animated silhouette rows of fans within the given rect.
  // cheer (0..1) modulates wave amplitude.
  function drawCrowd(opts) {
    opts = opts || {};
    var x = opts.x != null ? opts.x : 0;
    var y = opts.y != null ? opts.y : 0;
    var w = opts.w != null ? opts.w : width;
    var h = opts.h != null ? opts.h : height * 0.3;
    var cheer = Math.max(0, Math.min(1, typeof opts.cheer === "number" ? opts.cheer : 0));
    var seed = opts.seed != null ? opts.seed : 1;
    var rand = lcg(seed);

    // Determine row count from height (keep fans ~16px tall)
    var figH = 13;
    var rowCount = Math.max(2, Math.floor(h / (figH + 4)));
    var rowH = h / rowCount;
    var figW = Math.max(12, Math.floor(rowH * 0.9));
    var cols = Math.floor(w / figW) + 1;
    var pal = opts.palette || PAL();
    var shirts = opts.shirts || CROWD_SHIRTS;

    // Precompute colour indices so layout is stable per row/col
    for (var row = 0; row < rowCount; row++) {
      var yBase = y + row * rowH + rowH * 0.6;
      var off = (row % 2 === 0) ? 0 : figW * 0.5;
      // Wave phase driven by frameCount
      var phase = (typeof frameCount === "number" ? frameCount : 0) * 0.06 + row * 0.8;
      var waveAmp = 1 + cheer * 7;
      for (var c = 0; c < cols; c++) {
        // stable per-cell hash via the seeded rand repeated deterministically
        var hashIdx = ((c * 101) + (row * 37) + seed) | 0;
        var shirtIdx = ((hashIdx % shirts.length) + shirts.length) % shirts.length;
        var skinIdx  = ((hashIdx * 7 % SKIN_TONES.length) + SKIN_TONES.length) % SKIN_TONES.length;
        var cx = x + c * figW + off + figW * 0.5;
        if (cx > x + w + figW) continue;
        var bop = Math.sin(phase + c * 0.45) * waveAmp;
        // Body
        noStroke();
        fill(shirts[shirtIdx]);
        rect(cx - figW * 0.35, yBase + bop, figW * 0.7, figH * 0.72, 2);
        // Head
        fill(SKIN_TONES[skinIdx]);
        ellipse(cx, yBase - figH * 0.15 + bop, figW * 0.48, figW * 0.48);
        // Occasional raised hands (cheer)
        if (cheer > 0.35 && (hashIdx % 5 === 0)) {
          stroke(SKIN_TONES[skinIdx]);
          strokeWeight(1.5);
          noFill();
          var handY = yBase - figH * 0.35 + bop - cheer * 5;
          line(cx - figW * 0.15, yBase + bop, cx - figW * 0.25, handY);
          line(cx + figW * 0.15, yBase + bop, cx + figW * 0.25, handY);
          noStroke();
        }
      }
    }
    // Consume rand so linters don't flag it as unused; also future-proofs
    // per-seed variations if we want to sprinkle in props later.
    rand();
  }

  // makeCrowd({seed}) — factory for callers that want stable per-instance
  // crowds (e.g. two stands on left/right with different seeds).
  function makeCrowd(opts) {
    opts = opts || {};
    var seed = opts.seed != null ? opts.seed : 1;
    return {
      draw: function (drawOpts) {
        var merged = {};
        for (var k in drawOpts) if (Object.prototype.hasOwnProperty.call(drawOpts, k)) merged[k] = drawOpts[k];
        if (merged.seed == null) merged.seed = seed;
        drawCrowd(merged);
      },
      seed: function () { return seed; }
    };
  }

  // drawStadiumBackground({mode, time, palette})
  // Full-canvas backdrop. mode in {court, field, range, green}.
  // `time` is an optional animation phase (seconds or frame-derived value);
  // if omitted we use frameCount.
  function drawStadiumBackground(opts) {
    opts = opts || {};
    var mode = opts.mode || "court";
    var pal = opts.palette || PAL();

    switch (mode) {
      case "field":    return drawFieldBg(pal, opts);
      case "range":    return drawRangeBg(pal, opts);
      case "green":    return drawGreenBg(pal, opts);
      case "court":
      default:         return drawCourtBg(pal, opts);
    }
  }

  function drawCourtBg(pal, opts) {
    // Deep purple to ink gradient in upper half (stands), wood-tone below.
    var standsH = height * 0.52;
    fillGradient(0, 0, width, standsH, pal.deepPurple, pal.ink);
    // Tiered stand shelves
    noStroke();
    fill(0, 0, 0, 60);
    for (var t = 0; t < 5; t++) {
      rect(0, standsH * 0.1 + t * (standsH * 0.15), width, 3);
    }
    // Hardwood floor
    fillGradient(0, standsH, width, height - standsH, "#b07836", "#6a4620");
    // Court lines
    stroke(pal.acidYellow);
    strokeWeight(2);
    noFill();
    arc(width / 2, height * 1.06, width * 0.80, height * 0.68, Math.PI, Math.PI * 2);
    line(width * 0.22, height * 0.72, width * 0.78, height * 0.72);
    rect(width * 0.33, height * 0.72, width * 0.34, height * 0.28);
    noStroke();
    // Subtle pink tint in paint area
    fill(255, 74, 160, 30);
    rect(width * 0.33, height * 0.72, width * 0.34, height * 0.28);
    // Crowd inside the stands (upper region)
    drawCrowd({
      x: 0,
      y: height * 0.04,
      w: width,
      h: standsH * 0.82,
      cheer: opts.cheer != null ? opts.cheer : 0.25,
      seed: opts.seed != null ? opts.seed : 11,
      palette: pal
    });
  }

  function drawFieldBg(pal, opts) {
    // Night sky top (deep purple), pitch bottom.
    var skyH = height * 0.18;
    fillGradient(0, 0, width, skyH, pal.deepPurple, "#1a0f2e");
    // Stadium light glow
    noStroke();
    fill(247, 213, 29, 38);
    ellipse(width * 0.2, skyH * 0.3, width * 0.45, skyH * 1.6);
    ellipse(width * 0.8, skyH * 0.3, width * 0.45, skyH * 1.6);
    // Stand / crowd
    drawCrowd({
      x: 0,
      y: 2,
      w: width,
      h: skyH - 4,
      cheer: opts.cheer != null ? opts.cheer : 0.3,
      seed: opts.seed != null ? opts.seed : 21,
      palette: pal
    });
    // Pitch gradient
    fillGradient(0, skyH, width, height - skyH, "#2a9a3a", "#195820");
    // Mown stripes
    noStroke();
    for (var i = 0; i < 8; i++) {
      fill(i % 2 === 0 ? color(30, 140, 50, 40) : color(0, 0, 0, 0));
      rect((width / 8) * i, skyH, width / 8, height - skyH);
    }
    // Centre line
    stroke(255, 255, 255, 120);
    strokeWeight(2);
    noFill();
    line(0, skyH + (height - skyH) * 0.10, width, skyH + (height - skyH) * 0.10);
    noStroke();
  }

  function drawRangeBg(pal, opts) {
    // Sky gradient (purple dusk to pink haze)
    var skyH = height * 0.62;
    fillGradient(0, 0, width, skyH, pal.deepPurple, "#ff4aa0");
    // Low sun
    noStroke();
    fill(247, 213, 29, 180);
    ellipse(width * 0.75, skyH * 0.75, 60, 60);
    fill(247, 213, 29, 60);
    ellipse(width * 0.75, skyH * 0.75, 110, 110);
    // Distant tree line
    fill("#1a0f2e");
    beginShape();
    vertex(0, skyH);
    for (var x = 0; x <= width; x += 18) {
      var h = skyH - (noise(x * 0.04, (opts.time || 0) * 0.02) * height * 0.10 + height * 0.02);
      vertex(x, h);
    }
    vertex(width, skyH);
    endShape(CLOSE);
    // Grass ground
    fillGradient(0, skyH, width, height - skyH, "#3bb870", "#1d5a32");
    // Darker grass bands
    fill(0, 0, 0, 30);
    for (var i = 0; i < 4; i++) {
      var gy = skyH + i * (height * 0.10);
      rect(0, gy, width, 5);
    }
    noStroke();
    // Centre lane
    stroke(255, 255, 255, 90);
    strokeWeight(1);
    line(width * 0.38, skyH, width / 2 - 2, height * 0.92);
    line(width * 0.62, skyH, width / 2 + 2, height * 0.92);
    noStroke();
  }

  function drawGreenBg(pal, opts) {
    // Sky — purple to pink
    var groundY = height * 0.56;
    fillGradient(0, 0, width, groundY, pal.deepPurple, "#ff4aa0");
    // Clouds
    noStroke();
    fill(255, 255, 255, 140);
    ellipse(width * 0.30, height * 0.12, 90, 32);
    ellipse(width * 0.32, height * 0.10, 65, 26);
    ellipse(width * 0.72, height * 0.08, 110, 38);
    ellipse(width * 0.74, height * 0.065, 75, 28);
    // Fairway gradient
    fillGradient(0, groundY, width, height - groundY, "#3bb870", "#1c4f28");
    // Fairway bands
    var bandCount = 7;
    var bandW = width / bandCount;
    for (var i = 0; i < bandCount; i++) {
      fill(i % 2 === 0 ? color(40, 160, 70, 60) : color(0, 0, 0, 0));
      rect(i * bandW, groundY, bandW, height - groundY);
    }
    // Horizon line
    stroke(0, 0, 0, 90);
    strokeWeight(2);
    line(0, groundY, width, groundY);
    noStroke();
  }

  // drawScoreboard({x, y, home, away, time, width, height})
  // Retro pixel scoreboard. home/away are either numbers or { name, score }.
  function drawScoreboard(opts) {
    opts = opts || {};
    var pal = opts.palette || PAL();
    var x = opts.x != null ? opts.x : width * 0.30;
    var y = opts.y != null ? opts.y : height * 0.02;
    var w = opts.width != null ? opts.width : width * 0.40;
    var h = opts.height != null ? opts.height : 54;
    var home = opts.home;
    var away = opts.away;

    // Frame
    noStroke();
    fill(0, 0, 0, 200);
    rect(x + 3, y + 4, w, h, 4);
    fill(pal.ink);
    rect(x, y, w, h, 4);
    noFill();
    strokeWeight(2);
    stroke(pal.neonPink);
    rect(x, y, w, h, 4);
    strokeWeight(1);
    stroke(pal.acidYellow);
    rect(x + 3, y + 3, w - 6, h - 6, 3);
    noStroke();

    // Split into 3 cells: home | time | away
    var cellW = w / 3;
    // Divider lines
    stroke(pal.deepPurple);
    strokeWeight(1);
    line(x + cellW, y + 6, x + cellW, y + h - 6);
    line(x + cellW * 2, y + 6, x + cellW * 2, y + h - 6);
    noStroke();

    function cellPair(cx, primary, label, score) {
      fill(pal.dim);
      textAlign(CENTER, TOP);
      textSize(9);
      text(String(label || "").toUpperCase(), cx, y + 8);
      fill(primary);
      textAlign(CENTER, CENTER);
      textSize(20);
      text(String(score != null ? score : 0), cx, y + h * 0.62);
    }

    function cellSingle(cx, primary, big, small) {
      fill(pal.dim);
      textAlign(CENTER, TOP);
      textSize(9);
      text(String(small || "").toUpperCase(), cx, y + 8);
      fill(primary);
      textAlign(CENTER, CENTER);
      textSize(20);
      text(String(big != null ? big : ""), cx, y + h * 0.62);
    }

    // Home cell
    var homeLabel = "HOME";
    var homeScore = home;
    if (home && typeof home === "object") {
      homeLabel = home.name || homeLabel;
      homeScore = home.score;
    }
    cellPair(x + cellW * 0.5, pal.acidYellow, homeLabel, homeScore);

    // Time cell
    var t = opts.time;
    var timeText;
    if (typeof t === "number") {
      var secs = Math.max(0, Math.ceil(t));
      var mm = Math.floor(secs / 60);
      var ss = secs % 60;
      timeText = (mm < 10 ? "0" + mm : mm) + ":" + (ss < 10 ? "0" + ss : ss);
    } else {
      timeText = String(t || "--:--");
    }
    var timeCol = (typeof t === "number" && t <= 10) ? "#ff6b6b" : pal.crtGreen;
    cellSingle(x + cellW * 1.5, timeCol, timeText, "TIME");

    // Away cell
    var awayLabel = "AWAY";
    var awayScore = away;
    if (away && typeof away === "object") {
      awayLabel = away.name || awayLabel;
      awayScore = away.score;
    }
    cellPair(x + cellW * 2.5, pal.neonPink, awayLabel, awayScore);
  }

  window.BGShared.drawCrowd = drawCrowd;
  window.BGShared.makeCrowd = makeCrowd;
  window.BGShared.drawStadiumBackground = drawStadiumBackground;
  window.BGShared.drawScoreboard = drawScoreboard;
})();
