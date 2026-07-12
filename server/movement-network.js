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
// namespace the original game uses, so 2D traffic and Spyfall room
// traffic can never collide even though they share one HTTP server.
//
// PHASE 3 CHANGE: this now tracks every connected player, not just
// one, and broadcasts the full roster to all of them each tick. This
// is what makes movement multiplayer — the movement math in
// movement.js was NOT changed at all, only how many players it's
// called for and who receives the result.
// ------------------------------------------------------------

const { createPlayerState, stepPlayer, sanitizeInput } = require('./movement');

const TICK_RATE_HZ = 30;
const TICK_MS = 1000 / TICK_RATE_HZ;

// Golden-angle hue stepping spreads player colors evenly around the
// color wheel as more players join, rather than picking pure-random
// hues that could land close together and look similar.
const GOLDEN_ANGLE_DEG = 137.5;

function colorForIndex(index) {
  const hue = (index * GOLDEN_ANGLE_DEG) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

function attachMovementNetworking(io) {
  const movementNamespace = io.of('/2d');

  // socket.id -> player state (see movement.js for shape: id, name,
  // color, x, y, input)
  const players = {};

  // Monotonically increasing — never reused, even if earlier players
  // disconnect, so "Player 3" always refers to the 3rd person who
  // ever joined this server session, not a recycled slot.
  let playerCounter = 0;

  // Builds the array shape broadcast to clients: only what rendering
  // needs (id, name, color, x, y). Internal-only fields like `input`
  // are deliberately left out of what goes over the wire.
  function buildSnapshot() {
    return Object.values(players).map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      x: p.x,
      y: p.y,
    }));
  }

  movementNamespace.on('connection', (socket) => {
    playerCounter += 1;
    const name = `Player ${playerCounter}`;
    const color = colorForIndex(playerCounter);
    players[socket.id] = createPlayerState(socket.id, name, color);

    // Let the new player know who they are, since every client
    // receives the same roster broadcast and needs to tell "me" apart
    // from "everyone else" (e.g. for future UI, not used yet in
    // Phase 3's rendering, but establishing it now avoids a rework).
    socket.emit('self', { id: socket.id });

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
      // Broadcast immediately on disconnect rather than waiting for
      // the next tick, so a departing player's square disappears for
      // everyone else without a visible delay.
      movementNamespace.emit('state', buildSnapshot());
    });
  });

  // --- AUTHORITATIVE TICK LOOP ---
  // Advances every connected player's position, then broadcasts the
  // full roster to every connected client. Running on a fixed interval
  // (rather than per-input-event) is what keeps this throttled: no
  // matter how often clients' keys change, network traffic is capped
  // at TICK_RATE_HZ regardless of player count.
  setInterval(() => {
    const dtSeconds = TICK_MS / 1000;
    for (const player of Object.values(players)) {
      stepPlayer(player, dtSeconds);
    }
    // A single broadcast to the whole namespace (rather than looping
    // and emitting per-socket like Phase 2 did) is what turns this
    // into multiplayer sync: everyone sees everyone, including
    // players who aren't moving.
    movementNamespace.emit('state', buildSnapshot());
  }, TICK_MS);
}

module.exports = { attachMovementNetworking };
