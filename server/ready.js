// ============================================================
// SERVER/READY.JS — Player ready state
// ============================================================
// Owns whether each connected player is Ready. Same isolation
// pattern as characters.js/settings.js: no sockets, no broadcasting,
// just validated state on the room object (room.readyState, a
// socketId -> boolean map), lazily initialized exactly like the
// existing character-selection and settings stores.
//
// A newly-joined player has no entry yet, which reads as "not ready"
// by default (missing key -> falsy) — this is what naturally gives
// "everyone stays Ready except the new player" without any special
// case: existing entries are simply never touched by a join.
// ------------------------------------------------------------

function ensureInitialized(room) {
  if (!room.readyState) {
    room.readyState = {};
  }
}

function isReady(room, socketId) {
  ensureInitialized(room);
  return !!room.readyState[socketId];
}

function setReady(room, socketId, ready) {
  ensureInitialized(room);
  room.readyState[socketId] = !!ready;
}

// Toggles and returns the new value — used by the client's single
// Ready/Not Ready button.
function toggleReady(room, socketId) {
  ensureInitialized(room);
  const next = !room.readyState[socketId];
  room.readyState[socketId] = next;
  return next;
}

// Used when a player changes their character selection — per spec,
// that automatically un-readies them.
function clearReady(room, socketId) {
  ensureInitialized(room);
  room.readyState[socketId] = false;
}

// True only once every currently-connected player is ready. An empty
// room (shouldn't normally happen mid-lobby) is never "all ready."
function allPlayersReady(room) {
  ensureInitialized(room);
  const ids = Object.keys(room.players);
  if (ids.length === 0) return false;
  return ids.every((id) => !!room.readyState[id]);
}

function removePlayer(room, socketId) {
  if (room.readyState) delete room.readyState[socketId];
}

module.exports = { isReady, setReady, toggleReady, clearReady, allPlayersReady, removePlayer };
