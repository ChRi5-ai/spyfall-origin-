// ============================================================
// SPYFALL MULTIPLAYER SERVER
// Express + Socket.io backend handling room management,
// game state, and real-time sync between all connected players.
// ============================================================

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } // allow connections from any origin (adjust if needed)
});

const PORT = process.env.PORT || 3000;

// Serve the frontend
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------------------------------------
// GAME DATA
// ------------------------------------------------------------
const LOCATIONS = [
  'Abandoned Hospital', 'Pirate Ship', 'Space Station', 'Casino',
  'Military Base', 'Ancient Temple', 'Submarine', 'Movie Studio',
  'Haunted Mansion', 'Underground Lab', 'Medieval Castle', 'Arctic Base',
  'Dark Forest', 'Secret Vault', 'Ghost Town', 'Sunken Ship'
];

const DISCUSSION_SECONDS = 300; // 5 minutes

// ------------------------------------------------------------
// IN-MEMORY ROOM STORE
// rooms[code] = {
//   code, hostId,
//   players: [{ id, name, connected }],
//   phase: 'lobby' | 'reveal' | 'discussion' | 'voting' | 'ejection' | 'guess' | 'result',
//   spyId, location,
//   currentTurnId, targetId, awaitingAnswer,
//   voteRequests: Set of playerIds,
//   timer: { secondsLeft, intervalHandle },
//   votes: { voterId: votedForId },
//   votingOrder: [ids], votingIndex,
//   ejectedId, lastResult
// }
// ------------------------------------------------------------
const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms[code]); // ensure uniqueness
  return code;
}

function getRoom(code) {
  return rooms[code];
}

// Build a safe, role-specific view of state to send to each player
// (so the spy doesn't see the location, etc.)
function buildStateForPlayer(room, playerId) {
  const isSpy = room.spyId === playerId;
  const base = {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    myId: playerId,
     players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected })),
    currentTurnId: room.currentTurnId,
    votingOrder: room.votingOrder,
votingIndex: room.votingIndex,
spyId: room.spyId,
currentGuessSpyId: room.currentGuessSpyId,
    targetId: room.targetId,
    awaitingAnswer: room.awaitingAnswer,
    voteRequestCount: room.voteRequests ? room.voteRequests.size : 0,
    majorityNeeded: Math.floor(room.players.length / 2) + 1,
    secondsLeft: room.timer ? room.timer.secondsLeft : DISCUSSION_SECONDS,
    chatLog: room.chatLog || [],
    locations: LOCATIONS,
  };

  if (room.phase === 'reveal' || room.phase === 'discussion' || room.phase === 'voting') {
    base.role = isSpy ? 'spy' : 'civilian';
    base.location = isSpy ? null : room.location;
  }

  if (room.phase === 'ejection') {
    base.ejectedId = room.ejectedId;
    base.ejectedWasSpy = room.ejectedId === room.spyId;
  }

  if (room.phase === 'guess') {
    base.spyId = room.spyId; // reveal spy identity at this point for UI purposes
    base.ejectedId = room.ejectedId;
  }

  if (room.phase === 'result') {
    base.outcome = room.lastResult.outcome;
    base.detail = room.lastResult.detail;
    base.location = room.location;
    base.spyId = room.spyId;
    base.spyName = room.players.find(p => p.id === room.spyId)?.name || 'Unknown';
  }

  return base;
}

// Broadcast personalized state to every player in the room
function syncRoom(code) {
  const room = getRoom(code);
  if (!room) return;
  room.players.forEach(p => {
    const state = buildStateForPlayer(room, p.id);
    io.to(p.id).emit('state', state);
  });
}

function addSystemMessage(room, text) {
  if (!room.chatLog) room.chatLog = [];
  room.chatLog.push({ type: 'system', text, ts: Date.now() });
  if (room.chatLog.length > 200) room.chatLog.shift(); // cap log size
}

function addQAMessage(room, fromName, toName, question, answer) {
  if (!room.chatLog) room.chatLog = [];
  room.chatLog.push({ type: 'qa', from: fromName, to: toName, question, answer, ts: Date.now() });
  if (room.chatLog.length > 200) room.chatLog.shift();
}

// ------------------------------------------------------------
// TIMER MANAGEMENT
// ------------------------------------------------------------
function startTimer(room) {
  stopTimer(room);
  room.timer = { secondsLeft: DISCUSSION_SECONDS };
  room.timer.intervalHandle = setInterval(() => {
    room.timer.secondsLeft--;
    if (room.timer.secondsLeft <= 0) {
      stopTimer(room);
      beginVoting(room);
    }
    syncRoom(room.code);
  }, 1000);
}

function stopTimer(room) {
  if (room.timer && room.timer.intervalHandle) {
    clearInterval(room.timer.intervalHandle);
  }
}

// ------------------------------------------------------------
// GAME FLOW HELPERS
// ------------------------------------------------------------
function startDiscussionPhase(room) {
  room.phase = 'discussion';
  room.currentTurnId = room.players[0].id;
  room.targetId = null;
  room.awaitingAnswer = false;
  room.voteRequests = new Set();
  room.chatLog = [];
  addSystemMessage(room, 'The interrogation begins. Each player questions another in turn.');
  startTimer(room);
  syncRoom(room.code);
}

