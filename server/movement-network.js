// ============================================================
// SERVER/MOVEMENT-NETWORK.JS — Movement + lobby networking
// ============================================================
// Wires the movement module (pure position math) and the room store
// (pure room lifecycle) up to Socket.io. Kept separate from both so
// each stays testable in isolation.
//
// Runs on its own Socket.io namespace, '/2d', separate from the
// original game's default namespace — 2D traffic and Spyfall room
// traffic can never collide even though they share one HTTP server.
//
// PHASE 4 CHANGE: movement is no longer one shared world. A socket
// must create or join a party room before it has any player state at
// all, and every broadcast (lobby info AND movement state) is scoped
// to that party's Socket.io room, so players in different parties
// never see or affect each other. Socket.io's built-in room feature
// (socket.join(code)) is what makes `.to(code).emit(...)` only reach
// that party's sockets — this is reused for scoping rather than
// reinventing per-room broadcast plumbing.
//
// PHASE 5 CHANGE: added character selection, delegated entirely to
// server/characters.js (kept as its own module, separate from both
// room lifecycle and movement math). This file's job is just wiring:
// receive 'selectCharacter', ask characters.js whether it's allowed,
// and broadcast the result. No character logic lives here directly.
// ------------------------------------------------------------

const { createPlayerState, stepPlayer, sanitizeInput } = require('./movement');
const roomsStore = require('./rooms');
const charactersStore = require('./characters');
const settingsStore = require('./settings');
const gameStartStore = require('./game-start');
const gameSessionStore = require('./game-session');
const gameTimerStore = require('./game-timer');
const proximityStore = require('./proximity');
const conversationStore = require('./conversation');
const voteRequestStore = require('./vote-request');
const conferenceStore = require('./conference');
const eliminationStore = require('./elimination');
const spyGuessStore = require('./spy-guess');
const resultsLogicStore = require('./results-logic');
const gameResetStore = require('./game-reset');
const locationsStore = require('./locations');

const TICK_RATE_HZ = 30;
const TICK_MS = 1000 / TICK_RATE_HZ;

// Golden-angle hue stepping spreads player colors evenly around the
// color wheel as more players join a given room, rather than picking
// pure-random hues that could land close together and look similar.
// Scoped per-room (via each room's own playerCounter) so a room with
// 2 players always gets 2 well-separated colors, regardless of how
// many players have churned through other rooms.
const GOLDEN_ANGLE_DEG = 137.5;

function colorForIndex(index) {
  const hue = (index * GOLDEN_ANGLE_DEG) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

// Wire-format snapshot of a room's players for movement rendering.
// Only what canvas.js needs — internal fields like `input` stay
// server-side.
function buildMovementSnapshot(room) {
  return Object.values(room.players).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    x: p.x,
    y: p.y,
  }));
}

// Wire-format snapshot of a room's lobby info: who's the host, who's
// connected (with their current character selection, if any), how
// many, the full character-availability grid, and whether every
// connected player has selected a character yet. This is what the
// lobby UI renders — deliberately a separate event from movement
// 'state' so lobby-list updates (which are rare — join/leave/character
// select) don't need to be recomputed on every single 30Hz movement
// tick.
//
// `allSelected` reuses characters.js's existing allPlayersSelected
// unchanged — this only wires its result into the broadcast snapshot
// so the client can gate the host's Start Game control.
//
// PHASE 6 ADDITION: `settings` (map + timer, from settings.js) and
// `started` (from game-start.js) are wired in the same way — each
// module owns its own rules, this function just assembles their
// current values into one snapshot for the client to render.
function buildLobbySnapshot(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    players: Object.values(room.players).map((p) => ({
      id: p.id,
      name: p.name,
      characterId: charactersStore.getSelectionForPlayer(room, p.id),
    })),
    count: Object.keys(room.players).length,
    characters: charactersStore.buildCharacterAvailability(room),
    allSelected: charactersStore.allPlayersSelected(room),
    settings: settingsStore.getSettings(room),
    started: gameStartStore.isLocked(room),
  };
}

