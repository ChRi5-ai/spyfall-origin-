// ============================================================
// PUBLIC-2D/INVESTIGATION-LOG.JS — Collapsible question history
// ============================================================
// Shows only conversations this client actually participated in.
// Two sources feed the same local list, both already scoped to just
// this player by the server:
//   1. 'conversationEnded' — arrives live, privately, only to a
//      conversation's two participants (see conversation.js).
//   2. 'getInvestigationLog' — requested once when gameplay begins,
//      to hydrate anything that (in a longer session) might already
//      exist; harmless/empty at the very start of a match.
// Nothing here ever requests or receives another player's history —
// the server's getHistoryForPlayer already filters by socket id
// before this module ever sees a response.
// ============================================================

import socket from './socket.js';

const containerEl = document.getElementById('investigation-log-container');
const toggleBtn = document.getElementById('investigation-log-toggle');
const logPanelEl = document.getElementById('investigation-log-panel');
const logListEl = document.getElementById('investigation-log-list');

let history = [];
let isOpen = false;

function render() {
  logListEl.innerHTML = '';

  if (history.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No conversations yet.';
    logListEl.appendChild(li);
    return;
  }

  // Newest first, so the most recent exchange is easiest to find.
  for (const entry of [...history].reverse()) {
    const li = document.createElement('li');
    li.textContent = `${entry.askerName} asked ${entry.targetName}: "${entry.question}" -> "${entry.answer}"`;
    logListEl.appendChild(li);
  }
}

toggleBtn.addEventListener('click', () => {
  isOpen = !isOpen;
  logPanelEl.classList.toggle('hidden', !isOpen);
  if (isOpen) render();
});

socket.on('conversationEnded', (record) => {
  history.push(record);
  if (isOpen) render();
});

socket.on('returnToLobby', () => {
  history = [];
  isOpen = false;
  logPanelEl.classList.add('hidden');
  containerEl.classList.add('hidden');
});

// Hydrate once gameplay starts. Requested here (rather than at page
// load) since there's no meaningful history before a game exists.
// This is also the only place the log container itself is revealed —
// it must never be visible on the opening screen, main menu, lobby,
// or character selection, only once actual gameplay begins.
socket.on('gameStart', () => {
  containerEl.classList.remove('hidden');
  socket.emit('getInvestigationLog', {}, (res) => {
    if (res?.success) {
      history = res.history;
      if (isOpen) render();
    }
  });
});