function beginVoting(room) {
  room.phase = 'voting';
  room.votes = {};
  room.votingOrder = room.players.map(p => p.id);
  room.votingIndex = 0;
  syncRoom(room.code);
}

function advanceVotingTurn(room) {
  room.votingIndex++;
  if (room.votingIndex >= room.votingOrder.length) {
    tallyVotesAndEject(room);
  } else {
    syncRoom(room.code);
  }
}

function tallyVotesAndEject(room) {
  const tally = {};
  Object.values(room.votes).forEach(votedId => {
    tally[votedId] = (tally[votedId] || 0) + 1;
  });
  let maxVotes = 0, ejectedId = null;
  for (const [id, count] of Object.entries(tally)) {
    if (count > maxVotes) { maxVotes = count; ejectedId = id; }
  }
  // Fallback: if nobody got votes (shouldn't happen), pick random non-self
  if (!ejectedId) {
    ejectedId = room.players[Math.floor(Math.random() * room.players.length)].id;
  }
  room.ejectedId = ejectedId;
  room.phase = 'ejection';
  syncRoom(room.code);
}

function resolveGuess(room, guessedLocation) {
  const correct = guessedLocation === room.location;
  const ejectedWasSpy = room.ejectedId === room.spyId;

  let outcome, detail;
  if (ejectedWasSpy && correct) {
    outcome = 'draw';
    detail = `The spy was caught but correctly guessed the location: ${room.location}. No one wins.`;
  } else if (ejectedWasSpy && !correct) {
    outcome = 'civilians';
    detail = `The spy was exposed and failed to guess the location. It was: ${room.location}.`;
  } else if (!ejectedWasSpy && correct) {
    outcome = 'spy';
    detail = `An innocent was ejected, and the spy correctly guessed ${room.location}. The spy wins.`;
  } else {
    outcome = 'civilians';
    detail = `An innocent was ejected, but the spy failed to guess the location. It was: ${room.location}.`;
  }

  room.lastResult = { outcome, detail };
  room.phase = 'result';
  syncRoom(room.code);
}

// Remove a player from their room and clean up empty rooms
function removePlayerFromRoom(socketId) {
  for (const code of Object.keys(rooms)) {
    const room = rooms[code];
    const idx = room.players.findIndex(p => p.id === socketId);
    if (idx !== -1) {
      // Mark disconnected instead of removing outright, to allow graceful handling mid-game
      if (room.phase === 'lobby') {
        room.players.splice(idx, 1);
        if (room.players.length === 0) {
          stopTimer(room);
          delete rooms[code];
          return;
        }
        // Reassign host if needed
        if (room.hostId === socketId) {
          room.hostId = room.players[0].id;
        }
      } else {
        room.players[idx].connected = false;
      }
      syncRoom(code);
      return;
    }
  }
}

