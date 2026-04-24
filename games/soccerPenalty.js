/**
 * @id soccerPenalty
 * @title Soccer Shoot-Out
 * @category Sports
 * @order 13
 * @newGame false
 *
 * EEG mappings:
 *   attention -> reticle stability
 *
 * Copy of /games/soccerPenalty.js (the original remains the authoritative
 * reference and MUST NOT be modified). Only this metadata header was
 * prepended; all original code below is preserved byte-for-byte.
 */
// EEG Soccer Shoot-Out
// attention --> reticle stability (high = steady aim)
// theta --> kick trigger (crosses 0.40 threshold)
// beta --> goalkeeper speed
// State
// "waiting" → brief pause between shots showing feedback
// "aiming" → player controls reticle
// "shooting"→ ball in flight
// "result" → GOAL / SAVED overlay before next shot
let gameState = "aiming";
// Ball
let ballX, ballY, ballVX, ballVY;
let ballStartX, ballStartY;
// Reticle
let reticleX, reticleY;
let driftX = 0, driftY = 0;
// Goalkeeper
let keeperX, keeperY;
let keeperW = 52, keeperH = 76;
let keeperDir = 1;
// Goal
let goalX, goalY, goalW, goalH;
let postW = 8;
// Scoring
let shots = 0, goals = 0;
let lastResult = "";
let lastFocusScore = 0; // EEG quality at moment of kick (reticle position)
let lastShotAccuracy = 0; // Whether shot was on target (0 or 100)
let totalFocusScore = 0;
// Timers
let resultTimer = 0;
let waitTimer = 0;
const RESULT_DUR = 120; // frames to show GOAL/SAVED
const WAIT_DUR = 90; // frames of "get ready" pause (~3 seconds at ~30fps)
// Kick cooldown
let kickCooldown = 0;
const KICK_CD = 120;
// EEG smoothing
let attHist = [], thetaHist = [], betaHist = [];
function smoothed(val, hist, n) {
hist.push(val);
if (hist.length > n) hist.shift();
return hist.reduce((a, b) => a + b, 0) / hist.length;
}
// Setup
function setup() {
colorMode(RGB);
goalW = width * 0.44;
goalH = height * 0.20;

goalX = width / 2 - goalW / 2;
goalY = height * 0.06;
keeperX = width / 2 - keeperW / 2;
keeperY = goalY + goalH - keeperH + 4;
ballStartX = width / 2;
ballStartY = height * 0.77;
resetBall();
}
function resetBall() {
ballX = ballStartX;
ballY = ballStartY;
ballVX = 0;
ballVY = 0;
reticleX = width / 2;
reticleY = goalY + goalH * 0.45;
// Start with a random drift so reticle never begins perfectly centred
driftX = random(-35, 35);
driftY = random(-18, 18);
}
// Main draw loop
function draw() {
if (!eegData.connected) {
background(34, 139, 34);
fill(255); textAlign(CENTER, CENTER); textSize(20);
text("Connect or simulate EEG to play", width / 2, height / 2);
return;
}
// Read EEG
let att = smoothed(eegData.attention !== undefined ? eegData.attention : 0.5, attHist, 5);
let theta = smoothed(eegData.theta !== undefined ? eegData.theta : 0.3, thetaHist, 5);
let beta = smoothed(eegData.beta !== undefined ? eegData.beta : 0.3, betaHist, 5);
// Update logic by state
if (gameState === "waiting") {
waitTimer--;
if (waitTimer <= 0) {
resetBall();
gameState = "aiming";
}
}
if (gameState === "aiming") {
// Keeper moves
let spd = constrain(map(beta, 0.2, 0.6, 1.5, 5.5), 1.5, 5.5);
keeperX += keeperDir * spd;
if (keeperX <= goalX + postW) { keeperX = goalX + postW; keeperDir = 1; }
if (keeperX + keeperW >= goalX + goalW - postW) { keeperX = goalX + goalW - keeperW - postW; keeperDir = -1; }
// Reticle drift — stronger accumulation, less damping, can drift outside goal
let driftMag = constrain(map(att, 0.38, 0.55, 40, 3), 3, 40);
driftX += random(-driftMag, driftMag) * 0.35;
driftY += random(-driftMag, driftMag) * 0.28;
driftX *= 0.92;
driftY *= 0.92;
// Constrain to a wider area — reticle can drift outside goal (bad shots are possible)

reticleX = constrain(width / 2 + driftX, goalX - 20, goalX + goalW + 20);
reticleY = constrain(goalY + goalH * 0.45 + driftY, goalY - 10, goalY + goalH + 10);
// Kick trigger
if (kickCooldown > 0) kickCooldown--;
if (kickCooldown <= 0 && theta > 0.40) {
fireKick();
}
}
if (gameState === "shooting") {
ballX += ballVX;
ballY += ballVY;
if (ballY <= goalY + goalH || ballY < -40 || ballX < -40 || ballX > width + 40) {
resolveKick();
}
}
if (gameState === "result") {
resultTimer--;
if (resultTimer <= 0) {
gameState = "waiting";
waitTimer = WAIT_DUR;
}
}
// Draw
drawBackground();
drawGoal();
drawKeeper();
drawBall();
if (gameState === "aiming") drawReticle(theta);
drawHUD(att, beta, theta);
if (gameState === "result") drawResultOverlay();
if (gameState === "waiting") drawGetReady();
}
// Fire kick
function fireKick() {
gameState = "shooting";
kickCooldown = KICK_CD;
let dx = reticleX - ballX;
let dy = reticleY - ballY;
let mag = sqrt(dx * dx + dy * dy);
ballVX = (dx / mag) * 17;
ballVY = (dy / mag) * 17;
shots++;
// Focus Score: measures EEG quality at kick moment (reticle closeness to goal centre)
// 100% = dead centre, 0% = at or beyond goal edge — always reflects mental state
let cx = goalX + goalW / 2, cy = goalY + goalH / 2;
let maxD = sqrt((goalW/2)*(goalW/2) + (goalH/2)*(goalH/2));
lastFocusScore = round(constrain(map(dist(reticleX, reticleY, cx, cy), 0, maxD, 100, 0), 0, 100));
// Shot Accuracy: was the reticle actually on target (inside the goal)?
let onTarget = reticleX > goalX + postW && reticleX < goalX + goalW - postW;
lastShotAccuracy = onTarget ? 100 : 0;
}

