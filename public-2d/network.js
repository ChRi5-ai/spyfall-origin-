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