// ------------------------------------------------------------
// SOCKET.IO EVENT HANDLERS
// ------------------------------------------------------------
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // --- CREATE ROOM ---
  socket.on('createRoom', ({ name }, callback) => {
    try {
      if (!name || !name.trim()) {
        return callback({ error: 'Name is required.' });
      }
      const code = generateRoomCode();
      const room = {
        code,
        hostId: socket.id,
        players: [{ id: socket.id, name: name.trim(), connected: true }],
        phase: 'lobby',
        spyId: null,
        location: null,
        chatLog: [],
        voteRequests: new Set(),
      };
      rooms[code] = room;
      socket.join(code);
      socket.data.roomCode = code;
      callback({ success: true, code });
      syncRoom(code);
    } catch (err) {
      console.error('createRoom error:', err);
      callback({ error: 'Server error creating room.' });
    }
  });

  // --- JOIN ROOM ---
  socket.on('joinRoom', ({ name, code }, callback) => {
    try {
      const roomCode = (code || '').toUpperCase().trim();
      const room = getRoom(roomCode);
      if (!room) return callback({ error: 'Room not found. Check the code and try again.' });
      if (room.phase !== 'lobby') return callback({ error: 'This game has already started.' });
      if (!name || !name.trim()) return callback({ error: 'Name is required.' });
      if (room.players.find(p => p.name.toLowerCase() === name.trim().toLowerCase())) {
        return callback({ error: 'That name is already taken in this room.' });
      }
      if (room.players.length >= 12) return callback({ error: 'Room is full (max 12 players).' });

      room.players.push({ id: socket.id, name: name.trim(), connected: true });
      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      callback({ success: true, code: roomCode });
      syncRoom(roomCode);
    } catch (err) {
      console.error('joinRoom error:', err);
      callback({ error: 'Server error joining room.' });
    }
  });

  // --- LEAVE ROOM ---
  socket.on('leaveRoom', () => {
    removePlayerFromRoom(socket.id);
    socket.leave(socket.data.roomCode);
    socket.data.roomCode = null;
  });

  // --- START GAME (host only) ---
  socket.on('startGame', (_, callback) => {
    try {
      const room = getRoom(socket.data.roomCode);
      if (!room) return callback?.({ error: 'Room not found.' });
      if (room.hostId !== socket.id) return callback?.({ error: 'Only the host can start the game.' });
      if (room.players.length < 3) return callback?.({ error: 'Need at least 3 players.' });

      const spyIndex = Math.floor(Math.random() * room.players.length);
      room.spyId = room.players[spyIndex].id;
      room.location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
      room.phase = 'reveal';
      syncRoom(room.code);
      callback?.({ success: true });
    } catch (err) {
      console.error('startGame error:', err);
      callback?.({ error: 'Server error starting game.' });
    }
  });

  // --- PLAYER READY (after viewing role) ---
  socket.on('roleAcknowledged', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.phase !== 'reveal') return;
    if (!room.readyPlayers) room.readyPlayers = new Set();
    room.readyPlayers.add(socket.id);
    if (room.readyPlayers.size >= room.players.length) {
      room.readyPlayers = new Set();
      startDiscussionPhase(room);
    } else {
      syncRoom(room.code);
    }
  });

  // --- SELECT TARGET TO QUESTION ---
  socket.on('selectTarget', ({ targetId }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.phase !== 'discussion') return;
    if (socket.id !== room.currentTurnId) return; // only current turn player can select
    if (room.awaitingAnswer) return;
    if (targetId === socket.id) return; // can't target self
    room.targetId = targetId;
    syncRoom(room.code);
  });

  // --- SEND QUESTION ---
 socket.on('sendQuestion', ({ text }) => {
    console.log("SERVER received question:", text);
    const room = getRoom(socket.data.roomCode);
    if (!room || room.phase !== 'discussion') return;
    if (socket.id !== room.currentTurnId) return;
    if (!room.targetId) return;
    if (room.awaitingAnswer) return;
    if (!text || !text.trim()) return;

    room.awaitingAnswer = true;
    room.pendingQuestion = text.trim();
    syncRoom(room.code);
    // Broadcast the question itself to chat immediately
    const asker = room.players.find(p => p.id === room.currentTurnId);
    const target = room.players.find(p => p.id === room.targetId);
    io.to(room.code).emit('questionAsked', {
      from: asker.name, to: target.name, question: room.pendingQuestion
    });
  });

  // --- ANSWER QUESTION (YES/NO) ---
  socket.on('answerQuestion', ({ answer }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.phase !== 'discussion') return;
    if (socket.id !== room.targetId) return; // only the targeted player can answer
    if (!room.awaitingAnswer) return;
    if (answer !== 'YES' && answer !== 'NO') return;

    const asker = room.players.find(p => p.id === room.currentTurnId);
    const target = room.players.find(p => p.id === room.targetId);
    addQAMessage(room, asker.name, target.name, room.pendingQuestion, answer);

    // Advance turn to next player in order
    const idx = room.players.findIndex(p => p.id === room.currentTurnId);
    const nextIdx = (idx + 1) % room.players.length;
    room.currentTurnId = room.players[nextIdx].id;
    room.targetId = null;
    room.awaitingAnswer = false;
    room.pendingQuestion = null;

    syncRoom(room.code);
  });

  // --- REQUEST VOTE (majority trigger) ---
  socket.on('requestVote', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.phase !== 'discussion') return;
    if (!room.voteRequests) room.voteRequests = new Set();
    room.voteRequests.add(socket.id);

    const majority = Math.floor(room.players.length / 2) + 1;
    if (room.voteRequests.size >= majority) {
      stopTimer(room);
      addSystemMessage(room, 'Majority reached — moving to vote!');
      beginVoting(room);
    } else {
      syncRoom(room.code);
    }
  });

  // --- CAST VOTE ---
  socket.on('castVote', ({ votedForId }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.phase !== 'voting') return;
    const expectedVoterId = room.votingOrder[room.votingIndex];
    if (socket.id !== expectedVoterId) return; // enforce turn order
    if (votedForId === socket.id) return; // can't vote self

    room.votes[socket.id] = votedForId;
    advanceVotingTurn(room);
  });

  // --- SPY GUESS ---
  socket.on('submitGuess', ({ location }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.phase !== 'guess' && room.phase !== 'ejection') return;
    if (socket.id !== room.spyId) return; // only spy can guess
    resolveGuess(room, location);
  });

  // --- PROCEED FROM EJECTION TO GUESS SCREEN ---
  socket.on('proceedToGuess', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.phase !== 'ejection') return;
    room.phase = 'guess';
    room.currentGuessSpyId = room.spyId;
    syncRoom(room.code);
  });

  // --- PLAY AGAIN / RESET TO LOBBY ---
  socket.on('playAgain', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    room.phase = 'lobby';
    room.spyId = null;
    room.location = null;
    room.chatLog = [];
    room.voteRequests = new Set();
    room.votes = {};
    stopTimer(room);
    syncRoom(room.code);
  });

  // --- DISCONNECT HANDLING ---
  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    removePlayerFromRoom(socket.id);
  });
});

// ------------------------------------------------------------
// ERROR HANDLING
// ------------------------------------------------------------
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

server.listen(PORT, () => {
  console.log(`Spyfall server running on port ${PORT}`);
});
