// ============================================================
// PUBLIC-2D/OPENING-SCENE.JS — Opening screen scene
// ============================================================
// Draws the intro scene shown before "Click Anywhere To Begin":
// standing alone on a rooftop at midnight, overlooking a quiet city
// skyline. Renders onto its own dedicated canvas
// (#opening-scene-canvas), which lives INSIDE #opening-overlay — not
// the persistent, page-level #background-canvas the main menu uses
// (see menu-background.js). Keeping these fully separate is
// deliberate: nothing drawn here can ever affect what the main menu
// looks like, and vice versa.
//
// PERFORMANCE: this loop self-terminates once the opening overlay is
// dismissed (checks the overlay's own 'hidden' class each frame) —
// it does not keep animating in the background after the player has
// moved on to the menu, so there's no ongoing cost once the intro is
// no longer visible.
//
// Nothing here touches the title's animation, the opening's timing,
// or the transition logic — those all remain exactly as they were in
// opening.js.
// ============================================================

const overlayEl = document.getElementById('opening-overlay');
const canvas = document.getElementById('opening-scene-canvas');
const ctx = canvas.getContext('2d');

let width = 0;
let height = 0;

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
}
resize();
window.addEventListener('resize', resize);

// ------------------------------------------------------------
// Distant skyline — a single, lightweight silhouette layer (this
// scene is brief, so it doesn't need the menu's two-layer parallax
// treatment to feel rich).
// ------------------------------------------------------------
function buildSkyline() {
  const buildings = [];
  let x = 0;
  while (x < width) {
    const w = 30 + Math.random() * 34;
    const h = height * (0.16 + Math.random() * 0.22);
    buildings.push({ x, y: height * 0.55 - h, w, h });
    x += w;
  }
  return buildings;
}

function sampleWindows(buildings, count) {
  const windows = [];
  for (let i = 0; i < count; i++) {
    const b = buildings[Math.floor(Math.random() * buildings.length)];
    if (!b || b.h < 24) continue;
    windows.push({
      x: b.x + 6 + Math.random() * Math.max(1, b.w - 12),
      y: b.y + 8 + Math.random() * Math.max(1, b.h - 16),
      phase: Math.random() * Math.PI * 2,
      speed: 0.15 + Math.random() * 0.25,
    });
  }
  return windows;
}

function makeFogBank(seedX, seedY) {
  const blockSize = 14;
  const blocks = [];
  const count = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < count; i++) {
    blocks.push({ dx: (Math.random() - 0.5) * 100, dy: (Math.random() - 0.5) * 18, size: blockSize + Math.random() * blockSize });
  }
  return { x: seedX, y: seedY, speed: 2 + Math.random() * 2, blocks };
}

function makeCloudBank(seedX, seedY) {
  const blockSize = 22;
  const blocks = [];
  const count = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    blocks.push({ dx: (Math.random() - 0.5) * 150, dy: (Math.random() - 0.5) * 26, size: blockSize + Math.random() * blockSize });
  }
  return { x: seedX, y: seedY, speed: 0.8 + Math.random(), blocks };
}

function makeParticle() {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    size: 1 + Math.random() * 2,
    speedY: -1.5 - Math.random() * 2,
    driftX: 4 + Math.random() * 5, // carried by wind, mostly sideways
    twinklePhase: Math.random() * Math.PI * 2,
  };
}

let skyline = buildSkyline();
let windows = sampleWindows(skyline, 22);
const fogBanks = Array.from({ length: 3 }, () => makeFogBank(Math.random() * width, height * 0.5 + Math.random() * height * 0.12));
const cloudBanks = Array.from({ length: 3 }, () => makeCloudBank(Math.random() * width * 0.6, height * 0.1 + Math.random() * height * 0.1));
const particles = Array.from({ length: 30 }, makeParticle);

// Rooftop fixtures: a vent shape, an antenna with a slow red blink,
// and a taller comm tower with its own blink — all fixed in place,
// silhouetted against the sky, giving the foreground a lived-in,
// covert-operation feel without any actual motion of their own.
const antennaX = width * 0.18;
const towerX = width * 0.88;

// Rare "spy detail" events — searchlight sweep and a distant
// helicopter light. Both are intentionally infrequent and subtle.
let searchlightActive = false;
let searchlightProgress = 0;
let nextSearchlightAt = 6000 + Math.random() * 9000;
let searchlightTimer = 0;

let helicopterActive = false;
let helicopterProgress = 0;
let nextHelicopterAt = 12000 + Math.random() * 16000;
let helicopterTimer = 0;

let lastTimestamp = null;
let parallax = 0;

