/**
 * @id snakeFeast
 * @title Snake Feast
 * @category Brain Games
 * @order 30
 * @newGame true
 *
 * EEG mappings:
 *   alpha      -> assistive auto-steer toward nearest pellet (see applyAlphaAssist)
 *   beta       -> tick rate (speed) 5..18 ticks/sec  (ticksPerSec = 5 + beta*13)
 *   attention  -> >0.6 doubles pellet value at time of eating (2 pts instead of 1)
 *   meditation -> cosmetic trail glow alpha (calmer brain = softer halo)
 *
 * Wall policy: wrap (snake wraps around the grid edges).
 * Fail policy: self-collision ends the game.
 */

// ---- Module-scope state ---------------------------------------------------
let sf_state;              // 'intro' | 'play' | 'over'
let sf_cellPx;             // px per cell
let sf_cols, sf_rows;      // grid dims
let sf_playTop;            // y-offset of grid within canvas (below HUD strip)
let sf_snake;              // array of {c, r}; head = index 0
let sf_heading;            // {dc, dr} unit vector on grid
let sf_pendingDir;         // queued direction from input; applied next tick
let sf_pellet;             // {c, r}
let sf_score;
let sf_ticksPerSec;
let sf_lastTickMs;
let sf_lastKeyMs;          // for alpha-assist gating
let sf_startedAtMs;        // game start timestamp (for elapsed time)
let sf_focusFrames;        // contiguous frames where attention > 0.6
let sf_longestFocusFrames; // best streak this run
let sf_doublePulse;        // ms timestamp of last 2x eat (for HUD flash)

// Smoothers (built in setup() — BGShared is loaded before us)
let sf_alphaSmoother;
let sf_betaSmoother;
let sf_attSmoother;
let sf_medSmoother;

// Intro countdown — 3 seconds at ~60fps, but we drive from millis() so it's
// robust to framerate drift.
const SF_INTRO_MS = 3000;
let sf_introStartMs;

const SF_CELL_PX_DEFAULT = 24;
const SF_FOCUS_THRESHOLD = 0.6;
const SF_ALPHA_ASSIST_MIN = 0.4;     // alpha below this disables assist entirely
const SF_ALPHA_ASSIST_MAX_P = 0.8;   // clamp for max probability per tick
const SF_ASSIST_KEY_GRACE_MS = 400;  // no assist while player actively steering

// Directions indexed for easy rotation logic
const SF_DIRS = [
  { dc:  0, dr: -1, name: 'N' },
  { dc:  1, dr:  0, name: 'E' },
  { dc:  0, dr:  1, name: 'S' },
  { dc: -1, dr:  0, name: 'W' }
];

// ---- p5 hooks -------------------------------------------------------------

function setup() {
  const w = windowWidth;
  const h = windowHeight - 48;
  createCanvas(w, h);
  frameRate(60);
  textFont('monospace');

  sf_cellPx = SF_CELL_PX_DEFAULT;
  sf_playTop = 34; // leave room for BGShared.drawTopHud
  sf_cols = Math.max(10, Math.floor(w / sf_cellPx));
  sf_rows = Math.max(10, Math.floor((h - sf_playTop) / sf_cellPx));

  const S = window.BGShared || {};
  sf_alphaSmoother = (S.makeSmoother ? S.makeSmoother(30) : fallbackSmoother(30));
  sf_betaSmoother  = (S.makeSmoother ? S.makeSmoother(30) : fallbackSmoother(30));
  sf_attSmoother   = (S.makeSmoother ? S.makeSmoother(30) : fallbackSmoother(30));
  sf_medSmoother   = (S.makeSmoother ? S.makeSmoother(60) : fallbackSmoother(60));

  resetRun();
  sf_state = 'intro';
  sf_introStartMs = millis();
}

