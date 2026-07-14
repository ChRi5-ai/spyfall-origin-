// ============================================================
// SERVER/ELIMINATION.JS — Elimination reveal
// ============================================================
// Builds the "who was eliminated, and were they the spy" payload
// once voting has determined a single eliminated player (see
// conference.js's tallyVotes, unmodified). This information is safe
// to broadcast to every player simultaneously — unlike a role reveal
// (game-session.js), an elimination reveal is public knowledge by
// design once it happens.
// ------------------------------------------------------------

function buildEliminationReveal(room) {
  const eliminatedId = room.game.eliminatedPlayerId;
  const player = room.players[eliminatedId];
  const roleInfo = room.game.roles[eliminatedId];

  return {
    eliminatedPlayerId: eliminatedId,
    eliminatedName: player ? player.name : 'Unknown',
    wasSpy: roleInfo ? roleInfo.role === 'spy' : false,
  };
}

module.exports = { buildEliminationReveal };
