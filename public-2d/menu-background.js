// ============================================================
// PUBLIC-2D/MENU-BACKGROUND.JS — Main menu animated backdrop
// ============================================================
// Draws the persistent, looping pixel-art background behind the
// main menu: drifting fog, floating particles, slow-moving shadow
// shapes, faint moonlight rays, a soft vignette, and occasional
// gentle light flickers.
//
// PHASE 10.5: this file (previously opening-background.js) now
// serves the main menu exclusively — its drawing logic is completely
// unchanged from the Phase 10.3 version; only this comment and the
// filename changed, to reflect that the opening screen now has its
// own separate scene and canvas (see opening-scene.js), rather than
// the two sharing one canvas. That sharing was the root cause of an
// earlier redesign accidentally changing the menu's background too —
// this file's actual content is untouched from before that happened.
//
// Renders onto the persistent, page-level #background-canvas so the
// animation continues unbroken for as long as the main menu is
// showing — it never restarts or flickers due to menu interactions
// like opening/closing the Tutorial or Settings popups.
// ============================================================

const canvas = document.getElementById('background-canvas');
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
// Fog — blocky, slow-drifting mist. Same "clusters of squares"
// technique as before, retuned darker/slower/larger for a mistier
// feel rather than a daytime cloud feel.
// ------------------------------------------------------------
function makeFogBank(seedX, seedY) {
  const blockSize = 14;
  const blocks = [];
  const blockCount = 6 + Math.floor(Math.random() * 5);
  for (let i = 0; i < blockCount; i++) {
    blocks.push({
      dx: (Math.random() - 0.5) * 110,
      dy: (Math.random() - 0.5) * 26,
      size: blockSize + Math.random() * blockSize,
    });
  }
  return {
    x: seedX,
    y: seedY,
    speed: 2 + Math.random() * 3, // slower than before — mist drifts, doesn't scud
    blocks,
  };
}

// ------------------------------------------------------------
// Shadows — larger, darker, even slower blocky shapes that pass
// behind the fog and particles, giving a faint sense of depth/motion
// without reading as any particular object.
// ------------------------------------------------------------
function makeShadow(seedX, seedY) {
  const blockSize = 26;
  const blocks = [];
  const blockCount = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < blockCount; i++) {
    blocks.push({
      dx: (Math.random() - 0.5) * 160,
      dy: (Math.random() - 0.5) * 40,
      size: blockSize + Math.random() * blockSize,
    });
  }
  return {
    x: seedX,
    y: seedY,
    speed: 1 + Math.random() * 1.5,
    blocks,
  };
}

function makeParticle() {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    size: 1 + Math.random() * 2,
    speed: 3 + Math.random() * 6,
    drift: (Math.random() - 0.5) * 6,
    twinklePhase: Math.random() * Math.PI * 2,
  };
}

// Faint diagonal moonlight beams — a handful of very low-opacity
// gradient bands, not full-screen, so they read as light falling
// through something rather than a lighting effect layered on top.
function makeLightRay(index, total) {
  return {
    baseX: (width / (total + 1)) * (index + 1),
    width: 60 + Math.random() * 40,
    swayPhase: Math.random() * Math.PI * 2,
    swaySpeed: 0.05 + Math.random() * 0.05,
  };
}

const fogBanks = Array.from({ length: 5 }, () =>
  makeFogBank(Math.random() * width, height * 0.15 + Math.random() * height * 0.45)
);
const shadows = Array.from({ length: 3 }, () =>
  makeShadow(Math.random() * width, height * 0.35 + Math.random() * height * 0.4)
);
const particles = Array.from({ length: 70 }, makeParticle);
const lightRays = Array.from({ length: 3 }, (_, i) => makeLightRay(i, 3));

let lastTimestamp = null;
let parallaxOffset = 0;

// Occasional soft flicker: most of the time this sits at 0 (no
// effect). Rarely, it ramps briefly up and back down, giving the
// light rays and particles a gentle "candle/moonlight" pulse rather
// than a constant glow.
let flickerIntensity = 0;
let nextFlickerAt = 3000 + Math.random() * 6000;
let flickerElapsed = 0;

function updateFlicker(dtMs) {
  flickerElapsed += dtMs;
  if (flickerElapsed >= nextFlickerAt) {
    flickerElapsed = 0;
    nextFlickerAt = 4000 + Math.random() * 7000;
    flickerIntensity = 1;
  }
  if (flickerIntensity > 0) {
    flickerIntensity = Math.max(0, flickerIntensity - dtMs / 900);
  }
}

function draw(timestamp) {
  if (lastTimestamp === null) lastTimestamp = timestamp;
  const dtMs = Math.min(timestamp - lastTimestamp, 100);
  const dtSeconds = dtMs / 1000;
  lastTimestamp = timestamp;

  parallaxOffset += dtSeconds * 2;
  updateFlicker(dtMs);

  // Darker base atmosphere than before.
  ctx.fillStyle = '#070d0a';
  ctx.fillRect(0, 0, width, height);

  // --- Moonlight rays (drawn early, so fog/particles pass in front) ---
  for (const ray of lightRays) {
    const sway = Math.sin(parallaxOffset * ray.swaySpeed + ray.swayPhase) * 30;
    const x = ray.baseX + sway;
    const gradient = ctx.createLinearGradient(x - ray.width / 2, 0, x + ray.width / 2, 0);
    const baseAlpha = 0.05 + flickerIntensity * 0.05;
    gradient.addColorStop(0, 'rgba(241, 250, 238, 0)');
    gradient.addColorStop(0.5, `rgba(241, 250, 238, ${baseAlpha.toFixed(3)})`);
    gradient.addColorStop(1, 'rgba(241, 250, 238, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - ray.width / 2, 0, ray.width, height);
  }

  // --- Shadows (slow, large, very faint) ---
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  for (const shadow of shadows) {
    shadow.x -= shadow.speed * dtSeconds;
    if (shadow.x < -220) shadow.x = width + 220;
    for (const block of shadow.blocks) {
      const px = Math.round(shadow.x + block.dx);
      const py = Math.round(shadow.y + block.dy);
      ctx.fillRect(px, py, block.size, block.size);
    }
  }

  // --- Fog (retuned former cloud layer) ---
  ctx.fillStyle = 'rgba(88, 129, 87, 0.12)';
  for (const fog of fogBanks) {
    fog.x -= fog.speed * dtSeconds;
    if (fog.x < -160) fog.x = width + 160;
    for (const block of fog.blocks) {
      const px = Math.round(fog.x + block.dx + Math.sin(parallaxOffset * 0.04) * 5);
      const py = Math.round(fog.y + block.dy);
      ctx.fillRect(px, py, block.size, block.size);
    }
  }

  // --- Particles (more of them, dimmer baseline, gentle twinkle) ---
  for (const particle of particles) {
    particle.y -= particle.speed * dtSeconds;
    particle.x += particle.drift * dtSeconds;
    if (particle.y < -4) {
      particle.y = height + 4;
      particle.x = Math.random() * width;
    }
    const twinkle = 0.25 + 0.2 * Math.sin(timestamp / 700 + particle.twinklePhase) + flickerIntensity * 0.15;
    ctx.fillStyle = `rgba(241, 250, 238, ${Math.max(0, Math.min(1, twinkle)).toFixed(2)})`;
    ctx.fillRect(Math.round(particle.x), Math.round(particle.y), particle.size, particle.size);
  }

  // --- Vignette (soft darkening toward the edges) ---
  const vignette = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.3,
    width / 2, height / 2, Math.max(width, height) * 0.7
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);