function draw() {
  const eeg = readEEGSafe();

  // Push raw (not smoothed) values into the smoothers once per frame.
  sf_alphaSmoother.push(eeg.alpha);
  sf_betaSmoother.push(eeg.beta);
  sf_attSmoother.push(eeg.attention);
  sf_medSmoother.push(eeg.meditation);

  const alpha = clamp01(sf_alphaSmoother.value());
  const beta  = clamp01(sf_betaSmoother.value());
  const att   = clamp01(sf_attSmoother.value());
  const med   = clamp01(sf_medSmoother.value());

  // Tick rate from beta (always updated so speed responds live).
  sf_ticksPerSec = 5 + beta * 13;
  if (sf_ticksPerSec < 5) sf_ticksPerSec = 5;
  if (sf_ticksPerSec > 18) sf_ticksPerSec = 18;

  // --- Background ---
  drawSceneBackground();

  if (sf_state === 'play') {
    // Focus streak bookkeeping
    if (eeg.attention > SF_FOCUS_THRESHOLD) {
      sf_focusFrames++;
      if (sf_focusFrames > sf_longestFocusFrames) sf_longestFocusFrames = sf_focusFrames;
    } else {
      sf_focusFrames = 0;
    }

    // Run as many ticks as fit in the elapsed time (handles slow frames too).
    const now = millis();
    const msPerTick = 1000 / sf_ticksPerSec;
    let guard = 0;
    while (now - sf_lastTickMs >= msPerTick && guard < 4) {
      tick(alpha);
      sf_lastTickMs += msPerTick;
      guard++;
      if (sf_state !== 'play') break;
    }

    drawPlayField(med);
    drawHud(eeg, alpha, beta, att);
  } else if (sf_state === 'intro') {
    drawPlayField(med);
    drawHud(eeg, alpha, beta, att);
    drawIntroOverlay();

    // Auto-start when intro elapses
    if (millis() - sf_introStartMs >= SF_INTRO_MS) {
      startPlay();
    }
  } else if (sf_state === 'over') {
    drawPlayField(med);
    drawSummaryOverlay();
  }

  drawScanlines();
}

function keyPressed() {
  // Space — advance states
  if (key === ' ') {
    if (sf_state === 'intro') { startPlay(); return; }
    if (sf_state === 'over')  { resetRun(); sf_state = 'intro'; sf_introStartMs = millis(); return; }
  }

  if (sf_state !== 'play') return;

  const k = (typeof key === 'string') ? key.toLowerCase() : '';
  let next = null;
  if (keyCode === LEFT_ARROW  || k === 'a') next = SF_DIRS[3]; // W
  if (keyCode === RIGHT_ARROW || k === 'd') next = SF_DIRS[1]; // E
  if (keyCode === UP_ARROW    || k === 'w') next = SF_DIRS[0]; // N
  if (keyCode === DOWN_ARROW  || k === 's') next = SF_DIRS[2]; // S
  if (!next) return;

  // Reject exact 180° reversal (would instantly self-collide with neck).
  if (next.dc === -sf_heading.dc && next.dr === -sf_heading.dr) return;

  sf_pendingDir = next;
  sf_lastKeyMs = millis();
}

// ---- Game lifecycle -------------------------------------------------------

function resetRun() {
  const startC = Math.floor(sf_cols / 2);
  const startR = Math.floor(sf_rows / 2);
  sf_snake = [
    { c: startC,     r: startR },
    { c: startC - 1, r: startR },
    { c: startC - 2, r: startR },
    { c: startC - 3, r: startR }
  ];
  sf_heading    = SF_DIRS[1]; // E
  sf_pendingDir = null;
  sf_score = 0;
  sf_ticksPerSec = 7;
  sf_lastTickMs = millis();
  sf_lastKeyMs = -9999;
  sf_focusFrames = 0;
  sf_longestFocusFrames = 0;
  sf_doublePulse = -9999;
  sf_startedAtMs = millis();
  spawnPellet();
}

