// ============================================================
// SERVER/CHARACTERS.JS — Character selection for Spyfall 2D
// ============================================================
// Owns the 10 fixed playable characters and who (if anyone) has each
// one reserved within a given room. Deliberately knows nothing about
// sockets, broadcasting, or rendering — same isolation pattern as
// movement.js and rooms.js — so selection rules stay testable and
// reviewable on their own.
//
// Characters have no names of their own; a player's displayed
// identity is always their lobby username (see server/rooms.js /
// movement-network.js), shown above their character during gameplay
// in a later phase. This module only tracks *which fixed character
// slot* (by id) a given player socket currently owns.
//
// Selection state lives on the room object itself (room.characterSelections,
// a socketId -> characterId map), the same way room.players already
// lives there — keeping all of one room's state together rather than
// spreading it across parallel global stores keyed by room code.
// ------------------------------------------------------------

const CHARACTER_COUNT = 10;
const CHARACTER_IDS = Array.from({ length: CHARACTER_COUNT }, (_, i) => `char-${i + 1}`);

function ensureSelectionsInitialized(room) {
  if (!room.characterSelections) {
    room.characterSelections = {}; // socketId -> characterId
  }
}

function isValidCharacterId(characterId) {
  return CHARACTER_IDS.includes(characterId);
}

// True if some OTHER player in the room already owns this character.
// A player re-selecting their own current character is not "taken".
function isCharacterTakenByOther(room, characterId, requestingSocketId) {
  ensureSelectionsInitialized(room);
  return Object.entries(room.characterSelections).some(
    ([socketId, ownedCharacterId]) =>
      ownedCharacterId === characterId && socketId !== requestingSocketId
  );
}

// Attempts to assign `characterId` to `socketId`. Returns
// { success: true } or { error: string }. This is the single
// gatekeeping function — the server is the only place a character
// selection is ever actually granted, regardless of what a client
// claims.
function selectCharacter(room, socketId, characterId) {
  ensureSelectionsInitialized(room);

  if (!isValidCharacterId(characterId)) {
    return { error: 'That is not a valid character.' };
  }
  if (isCharacterTakenByOther(room, characterId, socketId)) {
    return { error: 'That character has already been taken.' };
  }

  room.characterSelections[socketId] = characterId;
  return { success: true };
}

// Frees whatever character a player currently holds, e.g. on
// disconnect. Safe to call even if the player never selected one.
function releaseSelection(room, socketId) {
  if (!room.characterSelections) return;
  delete room.characterSelections[socketId];
}

// True once every currently-connected player in the room has a
// character selected. Used to gate the host's Start Game control.
function allPlayersSelected(room) {
  ensureSelectionsInitialized(room);
  const playerIds = Object.keys(room.players);
  if (playerIds.length === 0) return false;
  return playerIds.every((socketId) => !!room.characterSelections[socketId]);
}

// Wire-format view of character availability for the whole fixed
// roster: every character id, plus who (if anyone) currently owns it.
function buildCharacterAvailability(room) {
  ensureSelectionsInitialized(room);
  return CHARACTER_IDS.map((characterId) => {
    const ownerSocketId = Object.entries(room.characterSelections).find(
      ([, ownedCharacterId]) => ownedCharacterId === characterId
    )?.[0];
    return { id: characterId, takenBy: ownerSocketId || null };
  });
}

function getSelectionForPlayer(room, socketId) {
  ensureSelectionsInitialized(room);
  return room.characterSelections[socketId] || null;
}

module.exports = {
  CHARACTER_IDS,
  selectCharacter,
  releaseSelection,
  allPlayersSelected,
  buildCharacterAvailability,
  getSelectionForPlayer,
};
