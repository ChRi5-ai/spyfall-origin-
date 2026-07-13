// ============================================================
// SERVER/PROXIMITY.JS — Interaction distance validation
// ============================================================
// Pure math: given two players' positions, is one close enough to
// the other to start a conversation? Knows nothing about rooms,
// conversations, or sockets — the server-authoritative distance
// check that server/movement-network.js calls before ever allowing
// a 'requestConversation' to succeed.
//
// Reuses PLAYER_SIZE from movement.js (not duplicated) so the
// interaction range stays sensibly related to how big a player
// actually is on screen, without this module needing to know
// anything else about movement.
// ------------------------------------------------------------

const { PLAYER_SIZE } = require('./movement');

// How close two players' top-left corners must be, in pixels, to
// interact. Generous enough to feel natural (doesn't require exact
// overlap) while still requiring the player to walk over.
const INTERACTION_DISTANCE = PLAYER_SIZE * 2.5;

function distanceBetween(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isWithinInteractionRange(a, b) {
  return distanceBetween(a, b) <= INTERACTION_DISTANCE;
}

module.exports = { INTERACTION_DISTANCE, distanceBetween, isWithinInteractionRange };
