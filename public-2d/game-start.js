// ============================================================
// PUBLIC-2D/GAME-START.JS — Start Game wiring (client side)
// ============================================================
// This is the ONLY new behavior added to the existing Start Game
// button (#start-game-btn) from Phase 5 — lobby.js still owns
// showing/hiding it and setting its disabled state from
// `lobby.allSelected`; this module only adds the click handler that
// actually requests a start, and reacts to the server's 'gameStart'
// broadcast by transitioning every client out of the lobby at once.
//
// Deliberately stops at "hide the lobby, show which map and timer
// were chosen." No gameplay, no role assignment — that's a later
// phase, built on top of the 'gameStart' event this module listens
// for.
// ============================================================

import socket from './socket.js';

const startBtn = document.getElementById('start-game-btn');
const startMessageEl = document.getElementById('start-message');

const lobbyEntryEl = document.getElementById('lobby-entry');
const roomInfoEl = document.getElementById('room-info');
const characterPanelEl = document.getElementById('character-panel');
const settingsPanelEl = document.getElementById('settings-panel');

const gameplayPanelEl = document.getElementById('gameplay-panel');
const gameplayMapEl = document.getElementById('gameplay-map');
const gameplayTimerEl = document.getElementById('gameplay-timer');

startBtn.addEventListener('click', () => {
  socket.emit('startGame', {}, (res) => {
    if (res?.error) {
      // Surface a rejection the same place settings/character errors
      // show up — the button's disabled state should normally prevent
      // this, but the server is still the real authority, so a
      // rejection here is expected to be handled gracefully, not
      // treated as impossible.
      startMessageEl.textContent = res.error;
      startMessageEl.classList.remove('hidden');
    }
  });
});

// All clients — host and non-host alike — receive this at the same
// time, which is what makes the transition simultaneous rather than
// each player finding out independently via a lobby poll.
socket.on('gameStart', ({ map, timerMinutes }) => {
  lobbyEntryEl.classList.add('hidden');
  roomInfoEl.classList.add('hidden');
  characterPanelEl.classList.add('hidden');
  settingsPanelEl.classList.add('hidden');

  gameplayMapEl.textContent = map;
  gameplayTimerEl.textContent = `${timerMinutes} minutes`;
  gameplayPanelEl.classList.remove('hidden');

  // The movement canvas (network.js/canvas.js) keeps running exactly
  // as it already does — nothing here touches movement. This is only
  // a UI-mode switch, not a rewrite of how players move or render.
});
