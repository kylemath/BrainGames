/**
 * @id deepDiver
 * @title Deep Sea Diver
 * @category Calm
 * @order 23
 * @newGame false
 *
 * EEG mappings:
 *   meditation -> oxygen management
 *
 * Copy of /games/deepDiver.js (the original remains the authoritative
 * reference and MUST NOT be modified). Only this metadata header was
 * prepended; all original code below is preserved byte-for-byte.
 */
// EEG Deep Sea Diver
// EEG Mappings:
// meditation --> oxygen management (calm breathing = slower O2 depletion)
// attention --> movement precision (focus = smooth navigation toward specimens)
//
// Game: Dive through 3 depth zones, collect specimens, manage oxygen
// Oxygen depletes continuously — faster with low meditation
// Collecting specimens restores small oxygen boost
// Session ends when oxygen runs out
// State
// "intro" --> instruction screen
// "diving" --> active session
// "surfacing"--> diver swimming back up (end animation)
// "summary" --> session complete
let gameState = "intro";
// Diver
let diverX, diverY;
let diverVX = 0, diverVY = 0;
const DIVER_SPEED = 2.8;
// Oxygen
let oxygen = 1.0; // 0-1
const O2_BASE_DRAIN = 0.00022; // per frame at zero meditation (~150s dive)
const O2_MIN_DRAIN = 0.00006; // per frame at max meditation (~560s dive)
// Depth
let depth = 0; // metres, increases as diver moves down
let maxDepth = 0;
const ZONE_DEPTHS = [0, 15, 35, 60, 85, 120]; // zone boundaries in metres
// Zone 0: shallow (0-15m), Zone 1: mid (15-35m), Zone 2: deep (35-60m)
// Zone 3: abyss (60-85m), Zone 4: hadal (85m+)
// Camera / scroll
let camY = 0; // world Y offset — increases as diver descends
// Specimens
let specimens = [];
let collected = []; // { zone, pts, x, y }
let totalScore = 0;
// Obstacles
let obstacles = [];
// Bubbles
let bubbles = [];
// Particles (collection effect)
let particles = [];
// Surfacing
let surfaceTimer = 0;
const SURFACE_DUR = 90;
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
// Stats for summary
let avgAttLog = [], avgMedLog = [];
// Key input
function keyPressed() {
if (keyCode === 32 && gameState === "intro" && introTimer <= 0) {
startDive();
gameState = "diving";
}
if (keyCode === 32 && gameState === "summary" && summaryReady) {
resetSession();
}
}
// Setup
function setup() {
colorMode(RGB);
diverX = width / 2;
diverY = height * 0.25;
}
function resetSession() {
oxygen = 1.0;
depth = 0;
maxDepth = 0;
camY = 0;
diverVX = 0;
diverVY = 0;
specimens = [];
collected = [];
obstacles = [];
bubbles = [];
particles = [];
totalScore = 0;
avgAttLog = [];
avgMedLog = [];
summaryReady = false;
introTimer = 300;
gameState = "intro";
}
function startDive() {
diverX = width / 2;
diverY = height * 0.15; // start near top of screen (just below surface)
diverVX = 0; diverVY = 0.5; // initial gentle downward push
oxygen = 1.0;
depth = 0; maxDepth = 0; camY = 0;
specimens = [];
obstacles = [];
bubbles = [];
particles = [];
collected = [];

totalScore = 0;
avgAttLog = [];
avgMedLog = [];
generateWorld();
}
// World generation
function generateWorld() {
// Specimens spread across depth zones
let specimenDefs = [
// Zone 0: shallow — common, low value
{ minD: 2, maxD: 14, pts: 5, col: [100, 220, 255], name: "Sea Urchin", r: 10 },
{ minD: 4, maxD: 14, pts: 8, col: [255, 200, 80], name: "Starfish", r: 11 },
{ minD: 6, maxD: 14, pts: 10, col: [180, 255, 120], name: "Sea Cucumber", r: 9 },
// Zone 1: mid — moderate value
{ minD: 16, maxD: 34, pts: 15, col: [255, 120, 200], name: "Jellyfish", r: 13 },
{ minD: 18, maxD: 34, pts: 18, col: [120, 180, 255], name: "Nautilus", r: 12 },
{ minD: 20, maxD: 34, pts: 20, col: [80, 255, 200], name: "Sea Dragon", r: 11 },
// Zone 2: deep — rare, high value
{ minD: 36, maxD: 58, pts: 30, col: [200, 100, 255], name: "Anglerfish", r: 14 },
{ minD: 38, maxD: 58, pts: 35, col: [255, 80, 120], name: "Giant Squid", r: 16 },
{ minD: 40, maxD: 58, pts: 40, col: [255, 220, 100], name: "Treasure Chest", r: 14 },
// Zone 3: abyss — very rare, very high value
{ minD: 62, maxD: 83, pts: 55, col: [180, 60, 255], name: "Vampire Squid", r: 15 },
{ minD: 64, maxD: 83, pts: 60, col: [255, 40, 80], name: "Black Smoker", r: 13 },
{ minD: 66, maxD: 83, pts: 65, col: [60, 255, 220], name: "Hydrothermal Vent", r: 14 },
// Zone 4: hadal — extremely rare, maximum value
{ minD: 87, maxD: 115, pts: 80, col: [255, 180, 0], name: "Ghost Shark", r: 16 },
{ minD: 90, maxD: 115, pts: 90, col: [200, 255, 80], name: "Biolume Coral", r: 14 },
{ minD: 92, maxD: 115, pts: 100, col: [255, 255, 255],name: "Ancient Relic", r: 15 },
];
for (let def of specimenDefs) {
let count = floor(random(2, 5));
for (let i = 0; i < count; i++) {
let d = random(def.minD, def.maxD);
let wx = random(width * 0.12, width * 0.88);
let wy = depthToY(d);
specimens.push({
x: wx, y: wy, pts: def.pts,
col: def.col, name: def.name, r: def.r,
zone: d < 15 ? 0 : d < 35 ? 1 : d < 60 ? 2 : d < 85 ? 3 : 4,
glow: random(0, TWO_PI),
collected: false
});
}
}
// Obstacles — rocks and hazard jellyfish
for (let i = 0; i < 26; i++) {
let d = random(3, 115);
obstacles.push({
x: random(width * 0.08, width * 0.92),
y: depthToY(d),
r: random(14, 28),
type: random() > 0.5 ? "rock" : "hazard",
ang: random(TWO_PI)
});
}
}

