// ============================================================
// PUBLIC-2D/OPENING-BACKGROUND.JS — Animated pixel-art backdrop
// ============================================================
// Draws the opening/main-menu background: a dark, empty pixel-art
// city skyline at night, meant to read as "something secret is about
// to happen" — cinematic and quiet, not horror-themed. Nothing about
// title placement, transitions, or menu behavior lives here; this
// file only owns what gets drawn onto the persistent, page-level
// #background-canvas (see index.html / opening.js / main-menu.js for
// how that canvas is used elsewhere).
//
// PHASE 10.4 — full redesign of the scene itself: a two-layer city
// skyline with blinking window lights, a handful of glowing street
// lamps over an empty street, occasional flickering neon signs, a
// faint moon, slow clouds, ground fog, floating dust/firefly
// particles, gentle parallax between the two skyline layers, and a
// soft vignette. Everything stays flat, blocky, and low-opacity so
// the title text (drawn elsewhere, on top of this canvas) remains the
// clear visual focus.
//
// PERFORMANCE: the two skyline silhouettes (far + mid) are expensive
// to compute (many blocks) but visually static, so each is rendered
// ONCE onto its own small offscreen canvas (see buildSkylineLayer)
// and then just blitted (drawImage) every frame — cheap regardless of
// how detailed the silhouette is. Only genuinely animated elements
// (window blinks, lamp glow, fog, clouds, particles, neon flicker,
// vignette) are redrawn with real per-frame drawing calls, and all of
// those use simple flat rects/gradients rather than per-pixel work.
// ============================================================

const canvas = document.getElementById('background-canvas');
const ctx = canvas.getContext('2d');

let width = 0;
let height = 0;

let farSkyline = null; // { canvas, buildings }
let midSkyline = null;

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
  farSkyline = buildSkylineLayer({ blockWidth: 26, minHeightRatio: 0.12, maxHeightRatio: 0.32, color: '#111d17' });
  midSkyline = buildSkylineLayer({ blockWidth: 40, minHeightRatio: 0.18, maxHeightRatio: 0.46, color: '#0a1712' });
  streetLamps = makeStreetLamps();
  neonSigns = makeNeonSigns();
}

// Builds one skyline silhouette (a row of blocky buildings, pixel-art
// style — flat rectangles, no smooth curves) onto its own offscreen
// canvas, sized to tile seamlessly when drawn twice side by side for
// horizontal parallax scrolling. Returns the offscreen canvas plus
// each building's rect (used later to place window lights).
function buildSkylineLayer({ blockWidth, minHeightRatio, maxHeightRatio, color }) {
  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = width;
  layerCanvas.height = height;
  const layerCtx = layerCanvas.getContext('2d');

  const buildings = [];
  let x = 0;
  while (x < width) {
    const w = blockWidth + Math.random() * blockWidth * 0.6;
    const h = height * (minHeightRatio + Math.random() * (maxHeightRatio - minHeightRatio));
    const y = height - h;
    buildings.push({ x, y, w, h });
    layerCtx.fillStyle = color;
    layerCtx.fillRect(Math.round(x), Math.round(y), Math.ceil(w), Math.ceil(h) + 4);
    x += w;
  }

  return { canvas: layerCanvas, buildings };
}

// A modest, fixed set of window-light points sampled from a
// skyline's building rects — kept sparse (not one per possible
// window) so the per-frame blink pass stays cheap.
function sampleWindowLights(skyline, count) {
  const lights = [];
  for (let i = 0; i < count; i++) {
    const building = skyline.buildings[Math.floor(Math.random() * skyline.buildings.length)];
    if (!building || building.h < 20) continue;
    lights.push({
      x: building.x + 6 + Math.random() * Math.max(1, building.w - 12),
      y: building.y + 8 + Math.random() * Math.max(1, building.h - 16),
      phase: Math.random() * Math.PI * 2,
      speed: 0.15 + Math.random() * 0.3,
      warm: Math.random() < 0.6,
    });
  }
  return lights;
}

function makeStreetLamps() {
  const count = Math.max(4, Math.round(width / 260));
  const lamps = [];
  for (let i = 0; i < count; i++) {
    lamps.push({
      x: (width / count) * (i + 0.5) + (Math.random() - 0.5) * 60,
      flickerPhase: Math.random() * Math.PI * 2,
    });
  }
  return lamps;
}

