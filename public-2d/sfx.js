// ============================================================
// PUBLIC-2D/SFX.JS — Short sound effects
// ============================================================
// Separate from audio.js on purpose: audio.js owns one persistent,
// looping music track that must survive across screens without
// restarting; SFX are short one-shots fired on demand (hover/click)
// where a fresh Audio instance per play is fine and simpler.
//
// Same graceful-missing-file behavior as audio.js — no SFX files
// ship with this phase (see the asset notes in the project
// deliverables), so every play() failure is caught and ignored
// rather than breaking menu interactivity.
// ============================================================

const SFX_PATHS = {
  hover: 'assets/audio/sfx/hover.mp3',
  click: 'assets/audio/sfx/click.mp3',
};

function playSfx(name) {
  const path = SFX_PATHS[name];
  if (!path) return;

  const sound = new Audio(path);
  sound.volume = 0.35;
  const playPromise = sound.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      /* missing file or autoplay policy — ignore */
    });
  }
}

export { playSfx };