function startPlay() {
  sf_state = 'play';
  sf_lastTickMs = millis();
  sf_startedAtMs = millis();
}

// ---- Core tick ------------------------------------------------------------

function tick(alpha) {
  // 1. Apply pending direction if any (already validated for 180°).
  if (sf_pendingDir) {
    sf_heading = sf_pendingDir;
    sf_pendingDir = null;
  }

  // 2. Alpha-assist: may rotate heading 90° toward the nearest pellet.
  //    Rules (ASSISTIVE — player input always takes priority):
  //      - gated by alpha > SF_ALPHA_ASSIST_MIN (0.4)
  //      - gated by "player hasn't pressed a key in the last 400ms"
  //      - rotation is only proposed if the current heading is not already
  //        reducing the larger-of-|dc|,|dr| distance component
  //      - probability of firing = clamp(alpha, 0, SF_ALPHA_ASSIST_MAX_P=0.8)
  //      - the proposed 90° rotation is REJECTED if it would cause immediate
  //        self-collision on the next cell
  applyAlphaAssist(alpha);

  // 3. Compute new head position with toroidal wrap (wall = wrap policy).
  const head = sf_snake[0];
  const nc = (head.c + sf_heading.dc + sf_cols) % sf_cols;
  const nr = (head.r + sf_heading.dr + sf_rows) % sf_rows;

  // 4. Self-collision check. Note: tail WILL move out this tick unless we're
  //    about to grow, so exclude the last segment when not eating.
  const eating = (nc === sf_pellet.c && nr === sf_pellet.r);
  const limit = eating ? sf_snake.length : sf_snake.length - 1;
  for (let i = 0; i < limit; i++) {
    if (sf_snake[i].c === nc && sf_snake[i].r === nr) {
      sf_state = 'over';
      return;
    }
  }

  // 5. Advance snake.
  sf_snake.unshift({ c: nc, r: nr });
  if (eating) {
    const eeg = readEEGSafe();
    const pts = (eeg.attention > SF_FOCUS_THRESHOLD) ? 2 : 1;
    sf_score += pts;
    if (pts === 2) sf_doublePulse = millis();
    spawnPellet();
  } else {
    sf_snake.pop();
  }
}

// ASSISTIVE auto-steer: nudges heading toward the nearest pellet along the
// dominant axis when the player is idle. See tick() for the full rule set.
function applyAlphaAssist(alpha) {
  if (alpha < SF_ALPHA_ASSIST_MIN) return;
  if (millis() - sf_lastKeyMs < SF_ASSIST_KEY_GRACE_MS) return;

  const p = Math.min(SF_ALPHA_ASSIST_MAX_P, Math.max(0, alpha));
  if (Math.random() >= p) return;

  const head = sf_snake[0];
  // Shortest-path delta on a torus (wrap-aware)
  const dc = shortestDelta(sf_pellet.c - head.c, sf_cols);
  const dr = shortestDelta(sf_pellet.r - head.r, sf_rows);

  // Already on the best axis? Skip.
  const absC = Math.abs(dc), absR = Math.abs(dr);
  if (absC === 0 && absR === 0) return;

  // Pick preferred axis; if currently moving along that axis toward the
  // pellet, no rotation needed.
  const preferHoriz = absC >= absR;
  const desired = preferHoriz
    ? (dc > 0 ? SF_DIRS[1] : SF_DIRS[3])  // E or W
    : (dr > 0 ? SF_DIRS[2] : SF_DIRS[0]); // S or N

  if (desired.dc === sf_heading.dc && desired.dr === sf_heading.dr) return;

  // Only rotate 90° (never 180°).
  if (desired.dc === -sf_heading.dc && desired.dr === -sf_heading.dr) return;

  // Safety: reject if the rotation would self-collide next cell.
  const nc = (head.c + desired.dc + sf_cols) % sf_cols;
  const nr = (head.r + desired.dr + sf_rows) % sf_rows;
  // Don't include the tail cell — it'll move out on this tick.
  const limit = sf_snake.length - 1;
  for (let i = 0; i < limit; i++) {
    if (sf_snake[i].c === nc && sf_snake[i].r === nr) return;
  }

  sf_heading = desired;
}

