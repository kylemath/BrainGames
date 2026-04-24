/**
 * @id Brainvaders
 * @title Brainvaders
 * @category Brain Games
 * @order 40
 * @newGame true
 *
 * EEG mappings:
 *   beta       -> cannon fire-rate (cooldown 900ms..120ms)
 *   attention  -> aim precision: >= 0.60 fires a 3-shot spread, otherwise single shot
 *   meditation -> shield regen (charges while > 0.55, absorbs one alien laser)
 *   alpha      -> cosmetic CRT scanline intensity (subtle visual pulse, no mechanical effect)
 */

// ============================================================
// Global state
// ============================================================
let gameState = "intro";   // intro | playing | over | win
let introTimer = 300;
const INTRO_TOTAL = 300;

// Alien grid
const ROWS = 5;
const COLS = 8;
let aliens = [];
let formationDX = 0;
let formationDY = 0;
let marchDir = 1;
let lastMarchMs = 0;
let marchInterval = 700;

let gridStartX = 0;
let gridStartY = 0;
let cellW = 60;
const CELL_H = 44;

// Tier point values (row 0 = back = most points)
const TIER_POINTS = [40, 30, 20, 20, 10];

// Player
const PLAYER_W = 52;
const PLAYER_H = 22;
let playerX = 0;
let playerY = 0;
const PLAYER_SPEED = 7;
let moveLeft = false;
let moveRight = false;

// Projectiles
let shots = [];         // player bullets { x, y, vx, vy, w, h }
let enemyShots = [];    // alien lasers { x, y, vy, w, h }
let lastShotMs = 0;
let lastEnemyShotMs = 0;

// Lives / score / combo
let lives = 3;
let score = 0;
let combo = 0;
let bestCombo = 0;
let wave = 1;
let shotsFired = 0;
let alienKills = 0;

// Shield
let shieldCharge = 0;   // 0..1, absorbs one laser when at 1.0
let shieldFlash = 0;

// Effects
let explosions = [];    // { x, y, t, col }
let cannonFlash = 0;
let screenShake = 0;

// Smoothers
let smBeta = null;
let smAtt = null;
let smMed = null;
let smAlpha = null;

// Cached EEG values (set each frame)
let eeg = { beta: 0, attention: 0, meditation: 0, alpha: 0 };
let sBeta = 0, sAtt = 0, sMed = 0, sAlpha = 0;

// ============================================================
// Setup / reset
// ============================================================
function setup() {
  createCanvas(windowWidth, windowHeight - 48);
  const BG = window.BGShared || {};
  if (BG.makeSmoother) {
    smBeta = BG.makeSmoother(20);
    smAtt = BG.makeSmoother(20);
    smMed = BG.makeSmoother(20);
    smAlpha = BG.makeSmoother(20);
  }
  resetSession();
}

function resetSession() {
  lives = 3;
  score = 0;
  combo = 0;
  bestCombo = 0;
  wave = 1;
  shotsFired = 0;
  alienKills = 0;
  shieldCharge = 0;
  shieldFlash = 0;
  shots = [];
  enemyShots = [];
  explosions = [];
  cannonFlash = 0;
  screenShake = 0;
  introTimer = INTRO_TOTAL;
  gameState = "intro";
  playerX = width / 2;
  playerY = height - 70;
  spawnWave(1);
}

function spawnWave(w) {
  aliens = [];
  const gridW = Math.min(width * 0.80, 680);
  cellW = gridW / COLS;
  gridStartX = (width - gridW) / 2;
  gridStartY = 70 + (w - 1) * 26;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      aliens.push({
        col: c,
        row: r,
        alive: true,
        tier: r,
        pts: TIER_POINTS[r]
      });
    }
  }
  formationDX = 0;
  formationDY = 0;
  marchDir = 1;
  lastMarchMs = millis();
  lastEnemyShotMs = millis();
  marchInterval = Math.max(260, 720 - (w - 1) * 90);
}