function attachMovementNetworking(io) {
  const movementNamespace = io.of('/2d');

  // Adds a socket to a party room: creates its movement player state,
  // joins the underlying Socket.io room (for broadcast scoping), and
  // announces the updated lobby + movement snapshots to everyone
  // already in that room.
  function addSocketToRoom(socket, room) {
    room.playerCounter += 1;
    const name = `Player ${room.playerCounter}`;
    const color = colorForIndex(room.playerCounter);
    room.players[socket.id] = createPlayerState(socket.id, name, color);

    socket.join(room.code);

    movementNamespace.to(room.code).emit('lobby', buildLobbySnapshot(room));
    movementNamespace.to(room.code).emit('state', buildMovementSnapshot(room));
  }

  // If every connected player has responded to the pending vote
  // request, tallies it and either starts the conference room
  // (majority accept) or closes the request and lets discussion
  // continue (tie or majority decline). Called both after every
  // 'respondToVote' and from disconnect cleanup, since a departing
  // player can be the one everyone else was waiting on.
  function resolveVoteRequestIfComplete(room) {
    if (!voteRequestStore.allResponded(room)) return;

    const tally = voteRequestStore.tallyResponses(room);
    voteRequestStore.clearVoteRequest(room);

    if (!tally.majorityAccept) {
      movementNamespace.to(room.code).emit('voteRequestClosed', { reason: 'declined' });
      return;
    }

    // Majority accepted — pause the discussion timer (remembering
    // remaining time for a possible tie-return), pause movement (via
    // the tick loop's phase check), and end any conversation either
    // participant might still have open so nobody is stuck in a
    // question panel while everyone else is voting.
    gameTimerStore.pauseTimer(room);
    room.game.phase = 'voting';
    conferenceStore.startConferencePhase(room);

    for (const socketId of Object.keys(room.players)) {
      const released = conversationStore.forceRelease(room, socketId);
      if (released) {
        const partnerId = released.askerId === socketId ? released.targetId : released.askerId;
        movementNamespace.to(socketId).emit('conversationCancelled', {
          conversationId: released.id,
          reason: 'A vote has started.',
        });
        movementNamespace.to(partnerId).emit('conversationCancelled', {
          conversationId: released.id,
          reason: 'A vote has started.',
        });
      }
    }

    const players = Object.values(room.players).map((p) => ({
      id: p.id,
      name: p.name,
      characterId: charactersStore.getSelectionForPlayer(room, p.id),
    }));
    movementNamespace.to(room.code).emit('conferenceStart', { players });
  }

  // If every connected player has cast a vote, tallies it and either
  // resumes gameplay (tie) or stores the determined elimination for
  // Phase 9B without revealing it (single highest vote count). Called
  // both after every 'castVote' and from disconnect cleanup.
  function resolveConferenceIfComplete(room) {
    if (!conferenceStore.allVoted(room)) return;

    const result = conferenceStore.tallyVotes(room);
    conferenceStore.endConferencePhase(room);

    if (result.tie) {
      movementNamespace.to(room.code).emit('conferenceResult', { tie: true });

      room.game.phase = 'discussion';
      const resumed = gameTimerStore.resumeTimer(room, () => {
        movementNamespace.to(room.code).emit('timerEnd', {});
        endMatch(room, resultsLogicStore.SPY_WINS);
      });
      if (resumed) {
        movementNamespace.to(room.code).emit('timerStart', {
          endsAt: resumed.endsAt,
          durationMs: resumed.durationMs,
        });
      }
      return;
    }

    // Exactly one player has the highest vote count.
    room.game.eliminatedPlayerId = result.eliminatedPlayerId;
    movementNamespace.to(room.code).emit('conferenceResult', { tie: false });

    // PHASE 9B: this is where Phase 9A intentionally stopped — voting
    // had "simply ended," with nothing revealed. From here, the
    // elimination reveal is public (everyone learns who was
    // eliminated and whether they were the spy simultaneously), then
    // either the match ends immediately (civilian eliminated) or the
    // spy alone gets one chance to guess the location.
    const reveal = eliminationStore.buildEliminationReveal(room);
    movementNamespace.to(room.code).emit('eliminationReveal', reveal);

    if (!reveal.wasSpy) {
      const winner = resultsLogicStore.determineWinner({ wasSpy: false, guessCorrect: false });
      endMatch(room, winner);
      return;
    }

    // The spy was eliminated — only they receive the guess prompt,
    // sent privately to their own socket id.
    const validLocations = locationsStore.getLocationsForMap(room.game.map);
    movementNamespace.to(reveal.eliminatedPlayerId).emit('spyGuessPrompt', { locations: validLocations });
  }

  // Assembles the results-screen payload: the winner, the real spy's
  // name, the correct location, and every player with their actual
  // role — all of this is public once the match has ended, unlike
  // the private role reveal at the start of the match.
  function buildResultsPayload(room, winner) {
    const spy = room.players[room.game.spyId];
    return {
      winner,
      spyName: spy ? spy.name : 'Unknown',
      correctLocation: room.game.location,
      players: Object.values(room.players).map((p) => ({
        id: p.id,
        name: p.name,
        characterId: charactersStore.getSelectionForPlayer(room, p.id),
        role: room.game.roles[p.id]?.role || 'unknown',
      })),
    };
  }

  // The single path every win condition funnels through — normal
  // (civilian eliminated, spy guess submitted) and abnormal (spy
  // disconnects mid-match, or disconnects before guessing). Guarded
  // by `resultsSent` so a room can never broadcast 'resultsReady'
  // twice for the same match, regardless of which path got there
  // first, and clears any still-running discussion timer so it can't
  // fire a stray 'timerEnd' against a match that's already over.
  function endMatch(room, winner) {
    if (!room.game || room.game.resultsSent) return;
    room.game.resultsSent = true;
    room.game.phase = 'ended';
    gameTimerStore.clearTimer(room);
    movementNamespace.to(room.code).emit('resultsReady', buildResultsPayload(room, winner));
  }

  movementNamespace.on('connection', (socket) => {
    // Tells this client its own socket id immediately, so lobby UI
    // can determine "am I the host" by comparing against `hostId`
    // once it receives a 'lobby' snapshot.
    socket.emit('self', { id: socket.id });

    // --- CREATE ROOM ---
    socket.on('createRoom', (_payload, callback) => {
      try {
        const room = roomsStore.createRoom(socket.id);
        addSocketToRoom(socket, room);
        callback?.({ success: true, code: room.code });
      } catch (err) {
        console.error('createRoom error:', err);
        callback?.({ error: 'Server error creating room.' });
      }
    });

    // --- JOIN ROOM ---
    socket.on('joinRoom', ({ code } = {}, callback) => {
      try {
        const roomCode = (code || '').toUpperCase().trim();
        const room = roomsStore.getRoom(roomCode);
        if (!room) {
          return callback?.({ error: 'Room not found. Check the code and try again.' });
        }
        if (gameStartStore.isLocked(room)) {
          return callback?.({ error: 'This room has already started and can no longer be joined.' });
        }
        addSocketToRoom(socket, room);
        callback?.({ success: true, code: room.code });
      } catch (err) {
        console.error('joinRoom error:', err);
        callback?.({ error: 'Server error joining room.' });
      }
    });

    // --- SELECT CHARACTER ---
    // The server is the sole authority on who owns which character.
    // If two clients race to pick the same one, Socket.io/Node process
    // events one at a time on this single-threaded event loop, so
    // whichever 'selectCharacter' event arrives first is simply the
    // first one handled — there's no real concurrency to arbitrate.
    // The loser gets an explicit error plus a fresh lobby snapshot so
    // its UI can immediately resync instead of showing stale state.
    socket.on('selectCharacter', ({ characterId } = {}, callback) => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) {
        return callback?.({ error: 'You are not in a room.' });
      }
      if (gameStartStore.isLocked(room)) {
        return callback?.({ error: 'Character selection is locked — the game has started.' });
      }

      const result = charactersStore.selectCharacter(room, socket.id, characterId);
      if (result.error) {
        return callback?.({ error: result.error, lobby: buildLobbySnapshot(room) });
      }

      callback?.({ success: true });
      movementNamespace.to(room.code).emit('lobby', buildLobbySnapshot(room));
    });

    // --- UPDATE HOST SETTINGS ---
    // Map and timer changes go through the same pattern as character
    // selection: the client only ever requests a change, settings.js
    // is the sole authority on whether it's from the host and whether
    // the requested values are valid, and a successful change is
    // rebroadcast to the whole room so everyone sees it live.
    socket.on('updateSettings', (payload = {}, callback) => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) {
        return callback?.({ error: 'You are not in a room.' });
      }
      if (gameStartStore.isLocked(room)) {
        return callback?.({ error: 'Settings are locked — the game has started.' });
      }

      const result = settingsStore.updateSettings(room, socket.id, payload);
      if (result.error) {
        return callback?.({ error: result.error, lobby: buildLobbySnapshot(room) });
      }

      callback?.({ success: true });
      movementNamespace.to(room.code).emit('lobby', buildLobbySnapshot(room));
    });

    // --- START GAME ---
    // Delegates entirely to game-start.js for validation (host-only,
    // every player selected, valid map/timer) and locking. This
    // handler's only job is translating that result into network
    // events: a rejection stays private to the requester, but success
    // is broadcast to the whole room as a dedicated 'gameStart' event
    // (distinct from 'lobby') so every client transitions out of the
    // lobby at the same moment, plus one final 'lobby' broadcast so
    // anyone still rendering lobby UI sees `started: true` immediately.
    //
    // PHASE 7 ADDITION: once game-start.js has locked the room, hand
    // off to game-session.js to actually initialize the Spyfall match
    // (pick a location, assign roles, start the discussion timer).
    // Role reveals are emitted individually to each player's own
    // socket id — never broadcast to the room — so nobody ever
    // receives anyone else's role. The timer's start info IS broadcast
    // to the whole room, since a start time and duration carry no
    // secret information on their own.
    socket.on('startGame', (_payload, callback) => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) {
        return callback?.({ error: 'You are not in a room.' });
      }

      const result = gameStartStore.attemptStartGame(room, socket.id);
      if (result.error) {
        return callback?.({ error: result.error });
      }

      callback?.({ success: true });
      movementNamespace.to(room.code).emit('gameStart', {
        map: result.map,
        timerMinutes: result.timerMinutes,
      });
      movementNamespace.to(room.code).emit('lobby', buildLobbySnapshot(room));

      const { endsAt, durationMs } = gameSessionStore.initializeGame(
        room,
        { map: result.map, timerMinutes: result.timerMinutes },
        (expiredRoom) => {
          // PHASE 9B: discussion ran out without the spy being caught
          // — that's a spy victory. 'timerEnd' still fires first so
          // any listener relying on it (e.g. UI stopping the visible
          // countdown) keeps working exactly as before; endMatch then
          // immediately follows with the actual result.
          movementNamespace.to(expiredRoom.code).emit('timerEnd', {});
          endMatch(expiredRoom, resultsLogicStore.SPY_WINS);
        }
      );

      // Room-wide: safe to broadcast, carries no role/location secrets.
      movementNamespace.to(room.code).emit('timerStart', { endsAt, durationMs });

      // Per-socket: each player's own role only, never the room.
      for (const socketId of Object.keys(room.players)) {
        movementNamespace
          .to(socketId)
          .emit('roleReveal', gameSessionStore.getRoleRevealForPlayer(room, socketId));
      }
    });

    // --- QUESTIONING: REQUEST CONVERSATION ---
    // The server is the sole authority on whether a conversation may
    // start: distance is checked here using each player's current,
    // server-computed position (never anything the client claims),
    // and every other rule (busy / can't-immediately-re-ask) is
    // delegated to conversation.js. Kept as two separate checks
    // (distance here, everything else in conversation.js) rather than
    // one combined function, so proximity and conversation rules stay
    // independently reviewable.
    socket.on('requestConversation', ({ targetId } = {}, callback) => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) return callback?.({ error: 'You are not in a room.' });
      if (!room.game || room.game.phase !== 'discussion') {
        return callback?.({ error: 'Questioning is only available during discussion.' });
      }

      const asker = room.players[socket.id];
      const target = room.players[targetId];
      if (!asker || !target) {
        return callback?.({ error: 'Player not found.' });
      }
      if (!proximityStore.isWithinInteractionRange(asker, target)) {
        return callback?.({ error: 'You are too far away to question that player.' });
      }

      const ruleCheck = conversationStore.canStart(room, socket.id, targetId);
      if (ruleCheck.error) {
        return callback?.({ error: ruleCheck.error });
      }

      const convo = conversationStore.startConversation(room, socket.id, targetId);
      callback?.({ success: true, conversationId: convo.id });

      // Sent privately to each participant, with their own role in
      // the exchange and the other person's name — never broadcast
      // to the room, since a conversation is only for its two
      // participants (see 'Other players continue playing normally'
      // in the Phase 8 spec).
      movementNamespace.to(convo.askerId).emit('conversationStarted', {
        conversationId: convo.id,
        role: 'asker',
        otherName: target.name,
      });
      movementNamespace.to(convo.targetId).emit('conversationStarted', {
        conversationId: convo.id,
        role: 'target',
        otherName: asker.name,
      });
    });

    // --- QUESTIONING: SUBMIT QUESTION ---
    socket.on('submitQuestion', ({ conversationId, question } = {}, callback) => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) return callback?.({ error: 'You are not in a room.' });

      const result = conversationStore.submitQuestion(room, socket.id, conversationId, question);
      if (result.error) {
        return callback?.({ error: result.error });
      }

      callback?.({ success: true });
      // Both participants see the question — this is the "current
      // conversation" becoming visible to the two of them, and only
      // them (same per-socket delivery pattern as conversationStarted).
      movementNamespace.to(result.conversation.askerId).emit('questionAsked', {
        conversationId,
        question: result.conversation.question,
      });
      movementNamespace.to(result.conversation.targetId).emit('questionAsked', {
        conversationId,
        question: result.conversation.question,
      });
    });

    // --- QUESTIONING: SUBMIT ANSWER (also closes the conversation) ---
    socket.on('submitAnswer', ({ conversationId, answer } = {}, callback) => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) return callback?.({ error: 'You are not in a room.' });

      const result = conversationStore.submitAnswerAndEnd(room, socket.id, conversationId, answer);
      if (result.error) {
        return callback?.({ error: result.error });
      }

      callback?.({ success: true });
      // Per Phase 8 spec, the conversation auto-closes right after the
      // reply — this single event tells both participants the final
      // Q&A and that they're free to start new conversations again.
      movementNamespace.to(result.record.askerId).emit('conversationEnded', result.record);
      movementNamespace.to(result.record.targetId).emit('conversationEnded', result.record);
    });

    // --- QUESTIONING: INVESTIGATION LOG ---
    // Returns only conversations this socket actually participated
    // in — see conversation.js's getHistoryForPlayer, the single
    // function responsible for that filtering.
    socket.on('getInvestigationLog', (_payload, callback) => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) return callback?.({ error: 'You are not in a room.' });
      callback?.({ success: true, history: conversationStore.getHistoryForPlayer(room, socket.id) });
    });

    // --- VOTING: CALL VOTE ---
    // Starts a new vote request (see vote-request.js). The caller is
    // recorded server-side as implicitly accepting their own request,
    // so only the OTHER connected players still need to respond.
    socket.on('callVote', (_payload, callback) => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) return callback?.({ error: 'You are not in a room.' });

      const check = voteRequestStore.canCallVote(room, socket.id);
      if (check.error) {
        return callback?.({ error: check.error });
      }

      voteRequestStore.callVote(room, socket.id);
      callback?.({ success: true });

      const caller = room.players[socket.id];
      movementNamespace.to(room.code).emit('voteRequested', {
        callerId: socket.id,
        callerName: caller.name,
      });

      // The caller already auto-accepted, so it's possible (in a
      // 2-player room) that everyone has now "responded" — check
      // immediately rather than waiting for another response event
      // that may never come.
      resolveVoteRequestIfComplete(room);
    });

    // --- VOTING: RESPOND TO VOTE REQUEST ---
    socket.on('respondToVote', ({ response } = {}, callback) => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) return callback?.({ error: 'You are not in a room.' });

      const result = voteRequestStore.submitResponse(room, socket.id, response);
      if (result.error) {
        return callback?.({ error: result.error });
      }

      callback?.({ success: true });
      resolveVoteRequestIfComplete(room);
    });

    // --- VOTING: CAST VOTE (conference room) ---
    socket.on('castVote', ({ targetId } = {}, callback) => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) return callback?.({ error: 'You are not in a room.' });

      const check = conferenceStore.canCastVote(room, socket.id, targetId);
      if (check.error) {
        return callback?.({ error: check.error });
      }

      conferenceStore.castVote(room, socket.id, targetId);
      callback?.({ success: true });

      resolveConferenceIfComplete(room);
    });

    // --- SPY GUESS ---
    // Only reaches a meaningful outcome for the actual eliminated spy
    // — spy-guess.js rejects anyone else, or a second attempt, or an
    // invalid location, regardless of what the client claims.
    socket.on('submitSpyGuess', ({ location } = {}, callback) => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) return callback?.({ error: 'You are not in a room.' });

      const result = spyGuessStore.submitGuess(room, socket.id, location);
      if (result.error) {
        return callback?.({ error: result.error });
      }

      callback?.({ success: true, correct: result.correct });

      const winner = resultsLogicStore.determineWinner({ wasSpy: true, guessCorrect: result.correct });
      endMatch(room, winner);
    });

    // --- PLAY AGAIN ---
    // Host-only (validated in game-reset.js, not here) reset back to
    // a fresh lobby. Both "Play Again" and "Return to Lobby" on the
    // results screen call this same event — per the Phase 9B spec,
    // both describe the same destination state (room stays active,
    // character selections preserved, host can start again), so
    // rather than inventing two different server behaviors for what
    // the spec describes as one outcome, both buttons share this one
    // validated action.
    socket.on('playAgain', (_payload, callback) => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) return callback?.({ error: 'You are not in a room.' });

      const result = gameResetStore.attemptPlayAgain(room, socket.id);
      if (result.error) {
        return callback?.({ error: result.error });
      }

      callback?.({ success: true });
      movementNamespace.to(room.code).emit('returnToLobby', {});
      movementNamespace.to(room.code).emit('lobby', buildLobbySnapshot(room));
    });

    // --- RECEIVE MOVEMENT INPUT ---
    // Clients send which keys are currently held, NOT a position.
    // The server is the only thing that ever computes position.
    // Input is silently ignored if this socket hasn't joined a room
    // yet — there's no player state to apply it to.
    socket.on('input', (rawInput) => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) return;
      const player = room.players[socket.id];
      if (!player) return;
      player.input = sanitizeInput(rawInput);
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
      const room = roomsStore.findRoomBySocket(socket.id);
      if (!room) return; // was never in a room (e.g. left at the entry screen)

      const code = room.code;

      // If this player was mid-conversation, free their partner
      // immediately rather than leaving them stuck unable to start a
      // new one — this is disconnect cleanup, not a normal
      // question/answer/close, so it doesn't touch history or the
      // "last asked" rule (see conversation.js's forceRelease).
      const releasedConvo = conversationStore.forceRelease(room, socket.id);
      if (releasedConvo) {
        const partnerId = releasedConvo.askerId === socket.id
          ? releasedConvo.targetId
          : releasedConvo.askerId;
        movementNamespace.to(partnerId).emit('conversationCancelled', {
          conversationId: releasedConvo.id,
          reason: 'The other player disconnected.',
        });
      }

      const stillExists = roomsStore.removePlayerFromRoom(code, socket.id);
      charactersStore.releaseSelection(room, socket.id);

      if (!stillExists) {
        // Room was just deleted for being empty — if a discussion
        // timer was running, stop it rather than leaving an orphaned
        // setTimeout that would otherwise fire against a room nobody
        // is in anymore.
        gameTimerStore.clearTimer(room);
      }

      if (stillExists) {
        // Room survives — could be a host transfer, could just be a
        // regular player leaving. Either way, broadcast immediately
        // (rather than waiting for the next movement tick) so the
        // lobby list and the world both update without a visible delay.
        movementNamespace.to(code).emit('lobby', buildLobbySnapshot(stillExists));
        movementNamespace.to(code).emit('state', buildMovementSnapshot(stillExists));

        // If everyone else had already responded to a pending vote
        // request, or already cast their vote in the conference room,
        // the departing player could have been the sole remaining
        // holdout — re-check so the room isn't left stuck waiting on
        // someone who's no longer connected.
        resolveVoteRequestIfComplete(stillExists);
        resolveConferenceIfComplete(stillExists);

        // If a match is active and the player who just disconnected
        // was the spy, the match can't meaningfully continue — end it
        // safely now rather than leaving remaining players stuck with
        // a discussion timer counting down for a spy that's already
        // gone. Treated as a civilian-favorable forfeit, the same
        // outcome as the spy failing to guess correctly.
        if (stillExists.game && !stillExists.game.resultsSent) {
          const wasSpy = stillExists.game.spyId === socket.id;
          const wasEliminatedSpyAwaitingGuess =
            stillExists.game.eliminatedPlayerId === socket.id &&
            stillExists.game.roles[socket.id]?.role === 'spy' &&
            !stillExists.game.spyGuessSubmitted;

          if (wasSpy || wasEliminatedSpyAwaitingGuess) {
            endMatch(stillExists, resultsLogicStore.CIVILIANS_WIN);
          }
        }
      }
      // If the room no longer exists, it was just deleted for being
      // empty — nobody is left to notify.
    });
  });

  // --- AUTHORITATIVE TICK LOOP ---
  // Advances every room's players and broadcasts each room's snapshot
  // only to that room's own Socket.io channel. A fixed interval
  // (rather than per-input-event) is what keeps this throttled: no
  // matter how often clients' keys change, network traffic per room
  // is capped at TICK_RATE_HZ.
  //
  // PHASE 9A ADDITION: while a room's game phase is 'voting' (the
  // conference room), stepPlayer is skipped for everyone in that
  // room — this is what "disable player movement" actually means
  // server-side. Held input is still received and stored (see the
  // 'input' handler below, unchanged), it just isn't applied while
  // voting is active, and resumes naturally the moment the phase
  // changes back — no separate "unfreeze" step needed.
  setInterval(() => {
    const dtSeconds = TICK_MS / 1000;
    for (const room of roomsStore.allRooms()) {
      const movementPaused = room.game && room.game.phase === 'voting';
      if (!movementPaused) {
        for (const player of Object.values(room.players)) {
          stepPlayer(player, dtSeconds);
        }
      }
      movementNamespace.to(room.code).emit('state', buildMovementSnapshot(room));
    }
  }, TICK_MS);
}

module.exports = { attachMovementNetworking };
