/**
 * @id reactionRace
 * @title F1 Reaction Race
 * @category Focus
 * @order 26
 * @newGame false
 *
 * EEG mappings:
 *   attention -> pre-stimulus alertness
 *
 * Copy of /games/reactionRace.js (the original remains the authoritative
 * reference and MUST NOT be modified). Only this metadata header was
 * prepended; all original code below is preserved byte-for-byte.
 */
// EEG F1 Reaction Time
// EEG Mappings:
// attention --> pre-stimulus alertness (measured 2s before lights out)
// meditation --> displayed for info only
//
// Game structure:
// 10 trials per session
// 5 red lights illuminate one by one (~1s apart)
// Random hold after light 5 (1–4 seconds) then all go out simultaneously
// Player presses Space to react — reaction time measured in ms
// False start if Space pressed before lights go out
// Session summary: reaction times, pre-stimulus attention, best/avg
// State
// "intro" --> instruction screen
// "getready" --> brief countdown before each trial
// "sequence" --> lights illuminating one by one
// "hold" --> all 5 lights on, random wait
// "go" --> lights out — waiting for Space
// "result" --> reaction time shown
// "falsestart" --> false start penalty
// "summary" --> session complete
let gameState = "intro";
// Trial tracking
const MAX_TRIALS = 10;
let trialCount = 0;
let reactionTimes = []; // ms per trial
let preStimAtts = []; // avg attention in 2s before lights out
let falseStarts = 0;
let falseStartTrials = []; // which trial numbers had false starts
let pendingPenalty = false; // 500ms added to next reaction if false start on this trial
const FALSE_START_PENALTY_MS = 500;
// Light sequence
// 5 lights illuminate one by one, ~30 frames apart at 30fps
let lightsOn = 0; // how many lights are currently lit (0-5)
let lightTimer = 0; // frames until next light
const LIGHT_INTERVAL = 30; // frames between each light (~1s at 30fps)
let holdTimer = 0; // frames of random hold after light 5
let holdDuration = 0; // randomly set between 30 and 120 frames (1-4s)
// Reaction timing
let goFrame = 0; // frameCount when lights went out (kept for reference)
let goMillis = 0; // millis() timestamp when lights went out — used for precise RT
let reactionMs = 0; // last reaction time in ms
let waitingForGo = false;
// Pre-stimulus attention buffer
// Collect attention for 2 seconds (60 frames) before lights out
let preStimBuffer = [];
const PRESTIM_FRAMES = 60;
// Get ready timer
let getReadyTimer = 0;
const GETREADY_DUR = 90; // ~3 seconds at 30fps
// Result display timer
let resultTimer = 0;
const RESULT_DUR = 120;