function shortestDelta(raw, modulus) {
  // Map to [-mod/2, mod/2] so wrap distances are honoured.
  let d = raw % modulus;
  if (d >  modulus / 2) d -= modulus;
  if (d < -modulus / 2) d += modulus;
  return d;
}

function spawnPellet() {
  // Try random cells; fall back to exhaustive scan if the snake is huge.
  const total = sf_cols * sf_rows;
  for (let attempt = 0; attempt < 80; attempt++) {
    const c = Math.floor(Math.random() * sf_cols);
    const r = Math.floor(Math.random() * sf_rows);
    if (!cellOnSnake(c, r)) { sf_pellet = { c, r }; return; }
  }
  for (let r = 0; r < sf_rows; r++) {
    for (let c = 0; c < sf_cols; c++) {
      if (!cellOnSnake(c, r)) { sf_pellet = { c, r }; return; }
    }
  }
  // Board is full — trigger win/over.
  sf_state = 'over';
  sf_pellet = sf_pellet || { c: 0, r: 0 };
  // Ensure total-tiles stat caps the possible score for realism
  if (sf_snake.length >= total) sf_state = 'over';
}

function cellOnSnake(c, r) {
  for (let i = 0; i < sf_snake.length; i++) {
    if (sf_snake[i].c === c && sf_snake[i].r === r) return true;
  }
  return false;
}

// ---- Rendering ------------------------------------------------------------

function drawSceneBackground() {
  const S = window.BGShared || {};
  const P = (S.PALETTE) || { ink: '#0a0614', deepPurple: '#3b1f5a' };
  if (S.fillVerticalGradient) {
    S.fillVerticalGradient(0, 0, width, height, P.deepPurple, P.ink);
  } else {
    background(10, 8, 22);
  }
}

function drawPlayField(med) {
  const S = window.BGShared || {};
  const P = (S.PALETTE) || {
    chromeGrey: '#c0c0c0', deepPurple: '#3b1f5a', acidYellow: '#f7d51d',
    neonPink: '#ff4aa0', crtGreen: '#6cff83', shadow: '#1a0f2e'
  };

  const fx = 0;
  const fy = sf_playTop;
  const fw = sf_cols * sf_cellPx;
  const fh = sf_rows * sf_cellPx;

  // Dark inner field
  noStroke();
  fill(P.shadow);
  rect(fx, fy, fw, fh);

  // Subtle grid hatch
  stroke(0, 0, 0, 80);
  strokeWeight(1);
  for (let c = 1; c < sf_cols; c++) {
    const x = fx + c * sf_cellPx;
    line(x, fy, x, fy + fh);
  }
  for (let r = 1; r < sf_rows; r++) {
    const y = fy + r * sf_cellPx;
    line(fx, y, fx + fw, y);
  }
  noStroke();

  // Pellet — pulsing acidYellow square with neonPink core
  const pulse = 0.5 + 0.5 * Math.sin(millis() * 0.008);
  const pcx = fx + sf_pellet.c * sf_cellPx + sf_cellPx / 2;
  const pcy = fy + sf_pellet.r * sf_cellPx + sf_cellPx / 2;
  fill(P.acidYellow);
  rect(pcx - sf_cellPx * 0.42, pcy - sf_cellPx * 0.42, sf_cellPx * 0.84, sf_cellPx * 0.84, 3);
  fill(P.neonPink);
  const core = sf_cellPx * (0.28 + 0.12 * pulse);
  rect(pcx - core / 2, pcy - core / 2, core, core, 2);

  // Snake — head = crtGreen, body = chromeGrey with meditation-driven glow
  // Meditation modulates a soft halo alpha (0..110).
  const glowA = Math.floor(30 + med * 80);
  for (let i = sf_snake.length - 1; i >= 0; i--) {
    const seg = sf_snake[i];
    const x = fx + seg.c * sf_cellPx;
    const y = fy + seg.r * sf_cellPx;
    // Halo
    noStroke();
    fill(108, 255, 131, glowA);
    rect(x - 2, y - 2, sf_cellPx + 4, sf_cellPx + 4, 4);
    // Body / head
    if (i === 0) {
      fill(P.crtGreen);
    } else {
      // Segment shade cycles gently for a 90s chrome feel
      const t = i / Math.max(1, sf_snake.length - 1);
      fill(lerpColor(color(P.crtGreen), color(P.chromeGrey), t));
    }
    rect(x + 1, y + 1, sf_cellPx - 2, sf_cellPx - 2, 3);
  }

  // Field frame — pixel border
  if (S.drawPixelBorder) {
    S.drawPixelBorder(fx, fy, fw, fh, P.chromeGrey, P.neonPink);
  } else {
    noFill();
    stroke(P.chromeGrey);
    strokeWeight(2);
    rect(fx, fy, fw, fh);
    noStroke();
  }
}

