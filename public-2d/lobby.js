// ============================================================
// PUBLIC-2D/LOBBY.JS — Room create/join UI and state
// ============================================================
// Handles the pre-game lobby: creating a party, joining one by code,
// and displaying room code / host / player list once inside. Talks
// to the server via the shared socket (socket.js) and owns its own
// small slice of DOM (the entry screen and room-info panel) directly,
// since Phase 4 doesn't warrant pulling in a UI framework for two
// small panels.
//
// Deliberately does NOT touch movement or rendering — network.js and
// canvas.js are unaffected by anything in this file, aside from both
// now only receiving meaningful 'state' events once a room exists
// server-side (see server/movement-network.js).
// ============================================================

import socket from './socket.js';

let selfId = null;

const lobbyEntryEl = document.getElementById('lobby-entry');
const roomInfoEl = document.getElementById('room-info');
const characterPanelEl = document.getElementById('character-panel');
const settingsPanelEl = document.getElementById('settings-panel');
const gameRootEl = document.getElementById('game-root');

const createBtn = document.getElementById('create-room-btn');
const joinBtn = document.getElementById('join-room-btn');
const joinCodeInput = document.getElementById('join-code-input');
const errorEl = document.getElementById('lobby-error');

const roomCodeDisplayEl = document.getElementById('room-code-display');
const hostIndicatorEl = document.getElementById('host-indicator');
const playerCountEl = document.getElementById('player-count');
const playerListEl = document.getElementById('player-list');
const startBtn = document.getElementById('start-game-btn');
const startMessageEl = document.getElementById('start-message');

function showError(message) {
  errorEl.textContent = message;
}

function clearError() {
  errorEl.textContent = '';
}

// Switches from the create/join entry screen to the in-room view
// (room info panel + the movement canvas underneath it).
function enterRoomView() {
  lobbyEntryEl.classList.add('hidden');
  roomInfoEl.classList.remove('hidden');
  characterPanelEl.classList.remove('hidden');
  settingsPanelEl.classList.remove('hidden');
  gameRootEl.classList.remove('hidden');
}

// Renders the room-info panel from a 'lobby' snapshot broadcast by
// the server. Kept as one small render function rather than diffing
// individual DOM nodes — the player list is tiny, so a full re-render
// on every lobby change is simple and cheap.
function renderLobby(lobby) {
  roomCodeDisplayEl.textContent = lobby.code;
  playerCountEl.textContent = `${lobby.count} player${lobby.count === 1 ? '' : 's'} connected`;

  const isSelfHost = lobby.hostId === selfId;
  hostIndicatorEl.textContent = isSelfHost ? "You are the host" : 'Waiting for host';

  playerListEl.innerHTML = '';
  for (const player of lobby.players) {
    const li = document.createElement('li');
    // Character is shown as its fixed number, matching the label
    // used on the character grid itself (see characters.js) — or
    // "Not Selected" if this player hasn't picked one yet. Character
    // *ownership* itself is still decided entirely server-side; this
    // is read-only display of what the server already reported.
    const characterLabel = player.characterId
      ? `Character ${player.characterId.replace('char-', '')}`
      : 'Not Selected';
    li.textContent = `${player.name} — ${characterLabel}`;
    if (player.id === lobby.hostId) {
      li.textContent += ' (host)';
      li.classList.add('host-entry');
    }
    if (player.id === selfId) {
      li.textContent += ' (you)';
    }
    playerListEl.appendChild(li);
  }

  renderStartControl(lobby, isSelfHost);
}

// Start Game is visible only to the host, and its enabled/disabled
// state is driven entirely by `lobby.allSelected`, which the server
// computed (see server/movement-network.js -> characters.js). This
// function never decides readiness itself — it only reflects what
// the server already validated, and clicking it (once truly wired up
// in a later phase) would still need the server to accept or reject
// the actual start, the same way character selection already works.
function renderStartControl(lobby, isSelfHost) {
  if (!isSelfHost) {
    startBtn.classList.add('hidden');
    startMessageEl.classList.add('hidden');
    return;
  }

  startBtn.classList.remove('hidden');
  startMessageEl.classList.remove('hidden');
  startBtn.disabled = !lobby.allSelected;
  startMessageEl.textContent = lobby.allSelected
    ? ''
    : 'Start Game is disabled until every connected player has selected a character.';
}

socket.on('self', ({ id }) => {
  selfId = id;
});

socket.on('lobby', (lobby) => {
  clearError();
  // Once the game has started, game-start.js owns the view — this
  // final 'lobby' broadcast (sent alongside 'gameStart' purely so
  // `started: true` is reflected everywhere) should not re-reveal the
  // lobby panels game-start.js just hid.
  if (lobby.started) return;
  enterRoomView();
  renderLobby(lobby);
});

createBtn.addEventListener('click', () => {
  clearError();
  socket.emit('createRoom', {}, (res) => {
    if (res?.error) showError(res.error);
  });
});

joinBtn.addEventListener('click', () => {
  clearError();
  const code = joinCodeInput.value;
  if (!code || !code.trim()) {
    showError('Enter a room code.');
    return;
  }
  socket.emit('joinRoom', { code }, (res) => {
    if (res?.error) showError(res.error);
  });
});

// Convenience: pressing Enter in the code field joins, same as
// clicking the Join button.
joinCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});
