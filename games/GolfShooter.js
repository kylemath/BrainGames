/**
 * @id GolfShooter
 * @title Golf Driving Range
 * @category Sports
 * @order 10
 * @newGame false
 *
 * EEG mappings:
 *   attention -> shot power
 *
 * Copy of /games/GolfShooter.js (the original remains the authoritative
 * reference and MUST NOT be modified). Only this metadata header was
 * prepended; all original code below is preserved byte-for-byte.
 */
// EEG Driving Range
// EEG Mappings:
// attention --> shot power (focus your mind = more distance)
// meditation --> shot consistency (calm = clean arc, tense = erratic distance variation)
//
// Game: 10 shots per session, goal is maximum distance
// Swing fires automatically when sustained attention exceeds threshold
// Meditation at moment of swing affects shot consistency (arc cleanness)
// State
// "intro" --> instruction screen
// "aiming" --> player builds focus, swing fires on threshold
// "swinging" --> swing animation
// "flight" --> ball in air
// "landed" --> result shown briefly
// "summary" --> session complete
let gameState = "intro";
// Session tracking
const MAX_SHOTS = 10;
let shotCount = 0;
let shotMarkers = [];
// Shot state
let shotPower = 0;
let shotCalm = 0;
let lastDistance = 0;
let resultTimer = 0;
const RESULT_DUR = 100;
// Ball
let ballX, ballY;
let ballVX, ballVY;
let ballActive = false;
// Scene layout
let groundY;
let teeX;
const MAX_DISTANCE = 350; // yards shown on range
// Golfer swing animation
let swingFrame = 0;
const SWING_DUR = 28;
const IMPACT_FRAME = 17;
// Shot cooldown
let shotCooldown = 0;
const SHOT_CD = 60;
let attHist = [], medHist = [];
function smoothed(val, hist, n) {
hist.push(val);
if (hist.length > n) hist.shift();
return hist.reduce((a, b) => a + b, 0) / hist.length;
}
// Grace buffer for swing trigger
let attGrace = [];
const GRACE_WINDOW = 20;
const GRACE_THRESH = 0.62;

