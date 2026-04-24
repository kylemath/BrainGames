// brainGames/games/__sample.js
// TEST ONLY — do not add to the manifest. Used by Manager M1 to smoke-test
// the game runner. Draws a circle whose radius pulses with eegData.alpha.

let __sampleStart;

function setup() {
  const w = (window.innerWidth) || 800;
  const h = (window.innerHeight - 48) || 600;
  createCanvas(w, h);
  __sampleStart = millis();
}

function draw() {
  background(20, 12, 40);

  const alpha = (window.eegData && typeof window.eegData.alpha === 'number') ? window.eegData.alpha : 0;
  const beta  = (window.eegData && typeof window.eegData.beta  === 'number') ? window.eegData.beta  : 0;

  const t = (millis() - __sampleStart) / 1000;
  const cx = width / 2 + Math.sin(t * 0.8) * (width * 0.2);
  const cy = height / 2;

  noStroke();
  fill(247, 213, 29, 40);
  ellipse(cx, cy, 360 + alpha * 400, 360 + alpha * 400);

  fill(255, 74, 160);
  ellipse(cx, cy, 120 + alpha * 260, 120 + alpha * 260);

  fill(108, 255, 131);
  textAlign(CENTER, CENTER);
  textSize(18);
  text('SAMPLE STUB — alpha ' + alpha.toFixed(2) + '  beta ' + beta.toFixed(2), width / 2, 28);
}

function keyPressed() {
  if (key === ' ') {
    __sampleStart = millis();
  }
}

function mousePressed() {
  __sampleStart = millis();
}
