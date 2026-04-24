/**
 * @id ZenBreakout
 * @title Zen Breakout
 * @category Brain Games
 * @order 35
 * @newGame true
 *
 * EEG mappings:
 *   meditation -> paddle width (72px..196px, smoothed ~1s, ~30-frame rolling avg)
 *   beta       -> ball speed (240..620 px/s, smoothed ~20-frame rolling avg)
 *   attention  -> cyan afterimage trail + crit-break chance (2x points on random
 *                 bricks when attention > 0.65)
 *
 * Paddle: LEFT/RIGHT arrows or A/D. SPACE launches the ball from the paddle.
 */

let ZB_state = "intro";
let ZB_introTimer = 300;
let ZB_introTotal = 300;

let ZB_medSmoother = null;
let ZB_betaSmoother = null;

let ZB_paddle = { x: 0, y: 0, w: 120, h: 14, vx: 0 };
let ZB_ball = { x: 0, y: 0, r: 9, vx: 0, vy: 0, stuck: true, trail: [] };

let ZB_bricks = [];
let ZB_brickRows = 5;
let ZB_brickCols = 10;
let ZB_brickGap = 4;
let ZB_brickTopY = 80;
let ZB_brickFieldH = 130;

let ZB_lives = 3;
let ZB_score = 0;
let ZB_wave = 1;
let ZB_waveBaseSpeed = 240;
let ZB_remaining = 0;

let ZB_prevMillis = 0;

let ZB_leftDown = false;
let ZB_rightDown = false;

let ZB_flashTimer = 0;
let ZB_flashText = "";

function setup() {
  createCanvas(windowWidth, windowHeight - 48);
  textFont("monospace");
  noSmooth();

  if (window.BGShared && window.BGShared.makeSmoother) {
    ZB_medSmoother = window.BGShared.makeSmoother(30);
    ZB_betaSmoother = window.BGShared.makeSmoother(20);
  }

  ZB_resetGame();
  ZB_prevMillis = millis();
}

function ZB_resetGame() {
  ZB_lives = 3;
  ZB_score = 0;
  ZB_wave = 1;
  ZB_waveBaseSpeed = 240;
  ZB_paddle.w = 120;
  ZB_paddle.h = 14;
  ZB_paddle.x = width / 2;
  ZB_paddle.y = height - 54;
  ZB_buildBricks();
  ZB_respawnBall();
}

function ZB_buildBricks() {
  ZB_bricks = [];
  const cols = ZB_brickCols + Math.min(4, Math.floor((ZB_wave - 1) / 2));
  const rows = Math.min(8, ZB_brickRows + Math.floor((ZB_wave - 1) / 3));
  const fieldPadX = 40;
  const fieldW = width - fieldPadX * 2;
  const bw = (fieldW - (cols - 1) * ZB_brickGap) / cols;
  const bh = 22;
  const pal = ZB_palette();
  const rowColors = [pal.neonPink, pal.acidYellow, pal.crtGreen, pal.chromeGrey, pal.deepPurple, pal.neonPink, pal.acidYellow, pal.crtGreen];
  const rowPoints = [50, 40, 30, 20, 10, 8, 6, 4];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ZB_bricks.push({
        x: fieldPadX + c * (bw + ZB_brickGap),
        y: ZB_brickTopY + r * (bh + ZB_brickGap),
        w: bw,
        h: bh,
        alive: true,
        color: rowColors[r % rowColors.length],
        points: rowPoints[r % rowPoints.length]
      });
    }
  }
  ZB_brickCols = 10;
  ZB_remaining = ZB_bricks.length;
  ZB_brickFieldH = rows * (bh + ZB_brickGap);
}

function ZB_respawnBall() {
  ZB_ball.x = ZB_paddle.x;
  ZB_ball.y = ZB_paddle.y - ZB_paddle.h / 2 - ZB_ball.r - 2;
  ZB_ball.vx = 0;
  ZB_ball.vy = 0;
  ZB_ball.stuck = true;
  ZB_ball.trail = [];
}

function ZB_launchBall(baseSpeed) {
  const angle = random(-PI / 3, -PI * 2 / 3);
  const s = baseSpeed;
  ZB_ball.vx = Math.cos(angle) * s;
  ZB_ball.vy = Math.sin(angle) * s;
  ZB_ball.stuck = false;
}

