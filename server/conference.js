// ============================================================
// SERVER/CONFERENCE.JS — Conference room voting
// ============================================================
// Owns the actual vote-casting phase once a vote request has been
// approved (see vote-request.js, a separate lifecycle). Tracks who
// has voted for whom, validates every cast vote server-side, and
// tallies the result. Knows nothing about sockets, timers, or the
// map — same isolation pattern as the other game-state modules.
// ------------------------------------------------------------

function ensureInitialized(room) {
  if (room.conference === undefined) {
    room.conference = null; // { votes: { voterId: targetId } }
  }
}

function startConferencePhase(room) {
  ensureInitialized(room);
  room.conference = { votes: {} };
}

// Can `voterId` cast a vote for `targetId` right now? Conference must
// be active, both players must exist, a player can't vote for
// themselves, and can't vote twice.
function canCastVote(room, voterId, targetId) {
  ensureInitialized(room);
  if (!room.conference) {
    return { error: 'Voting is not currently open.' };
  }
  if (!room.players[voterId] || !room.players[targetId]) {
    return { error: 'Player not found.' };
  }
  if (voterId === targetId) {
    return { error: 'You cannot vote for yourself.' };
  }
  if (room.conference.votes[voterId]) {
    return { error: 'You have already voted.' };
  }
  return { success: true };
}

function castVote(room, voterId, targetId) {
  ensureInitialized(room);
  room.conference.votes[voterId] = targetId;
  return room.conference.votes;
}

// True once every currently-connected player has cast a vote.
function allVoted(room) {
  ensureInitialized(room);
  if (!room.conference) return false;
  return Object.keys(room.players).every((id) => !!room.conference.votes[id]);
}

// Tallies the completed vote. Returns either:
//   { tie: true, eliminatedPlayerId: null, counts }
//   { tie: false, eliminatedPlayerId: '<socketId>', counts }
// A tie includes the case of multiple players sharing the highest
// vote count, not just an exact even split.
function tallyVotes(room) {
  ensureInitialized(room);
  const counts = {};
  for (const targetId of Object.values(room.conference?.votes || {})) {
    counts[targetId] = (counts[targetId] || 0) + 1;
  }

  let maxVotes = 0;
  let leaders = [];
  for (const [targetId, count] of Object.entries(counts)) {
    if (count > maxVotes) {
      maxVotes = count;
      leaders = [targetId];
    } else if (count === maxVotes) {
      leaders.push(targetId);
    }
  }

  if (leaders.length === 1) {
    return { tie: false, eliminatedPlayerId: leaders[0], counts };
  }
  return { tie: true, eliminatedPlayerId: null, counts };
}

function endConferencePhase(room) {
  room.conference = null;
}

module.exports = {
  startConferencePhase,
  canCastVote,
  castVote,
  allVoted,
  tallyVotes,
  endConferencePhase,
};
