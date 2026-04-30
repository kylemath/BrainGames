/**
 * @id eegFPS
 * @title EEG FPS Range
 * @category Brain Games
 * @order 50
 * @newGame true
 *
 * Port of the Unity + BlueMuse "EEG FPS" project by Joe Gannon
 * (https://github.com/j-gannon/EEG-FPS-Game). The original used eye-blinks to
 * fire the gun and a Muse focus-level to control aim — recreated here as a
 * pseudo-3D target range driven by the cartridge-deck EEG bus.
 *
 * EEG mappings:
 *   attention  -> crosshair tightness (focus shrinks the reticle, low focus widens + jitters it)
 *   meditation -> aim sway dampening (calm = steady hands, fidgety = drifting reticle)
 *   beta       -> trigger cooldown (900ms..140ms fire-rate from low to high beta)
 *   gamma      -> jaw-clench burst: gamma >= 0.65 fires a 3-shot spread instead of single
 *   alpha      -> cosmetic scanline pulse + shows up in the per-band score breakdown
 *
 * Original mechanic preserved: a per-band score table (ALPHA / BETA / THETA / DELTA / GAMMA)
 * credits whichever EEG band was dominant at the moment of each hit, mirroring the
 * AlphaScore / BetaScore / ThetaScore / DeltaScore / GammaScore HUD from the Unity build.
 *
 * Controls:
 *   Mouse                aim (yaw/pitch) — click to fire
 *   SPACE                fire (the "blink-fire" stand-in; on real Muse this would be a blink)
 *   R                    restart round
 */

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const FPS_ROUND_MS         = 60_000;     // round length
const FPS_TARGET_MIN       = 5;          // alive target count floor
const FPS_TARGET_MAX       = 9;          // alive target count ceiling (rises with wave)
const FPS_FOV_DEG          = 70;         // pseudo-3D field of view
const FPS_NEAR             = 1.2;
const FPS_FAR              = 80;
const FPS_SWAY_BASE        = 0.020;      // sway amplitude at meditation = 0
const FPS_SWAY_MIN         = 0.003;      // sway amplitude at meditation = 1
const FPS_RETICLE_MIN_PX   = 14;         // crosshair half-size at full focus
const FPS_RETICLE_MAX_PX   = 70;         // crosshair half-size at zero focus
const FPS_FIRE_CD_MAX_MS   = 900;
const FPS_FIRE_CD_MIN_MS   = 140;
const FPS_GAMMA_BURST_TH   = 0.65;
const FPS_TIER_COLORS_KEY  = ["crtGreen", "acidYellow", "neonPink", "chromeGrey"];
const FPS_TIER_POINTS      = [10, 25, 50, 100];      // matches color tier
const FPS_TIER_PROBS       = [0.55, 0.27, 0.13, 0.05];

// Bands tracked for per-band score (faithful to the Unity HUD).
const FPS_BANDS = ["alpha", "beta", "theta", "delta", "gamma"];

// ---------------------------------------------------------------------------
// Module-scoped state
// ---------------------------------------------------------------------------
let fpsState;                  // 'intro' | 'play' | 'over'
let fpsIntroStartMs;
let fpsRoundStartMs;
let fpsLastFrameMs;

let fpsTargets;                // array of { x, y, z, size, tier, alive, vx, vy, vz, age, ttlMs }
let fpsShots;                  // visual-only tracer effects { sx, sy, t }
let fpsImpacts;                // hit-burst effects { sx, sy, t, color, points }
let fpsMissPulse;              // ms of last miss, for HUD flash
let fpsHitPulse;               // ms of last hit, for HUD flash

let fpsCamYaw   = 0;           // radians
let fpsCamPitch = 0;
let fpsSwayPhase = 0;

let fpsLastShotMs;
let fpsScore;                  // total
let fpsHits;
let fpsShotsFired;
let fpsBestStreak;
let fpsStreak;
let fpsBandScores;             // { alpha, beta, theta, delta, gamma }

let fpsSmAttention, fpsSmMeditation, fpsSmBeta, fpsSmAlpha, fpsSmGamma;
let fpsLastEeg;                // cached smoothed values used by aim + scoring

let fpsGunRecoil = 0;          // 0..1, decays each frame
let fpsMuzzleFlash = 0;        // 0..1
let fpsCrosshairWobblePhase = 0;
let fpsScreenShake = 0;

// Mouse-driven aim (kept inside canvas; doesn't lock the pointer).
let fpsMouseNx = 0.5;          // normalized 0..1 in canvas
let fpsMouseNy = 0.5;

// Tier display colors, resolved lazily on first draw.
let fpsTierFill;

