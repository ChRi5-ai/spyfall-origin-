// ============================================================
// SERVER/GAME-START.JS — Start-game validation and locking
// ============================================================
// The single place that decides whether a room is allowed to leave
// the lobby. Composes the existing, unmodified characters.js and
// settings.js modules rather than duplicating their rules — this file
// owns none of the underlying validation logic itself, only the
// decision to combine them and lock the room once they all pass.
//
// Deliberately stops at "the room is now locked and here is which map
// and timer were chosen." Role assignment, spy selection, and any
// other actual Spyfall gameplay are explicitly out of scope — that's
// Phase 7 and beyond, built on top of what this file hands off.
// ------------------------------------------------------------

const charactersStore = require('./characters');
const settingsStore = require('./settings');

// Attempts to start the game for a room, on behalf of `socketId`.
// Returns { success: true, map, timerMinutes } on success, or
// { error: string } if any validation fails. Only mutates
// `room.started` on success.
function attemptStartGame(room, socketId) {
  if (room.hostId !== socketId) {
    return { error: 'Only the host can start the game.' };
  }
  if (room.started) {
    return { error: 'The game has already started.' };
  }
  if (!charactersStore.allPlayersSelected(room)) {
    return { error: 'Every connected player must select a character first.' };
  }

  const settings = settingsStore.getSettings(room);
  if (!settingsStore.isValidMap(settings.map)) {
    return { error: 'No valid map is selected.' };
  }
  if (!settingsStore.isValidTimer(settings.timerMinutes)) {
    return { error: 'No valid timer is selected.' };
  }

  // Locking here (rather than in movement-network.js) keeps "what
  // makes a room locked" defined in one place, next to the validation
  // that decided it was allowed to lock.
  room.started = true;

  return { success: true, map: settings.map, timerMinutes: settings.timerMinutes };
}

// True once a room is locked — used elsewhere (joinRoom, selectCharacter)
// to reject actions that should no longer be possible once the game
// has started, without duplicating what "locked" means in each place.
function isLocked(room) {
  return !!room.started;
}

module.exports = { attemptStartGame, isLocked };
