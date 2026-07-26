// ============================================================
// PUBLIC-2D/LOBBY.JS — Room create/join UI and state
// ============================================================
// Handles the pre-game lobby: creating a party, joining one by code,
// and displaying room code / host / player cards once inside. Talks
// to the server via the shared socket (socket.js) and owns its own
// slice of DOM directly.
//
// Deliberately does NOT touch movement or rendering — network.js and
// canvas.js are unaffected by anything in this file, aside from both
// now only receiving meaningful 'state' events once a room exists
// server-side (see server/movement-network.js).
//
// PHASE 10.4: player list rendered as premium cards (animated idle
// sprite, codename, ready badge, host badge); added the Ready/Not
// Ready toggle; Start Match now also gated on `lobby.allReady`
// (server-computed, same pattern as `allSelected`) alongside
// character selection.
// ============================================================

import socket from './socket.js';
import { drawSpriteFrame, getSheet, ROW } from './sprites.js';

let selfId = null;

const lobbyEntryEl = document.getElementById('lobby-entry');
const roomInfoEl = document.getElementById('room-info');
const characterPanelEl = document.getElementById('character-panel');
const settingsPanelEl = document.getElementById('settings-panel');
const gameRootEl = document.getElementById('game-root');

const createBtn = document.getElementById('create-room-btn');
const joinBtn = document.getElementById('join-room-btn');
const joinCodeInput = document.getElementById('join-code-input');
const codenameInput = document.getElementById('codename-input');
const errorEl = document.getElementById('lobby-error');

const roomCodeDisplayEl = document.getElementById('room-code-display');
const hostIndicatorEl = document.getElementById('host-indicator');
const playerCountEl = document.getElementById('player-count');
const playerListEl = document.getElementById('player-list');
const readyBtn = document.getElementById('ready-btn');
const startBtn = document.getElementById('start-game-btn');
const startMessageEl = document.getElementById('start-message');
const createSpinner = document.getElementById('create-room-spinner');
const joinSpinner = document.getElementById('join-room-spinner');

const CARD_PREVIEW_SIZE = 48; // native sprite resolution, scaled via CSS for crisp pixels

// Animated idle preview: every card canvas currently on screen cycles
// through the 4 idle-down frames together on one shared interval,
// rather than each card running its own timer.
const activeCardCanvases = []; // { ctx, characterId }
let idleFrameIndex = 0;
setInterval(() => {
  idleFrameIndex = (idleFrameIndex + 1) % 4;
  for (const card of activeCardCanvases) {
    const img = getSheet(card.characterId);
    if (img.complete && img.naturalWidth > 0) {
      card.ctx.clearRect(0, 0, CARD_PREVIEW_SIZE, CARD_PREVIEW_SIZE);
    }
    drawSpriteFrame(card.ctx, card.characterId, ROW.idleDown, idleFrameIndex, 0, 0, CARD_PREVIEW_SIZE);
  }
}, 220);

