/**
 * @id bballShooter
 * @title Basketball
 * @category Sports
 * @order 12
 * @newGame false
 *
 * EEG mappings:
 *   attention -> shot accuracy
 *
 * Copy of /games/bballShooter.js (the original remains the authoritative
 * reference and MUST NOT be modified). Only this metadata header was
 * prepended; all original code below is preserved byte-for-byte.
 */
// EEG Basketball
// EEG Mappings:
// attention --> shot accuracy (high focus = aim stays on hoop)
// meditation --> arc angle (calm = cleaner arc angle)
// State
let gameState = "intro";
// Session
const SESSION_SECONDS = 45;
const FPS = 30;
let sessionFrames = SESSION_SECONDS * FPS;
let shotsMade = 0;
let shotsAttempted = 0;
let totalScore = 0;
let currentStreak = 0;
let bestStreak = 0;
let shotLog = [];
// Hoop — fixed on screen, backboard always centred
// hoopX slides to a new position between shots
let hoopX = 0; // set in initSession()
let hoopY = 0; // set in initSession()
let hoopTargetX = 0;
const HOOP_R = 22; // rim half-width for collision
// Ball
// Ball travels along a quadratic bezier arc
// flightT goes 0→1 over FLIGHT_FRAMES frames
let ballX = 0;
let ballY = 0;
let flightT = 0;
const FLIGHT_FRAMES = 42;
// Bezier control points (set at release)
let bz0x, bz0y, bz1x, bz1y, bz2x, bz2y;
// Aim drift (attention-driven)
let aimDrift = 0;
let aimDriftV = 0;
// Grace buffer for auto-release
let graceCount = 0;
const GRACE_NEEDED = 10; // frames attention must stay above threshold
const ATT_THRESHOLD = 0.46;
// Shot result
let resultTimer = 0;
const RESULT_FRAMES = 52;
// Visual
let netSwish = 0;
let cheerTimer = 0;
// Snapshotted EEG at release
let shotAtt = 0.5;
let shotMed = 0.5;
// Intro timer
let introTimer = 300;

// Summary
let summaryReady = false;
// EEG smoothing
let attHist = [];
let medHist = [];
function smoothed(val, hist, n) {
hist.push(val);
if (hist.length > n) hist.shift();
return hist.reduce((a, b) => a + b, 0) / hist.length;
}
// Quadratic bezier
function bzPoint(t, p0, p1, p2) {
let mt = 1 - t;
return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}
// Key input
function keyPressed() {
if (keyCode === 32 && gameState === "intro" && introTimer <= 0) {
initSession();
}
if (keyCode === 32 && gameState === "summary" && summaryReady) {
attHist = []; medHist = [];
summaryReady = false;
introTimer = 300;
gameState = "intro";
}
}
// Setup
function setup() {
colorMode(RGB);
}
// Init / reset
function initSession() {
sessionFrames = SESSION_SECONDS * FPS;
shotsMade = 0;
shotsAttempted = 0;
totalScore = 0;
currentStreak = 0;
bestStreak = 0;
shotLog = [];
netSwish = 0;
cheerTimer = 0;
// Positions are valid here — called from keyPressed at runtime
hoopX = width * 0.50;
hoopY = height * 0.35;
hoopTargetX = hoopX;
ballX = width * 0.50;
ballY = height * 0.74;
aimDrift = 0;
aimDriftV = 0;
graceCount = 0;
gameState = "aiming";
}
// Called after each shot result clears