// False start timer
let falseStartTimer = 0;
const FALSESTART_DUR = 90;
// Intro timer
let introTimer = 270;
// EEG smoothing
let attHist = [], medHist = [];
function smoothed(val, hist, n) {
hist.push(val);
if (hist.length > n) hist.shift();
return hist.reduce((a, b) => a + b, 0) / hist.length;
}
// Flag wave animation
let flagWave = 0;
// Setup
function setup() {
colorMode(RGB);
}
function startTrial() {
lightsOn = 0;
lightTimer = LIGHT_INTERVAL;
holdTimer = 0;
holdDuration = floor(random(30, 120));
waitingForGo = false;
preStimBuffer = [];
// pendingPenalty is intentionally NOT reset here —
// it must persist from the false start through to the retry reaction
gameState = "sequence";
}
function resetSession() {
trialCount = 0;
reactionTimes = [];
preStimAtts = [];
falseStarts = 0;
falseStartTrials = [];
pendingPenalty = false;
introTimer = 270;
attHist = [];
medHist = [];
gameState = "intro";
}
// Key input
function keyPressed() {
if (keyCode !== 32) return; // Space only
if (gameState === "intro" && introTimer <= 0) {
gameState = "getready";
getReadyTimer = GETREADY_DUR;
return;
}
if (gameState === "sequence" || gameState === "hold") {
falseStarts++;

falseStartTrials.push(trialCount + 1);
pendingPenalty = true; // 500ms penalty applied to this trial's reaction time
falseStartTimer = FALSESTART_DUR;
gameState = "falsestart";
return;
}
if (gameState === "go") {
reactionMs = round(millis() - goMillis);
if (pendingPenalty) {
reactionMs += FALSE_START_PENALTY_MS; // apply 500ms false start penalty
pendingPenalty = false;
}
let avgPreAtt = preStimBuffer.length > 0
? preStimBuffer.reduce((a, b) => a + b, 0) / preStimBuffer.length
: 0;
reactionTimes.push(reactionMs);
preStimAtts.push(avgPreAtt);
resultTimer = RESULT_DUR;
gameState = "result";
return;
}
if (gameState === "summary") {
resetSession();
}
}
// Main draw loop
function draw() {
flagWave += 0.04;
if (!eegData.connected) {
background(10, 10, 20);
fill(255); textAlign(CENTER, CENTER); textSize(20);
text("Connect or simulate EEG to play", width / 2, height / 2);
return;
}
let att = smoothed(eegData.attention !== undefined ? eegData.attention : 0.5, attHist, 6);
let med = smoothed(eegData.meditation !== undefined ? eegData.meditation : 0.5, medHist, 8);
// Always draw cockpit scene as base (except intro/summary)
if (gameState !== "intro" && gameState !== "summary") {
drawTrack();
drawLightsGantry();
drawCockpit();
drawHUD(att, med);
}
// State logic
if (gameState === "intro") {
drawIntro();
if (introTimer > 0) introTimer--;
return;
}
if (gameState === "getready") {
drawGetReady(att);
getReadyTimer--;

if (getReadyTimer <= 0) startTrial();
return;
}
if (gameState === "sequence") {
// Collect pre-stimulus attention
preStimBuffer.push(att);
if (preStimBuffer.length > PRESTIM_FRAMES) preStimBuffer.shift();
lightTimer--;
if (lightTimer <= 0 && lightsOn < 5) {
lightsOn++;
lightTimer = LIGHT_INTERVAL;
if (lightsOn === 5) {
// All 5 on — start random hold
gameState = "hold";
holdTimer = holdDuration;
}
}
}
if (gameState === "hold") {
// Collect pre-stimulus attention during hold
preStimBuffer.push(att);
if (preStimBuffer.length > PRESTIM_FRAMES) preStimBuffer.shift();
holdTimer--;
if (holdTimer <= 0) {
lightsOn = 0; // all lights out
goFrame = frameCount;
goMillis = millis(); // precise timestamp for reaction time measurement
gameState = "go";
}
}
if (gameState === "go") {
// Waiting for Space — no timeout, player must respond
// Draw "GO" indicator
drawGoOverlay();
}
if (gameState === "result") {
resultTimer--;
drawResultOverlay();
if (resultTimer <= 0) {
trialCount++;
if (trialCount >= MAX_TRIALS) {
gameState = "summary";
} else {
gameState = "getready";
getReadyTimer = GETREADY_DUR;
}
}
}
if (gameState === "falsestart") {
falseStartTimer--;
drawFalseStartOverlay();
if (falseStartTimer <= 0) {
// Retry same trial
gameState = "getready";
getReadyTimer = GETREADY_DUR;

}
}
if (gameState === "summary") {
drawSummary();
}
}
// Drawing: Track scene
function drawTrack() {
// Sky gradient
for (let i = 0; i < height * 0.50; i++) {
let t = i / (height * 0.50);
stroke(lerpColor(color(30, 45, 80), color(110, 145, 200), t));
line(0, i, width, i);
}
noStroke();
// Track surface — wide perspective trapezoid, fills most of the lower screen
fill(62, 62, 68);
beginShape();
vertex(0, height * 0.50);
vertex(width, height * 0.50);
vertex(width * 0.62, height * 0.34);
vertex(width * 0.38, height * 0.34);
endShape(CLOSE);
// Tarmac detail lines (perspective)
stroke(70, 70, 76); strokeWeight(1);
for (let i = 0; i <= 8; i++) {
let t = i / 8;
let y = lerp(height * 0.34, height * 0.50, t);
let xl = lerp(width * 0.38, 0, t);
let xr = lerp(width * 0.62, width, t);
line(xl, y, xr, y);
}
noStroke();
// White start/finish line — wide, prominent
fill(255, 255, 255);
beginShape();
vertex(lerp(width * 0.38, 0, 0.55), lerp(height * 0.34, height * 0.50, 0.55) - 2);
vertex(lerp(width * 0.62, width, 0.55), lerp(height * 0.34, height * 0.50, 0.55) - 2);
vertex(lerp(width * 0.62, width, 0.55), lerp(height * 0.34, height * 0.50, 0.55) + 5);
vertex(lerp(width * 0.38, 0, 0.55), lerp(height * 0.34, height * 0.50, 0.55) + 5);
endShape(CLOSE);
// Chequered pattern on start line
let slY = lerp(height * 0.34, height * 0.50, 0.55);
let slXL = lerp(width * 0.38, 0, 0.55);
let slXR = lerp(width * 0.62, width, 0.55);
let slW = slXR - slXL;
let sqW = slW / 16;
for (let i = 0; i < 16; i++) {
if (i % 2 === 0) {
fill(0);
rect(slXL + i * sqW, slY - 2, sqW, 7);
}
}
// White edge lines on track sides (kerbing hint)

stroke(255, 255, 255, 140); strokeWeight(3);
line(lerp(width * 0.38, 0, 0), lerp(height * 0.34, height * 0.50, 0),
lerp(width * 0.38, 0, 1), lerp(height * 0.34, height * 0.50, 1));
line(lerp(width * 0.62, width, 0), lerp(height * 0.34, height * 0.50, 0),
lerp(width * 0.62, width, 1), lerp(height * 0.34, height * 0.50, 1));
// Red/white kerbing strips left side
for (let i = 0; i < 6; i++) {
let t1 = i / 6, t2 = (i + 1) / 6;
let y1 = lerp(height * 0.34, height * 0.50, t1);
let y2 = lerp(height * 0.34, height * 0.50, t2);
let x1 = lerp(width * 0.38, 0, t1);
let x2 = lerp(width * 0.38, 0, t2);
fill(i % 2 === 0 ? color(220, 30, 30) : color(255));
noStroke();
beginShape();
vertex(x1 - 18, y1); vertex(x1, y1);
vertex(x2, y2); vertex(x2 - 18, y2);
endShape(CLOSE);
}
// Right side kerbing
for (let i = 0; i < 6; i++) {
let t1 = i / 6, t2 = (i + 1) / 6;
let y1 = lerp(height * 0.34, height * 0.50, t1);
let y2 = lerp(height * 0.34, height * 0.50, t2);
let x1 = lerp(width * 0.62, width, t1);
let x2 = lerp(width * 0.62, width, t2);
fill(i % 2 === 0 ? color(220, 30, 30) : color(255));
noStroke();
beginShape();
vertex(x1, y1); vertex(x1 + 18, y1);
vertex(x2 + 18, y2); vertex(x2, y2);
endShape(CLOSE);
}
noStroke();
// Grandstands — angled to match track perspective vanishing point
// Left stand tilts inward (right edge higher than left edge)
drawStand(0, height * 0.10, width * 0.30, height * 0.24, true);
// Right stand tilts inward (left edge higher than right edge)
drawStand(width * 0.70, height * 0.10, width * 0.30, height * 0.24, false);
}
function drawStand(sx, sy, sw, sh, tiltRight) {
// tiltRight=true means right edge is raised (left stand angling toward track)
// tiltRight=false means left edge is raised (right stand angling toward track)
let tiltAmount = sh * 0.55; // steeper tilt to match track's strong perspective convergence
let syL = tiltRight ? sy + tiltAmount : sy; // left edge y
let syR = tiltRight ? sy : sy + tiltAmount; // right edge y
// Stand structure — parallelogram shape
fill(35, 35, 50); noStroke();
beginShape();
vertex(sx, syL);
vertex(sx + sw, syR);
vertex(sx + sw, syR + sh);
vertex(sx, syL + sh);
endShape(CLOSE);
// Tier lines — angled to match perspective
stroke(45, 45, 62); strokeWeight(1);

let tierCount = 6;
for (let t = 0; t <= tierCount; t++) {
let frac = t / tierCount;
let lx = sx, ly = syL + frac * sh;
let rx = sx + sw, ry = syR + frac * sh;
line(lx, ly, rx, ry);
}
noStroke();
// Crowd — rows of head+body figures, angled rows
let rowCount = 5;
let figW = max(5, floor(sw / 22));
let figPerRow = floor(sw / (figW + 2));
let jerseyPalette = [
[220, 30, 30],
[255, 255, 255],
[0, 60, 180],
[255, 180, 0],
[0, 140, 60],
[255, 100, 0],
[120, 0, 180],
[0, 180, 200],
];
for (let row = 0; row < rowCount; row++) {
let rowFrac = (row + 0.2) / rowCount;
let rowH = sh / rowCount;
let headR = max(2, figW * 0.40);
let bodyH = max(3, rowH * 0.42);
for (let f = 0; f < figPerRow; f++) {
let colFrac = f / figPerRow;
let fx = sx + f * (figW + 2) + figW / 2;
// Row y interpolates between left and right edges for perspective
let rowBaseY = lerp(syL, syR, colFrac) + rowFrac * sh;
let ci = (f * 3 + row * 7 + f % 5) % jerseyPalette.length;
let jc = jerseyPalette[ci];
fill(jc[0], jc[1], jc[2]); noStroke();
rect(fx - figW * 0.4, rowBaseY + headR * 1.8, figW * 0.8, bodyH, 1);
let skinV = 180 + (f * 13 + row * 17) % 60;
fill(skinV, skinV * 0.78, skinV * 0.65);
ellipse(fx, rowBaseY + headR, headR * 2, headR * 2.2);
}
}
// Stand roof canopy — angled
fill(50, 52, 72); noStroke();
beginShape();
vertex(sx, syL - 10);
vertex(sx + sw, syR - 10);
vertex(sx + sw, syR + 2);
vertex(sx, syL + 2);
endShape(CLOSE);
}
// Drawing: Lights gantry
function drawLightsGantry() {
// Gantry spans full track width at horizon level

let gy = height * 0.33;
let gxL = width * 0.30;
let gxR = width * 0.70;
let gw = gxR - gxL;
// Tall support towers on each side
fill(45, 45, 58); noStroke();
rect(gxL - 10, gy - 55, 16, 60, 2); // left tower
rect(gxR - 6, gy - 55, 16, 60, 2); // right tower
// Tower cross braces
stroke(55, 55, 70); strokeWeight(2);
line(gxL - 4, gy - 50, gxL + 6, gy - 30);
line(gxL + 6, gy - 50, gxL - 4, gy - 30);
line(gxR, gy - 50, gxR + 10, gy - 30);
line(gxR + 10,gy - 50, gxR, gy - 30);
noStroke();
// Main horizontal beam — thick structural bar
fill(38, 38, 50); noStroke();
rect(gxL - 4, gy - 24, gw + 8, 18, 3);
// Beam highlight top edge
fill(65, 65, 82);
rect(gxL - 4, gy - 24, gw + 8, 4, 2);
// "FORMULA 1" branding panel in centre of beam
fill(220, 0, 0);
rect(width / 2 - 120, gy - 80, 240, 14, 2);
fill(255); textAlign(CENTER, CENTER); textSize(8);
text("FORMULA 1 WORLD CHAMPIONSHIP", width / 2, gy - 72.5);
// Five light pods — evenly spaced across beam
let podSpacing = gw / 6;
for (let i = 0; i < 5; i++) {
let lx = gxL + podSpacing * (i + 1);
let ly = gy - 6;
// Pod housing — rectangular black box
fill(22, 22, 30); noStroke();
rect(lx - 18, ly - 42, 36, 40, 5);
// Pod housing highlight
stroke(50, 50, 65); strokeWeight(1);
rect(lx - 18, ly - 42, 36, 40, 5);
noStroke();
// Light number label
fill(140); textAlign(CENTER, CENTER); textSize(7);
text(i + 1, lx, ly - 44);
// Light bulb
let lit = (i < lightsOn);
if (lit) {
// Outer glow
fill(255, 10, 10, 50);
ellipse(lx, ly - 22, 52, 52);
fill(255, 10, 10, 80);
ellipse(lx, ly - 22, 38, 38);
// Main red light
fill(255, 15, 15);

ellipse(lx, ly - 22, 26, 26);
// Bright specular centre
fill(255, 160, 160);
ellipse(lx - 4, ly - 26, 9, 9);
} else {
// Unlit — dark red
fill(55, 8, 8);
ellipse(lx, ly - 22, 26, 26);
fill(35, 4, 4);
ellipse(lx, ly - 22, 14, 14);
}
}
// Thin cable lines from tower tops to beam ends
stroke(60, 60, 75); strokeWeight(1);
line(gxL + 3, gy - 55, gxL + 3, gy - 24);
line(gxR + 8, gy - 55, gxR + 8, gy - 24);
noStroke();
}
// Drawing: Cockpit
function drawCockpit() {
let cw = width;
let ch = height;
// Red accent stripe — thin line only along the inner edge of each surround
stroke(200, 20, 20); strokeWeight(3); noFill();
line(cw * 0.18, ch * 0.52, cw * 0.16, ch);
line(cw * 0.82, ch * 0.52, cw * 0.84, ch);
noStroke();
// Left mirror — sits on inner edge of left surround
fill(18, 18, 26); noStroke();
beginShape();
vertex(cw * 0.155, ch * 0.50);
vertex(cw * 0.195, ch * 0.49);
vertex(cw * 0.200, ch * 0.55);
vertex(cw * 0.160, ch * 0.56);
endShape(CLOSE);
fill(35, 55, 75);
beginShape();
vertex(cw * 0.160, ch * 0.505);
vertex(cw * 0.192, ch * 0.496);
vertex(cw * 0.196, ch * 0.546);
vertex(cw * 0.164, ch * 0.555);
endShape(CLOSE);
fill(0, 160, 140, 180);
rect(cw * 0.166, ch * 0.518, 12, 7, 1);
// Right mirror — sits on inner edge of right surround
fill(18, 18, 26); noStroke();
beginShape();
vertex(cw * 0.845, ch * 0.50);
vertex(cw * 0.805, ch * 0.49);
vertex(cw * 0.800, ch * 0.55);
vertex(cw * 0.840, ch * 0.56);
endShape(CLOSE);
fill(35, 55, 75);
beginShape();
vertex(cw * 0.840, ch * 0.505);
vertex(cw * 0.808, ch * 0.496);

vertex(cw * 0.804, ch * 0.546);
vertex(cw * 0.836, ch * 0.555);
endShape(CLOSE);
fill(220, 30, 30, 180);
rect(cw * 0.808, ch * 0.518, 12, 7, 1);
// Dashboard panel — extended, fills lower half
fill(14, 14, 20); noStroke();
beginShape();
vertex(cw * 0.20, ch * 0.68);
vertex(cw * 0.80, ch * 0.68);
vertex(cw * 0.90, ch);
vertex(cw * 0.10, ch);
endShape(CLOSE);
// Carbon fibre texture on dashboard
stroke(20, 20, 28); strokeWeight(1);
for (let y = ch * 0.72; y < ch; y += 14) {
let frac = (y - ch * 0.68) / (ch * 0.32);
let xl = lerp(cw * 0.20, cw * 0.10, frac);
let xr = lerp(cw * 0.80, cw * 0.90, frac);
line(xl, y, xr, y);
}
noStroke();
// Dashboard top trim — red accent line
stroke(200, 20, 20); strokeWeight(4);
line(cw * 0.20, ch * 0.68, cw * 0.80, ch * 0.68);
noStroke();
// Instrument cluster — left side
// Tyre temperature indicator
fill(10, 10, 16); noStroke();
rect(cw * 0.22, ch * 0.72, 60, 40, 5);
fill(255, 120, 0); textAlign(CENTER, CENTER); textSize(16);
text("70 C", cw * 0.22 + 30, ch * 0.72 + 18);
fill(120); textSize(8);
text("TYRE TEMP", cw * 0.22 + 30, ch * 0.72 + 32);
// Tyre compound indicator (soft = red)
fill(200, 20, 20); noStroke();
ellipse(cw * 0.22 + 80, ch * 0.72 + 20, 28, 28);
fill(255); textAlign(CENTER, CENTER); textSize(11);
text("S", cw * 0.22 + 80, ch * 0.72 + 20);
// Instrument cluster — right side
// Lap counter
fill(10, 10, 16); noStroke();
rect(cw * 0.68, ch * 0.72, 60, 40, 5);
fill(200, 200, 255); textAlign(CENTER, CENTER); textSize(16);
text("LAP 1", cw * 0.68 + 30, ch * 0.72 + 18);
fill(120); textSize(8);
text("OF 57", cw * 0.68 + 30, ch * 0.72 + 32);
// DRS indicator
fill(0, 180, 80, gameState === "go" ? 255 : 60); noStroke();
rect(cw * 0.68 - 42, ch * 0.72 + 6, 32, 18, 3);
fill(255); textAlign(CENTER, CENTER); textSize(9);
text("DRS", cw * 0.68 - 26, ch * 0.72 + 15);
// Centre display — speed / gear / RPM

// Rev bar — wide strip across centre of dashboard
fill(10, 10, 16); noStroke();
rect(cw * 0.32, ch * 0.70, cw * 0.36, 22, 4);
// Rev lights — 7 LEDs
let revCols = [
color(0,200,0), color(0,200,0), color(0,200,0),
color(255,180,0), color(255,180,0),
color(255,0,0), color(255,0,0)
];
for (let i = 0; i < 7; i++) {
let rx = cw * 0.34 + i * (cw * 0.040);
fill(gameState === "go" ? revCols[i] : color(28, 28, 28));
noStroke();
ellipse(rx, ch * 0.711, 13, 13);
}
// Speed display
fill(220); textAlign(CENTER, CENTER); textSize(20);
text("0", cw * 0.38, ch * 0.760);
fill(140); textSize(9);
text("km/h", cw * 0.38, ch * 0.775);
// Gear indicator — large, centre
fill(0, 220, 100); textAlign(CENTER, CENTER); textSize(32);
text(gameState === "go" ? "1" : "N", cw * 0.50, ch * 0.760);
fill(120); textSize(9);
text("GEAR", cw * 0.50, ch * 0.778);
// RPM display
fill(220); textAlign(CENTER, CENTER); textSize(20);
text("0000", cw * 0.62, ch * 0.760);
fill(140); textSize(9);
text("rpm", cw * 0.62, ch * 0.775);
// Steering wheel — larger, more detailed
drawSteeringWheel(cw / 2, ch * 0.900);
// Hands on wheel
fill(38, 28, 22); noStroke();
ellipse(cw * 0.418, ch * 0.892, 30, 22);
ellipse(cw * 0.582, ch * 0.892, 30, 22);
}
function drawSteeringWheel(wx, wy) {
let wr = 78; // large — dominant foreground element
// Outer rim shadow/depth
stroke(20, 20, 28); strokeWeight(14);
noFill();
arc(wx, wy, wr * 2, wr * 1.65, PI * 0.72, PI * 1.28);
arc(wx, wy, wr * 2, wr * 1.65, PI * 1.72, PI * 0.28);
// Wheel rim — flat top and bottom (F1 style)
stroke(55, 55, 70); strokeWeight(11);
arc(wx, wy, wr * 2, wr * 1.65, PI * 0.72, PI * 1.28);
arc(wx, wy, wr * 2, wr * 1.65, PI * 1.72, PI * 0.28);
// Top flat
stroke(60, 60, 78);
line(wx - wr * 0.62, wy - wr * 0.62, wx + wr * 0.62, wy - wr * 0.62);
// Bottom flat

line(wx - wr * 0.62, wy + wr * 0.62, wx + wr * 0.62, wy + wr * 0.62);
noStroke();
// Spokes — four
stroke(30, 30, 42); strokeWeight(9);
line(wx, wy - 10, wx - wr * 0.58, wy - wr * 0.58);
line(wx, wy - 10, wx + wr * 0.58, wy - wr * 0.58);
line(wx, wy + 10, wx - wr * 0.58, wy + wr * 0.32);
line(wx, wy + 10, wx + wr * 0.58, wy + wr * 0.32);
noStroke();
// Centre hub — wide rectangular F1 style
fill(18, 18, 26); noStroke();
rect(wx - 42, wy - 26, 84, 52, 8);
// Hub top edge highlight
fill(35, 35, 50);
rect(wx - 42, wy - 26, 84, 5, 4);
// Team logo panel — Ferrari red
fill(215, 20, 20);
rect(wx - 18, wy - 18, 36, 22, 4);
// SF logo hint
fill(255, 220, 0); textAlign(CENTER, CENTER); textSize(10);
text("SF", wx, wy - 7);
// Left button cluster
fill(0, 180, 80); noStroke();
rect(wx - 40, wy - 10, 16, 11, 2); // green — overtake
fill(255); textSize(7); textAlign(CENTER, CENTER);
text("OT", wx - 32, wy - 4);
fill(0, 120, 220); noStroke();
rect(wx - 40, wy + 4, 16, 11, 2); // blue — DRS
fill(255); textSize(7);
text("DRS", wx - 32, wy + 10);
// Right button cluster
fill(255, 160, 0); noStroke();
rect(wx + 24, wy - 10, 16, 11, 2); // orange — engine mode
fill(255); textSize(7); textAlign(CENTER, CENTER);
text("ENG", wx + 32, wy - 4);
fill(180, 0, 180); noStroke();
rect(wx + 24, wy + 4, 16, 11, 2); // purple — magic button
fill(255); textSize(7);
text("MGU", wx + 32, wy + 10);
// Mini wheel display screen
fill(0, 0, 0); noStroke();
rect(wx - 14, wy + 16, 28, 8, 2);
fill(0, 220, 100); textAlign(CENTER, CENTER); textSize(7);
text(gameState === "go" ? "GO GO GO" : "READY", wx, wy + 20);
// Rim grip texture — small dots along rim sides
fill(40, 40, 55);
for (let i = 0; i < 5; i++) {
let a1 = lerp(PI * 0.75, PI * 1.25, (i + 0.5) / 5);
let a2 = lerp(PI * 1.75, PI * 2.25, (i + 0.5) / 5);
ellipse(wx + cos(a1) * wr, wy + sin(a1) * wr * 0.82, 5, 5);
ellipse(wx + cos(a2) * wr, wy + sin(a2) * wr * 0.82, 5, 5);

}
}
// Drawing: GO overlay
function drawGoOverlay() {
fill(0, 220, 80, 30);
noStroke();
rect(0, 0, width, height);
fill(0, 255, 100);
textAlign(CENTER, CENTER); textSize(48);
text("GO!", width / 2, height * 0.30);
fill(200); textSize(14);
text("Press SPACE", width / 2, height * 0.37);
}
// Drawing: Result overlay
function drawResultOverlay() {
fill(0, 0, 0, 160); noStroke();
rect(width * 0.25, height * 0.20, width * 0.50, height * 0.45, 12);
let rating = reactionMs < 200 ? "Exceptional!" :
reactionMs < 280 ? "Excellent" :
reactionMs < 350 ? "Good" :
reactionMs < 450 ? "Average" : "Slow";
let rCol = reactionMs < 200 ? color(255, 220, 0) :
reactionMs < 280 ? color(0, 220, 100) :
reactionMs < 350 ? color(100, 200, 255):
reactionMs < 450 ? color(255, 180, 50) : color(255, 80, 80);
fill(rCol);
textAlign(CENTER, CENTER); textSize(28);
text(reactionMs + " ms", width / 2, height * 0.31);
fill(255); textSize(14);
text(rating, width / 2, height * 0.39);
let lastAtt = preStimAtts.length > 0 ? preStimAtts[preStimAtts.length - 1] : 0;
let thisTrialNum = trialCount + 1;
let hadFS = falseStartTrials.includes(thisTrialNum);
fill(180); textSize(12);
if (hadFS) {
fill(255, 120, 80);
text("Includes +500ms false start penalty", width / 2, height * 0.44);
fill(180); textSize(12);
}
text("Pre-stimulus attention: " + (lastAtt * 100).toFixed(1) + "%", width / 2, height * 0.49);
text("Trial " + thisTrialNum + " of " + MAX_TRIALS, width / 2, height * 0.55);
fill(160); textSize(11);
text("Next trial loading...", width / 2, height * 0.61);
}
// Drawing: False start overlay
function drawFalseStartOverlay() {
fill(180, 0, 0, 180); noStroke();
rect(0, 0, width, height);
fill(255, 80, 80);
textAlign(CENTER, CENTER); textSize(42);
text("FALSE START", width / 2, height * 0.30);
fill(255); textSize(16);
text("You moved before the lights went out!", width / 2, height * 0.40);
text("+500ms penalty will be added to this trial.", width / 2, height * 0.47);

fill(180); textSize(12);
text("False starts this session: " + falseStarts, width / 2, height * 0.55);
}
// Drawing: Get ready overlay
function drawGetReady(att) {
// Scene already drawn by main draw loop — just draw the overlay panel
fill(0, 0, 0, 140); noStroke();
rect(width * 0.25, height * 0.22, width * 0.50, height * 0.35, 12);
let secs = ceil(getReadyTimer / 30);
fill(255, 220, 50);
textAlign(CENTER, CENTER); textSize(20);
text("Trial " + (trialCount + 1) + " of " + MAX_TRIALS, width / 2, height * 0.30);
fill(200); textSize(14);
text("Get ready...", width / 2, height * 0.38);
fill(255, 200, 50); textSize(22);
text(secs, width / 2, height * 0.47);
}
// Drawing: HUD
function drawHUD(att, med) {
fill(0, 0, 0, 160); noStroke();
rect(0, height - 52, width, 52);
// Trial counter
fill(255); textAlign(LEFT, CENTER); textSize(12);
text("Trial: " + (trialCount + 1) + "/" + MAX_TRIALS, 12, height - 36);
text("False starts: " + falseStarts, 12, height - 18);
// Best reaction time so far
if (reactionTimes.length > 0) {
let best = Math.min(...reactionTimes);
fill(255, 220, 50); textSize(12);
text("Best: " + best + "ms", 140, height - 27);
}
// EEG bars
let bx = width * 0.35;
drawBar(bx, height - 46, att, "Attention (alertness)", color(255, 200, 50));
drawBar(bx + 170, height - 46, med, "Meditation (info)", color(100, 180, 255));
}
function drawBar(x, y, val, label, col) {
let bw = 140, bh = 11;
fill(30); noStroke(); rect(x, y, bw, bh, 3);
fill(col); rect(x, y, bw * constrain(val, 0, 1), bh, 3);
noFill(); stroke(60); strokeWeight(0.5); rect(x, y, bw, bh, 3);
noStroke(); fill(255); textAlign(LEFT, TOP); textSize(10);
text(label + " " + val.toFixed(2), x, y + 13);
}
// Drawing: Intro screen
function drawIntro() {
// Draw cockpit as background
drawTrack();
drawLightsGantry();
drawCockpit();
fill(0, 0, 0, 175); noStroke();
rect(width * 0.08, height * 0.06, width * 0.84, height * 0.86, 14);

fill(255, 30, 30);
textAlign(CENTER, CENTER); textSize(28);
text("F1 Reaction Time", width / 2, height * 0.15);
fill(255); textSize(14);
text("10 trials. React to the lights going out.", width / 2, height * 0.24);
stroke(60, 20, 20); strokeWeight(1);
line(width * 0.18, height * 0.30, width * 0.82, height * 0.30);
noStroke();
fill(255, 80, 80); textSize(13);
text("LIGHT SEQUENCE", width / 2, height * 0.36);
fill(200); textSize(12);
text("Five red lights illuminate one by one above the start line.", width / 2, height * 0.42);
text("After the fifth light, there is a random delay.", width / 2, height * 0.47);
text("When ALL lights go out simultaneously — press SPACE as fast as you can.", width / 2, height * 0.52);
stroke(60, 20, 20); strokeWeight(1);
line(width * 0.18, height * 0.57, width * 0.82, height * 0.57);
noStroke();
fill(255, 200, 50); textSize(13);
text("FALSE STARTS", width / 2, height * 0.63);
fill(200); textSize(12);
text("Pressing SPACE before the lights go out is a false start.", width / 2, height * 0.69);
text("The trial restarts and a 500ms penalty is added to your reaction time.", width / 2, height * 0.74);
fill(255, 255, 255, 180); textSize(12);
if (introTimer > 0) {
text("Please read the instructions above (" + ceil(introTimer / 30) + "s)", width / 2, height * 0.87);
} else {
text("Press SPACE to begin", width / 2, height * 0.87);
}
}
// Drawing: Summary screen
function drawSummary() {
drawTrack();
drawLightsGantry();
drawCockpit();
fill(0, 0, 0, 185); noStroke();
rect(width * 0.05, height * 0.04, width * 0.90, height * 0.88, 14);
fill(255, 30, 30);
textAlign(CENTER, CENTER); textSize(26);
text("Session Complete", width / 2, height * 0.11);
if (reactionTimes.length === 0) {
fill(200); textSize(14);
text("No completed trials.", width / 2, height / 2);
return;
}
let best = Math.min(...reactionTimes);
let avg = round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length);
let worst = Math.max(...reactionTimes);
let bestAtt = preStimAtts.length > 0 ? Math.max(...preStimAtts) : 0;

