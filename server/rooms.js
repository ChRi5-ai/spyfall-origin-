// ============================================================
// SERVER/ROOMS.JS — Party room store for Spyfall 2D
// ============================================================
// Owns room creation, joining, and cleanup. Deliberately knows
// nothing about movement, sockets, or Socket.io — it just tracks
// which players belong to which room and who the host is. This
// keeps room lifecycle testable in isolation, the same way
// movement.js keeps position math isolated from networking.
//
// A "room" here is our own party concept (code, host, player map).
// It's separate from a Socket.io "room" (the built-in channel-scoping
// feature used in movement-network.js to broadcast only to a party's
// members) — the two happen to share the same code string as their
// identifier, which is intentional and convenient, but they're not
// the same object.
// ------------------------------------------------------------

// Same no-ambiguous-characters alphabet the original Spyfall game
// uses for its room codes, for a consistent player-facing experience.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const rooms = {}; // code -> room

function generateRoomCode() {
  let code;
  do {
    code = Array.from(
      { length: CODE_LENGTH },
      () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join('');
  } while (rooms[code]); // ensure uniqueness
  return code;
}

// Creates a new room with the given socket as its host. The host
// is not added as a player here — the caller (movement-network.js)
// does that immediately after, via the same movement-player-creation
// path every player (host or not) goes through.
function createRoom(hostSocketId) {
  const code = generateRoomCode();
  rooms[code] = {
    code,
    hostId: hostSocketId,
    players: {},       // socketId -> player state (owned/shaped by movement.js)
    playerCounter: 0,   // for sequential "Player N" naming, scoped to this room
  };
  return rooms[code];
}

function getRoom(code) {
  return rooms[code];
}

function allRooms() {
  return Object.values(rooms);
}

// Finds which room (if any) a given socket currently belongs to.
// Rooms are few and small in practice, so a linear scan is simple
// and fast enough; revisit with a socketId->code index if room count
// ever grows large.
function findRoomBySocket(socketId) {
  for (const room of Object.values(rooms)) {
    if (room.players[socketId]) return room;
  }
  return null;
}

// Removes a player from a room, handling host transfer and empty-room
// cleanup. Returns the room if it still exists afterward, or null if
// it was deleted because it became empty.
function removePlayerFromRoom(code, socketId) {
  const room = rooms[code];
  if (!room) return null;

  delete room.players[socketId];

  const remainingIds = Object.keys(room.players);

  if (remainingIds.length === 0) {
    delete rooms[code];
    return null;
  }

  if (room.hostId === socketId) {
    // Host left — promote whoever's been in the room longest among
    // those remaining. Object key insertion order is preserved for
    // string keys in JS, so the first remaining key is the earliest
    // other player to have joined.
    room.hostId = remainingIds[0];
  }

  return room;
}

module.exports = {
  createRoom,
  getRoom,
  allRooms,
  findRoomBySocket,
  removePlayerFromRoom,
};