// ============================================================
// Input
// ============================================================
function keyPressed() {
  if (keyCode === LEFT_ARROW || key === "a" || key === "A") moveLeft = true;
  if (keyCode === RIGHT_ARROW || key === "d" || key === "D") moveRight = true;

  if (gameState === "intro" && introTimer <= 0) {
    if (keyCode === 32 || keyCode === ENTER) {
      gameState = "playing";
      lastMarchMs = millis();
      lastEnemyShotMs = millis();
    }
  } else if (gameState === "playing") {
    if (keyCode === 32) tryFire();
  } else if (gameState === "over" || gameState === "win") {
    if (keyCode === 32 || keyCode === ENTER) {
      resetSession();
    }
  }
}

function keyReleased() {
  if (keyCode === LEFT_ARROW || key === "a" || key === "A") moveLeft = false;
  if (keyCode === RIGHT_ARROW || key === "d" || key === "D") moveRight = false;
}

// ============================================================
// EEG read + smoothing
// ============================================================
function readSmoothEEG() {
  const BG = window.BGShared || {};
  const src = (BG.readEEG) ? BG.readEEG({}) : (window.eegData || {});
  eeg.beta       = typeof src.beta       === "number" ? src.beta       : 0;
  eeg.attention  = typeof src.attention  === "number" ? src.attention  : 0;
  eeg.meditation = typeof src.meditation === "number" ? src.meditation : 0;
  eeg.alpha      = typeof src.alpha      === "number" ? src.alpha      : 0;

  if (smBeta)  sBeta  = smBeta.push(eeg.beta);       else sBeta  = eeg.beta;
  if (smAtt)   sAtt   = smAtt.push(eeg.attention);   else sAtt   = eeg.attention;
  if (smMed)   sMed   = smMed.push(eeg.meditation);  else sMed   = eeg.meditation;
  if (smAlpha) sAlpha = smAlpha.push(eeg.alpha);     else sAlpha = eeg.alpha;
}

function fireCooldownMs() {
  // beta 0 -> 900ms, beta 1 -> 120ms
  const b = Math.max(0, Math.min(1, sBeta));
  return 900 - b * (900 - 120);
}

// ============================================================
// Firing
// ============================================================
function tryFire() {
  const now = millis();
  const cd = fireCooldownMs();
  if (now - lastShotMs < cd) return;
  lastShotMs = now;
  cannonFlash = 8;

  // High attention -> 3-shot spread
  const spread = sAtt >= 0.60;
  const baseVy = -10;
  const x = playerX;
  const y = playerY - PLAYER_H;

  if (spread) {
    shots.push({ x: x, y: y, vx: 0,    vy: baseVy, w: 4, h: 12 });
    shots.push({ x: x, y: y, vx: -1.8, vy: baseVy, w: 4, h: 12 });
    shots.push({ x: x, y: y, vx:  1.8, vy: baseVy, w: 4, h: 12 });
    shotsFired += 3;
  } else {
    shots.push({ x: x, y: y, vx: 0, vy: baseVy, w: 4, h: 12 });
    shotsFired += 1;
  }
}