function depthToY(d) {
return d * 14; // 14px per metre
}
function currentZone() {
if (depth < 15) return 0;
if (depth < 35) return 1;
if (depth < 60) return 2;
if (depth < 85) return 3;
return 4;
}
// Main draw
function draw() {
if (!eegData.connected) {
background(0, 20, 60);
fill(255); textAlign(CENTER, CENTER); textSize(20);
text("Connect or simulate EEG to play", width / 2, height / 2);
return;
}
let att = smoothed(eegData.attention !== undefined ? eegData.attention : 0.5, attHist, 6);
let med = smoothed(eegData.meditation !== undefined ? eegData.meditation : 0.5, medHist, 8);
if (gameState === "intro") {
drawOceanBg(0);
drawIntro();
if (introTimer > 0) introTimer--;
return;
}
if (gameState === "summary") {
drawSummary();
return;
}
if (gameState === "surfacing") {
// Animate diver rising back to surface
diverY -= 3.5;
camY = max(0, camY - 3.5);
depth = max(0, depth - 3.5 / 14);
drawOceanBg(camY);
drawWorldElements();
drawDiver(false);
drawBubbles();
drawHUD(att, med);
surfaceTimer--;
if (surfaceTimer <= 0 || diverY < height * 0.15) {
summaryReady = false;
gameState = "summary";
}
return;
}
// Active diving
avgAttLog.push(att);
avgMedLog.push(med);
// Oxygen depletion — slower with higher meditation, faster at depth
let o2Drain = map(med, 0.15, 0.65, O2_BASE_DRAIN, O2_MIN_DRAIN);
o2Drain = constrain(o2Drain, O2_MIN_DRAIN, O2_BASE_DRAIN);

// Depth multiplier — drain increases progressively past 35m
let depthMult = 1.0 + constrain(map(depth, 35, 120, 0, 2.0), 0, 2.0);
oxygen = max(0, oxygen - o2Drain * depthMult);
// Diver movement — attention controls responsiveness
let precision = constrain(map(att, 0.28, 0.65, 0.3, 1.0), 0.3, 1.0);
// Auto-drift toward nearest uncollected specimen
// Convert specimen world Y to screen Y for comparison with diverY
let target = nearestSpecimen();
if (target) {
let dx = target.x - diverX;
let dy = (target.y - camY) - diverY; // screen-space dy
let d = sqrt(dx * dx + dy * dy);
if (d > 5) {
diverVX += (dx / d) * DIVER_SPEED * precision * 0.08;
diverVY += (dy / d) * DIVER_SPEED * precision * 0.08;
}
}
// Always apply a gentle downward bias so diver descends even without target
diverVY += 0.06 * precision;
// Damping
diverVX *= 0.88;
diverVY *= 0.88;
// Apply velocity
diverX += diverVX;
diverY += diverVY;
// Keep diver on screen horizontally
diverX = constrain(diverX, width * 0.08, width * 0.92);
// Camera follows diver downward
let worldDiverY = diverY + camY;
if (diverY > height * 0.60) {
let shift = diverY - height * 0.60;
camY += shift;
diverY -= shift;
depth = camY / 14;
maxDepth = max(maxDepth, depth);
}
if (diverY < height * 0.20) {
let shift = height * 0.20 - diverY;
camY -= shift;
diverY += shift;
depth = max(0, camY / 14);
}
// Spawn bubbles
if (frameCount % 8 === 0) {
bubbles.push({
x: diverX + random(-8, 8),
y: diverY - 20,
vy: random(-1.2, -0.5),
r: random(2, 5),
life: 1.0
});
}
// Update bubbles

for (let b of bubbles) {
b.x += random(-0.4, 0.4);
b.y += b.vy;
b.life -= 0.02;
}
bubbles = bubbles.filter(b => b.life > 0 && b.y > 0);
// Update particles
for (let p of particles) {
p.x += p.vx;
p.y += p.vy;
p.life -= 0.04;
}
particles = particles.filter(p => p.life > 0);
// Check specimen collection
for (let s of specimens) {
if (s.collected) continue;
let dx = s.x - diverX;
let dy = (s.y - camY) - diverY;
if (sqrt(dx * dx + dy * dy) < s.r + 16) {
s.collected = true;
totalScore += s.pts;
// O2 boost on collection
oxygen = min(1.0, oxygen + 0.04);
collected.push({ zone: s.zone, pts: s.pts, name: s.name });
// Spawn collection particles
for (let i = 0; i < 10; i++) {
let ang = random(TWO_PI);
particles.push({
x: diverX, y: diverY,
vx: cos(ang) * random(1, 3),
vy: sin(ang) * random(1, 3),
col: s.col, life: 1.0, r: random(2, 5)
});
}
}
}
// Check obstacle collision — slows diver and drains O2
for (let o of obstacles) {
let dx = o.x - diverX;
let dy = (o.y - camY) - diverY;
if (sqrt(dx * dx + dy * dy) < o.r + 14) {
diverVX *= -0.5;
diverVY *= -0.5;
if (o.type === "hazard") {
oxygen = max(0, oxygen - 0.04);
}
}
}
// Surface only when oxygen runs out
if (oxygen <= 0) {
surfaceTimer = SURFACE_DUR;
gameState = "surfacing";
return;
}
// Draw everything
drawOceanBg(camY);

drawWorldElements();
drawParticles();
drawBubbles();
drawDiver(true);
drawHUD(att, med);
}
// Nearest specimen
function nearestSpecimen() {
let best = null, bestD = 9999;
for (let s of specimens) {
if (s.collected) continue;
let dx = s.x - diverX;
let dy = (s.y - camY) - diverY;
let d = sqrt(dx * dx + dy * dy);
if (d < bestD) { bestD = d; best = s; }
}
return best;
}
// Drawing: Ocean background
function drawOceanBg(cam) {
// Depth-based colour — lighter near surface, near-black at depth
let depthFrac = constrain(cam / (120 * 14), 0, 1);
let topCol = lerpColor(color(0, 80, 160), color(0, 5, 20), depthFrac);
let botCol = lerpColor(color(0, 50, 120), color(0, 2, 10), depthFrac);
for (let i = 0; i < height; i++) {
let t = i / height;
stroke(lerpColor(topCol, botCol, t));
line(0, i, width, i);
}
noStroke();
// Bioluminescent plankton dots — more at depth
let plankCount = floor(map(depthFrac, 0, 1, 4, 22));
for (let i = 0; i < plankCount; i++) {
let px = (noise(i * 40 + cam * 0.003, frameCount * 0.01) * width);
let py = (noise(i * 40 + 100, frameCount * 0.01 + 0.5) * height);
let br = map(depthFrac, 0, 1, 40, 120);
fill(100, 220, 255, br); noStroke();
ellipse(px, py, 3, 3);
}
// Depth zone divider lines — all 5 zones
let zoneDividers = [
{ d: 15, label: "15m Mid-depth", col: [100, 180, 255] },
{ d: 35, label: "35m Deep", col: [80, 140, 220] },
{ d: 60, label: "60m Abyss", col: [120, 60, 220] },
{ d: 85, label: "85m Hadal", col: [180, 40, 180] },
];
for (let z of zoneDividers) {
let lineY = depthToY(z.d) - cam;
if (lineY > 0 && lineY < height) {
stroke(z.col[0], z.col[1], z.col[2], 35); strokeWeight(1);
line(0, lineY, width, lineY);
noStroke();
fill(z.col[0], z.col[1], z.col[2], 60); textAlign(RIGHT, CENTER); textSize(9);
text(z.label, width * 0.96, lineY - 6);
}
}

// Surface shimmer at top
if (cam < 30) {
fill(150, 220, 255, map(cam, 0, 30, 80, 0));
rect(0, 0, width, 20);
// Surface ripple lines
stroke(200, 240, 255, map(cam, 0, 30, 60, 0));
strokeWeight(1);
for (let rx = 0; rx < width; rx += 30) {
line(rx, 6, rx + 20, 6);
}
noStroke();
}
// Sandy bottom at max depth — 120m
let bottomY = depthToY(122) - cam;
if (bottomY < height) {
fill(60, 45, 35); noStroke();
rect(0, bottomY, width, height - bottomY);
fill(75, 58, 45);
rect(0, bottomY, width, 8);
// Coral stumps on bottom
for (let cx = 30; cx < width; cx += 55) {
fill(180, 60, 100);
rect(cx, bottomY - 18, 8, 18, 2);
rect(cx + 20, bottomY - 12, 6, 12, 2);
}
}
}
// Drawing: World elements
function drawWorldElements() {
let zone = currentZone();
// Draw obstacles
for (let o of obstacles) {
let oy = o.y - camY;
if (oy < -40 || oy > height + 40) continue;
if (o.type === "rock") {
fill(80, 70, 65); noStroke();
push(); translate(o.x, oy); rotate(o.ang);
ellipse(0, 0, o.r * 2.2, o.r * 1.6);
fill(65, 55, 52);
ellipse(o.r * 0.3, -o.r * 0.2, o.r * 0.8, o.r * 0.6);
pop();
} else {
// Hazard jellyfish
let pulse = sin(frameCount * 0.06 + o.ang) * 3;
fill(255, 100, 180, 120); noStroke();
ellipse(o.x, oy, o.r * 2 + pulse, o.r * 1.4 + pulse);
fill(255, 140, 200, 80);
ellipse(o.x, oy, o.r * 1.2, o.r * 0.8);
// Tentacles
stroke(255, 100, 180, 100); strokeWeight(1);
for (let t = 0; t < 5; t++) {
let tx = o.x + cos(t * 1.2 + o.ang) * o.r * 0.6;
line(tx, oy + o.r * 0.7, tx + sin(frameCount * 0.08 + t) * 6, oy + o.r * 1.8);
}
noStroke();
// Danger label
fill(255, 100, 100, 160); textAlign(CENTER, CENTER); textSize(8);

text("!", o.x, oy - o.r - 4);
}
}
// Draw specimens
for (let s of specimens) {
if (s.collected) continue;
let sy = s.y - camY;
if (sy < -30 || sy > height + 30) continue;
let glow = sin(frameCount * 0.05 + s.glow) * 0.3 + 0.7;
let c = s.col;
// Glow halo
fill(c[0], c[1], c[2], 30 * glow); noStroke();
ellipse(s.x, sy, s.r * 3.5, s.r * 3.5);
fill(c[0], c[1], c[2], 60 * glow);
ellipse(s.x, sy, s.r * 2.2, s.r * 2.2);
// Specimen body
fill(c[0], c[1], c[2]); noStroke();
ellipse(s.x, sy, s.r * 2, s.r * 2);
// Specular highlight
fill(255, 255, 255, 120 * glow);
ellipse(s.x - s.r * 0.3, sy - s.r * 0.3, s.r * 0.6, s.r * 0.6);
// Points label
fill(255, 220, 100); textAlign(CENTER, CENTER); textSize(8);
text("+" + s.pts, s.x, sy - s.r - 5);
}
}
// Drawing: Particles
function drawParticles() {
for (let p of particles) {
fill(p.col[0], p.col[1], p.col[2], p.life * 220);
noStroke();
ellipse(p.x, p.y, p.r * 2, p.r * 2);
}
}
// Drawing: Bubbles
function drawBubbles() {
for (let b of bubbles) {
fill(200, 235, 255, b.life * 100); noStroke();
ellipse(b.x, b.y, b.r * 2, b.r * 2);
stroke(220, 245, 255, b.life * 60); strokeWeight(0.5); noFill();
ellipse(b.x, b.y, b.r * 2, b.r * 2);
noStroke();
}
}
// Drawing: Diver
function drawDiver(swimming) {
let flipperWag = swimming ? sin(frameCount * 0.18) * 12 : 0;
push();
translate(diverX, diverY);
// Oxygen tank
fill(140, 160, 180); noStroke();
rect(-4, -8, 8, 18, 3);

fill(100, 120, 140);
rect(-4, -8, 8, 5, 2);
// Tank valve
fill(80, 100, 120);
rect(-2, 10, 4, 4, 1);
// Wetsuit body
fill(30, 50, 80); noStroke();
rect(-7, -18, 14, 22, 4);
// Wetsuit stripes
fill(50, 180, 220, 160);
rect(-7, -12, 14, 4, 2);
rect(-7, -4, 14, 4, 2);
// Arms — spread out slightly
fill(30, 50, 80); noStroke();
rect(-18, -16, 11, 5, 2); // left arm
rect(7, -16, 11, 5, 2); // right arm
// Gloves
fill(20, 160, 180);
ellipse(-13, -14, 8, 7);
ellipse(13, -14, 8, 7);
// Head / mask
fill(240, 200, 155); noStroke();
ellipse(0, -26, 14, 14);
// Mask glass
fill(20, 180, 220, 180);
rect(-6, -30, 12, 9, 3);
// Mask frame
stroke(40, 40, 60); strokeWeight(1.5); noFill();
rect(-6, -30, 12, 9, 3);
noStroke();
// Regulator hose
stroke(60, 60, 80); strokeWeight(2);
line(4, -24, 4, -8);
noStroke();
// Flippers
fill(20, 160, 100); noStroke();
// Left flipper
beginShape();
vertex(-7, 4);
vertex(-7, 8);
vertex(-22, 10 + flipperWag);
vertex(-20, 6 + flipperWag);
endShape(CLOSE);
// Right flipper
beginShape();
vertex(7, 4);
vertex(7, 8);
vertex(22, 10 - flipperWag);
vertex(20, 6 - flipperWag);
endShape(CLOSE);
pop();
}
// Drawing: HUD
function drawHUD(att, med) {

fill(0, 0, 0, 160); noStroke();
rect(0, height - 72, width, 72);
// Oxygen bar — prominent, left side
let ox = 12;
let oy = height - 62;
let ow = 160;
let oh = 18;
// Background
fill(30); noStroke(); rect(ox, oy, ow, oh, 4);
// O2 fill — colour shifts red as depleted
let o2Col = lerpColor(color(255, 60, 60), color(0, 200, 100), oxygen);
fill(o2Col); rect(ox, oy, ow * oxygen, oh, 4);
// Border
noFill(); stroke(80); strokeWeight(0.5); rect(ox, oy, ow, oh, 4);
noStroke();
// Label
fill(255); textAlign(LEFT, CENTER); textSize(11);
text("O2 " + floor(oxygen * 100) + "%", ox + 5, oy + oh / 2);
// Depth meter
fill(100, 200, 255); textSize(13); textAlign(LEFT, CENTER);
text(floor(depth) + "m", ox, height - 36);
// Zone label
let zNames = ["Shallow", "Mid-depth", "Deep", "Abyss", "Hadal"];
let zCols = [color(100,200,255), color(80,160,220), color(60,100,200), color(120,60,220), color(180,40,180)];
fill(zCols[currentZone()]);
text(zNames[currentZone()], ox + 44, height - 36);
// Score
fill(255, 220, 50); textAlign(LEFT, CENTER); textSize(13);
text("Score: " + totalScore, ox, height - 18);
// Collected count
fill(180); textSize(11);
text("Collected: " + collected.length, ox + 90, height - 18);
// EEG bars
let bx = width * 0.34;
drawBar(bx, height - 64, med, "Meditation (oxygen)", color(100, 200, 255));
drawBar(bx + 170, height - 64, att, "Attention (precision)", color(255, 200, 50));
// Last collected specimen name
if (collected.length > 0) {
let last = collected[collected.length - 1];
fill(last.pts >= 30 ? color(255,220,100) : color(180,255,180));
textAlign(RIGHT, CENTER); textSize(11);
text("+" + last.pts + " " + last.name, width - 12, height - 18);
}
// Depth zone indicator strip on right edge
let stripX = width - 16;
let stripH = height - 80;
fill(20); noStroke();
rect(stripX, 8, 8, stripH, 4);
// Marker for current depth
let depthFrac = constrain(depth / 120, 0, 1);
fill(lerpColor(color(100,200,255), color(180,40,180), depthFrac));
ellipse(stripX + 4, 8 + depthFrac * stripH, 10, 10);

for (let z of [15, 35, 60, 85]) {
let zy = 8 + (z / 120) * stripH;
stroke(100, 180, 255, 60); strokeWeight(1);
line(stripX - 2, zy, stripX + 10, zy);
noStroke();
}
}
function drawBar(x, y, val, label, col) {
let bw = 140, bh = 11;
fill(40); noStroke(); rect(x, y, bw, bh, 3);
fill(col); rect(x, y, bw * constrain(val, 0, 1), bh, 3);
noFill(); stroke(60); strokeWeight(0.5); rect(x, y, bw, bh, 3);
noStroke(); fill(255); textAlign(LEFT, TOP); textSize(9);
text(label + " " + val.toFixed(2), x, y + 13);
}
// Drawing: Intro
function drawIntro() {
fill(0, 0, 0, 170); noStroke();
rect(width * 0.08, height * 0.05, width * 0.84, height * 0.90, 14);
fill(100, 200, 255); textAlign(CENTER, CENTER); textSize(28);
text("EEG Deep Sea Diver", width / 2, height * 0.13);
fill(255); textSize(12);
text("Dive through three depth zones. Collect specimens. Manage your oxygen.", width / 2, height * 0.21);
stroke(0, 80, 160); strokeWeight(1);
line(width * 0.18, height * 0.26, width * 0.82, height * 0.26);
noStroke();
fill(100, 200, 255); textSize(13);
text("OXYGEN MANAGEMENT (Meditation)", width / 2, height * 0.32);
fill(200); textSize(12);
text("Your oxygen supply depletes continuously throughout the dive.", width / 2, height * 0.38);
text("A calm state slows the depletion rate, giving you more time.", width / 2, height * 0.43);
text("Low meditation drains oxygen faster, forcing an early surface.", width / 2, height * 0.48);
stroke(0, 80, 160); strokeWeight(1);
line(width * 0.18, height * 0.53, width * 0.82, height * 0.53);
noStroke();
fill(255, 220, 50); textSize(13);
text("MOVEMENT PRECISION (Attention)", width / 2, height * 0.59);
fill(200); textSize(12);
text("Your attention score controls how precisely the diver navigates.", width / 2, height * 0.65);
text("High focus = smooth movement toward specimens = more collected.", width / 2, height * 0.70);
text("Low attention = sluggish drifting = fewer specimens reached.", width / 2, height * 0.75);
fill(255); textSize(11);
text("Shallow (0-15m) | Mid (15-35m) | Deep (35-60m) | Abyss (60-85m) | Hadal (85m+)", width / 2, height * 0.81);
text("Deeper specimens are worth more. Oxygen drains faster at depth.", width / 2, height * 0.85);
fill(255, 255, 255, 180); textSize(12);
if (introTimer > 0) {
text("Please read above (" + ceil(introTimer / 30) + "s)", width / 2, height * 0.92);
} else {
text("Press SPACE to dive", width / 2, height * 0.92);
}
}