function draw() {
  const now = millis();
  let dt = (now - ZB_prevMillis) / 1000;
  ZB_prevMillis = now;
  if (!isFinite(dt) || dt < 0) dt = 0;
  if (dt > 0.05) dt = 0.05;

  const eeg = (window.BGShared && window.BGShared.readEEG)
    ? window.BGShared.readEEG()
    : { attention: 0, meditation: 0, beta: 0 };

  const medRaw = typeof eeg.meditation === "number" ? eeg.meditation : 0;
  const betaRaw = typeof eeg.beta === "number" ? eeg.beta : 0;
  const attRaw = typeof eeg.attention === "number" ? eeg.attention : 0;

  let medSm = medRaw;
  let betaSm = betaRaw;
  if (ZB_medSmoother) medSm = ZB_medSmoother.push(medRaw);
  if (ZB_betaSmoother) betaSm = ZB_betaSmoother.push(betaRaw);

  ZB_drawBackground();

  if (ZB_state === "intro") {
    ZB_drawPlayfieldBackdrop();
    ZB_drawIntro();
  } else if (ZB_state === "play") {
    ZB_update(dt, medSm, betaSm, attRaw);
    ZB_drawPlayfield(medSm, betaSm, attRaw);
    ZB_drawHudOverlay(eeg, medSm, betaSm, attRaw);
  } else if (ZB_state === "over") {
    ZB_drawPlayfieldBackdrop();
    ZB_drawSummary();
  }

  if (window.BGShared && window.BGShared.drawScanlineOverlay) {
    window.BGShared.drawScanlineOverlay({ alpha: 34, spacing: 3 });
  }
}

function ZB_drawBackground() {
  const pal = ZB_palette();
  if (window.BGShared && window.BGShared.fillVerticalGradient) {
    window.BGShared.fillVerticalGradient(0, 0, width, height, pal.shadow, pal.ink);
  } else {
    background(10, 6, 20);
  }
}

function ZB_drawPlayfieldBackdrop() {
  const pal = ZB_palette();
  noStroke();
  fill(pal.ink);
  rect(24, 56, width - 48, height - 80, 8);
  if (window.BGShared && window.BGShared.drawPixelBorder) {
    window.BGShared.drawPixelBorder(24, 56, width - 48, height - 80, pal.chromeGrey, pal.deepPurple);
  }
}

function ZB_update(dt, medSm, betaSm, att) {
  const targetW = lerp(72, 196, constrain(medSm, 0, 1));
  ZB_paddle.w = lerp(ZB_paddle.w, targetW, 0.12);

  const paddleSpeed = 640;
  if (ZB_leftDown) ZB_paddle.x -= paddleSpeed * dt;
  if (ZB_rightDown) ZB_paddle.x += paddleSpeed * dt;
  ZB_paddle.x = constrain(ZB_paddle.x, 40 + ZB_paddle.w / 2, width - 40 - ZB_paddle.w / 2);
  ZB_paddle.y = height - 54;

  if (ZB_ball.stuck) {
    ZB_ball.x = ZB_paddle.x;
    ZB_ball.y = ZB_paddle.y - ZB_paddle.h / 2 - ZB_ball.r - 2;
    return;
  }

  const targetSpeed = 240 + constrain(betaSm, 0, 1) * 380 + (ZB_wave - 1) * 10;
  const cur = Math.sqrt(ZB_ball.vx * ZB_ball.vx + ZB_ball.vy * ZB_ball.vy) || 1;
  const k = targetSpeed / cur;
  ZB_ball.vx *= k;
  ZB_ball.vy *= k;

  ZB_ball.x += ZB_ball.vx * dt;
  ZB_ball.y += ZB_ball.vy * dt;

  if (att > 0.65) {
    ZB_ball.trail.push({ x: ZB_ball.x, y: ZB_ball.y, a: 180 });
    if (ZB_ball.trail.length > 24) ZB_ball.trail.shift();
  } else if (ZB_ball.trail.length > 0) {
    ZB_ball.trail.shift();
  }

  const leftWall = 32;
  const rightWall = width - 32;
  const topWall = 64;
  if (ZB_ball.x - ZB_ball.r < leftWall) {
    ZB_ball.x = leftWall + ZB_ball.r;
    ZB_ball.vx = Math.abs(ZB_ball.vx);
  } else if (ZB_ball.x + ZB_ball.r > rightWall) {
    ZB_ball.x = rightWall - ZB_ball.r;
    ZB_ball.vx = -Math.abs(ZB_ball.vx);
  }
  if (ZB_ball.y - ZB_ball.r < topWall) {
    ZB_ball.y = topWall + ZB_ball.r;
    ZB_ball.vy = Math.abs(ZB_ball.vy);
  }

  ZB_checkPaddleCollision();
  ZB_checkBrickCollisions(att);

  if (ZB_ball.y - ZB_ball.r > height) {
    ZB_lives--;
    ZB_flashText = "LIFE LOST";
    ZB_flashTimer = 60;
    if (ZB_lives <= 0) {
      ZB_state = "over";
    } else {
      ZB_respawnBall();
    }
  }

  if (ZB_remaining <= 0) {
    ZB_wave++;
    ZB_waveBaseSpeed += 20;
    ZB_flashText = "WAVE " + ZB_wave;
    ZB_flashTimer = 75;
    ZB_buildBricks();
    ZB_respawnBall();
  }

  if (ZB_flashTimer > 0) ZB_flashTimer--;
}

