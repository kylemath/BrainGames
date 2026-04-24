/**
 * @id archeryShooter
 * @title Archery Range
 * @category Sports
 * @order 11
 * @newGame false
 *
 * EEG mappings:
 *   attention -> hand steadiness
 *
 * Copy of /games/archeryShooter.js (the original remains the authoritative
 * reference and MUST NOT be modified). Only this metadata header was
 * prepended; all original code below is preserved byte-for-byte.
 */
// EEG Archery
// EEG Mappings:
// attention --> hand steadiness (high focus = stable reticle, low = drift/wobble)
// meditation --> draw stability (calm = full clean draw = more power)
//
// Game: 10 arrows per session, max 100 points
// Arrow releases automatically when attention sustains above threshold
// Meditation at release determines draw power and arc consistency
// State
// "intro" --> instruction screen
// "aiming" --> player steadies aim, auto-release on attention threshold
// "flight" --> arrow in air
// "result" --> score shown briefly
// "summary" --> session complete
let gameState = "intro";
// Session tracking
const MAX_ARROWS = 10;
let arrowCount = 0;
let totalScore = 0;
let shotLog = []; // { ring, points, x, y, att, med }
// Reticle
let reticleX, reticleY; // current reticle position (screen coords)
let driftVX = 0, driftVY = 0; // drift velocity
// Shot state
let shotAtt = 0;
let shotMed = 0;
let lastRing = 0;
let lastPts = 0;
// Arrow flight animation
let arrowX, arrowY;
let arrowVX, arrowVY;
let arrowLandX = 0, arrowLandY = 0; // pre-computed landing position
let arrowActive = false;
const GRAVITY = 0.18;
// Result timer
let resultTimer = 0;
const RESULT_DUR = 110;
// Cooldown between shots
let shotCooldown = 0;
const SHOT_CD = 50;
// Key input
function keyPressed() {
if (keyCode === 32 && gameState === "summary") {
resetSession();
}
}
// Grace buffer — sustained attention triggers release
let attGrace = [];
const GRACE_WINDOW = 20;
const GRACE_THRESH = 0.62;
const ATT_THRESHOLD = 0.50;

