// ============================================================
// PUBLIC-2D/SOCKET.JS — Shared Socket.io connection
// ============================================================
// A single connection to the '/2d' namespace, shared by lobby.js
// (room create/join, lobby roster) and network.js (movement input/
// state). Both need the same socket — creating two separate
// connections would give the server two different socket ids for
// what the player experiences as one client, breaking room
// membership. This module exists solely so there's exactly one
// `io('/2d')` call in the whole client codebase.
// ============================================================

// socket.io.js is loaded as a plain script in index.html (served
// automatically by the socket.io server), so `io` is a global here.
const socket = io('/2d');

export default socket;