function ZB_checkPaddleCollision() {
  const p = ZB_paddle;
  const halfW = p.w / 2;
  const halfH = p.h / 2;
  const top = p.y - halfH;
  const ballBottom = ZB_ball.y + ZB_ball.r;
  if (ZB_ball.vy > 0 &&
      ballBottom >= top &&
      ZB_ball.y <= p.y &&
      ZB_ball.x >= p.x - halfW - ZB_ball.r &&
      ZB_ball.x <= p.x + halfW + ZB_ball.r) {
    ZB_ball.y = top - ZB_ball.r - 0.5;
    ZB_ball.vy = -Math.abs(ZB_ball.vy);
    const offset = (ZB_ball.x - p.x) / halfW;
    ZB_ball.vx += offset * 220;
    const curSpd = Math.sqrt(ZB_ball.vx * ZB_ball.vx + ZB_ball.vy * ZB_ball.vy) || 1;
    const maxSpd = 820;
    if (curSpd > maxSpd) {
      ZB_ball.vx *= maxSpd / curSpd;
      ZB_ball.vy *= maxSpd / curSpd;
    }
  }
}

function ZB_checkBrickCollisions(att) {
  for (let i = 0; i < ZB_bricks.length; i++) {
    const b = ZB_bricks[i];
    if (!b.alive) continue;
    const nx = ZB_ball.x;
    const ny = ZB_ball.y;
    const r = ZB_ball.r;
    if (nx + r < b.x) continue;
    if (nx - r > b.x + b.w) continue;
    if (ny + r < b.y) continue;
    if (ny - r > b.y + b.h) continue;

    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const dx = nx - cx;
    const dy = ny - cy;
    const overlapX = (b.w / 2 + r) - Math.abs(dx);
    const overlapY = (b.h / 2 + r) - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) continue;

    if (overlapX < overlapY) {
      ZB_ball.x += dx > 0 ? overlapX : -overlapX;
      ZB_ball.vx *= -1;
    } else {
      ZB_ball.y += dy > 0 ? overlapY : -overlapY;
      ZB_ball.vy *= -1;
    }
    b.alive = false;
    ZB_remaining--;
    const crit = (att > 0.65 && Math.random() < 0.35);
    const pts = b.points * (crit ? 2 : 1);
    ZB_score += pts;
    if (crit) {
      ZB_flashText = "CRIT +" + pts;
      ZB_flashTimer = 40;
    }
    break;
  }
}

