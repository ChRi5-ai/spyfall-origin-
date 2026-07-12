// ============================================================
// SERVER/GAME-SESSION.JS — Game initialization orchestration
// ============================================================
// The one place that turns a successful game start into an actual
// Spyfall match: picks the location, assigns roles, and starts the
// timer, by composing locations.js, roles.js, and game-timer.js —
// none of which are modified or duplicated here. This file owns none
// of that underlying logic itself, only the sequencing and where the
// result gets stored (room.game).
//
// Also owns getRoleRevealForPlayer, the single function that decides
// what a specific player is allowed to learn about their own role. It
// is the only sanctioned way to read role.js's output back out —
// callers (movement-network.js) must always pass the requesting
// player's own socket id and must always deliver the result only to
// that same socket. This keeps "never leak another player's role" a
// property of one function's contract rather than something every
// call site has to get right independently.
// ------------------------------------------------------------

const locationsStore = require('./locations');
const rolesStore = require('./roles');
const timerStore = require('./game-timer');

// Initializes room.game for a room whose start has already been
// validated and locked (see server/game-start.js). `onTimerExpire` is
// called with the room once the discussion timer naturally reaches
// zero, so the caller can broadcast that transition.
//
// Returns the timer's { endsAt, durationMs } for the caller to relay
// to clients — deliberately not broadcasting anything itself, since
// this module has no knowledge of sockets.
function initializeGame(room, { map, timerMinutes }, onTimerExpire) {
  const location = locationsStore.pickRandomLocation(map);
  const playerIds = Object.keys(room.players);
  const { spyId, roles } = rolesStore.assignRoles(playerIds, location);

  room.game = {
    map,
    location,   // server-side only — never broadcast this field directly
    spyId,      // server-side only — never broadcast this field directly
    roles,      // socketId -> { role, location }, read only via getRoleRevealForPlayer
    phase: 'discussion',
  };

  const { endsAt, durationMs } = timerStore.startTimer(room, timerMinutes, () => {
    if (room.game) room.game.phase = 'discussionEnded';
    onTimerExpire(room);
  });

  return { endsAt, durationMs };
}

// Returns exactly what `socketId` is allowed to know about their own
// role: { role: 'civilian', location: '<name>' } or
// { role: 'spy', location: null }. Returns null if there's no active
// game or this socket has no assigned role (e.g. it's stale).
function getRoleRevealForPlayer(room, socketId) {
  if (!room.game) return null;
  const roleInfo = room.game.roles[socketId];
  if (!roleInfo) return null;
  return { role: roleInfo.role, location: roleInfo.location };
}

module.exports = { initializeGame, getRoleRevealForPlayer };