function graceCheck(val, threshold) {
attGrace.push(val >= threshold ? 1 : 0);
if (attGrace.length > GRACE_WINDOW) attGrace.shift();
return attGrace.reduce((a, b) => a + b, 0) / attGrace.length >= GRACE_THRESH;
}
// Intro timer
let introTimer = 300;
// Setup
function setup() {
colorMode(RGB);
groundY = height * 0.70;
teeX = width * 0.12;
resetBall();
}
function resetBall() {
ballX = teeX + 10;
ballY = groundY - 8;
ballVX = 0;
ballVY = 0;
ballActive = false;
shotPower = 0;
}
// Main draw loop
function draw() {
if (!eegData.connected) {
background(60, 140, 60);
fill(255); textAlign(CENTER, CENTER); textSize(20);
text("Connect or simulate EEG to play", width / 2, height / 2);
return;
}
let att = smoothed(eegData.attention !== undefined ? eegData.attention : 0.5, attHist, 6);
let med = smoothed(eegData.meditation !== undefined ? eegData.meditation : 0.5, medHist, 8);
// Intro screen
if (gameState === "intro") {
drawIntro();
if (introTimer > 0) {
introTimer--;
} else if (graceCheck(att, 0.50)) {
attGrace = [];
gameState = "aiming";
}
return;
}
// Summary screen
if (gameState === "summary") {
drawSummary();
if (graceCheck(att, 0.50)) resetSession();
return;
}
// Game logic
if (gameState === "aiming") {
if (shotCooldown > 0) shotCooldown--;
shotPower = constrain(map(att, 0.35, 0.65, 0, 1), 0, 1);

if (shotCooldown <= 0 && graceCheck(att, 0.50)) {
shotCalm = med;
gameState = "swinging";
swingFrame = 0;
attGrace = [];
}
}
if (gameState === "swinging") {
swingFrame++;
if (swingFrame === IMPACT_FRAME) {
launchBall();
}
if (swingFrame >= SWING_DUR) {
gameState = "flight";
}
}
if (gameState === "flight") {
ballX += ballVX;
ballY += ballVY;
ballVY += 0.28;
if (ballY >= groundY - 6) {
ballY = groundY - 6;
recordShot();
gameState = "landed";
resultTimer = RESULT_DUR;
}
if (ballX > width + 40) {
recordShot();
gameState = "landed";
resultTimer = RESULT_DUR;
}
}
if (gameState === "landed") {
resultTimer--;
if (resultTimer <= 0) {
shotCount++;
resetBall();
shotCooldown = SHOT_CD;
attGrace = [];
gameState = shotCount >= MAX_SHOTS ? "summary" : "aiming";
}
}
// Draw
drawScene();
drawShotMarkers();
if (ballActive || gameState === "flight" || gameState === "swinging") drawBall();
drawGolfer();
drawAimingHUD(att, med);
drawHUD(att, med);
if (gameState === "landed") drawResultOverlay();
}
// Launch ball
function launchBall() {
let speed = map(shotPower, 0, 1, 5, 18);
let noiseRange = map(shotCalm, 0, 1, 3.5, 0);
let speedNoise = random(-noiseRange, noiseRange);

speed = max(3, speed + speedNoise);
let angle = -0.64;
ballVX = cos(angle) * speed;
ballVY = sin(angle) * speed;
ballX = teeX + 14;
ballY = groundY - 12;
ballActive = true;
}
// Record shot
function recordShot() {
let dist = round(map(ballX, teeX, width * 0.96, 0, MAX_DISTANCE));
dist = constrain(dist, 0, MAX_DISTANCE + 30);
lastDistance = dist;
shotMarkers.push({
landX: constrain(ballX, teeX + 10, width - 14),
landY: groundY - 6,
distance: dist,
power: floor(shotPower * 100),
calm: floor(shotCalm * 100),
shotNum: shotCount + 1
});
}
// Shot note helper
// Power and calm are stored as 0-100 integers.
// Thresholds set around realistic simulated EEG midpoints:
// Power: attention ~0.35-0.65 maps to 0-100%, midpoint ~50%
// Calm: meditation ~0.30-0.55 maps to 30-55%, midpoint ~42%
// "Strong" = power >= 50 AND calm >= 42
// "Powerful" = power >= 50 AND calm < 42 (distance but inconsistent)
// "Controlled" = power < 50 AND calm >= 42 (consistent but short)
// "Needs work" = both below thresholds
function getShotNote(m, best) {
if (m.distance === best) return "★ Best";
if (m.power >= 50 && m.calm >= 42) return "Strong";
if (m.power >= 50 && m.calm < 42) return "Powerful";
if (m.power < 50 && m.calm >= 42) return "Controlled";
return "Needs work";
}
// Drawing: Intro screen
function drawIntro() {
for (let i = 0; i < height; i++) {
let t = i / height;
stroke(lerpColor(color(120, 180, 230), color(180, 220, 250), t));
line(0, i, width, i);
}
noStroke();
fill(0, 0, 0, 160); noStroke();
rect(width * 0.08, height * 0.06, width * 0.84, height * 0.88, 14);
fill(255, 220, 50);
textAlign(CENTER, CENTER); textSize(28);
text("EEG Driving Range", width / 2, height * 0.16);
fill(255); textSize(15);
text("Hit 10 shots. Go for maximum distance.", width / 2, height * 0.26);

stroke(80, 80, 120); strokeWeight(1);
line(width * 0.18, height * 0.32, width * 0.82, height * 0.32);
noStroke();
fill(255, 220, 50); textSize(14);
text("POWER (Attention)", width / 2, height * 0.39);
fill(200); textSize(12);
text("Your attention score rises when you focus your mind deliberately.", width / 2, height * 0.45);
text("Think actively, concentrate on a single thought, or count mentally.", width / 2, height * 0.50);
text("Higher attention = more power = greater distance.", width / 2, height * 0.55);
stroke(80, 80, 120); strokeWeight(1);
line(width * 0.18, height * 0.60, width * 0.82, height * 0.60);
noStroke();
fill(100, 200, 255); textSize(14);
text("CONSISTENCY (Meditation / Calm)", width / 2, height * 0.66);
fill(200); textSize(12);
text("Your meditation score rises when you relax and clear your mind.", width / 2, height * 0.72);
text("Breathe slowly, let thoughts pass, soften your focus.", width / 2, height * 0.77);
text("Higher calm = cleaner arc and more consistent distance.", width / 2, height * 0.82);
fill(255, 255, 255, 180); textSize(13);
if (introTimer > 0) {
text("Please read the instructions above (" + ceil(introTimer / 30) + "s)", width / 2, height * 0.91);
} else {
text("Focus your mind to begin", width / 2, height * 0.91);
}
}
// Drawing: Scene
function drawScene() {
for (let i = 0; i < groundY; i++) {
let t = i / groundY;
stroke(lerpColor(color(120, 180, 230), color(180, 220, 250), t));
line(0, i, width, i);
}
noStroke();
fill(70, 165, 70);
rect(0, groundY, width, height - groundY);
let bandCols = [color(65, 158, 65), color(78, 178, 78)];
let bandCount = 7;
let bandW = width / bandCount;
for (let i = 0; i < bandCount; i++) {
fill(bandCols[i % 2]);
rect(i * bandW, groundY, bandW, height - groundY);
}
fill(95, 205, 95); noStroke();
rect(teeX - 22, groundY - 3, 54, 8, 3);
for (let d = 50; d <= MAX_DISTANCE; d += 50) {
let mx = map(d, 0, MAX_DISTANCE, teeX, width - 30);
stroke(255, 255, 255, 55); strokeWeight(1);
line(mx, groundY, mx, groundY + 14);
noStroke();
fill(255, 255, 255, 160);
textAlign(CENTER, TOP); textSize(10);
text(d + "y", mx, groundY + 16);

}
stroke(40, 120, 40); strokeWeight(2);
line(0, groundY, width, groundY);
noStroke();
fill(255, 255, 255, 160);
ellipse(width * 0.30, height * 0.10, 90, 32);
ellipse(width * 0.32, height * 0.085, 65, 26);
ellipse(width * 0.72, height * 0.07, 110, 38);
ellipse(width * 0.74, height * 0.055, 75, 28);
}
// Drawing: Shot markers
function drawShotMarkers() {
for (let i = 0; i < shotMarkers.length; i++) {
let m = shotMarkers[i];
let age = shotMarkers.length - i;
let a = map(age, 0, MAX_SHOTS, 220, 70);
fill(255, 220, 50, a); noStroke();
ellipse(m.landX, m.landY, 10, 5);
fill(255, 255, 255, a);
textAlign(CENTER, BOTTOM); textSize(9);
text(m.shotNum, m.landX, m.landY - 4);
}
}
// Drawing: Ball
function drawBall() {
fill(255); stroke(160); strokeWeight(1);
ellipse(ballX, ballY, 9, 9);
fill(210); noStroke();
ellipse(ballX - 2, ballY - 2, 3, 3);
}
// Drawing: Golfer
function drawGolfer() {
let x = teeX - 8;
let y = groundY;
let sw = gameState === "swinging" ? swingFrame / SWING_DUR : 0;
push();
translate(x, y);
fill(30, 30, 120); noStroke();
rect(-9, -34, 8, 24, 3);
rect(2, -34, 8, 24, 3);
fill(30);
rect(-11, -12, 11, 6, 2);
rect(1, -12, 11, 6, 2);
fill(220, 50, 50);
rect(-10, -62, 20, 30, 4);
fill(60, 40, 20);
rect(-10, -35, 20, 4);
// Arms hang below shoulder pivot.
// Positive angle = clockwise = swings LEFT (backswing toward left of screen)
// Negative angle = counter-clockwise = swings RIGHT (follow-through toward right)

let impactFrac = IMPACT_FRAME / SWING_DUR;
let armAngle;
if (sw < impactFrac) {
armAngle = map(sw, 0, impactFrac, 0.0, 1.4);
} else {
armAngle = map(sw, impactFrac, 1.0, 1.4, -1.2);
}
fill(255, 200, 150); noStroke();
push();
translate(0, -56);
rotate(armAngle);
rect(-12, 0, 7, 20, 3);
pop();
push();
translate(0, -56);
rotate(armAngle);
rect(5, 0, 7, 20, 3);
stroke(150); strokeWeight(2);
line(8, 18, 10, 50);
fill(170); noStroke();
rect(4, 48, 11, 7, 2);
pop();
fill(255, 200, 150); noStroke();
ellipse(0, -68, 24, 24);
fill(30, 30, 120);
arc(0, -72, 26, 20, PI, TWO_PI);
rect(-13, -76, 26, 5, 2);
fill(30);
ellipse(-4, -69, 3, 3);
ellipse(4, -69, 3, 3);
pop();
}
// Drawing: Aiming HUD
function drawAimingHUD(att, med) {
if (gameState !== "aiming" && gameState !== "swinging") return;
let bx = width * 0.035;
let by = height * 0.14;
let bw = 18;
let bh = height * 0.48;
fill(20, 20, 20, 180); noStroke(); rect(bx, by, bw, bh, 6);
let powerCol = lerpColor(color(80, 200, 80), color(255, 60, 60), shotPower);
fill(powerCol);
rect(bx, by + bh - bh * shotPower, bw, bh * shotPower, 4);
let threshFrac = map(0.50, 0.35, 0.65, 0, 1);
let threshY = by + bh * (1 - threshFrac);
stroke(255, 255, 100); strokeWeight(1.5);
line(bx - 5, threshY, bx + bw + 5, threshY);
noStroke(); fill(255, 255, 100);
textAlign(RIGHT, CENTER); textSize(9);
text("SWING", bx - 7, threshY);

fill(0, 0, 0, 140); noStroke();
rect(bx - 2, by + bh + 2, bw + 4, 28, 3);
fill(255); textAlign(CENTER, TOP); textSize(10);
text("Power", bx + bw / 2, by + bh + 6);
textSize(11);
text(floor(shotPower * 100) + "%", bx + bw / 2, by + bh + 18);
let cx = bx + bw + 8;
fill(20, 20, 20, 180); noStroke(); rect(cx, by, bw, bh, 6);
let calmCol = lerpColor(color(255, 100, 100), color(100, 200, 255), med);
fill(calmCol);
rect(cx, by + bh - bh * constrain(med, 0, 1), bw, bh * constrain(med, 0, 1), 4);
fill(0, 0, 0, 140); noStroke();
rect(cx - 2, by + bh + 2, bw + 4, 28, 3);
fill(255); textAlign(CENTER, TOP); textSize(10);
text("Calm", cx + bw / 2, by + bh + 6);
textSize(11);
text(floor(med * 100) + "%", cx + bw / 2, by + bh + 18);
textAlign(CENTER, CENTER); textSize(12);
if (shotCooldown > 0) {
fill(255, 200, 50);
let secs = ceil(shotCooldown / 30);
text("Next shot in " + secs + (secs === 1 ? " second..." : " seconds..."), width / 2, height * 0.82);
} else {
fill(200);
text("Concentrate to build power and swing | Breathe slowly for a straighter shot", width / 2, height * 0.82);
}
}
// Drawing: Bottom HUD
function drawHUD(att, med) {
fill(0, 0, 0, 160); noStroke();
rect(0, height - 68, width, 68);
fill(255); textAlign(LEFT, CENTER); textSize(13);
text("Shot: " + (shotCount + 1) + " / " + MAX_SHOTS, 12, height - 50);
if (lastDistance > 0) {
fill(255); text("Last: " + lastDistance + "y", 12, height - 30);
}
if (shotMarkers.length > 0) {
let best = Math.max(...shotMarkers.map(m => m.distance));
fill(255, 220, 50); textSize(12);
text("Best: " + best + "y", 12, height - 12);
}
let bx = width * 0.30;
drawEEGBar(bx, height - 58, att, "Attention (power)", color(255, 200, 50));
drawEEGBar(bx + 160, height - 58, med, "Meditation (consistency)", color(100, 200, 255));
let dotX = width * 0.86;
fill(255); textAlign(LEFT, CENTER); textSize(10);
text("Shots:", dotX - 46, height - 38);
for (let i = 0; i < MAX_SHOTS; i++) {
fill(i < shotCount ? color(80, 220, 120) : color(60, 60, 60)); noStroke();
ellipse(dotX + i * 13, height - 38, 10, 10);
}
}
function drawEEGBar(x, y, val, label, col) {

let bw = 130, bh = 12;
fill(40); noStroke(); rect(x, y, bw, bh, 3);
fill(col); rect(x, y, bw * constrain(val, 0, 1), bh, 3);
noFill(); stroke(80); strokeWeight(0.5); rect(x, y, bw, bh, 3);
noStroke(); fill(255); textAlign(LEFT, TOP); textSize(10);
text(label + " " + val.toFixed(2), x, y + 14);
}
// Drawing: Result overlay
function drawResultOverlay() {
fill(0, 0, 0, 145); noStroke();
rect(width * 0.28, height * 0.22, width * 0.44, height * 0.38, 12);
let isBest = shotMarkers.length > 0 &&
shotMarkers[shotMarkers.length - 1].distance ===
Math.max(...shotMarkers.map(m => m.distance));
fill(isBest ? color(255, 220, 50) : color(255, 255, 255));
textAlign(CENTER, CENTER); textSize(24);
text(lastDistance + " yards" + (isBest && shotCount > 0 ? " ★ Best!" : ""), width / 2, height * 0.33);
fill(200); textSize(13);
text("Power: " + floor(shotPower * 100) + "%", width / 2, height * 0.42);
text("Consistency: " + floor(shotCalm * 100) + "%", width / 2, height * 0.49);
fill(160); textSize(11);
let shotsLeft = MAX_SHOTS - shotCount - 1;
text(shotsLeft > 0 ? shotsLeft + " shots remaining" : "Final shot!", width / 2, height * 0.56);
}
// Drawing: Session summary
function drawSummary() {
for (let i = 0; i < height; i++) {
let t = i / height;
stroke(lerpColor(color(20, 60, 20), color(40, 110, 40), t));
line(0, i, width, i);
}
noStroke();
fill(0, 0, 0, 170); noStroke();
rect(width * 0.05, height * 0.03, width * 0.90, height * 0.92, 14);
fill(255, 220, 50);
textAlign(CENTER, CENTER); textSize(26);
text("Session Complete", width / 2, height * 0.10);
let distances = shotMarkers.map(m => m.distance);
let best = Math.max(...distances);
let avg = round(distances.reduce((a, b) => a + b, 0) / distances.length);
let calms = shotMarkers.map(m => m.calm);
let avgCalm = round(calms.reduce((a, b) => a + b, 0) / calms.length);
let mean = distances.reduce((a, b) => a + b, 0) / distances.length;
let variance = distances.reduce((a, b) => a + (b - mean) ** 2, 0) / distances.length;
let stdDev = round(Math.sqrt(variance));
let consistency = constrain(round(map(stdDev, 0, 80, 100, 0)), 0, 100);
let sy = height * 0.20;
drawStatBox(width * 0.16, sy, "Best Shot", best + "y", color(255, 220, 50));
drawStatBox(width * 0.37, sy, "Average", avg + "y", color(80, 220, 120));
drawStatBox(width * 0.58, sy, "Consistency", consistency + "%", color(100, 200, 255));
drawStatBox(width * 0.79, sy, "Avg Calm", avgCalm + "%", color(180, 120, 255));

fill(180); textSize(11); textAlign(CENTER, CENTER);
text("Shot Dispersion", width / 2, height * 0.43);
let mrX = width * 0.08, mrY = height * 0.47;
let mrW = width * 0.84, mrH = 16;
fill(70, 160, 70); noStroke(); rect(mrX, mrY, mrW, mrH, 4);
for (let d = 50; d <= MAX_DISTANCE; d += 50) {
let tx = map(d, 0, MAX_DISTANCE, mrX, mrX + mrW);
stroke(255, 255, 255, 50); strokeWeight(1);
line(tx, mrY, tx, mrY + mrH);
noStroke(); fill(255, 255, 255, 120); textSize(8);
text(d + "y", tx, mrY + mrH + 8);
}
for (let i = 0; i < shotMarkers.length; i++) {
let m = shotMarkers[i];
let sx = map(m.distance, 0, MAX_DISTANCE, mrX, mrX + mrW);
let isBest = m.distance === best;
fill(isBest ? color(255, 220, 50) : color(255, 255, 255, 180)); noStroke();
ellipse(sx, mrY + mrH / 2, isBest ? 10 : 7, isBest ? 10 : 7);
fill(isBest ? color(30) : color(255, 255, 255, 200)); textSize(7);
text(i + 1, sx, mrY + mrH / 2);
}
stroke(60, 80, 60); strokeWeight(1);
line(width * 0.08, height * 0.58, width * 0.92, height * 0.58);
noStroke();
let cols = [width*0.12, width*0.24, width*0.36, width*0.48, width*0.62, width*0.82];
fill(160); textSize(11); textAlign(CENTER, CENTER);
text("Shot", cols[0], height * 0.61);
text("Distance", cols[1], height * 0.61);
text("Power", cols[2], height * 0.61);
text("Calm", cols[3], height * 0.61);
text("Note", cols[4], height * 0.61);
for (let i = 0; i < shotMarkers.length; i++) {
let m = shotMarkers[i];
let ry = height * 0.65 + i * 13;
let note = getShotNote(m, best);
// Note colour — gold for best, green for strong, blue for controlled,
// orange for powerful, red for needs work
let noteCol = note === "★ Best" ? color(255, 220, 50) :
note === "Strong" ? color(80, 220, 120) :
note === "Controlled"? color(100, 200, 255) :
note === "Powerful" ? color(255, 160, 60) :
color(255, 100, 100);

if (i % 2 === 0) {
fill(255, 255, 255, 6); noStroke();
rect(width * 0.08, ry - 7, width * 0.84, 13);
}
fill(180); textSize(10); textAlign(CENTER, CENTER);
text(i + 1, cols[0], ry);
text(m.distance + "y", cols[1], ry);
text(m.power + "%", cols[2], ry);
text(m.calm + "%", cols[3], ry);
fill(noteCol);

text(note, cols[4], ry);
}
// Legend for note categories
fill(160); textSize(10); textAlign(LEFT, CENTER);
let lx = width * 0.09;
let ly = height * 0.65 + MAX_SHOTS * 13 + 6;
fill(255, 220, 50); text("★ Best", lx, ly);
fill(80, 220, 120); text("Strong", lx + 58, ly);
fill(255, 160, 60); text("Powerful", lx + 116, ly);
fill(100, 200, 255); text("Controlled", lx + 190, ly);
fill(255, 100, 100); text("Needs work", lx + 278, ly);
fill(160, 255, 160); textSize(12); textAlign(CENTER, CENTER);
let msg = consistency >= 80 ? "Excellent consistency. Your focus is highly stable across shots." :
consistency >= 60 ? "Good consistency. Sustained attention is developing well." :
consistency >= 40 ? "Moderate consistency. Try to hold your focus more steadily before swinging." :
"High variability. Practise building attention before each shot.";

text(msg, width / 2, height * 0.87);
fill(255, 220, 50, 180); textSize(12);
text("Focus your mind to play again", width / 2, height * 0.92);
}
function drawStatBox(x, y, label, val, col) {
fill(20, 20, 40, 200); noStroke();
rect(x - 44, y, 88, 52, 8);
fill(col); textAlign(CENTER, CENTER); textSize(20);
text(val, x, y + 24);
fill(160); textSize(10);
text(label, x, y + 42);
}
// Reset session
function resetSession() {
shotCount = 0;
shotMarkers = [];
lastDistance = 0;
shotCooldown = 0;
introTimer = 300;
attGrace = [];
attHist = [];
medHist = [];
resetBall();
gameState = "intro";
}