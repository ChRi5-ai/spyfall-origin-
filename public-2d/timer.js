// ============================================================
// PUBLIC-2D/TIMER.JS — Discussion timer display (client side)
// ============================================================
// Purely a display. Renders a local countdown derived from the
// server's absolute `endsAt` timestamp (see server/game-timer.js) —
// recomputing remaining time from that fixed point every tick, rather
// than counting down an initial duration locally, keeps the display
// self-correcting against client/network latency instead of drifting.
// The actual phase transition when time runs out is entirely
// server-driven ('timerEnd'); this module only reacts to it.
// ============================================================

import socket from './socket.js';

const timerEl = document.getElementById('gameplay-timer');

let intervalHandle = null;

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

socket.on('timerStart', ({ endsAt }) => {
  if (intervalHandle) clearInterval(intervalHandle);

  function tick() {
    const remainingMs = endsAt - Date.now();
    if (remainingMs <= 0) {
      timerEl.textContent = '0:00';
      clearInterval(intervalHandle);
      intervalHandle = null;
      return;
    }
    timerEl.textContent = formatRemaining(remainingMs);
  }

  tick();
  intervalHandle = setInterval(tick, 250);
});

socket.on('timerEnd', () => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  timerEl.textContent = 'Discussion ended';
});
