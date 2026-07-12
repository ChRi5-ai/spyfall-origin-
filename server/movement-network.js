// ============================================================
// SERVER/MOVEMENT-NETWORK.JS — Movement networking for Spyfall 2D
// ============================================================
// Wires the movement module (pure position math) up to Socket.io.
// Kept separate from movement.js so movement math stays testable in
// isolation, and separate from server.js so the original Spyfall
// socket handlers (createRoom, joinRoom, startGame, etc.) are never
// touched by anything happening here.
//
// Runs on its own Socket.io namespace, '/2d', rather than the default
// namespace the original game uses. This means:
//   - A 2D client connecting does NOT create/join a Spyfall room.
//   - Original game events and 2D movement events can never collide,
//     even though they share the same underlying HTTP server.
//
// Architecture note: this currently tracks one player per socket with
// no concept of "rooms" (in the Spyfall sense) — every connected
// client is simulated independently and only ever receives their own
// position back. Phase 2 explicitly excludes multiplayer avatars, so
// there is no broadcast to other clients yet. When that's added
// (a later phase), the natural extension is to broadcast each
// namespace-wide tick to all connected sockets instead of emitting
// only to the originating socket — the tick loop and player store
// below are already structured to make that a small change.
// ------------------------------------------------------------

const { createPlayerState, stepPlayer, sanitizeInput } = require('./movement');

const TICK_RATE_HZ = 30;
const TICK_MS = 1000 / TICK_RATE_HZ;

function attachMovementNetworking(io) {
  const movementNamespace = io.of('/2d');

  // socket.id -> player state (see movement.js for shape)
  const players = {};

  movementNamespace.on('connection', (socket) => {
    const name = `Player-${socket.id.slice(0, 4)}`;
    players[socket.id] = createPlayerState(name);

    // --- RECEIVE INPUT ---
    // Clients send which keys are currently held, NOT a position.
    // The server is the only thing that ever computes position.
    socket.on('input', (rawInput) => {
      const player = players[socket.id];
      if (!player) return;
      player.input = sanitizeInput(rawInput);
    });

    socket.on('disconnect', () => {
      delete players[socket.id];
    });
  });

  // --- AUTHORITATIVE TICK LOOP ---
  // Advances every connected player's position and sends each of them
  // their own updated state. Running on a fixed interval (rather than
  // per-input-event) is what keeps this throttled: no matter how often
  // a client's keys change, network traffic is capped at TICK_RATE_HZ.
  setInterval(() => {
    const dtSeconds = TICK_MS / 1000;
    for (const [socketId, player] of Object.entries(players)) {
      stepPlayer(player, dtSeconds);
      movementNamespace.to(socketId).emit('state', {
        x: player.x,
        y: player.y,
        name: player.name,
      });
    }
  }, TICK_MS);
}

module.exports = { attachMovementNetworking };