function prepareNextShot() {
// Move hoop to previously chosen target
hoopX = constrain(hoopTargetX, width * 0.20, width * 0.80);
// Pick next target for the shot after this one
hoopTargetX = width / 2 + (random() > 0.5 ? 1 : -1) * random(width * 0.06, width * 0.26);
hoopTargetX = constrain(hoopTargetX, width * 0.20, width * 0.80);
// Reset ball
ballX = width * 0.50;
ballY = height * 0.74;
aimDrift = 0;
aimDriftV = 0;
graceCount = 0;
gameState = "aiming";
}
// Release
function doRelease(att, med) {
shotAtt = att;
shotMed = med;
shotsAttempted++;
graceCount = 0;
// Arc start
bz0x = ballX;
bz0y = ballY;
// Arc end — hoop centre adjusted by aim drift and med offset
let medOffset = map(med, 0.2, 0.7, 16, 0);
bz2x = hoopX + aimDrift;
bz2y = hoopY + medOffset;
// Arc peak control point — midway horizontally, well above both ends
bz1x = (bz0x + bz2x) * 0.5;
bz1y = min(bz0y, bz2y) - height * 0.30;
flightT = 0;
gameState = "flight";
}
// Score registration
function registerResult(made) {
let pts = 0;
if (made) {
shotsMade++;
currentStreak++;
bestStreak = max(bestStreak, currentStreak);
pts = 2 + (currentStreak >= 3 ? floor(currentStreak / 3) : 0);
totalScore += pts;
netSwish = 1.0;
cheerTimer = 60;
} else {
currentStreak = 0;
}
shotLog.push({ made: made, att: shotAtt, med: shotMed, pts: pts });
resultTimer = RESULT_FRAMES;
gameState = made ? "scored" : "missed";
}
// Main draw
function draw() {
if (!eegData.connected) {

background(20, 14, 8);
fill(255); textAlign(CENTER, CENTER); textSize(20);
text("Connect or simulate EEG to play", width / 2, height / 2);
return;
}
let att = smoothed(eegData.attention !== undefined ? eegData.attention : 0.5, attHist, 6);
let med = smoothed(eegData.meditation !== undefined ? eegData.meditation : 0.5, medHist, 8);
netSwish = max(0, netSwish - 0.032);
cheerTimer = max(0, cheerTimer - 1);
// Intro
if (gameState === "intro") {
if (hoopX === 0) { hoopX = width * 0.5; hoopY = height * 0.35; }
if (ballX === 0) { ballX = width * 0.5; ballY = height * 0.74; }
drawCourt();
drawHoop(hoopX, hoopY);
drawBall(ballX, ballY);
drawIntro();
if (introTimer > 0) introTimer--;
return;
}
// Summary
if (gameState === "summary") {
drawSummary();
return;
}
// Aiming
if (gameState === "aiming") {
sessionFrames--;
// Drift
let stab = constrain(map(att, 0.28, 0.65, 0, 1), 0, 1);
let force = map(stab, 0, 1, 1.2, 0.04);
aimDriftV += random(-force, force);
aimDriftV *= 0.82;
aimDrift += aimDriftV;
aimDrift = constrain(aimDrift, -width * 0.20, width * 0.20);
// Grace buffer — count consecutive frames above threshold
if (att >= ATT_THRESHOLD) {
graceCount++;
} else {
graceCount = 0;
}
if (graceCount >= GRACE_NEEDED) {
doRelease(att, med);
} else {
drawCourt();
drawArcPreview(att, med);
drawHoop(hoopX, hoopY);
drawBall(ballX, ballY);
drawHUD(att, med);
if (sessionFrames <= 0) { summaryReady = false; gameState = "summary"; }
}
return;
}

// Flight
if (gameState === "flight") {
sessionFrames--;
flightT += 1.0 / FLIGHT_FRAMES;
flightT = min(flightT, 1.0);
ballX = bzPoint(flightT, bz0x, bz1x, bz2x);
ballY = bzPoint(flightT, bz0y, bz1y, bz2y);
drawCourt();
drawHoop(hoopX, hoopY);
drawBall(ballX, ballY);
drawHUD(att, med);
// Collision check at end of arc
if (flightT >= 1.0) {
let dist = abs(bz2x - hoopX);
registerResult(dist <= HOOP_R - 8);
}
if (sessionFrames <= 0 && gameState === "flight") {
summaryReady = false; gameState = "summary";
}
return;
}
// Scored
if (gameState === "scored") {
drawCourt();
drawHoop(hoopX, hoopY);
drawBall(ballX, ballY);
drawHUD(att, med);
drawResultOverlay(true);
resultTimer--;
if (resultTimer <= 0) {
if (sessionFrames <= 0) { summaryReady = false; gameState = "summary"; }
else prepareNextShot();
}
return;
}
// Missed
if (gameState === "missed") {
drawCourt();
drawHoop(hoopX, hoopY);
drawBall(ballX, ballY);
drawHUD(att, med);
drawResultOverlay(false);
resultTimer--;
if (resultTimer <= 0) {
if (sessionFrames <= 0) { summaryReady = false; gameState = "summary"; }
else prepareNextShot();
}
return;
}
}
// Drawing: Court
function drawCourt() {
background(18, 12, 8);

// Crowd area
fill(25, 18, 12); noStroke();
rect(0, 0, width, height * 0.54);
// Tiered stands
fill(32, 24, 16);
for (let t = 0; t < 5; t++) {
rect(0, height * 0.04 + t * height * 0.068, width, height * 0.062);
}
// Crowd
let cc = [
[220,30,30],[255,255,255],[0,80,180],[255,180,0],
[0,140,60],[180,0,180],[255,100,0],[0,180,200]
];
let fw = 12, fg = 1;
for (let row = 0; row < 5; row++) {
let ry = height * 0.07 + row * height * 0.068;
let off = row % 2 === 0 ? 0 : (fw + fg) * 0.5;
let bop = 0;
for (let col = 0; col < floor(width / (fw + fg)) + 1; col++) {
let cx = col * (fw + fg) + off;
if (cx > width + fw) continue;
let ci = (col * 3 + row * 7 + col % 5) % 8;
let jc = cc[ci];
fill(jc[0], jc[1], jc[2]); noStroke();
rect(cx - fw * 0.45, ry + bop, fw * 0.9, 9, 1);
let sv = 175 + (col * 11 + row * 13) % 55;
fill(sv, floor(sv * 0.78), floor(sv * 0.65));
ellipse(cx, ry - 4 + bop, fw * 0.7, fw * 0.72);
}
}
// Scoreboard
fill(20, 20, 28); noStroke();
rect(width * 0.36, height * 0.02, width * 0.28, height * 0.10, 6);
fill(255, 80, 80);
rect(width * 0.36, height * 0.02, width * 0.28, 4, 4);
fill(255, 220, 50); textAlign(CENTER, CENTER); textSize(18);
text(totalScore, width / 2, height * 0.058);
fill(160); textSize(9);
text(shotsMade + " / " + shotsAttempted + " made", width / 2, height * 0.095);
let secsLeft = ceil(sessionFrames / FPS);
fill(secsLeft <= 10 ? color(255,80,80) : color(200,255,200)); textSize(11);
text(secsLeft + "s", width / 2, height * 0.116);
// Hardwood floor
for (let i = 0; i < height * 0.46; i++) {
let t = i / (height * 0.46);
stroke(lerpColor(color(175,118,52), color(138,88,38), t));
line(0, height * 0.54 + i, width, height * 0.54 + i);
}
noStroke();
// Court lines
stroke(200,158,76,110); strokeWeight(2); noFill();
arc(width/2, height * 1.06, width * 0.80, height * 0.68, PI, TWO_PI);
line(width * 0.22, height * 0.72, width * 0.78, height * 0.72);
rect(width * 0.33, height * 0.72, width * 0.34, height * 0.28);
noStroke();
fill(175,58,58,28);

rect(width * 0.33, height * 0.72, width * 0.34, height * 0.28);
// Backboard — follows hoopX
let bbX = hoopX;
fill(240,240,255,220); noStroke();
rect(bbX - 42, hoopY - 50, 84, 48, 3);
fill(200,200,220);
rect(bbX - 42, hoopY - 50, 84, 4, 2);
stroke(255,80,80,150); strokeWeight(2); noFill();
rect(bbX - 17, hoopY - 36, 34, 22, 2);
noStroke();
fill(155,155,170);
rect(bbX - 4, hoopY + 2, 8, height * 0.22, 2);
}
// Drawing: Hoop
function drawHoop(hx, hy) {
let hr = HOOP_R;
// Net
let nc = netSwish > 0 ? color(255,255,180,200) : color(210,210,210,150);
stroke(nc); strokeWeight(1.2);
let nd = 20 + netSwish * 8;
for (let i = 0; i <= 6; i++) {
let nx = lerp(hx - hr, hx + hr, i / 6);
let nby = hy + nd * (1 - abs(i / 3 - 1) * 0.3);
line(nx, hy, nx + (hx - nx) * 0.18, nby);
}
for (let j = 1; j <= 3; j++) {
let t = j / 4;
let ny = hy + nd * t;
let nw = hr * (1 - t * 0.35);
line(hx - nw, ny, hx + nw, ny);
}
noStroke();
// Rim
stroke(218,76,18); strokeWeight(5); noFill();
line(hx - hr, hy, hx + hr, hy);
arc(hx, hy, hr * 2, hr * 0.7, 0, PI);
noStroke();
stroke(255,115,38,140); strokeWeight(2); noFill();
line(hx - hr, hy - 2, hx + hr, hy - 2);
noStroke();
}
// Drawing: Ball
function drawBall(bx, by) {
let r = 15;
fill(0,0,0,35); noStroke();
ellipse(bx, by + r + 3, r * 2.4, 7);
fill(208,98,28); noStroke();
ellipse(bx, by, r * 2, r * 2);
stroke(138,58,14); strokeWeight(1.5); noFill();
arc(bx, by, r * 2, r * 2, -PI * 0.1, PI * 1.1);
arc(bx, by, r * 2, r * 2, PI * 0.9, PI * 2.1);
line(bx, by - r, bx, by + r);
noStroke();
fill(255,155,75,130);
ellipse(bx - r * 0.28, by - r * 0.28, r * 0.65, r * 0.65);
}