// Mirrors the server's own 3–16 character rule (server/movement-network.js)
// purely so the player gets immediate feedback — the server remains
// the sole authority and re-validates independently regardless.
function getValidatedCodename() {
  const value = codenameInput.value.trim();
  if (value.length < 3 || value.length > 16) return null;
  return value;
}

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
  hostIndicatorEl.textContent = isSelfHost ? 'You are the host' : 'Waiting for host';

  playerListEl.innerHTML = '';
  activeCardCanvases.length = 0;

  for (const player of lobby.players) {
    const card = document.createElement('li');
    card.className = 'player-card';
    if (player.id === selfId) card.classList.add('player-card-self');

    const previewWrap = document.createElement('div');
    previewWrap.className = 'player-card-preview';
    if (player.characterId) {
      const canvas = document.createElement('canvas');
      canvas.width = CARD_PREVIEW_SIZE;
      canvas.height = CARD_PREVIEW_SIZE;
      canvas.className = 'player-card-sprite';
      const ctx = canvas.getContext('2d');
      drawSpriteFrame(ctx, player.characterId, ROW.idleDown, 0, 0, 0, CARD_PREVIEW_SIZE);
      getSheet(player.characterId).addEventListener(
        'load',
        () => drawSpriteFrame(ctx, player.characterId, ROW.idleDown, 0, 0, 0, CARD_PREVIEW_SIZE),
        { once: true }
      );
      activeCardCanvases.push({ ctx, characterId: player.characterId });
      previewWrap.appendChild(canvas);
    } else {
      previewWrap.classList.add('player-card-preview-empty');
      previewWrap.textContent = '?';
    }
    card.appendChild(previewWrap);

    const infoWrap = document.createElement('div');
    infoWrap.className = 'player-card-info';

    const nameRow = document.createElement('div');
    nameRow.className = 'player-card-name-row';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'player-card-name';
    nameSpan.textContent = player.name;
    nameRow.appendChild(nameSpan);
    if (player.id === lobby.hostId) {
      const hostBadge = document.createElement('span');
      hostBadge.className = 'host-badge';
      hostBadge.textContent = 'HOST';
      nameRow.appendChild(hostBadge);
    }
    infoWrap.appendChild(nameRow);

    const readyBadge = document.createElement('span');
    readyBadge.className = player.ready ? 'ready-badge ready-badge-ready' : 'ready-badge ready-badge-not-ready';
    readyBadge.innerHTML = player.ready ? '<span class="ready-check">&check;</span> Ready' : 'Not Ready';
    infoWrap.appendChild(readyBadge);

    card.appendChild(infoWrap);
    playerListEl.appendChild(card);
  }

  renderReadyControl(lobby);
  renderStartControl(lobby, isSelfHost);
}

function renderReadyControl(lobby) {
  const self = lobby.players.find((p) => p.id === selfId);
  const isReady = !!self?.ready;
  readyBtn.textContent = isReady ? 'Not Ready' : 'Ready';
  readyBtn.classList.toggle('ready-btn-active', isReady);
}

// Start Match is visible only to the host, and its enabled/disabled
// state is driven entirely by `lobby.allSelected` and `lobby.allReady`,
// both server-computed (see server/movement-network.js). This
// function never decides readiness itself — it only reflects what the
// server already validated.
function renderStartControl(lobby, isSelfHost) {
  if (!isSelfHost) {
    startBtn.classList.add('hidden');
    startMessageEl.classList.add('hidden');
    return;
  }

  startBtn.classList.remove('hidden');
  startMessageEl.classList.remove('hidden');

  const canStart = lobby.allSelected && lobby.allReady;
  startBtn.disabled = !canStart;
  startBtn.classList.toggle('start-btn-glow', canStart);

  if (canStart) {
    startMessageEl.textContent = '';
  } else if (!lobby.allSelected) {
    startMessageEl.textContent = 'Start Match is disabled until every connected player has selected a character.';
  } else {
    startMessageEl.textContent = 'Start Match is disabled until every connected player is Ready.';
  }
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

readyBtn.addEventListener('click', () => {
  socket.emit('toggleReady', {}, (res) => {
    if (res?.error) showError(res.error);
  });
});

createBtn.addEventListener('click', () => {
  clearError();
  const codename = getValidatedCodename();
  if (!codename) {
    showError('Enter a codename (3–16 characters).');
    return;
  }
  createSpinner.classList.remove('hidden');
  createBtn.disabled = true;
  socket.emit('createRoom', { codename }, (res) => {
    createSpinner.classList.add('hidden');
    createBtn.disabled = false;
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
  const codename = getValidatedCodename();
  if (!codename) {
    showError('Enter a codename (3–16 characters).');
    return;
  }
  joinSpinner.classList.remove('hidden');
  joinBtn.disabled = true;
  socket.emit('joinRoom', { code, codename }, (res) => {
    joinSpinner.classList.add('hidden');
    joinBtn.disabled = false;
    if (res?.error) showError(res.error);
  });
});

// Convenience: pressing Enter in the code field joins, same as
// clicking the Join button.
joinCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});