function drawHud(eeg, alpha, beta, att) {
  const S = window.BGShared || {};
  const P = (S.PALETTE) || {
    chromeGrey: '#c0c0c0', acidYellow: '#f7d51d', neonPink: '#ff4aa0', crtGreen: '#6cff83'
  };

  // Top strip with attention meter + score
  if (S.drawTopHud) {
    S.drawTopHud({ eeg, score: sf_score });
  }

  // Right-side vertical stack of mapping bars on the field background area.
  const barX = width - 178;
  let barY = sf_playTop + 10;
  const barW = 168;
  const barH = 12;

  // Label group background
  noStroke();
  fill(0, 0, 0, 140);
  rect(barX - 8, barY - 8, barW + 16, 132, 6);

  if (S.drawBar) {
    S.drawBar(barX, barY,                  barW, barH, alpha, 'alpha (assist)', P.neonPink);
    S.drawBar(barX, barY + 34,             barW, barH, beta,  'beta (speed)',   P.acidYellow);
    S.drawBar(barX, barY + 68,             barW, barH, att,   'attention (x2)', P.crtGreen);
  }

  // Tick-rate readout
  fill(P.chromeGrey);
  textAlign(LEFT, TOP);
  textSize(10);
  text('tick ' + sf_ticksPerSec.toFixed(1) + '/s   len ' + sf_snake.length, barX, barY + 100);

  // 2x-eat flash
  if (millis() - sf_doublePulse < 700) {
    const a = Math.max(0, 1 - (millis() - sf_doublePulse) / 700);
    fill(P.crtGreen);
    textAlign(CENTER, CENTER);
    textSize(22 + 8 * a);
    text('x2 FOCUS!', width / 2, sf_playTop + 40);
  }
}

function drawIntroOverlay() {
  const S = window.BGShared || {};
  const P = (S.PALETTE) || { neonPink: '#ff4aa0', acidYellow: '#f7d51d', crtGreen: '#6cff83' };

  // Frames remaining until auto-start (60fps approx for the bar).
  const remaining = Math.max(0, SF_INTRO_MS - (millis() - sf_introStartMs));
  const framesRemaining = Math.ceil(remaining / (1000 / 60));
  const totalFrames     = Math.ceil(SF_INTRO_MS / (1000 / 60));

  if (S.drawIntroPanel) {
    S.drawIntroPanel({
      title: 'SNAKE FEAST',
      blurb: 'Arrows or WASD to steer. Eat pellets to grow. Self-collision ends the feast. Walls wrap around.',
      mappings: [
        { label: 'alpha',      desc: 'calm brain nudges the snake toward the nearest pellet (assistive only)', color: P.neonPink },
        { label: 'beta',       desc: 'sets the tick rate from 5 up to 18 moves per second',                    color: P.acidYellow },
        { label: 'attention',  desc: 'above 0.6 at eat-time doubles the pellet score',                         color: P.crtGreen }
      ],
      introTimer: framesRemaining,
      introTotalFrames: totalFrames,
      startHint: 'PRESS SPACE TO BEGIN'
    });
  } else {
    fill(0, 0, 0, 190);
    rect(40, 40, width - 80, height - 80, 10);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(28);
    text('SNAKE FEAST', width / 2, height / 2);
  }
}