// Stat boxes
let sy = height * 0.18;
drawStatBox(width * 0.18, sy, "Best", best + "ms", color(255, 220, 0));
drawStatBox(width * 0.38, sy, "Average", avg + "ms", color(100, 200, 255));
drawStatBox(width * 0.58, sy, "Worst", worst + "ms", color(255, 100, 80));
drawStatBox(width * 0.78, sy, "False\nStarts", falseStarts + "", color(255, 80, 80));
// Reaction time bar chart
fill(160); textSize(11); textAlign(CENTER, CENTER);
text("Reaction Times per Trial", width / 2, height * 0.38);
let chartX = width * 0.10;
let chartY = height * 0.42;
let chartW = width * 0.80;
let chartH = height * 0.20;
let maxRT = max(600, worst + 50);
fill(20, 20, 30); noStroke();
rect(chartX, chartY, chartW, chartH, 4);
// Grid lines at 200, 300, 400, 500ms
stroke(50, 50, 70); strokeWeight(1);
for (let ms of [200, 300, 400, 500]) {
let gy = chartY + chartH - (ms / maxRT) * chartH;
line(chartX, gy, chartX + chartW, gy);
noStroke(); fill(100); textAlign(RIGHT, CENTER); textSize(9);
text(ms + "ms", chartX - 4, gy);
stroke(50, 50, 70);
}
noStroke();
// Bars per trial
let barW = (chartW - 20) / reactionTimes.length;
for (let i = 0; i < reactionTimes.length; i++) {
let rt = reactionTimes[i];
let bh = (rt / maxRT) * chartH;
let bx = chartX + 10 + i * barW;
let by = chartY + chartH - bh;
let trialNum = i + 1;
// Check if this trial had a false start
let hadFS = falseStartTrials.includes(trialNum);
let bc = hadFS ? color(180, 40, 40) :
rt < 250 ? color(255, 220, 0) :
rt < 350 ? color(0, 220, 100) :
rt < 450 ? color(255, 180, 50) : color(255, 80, 80);
fill(bc); noStroke();
rect(bx, by, barW - 4, bh, 2);
fill(200); textAlign(CENTER, TOP); textSize(9);
text(rt + "ms", bx + barW / 2, by - 14);
// False start flag above bar
if (hadFS) {
fill(255, 80, 80); textSize(9);
text("FS+500", bx + barW / 2, by - 24);
}
fill(160); textSize(8); textAlign(CENTER, TOP);
text(trialNum, bx + barW / 2, chartY + chartH + 4);
}
// Pre-stimulus attention dots overlaid
fill(100, 200, 255, 200);
for (let i = 0; i < preStimAtts.length; i++) {

let ax = chartX + 10 + i * barW + barW / 2;
let ay = chartY + chartH - (preStimAtts[i] / 1.0) * chartH;
ellipse(ax, ay, 7, 7);
}
fill(100, 200, 255); textAlign(LEFT, CENTER); textSize(10);
text("● Pre-stimulus attention", chartX, chartY + chartH + 18);
// Performance message
let perfMsg = best < 200 ? "World class reaction time. Elite F1 driver territory." :
best < 280 ? "Excellent reactions. Strong attentional control before the start." :
best < 350 ? "Good reactions. Consistent focus will improve your times." :
"Keep training — pre-stimulus attention is key to faster reactions.";

fill(160, 255, 160); textSize(12); textAlign(CENTER, CENTER);
text(perfMsg, width / 2, height * 0.72);
// False start note
if (falseStarts > 0) {
fill(255, 120, 80); textSize(11);
text(falseStarts + " false start" + (falseStarts > 1 ? "s" : "") +
" — anticipation reduces genuine reaction measurement.", width / 2, height * 0.77);
}
fill(255, 255, 255, 160); textSize(12);
text("Press SPACE to race again", width / 2, height * 0.85);
}
function drawStatBox(x, y, label, val, col) {
fill(20, 20, 35); noStroke();
rect(x - 44, y, 88, 52, 8);
fill(col); textAlign(CENTER, CENTER); textSize(18);
text(val, x, y + 22);
fill(160); textSize(10);
text(label, x, y + 40);
}   