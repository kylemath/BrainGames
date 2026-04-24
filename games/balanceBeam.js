/**
 * @id balanceBeam
 * @title Balance Beam
 * @category Calm
 * @order 21
 * @newGame false
 *
 * EEG mappings:
 *   meditation -> balance (sway)
 *
 * Copy of /games/balanceBeam.js (the original remains the authoritative
 * reference and MUST NOT be modified). Only this metadata header was
 * prepended; all original code below is preserved byte-for-byte.
 */
// EEG Balance Beam
// EEG Mappings:
// meditation --> balance (calm = stable upright posture, low = sway and wobble)
// attention --> forward progress (focus = confident steps, low = hesitation)
//
// Game: 45 second session, max 3 falls
// Gymnast walks the beam — meditation controls sway, attention controls speed
// Score based on total distance covered, penalised for falls
// State
// "intro" --> instruction screen
// "getready" --> 3-second countdown
// "walking" --> active session
// "falling" --> fall animation
// "summary" --> session complete
let gameState = "intro";
// Session tracking
const SESSION_SECONDS = 45;
const FRAMES_PER_SEC = 30;
const MAX_FALLS = 3;
let sessionFrames = SESSION_SECONDS * FRAMES_PER_SEC;
let totalDistance = 0; // beam lengths covered
let fallCount = 0;
let passCount = 0; // how many full beam lengths completed
let stepLog = []; // { balance, focus, quality } per step snapshot
// Beam definition
// Gymnast position along beam: 0 = left end, 1 = right end
// Direction: 1 = walking right, -1 = walking left
let beamPos = 0.0;
let beamDir = 1;
const BEAM_LENGTH_M = 5.0; // real beam is 5 metres
// Sway
// Sway is lateral offset from beam centre — if abs(sway) > 1.0, fall
let sway = 0.0;
let swayV = 0.0; // sway velocity
const FALL_THRESHOLD = 1.0;
// Fall animation
let fallTimer = 0;
const FALL_DUR = 80;
let fallDir = 1; // which side they fell off
// Step snapshot
let stepTimer = 0;
const STEP_DUR = 22; // frames per step snapshot
// Get ready
let getReadyTimer = 0;
const GETREADY_DUR = 90;
// Intro timer
let introTimer = 300;
// Summary
let summaryReady = false;
let judgeScore = 0;

