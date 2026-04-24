/**
 * @id mazeFocus
 * @title Maze Focus (Navigator)
 * @category Focus
 * @order 25
 * @newGame false
 *
 * EEG mappings:
 *   attention -> movement speed
 *
 * Copy of /games/mazeFocus.js (the original remains the authoritative
 * reference and MUST NOT be modified). Only this metadata header was
 * prepended; all original code below is preserved byte-for-byte.
 */
/**
 * @id mazeFocus
 * @title Maze Focus (Navigator)
 * @category Attention & Meditation
 * @order 11
 */
// EEG Maze Navigator
// EEG Mappings:
// attention --> movement speed (high focus = faster movement)
// meditation --> displayed for info only
//
// Game structure:
// 3 runs per session, each on a different maze (increasing complexity)
// Arrow keys for direction, attention controls speed
// Live heatmap overlay — red where attention was low, green where high
// Post-run summary with time and avg attention
// Final summary stays until player presses Space
// State
// "intro" → instruction screen
// "playing" → maze active
// "complete"→ run complete overlay
// "summary" → all 3 runs done — stays until Space pressed
let gameState = "intro";
// Maze definitions
// 0 = wall, 1 = path, 2 = start, 3 = exit
// Maze 1 and 2: 15 cols x 11 rows — same style as original
// Maze 3: 19 cols x 13 rows — larger, more complex
// All three flood-fill verified: fully connected, exit reachable
// Run 1 — 15x11, start top-left (r1,c1), exit top-right (r1,c13)
// Same design language as the original maze — moderate complexity
const MAZE_1 = [
[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
[0,2,1,1,0,1,1,1,0,1,1,1,1,3,0],
[0,0,0,1,0,1,0,1,0,1,0,0,0,1,0],
[0,1,1,1,1,1,0,1,1,1,0,1,1,1,0],
[0,1,0,0,0,0,0,0,0,0,0,1,0,1,0],
[0,1,0,1,1,1,1,1,0,1,1,1,0,1,0],
[0,1,0,1,0,0,0,1,0,1,0,0,0,1,0],
[0,1,1,1,0,1,1,1,0,1,1,1,1,1,0],
[0,0,0,1,0,1,0,0,0,0,0,1,0,0,0],
[0,1,1,1,1,1,0,1,1,1,1,1,1,1,0],
[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];
// Run 2 — 15x11, start top-left (r1,c1), exit top-right (r1,c13)
// Harder — more dead ends, longer required path, tighter corridors
const MAZE_2 = [
[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
[0,2,1,1,0,1,1,1,1,1,0,1,1,3,0],
[0,0,0,1,0,1,0,1,0,1,0,0,0,1,0],
[0,1,1,1,0,1,0,1,0,1,1,1,0,1,0],
[0,1,0,1,0,1,0,1,0,0,0,1,0,1,0],
[0,1,0,1,1,1,0,1,1,1,0,1,0,1,0],
[0,1,0,0,0,0,0,0,0,1,0,1,0,1,0],
[0,1,1,1,0,1,1,1,0,1,0,1,1,1,0],
[0,0,0,1,0,0,0,1,0,1,0,0,0,1,0],
[0,1,1,1,1,1,0,1,1,1,1,1,1,1,0],
[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];
// Run 3 — 19x13, start top-left (r1,c1), exit bottom-right (r11,c17)
// Most complex — larger grid, many more turns and dead ends,
// longer optimal path requiring navigation across the full maze

const MAZE_3 = [
[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
[0,2,1,1,0,1,1,1,1,1,1,1,0,1,1,1,0,1,0],
[0,0,0,1,0,1,0,1,0,0,0,1,0,1,0,1,0,1,0],
[0,1,1,1,0,1,0,1,1,1,0,1,0,1,0,1,1,1,0],
[0,1,0,1,0,1,0,0,0,1,0,1,0,1,0,0,0,1,0],
[0,1,0,1,1,1,0,1,0,1,0,1,1,1,0,1,0,1,0],
[0,1,0,0,0,0,0,1,0,1,0,0,0,1,0,1,0,1,0],
[0,1,1,1,0,1,1,1,0,1,1,1,0,1,0,1,0,1,0],
[0,0,0,1,0,1,0,0,0,0,0,1,0,1,0,1,0,1,0],
[0,1,1,1,0,1,0,1,1,1,0,1,0,1,1,1,0,1,0],
[0,1,0,0,0,1,0,1,0,1,0,1,0,0,0,1,0,1,0],
[0,1,1,1,1,1,0,1,0,1,1,1,1,1,0,1,1,3,0],
[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];
const MAZES = [MAZE_1, MAZE_2, MAZE_3];
// Dimensions per maze — mazes 1+2 are 15x11, maze 3 is 19x13
const MAZE_DIMS = [
{ cols: 15, rows: 11 },
{ cols: 15, rows: 11 },
{ cols: 19, rows: 13 },
];
function mazeCols() { return MAZE_DIMS[currentRun - 1].cols; }
function mazeRows() { return MAZE_DIMS[currentRun - 1].rows; }
// Active maze for current run
function activeMaze() { return MAZES[currentRun - 1]; }
// Player
let playerCol = 1;
let playerRow = 1;
let playerX, playerY;
let targetX, targetY;
let moving = false;
let dirCol = 0, dirRow = 0;
// Layout
let cellW, cellH;
let mazeOffX, mazeOffY;
// Heatmap
let heatMaps = [];
let heatFrames = [];
let heatAtt = [];
// Session tracking
const MAX_RUNS = 3;
let currentRun = 1;
let runTimes = [];
let runAttAvgs = [];
let runFrames = 0;
let totalAttSum = 0;
let totalAttFrames = 0;
// Fog mechanic (run 2+)
let fogTimer = 0;
const FOG_THRESH = 0.42;
const FOG_DUR = 60;

// Intro timer
let introTimer = 270;
// EEG smoothing
let attHist = [], medHist = [];
function smoothed(val, hist, n) {
hist.push(val);
if (hist.length > n) hist.shift();
return hist.reduce((a, b) => a + b, 0) / hist.length;
}
// Setup
function setup() {
colorMode(RGB);
computeLayout();
initHeatmap();
resetPlayer();
}
function computeLayout() {
let cols = mazeCols(), rows = mazeRows();
let cs = floor(min((width - 120) / cols, (height * 0.78 - 60) / rows));
cellW = cs; cellH = cs;
mazeOffX = floor((width - cellW * cols) / 2);
mazeOffY = floor(height * 0.08);
}
function initHeatmap() {
heatFrames = [];
heatAtt = [];
for (let r = 0; r < mazeRows(); r++) {
heatFrames.push(new Array(mazeCols()).fill(0));
heatAtt.push(new Array(mazeCols()).fill(0));
}
}
function resetPlayer() {
computeLayout();
initHeatmap();
let maze = activeMaze();
for (let r = 0; r < mazeRows(); r++) {
for (let c = 0; c < mazeCols(); c++) {
if (maze[r][c] === 2) { playerRow = r; playerCol = c; }
}
}
playerX = mazeOffX + playerCol * cellW + cellW / 2;
playerY = mazeOffY + playerRow * cellH + cellH / 2;
targetX = playerX;
targetY = playerY;
moving = false;
dirCol = 0; dirRow = 0;
runFrames = 0;
totalAttSum = 0;
totalAttFrames = 0;
fogTimer = 0;
}
// Key input
function keyPressed() {
// Summary screen — Space to restart

if (gameState === "summary" && keyCode === 32) {
resetSession();
return;
}
if (gameState !== "playing") return;
if (keyCode === LEFT_ARROW) { dirCol = -1; dirRow = 0; }
if (keyCode === RIGHT_ARROW) { dirCol = 1; dirRow = 0; }
if (keyCode === UP_ARROW) { dirCol = 0; dirRow = -1; }
if (keyCode === DOWN_ARROW) { dirCol = 0; dirRow = 1; }
}
function keyReleased() {
if (keyCode === LEFT_ARROW && dirCol === -1) { dirCol = 0; dirRow = 0; }
if (keyCode === RIGHT_ARROW && dirCol === 1) { dirCol = 0; dirRow = 0; }
if (keyCode === UP_ARROW && dirRow === -1) { dirCol = 0; dirRow = 0; }
if (keyCode === DOWN_ARROW && dirRow === 1) { dirCol = 0; dirRow = 0; }
}
// Main draw loop
function draw() {
if (!eegData.connected) {
background(20, 20, 35);
fill(255); textAlign(CENTER, CENTER); textSize(20);
text("Connect or simulate EEG to play", width / 2, height / 2);
return;
}
let att = smoothed(eegData.attention !== undefined ? eegData.attention : 0.5, attHist, 6);
let med = smoothed(eegData.meditation !== undefined ? eegData.meditation : 0.5, medHist, 8);
// Intro
if (gameState === "intro") {
drawIntro();
if (introTimer > 0) { introTimer--; }
else if (att > 0.48) { gameState = "playing"; }
return;
}
// Summary — stays until Space
if (gameState === "summary") {
drawSummary();
return;
}
// Run complete overlay
if (gameState === "complete") {
drawMaze();
drawHeatmapOverlay();
drawPlayer();
drawRunComplete();
if (att > 0.50) startNextRun();
return;
}
// Playing
runFrames++;
totalAttSum += att;
totalAttFrames++;
// Fog mechanic run 2+
if (currentRun >= 2) {

fogTimer = att < FOG_THRESH ? fogTimer + 1 : max(0, fogTimer - 2);
}
// Speed from attention
let speed = constrain(map(att, 0.35, 0.65, 0.8, 3.5), 0.8, 3.5);
// Move toward target
if (!moving) {
if (dirCol !== 0 || dirRow !== 0) {
let nc = playerCol + dirCol;
let nr = playerRow + dirRow;
if (canMove(nc, nr)) {
playerCol = nc; playerRow = nr;
targetX = mazeOffX + playerCol * cellW + cellW / 2;
targetY = mazeOffY + playerRow * cellH + cellH / 2;
moving = true;
}
}
} else {
let dx = targetX - playerX;
let dy = targetY - playerY;
let dist = sqrt(dx * dx + dy * dy);
if (dist <= speed) {
playerX = targetX; playerY = targetY;
moving = false;
if (activeMaze()[playerRow][playerCol] === 3) { completeRun(); }
} else {
playerX += (dx / dist) * speed;
playerY += (dy / dist) * speed;
}
}
// Record heatmap every frame
heatFrames[playerRow][playerCol]++;
heatAtt[playerRow][playerCol] += att;
// Draw
drawMaze();
drawHeatmapOverlay();
drawPlayer();
if (currentRun >= 2 && fogTimer > FOG_DUR) drawFog();
drawHUD(att, med);
}
// Can move
function canMove(c, r) {
if (c < 0 || c >= mazeCols() || r < 0 || r >= mazeRows()) return false;
return activeMaze()[r][c] !== 0;
}
// Complete run
function completeRun() {
let avgAtt = totalAttFrames > 0 ? totalAttSum / totalAttFrames : 0;
runTimes.push(runFrames);
runAttAvgs.push(avgAtt);
// Save heatmap snapshot for this run
heatMaps.push({
frames: heatFrames.map(r => r.slice()),
att: heatAtt.map(r => r.slice()),
run: currentRun
});

gameState = "complete";
}
// Start next run
function startNextRun() {
if (currentRun >= MAX_RUNS) {
gameState = "summary";
return;
}
currentRun++;
resetPlayer();
gameState = "playing";
}
// Reset session
function resetSession() {
currentRun = 1;
runTimes = [];
runAttAvgs = [];
heatMaps = [];
attHist = [];
medHist = [];
introTimer = 270;
resetPlayer();
gameState = "intro";
}
// Drawing: Maze
function drawMaze() {
background(20, 20, 35);
let maze = activeMaze();
for (let r = 0; r < mazeRows(); r++) {
for (let c = 0; c < mazeCols(); c++) {
let x = mazeOffX + c * cellW;
let y = mazeOffY + r * cellH;
let cell = maze[r][c];
if (cell === 0) {
fill(50, 50, 80); noStroke(); rect(x, y, cellW, cellH);
fill(60, 60, 95); rect(x, y, cellW, 2);
fill(35, 35, 55); rect(x, y + cellH - 2, cellW, 2);
} else {
fill(30, 30, 50); noStroke(); rect(x, y, cellW, cellH);
}
if (cell === 2) {
fill(80, 200, 120, 180); noStroke();
rect(x + 3, y + 3, cellW - 6, cellH - 6, 3);
fill(255); textAlign(CENTER, CENTER); textSize(9);
text("S", x + cellW / 2, y + cellH / 2);
}
if (cell === 3) {
fill(255, 200, 50, 200); noStroke();
rect(x + 3, y + 3, cellW - 6, cellH - 6, 3);
fill(30); textAlign(CENTER, CENTER); textSize(9);
text("E", x + cellW / 2, y + cellH / 2);
}
}
}

// Run label above maze
fill(180); textAlign(LEFT, CENTER); textSize(12); noStroke();
text("Run " + currentRun + " of " + MAX_RUNS + " | Maze " + currentRun,
mazeOffX, mazeOffY - 12);
noFill(); stroke(100, 100, 160); strokeWeight(2);
rect(mazeOffX, mazeOffY, cellW * mazeCols(), cellH * mazeRows());
noStroke();
}
// Drawing: Heatmap overlay
function drawHeatmapOverlay() {
for (let r = 0; r < mazeRows(); r++) {
for (let c = 0; c < mazeCols(); c++) {
if (activeMaze()[r][c] === 0) continue;
let frames = heatFrames[r][c];
if (frames === 0) continue;
let avgAtt = heatAtt[r][c] / frames;
let x = mazeOffX + c * cellW;
let y = mazeOffY + r * cellH;
let alpha = constrain(map(frames, 1, 120, 30, 140), 30, 140);
let heatCol = avgAtt < 0.45
? lerpColor(color(220, 50, 50), color(255, 200, 50), map(avgAtt, 0.30, 0.45, 0, 1))
: lerpColor(color(255, 200, 50), color(50, 220, 100), map(avgAtt, 0.45, 0.65, 0, 1));
fill(red(heatCol), green(heatCol), blue(heatCol), alpha);
noStroke();
rect(x + 2, y + 2, cellW - 4, cellH - 4, 2);
}
}
}
// Drawing: Heatmap from saved snapshot
function drawSavedHeatmap(snap, maze, offX, offY, cw, ch) {
let rows = maze.length;
let cols = maze[0].length;
for (let r = 0; r < rows; r++) {
for (let c = 0; c < cols; c++) {
if (maze[r][c] === 0) continue;
fill(30, 30, 50); noStroke();
rect(offX + c * cw, offY + r * ch, cw, ch);
let frames = snap.frames[r] ? snap.frames[r][c] : 0;
if (!frames) continue;
let avgAtt = snap.att[r][c] / frames;
let alpha = constrain(map(frames, 1, 80, 40, 160), 40, 160);
let heatCol = avgAtt < 0.45
? lerpColor(color(220, 50, 50), color(255, 200, 50), map(avgAtt, 0.30, 0.45, 0, 1))
: lerpColor(color(255, 200, 50), color(50, 220, 100), map(avgAtt, 0.45, 0.65, 0, 1));
fill(red(heatCol), green(heatCol), blue(heatCol), alpha);
rect(offX + c * cw + 1, offY + r * ch + 1, cw - 2, ch - 2, 1);
}
}
for (let r = 0; r < rows; r++) {
for (let c = 0; c < cols; c++) {
if (maze[r][c] === 0) {
fill(50, 50, 80); noStroke();
rect(offX + c * cw, offY + r * ch, cw, ch);
}
}
}
noFill(); stroke(100, 100, 160); strokeWeight(1);
rect(offX, offY, cw * cols, ch * rows);

noStroke();
}
// Drawing: Player
function drawPlayer() {
fill(100, 180, 255, 60); noStroke();
ellipse(playerX, playerY, cellW * 1.1, cellH * 1.1);
fill(100, 180, 255);
ellipse(playerX, playerY, cellW * 0.65, cellH * 0.65);
fill(255, 255, 255, 200);
ellipse(playerX + dirCol * cellW * 0.15,
playerY + dirRow * cellH * 0.15,
cellW * 0.22, cellH * 0.22);
}
// Drawing: Fog
function drawFog() {
let alpha = constrain(map(fogTimer, FOG_DUR, FOG_DUR + 60, 0, 120), 0, 120);
fill(0, 0, 0, alpha); noStroke();
rect(mazeOffX, mazeOffY, cellW * mazeCols(), cellH * mazeRows());
fill(255, 100, 100, alpha * 2);
textAlign(CENTER, CENTER); textSize(13);
text("Focus! Fog closing in...", width / 2, mazeOffY - 14);
}
// Drawing: HUD
function drawHUD(att, med) {
fill(0, 0, 0, 160); noStroke();
rect(0, height - 72, width, 72);
fill(255); textAlign(LEFT, CENTER); textSize(13);
text("Run: " + currentRun + " / " + MAX_RUNS, 12, height - 55);
let secs = floor(runFrames / 30);
let mins = floor(secs / 60); secs = secs % 60;
text("Time: " + mins + ":" + (secs < 10 ? "0" : "") + secs, 12, height - 35);
let bx = width * 0.28;
drawBar(bx, height - 60, att, "Attention (speed)", color(100, 200, 255));
drawBar(bx + 160, height - 60, med, "Meditation (info)", color(180, 120, 255));
fill(255); textAlign(RIGHT, CENTER); textSize(11);
text("Heatmap:", width - 145, height - 52);
fill(220, 50, 50); noStroke(); rect(width - 138, height - 58, 14, 12, 2);
fill(200); textAlign(LEFT, CENTER); textSize(10);
text("Low focus", width - 122, height - 52);
fill(50, 220, 100); noStroke(); rect(width - 138, height - 42, 14, 12, 2);
fill(200); text("High focus", width - 122, height - 36);
fill(160); textAlign(CENTER, CENTER); textSize(11);
text("Arrow keys to move | Focus your mind to move faster", width / 2, height - 14);
}
function drawBar(x, y, val, label, col) {
let bw = 130, bh = 12;
fill(40); noStroke(); rect(x, y, bw, bh, 3);
fill(col); rect(x, y, bw * constrain(val, 0, 1), bh, 3);
noFill(); stroke(60); strokeWeight(0.5); rect(x, y, bw, bh, 3);
noStroke(); fill(255); textAlign(LEFT, TOP); textSize(10);
text(label + " " + val.toFixed(2), x, y + 14);
}

// Drawing: Run complete overlay
function drawRunComplete() {
fill(0, 0, 0, 155); noStroke();
rect(width * 0.2, height * 0.28, width * 0.6, height * 0.40, 12);
let lastTime = runTimes[runTimes.length - 1];
let secs = floor(lastTime / 30);
let mins = floor(secs / 60); secs = secs % 60;
let lastAtt = runAttAvgs[runAttAvgs.length - 1];
fill(255, 220, 50); textAlign(CENTER, CENTER); textSize(22);
text("Run " + currentRun + " Complete!", width / 2, height * 0.36);
fill(255); textSize(14);
text("Time: " + mins + ":" + (secs < 10 ? "0" : "") + secs, width / 2, height * 0.44);
text("Avg Attention: " + (lastAtt * 100).toFixed(1) + "%", width / 2, height * 0.51);
fill(160); textSize(12);
if (currentRun < MAX_RUNS) {
text("Review the heatmap, then focus to start Run " + (currentRun + 1) +
" on a new maze", width / 2, height * 0.59);
} else {
text("Focus to see your full session summary", width / 2, height * 0.59);
}
}
// Drawing: Intro screen
function drawIntro() {
background(20, 20, 35);
fill(0, 0, 0, 160); noStroke();
rect(width * 0.08, height * 0.06, width * 0.84, height * 0.88, 14);
fill(100, 200, 255); textAlign(CENTER, CENTER); textSize(26);
text("EEG Maze Navigator", width / 2, height * 0.14);
fill(255); textSize(14);
text("Navigate 3 mazes to the exit. Each maze is more complex than the last.", width / 2, height * 0.23);
stroke(60, 60, 100); strokeWeight(1);
line(width * 0.18, height * 0.29, width * 0.82, height * 0.29);
noStroke();
fill(100, 200, 255); textSize(13);
text("MOVEMENT SPEED (Attention)", width / 2, height * 0.35);
fill(200); textSize(12);
text("Your attention score rises when you concentrate deliberately.", width / 2, height * 0.41);
text("Higher attention = faster movement through the maze.", width / 2, height * 0.46);
text("Low attention = you slow to a crawl.", width / 2, height * 0.51);
stroke(60, 60, 100); strokeWeight(1);
line(width * 0.18, height * 0.56, width * 0.82, height * 0.56);
noStroke();
fill(180, 120, 255); textSize(13);
text("LIVE HEATMAP", width / 2, height * 0.62);
fill(200); textSize(12);
text("A live colour overlay shows where your focus was strongest.", width / 2, height * 0.68);
text("Red = low attention zones. Green = high attention zones.", width / 2, height * 0.73);
text("From Run 2 onward, low attention causes a fog to creep over the maze.", width / 2, height * 0.78);

fill(255, 255, 255, 180); textSize(12);
if (introTimer > 0) {
text("Please read the instructions above (" + ceil(introTimer / 30) + "s)", width / 2, height * 0.88);
} else {
text("Focus your mind to begin | Use arrow keys to navigate", width / 2, height * 0.88);
}
}
// Drawing: Summary screen
function drawSummary() {
background(20, 20, 35);
// Title
fill(100, 200, 255); textAlign(CENTER, CENTER); textSize(24);
text("Session Complete", width / 2, height * 0.05);
// Three mini heatmaps side by side
// Each mini map uses that run's own maze dimensions
let mw = floor(width * 0.28);
let gap = floor((width - mw * 3) / 4);
let my = height * 0.12;
for (let i = 0; i < heatMaps.length; i++) {
let mCols = MAZE_DIMS[i].cols;
let mRows = MAZE_DIMS[i].rows;
let mh = floor(mw * mRows / mCols);
let mcw = floor(mw / mCols);
let mch = floor(mh / mRows);
let mx = gap + i * (mw + gap);
// Mini maze walls
for (let r = 0; r < mRows; r++) {
for (let c = 0; c < mCols; c++) {
let x = mx + c * mcw;
let y = my + r * mch;
if (MAZES[i][r][c] === 0) {
fill(50, 50, 80); noStroke(); rect(x, y, mcw, mch);
} else {
fill(30, 30, 50); noStroke(); rect(x, y, mcw, mch);
}
}
}
drawSavedHeatmap(heatMaps[i], MAZES[i], mx, my, mcw, mch);
fill(220); textAlign(CENTER, TOP); textSize(11);
text("Run " + (i + 1), mx + mw / 2, my + mh + 4);
}
// Use run 1 dimensions for tableY baseline (tallest possible)
let mh0 = floor(mw * MAZE_DIMS[0].rows / MAZE_DIMS[0].cols);
let tableY = my + mh0 + 26;
fill(0, 0, 0, 160); noStroke();
rect(width * 0.06, tableY, width * 0.88, height * 0.36, 10);
let cols = [width * 0.18, width * 0.35, width * 0.53, width * 0.72, width * 0.88];
fill(160); textSize(11); textAlign(CENTER, CENTER);
text("Run", cols[0], tableY + 16);
text("Maze", cols[1], tableY + 16);
text("Time", cols[2], tableY + 16);
text("Avg Attention",cols[3], tableY + 16);
text("vs Run 1", cols[4], tableY + 16);

stroke(50, 50, 80); strokeWeight(1);
line(width * 0.08, tableY + 26, width * 0.92, tableY + 26);
noStroke();
for (let i = 0; i < runTimes.length; i++) {
let ry = tableY + 42 + i * 28;
let secs = floor(runTimes[i] / 30);
let mins = floor(secs / 60); secs = secs % 60;
let tStr = mins + ":" + (secs < 10 ? "0" : "") + secs;
let aStr = (runAttAvgs[i] * 100).toFixed(1) + "%";
let iStr = i === 0 ? "Baseline" :
runTimes[i] < runTimes[0] ?
"-" + floor((runTimes[0] - runTimes[i]) / 30) + "s faster" :
"+" + floor((runTimes[i] - runTimes[0]) / 30) + "s slower";
let iCol = i === 0 ? color(160) :
runTimes[i] < runTimes[0] ? color(80, 220, 120) : color(255, 100, 100);
fill(220); textSize(12); textAlign(CENTER, CENTER);
text("Run " + (i + 1), cols[0], ry);
text("Maze " + (i + 1), cols[1], ry);
text(tStr, cols[2], ry);
text(aStr, cols[3], ry);
fill(iCol);
text(iStr, cols[4], ry);
}
// Heatmap legend
let ly = tableY + 42 + runTimes.length * 28 + 10;
fill(220, 50, 50); noStroke(); rect(width * 0.30, ly, 12, 10, 2);
fill(200); textAlign(LEFT, CENTER); textSize(10);
text("Low focus", width * 0.30 + 16, ly + 5);
fill(50, 220, 100); noStroke(); rect(width * 0.50, ly, 12, 10, 2);
fill(200); text("High focus", width * 0.50 + 16, ly + 5);
// Performance message
let improved = runTimes.length > 1 && runTimes[runTimes.length - 1] < runTimes[0];
fill(improved ? color(80, 220, 120) : color(255, 220, 50));
textAlign(CENTER, CENTER); textSize(12);
text(improved ?
"Great improvement across runs. Your sustained attention strengthened over the session." :
"Keep practising — each run builds your attentional map. Review the heatmaps above.",
width / 2, ly + 26);
// Space to restart
fill(255, 255, 255, 180); textSize(12);
text("Press Space to play again", width / 2, ly + 46);
}