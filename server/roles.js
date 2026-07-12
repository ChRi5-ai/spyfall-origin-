// ============================================================
// SERVER/ROLES.JS — Spy/civilian role assignment
// ============================================================
// Pure function: given a list of player ids and the chosen location,
// picks exactly one spy at random and returns every player's role.
// Knows nothing about rooms, sockets, or broadcasting — same
// isolation pattern as the rest of the game-state modules — so the
// randomness and assignment rules are easy to verify on their own.
// ------------------------------------------------------------

// Returns { spyId, roles }, where `roles` is a map of
// playerId -> { role: 'civilian' | 'spy', location: string | null }.
// The spy's location is always null; every civilian gets the same
// passed-in location.
function assignRoles(playerIds, location) {
  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    return { spyId: null, roles: {} };
  }

  const spyId = playerIds[Math.floor(Math.random() * playerIds.length)];

  const roles = {};
  for (const id of playerIds) {
    roles[id] = id === spyId
      ? { role: 'spy', location: null }
      : { role: 'civilian', location };
  }

  return { spyId, roles };
}

module.exports = { assignRoles };
