// ============================================================
// SERVER/CONVERSATION.JS — Questioning conversation state
// ============================================================
// Owns everything about an in-progress or completed question/answer
// exchange for a room: who's currently in one (so a player can't be
// in two at once), the "can't immediately re-ask the same person"
// rule, and the full history (used to build each player's own
// Investigation Log). Knows nothing about sockets, distance, or
// movement — same isolation pattern as the rest of the game-state
// modules.
//
// Movement is never frozen for a conversation (per Phase 8 spec) —
// this module only tracks who's *engaged* in a conversation, which
// is used solely to prevent overlapping conversations, not to affect
// movement in any way.
// ------------------------------------------------------------

let conversationCounter = 0;

function ensureInitialized(room) {
  if (!room.conversations) {
    room.conversations = {
      activeByPlayer: {},  // socketId -> conversationId (asker or target)
      byId: {},            // conversationId -> { id, askerId, targetId, question, answer }
      lastAskedTarget: {}, // askerId -> the last socketId they asked
      history: [],         // completed conversations, newest last
    };
  }
}

function isBusy(room, socketId) {
  ensureInitialized(room);
  return !!room.conversations.activeByPlayer[socketId];
}

// Checks every rule for whether `askerId` may start questioning
// `targetId` right now: both must exist, neither can already be in a
// conversation, and the asker can't immediately re-ask the same
// target they most recently asked (they must question someone else
// first — see server/movement-network.js's 'requestConversation'
// handler for where distance is checked, kept separate from these
// rules on purpose).
function canStart(room, askerId, targetId) {
  ensureInitialized(room);

  if (askerId === targetId) {
    return { error: 'You cannot question yourself.' };
  }
  if (!room.players[askerId] || !room.players[targetId]) {
    return { error: 'Player not found.' };
  }
  if (isBusy(room, askerId)) {
    return { error: 'You are already in a conversation.' };
  }
  if (isBusy(room, targetId)) {
    return { error: 'That player is already in a conversation.' };
  }
  if (room.conversations.lastAskedTarget[askerId] === targetId) {
    return { error: 'You must question someone else before asking them again.' };
  }

  return { success: true };
}

function startConversation(room, askerId, targetId) {
  ensureInitialized(room);
  conversationCounter += 1;
  const id = `conv-${conversationCounter}`;
  const conversation = { id, askerId, targetId, question: null, answer: null };
  room.conversations.byId[id] = conversation;
  room.conversations.activeByPlayer[askerId] = id;
  room.conversations.activeByPlayer[targetId] = id;
  return conversation;
}

function getConversation(room, conversationId) {
  ensureInitialized(room);
  return room.conversations.byId[conversationId] || null;
}

function submitQuestion(room, askerId, conversationId, questionText) {
  ensureInitialized(room);
  const convo = room.conversations.byId[conversationId];
  if (!convo || convo.askerId !== askerId) {
    return { error: 'Invalid conversation.' };
  }
  if (convo.question !== null) {
    return { error: 'A question has already been asked in this conversation.' };
  }
  const trimmed = String(questionText || '').trim().slice(0, 200);
  if (!trimmed) {
    return { error: 'Question cannot be empty.' };
  }
  convo.question = trimmed;
  return { success: true, conversation: convo };
}

// Submits the answer and immediately closes out the conversation —
// per Phase 8 spec, the conversation auto-closes right after the
// reply. Records history and the "last asked" rule state, then frees
// both participants to start new conversations again.
function submitAnswerAndEnd(room, targetId, conversationId, answerText) {
  ensureInitialized(room);
  const convo = room.conversations.byId[conversationId];
  if (!convo || convo.targetId !== targetId) {
    return { error: 'Invalid conversation.' };
  }
  if (convo.question === null) {
    return { error: 'No question has been asked yet.' };
  }
  if (convo.answer !== null) {
    return { error: 'This conversation has already been answered.' };
  }
  const trimmed = String(answerText || '').trim().slice(0, 200);
  if (!trimmed) {
    return { error: 'Answer cannot be empty.' };
  }
  convo.answer = trimmed;

  room.conversations.lastAskedTarget[convo.askerId] = convo.targetId;

  const askerName = room.players[convo.askerId]?.name || 'Unknown';
  const targetName = room.players[convo.targetId]?.name || 'Unknown';

  const record = {
    id: convo.id,
    askerId: convo.askerId,
    targetId: convo.targetId,
    askerName,
    targetName,
    question: convo.question,
    answer: convo.answer,
    timestamp: Date.now(),
  };
  room.conversations.history.push(record);

  delete room.conversations.activeByPlayer[convo.askerId];
  delete room.conversations.activeByPlayer[convo.targetId];
  delete room.conversations.byId[conversationId];

  return { success: true, record };
}

// Releases a player from whatever conversation they're in without
// recording history or the "last asked" rule — used for disconnect
// cleanup, not a normal conversation end. Returns the released
// conversation (so the caller can notify the other participant), or
// null if the player wasn't in one.
function forceRelease(room, socketId) {
  ensureInitialized(room);
  const id = room.conversations.activeByPlayer[socketId];
  if (!id) return null;
  const convo = room.conversations.byId[id];
  delete room.conversations.activeByPlayer[convo.askerId];
  delete room.conversations.activeByPlayer[convo.targetId];
  delete room.conversations.byId[id];
  return convo;
}

// Every completed conversation `socketId` participated in, as either
// asker or target — never anyone else's. This is the only function
// that reads history back out, the same "one function owns the
// privacy contract" pattern as game-session.js's role reveal.
function getHistoryForPlayer(room, socketId) {
  ensureInitialized(room);
  return room.conversations.history.filter(
    (entry) => entry.askerId === socketId || entry.targetId === socketId
  );
}

module.exports = {
  isBusy,
  canStart,
  startConversation,
  getConversation,
  submitQuestion,
  submitAnswerAndEnd,
  forceRelease,
  getHistoryForPlayer,
};