// ============================================================
// Update
// ============================================================
function update() {
  // Player movement
  if (moveLeft)  playerX -= PLAYER_SPEED;
  if (moveRight) playerX += PLAYER_SPEED;
  playerX = Math.max(PLAYER_W / 2 + 6, Math.min(width - PLAYER_W / 2 - 6, playerX));

  // Shield regen (meditation > 0.55)
  if (sMed > 0.55 && shieldCharge < 1) {
    // ~4 seconds to full at high meditation
    shieldCharge += 0.0055 * (sMed - 0.55) / 0.45;
    if (shieldCharge > 1) shieldCharge = 1;
  }

  // March formation using fixed-step deltas
  const now = millis();
  const aliveCount = countAlive();
  if (aliveCount > 0) {
    // March pace speeds up as aliens die
    const paceScale = Math.max(0.25, aliveCount / (ROWS * COLS));
    const curInterval = Math.max(120, marchInterval * paceScale);
    if (now - lastMarchMs >= curInterval) {
      lastMarchMs = now;
      stepMarch();
    }
  }

  // Update player shots
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.x += s.vx;
    s.y += s.vy;
    if (s.y < -20 || s.x < -20 || s.x > width + 20) {
      shots.splice(i, 1);
      combo = 0; // missed (projectile left screen without hit)
    }
  }

  // Alien fire: random live alien fires every ~900-1800ms
  const fireDelay = 1800 - Math.min(1200, (ROWS * COLS - aliveCount) * 40);
  if (now - lastEnemyShotMs > fireDelay && aliveCount > 0 && gameState === "playing") {
    lastEnemyShotMs = now;
    alienFire();
  }

  // Update enemy shots
  for (let i = enemyShots.length - 1; i >= 0; i--) {
    const s = enemyShots[i];
    s.y += s.vy;
    if (s.y > height + 20) {
      enemyShots.splice(i, 1);
      continue;
    }
    // Player collision
    if (rectsOverlap(
          s.x - s.w / 2, s.y - s.h / 2, s.w, s.h,
          playerX - PLAYER_W / 2, playerY - PLAYER_H, PLAYER_W, PLAYER_H)) {
      enemyShots.splice(i, 1);
      if (shieldCharge >= 1) {
        shieldCharge = 0;
        shieldFlash = 18;
      } else {
        lives--;
        screenShake = 12;
        if (lives <= 0) {
          gameState = "over";
        }
      }
    }
  }

  // Collide player shots with aliens
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    let hit = false;
    for (let j = 0; j < aliens.length; j++) {
      const a = aliens[j];
      if (!a.alive) continue;
      const r = alienRect(a);
      if (rectsOverlap(
            s.x - s.w / 2, s.y - s.h / 2, s.w, s.h,
            r.x, r.y, r.w, r.h)) {
        a.alive = false;
        hit = true;
        alienKills++;
        combo++;
        if (combo > bestCombo) bestCombo = combo;
        let pts = a.pts;
        if (combo >= 3) pts = Math.round(pts * 1.5);
        score += pts;
        explosions.push({ x: r.cx, y: r.cy, t: 18, col: TIER_COL(a.tier) });
        break;
      }
    }
    if (hit) shots.splice(i, 1);
  }

  // Check win (all aliens dead)
  if (countAlive() === 0 && gameState === "playing") {
    wave++;
    spawnWave(wave);
  }

  // Check lose by formation reaching player
  for (let j = 0; j < aliens.length; j++) {
    const a = aliens[j];
    if (!a.alive) continue;
    const r = alienRect(a);
    if (r.y + r.h >= playerY - PLAYER_H) {
      gameState = "over";
      break;
    }
  }

  // Decay effects
  if (cannonFlash > 0) cannonFlash--;
  if (shieldFlash > 0) shieldFlash--;
  if (screenShake > 0) screenShake--;
  for (let i = explosions.length - 1; i >= 0; i--) {
    explosions[i].t--;
    if (explosions[i].t <= 0) explosions.splice(i, 1);
  }
}

function stepMarch() {
  // Compute current bounds and determine if we'd exit
  let minX = Infinity, maxX = -Infinity;
  for (let j = 0; j < aliens.length; j++) {
    const a = aliens[j];
    if (!a.alive) continue;
    const r = alienRect(a);
    if (r.x < minX) minX = r.x;
    if (r.x + r.w > maxX) maxX = r.x + r.w;
  }
  const step = 14;
  const leftBound = 20;
  const rightBound = width - 20;
  const proposedDX = formationDX + marchDir * step;
  // Test against bounds
  if (marchDir > 0 && (maxX + step) > rightBound) {
    marchDir = -1;
    formationDY += 22;
  } else if (marchDir < 0 && (minX - step) < leftBound) {
    marchDir = 1;
    formationDY += 22;
  } else {
    formationDX = proposedDX;
  }
}

