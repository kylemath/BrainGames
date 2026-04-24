/**
 * @id balloonPop
 * @title Balloon Pop
 * @category Calm
 * @order 22
 * @newGame false
 *
 * EEG mappings:
 *   attention -> balloon inflation
 *
 * Copy of /games/balloonPop.js (the original remains the authoritative
 * reference and MUST NOT be modified). Only this metadata header was
 * prepended; all original code below is preserved byte-for-byte.
 */
// EEG Balloon Focus Trainer
// EEG Mappings:
// attention --> controls balloon inflation (must stay above threshold)
// theta + beta displayed for informational context only
//
// Level structure — attention threshold increases each level:
// Level 1: attention > 0.46 hold 5s
// Level 2: attention > 0.50 hold 7s
// Level 3: attention > 0.54 hold 9s
// Level 4: attention > 0.57 hold 11s
// Level 5: attention > 0.60 hold 13s
//
// Hold timer resets to zero if attention drops — player must sustain
// the full duration without interruption to pop the balloon.
// State
let gameState = "playing";
// Level config
let currentLevel = 1;
const MAX_LEVELS = 5;
const LEVELS = [
{ att: 0.46, holdNeeded: 150, label: "Level 1" }, // ~5s at 30fps
{ att: 0.50, holdNeeded: 210, label: "Level 2" }, // ~7s
{ att: 0.54, holdNeeded: 270, label: "Level 3" }, // ~9s
{ att: 0.57, holdNeeded: 330, label: "Level 4" }, // ~11s
{ att: 0.60, holdNeeded: 390, label: "Level 5" }, // ~13s
];
// Hold timer
// Counts up while focused. Resets to 0 if focus drops.
// pressure is derived from holdFrames / holdNeeded.
let holdFrames = 0;
let pressure = 0; // 0.0 → 1.0, drives balloon size and gauge
// Balloon visual
let balloonX, balloonY;
let balloonBaseR = 40;
let balloonMaxR = 110;
// Burst animation
let burstParticles = [];
let burstTimer = 0;
const BURST_DUR = 50;
// Level transition
let levelUpTimer = 0;
const LEVELUP_DUR = 180; // ~6s at 30fps
// Score tracking
let levelsCompleted = 0;
let totalFocusFrames = 0;
let sessionFrames = 0;
// EEG smoothing
let attHist = [], thetaHist = [], betaHist = [];
function smoothed(val, hist, n) {
hist.push(val);
if (hist.length > n) hist.shift();

return hist.reduce((a, b) => a + b, 0) / hist.length;
}
// Grace buffer
// 60% of last 20 frames must meet threshold to count as focused.
// Prevents single-frame noise from resetting the hold timer.
let attGrace = [];
const GRACE_WINDOW = 20;
const GRACE_THRESH = 0.60;
function graceCheck(val, threshold, graceBuf) {
graceBuf.push(val >= threshold ? 1 : 0);
if (graceBuf.length > GRACE_WINDOW) graceBuf.shift();
return graceBuf.reduce((a, b) => a + b, 0) / graceBuf.length >= GRACE_THRESH;
}
// Setup
function setup() {
colorMode(RGB);
balloonX = width / 2;
balloonY = height * 0.48;
}
// Main draw loop
function draw() {
if (!eegData.connected) {
background(20, 20, 40);
fill(255); textAlign(CENTER, CENTER); textSize(20);
text("Connect or simulate EEG to play", width / 2, height / 2);
return;
}
let att = smoothed(eegData.attention !== undefined ? eegData.attention : 0.5, attHist, 6);
let theta = smoothed(eegData.theta !== undefined ? eegData.theta : 0.3, thetaHist, 10);
let beta = smoothed(eegData.beta !== undefined ? eegData.beta : 0.3, betaHist, 10);
sessionFrames++;
// State logic
if (gameState === "playing") {
let cfg = LEVELS[currentLevel - 1];
let focused = isFocused(att, theta, beta, cfg);
if (focused) {
holdFrames = min(cfg.holdNeeded, holdFrames + 1);
pressure = holdFrames / cfg.holdNeeded;
totalFocusFrames++;
} else {
// Focus dropped — reset hold timer completely
holdFrames = 0;
pressure = 0;
}
if (holdFrames >= cfg.holdNeeded) {
pressure = 1.0;
spawnBurst();
gameState = "popped";
burstTimer = BURST_DUR;
}
}

if (gameState === "popped") {
burstTimer--;
updateBurst();
if (burstTimer <= 0) {
levelsCompleted++;
if (currentLevel >= MAX_LEVELS) {
gameState = "complete";
} else {
gameState = "levelup";
levelUpTimer = LEVELUP_DUR;
pressure = 0;
holdFrames = 0;
}
}
}
if (gameState === "levelup") {
levelUpTimer--;
if (levelUpTimer <= 0) {
currentLevel++;
holdFrames = 0;
pressure = 0;
attGrace = [];
gameState = "playing";
}
}
// Draw
drawBackground();
if (gameState === "playing") {
let cfg = LEVELS[currentLevel - 1];
let focused = isFocused(att, theta, beta, cfg);
drawBalloon(focused);
drawPressureGauge(cfg);
drawHoldTimer(cfg, focused);
drawRequirements(att, theta, beta, cfg);
drawHUD(att, theta, beta);
}
if (gameState === "popped") {
drawBurst();
drawPopMessage();
}
if (gameState === "levelup") {
drawLevelUp();
}
if (gameState === "complete") {
drawComplete();
}
}
// Focus check
function isFocused(att, theta, beta, cfg) {
return graceCheck(att, cfg.att, attGrace);
}