// Walk animation
let walkCycle = 0; // 0-1 looping, drives limb animation
// EEG smoothing
let attHist = [], medHist = [];
function smoothed(val, hist, n) {
hist.push(val);
if (hist.length > n) hist.shift();
return hist.reduce((a, b) => a + b, 0) / hist.length;
}
// Key input
function keyPressed() {
if (keyCode === 32 && gameState === "intro" && introTimer <= 0) {
getReadyTimer = GETREADY_DUR;
gameState = "getready";
}
if (keyCode === 32 && gameState === "summary" && summaryReady) {
resetSession();
}
}
// Setup
function setup() {
colorMode(RGB);
}
function resetSession() {
sessionFrames = SESSION_SECONDS * FRAMES_PER_SEC;
totalDistance = 0;
fallCount = 0;
passCount = 0;
stepLog = [];
beamPos = 0.0;
beamDir = 1;
sway = 0.0;
swayV = 0.0;
walkCycle = 0;
stepTimer = 0;
attHist = [];
medHist = [];
getReadyTimer = 0;
summaryReady = false;
introTimer = 300;
gameState = "intro";
}
// Step quality
function stepQuality(bal, foc) {
let avg = (bal + foc) / 2;
if (avg >= 0.58) return "Excellent";
if (avg >= 0.48) return "Good";
if (avg >= 0.38) return "Steady";
if (bal < 0.28) return "Shaky";
return "Weak";
}
function stepColour(quality) {
if (quality === "Excellent") return color(255, 220, 0);
if (quality === "Good") return color(0, 220, 100);
if (quality === "Steady") return color(100, 180, 255);

if (quality === "Weak") return color(255, 140, 50);
return color(255, 60, 60); // Shaky
}
// Main draw
function draw() {
if (!eegData.connected) {
background(40, 30, 60);
fill(255); textAlign(CENTER, CENTER); textSize(20);
text("Connect or simulate EEG to play", width / 2, height / 2);
return;
}
let att = smoothed(eegData.attention !== undefined ? eegData.attention : 0.5, attHist, 6);
let med = smoothed(eegData.meditation !== undefined ? eegData.meditation : 0.5, medHist, 8);
if (gameState === "intro") {
drawArena();
drawBeam();
drawGymnast(0.0, 0.0, 0, 1);
drawIntro();
if (introTimer > 0) introTimer--;
return;
}
if (gameState === "getready") {
drawArena();
drawBeam();
drawGymnast(beamPos, 0.0, 0, beamDir);
drawGetReady();
getReadyTimer--;
if (getReadyTimer <= 0) gameState = "walking";
return;
}
if (gameState === "summary") {
drawSummary();
return;
}
if (gameState === "falling") {
drawArena();
drawBeam();
drawFallingGymnast(fallTimer / FALL_DUR);
fallTimer--;
if (fallTimer <= 0) {
fallCount++;
if (fallCount >= MAX_FALLS || sessionFrames <= 0) {
judgeScore = calcJudgeScore();
summaryReady = false;
gameState = "summary";
} else {
// Reset to beam start for next attempt
beamPos = beamDir === 1 ? 0.0 : 1.0;
sway = 0.0;
swayV = 0.0;
getReadyTimer = GETREADY_DUR;
gameState = "getready";
}
}
return;

}
// Walking session
sessionFrames--;
// Sway physics — driven by meditation
let stability = constrain(map(med, 0.22, 0.68, 0, 1), 0, 1);
let swayForce = map(stability, 0, 1, 0.010, 0.0005);
let wobble = map(stability, 0, 1, 0.17, 0.0);
swayV += random(-swayForce, swayForce) + sin(frameCount * 0.09) * wobble * 0.036;
swayV *= 0.905; // strong damping
sway += swayV;
sway = constrain(sway, -1.4, 1.4);
// Forward speed — driven by attention
let focusLevel = constrain(map(att, 0.30, 0.65, 0, 1), 0, 1);
let speed = map(focusLevel, 0, 1, 0.001, 0.008);
beamPos += speed * beamDir;
totalDistance += speed * BEAM_LENGTH_M;
// Walk cycle speed proportional to forward speed
walkCycle = (walkCycle + speed * 18) % 1.0;
// Step snapshot
stepTimer++;
if (stepTimer >= STEP_DUR) {
stepTimer = 0;
let q = stepQuality(med, att);
stepLog.push({ balance: med, focus: att, quality: q });
}
// Check for fall
if (abs(sway) >= FALL_THRESHOLD) {
fallDir = sway > 0 ? 1 : -1;
fallTimer = FALL_DUR;
gameState = "falling";
return;
}
// Check for end of beam — turn around
if (beamPos >= 1.0) {
beamPos = 1.0;
beamDir = -1;
passCount++;
} else if (beamPos <= 0.0 && beamDir === -1) {
beamPos = 0.0;
beamDir = 1;
passCount++;
}
// End session
if (sessionFrames <= 0) {
judgeScore = calcJudgeScore();
summaryReady = false;
gameState = "summary";
return;
}
drawArena();
drawBeam();
drawGymnast(beamPos, sway, walkCycle, beamDir);

drawHUD(att, med);
}
// Judge score calculation
function calcJudgeScore() {
let base = map(totalDistance, 0, BEAM_LENGTH_M * 6, 0, 10);
let fallPenalty = fallCount * 0.8;
let avgBal = stepLog.length > 0
? stepLog.reduce((a, b) => a + b.balance, 0) / stepLog.length : 0.5;
let balBonus = map(avgBal, 0.3, 0.7, -1, 1);
return constrain(round((base - fallPenalty + balBonus) * 10) / 10, 0, 10);
}
// Drawing: Arena
function drawArena() {
// Background — arena wall
for (let i = 0; i < height; i++) {
let t = i / height;
stroke(lerpColor(color(35, 28, 55), color(55, 42, 80), t));
line(0, i, width, i);
}
noStroke();
// Crowd in background — dense packed stands
fill(25, 18, 44);
rect(0, 0, width, height * 0.44);
// Tiered stand structure
fill(38, 30, 60);
for (let tier = 0; tier < 5; tier++) {
rect(0, height * 0.05 + tier * height * 0.07, width, height * 0.065);
}
// Crowd figures — packed tightly shoulder to shoulder
let figW = 13;
let figGap = 1;
let figPerRow = floor(width / (figW + figGap));
let crowdCols = [
[220,30,30],[255,255,255],[0,80,180],[255,180,0],
[0,140,60],[180,0,180],[255,100,0],[0,180,200]
];
for (let row = 0; row < 5; row++) {
let rowY = height * 0.09 + row * height * 0.068;
let offset = row % 2 === 0 ? 0 : (figW + figGap) / 2;
for (let col = 0; col < figPerRow + 1; col++) {
let cx = col * (figW + figGap) + offset;
if (cx > width + figW) continue;
let ci = (col * 3 + row * 7 + col % 5) % 8;
let jc = crowdCols[ci];
// Body
fill(jc[0], jc[1], jc[2]); noStroke();
rect(cx - figW * 0.45, rowY, figW * 0.9, 10, 1);
// Head
let skinV = 175 + (col * 11 + row * 13) % 55;
fill(skinV, skinV * 0.78, skinV * 0.65);
ellipse(cx, rowY - 5, figW * 0.7, figW * 0.75);
}
}
// Judge's table — centred in screen

let jtW = width * 0.36;
let jtX = width / 2 - jtW / 2;
let jtY = height * 0.48;
let jtH = height * 0.11;
fill(45, 35, 70); noStroke();
rect(jtX, jtY, jtW, jtH, 5);
fill(60, 48, 90);
rect(jtX, jtY, jtW, 5, 5);
// "JUDGES" label banner above table
fill(200, 30, 30); noStroke();
rect(jtX + jtW * 0.25, jtY - 16, jtW * 0.50, 14, 3);
fill(255); textAlign(CENTER, CENTER); textSize(9);
text("JUDGES", width / 2, jtY - 9);
// Judge nameplates and figures — 3 judges evenly spaced
for (let j = 0; j < 3; j++) {
let jx = jtX + jtW * 0.18 + j * (jtW * 0.32);
// Nameplate
fill(35, 28, 55); noStroke();
rect(jx - 16, jtY + jtH * 0.40, 32, 20, 3);
fill(200, 200, 255); textAlign(CENTER, CENTER); textSize(9);
text("Judge " + (j + 1), jx, jtY + jtH * 0.54);
// Figure head
fill(190, 165, 145); noStroke();
ellipse(jx, jtY + jtH * 0.18, 12, 12);
// Figure body
fill(50, 80, 50);
rect(jx - 6, jtY + jtH * 0.26, 12, 12, 2);
}
// Floor / mat
fill(210, 195, 170); noStroke();
rect(0, height * 0.76, width, height * 0.24);
// Mat pattern — landing area under beam
fill(180, 165, 145);
rect(width * 0.10, height * 0.76, width * 0.80, height * 0.24);
// Mat border lines
stroke(160, 145, 125); strokeWeight(1);
rect(width * 0.10, height * 0.76, width * 0.80, height * 0.24);
noStroke();
// Purple mat under beam — between the two support stands
fill(120, 80, 160); noStroke();
rect(width * 0.17, height * 0.76, width * 0.66, height * 0.06, 3);
// Mat highlight
fill(140, 100, 180, 120);
rect(width * 0.17, height * 0.76, width * 0.66, height * 0.015, 3);
// Mat border
stroke(100, 60, 140); strokeWeight(1);
noFill();
rect(width * 0.17, height * 0.76, width * 0.66, height * 0.06, 3);
noStroke();
// Beam support legs — angled A-frame style in lavender
let legCol = color(170, 150, 210); // lavender
let legColDark = color(140, 120, 180);
let beamY = height * 0.62;
let floorY = height * 0.76;

// Left A-frame — two legs angling outward from beam contact point
fill(legCol); noStroke();
// Left leg of left A-frame (angled further left)
beginShape();
vertex(width * 0.185, beamY);
vertex(width * 0.195, beamY);
vertex(width * 0.155, floorY);
vertex(width * 0.145, floorY);
endShape(CLOSE);
// Right leg of left A-frame (angled slightly right)
beginShape();
vertex(width * 0.195, beamY);
vertex(width * 0.205, beamY);
vertex(width * 0.225, floorY);
vertex(width * 0.215, floorY);
endShape(CLOSE);
// Cross brace on left A-frame
stroke(legColDark); strokeWeight(2);
line(width * 0.152, height * 0.71, width * 0.218, height * 0.71);
noStroke();
// Right A-frame
fill(legCol); noStroke();
// Left leg of right A-frame
beginShape();
vertex(width * 0.795, beamY);
vertex(width * 0.805, beamY);
vertex(width * 0.775, floorY);
vertex(width * 0.765, floorY);
endShape(CLOSE);
// Right leg of right A-frame
beginShape();
vertex(width * 0.805, beamY);
vertex(width * 0.815, beamY);
vertex(width * 0.845, floorY);
vertex(width * 0.835, floorY);
endShape(CLOSE);
// Cross brace on right A-frame
stroke(legColDark); strokeWeight(2);
line(width * 0.772, height * 0.71, width * 0.838, height * 0.71);
noStroke();
}
// Drawing: Beam
function drawBeam() {
let bx1 = width * 0.15;
let bx2 = width * 0.85;
let by = height * 0.60;
let bh = 10; // beam height in pixels
// Beam shadow
fill(0, 0, 0, 40); noStroke();
rect(bx1 + 4, by + bh + 2, bx2 - bx1, 6, 2);
// Beam surface
fill(200, 175, 130); noStroke();
rect(bx1, by, bx2 - bx1, bh, 2);
// Beam top highlight
fill(220, 200, 155);

rect(bx1, by, bx2 - bx1, 3, 2);
// Beam end caps
fill(180, 155, 110);
rect(bx1 - 4, by - 2, 8, bh + 4, 2);
rect(bx2 - 4, by - 2, 8, bh + 4, 2);
}
// Drawing: Gymnast
function drawGymnast(pos, sw, cycle, dir) {
let bx1 = width * 0.15;
let bx2 = width * 0.85;
let beamY = height * 0.60;
// Position along beam
let gx = lerp(bx1, bx2, pos);
let gy = beamY - 2; // standing on top of beam
// Sway offset — lateral lean
let swayPx = sw * 18; // max 18px sway visible
push();
translate(gx + swayPx, gy);
// Body lean from sway
let leanAng = sw * 0.28;
rotate(leanAng);
// Legs
let legSwing = sin(cycle * TWO_PI) * 12 * map(abs(swayPx), 0, 18, 1, 0.3);
let legDir = dir === 1 ? 1 : -1;
// Back leg
fill(220, 50, 100); noStroke(); // leotard colour — gymnastic pink/red
beginShape();
vertex(-3, 0); vertex(3, 0);
vertex(3 + legDir * legSwing * 0.4, -20);
vertex(-3 + legDir * legSwing * 0.4, -20);
endShape(CLOSE);
// Front leg
beginShape();
vertex(-3, 0); vertex(3, 0);
vertex(3 - legDir * legSwing * 0.4, -20);
vertex(-3 - legDir * legSwing * 0.4, -20);
endShape(CLOSE);
// Feet / shoes
fill(255, 255, 255, 200);
ellipse(legDir * legSwing * 0.4, -21, 8, 5);
ellipse(-legDir * legSwing * 0.4, -21, 8, 5);
// Torso
fill(220, 50, 100); noStroke();
rect(-6, -38, 12, 18, 3);
// Leotard detail
fill(255, 100, 150, 160);
rect(-6, -38, 12, 5, 2);
// Arms — outstretched for balance
// Arms sway opposite to body lean for counterbalance
let armLift = map(abs(sw), 0, 1, 0, 0.3);
let armSway = -sw * 0.4; // arms go opposite to sway

// Left arm
fill(240, 195, 145); noStroke();
beginShape();
vertex(-6, -34);
vertex(-6, -30);
vertex(-32 + armSway * 8, -28 - armLift * 12);
vertex(-30 + armSway * 8, -32 - armLift * 12);
endShape(CLOSE);
// Right arm
beginShape();
vertex(6, -34);
vertex(6, -30);
vertex(32 + armSway * 8, -28 - armLift * 12);
vertex(30 + armSway * 8, -32 - armLift * 12);
endShape(CLOSE);
// Hands
fill(220, 170, 120);
ellipse(-31 + armSway * 8, -30 - armLift * 12, 7, 7);
ellipse(31 + armSway * 8, -30 - armLift * 12, 7, 7);
// Head
fill(240, 195, 145); noStroke();
ellipse(0, -46, 13, 14);
// Hair
fill(80, 50, 30);
arc(0, -46, 13, 14, PI, TWO_PI);
// Hair bun
ellipse(0, -52, 8, 7);
// Eyes
fill(40, 40, 40);
ellipse(-3, -45, 3, 2);
ellipse( 3, -45, 3, 2);
// Mouth — smile when balanced, neutral when wobbly
stroke(abs(sw) < 0.4 ? color(180, 80, 80) : color(100, 80, 80));
strokeWeight(1.2); noFill();
if (abs(sw) < 0.4) {
arc(0, -42, 6, 4, 0, PI);
} else {
line(-3, -42, 3, -42);
}
noStroke();
pop();
}
// Drawing: Falling gymnast
function drawFallingGymnast(t) {
let bx1 = width * 0.15;
let bx2 = width * 0.85;
let beamY = height * 0.60;
let gx = lerp(bx1, bx2, beamPos);
let matY = height * 0.76;
// Fall arc
let fallX = gx + fallDir * t * 60;
let fallY = lerp(beamY - 2, matY - 10, t);
let rot = fallDir * t * PI * 0.6;
push();
translate(fallX, fallY);

rotate(rot);
// Draw simplified gymnast in fall
fill(220, 50, 100); noStroke();
rect(-6, -38, 12, 38, 3);
fill(240, 195, 145);
ellipse(0, -46, 13, 14);
// Arms flailing
stroke(240, 195, 145); strokeWeight(4);
line(-6, -32, -28, -18 - t * 20);
line( 6, -32, 28, -18 - t * 20);
noStroke();
pop();
// Impact text
if (t > 0.85) {
fill(255, 80, 80, map(t, 0.85, 1.0, 0, 200));
textAlign(CENTER, CENTER); textSize(18);
text("Fall!", gx + fallDir * 55, matY - 25);
fill(255, 160, 80, map(t, 0.85, 1.0, 0, 180));
textSize(12);
text(fallCount + 1 < MAX_FALLS ? "Retrying..." : "Session over", gx + fallDir * 55, matY - 8);
}
}
// Drawing: HUD
function drawHUD(att, med) {
fill(0, 0, 0, 160); noStroke();
rect(0, height - 68, width, 68);
// Timer
let secsLeft = ceil(sessionFrames / FRAMES_PER_SEC);
fill(secsLeft <= 10 ? color(255, 80, 80) : color(255, 220, 50));
textAlign(LEFT, CENTER); textSize(22);
text(secsLeft + "s", 14, height - 42);
// Distance and passes
fill(200, 180, 255); textSize(13);
text(totalDistance.toFixed(1) + "m", 14, height - 20);
// Falls remaining
fill(fallCount > 0 ? color(255, 100, 80) : color(180));
textSize(11); textAlign(LEFT, CENTER);
text("Falls: " + fallCount + " / " + MAX_FALLS, 90, height - 34);
// Last step quality
if (stepLog.length > 0) {
let last = stepLog[stepLog.length - 1];
fill(stepColour(last.quality));
textSize(11);
text(last.quality, 90, height - 18);
}
// EEG bars
let bx = width * 0.30;
drawBar(bx, height - 60, med, "Meditation (balance)", color(100, 200, 255));
drawBar(bx + 170, height - 60, att, "Attention (progress)", color(255, 200, 50));
// Sway indicator
let six = width * 0.78;
let siw = 120;
fill(30); noStroke();

rect(six, height - 52, siw, 14, 4);
// Danger zones
fill(255, 60, 60, 80);
rect(six, height - 52, siw * 0.18, 14, 4);
rect(six + siw * 0.82, height - 52, siw * 0.18, 14, 4);
// Sway marker
let swayFrac = map(sway, -FALL_THRESHOLD, FALL_THRESHOLD, 0, 1);
let markerCol = abs(sway) > 0.7 ? color(255, 60, 60) :
abs(sway) > 0.4 ? color(255, 180, 50) : color(0, 220, 120);
fill(markerCol); noStroke();
ellipse(six + siw * constrain(swayFrac, 0.05, 0.95), height - 45, 12, 12);
// Centre line
stroke(200, 200, 200, 100); strokeWeight(1);
line(six + siw * 0.5, height - 52, six + siw * 0.5, height - 38);
noStroke();
fill(200); textAlign(CENTER, TOP); textSize(9);
text("Balance", six + siw / 2, height - 36);
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
fill(0, 0, 0, 160); noStroke();
rect(width * 0.30, height * 0.25, width * 0.40, height * 0.30, 12);
fill(200, 180, 255); textAlign(CENTER, CENTER); textSize(18);
text("Get Ready", width / 2, height * 0.33);
let secs = ceil(getReadyTimer / FRAMES_PER_SEC);
fill(255, 220, 50); textSize(42);
text(secs, width / 2, height * 0.46);
}
// Drawing: Intro
function drawIntro() {
fill(0, 0, 0, 170); noStroke();
rect(width * 0.08, height * 0.06, width * 0.84, height * 0.88, 14);
fill(200, 180, 255); textAlign(CENTER, CENTER); textSize(28);
text("EEG Balance Beam", width / 2, height * 0.14);
fill(255); textSize(13);
text("45 seconds. Walk as far as you can without falling.", width / 2, height * 0.22);
stroke(80, 60, 120); strokeWeight(1);
line(width * 0.18, height * 0.27, width * 0.82, height * 0.27);
noStroke();
fill(100, 200, 255); textSize(13);
text("BALANCE (Meditation)", width / 2, height * 0.33);
fill(200); textSize(12);
text("Your meditation score controls how steady you are on the beam.", width / 2, height * 0.39);
text("High calm = stable upright posture = safe forward movement.", width / 2, height * 0.44);
text("Low meditation = sway and wobble = risk of falling off.", width / 2, height * 0.49);

stroke(80, 60, 120); strokeWeight(1);
line(width * 0.18, height * 0.54, width * 0.82, height * 0.54);
noStroke();
fill(255, 220, 50); textSize(13);
text("PROGRESS (Attention)", width / 2, height * 0.60);
fill(200); textSize(12);
text("Your attention score drives the gymnast forward along the beam.", width / 2, height * 0.66);
text("High focus = confident steps = more distance covered.", width / 2, height * 0.71);
text("Low attention = hesitation = slow progress.", width / 2, height * 0.76);
fill(255, 255, 255, 180); textSize(12);
if (introTimer > 0) {
text("Please read above (" + ceil(introTimer / 30) + "s)", width / 2, height * 0.87);
} else {
text("Press SPACE to begin", width / 2, height * 0.87);
}
}
// Drawing: Summary
function drawSummary() {
if (!summaryReady) summaryReady = true;
drawArena();
fill(0, 0, 0, 185); noStroke();
rect(width * 0.04, height * 0.03, width * 0.92, height * 0.92, 14);
fill(200, 180, 255); textAlign(CENTER, CENTER); textSize(26);
text("Routine Complete", width / 2, height * 0.10);
// Stat boxes
let avgBal = stepLog.length > 0
? stepLog.reduce((a, b) => a + b.balance, 0) / stepLog.length : 0;
let avgFoc = stepLog.length > 0
? stepLog.reduce((a, b) => a + b.focus, 0) / stepLog.length : 0;
let sy = height * 0.17;
drawStatBox(width * 0.15, sy, "Distance", totalDistance.toFixed(1) + "m", color(200, 180, 255));
drawStatBox(width * 0.35, sy, "Falls", fallCount + " / " + MAX_FALLS, color(255, 100, 80));
drawStatBox(width * 0.55, sy, "Avg Calm", round(avgBal * 100) + "%", color(100, 200, 255));
drawStatBox(width * 0.75, sy, "Judge Score", judgeScore.toFixed(1) + "/10", color(255, 220, 50));
// Step quality breakdown
fill(180); textSize(12); textAlign(CENTER, CENTER);
text("Step Quality Breakdown", width / 2, height * 0.38);
let qualities = ["Excellent", "Good", "Steady", "Weak", "Shaky"];
let counts = qualities.map(q => stepLog.filter(s => s.quality === q).length);
let chartX = width * 0.08;
let chartY = height * 0.43;
let chartW = width * 0.84;
let barH = 18;
let maxCount = max(1, Math.max(...counts));
for (let i = 0; i < qualities.length; i++) {
let bw = counts[i] / maxCount * (chartW - 80);
let by = chartY + i * (barH + 8);
let col = stepColour(qualities[i]);
fill(180); textSize(10); textAlign(RIGHT, CENTER);
text(qualities[i], chartX + 68, by + barH / 2);

fill(30); noStroke();
rect(chartX + 74, by, chartW - 80, barH, 3);
fill(col);
if (bw > 0) rect(chartX + 74, by, bw, barH, 3);
fill(200); textAlign(LEFT, CENTER); textSize(10);
text(counts[i], chartX + 74 + bw + 6, by + barH / 2);
}
// Balance over time bar chart
fill(180); textSize(11); textAlign(CENTER, CENTER);
text("Balance per Step", width / 2, height * 0.72);
let dcX = width * 0.08;
let dcY = height * 0.76;
let dcW = width * 0.84;
let dcH = height * 0.09;
fill(20, 16, 35); noStroke();
rect(dcX, dcY, dcW, dcH, 4);
if (stepLog.length > 0) {
let bw = dcW / stepLog.length;
for (let i = 0; i < stepLog.length; i++) {
let bh = stepLog[i].balance * dcH;
let bx = dcX + i * bw;
let col = stepColour(stepLog[i].quality);
fill(col); noStroke();
rect(bx + 1, dcY + dcH - bh, bw - 2, bh, 1);
}
// Fall markers
for (let i = 0; i < stepLog.length; i++) {
if (stepLog[i].quality === "Shaky") {
fill(255, 60, 60, 160); noStroke();
rect(dcX + i * bw, dcY, bw, dcH);
}
}
}
// Performance message
let perf = judgeScore >= 8.5 ? "Outstanding routine. Exceptional control and composure throughout." :
judgeScore >= 6.5 ? "Strong performance. Good balance and consistent forward progress." :
judgeScore >= 4.0 ? "Developing well. Sustaining calm will reduce your sway significantly." :
"Keep practising — steady breathing is the key to staying on the beam.";

fill(160, 255, 160); textSize(11); textAlign(CENTER, CENTER);
text(perf, width / 2, height * 0.88);
fill(255, 220, 50, 200); textSize(12);
text("Press SPACE to perform again", width / 2, height * 0.93);
}
function drawStatBox(x, y, label, val, col) {
fill(20, 14, 40); noStroke();
rect(x - 44, y, 88, 52, 8);
fill(col); textAlign(CENTER, CENTER); textSize(15);
text(val, x, y + 20);
fill(160); textSize(9);
text(label, x, y + 38);
}