function alienFire() {
  // Pick a column at random among columns that have at least one alive alien;
  // use the front-most (highest row) alien in that column as the shooter.
  const liveByCol = {};
  for (let j = 0; j < aliens.length; j++) {
    const a = aliens[j];
    if (!a.alive) continue;
    if (!liveByCol[a.col] || a.row > liveByCol[a.col].row) liveByCol[a.col] = a;
  }
  const cols = Object.keys(liveByCol);
  if (cols.length === 0) return;
  const shooter = liveByCol[cols[Math.floor(Math.random() * cols.length)]];
  const r = alienRect(shooter);
  enemyShots.push({ x: r.cx, y: r.cy + r.h / 2 + 4, vy: 5.4, w: 5, h: 14 });
}

function countAlive() {
  let n = 0;
  for (let j = 0; j < aliens.length; j++) if (aliens[j].alive) n++;
  return n;
}

function alienRect(a) {
  const cx = gridStartX + a.col * cellW + cellW / 2 + formationDX;
  const cy = gridStartY + a.row * CELL_H + CELL_H / 2 + formationDY;
  const w = cellW * 0.58;
  const h = CELL_H * 0.56;
  return { cx: cx, cy: cy, x: cx - w / 2, y: cy - h / 2, w: w, h: h };
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return !(ax + aw < bx || bx + bw < ax || ay + ah < by || by + bh < ay);
}

function TIER_COL(t) {
  const BG = window.BGShared || {};
  const P = BG.PALETTE || {};
  switch (t) {
    case 0: return P.neonPink   || "#ff4aa0";
    case 1: return P.acidYellow || "#f7d51d";
    case 2: return P.crtGreen   || "#6cff83";
    case 3: return P.crtGreen   || "#6cff83";
    default: return P.chromeGrey || "#c0c0c0";
  }
}

// ============================================================
// Draw
// ============================================================
function draw() {
  readSmoothEEG();
  if (gameState === "playing") update();

  // Background: deep purple gradient
  const BG = window.BGShared || {};
  const P = (BG.PALETTE) || {
    deepPurple: "#3b1f5a", acidYellow: "#f7d51d", neonPink: "#ff4aa0",
    crtGreen: "#6cff83", chromeGrey: "#c0c0c0", ink: "#0a0614",
    shadow: "#1a0f2e", dim: "#8a7ba8"
  };
  if (BG.fillVerticalGradient) {
    BG.fillVerticalGradient(0, 0, width, height, P.ink, P.deepPurple);
  } else {
    background(10, 6, 30);
  }

  // Starfield (cheap)
  drawStars();

  // Screen shake offset
  push();
  if (screenShake > 0) {
    translate(random(-screenShake, screenShake) * 0.4,
              random(-screenShake, screenShake) * 0.4);
  }

  if (gameState === "intro") {
    drawPlayfield(P);
    drawIntro(P);
  } else if (gameState === "playing") {
    drawPlayfield(P);
    drawHUD(P);
  } else if (gameState === "over") {
    drawPlayfield(P);
    drawSummary(P, false);
  }

  pop();

  // Scanline overlay (last) with optional alpha-driven pulse
  if (BG.drawScanlineOverlay) {
    const scanA = 34 + Math.round(Math.max(0, Math.min(1, sAlpha)) * 30);
    BG.drawScanlineOverlay({ alpha: scanA, spacing: 3 });
  }

  // Outer pixel border frame
  if (BG.drawPixelBorder) BG.drawPixelBorder(2, 2, width - 4, height - 4);

  if (introTimer > 0 && gameState === "intro") introTimer--;
}

function drawStars() {
  // Deterministic starfield using frameCount modulation
  noStroke();
  fill(255, 255, 255, 40);
  for (let i = 0; i < 40; i++) {
    const sx = (i * 83.17 % width);
    const sy = (i * 47.91 % height);
    const s = (i % 3 === 0) ? 2 : 1;
    rect(sx, sy, s, s);
  }
  // Twinkle layer
  fill(255, 255, 255, 90);
  const tw = (frameCount * 0.7) % width;
  rect(tw, ((frameCount * 1.3) % height), 2, 2);
}