function ZB_drawPlayfield(medSm, betaSm, att) {
  const pal = ZB_palette();

  ZB_drawPlayfieldBackdrop();

  for (let i = 0; i < ZB_bricks.length; i++) {
    const b = ZB_bricks[i];
    if (!b.alive) continue;
    noStroke();
    fill(b.color);
    rect(b.x, b.y, b.w, b.h, 2);
    if (window.BGShared && window.BGShared.drawPixelBorder) {
      window.BGShared.drawPixelBorder(b.x, b.y, b.w, b.h, pal.chromeGrey, pal.shadow);
    }
    noStroke();
    fill(255, 255, 255, 40);
    rect(b.x + 2, b.y + 2, b.w - 4, 3, 1);
  }

  if (ZB_ball.trail.length > 0) {
    noStroke();
    for (let i = 0; i < ZB_ball.trail.length; i++) {
      const t = ZB_ball.trail[i];
      const fade = (i / ZB_ball.trail.length);
      fill(108, 255, 220, fade * 160);
      ellipse(t.x, t.y, ZB_ball.r * 2 * (0.4 + fade * 0.8));
    }
  }

  const p = ZB_paddle;
  const halfW = p.w / 2;
  const halfH = p.h / 2;
  noStroke();
  fill(pal.chromeGrey);
  rect(p.x - halfW, p.y - halfH, p.w, p.h, 4);
  fill(pal.acidYellow);
  rect(p.x - halfW + 2, p.y - halfH + 2, p.w - 4, 4, 2);
  fill(pal.neonPink);
  rect(p.x - halfW + 2, p.y + halfH - 6, p.w - 4, 4, 2);
  if (window.BGShared && window.BGShared.drawPixelBorder) {
    window.BGShared.drawPixelBorder(p.x - halfW, p.y - halfH, p.w, p.h, pal.highlight || "#ffffff", pal.deepPurple);
  }

  noStroke();
  fill(att > 0.65 ? pal.crtGreen : pal.acidYellow);
  ellipse(ZB_ball.x, ZB_ball.y, ZB_ball.r * 2);
  fill(255, 255, 255, 160);
  ellipse(ZB_ball.x - ZB_ball.r * 0.3, ZB_ball.y - ZB_ball.r * 0.3, ZB_ball.r * 0.8);

  if (ZB_ball.stuck) {
    fill(pal.chromeGrey);
    textAlign(CENTER, CENTER);
    textSize(12);
    if (window.BGShared && window.BGShared.blinker ? window.BGShared.blinker(20) : 1) {
      text("PRESS SPACE TO LAUNCH", width / 2, ZB_paddle.y - 60);
    }
  }

  if (ZB_flashTimer > 0) {
    const a = Math.min(255, ZB_flashTimer * 6);
    fill(pal.neonPink.slice ? pal.neonPink : "#ff4aa0");
    textAlign(CENTER, CENTER);
    textSize(26);
    fill(0, 0, 0, a);
    text(ZB_flashText, width / 2 + 2, height / 2 + 2);
    fill(pal.acidYellow);
    text(ZB_flashText, width / 2, height / 2);
  }
}

function ZB_drawHudOverlay(eeg, medSm, betaSm, att) {
  const pal = ZB_palette();

  if (window.BGShared && window.BGShared.drawTopHud) {
    window.BGShared.drawTopHud({
      eeg: { attention: att, meditation: medSm },
      score: ZB_score,
      palette: pal
    });
  }

  const panelX = width - 182;
  const panelY = 42;
  noStroke();
  fill(0, 0, 0, 170);
  rect(panelX, panelY, 172, 64, 6);
  if (window.BGShared && window.BGShared.drawPixelBorder) {
    window.BGShared.drawPixelBorder(panelX, panelY, 172, 64, pal.chromeGrey, pal.deepPurple);
  }
  fill(pal.dim);
  textAlign(LEFT, TOP);
  textSize(9);
  text("BETA -> BALL SPEED", panelX + 6, panelY + 4);
  if (window.BGShared && window.BGShared.drawBar) {
    window.BGShared.drawBar(panelX + 6, panelY + 18, 158, 8, betaSm, null, pal.neonPink);
  }
  fill(pal.dim);
  textSize(9);
  text("MED -> PADDLE WIDTH", panelX + 6, panelY + 34);
  if (window.BGShared && window.BGShared.drawBar) {
    window.BGShared.drawBar(panelX + 6, panelY + 48, 158, 8, medSm, null, pal.crtGreen);
  }

  fill(pal.acidYellow);
  textAlign(LEFT, TOP);
  textSize(11);
  text("LIVES " + ZB_lives + "   WAVE " + ZB_wave, 12, 42);
}

