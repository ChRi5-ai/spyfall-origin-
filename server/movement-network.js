// ============================================================
// SERVER/MOVEMENT-NETWORK.JS — Movement + lobby networking
// ============================================================
// Wires the movement module (pure position math) and the room store
// (pure room lifecycle) up to Socket.io. Kept separate from both so
// each stays testable in isolation.
//
// Runs on its own Socket.io namespace, '/2d', separate from the
// original game's default namespace — 2D traffic and Spyfall room
// traffic can never collide even though they share one HTTP server.
//
// PHASE 4 CHANGE: movement is no longer one shared world. A socket
// must create or join a party room before it has any player state at
// all, and every broadcast (lobby info AND movement state) is scoped
// to that party's Socket.io room, so players in different parties
// never see or affect each other. Socket.io's built-in room feature
// (socket.join(code)) is what makes `.to(code).emit(...)` only reach
// that party's sockets — this is reused for scoping rather than
// reinventing per-room broadcast plumbing.
// ------------------------------------------------------------

const { createPlayerState, stepPlayer, sanitizeInput } = require('./movement');
const roomsStore = require('./rooms');

const TICK_RATE_HZ = 30;
const TICK_MS = 1000 / TICK_RATE_HZ;

// Golden-angle hue stepping spreads player colors evenly around the
// color wheel as more players join a given room, rather than picking
// pure-random hues that could land close together and look similar.
// Scoped per-room (via each room's own playerCounter) so a room with
// 2 players always gets 2 well-separated colors, regardless of how
// many players have churned through other rooms.
const GOLDEN_ANGLE_DEG = 137.5;

function colorForIndex(index) {
  const hue = (index * GOLDEN_ANGLE_DEG) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

// Wire-format snapshot of a room's players for movement rendering.
// Only what canvas.js needs — internal fields like `input` stay
// server-side.
function buildMovementSnapshot(room) {
  return Object.values(room.players).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    x: p.x,
    y: p.y,
  }));
}

// Wire-format snapshot of a room's lobby info: who's the host, who's
// connected, how many. This is what the lobby UI renders — deliberately
// a separate event from movement 'state' so lobby-list updates (which
// are rare — join/leave) don't need to be recomputed on every single
// 30Hz movement tick.
function buildLobbySnapshot(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    players: Object.values(room.players).map((p) => ({ id: p.id, name: p.name })),
    count: Object.keys(room.players).length,
  };
}

function attachMovementNetworking(io) {
  const movementNamespace = io.of('/2d');

  // Adds a socket to a party room: creates its movement player state,
  // joins the underlying Socket.io room (for broadcast scoping), and
  // announces the updated lobby + movement snapshots to everyone
  // already in that room.
  function addSocketToRoom(socket, room) {
    room.playerCounter += 1;
    const name = `Player ${room.playerCounter}`;
    const color = colorForIndex(room.playerCounter);
    room.players[socket.id] = createPlayerState(socket.id, name, color);

    socket.join(room.code);

    movementNamespace.to(room.code).emit('lobby', buildLobbySnapshot(room));
    movementNamespace.to(room.code).emit('state', buildMovementSnapshot(room));
  }

  movementNamespace.on('connection', (socket) => {
    // Tells this client its own socket id immediately, so lobby UI
    // can determine "am I the host" by comparing against `hostId`
    // once it receives a 'lobby' snapshot.
    socket.emit('self', { id: socket.id });

    // --- CREATE ROOM ---
    socket.on('createRoom', (_payload, callback) => {
      try {
        const room = roomsStore.createRoom(socket.id);
        addSocketToRoom(socket, room);
        callback?.({ success: true, code: room.code });
      } catch (err) {
        console.error('createRoom error:', err);
        callback?.({ error: 'Server error creating room.' });
      }
    });

    // --- JOIN ROOM ---
    socket.on('joinRoom', ({ code } = {}, callback) => {
      try {
        const roomCode = (code || '').toUpperCase().trim();
        const room = roomsStore.getRoom(roomCode);
        if (!room) {
          return callback?.({ error: 'Room not found. Check the code and try again.' });
        }
        addSocketToRoom(socket, room);
        callback?.({ success: true, code: room.code });
      } catch (err) {
        console.error('joinRoom error:', err);
        callback?.({ error: 'Server error joining room.' });
      }
    });

    // --- RECEIVE MOVEMENT INPUT ---
    // Clients send which keys are currently held, NOT a position.
    // The server is the only thing that ever computes position.
    // Input is silently ignored if this socket hasn't joined a room
    // yet — there's no player state to apply it to.
    socket.on('input', (rawInput) => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) return;
      const player = room.players[socket.id];
      if (!player) return;
      player.input = sanitizeInput(rawInput);
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) return; // was never in a room (e.g. left at the entry screen)

      const code = room.code;
      const stillExists = roomsStore.removePlayerFromRoom(code, socket.id);

      if (stillExists) {
        // Room survives — could be a host transfer, could just be a
        // regular player leaving. Either way, broadcast immediately
        // (rather than waiting for the next movement tick) so the
        // lobby list and the world both update without a visible delay.
        movementNamespace.to(code).emit('lobby', buildLobbySnapshot(stillExists));
        movementNamespace.to(code).emit('state', buildMovementSnapshot(stillExists));
      }
      // If the room no longer exists, it was just deleted for being
      // empty — nobody is left to notify.
    });
  });

  // --- AUTHORITATIVE TICK LOOP ---
  // Advances every room's players and broadcasts each room's snapshot
  // only to that room's own Socket.io channel. A fixed interval
  // (rather than per-input-event) is what keeps this throttled: no
  // matter how often clients' keys change, network traffic per room
  // is capped at TICK_RATE_HZ.
  setInterval(() => {
    const dtSeconds = TICK_MS / 1000;
    for (const room of roomsStore.allRooms()) {
      for (const player of Object.values(room.players)) {
        stepPlayer(player, dtSeconds);
      }
      movementNamespace.to(room.code).emit('state', buildMovementSnapshot(room));
    }
  }, TICK_MS);
}

module.exports = { attachMovementNetworking };