function makeNeonSigns() {
  const colors = ['rgba(230, 57, 70, 0.5)', 'rgba(88, 129, 87, 0.5)', 'rgba(244, 162, 97, 0.45)'];
  const count = 2 + Math.floor(Math.random() * 2);
  const signs = [];
  for (let i = 0; i < count; i++) {
    signs.push({
      x: width * (0.1 + Math.random() * 0.8),
      y: height * (0.35 + Math.random() * 0.2),
      w: 14 + Math.random() * 10,
      h: 5 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      nextFlickerAt: 2000 + Math.random() * 6000,
      elapsed: 0,
      lit: true,
    });
  }
  return signs;
}

let streetLamps = [];
let neonSigns = [];
let farWindows = [];
let midWindows = [];

function makeFogBank(seedX, seedY) {
  const blockSize = 16;
  const blocks = [];
  const blockCount = 6 + Math.floor(Math.random() * 5);
  for (let i = 0; i < blockCount; i++) {
    blocks.push({
      dx: (Math.random() - 0.5) * 130,
      dy: (Math.random() - 0.5) * 20,
      size: blockSize + Math.random() * blockSize,
    });
  }
  return { x: seedX, y: seedY, speed: 2 + Math.random() * 2.5, blocks };
}

function makeCloudBank(seedX, seedY) {
  const blockSize = 20;
  const blocks = [];
  const blockCount = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < blockCount; i++) {
    blocks.push({
      dx: (Math.random() - 0.5) * 140,
      dy: (Math.random() - 0.5) * 24,
      size: blockSize + Math.random() * blockSize,
    });
  }
  return { x: seedX, y: seedY, speed: 1 + Math.random() * 1.2, blocks };
}

function makeParticle() {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    size: 1 + Math.random() * 2,
    speed: 2 + Math.random() * 5,
    drift: (Math.random() - 0.5) * 5,
    twinklePhase: Math.random() * Math.PI * 2,
    warm: Math.random() < 0.35, // fraction read as fireflies rather than plain dust
  };
}

resize();
window.addEventListener('resize', resize);

farWindows = sampleWindowLights(farSkyline, 40);
midWindows = sampleWindowLights(midSkyline, 26);

const fogBanks = Array.from({ length: 4 }, () =>
  makeFogBank(Math.random() * width, height * 0.72 + Math.random() * height * 0.12)
);
const cloudBanks = Array.from({ length: 4 }, () =>
  makeCloudBank(Math.random() * width, height * 0.08 + Math.random() * height * 0.14)
);
const particles = Array.from({ length: 55 }, makeParticle);

let farParallax = 0;
let midParallax = 0;
let lastTimestamp = null;