function drawPlayfield(P) {
  // Aliens
  for (let j = 0; j < aliens.length; j++) {
    const a = aliens[j];
    if (!a.alive) continue;
    drawAlien(a, P);
  }

  // Player
  drawPlayer(P);

  // Player shots
  noStroke();
  fill(P.acidYellow);
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    rect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
  }

  // Enemy shots
  fill(P.neonPink);
  for (let i = 0; i < enemyShots.length; i++) {
    const s = enemyShots[i];
    rect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
  }

  // Explosions
  for (let i = 0; i < explosions.length; i++) {
    const e = explosions[i];
    const k = e.t;
    noStroke();
    fill(e.col);
    const rad = (18 - k) * 2 + 6;
    rect(e.x - rad / 2, e.y - 2, rad, 4);
    rect(e.x - 2, e.y - rad / 2, 4, rad);
    // Diagonal pixels for chunk
    rect(e.x - rad / 2, e.y - rad / 2, 4, 4);
    rect(e.x + rad / 2 - 4, e.y + rad / 2 - 4, 4, 4);
  }

  // Shield visual at player (pixel arc)
  if (shieldCharge > 0.01) {
    const arcY = playerY - PLAYER_H - 6;
    noFill();
    const alpha = shieldFlash > 0 ? 255 : 90 + shieldCharge * 160;
    stroke(108, 255, 131, alpha);
    strokeWeight(2);
    // Draw a pixelated arc as series of short segments
    const wpx = PLAYER_W + 18;
    const segs = 14;
    const seenFrac = shieldCharge;
    const shown = Math.max(1, Math.floor(segs * seenFrac));
    for (let i = 0; i < shown; i++) {
      const t = i / (segs - 1);
      const ax = playerX - wpx / 2 + t * wpx;
      const ay = arcY - Math.sin(t * Math.PI) * 10;
      rect(ax, ay, 3, 3);
    }
    strokeWeight(1);
    noStroke();
  }
}

function drawAlien(a, P) {
  const r = alienRect(a);
  const bob = (Math.floor(frameCount / 18) % 2 === 0) ? 0 : 2;
  const col = TIER_COL(a.tier);
  noStroke();
  fill(col);
  // Body
  rect(r.x + 4, r.y + 2 + bob, r.w - 8, r.h - 8);
  // Antennae / arms (rows 0-2 = classic invader, row 3-4 = squat)
  if (a.tier <= 1) {
    rect(r.x + 2, r.y + 8 + bob, 4, 8);
    rect(r.x + r.w - 6, r.y + 8 + bob, 4, 8);
    rect(r.x + r.w / 2 - 2, r.y - 2 + bob, 4, 4);
  } else if (a.tier === 2) {
    rect(r.x, r.y + r.h / 2 + bob, 4, 6);
    rect(r.x + r.w - 4, r.y + r.h / 2 + bob, 4, 6);
  } else {
    rect(r.x + r.w / 2 - 6, r.y + r.h - 4 + bob, 4, 4);
    rect(r.x + r.w / 2 + 2, r.y + r.h - 4 + bob, 4, 4);
  }
  // Eyes (dark ink)
  fill(P.ink);
  rect(r.x + 8, r.y + 8 + bob, 4, 4);
  rect(r.x + r.w - 12, r.y + 8 + bob, 4, 4);
}

function drawPlayer(P) {
  const x = playerX - PLAYER_W / 2;
  const y = playerY - PLAYER_H;
  noStroke();
  // Base
  fill(P.chromeGrey);
  rect(x, y + PLAYER_H - 8, PLAYER_W, 8);
  // Body
  fill(P.crtGreen);
  rect(x + 6, y + 6, PLAYER_W - 12, PLAYER_H - 12);
  // Cannon
  fill(P.acidYellow);
  rect(playerX - 3, y - 6, 6, 8);
  // Cannon flash
  if (cannonFlash > 0) {
    fill(P.neonPink);
    rect(playerX - 5, y - 12, 10, 6);
  }
  // Chrome trim
  fill(P.highlight || "#ffffff");
  rect(x, y + PLAYER_H - 10, PLAYER_W, 2);
}

