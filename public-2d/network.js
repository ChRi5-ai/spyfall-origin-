// ============================================================
// PUBLIC-2D/NETWORK.JS — Movement networking (client side)
// ============================================================
// Reads input changes from input.js and sends them to the server;
// receives the server's authoritative roster of players in this
// client's current room back and exposes it for canvas.js to render.
// Rendering code never touches the socket directly, and never
// computes anyone's position — including its own.
//
// PHASE 4 CHANGE: now imports the shared socket (socket.js) instead
// of creating its own connection, so lobby.js and network.js are
// guaranteed to be operating as the same socket id server-side. No
// other behavior changed here — the server now only ever includes
// this client in a 'state' broadcast once it has joined a room (see
// server/movement-network.js), so before that, getLatestPlayers()
// simply stays empty.
// ------------------------------------------------------------

import { setOnChange } from './input.js';
import socket from './socket.js';

let latestPlayers = []; // array of { id, name, color, x, y }
let selfId = null;

function getLatestPlayers() {
  return latestPlayers;
}

function getSelfId() {
  return selfId;
}

socket.on('self', ({ id }) => {
  // --- TEMPORARY DIAGNOSTIC LOGGING (remove after debugging) ---
  console.log('[network debug] socket.on(self) fired', { receivedId: id, timestamp: Date.now() });
  if (selfId !== null && selfId !== id) {
    console.warn('[network debug] selfId changed after initial assignment', {
      previousSelfId: selfId,
      newSelfId: id,
      timestamp: Date.now(),
    });
  }
  // --- END TEMPORARY DIAGNOSTIC LOGGING ---
  selfId = id;
});

// --- FIX: race-proof identity request ---
// The server's 'self' push (above) can be missed if this listener
// isn't registered yet at the exact moment it's sent — see
// server/movement-network.js's matching comment. This request/ack
// pair can't suffer that race: it's only sent once this module has
// already executed and is ready to receive the callback, so there's
// no window where the response could arrive before anything is
// listening for it. If 'self' already arrived first, this just
// reconfirms the same id; if 'self' was lost, this is what actually
// sets selfId. Either way, getSelfId() is guaranteed a valid value
// before proximity checks (or anything else depending on it) run.
socket.emit('whoAmI', ({ id }) => {
  // --- TEMPORARY DIAGNOSTIC LOGGING (remove after debugging) ---
  console.log('[network debug] whoAmI response received', { receivedId: id, timestamp: Date.now() });
  // --- END TEMPORARY DIAGNOSTIC LOGGING ---
  selfId = id;
});

socket.on('state', (players) => {
  latestPlayers = players;
});

// Send input to the server only when it changes, not every frame —
// this is the client-side half of keeping network traffic throttled
// (the server-side half is its fixed-rate tick loop). The server
// silently ignores input until this client has joined a room.
setOnChange((inputState) => {
  socket.emit('input', inputState);
});

export { getLatestPlayers, getSelfId };