function drawSky() {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#050a09');
  gradient.addColorStop(0.6, '#070d0c');
  gradient.addColorStop(1, '#0a1310');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawMoon(timestamp) {
  const moonX = width * 0.82;
  const moonY = height * 0.18;
  const radius = Math.min(width, height) * 0.05;

  const glow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, radius * 5);
  glow.addColorStop(0, 'rgba(241, 250, 238, 0.10)');
  glow.addColorStop(1, 'rgba(241, 250, 238, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(moonX - radius * 5, moonY - radius * 5, radius * 10, radius * 10);

  ctx.fillStyle = 'rgba(241, 250, 238, 0.55)';
  ctx.beginPath();
  ctx.arc(moonX, moonY, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawSkylineLayer(skyline, offset) {
  const wrapped = ((offset % width) + width) % width;
  ctx.drawImage(skyline.canvas, -wrapped, 0);
  ctx.drawImage(skyline.canvas, width - wrapped, 0);
}

function drawWindowLights(windows, offset, timestamp) {
  const wrapped = ((offset % width) + width) % width;
  for (const w of windows) {
    const flicker = 0.4 + 0.6 * Math.max(0, Math.sin(timestamp / 1000 * w.speed + w.phase));
    if (flicker < 0.45) continue; // most windows read as "off" most of the time
    const color = w.warm ? `rgba(244, 162, 97, ${(flicker * 0.6).toFixed(2)})` : `rgba(241, 250, 238, ${(flicker * 0.5).toFixed(2)})`;
    ctx.fillStyle = color;
    const px = w.x - wrapped;
    ctx.fillRect(px < -4 ? px + width : px, w.y, 3, 3);
  }
}

function drawStreet() {
  const streetHeight = height * 0.1;
  ctx.fillStyle = '#0b1512';
  ctx.fillRect(0, height - streetHeight, width, streetHeight);
}

function drawStreetLamps(dtMs) {
  const streetTop = height - height * 0.1;
  for (const lamp of streetLamps) {
    const flicker = 0.75 + 0.25 * Math.sin(lamp.flickerPhase);
    lamp.flickerPhase += dtMs * 0.0015;

    ctx.fillStyle = 'rgba(20, 30, 25, 0.9)';
    ctx.fillRect(Math.round(lamp.x), streetTop - 30, 2, 30);

    const glow = ctx.createRadialGradient(lamp.x, streetTop - 30, 0, lamp.x, streetTop - 30, 46);
    glow.addColorStop(0, `rgba(244, 226, 166, ${(0.22 * flicker).toFixed(2)})`);
    glow.addColorStop(1, 'rgba(244, 226, 166, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(lamp.x - 46, streetTop - 76, 92, 92);

    ctx.fillStyle = `rgba(255, 244, 214, ${(0.85 * flicker).toFixed(2)})`;
    ctx.fillRect(Math.round(lamp.x) - 2, streetTop - 34, 4, 4);
  }
}

function drawNeonSigns(dtMs) {
  for (const sign of neonSigns) {
    sign.elapsed += dtMs;
    if (sign.elapsed >= sign.nextFlickerAt) {
      sign.elapsed = 0;
      sign.nextFlickerAt = 1500 + Math.random() * 5000;
      sign.lit = !sign.lit || Math.random() < 0.7; // brief off-flicker, mostly lit
    }
    if (!sign.lit) continue;
    ctx.fillStyle = sign.color;
    ctx.fillRect(Math.round(sign.x), Math.round(sign.y), sign.w, sign.h);
  }
}

function drawClouds(dtSeconds) {
  ctx.fillStyle = 'rgba(20, 30, 26, 0.35)';
  for (const cloud of cloudBanks) {
    cloud.x -= cloud.speed * dtSeconds;
    if (cloud.x < -180) cloud.x = width + 180;
    for (const block of cloud.blocks) {
      ctx.fillRect(Math.round(cloud.x + block.dx), Math.round(cloud.y + block.dy), block.size, block.size);
    }
  }
}

function drawFog(dtSeconds, parallaxOffset) {
  ctx.fillStyle = 'rgba(120, 150, 145, 0.10)';
  for (const fog of fogBanks) {
    fog.x -= fog.speed * dtSeconds;
    if (fog.x < -200) fog.x = width + 200;
    for (const block of fog.blocks) {
      const px = Math.round(fog.x + block.dx + Math.sin(parallaxOffset * 0.04) * 6);
      const py = Math.round(fog.y + block.dy);
      ctx.fillRect(px, py, block.size, block.size);
    }
  }
}

function drawParticles(dtSeconds, timestamp) {
  for (const particle of particles) {
    particle.y -= particle.speed * dtSeconds;
    particle.x += particle.drift * dtSeconds;
    if (particle.y < -4) {
      particle.y = height + 4;
      particle.x = Math.random() * width;
    }
    const twinkle = 0.25 + 0.25 * Math.sin(timestamp / 700 + particle.twinklePhase);
    ctx.fillStyle = particle.warm
      ? `rgba(244, 208, 130, ${twinkle.toFixed(2)})`
      : `rgba(241, 250, 238, ${twinkle.toFixed(2)})`;
    ctx.fillRect(Math.round(particle.x), Math.round(particle.y), particle.size, particle.size);
  }
}

function drawVignette() {
  const vignette = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.28,
    width / 2, height / 2, Math.max(width, height) * 0.7
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function draw(timestamp) {
  if (lastTimestamp === null) lastTimestamp = timestamp;
  const dtMs = Math.min(timestamp - lastTimestamp, 100);
  const dtSeconds = dtMs / 1000;
  lastTimestamp = timestamp;

  farParallax += dtSeconds * 1.2;
  midParallax += dtSeconds * 2.4;

  drawSky();
  drawMoon(timestamp);
  drawClouds(dtSeconds);

  drawSkylineLayer(farSkyline, farParallax);
  drawWindowLights(farWindows, farParallax, timestamp);

  drawSkylineLayer(midSkyline, midParallax);
  drawWindowLights(midWindows, midParallax, timestamp);
  drawNeonSigns(dtMs);

  drawFog(dtSeconds, midParallax);
  drawStreet();
  drawStreetLamps(dtMs);

  drawParticles(dtSeconds, timestamp);
  drawVignette();

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);