// Drawing: Arc preview
function drawArcPreview(att, med) {
let stab = constrain(map(att, 0.28, 0.65, 0, 1), 0, 1);
let alpha = map(stab, 0, 1, 25, 88);
let err = abs(aimDrift);
let col = err < 25 ? color(0,220,100,alpha) :
err < 70 ? color(255,200,50,alpha) :
color(255,80,80,alpha);
let medOffset = map(med, 0.2, 0.7, 16, 0);
let p0x = ballX, p0y = ballY;
let p2x = hoopX + aimDrift;
let p2y = hoopY + medOffset;
let p1x = (p0x + p2x) * 0.5;
let p1y = min(p0y, p2y) - height * 0.30;
stroke(col); strokeWeight(1.5); noFill();
beginShape();
for (let t = 0; t <= 1; t += 0.04) {
vertex(bzPoint(t, p0x, p1x, p2x), bzPoint(t, p0y, p1y, p2y));
}
endShape();
noStroke();
fill(col); noStroke();
ellipse(p2x, p2y, 9, 9);
}
// Drawing: HUD
function drawHUD(att, med) {
fill(0,0,0,155); noStroke();
rect(0, height - 62, width, 62);
if (currentStreak >= 2) {
fill(255,220,50); textAlign(LEFT,CENTER); textSize(13);
text(currentStreak + "x STREAK!", 12, height - 42);
}
for (let i = max(0, shotLog.length - 10); i < shotLog.length; i++) {
let s = shotLog[i];
let dx = (i - max(0, shotLog.length - 10)) * 16 + 12;
fill(s.made ? color(0,220,100) : color(255,60,60)); noStroke();
ellipse(dx + 8, height - 20, 10, 10);
}
let bx = width * 0.30;
drawBar(bx, height - 54, att, "Attention (aim + release)", color(255,200,50));
drawBar(bx + 170, height - 54, med, "Meditation (arc angle)", color(100,200,255));
let threshX = bx + 140 * ATT_THRESHOLD;
stroke(255,255,100); strokeWeight(1.5);
line(threshX, height - 57, threshX, height - 40);
noStroke();
fill(255,255,100); textAlign(CENTER,BOTTOM); textSize(8);
text("SHOOT", threshX, height - 58);
}
function drawBar(x, y, val, label, col) {
let bw = 140, bh = 11;
fill(40); noStroke(); rect(x, y, bw, bh, 3);
fill(col); rect(x, y, bw * constrain(val, 0, 1), bh, 3);

noFill(); stroke(60); strokeWeight(0.5); rect(x, y, bw, bh, 3);
noStroke(); fill(255); textAlign(LEFT,TOP); textSize(9);
text(label + " " + val.toFixed(2), x, y + 13);
}
// Drawing: Result overlays
function drawResultOverlay(made) {
if (made) {
let pts = shotLog.length > 0 ? shotLog[shotLog.length - 1].pts : 2;
fill(0,160,70,160); noStroke();
rect(width * 0.30, height * 0.22, width * 0.40, height * 0.25, 12);
fill(255,220,50); textAlign(CENTER,CENTER); textSize(30);
text("NICE!", width / 2, height * 0.30);
fill(255); textSize(16);
text("+" + pts + " pts", width / 2, height * 0.37);
if (currentStreak >= 3) {
fill(255,180,50); textSize(12);
text(currentStreak + "x streak bonus!", width / 2, height * 0.43);
}
} else {
fill(0,0,0,130); noStroke();
rect(width * 0.32, height * 0.22, width * 0.36, height * 0.17, 12);
fill(255,80,80); textAlign(CENTER,CENTER); textSize(22);
text("Miss", width / 2, height * 0.28);
fill(160); textSize(11);
text("Stay focused", width / 2, height * 0.34);
}
}
// Drawing: Intro
function drawIntro() {
fill(0,0,0,170); noStroke();
rect(width * 0.08, height * 0.06, width * 0.84, height * 0.88, 14);
fill(255,140,30); textAlign(CENTER,CENTER); textSize(28);
text("EEG Basketball", width / 2, height * 0.14);
fill(255); textSize(13);
text("45 seconds. Score as many baskets as possible.", width / 2, height * 0.22);
stroke(100,60,20); strokeWeight(1);
line(width * 0.18, height * 0.27, width * 0.82, height * 0.27);
noStroke();
fill(255,220,50); textSize(13);
text("SHOT ACCURACY (Attention)", width / 2, height * 0.33);
fill(200); textSize(12);
text("High focus keeps the aim on the hoop.", width / 2, height * 0.39);
text("Low attention causes the aim to drift away from the basket.", width / 2, height * 0.44);
text("The arc preview shows where the shot will land.", width / 2, height * 0.49);
stroke(100,60,20); strokeWeight(1);
line(width * 0.18, height * 0.54, width * 0.82, height * 0.54);
noStroke();
fill(100,200,255); textSize(13);
text("ARC ANGLE (Meditation)", width / 2, height * 0.60);
fill(200); textSize(12);
text("A calm state produces a cleaner arc toward the hoop.", width / 2, height * 0.66);
text("Low meditation introduces a downward offset, pulling the shot short.", width / 2, height * 0.71);

fill(255,180,50); textSize(12);
text("Consecutive makes build a streak bonus for extra points.", width / 2, height * 0.78);
fill(255,255,255,180); textSize(12);
if (introTimer > 0) {
text("Please read above (" + ceil(introTimer / 30) + "s)", width / 2, height * 0.89);
} else {
text("Press SPACE to tip off", width / 2, height * 0.89);
}
}
// Drawing: Summary
function drawSummary() {
if (!summaryReady) summaryReady = true;
drawCourt();
fill(0,0,0,185); noStroke();
rect(width * 0.04, height * 0.03, width * 0.92, height * 0.92, 14);
fill(255,140,30); textAlign(CENTER,CENTER); textSize(26);
text("Final Buzzer", width / 2, height * 0.10);
let pct = shotsAttempted > 0 ? round(shotsMade / shotsAttempted * 100) : 0;
let avgAtt = shotLog.length > 0
? round(shotLog.reduce((a,b) => a + b.att, 0) / shotLog.length * 100) : 0;
let sy = height * 0.17;
drawStatBox(width * 0.14, sy, "Score", totalScore + "", color(255,220,50));
drawStatBox(width * 0.32, sy, "Made", shotsMade + "/" + shotsAttempted, color(0,220,100));
drawStatBox(width * 0.50, sy, "FG%", pct + "%", color(255,180,50));
drawStatBox(width * 0.68, sy, "Best Streak", bestStreak + "x", color(255,140,30));
drawStatBox(width * 0.86, sy, "Avg Focus", avgAtt + "%", color(255,200,50));
fill(180); textSize(12); textAlign(CENTER,CENTER);
text("Attention per Shot", width / 2, height * 0.38);
let cx = width * 0.06, cy = height * 0.42;
let cw = width * 0.88, ch = height * 0.18;
fill(18,12,8); noStroke(); rect(cx, cy, cw, ch, 4);
if (shotLog.length > 0) {
let bw = cw / shotLog.length;
for (let i = 0; i < shotLog.length; i++) {
let s = shotLog[i];
let bh = s.att * ch;
fill(s.made ? color(0,220,100) : color(255,60,60)); noStroke();
rect(cx + i * bw + 1, cy + ch - bh, bw - 2, bh, 1);
fill(160); textSize(8); textAlign(CENTER,TOP);
text(i + 1, cx + i * bw + bw / 2, cy + ch + 3);
}
}
fill(0,220,100); noStroke(); rect(cx, cy + ch + 16, 10, 10, 2);
fill(200); textAlign(LEFT,CENTER); textSize(10);
text("Made", cx + 14, cy + ch + 21);
fill(255,60,60); noStroke(); rect(cx + 58, cy + ch + 16, 10, 10, 2);
fill(200); text("Missed", cx + 72, cy + ch + 21);
fill(180); textSize(11); textAlign(CENTER,CENTER);
text("Shot Results", width / 2, height * 0.70);
let maxDots = shotLog.length;

let dotSize = constrain(map(maxDots, 10, 25, 14, 9), 9, 14);
let dotSpacing = dotSize + 4;
let dotStartX = width / 2 - (maxDots * dotSpacing) / 2;
for (let i = 0; i < maxDots; i++) {
let s = shotLog[i];
fill(s.made ? color(0,220,100) : color(255,60,60)); noStroke();
ellipse(dotStartX + i * dotSpacing + dotSpacing / 2, height * 0.75, dotSize, dotSize);
fill(255); textAlign(CENTER,CENTER); textSize(constrain(dotSize - 5, 6, 8));
text(s.pts > 0 ? "+" + s.pts : "x", dotStartX + i * dotSpacing + dotSpacing / 2, height * 0.75);
}
let perf = pct >= 70 ? "Outstanding shooting. Excellent focus and composure throughout." :
pct >= 50 ? "Strong session. Good attentional control throughout." :
pct >= 30 ? "Developing well. Keep your focus steady to hold the aim on target." :
"Keep practising — sustained attention is the key to a clean shot.";
fill(160,255,160); textSize(11); textAlign(CENTER,CENTER);
text(perf, width / 2, height * 0.84);
fill(255,220,50,200); textSize(12);
text("Press SPACE to shoot again", width / 2, height * 0.91);
}
function drawStatBox(x, y, label, val, col) {
fill(18,12,8); noStroke();
rect(x - 44, y, 88, 52, 8);
fill(col); textAlign(CENTER,CENTER); textSize(14);
text(val, x, y + 20);
fill(160); textSize(9);
text(label, x, y + 38);
}