// Burst
function spawnBurst() {
burstParticles = [];
let r = getCurrentRadius();
for (let i = 0; i < 28; i++) {
let angle = random(TWO_PI);
let spd = random(3, 9);
burstParticles.push({
x: balloonX + cos(angle) * r,
y: balloonY + sin(angle) * r,
vx: cos(angle) * spd,
vy: sin(angle) * spd - random(1, 4),
life: 255,
size: random(5, 14),
col: random([
color(255, 80, 120),
color(255, 200, 50),
color(100, 200, 255),
color(180, 100, 255)
])
});
}
}
function updateBurst() {
for (let p of burstParticles) {
p.x += p.vx;
p.y += p.vy;
p.vy += 0.2;
p.life -= 255 / BURST_DUR;
}
}
function drawBurst() {
drawBackground();
noStroke();
for (let p of burstParticles) {
fill(red(p.col), green(p.col), blue(p.col), p.life);
ellipse(p.x, p.y, p.size);
}
}
// Balloon radius helper
function getCurrentRadius() {
return lerp(balloonBaseR, balloonMaxR, pressure);
}
// Drawing: Background
function drawBackground() {
for (let i = 0; i < height; i++) {
let t = i / height;
stroke(lerpColor(color(15, 15, 35), color(30, 30, 60), t));
line(0, i, width, i);
}
noStroke();
}
// Drawing: Balloon
function drawBalloon(focused) {
let r = getCurrentRadius();
let balloonCol = lerpColor(color(80, 140, 255), color(255, 60, 80), pressure);

// Glow
fill(red(balloonCol), green(balloonCol), blue(balloonCol), 40);
noStroke();
ellipse(balloonX, balloonY, (r + 18) * 2, (r + 18) * 2);
// Body
fill(balloonCol);
stroke(focused ? color(255, 255, 255, 180) : color(255, 255, 255, 60));
strokeWeight(2);
ellipse(balloonX, balloonY, r * 2, r * 2.1);
// Sheen
noStroke();
fill(255, 255, 255, 55);
ellipse(balloonX - r * 0.3, balloonY - r * 0.3, r * 0.5, r * 0.35);
// Tie
fill(red(balloonCol) * 0.7, green(balloonCol) * 0.7, blue(balloonCol) * 0.7);
triangle(
balloonX - 5, balloonY + r * 2.1 / 2,
balloonX + 5, balloonY + r * 2.1 / 2,
balloonX, balloonY + r * 2.1 / 2 + 10
);
// String
stroke(180, 180, 180, 140);
strokeWeight(1.5);
let stringY = balloonY + r * 2.1 / 2 + 10;
line(balloonX, stringY, balloonX + sin(frameCount * 0.04) * 8, stringY + 60);
}
// Drawing: Hold countdown on balloon
function drawHoldTimer(cfg, focused) {
let secsTotal = round(cfg.holdNeeded / 30);
let secsHeld = floor(holdFrames / 30);
let secsLeft = secsTotal - secsHeld;
let r = getCurrentRadius();
// Show countdown inside balloon
let timerCol = focused ? color(255, 255, 255, 230) : color(255, 160, 160, 200);
fill(timerCol);
textAlign(CENTER, CENTER);
textSize(r > 60 ? 28 : 20);
text(secsLeft, balloonX, balloonY - 6);
// Small label below number
textSize(11);
fill(255, 255, 255, focused ? 160 : 80);
text(focused ? "hold..." : "focus!", balloonX, balloonY + 14);
}
// Drawing: Pressure gauge
function drawPressureGauge(cfg) {
let gx = width * 0.82;
let gy = height * 0.18;
let gw = 22;
let gh = height * 0.55;
fill(30, 30, 60);
stroke(80, 80, 120);

strokeWeight(1);
rect(gx, gy, gw, gh, 6);
let fillH = gh * pressure;
let gaugeCol = lerpColor(color(80, 140, 255), color(255, 60, 80), pressure);
fill(gaugeCol);
noStroke();
rect(gx, gy + gh - fillH, gw, fillH, 4);
// POP marker at top
stroke(255, 200, 50, 180);
strokeWeight(1.5);
let dangerY = gy + gh * 0.20;
line(gx - 6, dangerY, gx + gw + 6, dangerY);
noStroke();
fill(255, 200, 50, 180);
textAlign(RIGHT, CENTER);
textSize(9);
text("POP", gx - 8, dangerY);
noFill();
stroke(100, 100, 160);
strokeWeight(1);
rect(gx, gy, gw, gh, 6);
fill(180);
noStroke();
textAlign(CENTER, TOP);
textSize(11);
text("Pressure", gx + gw / 2, gy + gh + 8);
textSize(13);
text(floor(pressure * 100) + "%", gx + gw / 2, gy + gh + 22);
}
// Drawing: Requirement indicators
function drawRequirements(att, theta, beta, cfg) {
let rx = width * 0.06;
let ry = height * 0.22;
let spacing = 52;
fill(200);
noStroke();
textAlign(LEFT, CENTER);
textSize(13);
text("Requirement:", rx, ry - 22);
drawReqBar(rx, ry, att, cfg.att, "Attention", color(0, 200, 255));
fill(140);
textSize(11);
textAlign(LEFT, TOP);
text("Live signals (info only):", rx, ry + spacing - 4);
drawInfoBar(rx, ry + spacing + 16, theta, "Theta", color(160, 255, 80));
drawInfoBar(rx, ry + spacing + 48, beta, "Beta", color(255, 140, 50));
}
function drawReqBar(x, y, val, threshold, label, col) {
let bw = 130, bh = 14;
let met = val >= threshold;
fill(30, 30, 55); noStroke(); rect(x, y, bw, bh, 4);

fill(met ? col : color(180, 60, 60));
rect(x, y, bw * constrain(val, 0, 1), bh, 4);
stroke(255, 255, 100); strokeWeight(1.5);
let tx = x + bw * threshold;
line(tx, y - 3, tx, y + bh + 3);
noFill();
stroke(met ? col : color(180, 60, 60));
strokeWeight(0.8);
rect(x, y, bw, bh, 4);
noStroke();
fill(met ? color(160, 255, 160) : color(255, 160, 160));
textAlign(LEFT, TOP); textSize(10);
text(label + " " + val.toFixed(2) + " > " + threshold.toFixed(2) + " " + (met ? "✓" : "✗"), x, y + bh + 3);
}
function drawInfoBar(x, y, val, label, col) {
let bw = 130, bh = 10;
fill(25, 25, 45); noStroke(); rect(x, y, bw, bh, 3);
fill(red(col), green(col), blue(col), 160);
rect(x, y, bw * constrain(val, 0, 1), bh, 3);
noStroke(); fill(120); textAlign(LEFT, TOP); textSize(10);
text(label + " " + val.toFixed(2), x, y + bh + 2);
}
// Drawing: HUD
function drawHUD(att, theta, beta) {
fill(0, 0, 0, 150); noStroke();
rect(0, height - 70, width, 70);
fill(255); textAlign(LEFT, CENTER); textSize(13);
text("Level: " + currentLevel + " / " + MAX_LEVELS, 12, height - 52);
text("Completed: " + levelsCompleted, 12, height - 32);
let efficiency = sessionFrames > 0 ? round((totalFocusFrames / sessionFrames) * 100) : 0;
text("Focus Efficiency: " + efficiency + "%", 12, height - 12);
fill(255, 220, 50);
textAlign(CENTER, CENTER); textSize(14);
text(LEVELS[currentLevel - 1].label + " — Hold focus to inflate the balloon!", width / 2, height - 38);
fill(160); textAlign(RIGHT, CENTER); textSize(11);
text("att " + att.toFixed(2) + " theta " + theta.toFixed(2) + " beta " + beta.toFixed(2), width - 12, height - 20);
}
// Drawing: Pop message
function drawPopMessage() {
fill(255, 220, 50);
textAlign(CENTER, CENTER); textSize(48);
text("POP!", width / 2, height / 2 - 20);
fill(200); textSize(16);
text("Level " + currentLevel + " complete!", width / 2, height / 2 + 30);
}
// Drawing: Level up screen
function drawLevelUp() {
drawBackground();
fill(0, 0, 0, 160); noStroke();

rect(width * 0.1, height * 0.1, width * 0.8, height * 0.8, 14);
let nextLevel = currentLevel + 1;
let nextCfg = LEVELS[nextLevel - 1];
let holdSecs = round(nextCfg.holdNeeded / 30);
fill(255, 220, 50);
textAlign(CENTER, CENTER); textSize(28);
text("Level " + currentLevel + " Complete!", width / 2, height * 0.22);
fill(255); textSize(16);
text("Get ready for Level " + nextLevel, width / 2, height * 0.34);
stroke(80, 80, 120); strokeWeight(1);
line(width * 0.2, height * 0.41, width * 0.8, height * 0.41);
noStroke();
fill(180); textSize(13);
text("Next challenge:", width / 2, height * 0.47);
fill(0, 200, 255); textSize(17);
text("Attention > " + nextCfg.att.toFixed(2), width / 2, height * 0.55);
fill(255, 200, 80); textSize(14);
text("Hold for " + holdSecs + " seconds without dropping below threshold", width / 2, height * 0.64);
fill(160); textSize(12);
text("If your attention dips, the timer resets to zero — stay focused!", width / 2, height * 0.73);
fill(255, 255, 255, 180); textSize(13);
text("Starting in " + ceil(levelUpTimer / 30) + " seconds...", width / 2, height * 0.86);
}
// Drawing: Complete screen
function drawComplete() {
drawBackground();
fill(0, 0, 0, 170); noStroke();
rect(width * 0.08, height * 0.06, width * 0.84, height * 0.88, 14);
fill(255, 220, 50);
textAlign(CENTER, CENTER); textSize(34);
text("Congratulations!", width / 2, height * 0.18);
fill(255); textSize(17);
text("You popped all " + MAX_LEVELS + " balloons!", width / 2, height * 0.28);
stroke(80, 80, 120); strokeWeight(1);
line(width * 0.18, height * 0.34, width * 0.82, height * 0.34);
noStroke();
let efficiency = sessionFrames > 0 ? round((totalFocusFrames / sessionFrames) * 100) : 0;
fill(180); textSize(14);
text("Overall Focus Efficiency: " + efficiency + "%", width / 2, height * 0.41);
// Efficiency bar
let bx = width * 0.25, bw = width * 0.5, bh = 14;
let by = height * 0.46;
fill(30, 30, 60); noStroke(); rect(bx, by, bw, bh, 6);
let effCol = efficiency >= 60 ? color(80, 220, 120) :
efficiency >= 40 ? color(255, 200, 50) :

color(255, 100, 80);

fill(effCol);
rect(bx, by, bw * (efficiency / 100), bh, 6);
fill(160, 255, 160); textSize(13);
let msg = efficiency >= 70 ? "Exceptional mental control. Elite neurofeedback performance." :
efficiency >= 50 ? "Strong performance. Your sustained attention is well regulated." :
efficiency >= 30 ? "Good effort. Consistent practice will improve your focus threshold." :
"Keep training — sustained attention is a skill that develops over time.";

text(msg, width / 2, height * 0.57);
stroke(60, 60, 100); strokeWeight(1);
line(width * 0.18, height * 0.63, width * 0.82, height * 0.63);
noStroke();
fill(160); textSize(12);
text("Level thresholds completed:", width / 2, height * 0.68);
fill(120); textSize(11);
for (let i = 0; i < MAX_LEVELS; i++) {
fill(i < levelsCompleted ? color(80, 220, 120) : color(120, 120, 120));
text("Level " + (i + 1) + " — Attention > " + LEVELS[i].att.toFixed(2) +
" for " + round(LEVELS[i].holdNeeded / 30) + "s",
width * 0.5, height * 0.74 + i * 16);
}
fill(255, 220, 50, 200); textSize(13);
text("Raise theta above 0.40 to play again from Level 1", width / 2, height * 0.90);
// Loop back to level 1 on theta
let theta = smoothed(eegData.theta !== undefined ? eegData.theta : 0.3, thetaHist, 6);
if (theta > 0.40) resetGame();
}
// Reset
function resetGame() {
currentLevel = 1;
pressure = 0;
holdFrames = 0;
levelsCompleted = 0;
totalFocusFrames = 0;
sessionFrames = 0;
burstParticles = [];
attGrace = [];
gameState = "playing";
}