// ---------------------------------------------------------------------------
// p5 hooks
// ---------------------------------------------------------------------------
function setup() {
  createCanvas(windowWidth, windowHeight - 48);
  frameRate(60);
  textFont('monospace');

  const S = window.BGShared || {};
  fpsSmAttention  = S.makeSmoother ? S.makeSmoother(20) : fps_fallbackSmoother(20);
  fpsSmMeditation = S.makeSmoother ? S.makeSmoother(40) : fps_fallbackSmoother(40);
  fpsSmBeta       = S.makeSmoother ? S.makeSmoother(20) : fps_fallbackSmoother(20);
  fpsSmAlpha      = S.makeSmoother ? S.makeSmoother(20) : fps_fallbackSmoother(20);
  fpsSmGamma      = S.makeSmoother ? S.makeSmoother(15) : fps_fallbackSmoother(15);

  fpsResetRun();
  fpsState = 'intro';
  fpsIntroStartMs = millis();
}

function draw() {
  const now = millis();
  const dtMs = Math.min(64, fpsLastFrameMs ? now - fpsLastFrameMs : 16);
  fpsLastFrameMs = now;

  fpsReadEEG();
  fpsUpdateAim(dtMs);

  if (fpsState === 'play') {
    fpsUpdateTargets(dtMs);
    if (now - fpsRoundStartMs >= FPS_ROUND_MS) {
      fpsState = 'over';
    }
  }

  fpsRenderScene();
  fpsRenderTargets();
  fpsRenderTracers();
  fpsRenderImpacts();
  fpsRenderCrosshair();
  fpsRenderGun();
  fpsRenderHUD();

  if (fpsState === 'intro') fpsRenderIntro();
  if (fpsState === 'over')  fpsRenderSummary();

  fpsRenderScanlines();

  // Auto-start once intro panel countdown elapses (matches Brainvaders/SnakeFeast pattern).
  if (fpsState === 'intro') {
    if (now - fpsIntroStartMs >= 3000) fpsStartPlay();
  }
}

function mouseMoved() { fpsUpdateMouseNorm(); }
function mouseDragged() { fpsUpdateMouseNorm(); }

function mousePressed() {
  // Only treat clicks inside the canvas as fire input.
  if (mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height) return;
  if (fpsState === 'intro')      fpsStartPlay();
  else if (fpsState === 'play')  fpsTryFire();
  else if (fpsState === 'over')  fpsResetRun();
}

