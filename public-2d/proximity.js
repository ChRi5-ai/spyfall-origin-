// ============================================================
// PUBLIC-2D/PROXIMITY.JS — Interaction prompt (client side)
// ============================================================
// Purely a UI convenience: watches this client's own position against
// every other player's (both already available from network.js) and
// shows "Press E to Question <name>" when someone is close enough,
// or a small chooser if multiple players are nearby. Pressing E just
// asks the server via 'requestConversation' — this module never
// decides whether a conversation is actually allowed to start; that
// distance check happens again, authoritatively, server-side (see
// server/movement-network.js + server/proximity.js). If the client
// were tampered with to always show the prompt, the server would
// simply reject an out-of-range request.
//
// Suppresses itself while a conversation is open, by listening for
// the same 'conversationStarted' / 'conversationEnded' /
// 'conversationCancelled' events conversation.js reacts to — kept
// independent rather than importing from conversation.js, matching
// how other lobby-era modules (lobby.js, characters.js, settings.js)
// each independently listen to the same 'lobby' event rather than
// calling into one another.
// ============================================================

import socket from './socket.js';
import { getLatestPlayers, getSelfId } from './network.js';

// Mirrors server/proximity.js's INTERACTION_DISTANCE purely for
// deciding when to show the prompt — the server re-checks distance
// independently and is the only thing that actually enforces it.
const INTERACTION_DISTANCE = 70;

const promptEl = document.getElementById('interaction-prompt');
const chooserEl = document.getElementById('interaction-chooser');

let suppressed = false; // true while a conversation panel is open

function distanceBetween(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getNearbyPlayers() {
  const players = getLatestPlayers();
  const selfId = getSelfId();
  const self = players.find((p) => p.id === selfId);
  if (!self) return [];
  return players.filter((p) => p.id !== selfId && distanceBetween(self, p) <= INTERACTION_DISTANCE);
}

function hidePrompt() {
  promptEl.classList.add('hidden');
  chooserEl.classList.add('hidden');
}

function requestConversationWith(targetId) {
  socket.emit('requestConversation', { targetId }, (res) => {
    if (res?.error) {
      promptEl.textContent = res.error;
      promptEl.classList.remove('hidden');
    }
  });
}

function refreshPrompt() {
  if (suppressed) {
    hidePrompt();
    return;
  }

  const nearby = getNearbyPlayers();
  if (nearby.length === 0) {
    hidePrompt();
  } else if (nearby.length === 1) {
    promptEl.textContent = `Press E to Question ${nearby[0].name}`;
    promptEl.classList.remove('hidden');
    chooserEl.classList.add('hidden');
  } else {
    promptEl.textContent = 'Press E to Question — multiple players nearby';
    promptEl.classList.remove('hidden');
    chooserEl.classList.add('hidden');
  }
}

// Polling rather than hooking into the render loop directly — this
// module doesn't need canvas.js's frame timing, just a reasonably
// responsive check. 150ms feels instant to a player without adding
// meaningful overhead.
setInterval(refreshPrompt, 150);

window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyE' || suppressed) return;

  const nearby = getNearbyPlayers();
  if (nearby.length === 0) return;

  if (nearby.length === 1) {
    requestConversationWith(nearby[0].id);
    return;
  }

  // Multiple nearby — let the player choose who to question.
  chooserEl.innerHTML = '';
  for (const player of nearby) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = player.name;
    btn.addEventListener('click', () => {
      chooserEl.classList.add('hidden');
      requestConversationWith(player.id);
    });
    chooserEl.appendChild(btn);
  }
  chooserEl.classList.remove('hidden');
});

socket.on('conversationStarted', () => {
  suppressed = true;
  hidePrompt();
});
socket.on('conversationEnded', () => {
  suppressed = false;
});
socket.on('conversationCancelled', () => {
  suppressed = false;
});