function graceCheck(val, threshold) {
attGrace.push(val >= threshold ? 1 : 0);
if (attGrace.length > GRACE_WINDOW) attGrace.shift();
return attGrace.reduce((a, b) => a + b, 0) / attGrace.length >= GRACE_THRESH;
}
// Intro timer
let introTimer = 300;
// EEG smoothing
let attHist = [], medHist = [];
function smoothed(val, hist, n) {
hist.push(val);
if (hist.length > n) hist.shift();
return hist.reduce((a, b) => a + b, 0) / hist.length;
}
// Target definition
// Target centre in screen coords — set in setup
let targetCX, targetCY;
const TARGET_RADIUS = 70; // outer ring radius in pixels
// Ring radii (fraction of TARGET_RADIUS): 10,9,8,7,6,5,4,3,2,1
const RING_FRACS = [0.10, 0.20, 0.32, 0.44, 0.56, 0.68, 0.78, 0.86, 0.93, 1.0];
const RING_COLS = [
[255, 220, 0], // 10 — gold (innermost)
[240, 200, 0], // 9 — gold
[220, 40, 40], // 8 — red
[190, 20, 20], // 7 — red
[60, 90, 200], // 6 — blue
[40, 65, 175], // 5 — blue
[40, 40, 40], // 4 — black
[25, 25, 25], // 3 — black
[230, 230, 230], // 2 — white
[245, 245, 245], // 1 — white (outermost)
];
// Draw bow state
let drawFrac = 0; // 0 = not drawn, 1 = full draw — driven by meditation
// Setup
function setup() {
colorMode(RGB);
targetCX = width * 0.50;
targetCY = height * 0.38;
reticleX = targetCX;
reticleY = targetCY;
}
function resetSession() {
arrowCount = 0;
totalScore = 0;
shotLog = [];
attGrace = [];
attHist = [];
medHist = [];
shotCooldown = 0;
arrowActive = false;
introTimer = 300;
summaryTimer = 0;
reticleX = targetCX;

reticleY = targetCY;
driftVX = 0;
driftVY = 0;
gameState = "intro";
}
// Main draw loop
function draw() {
if (!eegData.connected) {
background(80, 120, 60);
fill(255); textAlign(CENTER, CENTER); textSize(20);
text("Connect or simulate EEG to play", width / 2, height / 2);
return;
}
let att = smoothed(eegData.attention !== undefined ? eegData.attention : 0.5, attHist, 6);
let med = smoothed(eegData.meditation !== undefined ? eegData.meditation : 0.5, medHist, 8);
// Intro
if (gameState === "intro") {
drawScene();
drawTarget();
drawBow(0.5, 0.5);
drawIntro();
if (introTimer > 0) introTimer--;
else if (graceCheck(att, ATT_THRESHOLD)) {
attGrace = [];
gameState = "aiming";
}
return;
}
// Summary
if (gameState === "summary") {
drawSummary();
return;
}
// Aiming
if (gameState === "aiming") {
if (shotCooldown > 0) shotCooldown--;
// Draw fraction driven by meditation — calm = fuller draw
drawFrac = constrain(map(med, 0.30, 0.60, 0.2, 1.0), 0.2, 1.0);
// Reticle drift — low attention = more drift
let stability = constrain(map(att, 0.35, 0.65, 0, 1), 0, 1);
let driftForce = map(stability, 0, 1, 0.6, 0.04);
let wobble = map(stability, 0, 1, 1.8, 0.0);
driftVX += random(-driftForce, driftForce) + sin(frameCount * 0.07) * wobble * 0.15;
driftVY += random(-driftForce, driftForce) + cos(frameCount * 0.05) * wobble * 0.15;
driftVX *= 0.78;
driftVY *= 0.78;
reticleX = constrain(reticleX + driftVX, targetCX - TARGET_RADIUS * 1.6, targetCX + TARGET_RADIUS * 1.6);
reticleY = constrain(reticleY + driftVY, targetCY - TARGET_RADIUS * 1.6, targetCY + TARGET_RADIUS * 1.6);
// Auto-release when sustained attention fires and cooldown clear
if (shotCooldown <= 0 && graceCheck(att, ATT_THRESHOLD)) {
releaseArrow(med);
}

drawScene();
drawTarget();
drawArrowsOnTarget();
drawReticle(stability);
drawBow(drawFrac, stability);
drawAimingHUD(att, med);
} else if (gameState === "flight") {
arrowX += arrowVX;
arrowY += arrowVY;
drawScene();
drawTarget();
drawArrowsOnTarget();
drawBow(drawFrac, 1.0);
drawFlyingArrow();
drawAimingHUD(att, med);
// Land when arrow reaches the pre-computed landing position
let dx = arrowLandX - arrowX;
let dy = arrowLandY - arrowY;
if (sqrt(dx * dx + dy * dy) < 6) {
arrowX = arrowLandX;
arrowY = arrowLandY;
scoreArrow();
}
} else if (gameState === "result") {
drawScene();
drawTarget();
drawArrowsOnTarget();
drawBow(0.3, 0.8);
drawAimingHUD(att, med);
drawResultOverlay();
resultTimer--;
if (resultTimer <= 0) {
arrowCount++;
if (arrowCount >= MAX_ARROWS) {
summaryTimer = SUMMARY_MIN;
gameState = "summary";
} else {
shotCooldown = SHOT_CD;
attGrace = [];
reticleX = targetCX;
reticleY = targetCY;
gameState = "aiming";
}
}
}
}
// Release arrow
function releaseArrow(med) {
shotAtt = smoothed(eegData.attention !== undefined ? eegData.attention : 0.5, attHist, 6);
shotMed = med;
// Score is determined by reticle position at moment of release
// with a small meditation-driven noise offset
let noiseR = map(shotMed, 0, 1, 18, 0); // low calm = more scatter
let offsetX = random(-noiseR, noiseR);
let offsetY = random(-noiseR, noiseR);

let landX = reticleX + offsetX;
let landY = reticleY + offsetY;
// Store the scored landing position for use in scoreArrow
arrowLandX = landX;
arrowLandY = landY;
// Arrow animation — starts at bow, flies toward landing position
arrowX = width / 2;
arrowY = height * 0.82;
// Velocity aimed directly at land position, scaled so it arrives in ~18 frames
let dx = landX - arrowX;
let dy = landY - arrowY;
let frames = 22;
arrowVX = dx / frames;
arrowVY = dy / frames;
arrowActive = true;
attGrace = [];
gameState = "flight";
}
// Score arrow
function scoreArrow() {
// Distance from target centre using pre-computed landing position
let dx = arrowLandX - targetCX;
let dy = arrowLandY - targetCY;
let dist = sqrt(dx * dx + dy * dy);
let ring = 0, pts = 0;
for (let i = 0; i < RING_FRACS.length; i++) {
if (dist <= TARGET_RADIUS * RING_FRACS[i]) {
ring = 10 - i;
pts = ring;
break;
}
}
if (dist > TARGET_RADIUS) { pts = 0; ring = 0; }
lastRing = ring;
lastPts = pts;
totalScore += pts;
// Clamp display position to target face
let landX = constrain(arrowLandX, targetCX - TARGET_RADIUS, targetCX + TARGET_RADIUS);
let landY = constrain(arrowLandY, targetCY - TARGET_RADIUS, targetCY + TARGET_RADIUS);
shotLog.push({
ring: ring, pts: pts,
x: landX, y: landY,
att: shotAtt, med: shotMed,
num: arrowCount + 1
});
arrowActive = false;
resultTimer = RESULT_DUR;
gameState = "result";
}
// Drawing: Scene
function drawScene() {

// Sky
for (let i = 0; i < height * 0.62; i++) {
let t = i / (height * 0.62);
stroke(lerpColor(color(100, 160, 220), color(180, 215, 245), t));
line(0, i, width, i);
}
noStroke();
// Distant tree line
fill(40, 90, 50);
beginShape();
vertex(0, height * 0.60);
for (let x = 0; x <= width; x += 18) {
let h = height * 0.60 - (noise(x * 0.04) * height * 0.10 + height * 0.02);
vertex(x, h);
}
vertex(width, height * 0.60);
endShape(CLOSE);
// Ground — grass
fill(85, 145, 65);
rect(0, height * 0.60, width, height * 0.40);
// Ground shading bands
fill(75, 130, 58);
for (let i = 0; i < 4; i++) {
let gy = height * 0.60 + i * (height * 0.10);
rect(0, gy, width, height * 0.05);
}
// Archery range line / lane markers
stroke(200, 200, 200, 80); strokeWeight(1);
line(width * 0.38, height * 0.60, width / 2 - 2, height * 0.88);
line(width * 0.62, height * 0.60, width / 2 + 2, height * 0.88);
noStroke();
// Target stand legs
fill(100, 75, 50);
noStroke();
rect(targetCX - 3, targetCY + TARGET_RADIUS - 2, 6, height * 0.22, 2);
rect(targetCX - 22, targetCY + TARGET_RADIUS + height * 0.16, 44, 8, 2);
// Ground shadow under stand
fill(0, 0, 0, 30);
ellipse(targetCX, targetCY + TARGET_RADIUS + height * 0.21, 60, 10);
}
// Drawing: Target
function drawTarget() {
// Rings from outside in
for (let i = RING_FRACS.length - 1; i >= 0; i--) {
let r = TARGET_RADIUS * RING_FRACS[i];
let col = RING_COLS[i];
fill(col[0], col[1], col[2]); noStroke();
ellipse(targetCX, targetCY, r * 2, r * 2);
// Ring border
stroke(0, 0, 0, 40); strokeWeight(0.5);
noFill();
ellipse(targetCX, targetCY, r * 2, r * 2);
noStroke();
}

// Cross hairs
stroke(0, 0, 0, 60); strokeWeight(0.5);
line(targetCX - TARGET_RADIUS, targetCY, targetCX + TARGET_RADIUS, targetCY);
line(targetCX, targetCY - TARGET_RADIUS, targetCX, targetCY + TARGET_RADIUS);
noStroke();
}
// Drawing: Arrows stuck in target
function drawArrowsOnTarget() {
for (let s of shotLog) {
// Shaft
stroke(160, 120, 60); strokeWeight(2);
line(s.x, s.y - 14, s.x, s.y + 4);
noStroke();
// Nock
fill(80, 80, 80);
ellipse(s.x, s.y - 14, 4, 4);
// Tip
fill(180, 180, 180);
triangle(s.x - 2, s.y + 2, s.x + 2, s.y + 2, s.x, s.y + 6);
// Arrow number
fill(255, 220, 0);
textAlign(CENTER, CENTER); textSize(7);
text(s.num, s.x + 6, s.y - 10);
}
}
// Drawing: Flying arrow
function drawFlyingArrow() {
if (!arrowActive) return;
let ang = atan2(arrowVY, arrowVX);
push();
translate(arrowX, arrowY);
rotate(ang);
// Shaft
stroke(160, 120, 60); strokeWeight(2);
line(-18, 0, 8, 0);
noStroke();
// Tip
fill(180, 180, 180);
triangle(8, -2, 8, 2, 14, 0);
// Fletching
fill(220, 50, 50);
triangle(-18, 0, -12, -5, -10, 0);
triangle(-18, 0, -12, 5, -10, 0);
pop();
}
// Drawing: Reticle
function drawReticle(stability) {
let alpha = map(stability, 0, 1, 100, 200);
let col = stability > 0.6 ? color(0, 220, 100, alpha) :
stability > 0.3 ? color(255, 200, 0, alpha) :
color(255, 60, 60, alpha);

// Outer ring
noFill(); stroke(col); strokeWeight(1.5);
ellipse(reticleX, reticleY, 32, 32);
// Cross hairs

let gap = 6;
line(reticleX - 16, reticleY, reticleX - gap, reticleY);
line(reticleX + gap, reticleY, reticleX + 16, reticleY);
line(reticleX, reticleY - 16, reticleX, reticleY - gap);
line(reticleX, reticleY + gap, reticleX, reticleY + 16);
// Centre dot
fill(col); noStroke();
ellipse(reticleX, reticleY, 4, 4);
noStroke();
}
// Drawing: Bow
function drawBow(drawF, stability) {
let bx = width / 2;
let by = height * 0.88;
let bh = 80; // bow limb half-height
let drawBack = drawF * 28; // how far string is drawn
// Bow limbs — curved vertical arc
stroke(100, 70, 40); strokeWeight(5); noFill();
// Left limb
arc(bx - 10, by, 30, bh * 2, PI * 0.55, PI * 1.45);
// Right limb (mirror)
arc(bx + 10, by, 30, bh * 2, PI * 1.55, PI * 0.45);
// Bow string — pulled back by drawBack
stroke(220, 210, 180); strokeWeight(1.5);
let topY = by - bh + 5;
let botY = by + bh - 5;
let stringX = bx - drawBack;
line(bx - 10, topY, stringX, by);
line(bx - 10, botY, stringX, by);
// Arrow on string
stroke(140, 100, 50); strokeWeight(2);
line(stringX, by, bx + 22, by);
// Arrow tip
fill(180, 180, 180); noStroke();
triangle(bx + 22, by - 2, bx + 22, by + 2, bx + 28, by);
// Fletching at nock
fill(220, 50, 50);
triangle(stringX, by, stringX + 7, by - 5, stringX + 8, by);
triangle(stringX, by, stringX + 7, by + 5, stringX + 8, by);
// Archer's hand on string
fill(200, 155, 110); noStroke();
ellipse(stringX - 4, by, 12, 16);
// Stability shimmer on string — shakes when low focus
if (stability < 0.5) {
let shake = map(stability, 0, 0.5, 3, 0);
stroke(255, 255, 255, 60); strokeWeight(1);
line(bx - 10, topY, stringX + random(-shake, shake), by + random(-shake, shake));
}
noStroke();
}
// Drawing: Aiming HUD
function drawAimingHUD(att, med) {
fill(0, 0, 0, 160); noStroke();

rect(0, height - 70, width, 70);
// Arrow counter
fill(255); textAlign(LEFT, CENTER); textSize(13);
text("Arrow: " + (arrowCount + 1) + " / " + MAX_ARROWS, 12, height - 52);
fill(255, 220, 50); textSize(13);
text("Score: " + totalScore, 12, height - 32);
if (shotLog.length > 0) {
fill(160); textSize(11);
text("Last: " + lastPts + " pts (" + ringName(lastRing) + ")", 12, height - 14);
}
// Attention bar with release threshold marker
let bx = width * 0.28;
drawBar(bx, height - 62, att, "Attention (steadiness)", color(255, 200, 50));
drawBar(bx + 170, height - 62, med, "Meditation (draw power)", color(100, 200, 255));
// Threshold marker — yellow line showing attention level needed to release
let bw = 140, bh = 11;
let threshX = bx + bw * ATT_THRESHOLD;
stroke(255, 255, 100); strokeWeight(1.5);
line(threshX, height - 65, threshX, height - 62 + bh + 3);
noStroke();
fill(255, 255, 100); textAlign(CENTER, BOTTOM); textSize(8);
text("RELEASE", threshX, height - 66);
// Draw power indicator
let dpx = width * 0.84;
fill(20, 20, 20, 180); noStroke();
rect(dpx, height - 62, 16, 50, 4);
fill(lerpColor(color(100, 180, 255), color(0, 220, 120), drawFrac));
rect(dpx, height - 62 + 50 * (1 - drawFrac), 16, 50 * drawFrac, 3);
fill(255); textAlign(CENTER, TOP); textSize(9);
text("DRAW", dpx + 8, height - 12);
// Cooldown
if (shotCooldown > 0) {
fill(255, 200, 50); textAlign(CENTER, CENTER); textSize(12);
text("Next arrow in " + ceil(shotCooldown / 30) + "s...", width / 2, height * 0.78);
} else if (gameState === "aiming") {
fill(200); textAlign(CENTER, CENTER); textSize(12);
text("Focus to steady your aim and release | Breathe to increase draw power", width / 2, height * 0.78);
}
}
function drawBar(x, y, val, label, col) {
let bw = 140, bh = 11;
fill(40); noStroke(); rect(x, y, bw, bh, 3);
fill(col); rect(x, y, bw * constrain(val, 0, 1), bh, 3);
noFill(); stroke(60); strokeWeight(0.5); rect(x, y, bw, bh, 3);
noStroke(); fill(255); textAlign(LEFT, TOP); textSize(10);
text(label + " " + val.toFixed(2), x, y + 13);
}
function ringName(ring) {
if (ring >= 9) return "Gold";
if (ring >= 7) return "Red";
if (ring >= 5) return "Blue";
if (ring >= 3) return "Black";
if (ring >= 1) return "White";
return "Miss";

}
// Drawing: Result overlay
function drawResultOverlay() {
fill(0, 0, 0, 155); noStroke();
rect(width * 0.28, height * 0.18, width * 0.44, height * 0.44, 12);
let col = lastPts >= 9 ? color(255, 220, 0) :
lastPts >= 7 ? color(255, 80, 80) :
lastPts >= 5 ? color(60, 90, 200) :
lastPts >= 3 ? color(60, 60, 60) :
lastPts >= 1 ? color(200, 200, 200) : color(180, 80, 80);
fill(col);
textAlign(CENTER, CENTER); textSize(32);
text(lastPts + " pts", width / 2, height * 0.28);
fill(255); textSize(16);
text(ringName(lastRing), width / 2, height * 0.36);
fill(180); textSize(12);
text("Steadiness: " + floor(shotAtt * 100) + "%", width / 2, height * 0.43);
text("Draw power: " + floor(shotMed * 100) + "%", width / 2, height * 0.49);
fill(160); textSize(11);
let remaining = MAX_ARROWS - arrowCount - 1;
text(remaining > 0 ? remaining + " arrows remaining" : "Final arrow!", width / 2, height * 0.55);
fill(255, 220, 50); textSize(13);
text("Total: " + totalScore + " / " + ((arrowCount + 1) * 10), width / 2, height * 0.61);
}
// Drawing: Intro screen
function drawIntro() {
fill(0, 0, 0, 165); noStroke();
rect(width * 0.08, height * 0.06, width * 0.84, height * 0.88, 14);
fill(255, 180, 50);
textAlign(CENTER, CENTER); textSize(28);
text("EEG Archery", width / 2, height * 0.15);
fill(255); textSize(14);
text("10 arrows. Aim for the bullseye.", width / 2, height * 0.24);
stroke(80, 60, 30); strokeWeight(1);
line(width * 0.18, height * 0.30, width * 0.82, height * 0.30);
noStroke();
fill(255, 220, 50); textSize(13);
text("STEADINESS (Attention)", width / 2, height * 0.36);
fill(200); textSize(12);
text("Your attention score controls how steady your aim is.", width / 2, height * 0.42);
text("High attention = stable reticle on the target.", width / 2, height * 0.47);
text("Low attention = the reticle drifts and wobbles.", width / 2, height * 0.52);
stroke(80, 60, 30); strokeWeight(1);
line(width * 0.18, height * 0.57, width * 0.82, height * 0.57);
noStroke();
fill(100, 200, 255); textSize(13);
text("DRAW POWER (Meditation)", width / 2, height * 0.63);

fill(200); textSize(12);
text("Your meditation score controls bow draw and arrow power.", width / 2, height * 0.69);
text("Calm breathing = full draw = greater scoring potential.", width / 2, height * 0.74);
text("The arrow releases automatically when your focus is sustained.", width / 2, height * 0.79);
fill(255, 255, 255, 180); textSize(12);
if (introTimer > 0) {
text("Please read the instructions above (" + ceil(introTimer / 30) + "s)", width / 2, height * 0.89);
} else {
text("Sustain your focus to begin", width / 2, height * 0.89);
}
}
// Drawing: Summary screen
let summaryTimer = 0; // minimum frames before restart is allowed
const SUMMARY_MIN = 180; // ~6 seconds
function drawSummary() {
if (summaryTimer > 0) summaryTimer--;
drawScene();
// Left panel — stats and shot table
fill(0, 0, 0, 175); noStroke();
rect(width * 0.04, height * 0.03, width * 0.54, height * 0.93, 12);
// Right panel — target grouping
fill(0, 0, 0, 175); noStroke();
rect(width * 0.61, height * 0.03, width * 0.35, height * 0.93, 12);
fill(255, 180, 50);
textAlign(CENTER, CENTER); textSize(24);
text("Session Complete", width * 0.31, height * 0.10);
// Stat boxes
let avg = shotLog.length > 0
? round(shotLog.reduce((a, b) => a + b.pts, 0) / shotLog.length * 10) / 10
: 0;
let best = shotLog.length > 0 ? Math.max(...shotLog.map(s => s.pts)) : 0;
let avgAtt = shotLog.length > 0
? round(shotLog.reduce((a, b) => a + b.att, 0) / shotLog.length * 100)
: 0;
let avgMed = shotLog.length > 0
? round(shotLog.reduce((a, b) => a + b.med, 0) / shotLog.length * 100)
: 0;
let sy = height * 0.17;
drawStatBox(width * 0.10, sy, "Total", totalScore + "", color(255, 220, 50));
drawStatBox(width * 0.22, sy, "Avg", avg + " pts", color(100, 220, 120));
drawStatBox(width * 0.34, sy, "Best", best + " pts", color(255, 160, 50));
drawStatBox(width * 0.46, sy, "Avg Att", avgAtt + "%", color(255, 200, 50));
// Per-shot table
let cols = [width * 0.07, width * 0.16, width * 0.26, width * 0.36, width * 0.46, width * 0.54];
fill(160); textSize(10); textAlign(CENTER, CENTER);
text("Arrow", cols[0], height * 0.33);
text("Ring", cols[1], height * 0.33);
text("Pts", cols[2], height * 0.33);
text("Steady",cols[3], height * 0.33);
text("Draw", cols[4], height * 0.33);
text("Note", cols[5], height * 0.33);

stroke(60, 50, 30); strokeWeight(1);
line(width * 0.04, height * 0.36, width * 0.57, height * 0.36);
noStroke();
for (let i = 0; i < shotLog.length; i++) {
let s = shotLog[i];
let ry = height * 0.39 + i * 13;
let note = s.pts === 10 ? "Gold!" :
s.pts >= 8 ? "Great" :
s.pts >= 6 ? "Good" :
s.pts >= 4 ? "Fair" :
s.pts >= 1 ? "Low" : "Miss";
if (i % 2 === 0) {
fill(255, 255, 255, 6); noStroke();
rect(width * 0.04, ry - 6, width * 0.54, 13);
}
fill(s.pts >= 9 ? color(255, 220, 0) : color(180));
textSize(10); textAlign(CENTER, CENTER);
text(s.num, cols[0], ry);
text(ringName(s.ring), cols[1], ry);
text(s.pts, cols[2], ry);
text(floor(s.att*100)+"%", cols[3], ry);
text(floor(s.med*100)+"%", cols[4], ry);
fill(s.pts >= 9 ? color(255,220,0) : color(140));
text(note, cols[5], ry);
}
// Target face with all shots plotted — right panel
let tfX = width * 0.785;
let tfY = height * 0.48;
let tfR = min(width * 0.14, height * 0.20);
fill(200); textAlign(CENTER, CENTER); textSize(13);
text("Shot Grouping", tfX, height * 0.11);
// Mini target rings
for (let i = RING_FRACS.length - 1; i >= 0; i--) {
let r = tfR * RING_FRACS[i];
let col = RING_COLS[i];
fill(col[0], col[1], col[2]); noStroke();
ellipse(tfX, tfY, r * 2, r * 2);
stroke(0, 0, 0, 30); strokeWeight(0.5); noFill();
ellipse(tfX, tfY, r * 2, r * 2);
noStroke();
}
// Cross hairs
stroke(0, 0, 0, 50); strokeWeight(0.5);
line(tfX - tfR, tfY, tfX + tfR, tfY);
line(tfX, tfY - tfR, tfX, tfY + tfR);
noStroke();
// Plot shots scaled to mini target
for (let s of shotLog) {
let relX = (s.x - targetCX) / TARGET_RADIUS * tfR;
let relY = (s.y - targetCY) / TARGET_RADIUS * tfR;
fill(255, 220, 50, 220); noStroke();
ellipse(tfX + relX, tfY + relY, 8, 8);
fill(30); textSize(7); textAlign(CENTER, CENTER);

text(s.num, tfX + relX, tfY + relY);
}
// Ring score legend — colour swatch + label + points
let lx = width * 0.635;
let ly = height * 0.76;
let sw = 11; // swatch size
let gap = 16; // row spacing
let legendItems = [
{ col: [255, 220, 0], label: "Gold", pts: "9-10" },
{ col: [220, 40, 40], label: "Red", pts: "7-8" },
{ col: [60, 90, 200], label: "Blue", pts: "5-6" },
{ col: [40, 40, 40], label: "Black", pts: "3-4" },
{ col: [230, 230, 230], label: "White", pts: "1-2" },
];
for (let i = 0; i < legendItems.length; i++) {
let item = legendItems[i];
let ry = ly + i * gap;
// Colour swatch
fill(item.col[0], item.col[1], item.col[2]); noStroke();
rect(lx, ry - sw * 0.5, sw, sw, 2);
// Thin border on light swatches so they show against dark background
if (item.col[0] > 180 && item.col[1] > 180) {
stroke(150); strokeWeight(0.5);
rect(lx, ry - sw * 0.5, sw, sw, 2);
noStroke();
}
// Label and points
fill(200); textAlign(LEFT, CENTER); textSize(10);
text(item.label, lx + sw + 6, ry);
fill(160); textAlign(RIGHT, CENTER);
text(item.pts + " pts", lx + 100, ry);
}
// Performance message
let perf = totalScore >= 80 ? "Outstanding. Exceptional focus and breath control throughout." :
totalScore >= 60 ? "Strong session. Your attention steadied well under pressure." :
totalScore >= 40 ? "Developing well. Sustained attention will tighten your grouping." :
"Keep practising — focus on holding attention before each release.";

fill(160, 255, 160); textSize(11); textAlign(CENTER, CENTER);
text(perf, width * 0.31, height * 0.88);
fill(255, 220, 50, 180); textSize(12);
text("Press SPACE to shoot again", width * 0.31, height * 0.93);
}
function drawStatBox(x, y, label, val, col) {
fill(20, 20, 35); noStroke();
rect(x - 36, y, 72, 46, 6);
fill(col); textAlign(CENTER, CENTER); textSize(16);
text(val, x, y + 20);
fill(160); textSize(9);
text(label, x, y + 36);
}