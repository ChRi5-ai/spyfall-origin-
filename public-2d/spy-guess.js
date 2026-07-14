// ============================================================
// PUBLIC-2D/SPY-GUESS.JS — Eliminated spy's location guess
// ============================================================
// Only ever receives 'spyGuessPrompt' if this client IS the
// eliminated spy — the server sends it to that one socket id
// privately (see server/movement-network.js). No other client has
// any way to trigger or see this panel.
// ============================================================

import socket from './socket.js';

const eliminationPanelEl = document.getElementById('elimination-panel');
const spyGuessPanelEl = document.getElementById('spy-guess-panel');
const spyGuessOptionsEl = document.getElementById('spy-guess-options');
const spyGuessStatusEl = document.getElementById('spy-guess-status');

let hasGuessed = false;

socket.on('spyGuessPrompt', ({ locations }) => {
  hasGuessed = false;
  spyGuessStatusEl.textContent = '';
  spyGuessOptionsEl.innerHTML = '';

  for (const location of locations) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = location;
    btn.addEventListener('click', () => {
      if (hasGuessed) return;
      socket.emit('submitSpyGuess', { location }, (res) => {
        if (res?.error) {
          spyGuessStatusEl.textContent = res.error;
          return;
        }
        hasGuessed = true;
        spyGuessStatusEl.textContent = res.correct ? 'Correct!' : 'Incorrect.';
        for (const optionBtn of spyGuessOptionsEl.children) {
          optionBtn.disabled = true;
        }
      });
    });
    spyGuessOptionsEl.appendChild(btn);
  }

  // The elimination reveal already told everyone (including the spy)
  // who was eliminated; this panel replaces it for the spy only.
  eliminationPanelEl.classList.add('hidden');
  spyGuessPanelEl.classList.remove('hidden');
});

socket.on('returnToLobby', () => {
  spyGuessPanelEl.classList.add('hidden');
});
