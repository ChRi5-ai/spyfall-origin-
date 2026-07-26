// ============================================================
// SERVER/GAME-RESET.JS — Play Again reset
// ============================================================
// Owns exactly one action: resetting a room's *match* state back to
// a fresh lobby, for the host to start again. Deliberately resets by
// clearing the room's own state fields back to their "not yet
// initialized" values (null/undefined) rather than importing and
// manipulating conversation.js / vote-request.js / conference.js
// internals — each of those modules already lazily reinitializes
// itself the next time it's touched (see their own
// ensureInitialized functions), so clearing here is sufficient and
// doesn't require this file to know their internal shapes.
//
// Character selections, room membership, host, and settings are all
// deliberately left untouched — Play Again only resets what a new
// match needs to start clean, per the Phase 9B spec. Phase 10.4 adds
// one more thing to the reset list: ready state, since every player
// needs to re-confirm Ready for a fresh round even though their
// character choice carries over.
// ------------------------------------------------------------

const gameTimerStore = require('./game-timer');

// Returns { success: true } or { error: string }. Only the host may
// trigger this — never trust a client claiming to be host.
function attemptPlayAgain(room, socketId) {
  if (room.hostId !== socketId) {
    return { error: 'Only the host can start a new game.' };
  }

  gameTimerStore.clearTimer(room);

  room.game = null;                 // roles, location, spy, phase, elimination, guess
  room.conversations = undefined;   // question history, active conversations, re-ask rule
  room.voteRequest = null;          // any pending Call Vote request
  room.conference = null;           // any in-progress conference votes
  room.readyState = undefined;      // Phase 10.4: everyone must re-ready for the new round
  room.started = false;             // unlocks the room: joining/character changes/settings again allowed

  return { success: true };
}

module.exports = { attemptPlayAgain };