function drawHUD(P) {
  const BG = window.BGShared || {};
  if (BG.drawTopHud) {
    BG.drawTopHud({
      eeg: { attention: sAtt, meditation: sMed },
      score: score,
      palette: P
    });
  }

  // Right side info row just below HUD
  const infoY = 42;
  fill(P.neonPink);
  textAlign(LEFT, TOP);
  textSize(12);
  text("LIVES " + lives, 10, infoY);
  fill(P.acidYellow);
  text("WAVE " + wave, 120, infoY);
  fill(P.crtGreen);
  text("COMBO " + combo, 220, infoY);

  // Shield bar (bottom-left)
  if (BG.drawBar) {
    BG.drawBar(16, height - 28, 180, 10, shieldCharge, "SHIELD", P.crtGreen);
  }

  // Fire rate indicator (bottom-right, beta driven)
  const cd = fireCooldownMs();
  const cdFrac = 1 - ((cd - 120) / (900 - 120)); // 1 = fast
  if (BG.drawBar) {
    BG.drawBar(width - 200, height - 28, 180, 10, cdFrac, "FIRE RATE", P.neonPink);
  }

  // Attention threshold indicator
  fill(sAtt >= 0.60 ? P.acidYellow : P.dim);
  textAlign(CENTER, TOP);
  textSize(10);
  text(sAtt >= 0.60 ? "SPREAD SHOT" : "SINGLE SHOT", width / 2, height - 22);
}

function drawIntro(P) {
  const BG = window.BGShared || {};
  if (BG.drawIntroPanel) {
    BG.drawIntroPanel({
      title: "BRAINVADERS",
      blurb: "A wave of neuro-invaders descends. Pilot your cannon with ARROWS or A/D, " +
             "fire with SPACE. Your brainwaves tune the ship: focus sharpens your aim, " +
             "calm recharges your shield, fast-thinking beta rips the trigger faster.",
      mappings: [
        { label: "BETA  -> Fire Rate",
          desc:  "Cannon cooldown shrinks from 900ms to 120ms. High beta = rapid fire.",
          color: P.neonPink },
        { label: "ATTENTION -> Spread Shot",
          desc:  "Sustain attention >= 0.60 to fire a 3-shot spread; otherwise single bolt.",
          color: P.acidYellow },
        { label: "MEDITATION -> Shield Charge",
          desc:  "Calm above 0.55 charges a bottom shield; absorbs one alien laser.",
          color: P.crtGreen },
        { label: "ALPHA -> CRT Scanlines",
          desc:  "Cosmetic. Higher alpha pulses the scanline overlay intensity.",
          color: P.chromeGrey }
      ],
      introTimer: introTimer,
      introTotalFrames: INTRO_TOTAL,
      startHint: "PRESS SPACE OR ENTER TO LAUNCH"
    });
  }
}

function drawSummary(P, winFlag) {
  const BG = window.BGShared || {};
  const title = winFlag ? "VICTORY" : "GAME OVER";
  const acc = shotsFired > 0 ? Math.round((alienKills / shotsFired) * 100) : 0;
  if (BG.drawSummaryPanel) {
    BG.drawSummaryPanel({
      title: title,
      stats: [
        { label: "SCORE",      value: score,          color: P.acidYellow },
        { label: "WAVE",       value: wave,           color: P.neonPink },
        { label: "KILLS",      value: alienKills,     color: P.crtGreen },
        { label: "BEST COMBO", value: bestCombo,      color: P.neonPink },
        { label: "ACCURACY",   value: acc + "%",      color: P.chromeGrey }
      ],
      message: "The invaders breached your orbit. Deep breaths recharge the shield; " +
               "sharpen focus for spread shots; ride the beta rush for rapid fire.",
      restartHint: "PRESS SPACE OR ENTER TO REDEPLOY"
    });
  }
}