function drawSummaryOverlay() {
  const S = window.BGShared || {};
  const P = (S.PALETTE) || { acidYellow: '#f7d51d', crtGreen: '#6cff83', neonPink: '#ff4aa0' };
  const streakSecs = (sf_longestFocusFrames / 60).toFixed(1);
  const elapsed = Math.max(0, (millis() - sf_startedAtMs) / 1000);

  const message = chooseSummaryMessage();

  if (S.drawSummaryPanel) {
    S.drawSummaryPanel({
      title: 'FEAST OVER',
      stats: [
        { label: 'LENGTH',  value: sf_snake.length,            color: P.crtGreen },
        { label: 'SCORE',   value: sf_score,                   color: P.acidYellow },
        { label: 'STREAK',  value: streakSecs + 's',           color: P.neonPink },
        { label: 'TIME',    value: elapsed.toFixed(1) + 's',   color: '#ffffff' }
      ],
      message,
      restartHint: 'PRESS SPACE TO PLAY AGAIN'
    });
  } else {
    fill(0, 0, 0, 200);
    rect(40, 40, width - 80, height - 80, 10);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(28);
    text('FEAST OVER', width / 2, height / 2 - 30);
    textSize(16);
    text('score ' + sf_score + '  length ' + sf_snake.length, width / 2, height / 2);
    text('longest focus streak ' + streakSecs + 's', width / 2, height / 2 + 24);
    text('press space to play again', width / 2, height / 2 + 56);
  }
}

function chooseSummaryMessage() {
  const streakSecs = sf_longestFocusFrames / 60;
  if (sf_score === 0) return 'A shaky start. Settle in and try again.';
  if (streakSecs >= 8) return 'Deep focus sustained — your attention stayed locked through the feast.';
  if (streakSecs >= 4) return 'Good rhythm. Hold your attention a little longer for x2 pellets.';
  return 'Keep your attention above 0.6 when eating to double your score.';
}

function drawScanlines() {
  const S = window.BGShared || {};
  if (S.drawScanlineOverlay) {
    S.drawScanlineOverlay({ alpha: 26, spacing: 3 });
  }
}

// ---- Utilities ------------------------------------------------------------

function readEEGSafe() {
  const S = window.BGShared || {};
  if (S.readEEG) return S.readEEG();
  const d = (typeof window !== 'undefined' && window.eegData) ? window.eegData : {};
  return {
    attention:  num(d.attention),
    meditation: num(d.meditation),
    delta:      num(d.delta),
    theta:      num(d.theta),
    alpha:      num(d.alpha),
    beta:       num(d.beta),
    gamma:      num(d.gamma),
    connected:  d.connected === true
  };
}

function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }
function clamp01(v) { if (v < 0) return 0; if (v > 1) return 1; return v; }

// Fallback smoother used only if BGShared failed to load (should not happen
// in the runner, but keeps the game usable for standalone inspection).
function fallbackSmoother(n) {
  const buf = [];
  const size = Math.max(1, n | 0);
  return {
    push(v) {
      const x = (typeof v === 'number' && isFinite(v)) ? v : 0;
      buf.push(x);
      if (buf.length > size) buf.shift();
      return this.value();
    },
    value() {
      if (buf.length === 0) return 0;
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i];
      return s / buf.length;
    },
    history() { return buf.slice(); },
    clear() { buf.length = 0; },
    size() { return size; }
  };
}
