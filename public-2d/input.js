// ============================================================
// PUBLIC-2D/INPUT.JS — Keyboard input capture
// ============================================================
// Owns nothing except "which movement keys are currently held".
// Does not touch the network or the canvas — network.js reads this
// module's state and decides when/whether to send it; canvas.js
// never touches it at all.
//
// WASD and arrow keys are treated as equivalent (both set the same
// logical direction), so either scheme works interchangeably.
// ============================================================

const KEY_MAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

const state = { up: false, down: false, left: false, right: false };

// Called whenever the input state actually changes (not on every
// keystroke — e.g. holding a key generates repeat keydown events in
// most browsers, which we ignore since the direction hasn't changed).
let onChange = null;

function setOnChange(callback) {
  onChange = callback;
}

function updateKey(code, isPressed) {
  const direction = KEY_MAP[code];
  if (!direction) return; // not a movement key, ignore
  if (state[direction] === isPressed) return; // no actual change
  state[direction] = isPressed;
  if (onChange) onChange({ ...state });
}

window.addEventListener('keydown', (e) => updateKey(e.code, true));
window.addEventListener('keyup', (e) => updateKey(e.code, false));

// If the window/tab loses focus while a key is held, the corresponding
// keyup event can be missed, leaving a phantom "stuck" direction. Reset
// on blur so movement always stops cleanly.
window.addEventListener('blur', () => {
  let changed = false;
  for (const dir of Object.keys(state)) {
    if (state[dir]) { state[dir] = false; changed = true; }
  }
  if (changed && onChange) onChange({ ...state });
});

export { setOnChange };
