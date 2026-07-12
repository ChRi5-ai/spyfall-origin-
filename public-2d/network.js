// ============================================================
// PUBLIC-2D/NETWORK.JS — Movement networking (client side)
// ============================================================
// The only module that talks to Socket.io on the client. Reads input
// changes from input.js and sends them to the server; receives the
// server's authoritative roster of all players back and exposes it
// for canvas.js to render. Rendering code never touches the socket
// directly, and never computes anyone's position — including its own.
//
// Connects on the '/2d' namespace, matching server/movement-network.js
// — this keeps Spyfall 2D traffic completely separate from the
// original game's default-namespace socket events.
//
// PHASE 3 CHANGE: `latestState` used to be a single player's position.
// It's now an array of every connected player's { id, name, color, x, y },
// broadcast by the server each tick. This module doesn't distinguish
// "self" from "others" — it just exposes what the server sent — but it
// does track this client's own socket id, since the server tells it
// via a one-time 'self' event, for canvas.js (or later phases) to use.
// ------------------------------------------------------------

import { setOnChange } from './input.js';

// socket.io.js is loaded as a plain script in index.html (served
// automatically by the socket.io server), so `io` is a global here.
const socket = io('/2d');

let latestPlayers = []; // array of { id, name, color, x, y }
let selfId = null;

function getLatestPlayers() {
  return latestPlayers;
}

function getSelfId() {
  return selfId;
}

socket.on('self', ({ id }) => {
  selfId = id;
});

socket.on('state', (players) => {
  latestPlayers = players;
});

// Send input to the server only when it changes, not every frame —
// this is the client-side half of keeping network traffic throttled
// (the server-side half is its fixed-rate tick loop).
setOnChange((inputState) => {
  socket.emit('input', inputState);
});

export { getLatestPlayers, getSelfId };
