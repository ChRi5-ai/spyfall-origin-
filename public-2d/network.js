// ============================================================
// PUBLIC-2D/NETWORK.JS — Movement networking (client side)
// ============================================================
// The only module that talks to Socket.io on the client. Reads input
// changes from input.js and sends them to the server; receives the
// server's authoritative position back and exposes it for canvas.js
// to render. Rendering code never touches the socket directly.
//
// Connects on the '/2d' namespace, matching server/movement-network.js
// — this keeps Spyfall 2D traffic completely separate from the
// original game's default-namespace socket events.
// ============================================================

import { setOnChange } from './input.js';

// socket.io.js is loaded as a plain script in index.html (served
// automatically by the socket.io server), so `io` is a global here.
const socket = io('/2d');

// Latest authoritative state received from the server. Starts null
// until the first tick arrives after connecting.
let latestState = null;

function getLatestState() {
  return latestState;
}

socket.on('state', (state) => {
  latestState = state;
});

// Send input to the server only when it changes, not every frame —
// this is the client-side half of keeping network traffic throttled
// (the server-side half is its fixed-rate tick loop).
setOnChange((inputState) => {
  socket.emit('input', inputState);
});

export { getLatestState };
