/**
 * @id RowingCalm
 * @title Rowing Calm
 * @category Calm
 * @order 20
 * @newGame false
 *
 * EEG mappings:
 *   meditation -> stroke rhythm
 *
 * Copy of /games/RowingCalm.js (the original remains the authoritative
 * reference and MUST NOT be modified). Only this metadata header was
 * prepended; all original code below is preserved byte-for-byte.
 */
// EEG Rowing
// EEG Mappings:
// meditation --> stroke rhythm (calm = smooth consistent strokes)
// attention --> stroke power (focus = stronger deeper pull = more distance)
//
// Game: 30 second session on the water
// Strokes animate automatically, quality driven by real-time EEG
// Distance accumulates each stroke: power (att) x consistency (med)
// State
// "intro" --> instruction screen
// "getready" --> 3-second countdown before session begins
// "rowing" --> active session
// "summary" --> session complete
let gameState = "intro";
// Get ready
let getReadyTimer = 0;
const GETREADY_DUR = 90; // 3 seconds at 30fps
// Session tracking
const SESSION_SECONDS = 30;
const FRAMES_PER_SEC = 30;
let sessionFrames = SESSION_SECONDS * FRAMES_PER_SEC; // countdown
let totalDistance = 0; // metres accumulated
let strokeLog = []; // { power, rhythm, quality, distance }
let strokeCount = 0;
// Stroke animation
// One stroke cycle = catch --> drive --> finish --> recovery
// STROKE_DUR frames per full cycle
const STROKE_DUR = 50; // frames per stroke (~1.67s at 30fps)
let strokePhase = 0; // 0 to STROKE_DUR, loops
let strokePower = 0.5; // snapshotted att at catch
let strokeRhythm = 0.5; // snapshotted med at catch
// Water / wake
let wakeParticles = [];
let waterOffset = 0; // scrolling water texture offset
// Scenery parallax
let sceneryOffset = 0; // moves as boat travels
// Intro timer
let introTimer = 300;
// Summary
let summaryReady = false;
// EEG smoothing
let attHist = [], medHist = [];
function smoothed(val, hist, n) {
hist.push(val);
if (hist.length > n) hist.shift();
return hist.reduce((a, b) => a + b, 0) / hist.length;
}
// Key input
function keyPressed() {
if (keyCode === 32 && gameState === "summary" && summaryReady) {

resetSession();
}
if (keyCode === 32 && gameState === "intro" && introTimer <= 0) {
getReadyTimer = GETREADY_DUR;
gameState = "getready";
}
}
// Setup
function setup() {
colorMode(RGB);
}
function resetSession() {
sessionFrames = SESSION_SECONDS * FRAMES_PER_SEC;
totalDistance = 0;
strokeLog = [];
strokeCount = 0;
strokePhase = 0;
wakeParticles = [];
waterOffset = 0;
sceneryOffset = 0;
attHist = [];
medHist = [];
getReadyTimer = 0;
summaryReady = false;
introTimer = 300;
gameState = "intro";
}
// Stroke quality label
function strokeQuality(power, rhythm) {
let avg = (power + rhythm) / 2;
if (avg >= 0.56) return "Powerful";
if (avg >= 0.46) return "Strong";
if (avg >= 0.36) return "Steady";
if (rhythm < 0.28 || avg < 0.28) return "Choppy";
return "Weak";
}
function strokeColour(quality) {
if (quality === "Powerful") return color(255, 220, 0);
if (quality === "Strong") return color(0, 220, 100);
if (quality === "Steady") return color(100, 180, 255);
if (quality === "Weak") return color(255, 140, 50);
return color(255, 60, 60); // Choppy
}
// Main draw
function draw() {
if (!eegData.connected) {
background(30, 80, 140);
fill(255); textAlign(CENTER, CENTER); textSize(20);
text("Connect or simulate EEG to play", width / 2, height / 2);
return;
}
let att = smoothed(eegData.attention !== undefined ? eegData.attention : 0.5, attHist, 6);
let med = smoothed(eegData.meditation !== undefined ? eegData.meditation : 0.5, medHist, 8);
if (gameState === "intro") {

drawScene(0, 0);
drawBoat(0.5, 0.5, 0);
drawIntro();
if (introTimer > 0) introTimer--;
return;
}
if (gameState === "getready") {
drawScene(0, 0);
drawBoat(0.5, 0.5, 0);
drawGetReady();
getReadyTimer--;
if (getReadyTimer <= 0) gameState = "rowing";
return;
}
if (gameState === "summary") {
drawSummary();
return;
}
// Rowing session
sessionFrames--;
// Stroke phase advances every frame
strokePhase++;
// Continuous scroll speed based on current EEG — boat glides every frame
let scrollSpeed = map((att + med) / 2, 0.3, 0.7, 0.8, 2.8);
sceneryOffset += scrollSpeed;
waterOffset += scrollSpeed * 1.4;
// At catch (start of new stroke), snapshot EEG and score the stroke
if (strokePhase >= STROKE_DUR) {
strokePhase = 0;
strokeCount++;
strokePower = att;
strokeRhythm = med;
// Distance this stroke
let dist = 2.0 * map(strokePower, 0.3, 0.8, 0.4, 1.4) *
map(strokeRhythm, 0.2, 0.7, 0.6, 1.2);
dist = constrain(dist, 0.2, 3.5);
totalDistance += dist;
spawnWake(strokePower);
let q = strokeQuality(strokePower, strokeRhythm);
strokeLog.push({
power: strokePower,
rhythm: strokeRhythm,
quality: q,
distance: dist
});
}
// Update wake
updateWake();
// Draw everything

let phaseFrac = strokePhase / STROKE_DUR;
drawScene(sceneryOffset, waterOffset);
drawWake();
drawBoat(att, med, phaseFrac);
drawHUD(att, med);
// End session
if (sessionFrames <= 0) {
summaryReady = false;
gameState = "summary";
}
}
// Wake particles
function spawnWake(power) {
let count = floor(map(power, 0.3, 0.8, 3, 8));
for (let i = 0; i < count; i++) {
wakeParticles.push({
x: width * 0.50 + random(-20, 20),
y: height * 0.66 + random(-6, 6),
vx: random(-0.4, 0.4),
vy: random(0.2, 0.8),
life: 1.0,
r: random(3, 8),
col: power > 0.6 ? color(200, 235, 255) : color(160, 200, 230)
});
}
}
function updateWake() {
for (let p of wakeParticles) {
p.x += p.vx;
p.y += p.vy;
p.life -= 0.018;
p.r *= 1.015;
}
wakeParticles = wakeParticles.filter(p => p.life > 0);
}
function drawWake() {
for (let p of wakeParticles) {
let c = p.col;
fill(red(c), green(c), blue(c), p.life * 120);
noStroke();
ellipse(p.x, p.y, p.r * 2, p.r * 0.6);
}
}
// Drawing: Scene
function drawScene(sOff, wOff) {
// Sky gradient
for (let i = 0; i < height * 0.55; i++) {
let t = i / (height * 0.55);
stroke(lerpColor(color(80, 130, 200), color(170, 210, 240), t));
line(0, i, width, i);
}
noStroke();
// Distant tree line — left bank, parallax slow
fill(30, 80, 45);
beginShape();

vertex(0, height * 0.52);
for (let x = 0; x <= width + 20; x += 16) {
let nx = (x + sOff * 0.3) % (width + 40);
let h = height * 0.52 - (noise(nx * 0.03) * height * 0.08 + height * 0.01);
vertex(x, h);
}
vertex(width, height * 0.52);
endShape(CLOSE);
// Right bank trees — slightly closer, faster parallax
fill(35, 90, 50);
beginShape();
vertex(0, height * 0.50);
for (let x = 0; x <= width + 20; x += 14) {
let nx = (x + sOff * 0.5 + 400) % (width + 40);
let h = height * 0.50 - (noise(nx * 0.04 + 10) * height * 0.07 + height * 0.01);
vertex(x, h);
}
vertex(width, height * 0.50);
endShape(CLOSE);
// Water body
fill(30, 90, 160);
rect(0, height * 0.50, width, height * 0.50);
// Water shimmer lines
stroke(50, 120, 190, 80); strokeWeight(1);
for (let i = 0; i < 8; i++) {
let wy = height * 0.52 + i * (height * 0.06);
let wx = (wOff * (0.5 + i * 0.1)) % width;
line(wx, wy, wx + 60, wy);
line(wx + 120, wy, wx + 180, wy);
line(wx + 240, wy, wx + 290, wy);
}
noStroke();
// Water reflection shimmer
fill(60, 140, 210, 40);
for (let i = 0; i < 5; i++) {
let ry = height * 0.54 + i * 14;
let rx = (wOff * 0.3 + i * 80) % width;
ellipse(rx, ry, 80, 6);
ellipse(rx + 180, ry + 4, 50, 4);
}
// Horizon line
stroke(100, 160, 210, 60); strokeWeight(1);
line(0, height * 0.50, width, height * 0.50);
noStroke();
// Course buoys — appear periodically based on scenery offset
for (let b = 0; b < 4; b++) {
let bx = ((b * 280 - sOff * 0.8) % (width + 100) + width + 100) % (width + 100);
let by = height * 0.54 + (b % 2 === 0 ? -8 : 8);
// Buoy float
fill(255, 80, 30); noStroke();
ellipse(bx, by, 10, 10);
// Buoy line
stroke(255, 120, 60, 160); strokeWeight(1);
line(bx, by + 5, bx, by + 18);
noStroke();

}
}
// Drawing: Boat and rower
function drawBoat(att, med, phaseFrac) {
let bx = width * 0.50;
let by = height * 0.62;
// Oar angle
// Both oars sweep the same arc simultaneously — forward at catch, back at finish
// Drive phase (0→0.45): oars sweep from +40° (forward) to -40° (back)
// Recovery phase (0.45→1): oars return from -40° to +40°
let oarAngle;
if (phaseFrac < 0.45) {
oarAngle = lerp(PI * 0.22, -PI * 0.22, phaseFrac / 0.45);
} else {
oarAngle = lerp(-PI * 0.22, PI * 0.22, (phaseFrac - 0.45) / 0.55);
}
// Rower body lean
// Forward at catch (compressed), back at finish (extended)
let bodyLean;
if (phaseFrac < 0.45) {
bodyLean = lerp(0.28, -0.22, phaseFrac / 0.45);
} else {
bodyLean = lerp(-0.22, 0.28, (phaseFrac - 0.45) / 0.55);
}
// Boat hull
// Subtle vertical bob in sync with stroke
let bob = sin(phaseFrac * TWO_PI) * 1.5;
fill(0, 0, 0, 30); noStroke();
ellipse(bx, by + 12 + bob, 200, 12);
// Hull — long narrow scull shape
fill(220, 215, 200); noStroke();
beginShape();
vertex(bx - 95, by + 2 + bob);
vertex(bx - 70, by + 7 + bob);
vertex(bx, by + 9 + bob);
vertex(bx + 70, by + 7 + bob);
vertex(bx + 95, by + 2 + bob);
vertex(bx + 70, by - 3 + bob);
vertex(bx, by - 5 + bob);
vertex(bx - 70, by - 3 + bob);
endShape(CLOSE);
// Hull accent stripe
fill(180, 30, 30); noStroke();
beginShape();
vertex(bx - 95, by + 2 + bob);
vertex(bx + 95, by + 2 + bob);
vertex(bx + 92, by + 4 + bob);
vertex(bx - 92, by + 4 + bob);
endShape(CLOSE);
// Riggers
stroke(120, 120, 120); strokeWeight(2);
line(bx - 16, by - 1 + bob, bx - 54, by - 13 + bob);
line(bx - 16, by + 3 + bob, bx - 54, by - 13 + bob);

line(bx + 16, by - 1 + bob, bx + 54, by - 13 + bob);
line(bx + 16, by + 3 + bob, bx + 54, by - 13 + bob);
noStroke();
// Oarlock pins
fill(140, 140, 140); noStroke();
ellipse(bx - 54, by - 13 + bob, 6, 6);
ellipse(bx + 54, by - 13 + bob, 6, 6);
// Oars
let oarHandleLen = 38;
let oarBladeLen = 70;
let oarBladeW = 9;
let oarBladeH = 20;
let pinLX = bx - 54; let pinLY = by - 13 + bob;
let pinRX = bx + 54; let pinRY = by - 13 + bob;
let oarCol = lerpColor(color(160, 100, 50), color(220, 160, 80),
map(strokePower, 0.3, 0.8, 0, 1));
// Left oar
let lHandleX = pinLX + cos(oarAngle) * oarHandleLen;
let lHandleY = pinLY + sin(oarAngle) * oarHandleLen * 0.35;
let lBladeX = pinLX - cos(oarAngle) * oarBladeLen;
let lBladeY = pinLY - sin(oarAngle) * oarBladeLen * 0.35;
stroke(oarCol); strokeWeight(4);
line(lHandleX, lHandleY, lBladeX, lBladeY);
noStroke();
fill(oarCol);
push(); translate(lBladeX, lBladeY);
rotate(-oarAngle + PI * 0.5);
rect(-oarBladeW / 2, -oarBladeH / 2, oarBladeW, oarBladeH, 2);
pop();
if (phaseFrac < 0.45) {
fill(180, 225, 255, map(phaseFrac, 0, 0.2, 0, 100) * map(phaseFrac, 0.2, 0.45, 1, 0));
noStroke();
ellipse(lBladeX, lBladeY + 4, 20, 8);
}
// Right oar — slightly smaller for perspective depth
let rOarBladeLen = oarBladeLen * 0.88;
let rOarHandleLen = oarHandleLen * 0.88;
let rOarBladeW = oarBladeW * 0.88;
let rOarBladeH = oarBladeH * 0.88;
let rHandleX = pinRX - cos(oarAngle) * rOarHandleLen;
let rHandleY = pinRY + sin(oarAngle) * rOarHandleLen * 0.35;
let rBladeX = pinRX + cos(oarAngle) * rOarBladeLen;
let rBladeY = pinRY - sin(oarAngle) * rOarBladeLen * 0.35;
stroke(oarCol); strokeWeight(3);
line(rHandleX, rHandleY, rBladeX, rBladeY);
noStroke();
fill(oarCol);
push(); translate(rBladeX, rBladeY);
rotate(oarAngle + PI * 0.5);
rect(-rOarBladeW / 2, -rOarBladeH / 2, rOarBladeW, rOarBladeH, 2);
pop();
if (phaseFrac < 0.45) {
fill(180, 225, 255, map(phaseFrac, 0, 0.2, 0, 100) * map(phaseFrac, 0.2, 0.45, 1, 0));

noStroke();
ellipse(rBladeX, rBladeY + 4, 16, 6);
}
// Seat
fill(180, 170, 155); noStroke();
rect(bx - 10, by - 7 + bob, 20, 5, 2);
// Rower
drawRower(bx, by - 5 + bob, bodyLean, att, med);
}
function drawRower(rx, ry, lean, att, med) {
push();
translate(rx, ry);
// Legs — stretched at finish, compressed at catch
let legStretch = lerp(-8, 6, (lean + 0.3) / 0.5);
fill(40, 60, 120); noStroke(); // dark leggings
// Left leg
beginShape();
vertex(-6, 0); vertex(-2, 0);
vertex(-2 + legStretch * 0.5, -12);
vertex(-6 + legStretch * 0.5, -12);
endShape(CLOSE);
// Right leg
beginShape();
vertex(2, 0); vertex(6, 0);
vertex(6 + legStretch * 0.5, -12);
vertex(2 + legStretch * 0.5, -12);
endShape(CLOSE);
// Feet
fill(50, 50, 50);
ellipse(-4 + legStretch * 0.5, -13, 7, 5);
ellipse( 4 + legStretch * 0.5, -13, 7, 5);
// Torso — leans forward at catch, back at finish
push();
translate(0, -12);
rotate(lean);
// Body
fill(180, 30, 30); noStroke(); // red rowing vest
rect(-7, -20, 14, 20, 3);
// White stripe on vest
fill(255, 255, 255, 180);
rect(-7, -20, 14, 4, 2);
// Arms — extend forward at catch, pull back at finish
let armReach = lerp(14, -6, (lean + 0.3) / 0.5);
fill(240, 195, 145); noStroke(); // skin
// Left arm
beginShape();
vertex(-6, -16); vertex(-4, -14);
vertex(armReach - 2, -14);
vertex(armReach - 4, -16);
endShape(CLOSE);
// Right arm
beginShape();

vertex(4, -16); vertex(6, -14);
vertex(armReach + 4, -14);
vertex(armReach + 2, -16);
endShape(CLOSE);
// Hands on oar handle
fill(200, 155, 110);
ellipse(armReach - 3, -15, 7, 6);
ellipse(armReach + 3, -15, 7, 6);
// Head
fill(240, 195, 145); noStroke();
ellipse(0, -26, 13, 14);
// Rowing cap
fill(180, 30, 30);
arc(0, -26, 13, 14, PI, TWO_PI);
rect(-7, -32, 14, 4, 1);
// Cap brim
fill(140, 20, 20);
rect(-8, -29, 16, 3, 1);
// Eyes
fill(40, 40, 40);
ellipse(-3, -24, 3, 2);
ellipse( 3, -24, 3, 2);
pop(); // end torso lean
pop(); // end rower translate
}
// Drawing: HUD
function drawHUD(att, med) {
fill(0, 0, 0, 155); noStroke();
rect(0, height - 68, width, 68);
// Timer
let secsLeft = ceil(sessionFrames / FRAMES_PER_SEC);
let timerCol = secsLeft <= 10 ? color(255, 80, 80) : color(255, 220, 50);
fill(timerCol); textAlign(LEFT, CENTER); textSize(22);
text(secsLeft + "s", 14, height - 42);
// Distance
fill(100, 220, 255); textSize(13);
text(totalDistance.toFixed(1) + " m", 14, height - 20);
// Stroke count
fill(200); textSize(11);
textAlign(LEFT, CENTER);
text("Strokes: " + strokeCount, 90, height - 34);
// Last stroke quality
if (strokeLog.length > 0) {
let last = strokeLog[strokeLog.length - 1];
fill(strokeColour(last.quality));
textSize(11);
text(last.quality, 90, height - 18);
}
// EEG bars
let bx = width * 0.30;

drawBar(bx, height - 60, att, "Attention (power)", color(255, 200, 50));
drawBar(bx + 170, height - 60, med, "Meditation (rhythm)", color(100, 200, 255));
// Stroke power live indicator
let spx = width * 0.78;
fill(20, 20, 20, 180); noStroke();
rect(spx, height - 60, 120, 11, 3);
let speedFrac = constrain(map((att + med) / 2, 0.3, 0.7, 0, 1), 0, 1);
fill(lerpColor(color(100, 180, 255), color(0, 220, 120), speedFrac));
rect(spx, height - 60, 120 * speedFrac, 11, 3);
fill(255); textAlign(LEFT, TOP); textSize(9);
text("Stroke efficiency", spx, height - 48);
}
function drawBar(x, y, val, label, col) {
let bw = 140, bh = 11;
fill(40); noStroke(); rect(x, y, bw, bh, 3);
fill(col); rect(x, y, bw * constrain(val, 0, 1), bh, 3);
noFill(); stroke(60); strokeWeight(0.5); rect(x, y, bw, bh, 3);
noStroke(); fill(255); textAlign(LEFT, TOP); textSize(9);
text(label + " " + val.toFixed(2), x, y + 13);
}
// Drawing: Get ready
function drawGetReady() {
fill(0, 0, 0, 155); noStroke();
rect(width * 0.30, height * 0.25, width * 0.40, height * 0.30, 12);
fill(100, 200, 255); textAlign(CENTER, CENTER); textSize(18);
text("Get Ready", width / 2, height * 0.33);
let secs = ceil(getReadyTimer / FRAMES_PER_SEC);
fill(255, 220, 50); textSize(42);
text(secs, width / 2, height * 0.46);
}
// Drawing: Intro
function drawIntro() {
fill(0, 0, 0, 165); noStroke();
rect(width * 0.08, height * 0.06, width * 0.84, height * 0.88, 14);
fill(100, 200, 255); textAlign(CENTER, CENTER); textSize(28);
text("EEG Rowing", width / 2, height * 0.14);
fill(255); textSize(13);
text("30 seconds on the water. Row as far as you can.", width / 2, height * 0.22);
stroke(30, 80, 160); strokeWeight(1);
line(width * 0.18, height * 0.27, width * 0.82, height * 0.27);
noStroke();
fill(255, 220, 50); textSize(13);
text("STROKE POWER (Attention)", width / 2, height * 0.33);
fill(200); textSize(12);
text("Your attention score drives each stroke deeper and stronger.", width / 2, height * 0.39);
text("High focus = strong powerful strokes = more distance per pull.", width / 2, height * 0.44);
text("Low attention = weak shallow strokes = slow progress.", width / 2, height * 0.49);
stroke(30, 80, 160); strokeWeight(1);
line(width * 0.18, height * 0.54, width * 0.82, height * 0.54);
noStroke();

fill(100, 200, 255); textSize(13);
text("STROKE RHYTHM (Meditation)", width / 2, height * 0.60);
fill(200); textSize(12);
text("Your meditation score controls consistency and timing.", width / 2, height * 0.66);
text("Calm state = smooth rhythmic strokes = efficient movement.", width / 2, height * 0.71);
text("Low meditation = choppy uneven strokes = wasted energy.", width / 2, height * 0.76);
fill(255, 255, 255, 180); textSize(12);
if (introTimer > 0) {
text("Please read above (" + ceil(introTimer / 30) + "s)", width / 2, height * 0.87);
} else {
text("Press SPACE to launch", width / 2, height * 0.87);
}
}
// Drawing: Summary
function drawSummary() {
if (!summaryReady) summaryReady = true;
// Static water background
drawScene(sceneryOffset, waterOffset);
fill(0, 0, 0, 180); noStroke();
rect(width * 0.04, height * 0.03, width * 0.92, height * 0.92, 14);
fill(100, 200, 255); textAlign(CENTER, CENTER); textSize(26);
text("Session Complete", width / 2, height * 0.10);
// Stats
let avgPow = strokeLog.length > 0
? strokeLog.reduce((a, b) => a + b.power, 0) / strokeLog.length : 0;
let avgRhy = strokeLog.length > 0
? strokeLog.reduce((a, b) => a + b.rhythm, 0) / strokeLog.length : 0;
let bestDist = strokeLog.length > 0
? Math.max(...strokeLog.map(s => s.distance)) : 0;
let sy = height * 0.17;
drawStatBox(width * 0.15, sy, "Distance", totalDistance.toFixed(1) + "m", color(100, 220, 255));
drawStatBox(width * 0.35, sy, "Strokes", strokeCount + "", color(255, 220, 50));
drawStatBox(width * 0.55, sy, "Avg Power", round(avgPow * 100) + "%", color(255, 200, 50));
drawStatBox(width * 0.75, sy, "Avg Rhythm", round(avgRhy * 100) + "%", color(100, 200, 255));
// Stroke quality breakdown
fill(180); textSize(12); textAlign(CENTER, CENTER);
text("Stroke Quality Breakdown", width / 2, height * 0.38);
let qualities = ["Powerful", "Strong", "Steady", "Weak", "Choppy"];
let counts = qualities.map(q => strokeLog.filter(s => s.quality === q).length);
let chartX = width * 0.08;
let chartY = height * 0.43;
let chartW = width * 0.84;
let barH = 18;
let maxCount = max(1, Math.max(...counts));
for (let i = 0; i < qualities.length; i++) {
let bw = counts[i] / maxCount * (chartW - 80);
let by = chartY + i * (barH + 8);
let col = strokeColour(qualities[i]);
// Label

fill(180); textSize(10); textAlign(RIGHT, CENTER);
text(qualities[i], chartX + 68, by + barH / 2);
// Bar background
fill(30); noStroke();
rect(chartX + 74, by, chartW - 80, barH, 3);
// Bar fill
fill(col);
if (bw > 0) rect(chartX + 74, by, bw, barH, 3);
// Count label
fill(200); textAlign(LEFT, CENTER); textSize(10);
text(counts[i], chartX + 74 + bw + 6, by + barH / 2);
}
// Distance per stroke chart
fill(180); textSize(11); textAlign(CENTER, CENTER);
text("Distance per Stroke", width / 2, height * 0.72);
let dcX = width * 0.08;
let dcY = height * 0.76;
let dcW = width * 0.84;
let dcH = height * 0.09;
let maxD = max(1, bestDist + 0.3);
fill(20, 30, 60); noStroke();
rect(dcX, dcY, dcW, dcH, 4);
if (strokeLog.length > 0) {
let bw = dcW / strokeLog.length;
for (let i = 0; i < strokeLog.length; i++) {
let bh = (strokeLog[i].distance / maxD) * dcH;
let bx = dcX + i * bw;
let col = strokeColour(strokeLog[i].quality);
fill(col); noStroke();
rect(bx + 1, dcY + dcH - bh, bw - 2, bh, 1);
}
}
// Performance message
let pace = strokeLog.length > 0 ? totalDistance / SESSION_SECONDS : 0;
let perf = pace >= 1.8 ? "Outstanding pace. Exceptional focus and breath control." :
pace >= 1.3 ? "Strong row. Good power and consistent rhythm throughout." :
pace >= 0.8 ? "Developing well. Sustaining both channels will boost your distance." :
"Keep training — calm focus is the key to a powerful stroke.";
fill(160, 255, 160); textSize(11); textAlign(CENTER, CENTER);
text(perf, width / 2, height * 0.88);
fill(255, 220, 50, 200); textSize(12);
text("Press SPACE to row again", width / 2, height * 0.93);
}
function drawStatBox(x, y, label, val, col) {
fill(15, 25, 55); noStroke();
rect(x - 44, y, 88, 52, 8);
fill(col); textAlign(CENTER, CENTER); textSize(15);
text(val, x, y + 20);
fill(160); textSize(9);
text(label, x, y + 38);
}