function ZB_drawIntro() {
  const pal = ZB_palette();
  if (window.BGShared && window.BGShared.drawIntroPanel) {
    window.BGShared.drawIntroPanel({
      title: "ZEN BREAKOUT",
      blurb: "Calm widens your paddle. Beta accelerates the ball. Hold attention for a cyan trail and critical breaks. Left / Right to move, SPACE to launch.",
      mappings: [
        { label: "MEDITATION -> PADDLE WIDTH", desc: "Higher calm widens the paddle from 72 to 196 pixels (smoothed).", color: pal.crtGreen },
        { label: "BETA -> BALL SPEED", desc: "Higher beta speeds the ball from 240 to 620 px/s.", color: pal.neonPink },
        { label: "ATTENTION -> CRIT & TRAIL", desc: "Above 0.65 leaves a cyan afterimage and can double a brick score.", color: pal.acidYellow }
      ],
      introTimer: ZB_introTimer,
      introTotalFrames: ZB_introTotal,
      startHint: "PRESS SPACE TO START"
    });
  } else {
    fill(pal.acidYellow);
    textAlign(CENTER, CENTER);
    textSize(32);
    text("ZEN BREAKOUT", width / 2, height / 2 - 40);
    fill("#ffffff");
    textSize(14);
    text("PRESS SPACE TO START", width / 2, height / 2 + 20);
  }
  if (ZB_introTimer > 0) ZB_introTimer--;
}

function ZB_drawSummary() {
  const pal = ZB_palette();
  if (window.BGShared && window.BGShared.drawSummaryPanel) {
    window.BGShared.drawSummaryPanel({
      title: "GAME OVER",
      stats: [
        { label: "SCORE", value: ZB_score, color: pal.acidYellow },
        { label: "WAVE", value: ZB_wave, color: pal.neonPink },
        { label: "LIVES", value: 0, color: pal.crtGreen }
      ],
      message: "Meditate to widen the paddle. Ride the beta wave. Hold attention for crits.",
      restartHint: "PRESS SPACE TO PLAY AGAIN"
    });
  } else {
    fill(pal.acidYellow);
    textAlign(CENTER, CENTER);
    textSize(32);
    text("GAME OVER", width / 2, height / 2 - 40);
    fill("#ffffff");
    textSize(14);
    text("SCORE " + ZB_score + "  WAVE " + ZB_wave, width / 2, height / 2);
    text("PRESS SPACE TO PLAY AGAIN", width / 2, height / 2 + 30);
  }
}

function ZB_palette() {
  return (window.BGShared && window.BGShared.PALETTE) || {
    deepPurple: "#3b1f5a",
    acidYellow: "#f7d51d",
    neonPink:   "#ff4aa0",
    crtGreen:   "#6cff83",
    chromeGrey: "#c0c0c0",
    ink:        "#0a0614",
    shadow:     "#1a0f2e",
    highlight:  "#ffffff",
    dim:        "#8a7ba8"
  };
}

function keyPressed() {
  if (keyCode === LEFT_ARROW || key === "a" || key === "A") ZB_leftDown = true;
  if (keyCode === RIGHT_ARROW || key === "d" || key === "D") ZB_rightDown = true;

  if (key === " ") {
    if (ZB_state === "intro") {
      ZB_state = "play";
      ZB_introTimer = 0;
      ZB_prevMillis = millis();
      return;
    }
    if (ZB_state === "over") {
      ZB_resetGame();
      ZB_state = "intro";
      ZB_introTimer = 180;
      ZB_prevMillis = millis();
      return;
    }
    if (ZB_state === "play" && ZB_ball.stuck) {
      const baseSpd = 240 + (ZB_betaSmoother ? ZB_betaSmoother.value() : 0) * 380;
      ZB_launchBall(baseSpd);
    }
  }
}

function keyReleased() {
  if (keyCode === LEFT_ARROW || key === "a" || key === "A") ZB_leftDown = false;
  if (keyCode === RIGHT_ARROW || key === "d" || key === "D") ZB_rightDown = false;
}