// Drawing: Summary
function drawSummary() {
if (!summaryReady) summaryReady = true;
drawOceanBg(0);
fill(0, 0, 0, 185); noStroke();
rect(width * 0.04, height * 0.03, width * 0.92, height * 0.92, 14);
fill(100, 200, 255); textAlign(CENTER, CENTER); textSize(26);
text("Dive Complete", width / 2, height * 0.10);
// Stats
let avgAtt = avgAttLog.length > 0
? avgAttLog.reduce((a, b) => a + b, 0) / avgAttLog.length : 0;
let avgMed = avgMedLog.length > 0
? avgMedLog.reduce((a, b) => a + b, 0) / avgMedLog.length : 0;
let sy = height * 0.17;
drawStatBox(width * 0.14, sy, "Score", totalScore + "", color(255, 220, 50));
drawStatBox(width * 0.32, sy, "Collected", collected.length + " items", color(100, 220, 180));
drawStatBox(width * 0.50, sy, "Max Depth", floor(maxDepth) + "m", color(100, 180, 255));
drawStatBox(width * 0.68, sy, "Avg O2", round(avgMed * 100) + "%", color(100, 200, 255));
drawStatBox(width * 0.86, sy, "Avg Focus", round(avgAtt * 100) + "%", color(255, 200, 50));
// Specimens by zone
fill(180); textSize(12); textAlign(CENTER, CENTER);
text("Specimens Collected by Zone", width / 2, height * 0.38);
let zoneNames = ["Shallow (0-15m)", "Mid-depth (15-35m)", "Deep (35-60m)", "Abyss (60-85m)", "Hadal (85m+)"];
let zoneCols = [[100,200,255],[80,160,220],[60,100,200],[120,60,220],[180,40,180]];
let zoneCounts = [0, 0, 0, 0, 0];
let zonePts = [0, 0, 0, 0, 0];
for (let c of collected) {
zoneCounts[c.zone]++;
zonePts[c.zone] += c.pts;
}
for (let z = 0; z < 5; z++) {
let by = height * 0.43 + z * 28;
let zc = zoneCols[z];
fill(zc[0], zc[1], zc[2]); textAlign(LEFT, CENTER); textSize(11);
text(zoneNames[z], width * 0.08, by);
// Bar
let maxPts = max(1, Math.max(...zonePts));
let bw = (zonePts[z] / maxPts) * (width * 0.55);
fill(20); noStroke(); rect(width * 0.35, by - 8, width * 0.57, 16, 3);
fill(zc[0], zc[1], zc[2]);
if (bw > 0) rect(width * 0.35, by - 8, bw, 16, 3);
fill(255); textAlign(LEFT, CENTER); textSize(10);
text(zoneCounts[z] + " items | " + zonePts[z] + " pts", width * 0.35 + bw + 6, by);
}
// Collected specimen list
fill(180); textSize(11); textAlign(CENTER, CENTER);
text("Items Collected", width / 2, height * 0.60);
let listX = width * 0.08;
let listY = height * 0.64;
let cols = 3;

let shown = min(collected.length, 12);
for (let i = 0; i < shown; i++) {
let c = collected[i];
let cx = listX + (i % cols) * (width * 0.30);
let cy = listY + floor(i / cols) * 16;
fill(c.pts >= 30 ? color(255,220,100) : c.pts >= 15 ? color(100,220,180) : color(180));
textAlign(LEFT, CENTER); textSize(10);
text("+" + c.pts + " " + c.name, cx, cy);
}
if (collected.length > 12) {
fill(140); textSize(10); textAlign(LEFT, CENTER);
text("...and " + (collected.length - 12) + " more", listX, listY + floor(12 / cols) * 16);
}
// Performance message
let perf = totalScore >= 200 ? "Exceptional dive. Masterful oxygen control and precision throughout." :
totalScore >= 120 ? "Strong dive. Good calm and consistent focus on specimen collection." :
totalScore >= 60 ? "Solid effort. Sustaining calm will give you more time at depth." :
"Keep diving — a calm state is the key to reaching the deep zone.";

fill(160, 255, 160); textSize(11); textAlign(CENTER, CENTER);
text(perf, width / 2, height * 0.88);
fill(255, 220, 50, 200); textSize(12);
text("Press SPACE to dive again", width / 2, height * 0.93);
}
function drawStatBox(x, y, label, val, col) {
fill(0, 15, 45); noStroke();
rect(x - 44, y, 88, 52, 8);
fill(col); textAlign(CENTER, CENTER); textSize(14);
text(val, x, y + 20);
fill(160); textSize(9);
text(label, x, y + 38);
}