// Resolve kick
function resolveKick() {
if (gameState !== "shooting") return;
gameState = "result";
resultTimer = RESULT_DUR;
let inGoal = ballX > goalX + postW && ballX < goalX + goalW - postW &&
ballY > goalY && ballY < goalY + goalH;
let keeperBlocked = ballX > keeperX && ballX < keeperX + keeperW &&
ballY > keeperY && ballY < keeperY + keeperH;
if (inGoal && !keeperBlocked) {
goals++;
lastResult = "GOAL!";
} else {
lastResult = inGoal ? "SAVED!" : "MISSED!";
}
totalFocusScore += lastFocusScore;
}
// Draw: Background & field
function drawBackground() {
// Green gradient field
for (let i = 0; i < height; i++) {
let t = i / height;
stroke(lerpColor(color(20, 100, 20), color(40, 160, 40), t));
line(0, i, width, i);
}
noStroke();
// Crowd stand
fill(30, 15, 50);
rect(0, 0, width, height * 0.13);
// Crowd rows
let rowCount = 4;
let standH = height * 0.12;
let rowH = standH / rowCount;
let figW = 22; // spacing between figures
for (let row = 0; row < rowCount; row++) {
let yBase = rowH * row + rowH * 0.55;
let cols = floor(width / figW);
for (let c = 0; c < cols; c++) {
let cx = c * figW + figW / 2;
let hue = (c * 41 + row * 97) % 360;
colorMode(HSB, 360, 100, 100);
fill(hue, 75, 85);
colorMode(RGB);
rect(cx - 7, yBase, 14, 13, 2);
fill(210, 170, 130);
ellipse(cx, yBase - 6, 11, 11);
}
}
// Pitch markings
stroke(255, 255, 255, 55);
strokeWeight(2);
noFill();
arc(width / 2, ballStartY, width * 0.5, height * 0.35, PI, TWO_PI);
let pbW = width * 0.54, pbH = height * 0.18;

rect(width/2 - pbW/2, ballStartY - pbH * 0.05, pbW, pbH * 0.55);
fill(255, 255, 255, 100);
noStroke();
ellipse(width/2, ballStartY - 8, 8, 8);
}
// Draw: Goal
function drawGoal() {
fill(0, 0, 0, 30);
noStroke();
rect(goalX + 3, goalY + 3, goalW, goalH);
fill(0, 0, 0, 55);
rect(goalX, goalY, goalW, goalH);
stroke(255, 255, 255, 30);
strokeWeight(0.8);
for (let y = goalY; y <= goalY + goalH; y += 13) line(goalX, y, goalX + goalW, y);
for (let x = goalX; x <= goalX + goalW; x += 13) line(x, goalY, x, goalY + goalH);
fill(230, 230, 230);
noStroke();
rect(goalX, goalY - 6, postW, goalH + 6, 2);
rect(goalX + goalW - postW, goalY - 6, postW, goalH + 6, 2);
rect(goalX, goalY - 6, goalW, postW + 2, 2);
fill(160, 160, 160, 100);
rect(goalX + 2, goalY - 4, 3, goalH + 4);
rect(goalX + goalW - postW + 2, goalY - 4, 3, goalH + 4);
}
// Draw: Keeper
function drawKeeper() {
let kx = keeperX;
let ky = keeperY;
let cx = kx + keeperW / 2;
fill(255, 100, 0);
noStroke();
rect(kx + 8, ky + 20, keeperW - 16, keeperH * 0.42, 4);
fill(0, 0, 180);
rect(kx + 10, ky + 20 + keeperH * 0.38, keeperW - 20, 15, 3);
fill(255, 200, 150);
rect(kx + 10, ky + 20 + keeperH * 0.52, 12, 20, 3);
rect(kx + keeperW - 22, ky + 20 + keeperH * 0.52, 12, 20, 3);
fill(30);
rect(kx + 8, ky + 20 + keeperH * 0.52 + 18, 16, 7, 2);
rect(kx + keeperW - 24, ky + 20 + keeperH * 0.52 + 18, 16, 7, 2);
stroke(255, 100, 0);
strokeWeight(7);
strokeCap(ROUND);
line(kx + 9, ky + 28, kx - 2, ky + 42);
line(kx + keeperW - 9, ky + 28, kx + keeperW + 2, ky + 42);
noStroke();
fill(255, 220, 50);
ellipse(kx - 2, ky + 42, 13, 13);
ellipse(kx + keeperW + 2, ky + 42, 13, 13);
fill(255, 200, 150);
ellipse(cx, ky + 12, 28, 28);
fill(60, 40, 15);
arc(cx, ky + 9, 28, 22, PI, TWO_PI);
fill(30);
ellipse(cx - 5, ky + 12, 4, 4);
ellipse(cx + 5, ky + 12, 4, 4);
}

