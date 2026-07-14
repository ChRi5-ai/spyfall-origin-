// ============================================================
// SERVER/VOTE-REQUEST.JS — "Call Vote" request & approval
// ============================================================
// Owns the pending "someone wants to start a vote" request for a
// room: who called it, who has responded and how, and whether a
// majority accepted. This is deliberately separate from
// conference.js (which owns what happens once voting actually
// starts) — a vote *request* can be declined and never become an
// actual conference, so the two have different lifecycles.
// ------------------------------------------------------------

function ensureInitialized(room) {
  if (room.voteRequest === undefined) {
    room.voteRequest = null; // { callerId, responses: { socketId: 'accept' | 'decline' } }
  }
}

// Can `socketId` call a vote right now? Only one request may be
// pending at a time, and only during active discussion — not before
// a game has started, and not while a conference is already underway.
function canCallVote(room, socketId) {
  ensureInitialized(room);
  if (!room.players[socketId]) {
    return { error: 'Player not found.' };
  }
  if (room.voteRequest) {
    return { error: 'A vote request is already pending.' };
  }
  if (!room.game || room.game.phase !== 'discussion') {
    return { error: 'A vote can only be called during discussion.' };
  }
  return { success: true };
}

// Starts a new vote request. The caller is recorded as having
// implicitly accepted their own request — they already indicated
// they want to vote by calling it.
function callVote(room, callerId) {
  ensureInitialized(room);
  room.voteRequest = {
    callerId,
    responses: { [callerId]: 'accept' },
  };
  return room.voteRequest;
}

function submitResponse(room, socketId, response) {
  ensureInitialized(room);
  if (!room.voteRequest) {
    return { error: 'No vote request is currently pending.' };
  }
  if (response !== 'accept' && response !== 'decline') {
    return { error: 'Invalid response.' };
  }
  if (room.voteRequest.responses[socketId]) {
    return { error: 'You have already responded to this vote request.' };
  }
  room.voteRequest.responses[socketId] = response;
  return { success: true };
}

// True once every currently-connected player has responded.
function allResponded(room) {
  ensureInitialized(room);
  if (!room.voteRequest) return false;
  return Object.keys(room.players).every((id) => !!room.voteRequest.responses[id]);
}

// Tally of accept/decline responses so far. `majorityAccept` is true
// only when accepts strictly outnumber declines — a tie is treated
// as not passing, same as an outright decline majority.
function tallyResponses(room) {
  ensureInitialized(room);
  const responses = Object.values(room.voteRequest?.responses || {});
  const accepts = responses.filter((r) => r === 'accept').length;
  const declines = responses.filter((r) => r === 'decline').length;
  return { accepts, declines, total: responses.length, majorityAccept: accepts > declines };
}

function clearVoteRequest(room) {
  room.voteRequest = null;
}

module.exports = {
  canCallVote,
  callVote,
  submitResponse,
  allResponded,
  tallyResponses,
  clearVoteRequest,
};