function drawSky() {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#04070a');
  gradient.addColorStop(0.55, '#06090b');
  gradient.addColorStop(1, '#0a1310');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawMoon() {
  const moonX = width * 0.72;
  const moonY = height * 0.16;
  const radius = Math.min(width, height) * 0.045;

  const glow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, radius * 5);
  glow.addColorStop(0, 'rgba(241, 250, 238, 0.14)');
  glow.addColorStop(1, 'rgba(241, 250, 238, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(moonX - radius * 5, moonY - radius * 5, radius * 10, radius * 10);

  ctx.fillStyle = 'rgba(241, 250, 238, 0.6)';
  ctx.beginPath();
  ctx.arc(moonX, moonY, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawClouds(dtSeconds) {
  // Drawn after the moon so clouds occasionally pass in front of it,
  // per "a bright moon partially hidden behind clouds."
  ctx.fillStyle = 'rgba(18, 26, 24, 0.4)';
  for (const cloud of cloudBanks) {
    cloud.x -= cloud.speed * dtSeconds;
    if (cloud.x < -180) cloud.x = width + 180;
    for (const block of cloud.blocks) {
      ctx.fillRect(Math.round(cloud.x + block.dx), Math.round(cloud.y + block.dy), block.size, block.size);
    }
  }
}

function drawSkyline(offset) {
  const wrapped = ((offset % width) + width) % width;
  ctx.fillStyle = '#0c1712';
  for (const b of skyline) {
    const px = b.x - wrapped;
    ctx.fillRect(Math.round(px < -b.w ? px + width : px), Math.round(b.y), Math.ceil(b.w), Math.ceil(b.h) + 4);
    ctx.fillRect(Math.round((px < -b.w ? px + width : px) - width), Math.round(b.y), Math.ceil(b.w), Math.ceil(b.h) + 4);
  }
}

function drawWindows(offset, timestamp) {
  const wrapped = ((offset % width) + width) % width;
  for (const w of windows) {
    const flicker = 0.4 + 0.6 * Math.max(0, Math.sin(timestamp / 1000 * w.speed + w.phase));
    if (flicker < 0.5) continue;
    ctx.fillStyle = `rgba(244, 208, 130, ${(flicker * 0.5).toFixed(2)})`;
    let px = w.x - wrapped;
    if (px < -4) px += width;
    ctx.fillRect(Math.round(px), Math.round(w.y), 2, 3);
  }
}

function drawAmbientCityGlow() {
  const glow = ctx.createLinearGradient(0, height * 0.5, 0, height * 0.62);
  glow.addColorStop(0, 'rgba(244, 208, 130, 0.05)');
  glow.addColorStop(1, 'rgba(244, 208, 130, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, height * 0.5, width, height * 0.12);
}

function drawFog(dtSeconds) {
  ctx.fillStyle = 'rgba(120, 150, 145, 0.09)';
  for (const fog of fogBanks) {
    fog.x -= fog.speed * dtSeconds;
    if (fog.x < -160) fog.x = width + 160;
    for (const block of fog.blocks) {
      const px = Math.round(fog.x + block.dx + Math.sin(parallax * 0.04) * 5);
      const py = Math.round(fog.y + block.dy);
      ctx.fillRect(px, py, block.size, block.size);
    }
  }
}

function drawSearchlight(dtMs) {
  searchlightTimer += dtMs;
  if (!searchlightActive && searchlightTimer >= nextSearchlightAt) {
    searchlightActive = true;
    searchlightProgress = 0;
    searchlightTimer = 0;
  }
  if (!searchlightActive) return;

  searchlightProgress += dtMs / 4200; // one slow sweep over ~4.2s
  if (searchlightProgress >= 1) {
    searchlightActive = false;
    nextSearchlightAt = 8000 + Math.random() * 12000;
    return;
  }

  const sweepX = width * (0.15 + searchlightProgress * 0.7);
  const gradient = ctx.createLinearGradient(sweepX - 40, height * 0.5, sweepX + 40, 0);
  gradient.addColorStop(0, 'rgba(241, 250, 238, 0)');
  gradient.addColorStop(0.5, 'rgba(241, 250, 238, 0.06)');
  gradient.addColorStop(1, 'rgba(241, 250, 238, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(sweepX, height * 0.5);
  ctx.lineTo(sweepX - 70, 0);
  ctx.lineTo(sweepX + 70, 0);
  ctx.closePath();
  ctx.fill();
}

function drawHelicopter(dtMs) {
  helicopterTimer += dtMs;
  if (!helicopterActive && helicopterTimer >= nextHelicopterAt) {
    helicopterActive = true;
    helicopterProgress = 0;
    helicopterTimer = 0;
  }
  if (!helicopterActive) return;

  helicopterProgress += dtMs / 9000; // very slow, distant crossing
  if (helicopterProgress >= 1) {
    helicopterActive = false;
    nextHelicopterAt = 14000 + Math.random() * 18000;
    return;
  }

  const hx = width * (-0.05 + helicopterProgress * 1.1);
  const hy = height * 0.3;
  const blink = Math.sin(helicopterProgress * 40) > 0.3;
  if (!blink) return;
  ctx.fillStyle = 'rgba(230, 57, 70, 0.55)';
  ctx.fillRect(Math.round(hx), Math.round(hy), 2, 2);
  const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 6);
  glow.addColorStop(0, 'rgba(230, 57, 70, 0.25)');
  glow.addColorStop(1, 'rgba(230, 57, 70, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(hx - 6, hy - 6, 12, 12);
}

function drawParticles(dtSeconds, timestamp) {
  for (const p of particles) {
    p.y += p.speedY * dtSeconds;
    p.x += p.driftX * dtSeconds;
    if (p.y < -4) {
      p.y = height * 0.55 + Math.random() * height * 0.1;
      p.x = -4;
    }
    if (p.x > width + 4) p.x = -4;
    const twinkle = 0.25 + 0.25 * Math.sin(timestamp / 650 + p.twinklePhase);
    ctx.fillStyle = `rgba(241, 250, 238, ${twinkle.toFixed(2)})`;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
}

function drawRooftopForeground(timestamp) {
  const roofTop = height * 0.72;

  // Soft moonlight patch on the rooftop surface.
  const moonlight = ctx.createRadialGradient(width * 0.6, roofTop + 20, 0, width * 0.6, roofTop + 20, width * 0.35);
  moonlight.addColorStop(0, 'rgba(241, 250, 238, 0.06)');
  moonlight.addColorStop(1, 'rgba(241, 250, 238, 0)');
  ctx.fillStyle = moonlight;
  ctx.fillRect(0, roofTop, width, height - roofTop);

  // Rooftop slab silhouette.
  ctx.fillStyle = '#050908';
  ctx.fillRect(0, roofTop, width, height - roofTop);
  // Ledge highlight along the top edge, catching faint ambient light.
  ctx.fillStyle = 'rgba(88, 129, 87, 0.18)';
  ctx.fillRect(0, roofTop, width, 3);

  // A vent/HVAC block, purely a silhouette shape.
  ctx.fillStyle = '#030505';
  ctx.fillRect(width * 0.36, roofTop - 22, 46, 22);

  // Antenna with a slow-blinking red light.
  ctx.fillStyle = '#030505';
  ctx.fillRect(antennaX, roofTop - 70, 2, 70);
  const antennaBlink = Math.sin(timestamp / 900) > 0.6;
  if (antennaBlink) {
    ctx.fillStyle = 'rgba(230, 57, 70, 0.8)';
    ctx.fillRect(antennaX - 1, roofTop - 74, 4, 4);
  }

  // Taller comm tower, its own independent blink rhythm.
  ctx.fillStyle = '#030505';
  ctx.fillRect(towerX, roofTop - 100, 3, 100);
  ctx.fillRect(towerX - 6, roofTop - 78, 15, 2);
  const towerBlink = Math.sin(timestamp / 1300 + 2) > 0.55;
  if (towerBlink) {
    ctx.fillStyle = 'rgba(241, 250, 238, 0.7)';
    ctx.fillRect(towerX, roofTop - 104, 3, 3);
  }
}

function drawVignette() {
  const vignette = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.3,
    width / 2, height / 2, Math.max(width, height) * 0.72
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function draw(timestamp) {
  // Self-terminating: once the opening overlay is dismissed, stop
  // animating entirely rather than continuing to run behind the menu.
  if (overlayEl.classList.contains('hidden')) return;

  if (lastTimestamp === null) lastTimestamp = timestamp;
  const dtMs = Math.min(timestamp - lastTimestamp, 100);
  const dtSeconds = dtMs / 1000;
  lastTimestamp = timestamp;
  parallax += dtSeconds;

  drawSky();
  drawMoon();
  drawClouds(dtSeconds);
  drawSkyline(parallax * 3);
  drawWindows(parallax * 3, timestamp);
  drawAmbientCityGlow();
  drawSearchlight(dtMs);
  drawHelicopter(dtMs);
  drawFog(dtSeconds);
  drawRooftopForeground(timestamp);
  drawParticles(dtSeconds, timestamp);
  drawVignette();

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);