// Draw: Ball
function drawBall() {
let sc = map(ballY, ballStartY, goalY, 1.0, 0.45);
sc = constrain(sc, 0.45, 1.0);
push();
translate(ballX, ballY);
scale(sc);
fill(0, 0, 0, 35);
noStroke();
ellipse(3, 8, 30 / sc * 0.4, 8);
fill(255); stroke(40); strokeWeight(1.5);
ellipse(0, 0, 28, 28);
fill(20); noStroke();
ellipse(0, 0, 9, 9);
for (let i = 0; i < 5; i++) {
let a = TWO_PI / 5 * i - HALF_PI;
ellipse(cos(a) * 10, sin(a) * 10, 6, 6);
}
pop();
}
// Draw: Reticle
function drawReticle(theta) {
let nearFire = theta > 0.35;
let r = nearFire ? 22 : 20;
let rc = nearFire ? 255 : 255;
let gc = nearFire ? 60 : 200;
let bc = nearFire ? 60 : 60;
noFill();
stroke(rc, gc, bc, 220);
strokeWeight(2.5);
ellipse(reticleX, reticleY, r * 2, r * 2);
strokeWeight(1.5);
stroke(rc, gc, bc, 160);
let g = r + 4, len = 13;
line(reticleX - g - len, reticleY, reticleX - g, reticleY);
line(reticleX + g, reticleY, reticleX + g + len, reticleY);
line(reticleX, reticleY - g - len, reticleX, reticleY - g);
line(reticleX, reticleY + g, reticleX, reticleY + g + len);
}
// Draw: HUD
function drawHUD(att, beta, theta) {
fill(0, 0, 0, 160);
noStroke();
rect(0, height - 88, width, 88);
fill(255); textAlign(LEFT, CENTER); textSize(13);
text("Shots: " + shots, 12, height - 70);
text("Goals: " + goals, 12, height - 50);
let avgFocus = shots > 0 ? round(totalFocusScore / shots) : 0;
text("Avg Focus: " + avgFocus + "%", 12, height - 30);
let bx = width * 0.32;
drawBar(bx, height - 76, att, "Attention (aim)", color(0, 200, 255));
drawBar(bx + 140, height - 76, beta, "Beta (keeper spd)", color(255, 100, 100));
drawBar(bx + 280, height - 76, theta, "Theta (kick >0.40)", color(160, 255, 80));
// Threshold line on theta bar
let tx = bx + 280 + 110 * 0.40;

stroke(255, 255, 0); strokeWeight(1.5);
line(tx, height - 76, tx, height - 62);
noStroke(); fill(255, 255, 0);
textAlign(CENTER); textSize(9);
text("FIRE", tx, height - 57);
// Status hint
textAlign(CENTER, CENTER); textSize(12);
if (kickCooldown > 0) {
fill(255, 210, 0);
let cdSecs = ceil(kickCooldown / 30);
text("Next kick ready in " + cdSecs + (cdSecs === 1 ? " second..." : " seconds..."), width / 2, height - 96);
} else if (gameState === "aiming") {
fill(190, 190, 190);
text("Focus steadies aim | Theta > 0.40 fires | Beta drives keeper speed", width / 2, height - 96);
}
}
function drawBar(x, y, val, label, col) {
let bw = 110, bh = 12;
fill(40); noStroke(); rect(x, y, bw, bh, 3);
fill(col); rect(x, y, bw * constrain(val, 0, 1), bh, 3);
noFill(); stroke(80); strokeWeight(0.5); rect(x, y, bw, bh, 3);
noStroke(); fill(190); textAlign(LEFT, TOP); textSize(10);
text(label + " " + val.toFixed(2), x, y + 14);
}
// Draw: Result overlay
function drawResultOverlay() {
fill(0, 0, 0, 150);
noStroke();
rect(0, 0, width, height);
let isGoal = lastResult === "GOAL!";
fill(isGoal ? color(80, 255, 120) : color(255, 90, 90));
textAlign(CENTER, CENTER); textSize(64);
text(lastResult, width / 2, height / 2 - 40);
// Focus Score — EEG quality at kick moment
fill(255); textSize(18);
text("Focus Score: " + lastFocusScore + "%", width / 2, height / 2 + 18);
// Shot Accuracy — was the aim on target?
fill(lastShotAccuracy === 100 ? color(160, 255, 160) : color(255, 160, 160));
textSize(15);
text("Shot on Target: " + (lastShotAccuracy === 100 ? "Yes" : "No"), width / 2, height / 2 + 48);
fill(200); textSize(15);
text(goals + " goals from " + shots + " shots", width / 2, height / 2 + 75);
fill(160); textSize(12);
if (isGoal) {
text("Great focus! The reticle held steady.", width / 2, height / 2 + 100);
} else if (lastResult === "SAVED!") {
text("The keeper got there. Aim away from centre next time.", width / 2, height / 2 + 100);
} else {
text("Missed wide. Concentrate to steady the reticle.", width / 2, height / 2 + 100);
}
}
// Draw: Get Ready screen

function drawGetReady() {
fill(0, 0, 0, 110);
noStroke();
rect(0, 0, width, height);
fill(255, 220, 50);
textAlign(CENTER, CENTER); textSize(30);
text("Get Ready...", width / 2, height / 2 - 20);
fill(200); textSize(15);
let secsLeft = ceil(waitTimer / 30);
text("Next shot in " + secsLeft + (secsLeft === 1 ? " second" : " seconds"), width / 2, height / 2 + 20);
fill(160); textSize(13);
fill(160); textSize(13);
text("Breathe, focus, and wait for theta to rise", width / 2, height / 2 + 55);
}