function keyPressed() {
  if (key === ' ' || keyCode === 32) {
    if (fpsState === 'intro')      fpsStartPlay();
    else if (fpsState === 'play')  fpsTryFire();
    else if (fpsState === 'over')  fpsResetRun();
  } else if (key === 'r' || key === 'R') {
    fpsResetRun();
    fpsState = 'intro';
    fpsIntroStartMs = millis();
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
function fpsResetRun() {
  fpsTargets = [];
  fpsShots = [];
  fpsImpacts = [];
  fpsScore = 0;
  fpsHits = 0;
  fpsShotsFired = 0;
  fpsStreak = 0;
  fpsBestStreak = 0;
  fpsBandScores = { alpha: 0, beta: 0, theta: 0, delta: 0, gamma: 0 };
  fpsLastShotMs = 0;
  fpsRoundStartMs = millis();
  fpsCamYaw = 0;
  fpsCamPitch = 0;
  fpsSwayPhase = 0;
  fpsGunRecoil = 0;
  fpsMuzzleFlash = 0;
  fpsScreenShake = 0;
  fpsMissPulse = -9999;
  fpsHitPulse = -9999;
  for (let i = 0; i < FPS_TARGET_MIN; i++) fpsSpawnTarget();
  fpsState = 'intro';
}

function fpsStartPlay() {
  fpsState = 'play';
  fpsRoundStartMs = millis();
}

// ---------------------------------------------------------------------------
// EEG read + aim
// ---------------------------------------------------------------------------
function fpsReadEEG() {
  const S = window.BGShared || {};
  const src = (S.readEEG ? S.readEEG({}) : (window.eegData || {}));
  const a = fps_num(src.alpha);
  const b = fps_num(src.beta);
  const t = fps_num(src.theta);
  const d = fps_num(src.delta);
  const g = fps_num(src.gamma);
  const att = fps_num(src.attention);
  const med = fps_num(src.meditation);

  const sAtt = fpsSmAttention.push(att);
  const sMed = fpsSmMeditation.push(med);
  const sBeta = fpsSmBeta.push(b);
  const sAlpha = fpsSmAlpha.push(a);
  const sGamma = fpsSmGamma.push(g);

  fpsLastEeg = {
    raw:        { alpha: a, beta: b, theta: t, delta: d, gamma: g },
    attention:  fps_clamp01(sAtt),
    meditation: fps_clamp01(sMed),
    beta:       fps_clamp01(sBeta),
    alpha:      fps_clamp01(sAlpha),
    gamma:      fps_clamp01(sGamma),
    connected:  src.connected === true
  };
}

function fpsUpdateMouseNorm() {
  if (typeof mouseX !== 'number' || typeof mouseY !== 'number') return;
  fpsMouseNx = fps_clamp01(mouseX / Math.max(1, width));
  fpsMouseNy = fps_clamp01(mouseY / Math.max(1, height));
}

function fpsUpdateAim(dtMs) {
  // Mouse position drives a target yaw/pitch. The actual camera trails it
  // smoothly with a sway component modulated by meditation: high meditation
  // damps the wobble; low meditation makes the reticle drift more.
  const fov = (FPS_FOV_DEG * Math.PI) / 180;
  const aspect = width / height;
  const halfYaw   = fov * 0.5;
  const halfPitch = halfYaw / aspect;

  const tgtYaw   = (fpsMouseNx - 0.5) * 2 * halfYaw;
  const tgtPitch = (0.5 - fpsMouseNy) * 2 * halfPitch;

  // Trail factor: faster catch-up at higher attention (focus = quicker tracking).
  const trail = 0.10 + 0.20 * (fpsLastEeg ? fpsLastEeg.attention : 0);
  fpsCamYaw   += (tgtYaw   - fpsCamYaw)   * trail;
  fpsCamPitch += (tgtPitch - fpsCamPitch) * trail;

  // Sway: amplitude shrinks with meditation; frequency wanders slightly.
  const med = fpsLastEeg ? fpsLastEeg.meditation : 0;
  const swayAmp = FPS_SWAY_BASE + (FPS_SWAY_MIN - FPS_SWAY_BASE) * med;
  fpsSwayPhase += dtMs * 0.0024;
  fpsCrosshairWobblePhase += dtMs * 0.0036;
  const sway = swayAmp * Math.sin(fpsSwayPhase);
  const swayX = swayAmp * 0.7 * Math.sin(fpsSwayPhase * 1.31 + 1.2);
  fpsCamYaw   += swayX;
  fpsCamPitch += sway;

  if (fpsGunRecoil > 0) fpsGunRecoil = Math.max(0, fpsGunRecoil - dtMs * 0.005);
  if (fpsMuzzleFlash > 0) fpsMuzzleFlash = Math.max(0, fpsMuzzleFlash - dtMs * 0.008);
  if (fpsScreenShake > 0) fpsScreenShake = Math.max(0, fpsScreenShake - dtMs * 0.012);
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------
function fpsTargetCount() {
  // Cap rises gently with score so later round feels denser.
  const tier = Math.min(3, Math.floor(fpsScore / 600));
  return Math.min(FPS_TARGET_MAX, FPS_TARGET_MIN + tier);
}

function fpsSpawnTarget() {
  // Pick a tier by roulette wheel.
  const r = Math.random();
  let cum = 0, tier = 0;
  for (let i = 0; i < FPS_TIER_PROBS.length; i++) {
    cum += FPS_TIER_PROBS[i];
    if (r <= cum) { tier = i; break; }
  }

  // Place in front-of-camera cone.
  const yaw = (Math.random() - 0.5) * 0.95;          // ~+-27 deg
  const pitch = (Math.random() - 0.5) * 0.55;        // narrower vertical band
  const dist = 14 + Math.random() * 28;              // 14..42 units

  const x = Math.sin(yaw) * Math.cos(pitch) * dist;
  const y = Math.sin(pitch) * dist;
  const z = Math.cos(yaw) * Math.cos(pitch) * dist;

  // Slow drift, biased away from camera so they exit out the back over time.
  const speed = 0.6 + Math.random() * 0.7 + tier * 0.15;
  const driftYaw = (Math.random() - 0.5) * 0.6;
  fpsTargets.push({
    x, y, z,
    vx: Math.sin(driftYaw) * speed * 0.4,
    vy: (Math.random() - 0.5) * 0.18,
    vz: Math.cos(driftYaw) * speed * 0.10,
    size: 1.2 + (3 - tier) * 0.18,    // smaller targets at higher tiers
    tier: tier,
    alive: true,
    age: 0,
    ttlMs: 9000 + Math.random() * 6000
  });
}

function fpsUpdateTargets(dtMs) {
  const dt = dtMs / 1000;
  for (let i = fpsTargets.length - 1; i >= 0; i--) {
    const t = fpsTargets[i];
    if (!t.alive) { fpsTargets.splice(i, 1); continue; }
    t.age += dtMs;
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    t.z += t.vz * dt;
    // Bob in y a little for visual interest.
    t.y += Math.sin((t.age + i * 137) * 0.0035) * 0.03;
    // Wrap if drifting too far behind/sideways.
    if (t.z < FPS_NEAR + 0.5 || t.z > FPS_FAR || t.age > t.ttlMs ||
        Math.abs(t.x) > 30 || Math.abs(t.y) > 14) {
      fpsTargets.splice(i, 1);
    }
  }
  // Maintain population.
  const want = fpsTargetCount();
  while (fpsTargets.length < want) fpsSpawnTarget();
}

// ---------------------------------------------------------------------------
// Firing / hit detection
// ---------------------------------------------------------------------------
function fpsFireCooldownMs() {
  const beta = fpsLastEeg ? fpsLastEeg.beta : 0;
  return FPS_FIRE_CD_MAX_MS - beta * (FPS_FIRE_CD_MAX_MS - FPS_FIRE_CD_MIN_MS);
}

function fpsTryFire() {
  const now = millis();
  if (now - fpsLastShotMs < fpsFireCooldownMs()) return;
  fpsLastShotMs = now;

  // Reticle radius (px) and screen-center anchor.
  const reticleR = fpsReticleRadiusPx();
  const cx = width / 2;
  const cy = height / 2;

  // Fire one shot, plus 2 spread shots if gamma is "jaw-clenched".
  const burst = fpsLastEeg && fpsLastEeg.gamma >= FPS_GAMMA_BURST_TH;
  const shots = burst ? 3 : 1;
  for (let s = 0; s < shots; s++) {
    fpsShotsFired++;
    // Burst spread offsets: center, then +/- a small angular jitter.
    const offX = (s === 0) ? 0 : (s === 1 ? -reticleR * 0.7 : reticleR * 0.7);
    const offY = (s === 0) ? 0 : (Math.random() - 0.5) * reticleR * 0.4;
    fpsShots.push({ sx: cx + offX, sy: cy + offY, t: 1 });
    fpsResolveShot(cx + offX, cy + offY, reticleR);
  }

  fpsGunRecoil = 1.0;
  fpsMuzzleFlash = 1.0;
}

function fpsResolveShot(aimSx, aimSy, reticleR) {
  // Project all alive targets to screen space; pick the closest-to-aim
  // whose projected radius covers the aim point. Tighter focus = smaller
  // tolerance because reticleR is smaller, demanding finer aim.
  let best = null;
  let bestDz = Infinity;
  for (let i = 0; i < fpsTargets.length; i++) {
    const t = fpsTargets[i];
    if (!t.alive) continue;
    const proj = fpsProject(t.x, t.y, t.z);
    if (!proj) continue;
    const dx = proj.sx - aimSx;
    const dy = proj.sy - aimSy;
    const d  = Math.sqrt(dx * dx + dy * dy);
    // Hit if click was within target's projected radius OR within the
    // reticle's tolerance, whichever is larger. The reticle term means
    // wide-reticle shots can still hit nearby cubes — the stochastic
    // "spray" of an unfocused brain.
    const tol = Math.max(proj.sr * 0.85, reticleR * 0.55);
    if (d <= tol && proj.dz < bestDz) {
      best = { t, proj, d };
      bestDz = proj.dz;
    }
  }

  if (!best) {
    fpsStreak = 0;
    fpsMissPulse = millis();
    return;
  }

  // Score the hit. Distance-bonus: farther = more points.
  const t = best.t;
  t.alive = false;
  fpsHits++;
  fpsStreak++;
  if (fpsStreak > fpsBestStreak) fpsBestStreak = fpsStreak;

  let pts = FPS_TIER_POINTS[t.tier];
  pts += Math.min(40, Math.floor(t.z));
  if (fpsStreak >= 3) pts = Math.round(pts * 1.4);
  fpsScore += pts;

  // Per-band credit: which raw band was highest at hit-time.
  const band = fpsDominantBand();
  fpsBandScores[band] = (fpsBandScores[band] || 0) + pts;

  fpsImpacts.push({
    sx: best.proj.sx, sy: best.proj.sy,
    t: 1, color: fpsTierColor(t.tier), points: pts, band: band
  });
  fpsHitPulse = millis();
  fpsScreenShake = Math.min(1, fpsScreenShake + 0.4);
}

function fpsDominantBand() {
  if (!fpsLastEeg) return 'alpha';
  const r = fpsLastEeg.raw;
  let bestK = FPS_BANDS[0];
  let bestV = -Infinity;
  for (let i = 0; i < FPS_BANDS.length; i++) {
    const k = FPS_BANDS[i];
    const v = fps_num(r[k]);
    if (v > bestV) { bestV = v; bestK = k; }
  }
  return bestK;
}

function fpsReticleRadiusPx() {
  const att = fpsLastEeg ? fpsLastEeg.attention : 0;
  // Linear interp from MAX to MIN as attention rises 0->1.
  return FPS_RETICLE_MAX_PX - att * (FPS_RETICLE_MAX_PX - FPS_RETICLE_MIN_PX);
}

// ---------------------------------------------------------------------------
// Pseudo-3D projection
// ---------------------------------------------------------------------------
function fpsProject(wx, wy, wz) {
  // Camera-space transform: rotate world by -yaw around Y, then -pitch around X.
  const cy = Math.cos(-fpsCamYaw),   sy = Math.sin(-fpsCamYaw);
  const cp = Math.cos(-fpsCamPitch), sp = Math.sin(-fpsCamPitch);

  // Yaw (around Y axis)
  let x = wx * cy + wz * sy;
  let z = -wx * sy + wz * cy;
  let y = wy;

  // Pitch (around X axis)
  const y1 = y * cp - z * sp;
  const z1 = y * sp + z * cp;
  y = y1;
  z = z1;

  if (z < FPS_NEAR) return null;

  // Project: focal length such that horizontal half-FOV maps to width/2.
  const fov = (FPS_FOV_DEG * Math.PI) / 180;
  const focal = (width / 2) / Math.tan(fov / 2);
  const sx = (x * focal) / z + width / 2;
  const sxY = (y * focal) / z + height / 2;
  // Visual size: a unit cube spans 'size' world units; on screen it's size*focal/z.
  return { sx: sx, sy: height - sxY, dz: z, sr: 0, _focal: focal };
}

function fpsProjectWithSize(t) {
  const p = fpsProject(t.x, t.y, t.z);
  if (!p) return null;
  p.sr = (t.size * p._focal) / p.dz;
  return p;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function fpsPalette() {
  const S = window.BGShared || {};
  return (S.PALETTE) || {
    deepPurple: "#3b1f5a", acidYellow: "#f7d51d", neonPink: "#ff4aa0",
    crtGreen: "#6cff83", chromeGrey: "#c0c0c0", ink: "#0a0614",
    shadow: "#1a0f2e", dim: "#8a7ba8"
  };
}

function fpsTierColor(tier) {
  if (!fpsTierFill) {
    const P = fpsPalette();
    fpsTierFill = FPS_TIER_COLORS_KEY.map((k) => P[k] || "#ffffff");
  }
  return fpsTierFill[Math.max(0, Math.min(fpsTierFill.length - 1, tier))];
}

function fpsRenderScene() {
  const P = fpsPalette();
  const S = window.BGShared || {};

  // Sky / ground gradient split.
  const horizonY = height * 0.5 - fpsCamPitch * (height / Math.tan((FPS_FOV_DEG * Math.PI) / 360)) * 0.5;

  noStroke();
  if (S.fillVerticalGradient) {
    S.fillVerticalGradient(0, 0, width, Math.max(1, horizonY), P.deepPurple, P.shadow);
    S.fillVerticalGradient(0, horizonY, width, height - horizonY, P.ink, "#22142a");
  } else {
    fill(P.deepPurple); rect(0, 0, width, horizonY);
    fill(P.ink);        rect(0, horizonY, width, height - horizonY);
  }

  // Horizon strip — neon pink scanline glow.
  fill(P.neonPink);
  rect(0, horizonY - 1, width, 2);

  // Ground perspective grid: project a few z-lines and x-lines.
  stroke(P.crtGreen);
  strokeWeight(1);
  noFill();
  // Distance lines (constant z, varying x)
  for (let zi = 4; zi <= 36; zi += 4) {
    const a = fpsProject(-30, -3, zi);
    const b = fpsProject( 30, -3, zi);
    if (a && b) {
      const alpha = Math.max(20, 200 - zi * 5);
      stroke(108, 255, 131, alpha);
      line(a.sx, a.sy, b.sx, b.sy);
    }
  }
  // Stripe lines (constant x, varying z)
  for (let xi = -24; xi <= 24; xi += 6) {
    const a = fpsProject(xi, -3, 4);
    const b = fpsProject(xi, -3, 36);
    if (a && b) {
      stroke(108, 255, 131, 60);
      line(a.sx, a.sy, b.sx, b.sy);
    }
  }
  noStroke();

  // Distant chrome silhouette: wireframe pillars on the horizon for depth cues.
  for (let i = -4; i <= 4; i++) {
    const x = i * 7;
    const top = fpsProject(x, 6, 38);
    const bot = fpsProject(x, -3, 38);
    if (top && bot) {
      stroke(P.chromeGrey);
      strokeWeight(1);
      line(top.sx, top.sy, bot.sx, bot.sy);
    }
  }
  noStroke();
}

function fpsRenderTargets() {
  // Sort back-to-front so closer cubes draw on top.
  const projected = [];
  for (let i = 0; i < fpsTargets.length; i++) {
    const t = fpsTargets[i];
    if (!t.alive) continue;
    const p = fpsProjectWithSize(t);
    if (!p) continue;
    projected.push({ t, p });
  }
  projected.sort((a, b) => b.p.dz - a.p.dz);

  for (let i = 0; i < projected.length; i++) {
    const t = projected[i].t;
    const p = projected[i].p;
    fpsDrawCube(p.sx, p.sy, p.sr, p.dz, t.tier);
  }
}

function fpsDrawCube(sx, sy, sr, dz, tier) {
  const P = fpsPalette();
  const col = fpsTierColor(tier);

  // Distance-fade alpha
  const fade = Math.max(60, Math.min(255, 290 - dz * 5));
  const colObj = color(col);
  colObj.setAlpha(fade);

  // Drop shadow disc
  noStroke();
  fill(0, 0, 0, 90);
  ellipse(sx, sy + sr * 0.65, sr * 1.4, sr * 0.35);

  // Cube faces: front (bright), top (mid), right (dark) — fake isometric projection.
  const half = sr;
  const skew = sr * 0.32;

  // Right side
  const dark = color(col);
  dark.setAlpha(fade);
  // Manually darken
  const dCol = color(
    red(dark)   * 0.55,
    green(dark) * 0.55,
    blue(dark)  * 0.55,
    fade
  );
  fill(dCol);
  beginShape();
  vertex(sx + half, sy - half);
  vertex(sx + half + skew, sy - half - skew);
  vertex(sx + half + skew, sy + half - skew);
  vertex(sx + half, sy + half);
  endShape(CLOSE);

  // Top face
  const tCol = color(
    Math.min(255, red(colObj)   * 1.2),
    Math.min(255, green(colObj) * 1.2),
    Math.min(255, blue(colObj)  * 1.2),
    fade
  );
  fill(tCol);
  beginShape();
  vertex(sx - half, sy - half);
  vertex(sx + half, sy - half);
  vertex(sx + half + skew, sy - half - skew);
  vertex(sx - half + skew, sy - half - skew);
  endShape(CLOSE);

  // Front face
  fill(colObj);
  rect(sx - half, sy - half, sr * 2, sr * 2);

  // Pixel border on the front face
  noFill();
  stroke(P.chromeGrey);
  strokeWeight(1);
  rect(sx - half, sy - half, sr * 2, sr * 2);
  noStroke();

  // Tier dot — bright central pip at higher tiers
  if (tier >= 1) {
    fill(P.acidYellow);
    rect(sx - sr * 0.18, sy - sr * 0.18, sr * 0.36, sr * 0.36);
  }
  if (tier >= 2) {
    fill(P.neonPink);
    rect(sx - sr * 0.07, sy - sr * 0.07, sr * 0.14, sr * 0.14);
  }
}

function fpsRenderTracers() {
  const P = fpsPalette();
  const cx = width / 2;
  const cy = height / 2;
  const muzzleY = height - 56 + fpsGunRecoil * 12;

  for (let i = fpsShots.length - 1; i >= 0; i--) {
    const s = fpsShots[i];
    s.t -= 0.10;
    if (s.t <= 0) { fpsShots.splice(i, 1); continue; }
    stroke(P.acidYellow);
    strokeWeight(2);
    line(width / 2 + (s.sx - cx) * 0.0, muzzleY,
         s.sx, s.sy);
    // Bright impact tip
    noStroke();
    fill(P.acidYellow);
    const r = 3 + (1 - s.t) * 6;
    rect(s.sx - r / 2, s.sy - r / 2, r, r);
  }
  noStroke();
}

function fpsRenderImpacts() {
  for (let i = fpsImpacts.length - 1; i >= 0; i--) {
    const e = fpsImpacts[i];
    e.t -= 0.04;
    if (e.t <= 0) { fpsImpacts.splice(i, 1); continue; }
    const a = Math.max(0, Math.min(1, e.t));
    const r = (1 - a) * 26 + 8;
    noFill();
    stroke(e.color);
    strokeWeight(2);
    rect(e.sx - r / 2, e.sy - r / 2, r, r);
    // Score popup
    noStroke();
    fill(255, 255, 255, 220 * a);
    textAlign(CENTER, CENTER);
    textSize(11);
    text("+" + e.points + " " + e.band.toUpperCase(),
         e.sx, e.sy - r - 2 - (1 - a) * 14);
  }
  strokeWeight(1);
}

function fpsRenderCrosshair() {
  const P = fpsPalette();
  const cx = width / 2;
  const cy = height / 2;
  const r = fpsReticleRadiusPx();
  const att = fpsLastEeg ? fpsLastEeg.attention : 0;
  const wob = (1 - att) * 6 * Math.sin(fpsCrosshairWobblePhase * 1.3);
  const wox = (1 - att) * 6 * Math.cos(fpsCrosshairWobblePhase * 0.9);

  push();
  translate(cx + wox, cy + wob);

  // Outer ring
  noFill();
  stroke(P.crtGreen);
  strokeWeight(2);
  ellipse(0, 0, r * 2, r * 2);

  // Inner ticks
  const tick = Math.max(4, r * 0.3);
  stroke(P.acidYellow);
  strokeWeight(2);
  line(-r,    0,  -r + tick, 0);
  line( r,    0,   r - tick, 0);
  line( 0,   -r,   0, -r + tick);
  line( 0,    r,   0,  r - tick);

  // Center dot
  noStroke();
  fill(P.neonPink);
  rect(-1.5, -1.5, 3, 3);

  // Burst-mode chevron (gamma >= threshold)
  if (fpsLastEeg && fpsLastEeg.gamma >= FPS_GAMMA_BURST_TH) {
    stroke(P.neonPink);
    strokeWeight(2);
    noFill();
    const k = r + 8;
    line(-k * 0.4, -k * 0.7, 0, -k);
    line( k * 0.4, -k * 0.7, 0, -k);
  }
  pop();
  strokeWeight(1);
}

function fpsRenderGun() {
  // Bottom-right gun sprite: slab + barrel + flash. Recoils on fire.
  const P = fpsPalette();
  const recoil = fpsGunRecoil;
  const baseY = height + 8 + recoil * 12;
  const gx = width - 230;

  push();
  translate(0, baseY);

  // Slab body
  noStroke();
  fill(P.chromeGrey);
  rect(gx, -110, 180, 80, 6);

  // Barrel
  fill("#3a3a3a");
  rect(gx + 60, -150 + recoil * 6, 60, 50, 4);

  // Sight rail
  fill(P.shadow);
  rect(gx + 30, -120, 110, 8, 2);

  // Trigger guard
  noFill();
  stroke(P.shadow);
  strokeWeight(3);
  ellipse(gx + 50, -50, 22, 22);
  noStroke();

  // Brand plate
  fill(P.neonPink);
  textAlign(LEFT, TOP);
  textSize(9);
  text("BRAINTENDO  9MM", gx + 10, -98);

  // Muzzle flash
  if (fpsMuzzleFlash > 0) {
    noStroke();
    fill(247, 213, 29, 220 * fpsMuzzleFlash);
    const fr = 14 + fpsMuzzleFlash * 18;
    ellipse(gx + 130, -125 + recoil * 6, fr * 1.6, fr);
    fill(255, 255, 255, 220 * fpsMuzzleFlash);
    rect(gx + 124, -128 + recoil * 6, 18, 8);
  }

  pop();
  strokeWeight(1);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function fpsRenderHUD() {
  const P = fpsPalette();
  const S = window.BGShared || {};
  const eeg = fpsLastEeg || { attention: 0, meditation: 0, beta: 0, alpha: 0, gamma: 0 };

  if (S.drawTopHud) {
    S.drawTopHud({
      eeg: { attention: eeg.attention, meditation: eeg.meditation },
      score: fpsScore
    });
  }

  // Round timer (centered, small)
  const remainingMs = fpsState === 'play'
    ? Math.max(0, FPS_ROUND_MS - (millis() - fpsRoundStartMs))
    : (fpsState === 'over' ? 0 : FPS_ROUND_MS);
  const remaining = (remainingMs / 1000).toFixed(1);
  fill(P.acidYellow);
  textAlign(CENTER, TOP);
  textSize(11);
  text("ROUND " + remaining + "s", width / 2, 36);

  // Per-band score panel (mirrors original's MuseHUD).
  const panelX = 12;
  const panelY = 56;
  const panelW = 168;
  const panelH = 96;
  noStroke();
  fill(0, 0, 0, 150);
  rect(panelX, panelY, panelW, panelH, 4);
  fill(P.chromeGrey);
  textAlign(LEFT, TOP);
  textSize(10);
  text("BAND SCORES", panelX + 8, panelY + 6);

  const labelCol = {
    alpha: P.neonPink,
    beta:  P.acidYellow,
    theta: "#9ad6ff",
    delta: "#c08aff",
    gamma: P.crtGreen
  };
  let yy = panelY + 22;
  for (let i = 0; i < FPS_BANDS.length; i++) {
    const b = FPS_BANDS[i];
    fill(labelCol[b] || "#ffffff");
    textAlign(LEFT, TOP);
    textSize(10);
    text(b.toUpperCase(), panelX + 8, yy);
    textAlign(RIGHT, TOP);
    fill("#ffffff");
    text(String(fpsBandScores[b] || 0), panelX + panelW - 8, yy);
    yy += 14;
  }

  // Right-side bars: focus / calm / fire-rate
  const barX = width - 188;
  let barY  = 56;
  const barW = 168;
  const barH = 12;
  noStroke();
  fill(0, 0, 0, 150);
  rect(barX - 8, barY - 8, barW + 16, 124, 6);

  if (S.drawBar) {
    S.drawBar(barX, barY,           barW, barH, eeg.attention, "FOCUS (RETICLE)", P.crtGreen);
    S.drawBar(barX, barY + 30,      barW, barH, eeg.meditation, "CALM (STEADY)",  P.neonPink);
    const cdFrac = 1 - ((fpsFireCooldownMs() - FPS_FIRE_CD_MIN_MS) /
                        (FPS_FIRE_CD_MAX_MS - FPS_FIRE_CD_MIN_MS));
    S.drawBar(barX, barY + 60,      barW, barH, cdFrac, "FIRE RATE (BETA)", P.acidYellow);
    S.drawBar(barX, barY + 90,      barW, barH, eeg.gamma, "GAMMA (BURST)",
              eeg.gamma >= FPS_GAMMA_BURST_TH ? P.acidYellow : P.dim);
  }

  // Bottom strip: hits / streak / accuracy
  const acc = fpsShotsFired > 0 ? Math.round((fpsHits / fpsShotsFired) * 100) : 0;
  fill(P.crtGreen);
  textAlign(LEFT, BOTTOM);
  textSize(11);
  text("HITS " + fpsHits, 14, height - 8);
  fill(P.acidYellow);
  text("STREAK " + fpsStreak, 110, height - 8);
  fill(P.chromeGrey);
  text("ACC " + acc + "%", 220, height - 8);

  // Hit / miss flash overlays
  if (millis() - fpsHitPulse < 220) {
    const a = 1 - (millis() - fpsHitPulse) / 220;
    fill(108, 255, 131, 60 * a);
    rect(0, 0, width, height);
  }
  if (millis() - fpsMissPulse < 200) {
    const a = 1 - (millis() - fpsMissPulse) / 200;
    fill(255, 74, 160, 40 * a);
    rect(0, 0, width, height);
  }
}

function fpsRenderIntro() {
  const S = window.BGShared || {};
  const P = fpsPalette();
  const remaining = Math.max(0, 3000 - (millis() - fpsIntroStartMs));
  const framesRemaining = Math.ceil(remaining / (1000 / 60));
  const totalFrames     = Math.ceil(3000 / (1000 / 60));
  if (S.drawIntroPanel) {
    S.drawIntroPanel({
      title: "EEG FPS RANGE",
      blurb: "Port of Joe Gannon's Unity + BlueMuse FPS. Aim with the mouse, click or " +
             "press SPACE to fire (the original was eye-blinks). Hit cubes to score; " +
             "your dominant brainwave at hit-time fills its band column.",
      mappings: [
        { label: "ATTENTION -> Reticle",
          desc:  "High focus shrinks the crosshair to a sniper dot; low focus widens and wobbles it.",
          color: P.crtGreen },
        { label: "MEDITATION -> Steady Hand",
          desc:  "Calm above 0.5 dampens aim sway; agitation drifts the camera.",
          color: P.neonPink },
        { label: "BETA -> Fire Rate",
          desc:  "Trigger cooldown shrinks from 900ms to 140ms with rising beta.",
          color: P.acidYellow },
        { label: "GAMMA -> Burst Shot",
          desc:  "Gamma >= 0.65 (a 'jaw clench' surge) fires a 3-shot spread.",
          color: P.acidYellow },
        { label: "ALPHA -> Cosmetic + Score",
          desc:  "Pulses scanlines; if alpha is dominant on a hit, score lands in ALPHA column.",
          color: P.chromeGrey }
      ],
      introTimer: framesRemaining,
      introTotalFrames: totalFrames,
      startHint: "MOUSE + CLICK / SPACE TO START"
    });
  }
}

function fpsRenderSummary() {
  const S = window.BGShared || {};
  const P = fpsPalette();
  const acc = fpsShotsFired > 0 ? Math.round((fpsHits / fpsShotsFired) * 100) : 0;
  const top = fpsTopBand();
  if (S.drawSummaryPanel) {
    S.drawSummaryPanel({
      title: "RANGE CLEAR",
      stats: [
        { label: "SCORE",       value: fpsScore,                      color: P.acidYellow },
        { label: "HITS",        value: fpsHits + "/" + fpsShotsFired, color: P.crtGreen },
        { label: "ACCURACY",    value: acc + "%",                     color: P.chromeGrey },
        { label: "BEST STREAK", value: fpsBestStreak,                 color: P.neonPink },
        { label: "TOP BAND",    value: top.toUpperCase(),             color: P.neonPink }
      ],
      message: "Per-band scoring: " +
               FPS_BANDS.map((b) => b.toUpperCase() + " " + (fpsBandScores[b] || 0)).join("  "),
      restartHint: "CLICK / SPACE / R TO RELOAD"
    });
  }
}

function fpsTopBand() {
  let bestK = FPS_BANDS[0];
  let bestV = -1;
  for (let i = 0; i < FPS_BANDS.length; i++) {
    const k = FPS_BANDS[i];
    const v = fpsBandScores[k] || 0;
    if (v > bestV) { bestV = v; bestK = k; }
  }
  return bestK;
}

function fpsRenderScanlines() {
  const S = window.BGShared || {};
  if (!S.drawScanlineOverlay) return;
  const a = fpsLastEeg ? fpsLastEeg.alpha : 0;
  const scanA = 24 + Math.round(a * 30);
  S.drawScanlineOverlay({ alpha: scanA, spacing: 3 });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function fps_num(v)     { return (typeof v === 'number' && isFinite(v)) ? v : 0; }
function fps_clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function fps_fallbackSmoother(n) {
  const buf = [];
  const size = Math.max(1, n | 0);
  return {
    push(v) {
      const x = (typeof v === 'number' && isFinite(v)) ? v : 0;
      buf.push(x);
      if (buf.length > size) buf.shift();
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i];
      return s / buf.length;
    },
    value() {
      if (buf.length === 0) return 0;
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i];
      return s / buf.length;
    },
    history() { return buf.slice(); },
    clear()   { buf.length = 0; },
    size()    { return size; }
  };
}
