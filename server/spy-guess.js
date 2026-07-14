// ============================================================
// SERVER/SPY-GUESS.JS — Eliminated spy's location guess
// ============================================================
// Owns the one rule that matters here: only the actual eliminated
// spy may submit exactly one guess, and it must be a real location
// for the match's map. Reuses locations.js (unmodified) as the
// source of truth for what counts as a valid guess — never trusts
// whatever string the client sends.
// ------------------------------------------------------------

const locationsStore = require('./locations');

function canGuess(room, socketId) {
  if (!room.game || room.game.eliminatedPlayerId !== socketId) {
    return { error: 'You are not eligible to guess the location.' };
  }
  if (room.game.roles[socketId]?.role !== 'spy') {
    return { error: 'Only the spy may guess the location.' };
  }
  if (room.game.spyGuessSubmitted) {
    return { error: 'You have already made your guess.' };
  }
  return { success: true };
}

// Returns { success: true, correct: boolean, guessedLocation } or
// { error: string }. Marks the guess as submitted either way it
// succeeds, so a second attempt is always rejected regardless of
// whether the first guess was right.
function submitGuess(room, socketId, guessedLocation) {
  const check = canGuess(room, socketId);
  if (check.error) return check;

  const validLocations = locationsStore.getLocationsForMap(room.game.map);
  if (!validLocations.includes(guessedLocation)) {
    return { error: 'That is not a valid location for this map.' };
  }

  room.game.spyGuessSubmitted = true;
  const correct = guessedLocation === room.game.location;
  return { success: true, correct, guessedLocation };
}

module.exports = { canGuess, submitGuess };
