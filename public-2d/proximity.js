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

// --- TEMPORARY DIAGNOSTIC LOGGING (remove after debugging) ---
// CHECK 5: were the DOM elements actually found at module load time?
console.warn('[proximity debug] DOM element lookup', {
  promptElFound: promptEl !== null,
  chooserElFound: chooserEl !== null,
});

// CHECK 4: watch for anything else in the page toggling the prompt's
// 'hidden' class, so we can tell whether some OTHER piece of code is
// hiding it out from under this module.
if (promptEl && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'class') {
        console.warn('[proximity debug] #interaction-prompt class attribute changed', {
          newClassList: promptEl.className,
          timestamp: Date.now(),
        });
      }
    }
  });
  observer.observe(promptEl, { attributes: true, attributeFilter: ['class'] });
}
// --- END TEMPORARY DIAGNOSTIC LOGGING ---

let suppressed = false; // true while a conversation panel or the conference room is open
let suppressedSince = null; // timestamp suppression started, or null when not suppressed

// PHASE 10.4: the prompt must only ever be active during actual
// gameplay, never in the lobby/character-selection screens — even
// though movement itself is already live at that point (players can
// walk around before the match starts). Starts false; only 'gameStart'
// turns it on, and 'returnToLobby' turns it back off, mirroring the
// exact same lifecycle already used for #call-vote-btn and the
// Investigation Log container.
let matchActive = false;

// Safety ceiling for the self-healing check in refreshPrompt() below.
// Real conversations/votes are always seconds long — this is
// deliberately far longer than any legitimate case, purely a backstop
// against `suppressed` ever being left stuck by some future event gap
// this file didn't anticipate.
const MAX_SUPPRESSION_MS = 120000;

function setSuppressed(value) {
  suppressed = value;
  suppressedSince = value ? Date.now() : null;
}

function distanceBetween(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getNearbyPlayers() {
  const players = getLatestPlayers();
  const selfId = getSelfId();
  const self = players.find((p) => p.id === selfId);

  if (!self) {
    // --- TEMPORARY DIAGNOSTIC LOGGING (remove after debugging) ---
    // Only fires on the specific failure path we're investigating:
    // self could not be matched against the current player list.
    console.warn('[proximity debug] self not found in latestPlayers', {
      selfId,
      playerIds: players.map((p) => p.id),
      selfIdPresentInPlayers: players.some((p) => p.id === selfId),
      playerCount: players.length,
      timestamp: Date.now(),
    });
    // --- END TEMPORARY DIAGNOSTIC LOGGING ---
    return [];
  }

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
  if (!matchActive) {
    hidePrompt();
    return;
  }

  // Safety check: if we've been suppressed for far longer than any
  // real conversation or vote could plausibly take, something failed
  // to clear it — self-heal rather than staying stuck for the rest
  // of the match. This is a backstop, not the primary mechanism; the
  // explicit event listeners below are what normally clear it.
  if (suppressed && suppressedSince !== null && Date.now() - suppressedSince > MAX_SUPPRESSION_MS) {
    setSuppressed(false);
  }

  if (suppressed) {
    hidePrompt();
    return;
  }

  const nearby = getNearbyPlayers();

  // --- TEMPORARY DIAGNOSTIC LOGGING (remove after debugging) ---
  // CHECK 2: is getNearbyPlayers() returning empty every single time?
  console.warn('[proximity debug] nearby result', {
    nearbyCount: nearby.length,
    nearbyIds: nearby.map((p) => p.id),
  });
  // --- END TEMPORARY DIAGNOSTIC LOGGING ---

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
  if (e.code !== 'KeyE' || suppressed || !matchActive) return;

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
  setSuppressed(true);
  hidePrompt();
});
socket.on('conversationEnded', () => {
  setSuppressed(false);
});
socket.on('conversationCancelled', () => {
  setSuppressed(false);
});

// Movement is paused server-side for the whole conference/elimination/
// results sequence (see movement-network.js's tick loop), so there's
// nothing meaningful to interact with during it — suppress the prompt
// for the same duration rather than showing a hint that would always
// be rejected if acted on.
socket.on('conferenceStart', () => {
  setSuppressed(true);
  hidePrompt();
});

// Clears suppression once a vote resolves — covers both outcomes:
// a tie (discussion/movement resume, so questioning should too) and
// a determined elimination (the match ends, so nothing further would
// happen regardless, but there's no reason to leave this stuck either).
socket.on('conferenceResult', () => {
  setSuppressed(false);
});

socket.on('returnToLobby', () => {
  setSuppressed(false);
  matchActive = false;
  hidePrompt();
});

socket.on('gameStart', () => {
  matchActive = true;
});
