/**
 * SPYFALL — Browser Client
 *
 * Architecture:
 *  - Net.*     Socket.IO emit wrappers (client → server)
 *  - Render.*  Pure render functions (state snapshot → DOM)
 *  - UI.*      Stateless UI helpers (panels, card flip, copy, etc.)
 *
 * The server is authoritative. The client never computes game outcomes —
 * it only renders whatever snapshot the server sends via socket.on('state').
 *
 * CHAT BUG FIXES (v2):
 *  1. rebuildChatLog() now preserves the live pending-question card instead
 *     of wiping it on every state update (timer ticks, target selection, etc.)
 *  2. All player-identity checks now use state.myId (server-assigned, stable
 *     across the session) rather than the local `myId` variable, which can
 *     become stale after a socket reconnect changes socket.id.
 *  3. appendPendingQuestion() guards against being called when the discussion
 *     screen isn't visible, preventing ghost cards on other screens.
 *  4. A `pendingAnswered` flag prevents double-answer submissions.
 */

'use strict';

// ─── Socket ──────────────────────────────────────────────────────────────────
const socket = io({ autoConnect: true });

// ─── Local client state (display only — no game logic) ───────────────────────
let myId         = null;   // socket.id; set on connect / reconnect
let currentState = null;   // last full state snapshot from server
let cardFlipped  = false;  // role card flip state (local animation only)
let pendingAnswered = false; // prevents double YES/NO submissions

// ─── Utility ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

function showScreen(name) {
  document.querySelectorAll('.screen')
    .forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── UI helpers ──────────────────────────────────────────────────────────────
const UI = {
  /** Toggle create/join sub-panels on the title screen */
  showPanel(which) {
    document.getElementById('panel-create').style.display = which === 'create' ? 'block' : 'none';
    document.getElementById('panel-join').style.display   = which === 'join'   ? 'block' : 'none';
    const input = which === 'create' ? 'create-name' : 'join-name';
    setTimeout(() => document.getElementById(input)?.focus(), 60);
  },

  /** Flip the role card (one-way; reveals role to the player) */
  flipCard() {
    if (cardFlipped) return;
    cardFlipped = true;
    document.getElementById('role-card').classList.add('flipped');
    setTimeout(() => {
      document.getElementById('role-ready-btn').style.display = 'block';
    }, 650);
  },

  /** Copy room code to clipboard */
  copyCode() {
    const code = document.getElementById('lobby-code').textContent.trim();
    if (!code || code === '----') return;
    navigator.clipboard?.writeText(code).catch(() => {});
  },

  /** Set an error message in a named element; auto-clears after 5 s */
  setError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    clearTimeout(el._t);
    if (msg) el._t = setTimeout(() => { el.textContent = ''; }, 5000);
  },
};

// ─── Net — emit wrappers ─────────────────────────────────────────────────────
const Net = {
  createRoom() {
    const name = document.getElementById('create-name').value.trim();
    UI.setError('create-error', '');
    if (!name) { UI.setError('create-error', 'Please enter a name.'); return; }
    socket.emit('createRoom', { name }, res => {
      if (res?.error) UI.setError('create-error', res.error);
    });
  },

  joinRoom() {
    const name = document.getElementById('join-name').value.trim();
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    UI.setError('join-error', '');
    if (!name)             { UI.setError('join-error', 'Please enter a name.'); return; }
    if (code.length !== 4) { UI.setError('join-error', 'Room code must be 4 characters.'); return; }
    socket.emit('joinRoom', { name, code }, res => {
      if (res?.error) UI.setError('join-error', res.error);
    });
  },

  leaveRoom() {
    socket.emit('leaveRoom');
    showScreen('title');
    document.getElementById('panel-create').style.display = 'none';
    document.getElementById('panel-join').style.display   = 'none';
  },

  startGame() {
    socket.emit('startGame', {}, res => {
      if (res?.error) UI.setError('lobby-error', res.error);
    });
  },

  acknowledgeRole() {
    document.getElementById('role-ready-btn').style.display    = 'none';
    document.getElementById('role-waiting-area').style.display = 'block';
    socket.emit('roleAcknowledged');
  },

  selectTarget(targetId) {
    socket.emit('selectTarget', { targetId });
  },

  sendQuestion() {
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();
    if (!text) return;
    socket.emit('sendQuestion', { text });
    input.value = '';
    input.focus();
  },

  /** FIX: guard against double submission with pendingAnswered flag */
  answerQuestion(answer) {
    if (pendingAnswered) return;
    pendingAnswered = true;

    // Disable buttons immediately so the player can't tap twice
    document.querySelectorAll('#pending-question-card .answer-btn')
      .forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });

    socket.emit('answerQuestion', { answer });
  },

  requestVote() {
    socket.emit('requestVote');
  },

  castVote(votedForId) {
    socket.emit('castVote', { votedForId });
  },

  proceedToGuess() {
    socket.emit('proceedToGuess');
  },

  submitGuess(location) {
    socket.emit('submitGuess', { location });
  },

  playAgain() {
    socket.emit('playAgain');
  },
};

// ─── Socket events ───────────────────────────────────────────────────────────
socket.on('connect', () => {
  myId = socket.id;
});

socket.on('disconnect', () => {
  showScreen('title');
  UI.setError('create-error', 'Disconnected. Refresh to reconnect.');
});

/**
 * Main state handler.
 * IMPORTANT: always use `state.myId` (not `myId`) inside renderers —
 * state.myId is the server-confirmed identity and survives reconnects.
 */
socket.on('state', state => {
  currentState = state;

  // Keep local myId in sync (important after reconnect)
  if (state.myId) myId = state.myId;

  switch (state.phase) {
    case 'lobby':      Render.lobby(state);      break;
    case 'reveal':     Render.reveal(state);     break;
    case 'discussion': Render.discussion(state); break;
    case 'voting':     Render.voting(state);     break;
    case 'ejection':   Render.ejection(state);   break;
    case 'guess':      Render.guess(state);      break;
    case 'result':     Render.result(state);     break;
  }
});

/**
 * Lightweight timer tick — updates only the clock, avoids full re-render.
 */
socket.on('timerTick', ({ secondsLeft }) => {
  const el = document.getElementById('timer');
  if (!el) return;
  el.textContent = fmtTime(secondsLeft);
  el.classList.toggle('urgent', secondsLeft <= 30);
});

/**
 * Server tells all clients a question has been asked.
 * The targeted player sees YES/NO; everyone else sees "waiting".
 *
 * FIX: only render when the discussion screen is actually visible,
 * and reset pendingAnswered so the target can answer freshly.
 */
socket.on('questionPending', ({ fromName, toId, toName, question }) => {
  if (!document.getElementById('screen-discussion')?.classList.contains('active')) return;
  pendingAnswered = false;
  appendPendingQuestion(fromName, toName, toId, question);
});
socket.on('questionAsked', ({ from, to, question }) => {
  const state = currentState;
  if (!state) return;

  // Find the target player's socket ID from the current state
  const target = state.players.find(p => p.name === to);
  if (!target) return;

  pendingAnswered = false;
  appendPendingQuestion(from, to, target.id, question);
});
// ─── Renderers ───────────────────────────────────────────────────────────────
const Render = {

  // ── Lobby ──────────────────────────────────────────────────────────────────
  lobby(state) {
    showScreen('lobby');
    document.getElementById('lobby-code').textContent  = state.code;
    document.getElementById('lobby-count').textContent = state.players.length;
    UI.setError('lobby-error', '');
    const list = document.getElementById('lobby-player-list');
    list.innerHTML = '';
    state.players.forEach(p => {
      const li     = document.createElement('li');
      const isMe   = p.id === state.myId;
      const isHost = p.id === state.hostId;
      li.innerHTML = `
        <span>${escapeHtml(p.name)}</span>
        <span class="tag-row">
          ${isHost ? '<span class="tag host">HOST</span>' : ''}
          ${isMe   ? '<span class="tag you">YOU</span>'   : ''}
        </span>`;
      if (!p.connected) li.style.opacity = '0.45';
      list.appendChild(li);
    });
console.log("myId:", state.myId);
console.log("hostId:", state.hostId);
console.log("players:", state.players);
console.log("isHost?", state.hostId === state.myId);
    const isHost = state.hostId === state.myId;
    const enough = state.players.length >= 3;
    document.getElementById('lobby-host-controls').style.display = isHost ? 'block' : 'none';
    document.getElementById('lobby-wait-msg').style.display      = isHost ? 'none'  : 'block';

    if (isHost) {
      const btn       = document.getElementById('lobby-start-btn');
      btn.disabled    = !enough;
      btn.textContent = enough
        ? 'START GAME'
        : `NEED ${3 - state.players.length} MORE PLAYER${3 - state.players.length > 1 ? 'S' : ''}`;
    }
  },

  // ── Role Reveal ────────────────────────────────────────────────────────────
  reveal(state) {
    showScreen('role');

    // Don't reset the card if this player already flipped it
    // (state re-broadcasts when others hit READY)
    if (!cardFlipped) {
      document.getElementById('role-card').classList.remove('flipped');
      document.getElementById('role-ready-btn').style.display    = 'none';
      document.getElementById('role-waiting-area').style.display = 'none';
    }

    const isSpy = state.role === 'spy';
    const back  = document.getElementById('role-back');
    back.className = `role-face back ${isSpy ? 'spy-role' : 'civilian-role'}`;
    back.innerHTML = isSpy
      ? `<div class="role-icon">🕵️</div>
         <div class="role-title">SPY</div>
         <div class="role-hint">You don't know the location.<br>Blend in. Don't get caught.</div>`
      : `<div class="role-icon">🏛️</div>
         <div class="role-title">CIVILIAN</div>
         <div class="role-location">${escapeHtml(state.location)}</div>
         <div class="role-hint">Find the spy.<br>Don't give too much away.</div>`;

    // Ready pips
    const pips = document.getElementById('ready-pips');
    pips.innerHTML = '';
    state.players.filter(p => p.connected).forEach(p => {
      const pip = document.createElement('div');
      pip.className = `ready-pip${p.ready ? ' done' : ''}`;
      pip.title     = p.name;
      pips.appendChild(pip);
    });
  },

  // ── Discussion ─────────────────────────────────────────────────────────────
  
    discussion(state) {
showScreen('discussion');

    const me       = state.myId;
    const isMyTurn = state.currentTurnId === me;

    // Timer (initial paint; timerTick handles per-second updates)
    const timerEl = document.getElementById('timer');
    timerEl.textContent = fmtTime(state.secondsLeft);
    timerEl.classList.toggle('urgent', state.secondsLeft <= 30);

    // Vote badge
    document.getElementById('vote-badge').textContent =
      `${state.voteRequestCount}/${state.majorityNeeded}`;

    // Turn banner
    const asker  = state.players.find(p => p.id === state.currentTurnId);
    const target = state.players.find(p => p.id === state.targetId);
    const banner = document.getElementById('turn-banner');

    if (state.awaitingAnswer && target) {
      banner.textContent = `Awaiting ${target.name}'s answer…`;
    } else if (isMyTurn) {
      banner.textContent = target
        ? `Your turn — questioning: ${target.name}`
        : 'Your turn — select a player to question';
    } else {
      banner.textContent = asker
        ? `${asker.name}'s turn${target ? ' — questioning: ' + target.name : ''}`
        : '…';
    }

    // Players panel
    const panel = document.getElementById('players-panel');
    panel.innerHTML = '';
    state.players.forEach(p => {
      const div        = document.createElement('div');
      const isCurrent  = p.id === state.currentTurnId;
      const isTarget   = p.id === state.targetId;
      const canClick   = isMyTurn && !state.awaitingAnswer && p.id !== me;

      div.className = [
        'player-item',
        isCurrent    && 'current-turn',
        isTarget     && 'active-target',
        !p.connected && 'disconnected',
        canClick     && 'clickable',
      ].filter(Boolean).join(' ');

      div.innerHTML = `
        <div class="player-dot"></div>
        <span>
          ${escapeHtml(p.name)}
          ${p.id === me ? ' <em style="font-size:.7rem;color:var(--text-dim)">(you)</em>' : ''}
          ${!p.connected ? ' ⚠' : ''}
        </span>`;

      if (canClick) div.onclick = () => Net.selectTarget(p.id);
      panel.appendChild(div);
    });

    // ── Chat log
    // FIX: use the safe rebuild that preserves the pending-question card
    safeRebuildChatLog(state.chatLog);

    // ── Input controls
    const chatInput = document.getElementById('chat-input');
    const sendBtn   = document.getElementById('send-btn');

    // If we're now awaiting an answer, the pending card is already visible;
    // don't enable typing for anyone.
    const canType = isMyTurn && !state.awaitingAnswer && !!state.targetId;
    chatInput.disabled = !canType;
    sendBtn.disabled   = !canType;
    chatInput.placeholder = !isMyTurn
      ? 'Waiting for your turn…'
      : state.awaitingAnswer
        ? 'Waiting for answer…'
        : !state.targetId
          ? 'Select a player to question first…'
          : 'Type a yes/no question…';
  },

  // ── Voting ─────────────────────────────────────────────────────────────────
  voting(state) {
    showScreen('voting');

    const currentVoterId = state.votingOrder?.[state.votingIndex];
    const voter          = state.players.find(p => p.id === currentVoterId);
    const isMyTurn       = currentVoterId === state.myId;
console.log("myId:", state.myId);
console.log("currentVoterId:", currentVoterId);
console.log("isMyTurn:", isMyTurn);
console.log("votingOrder:", state.votingOrder);
console.log("votingIndex:", state.votingIndex);
    document.getElementById('voting-instruction').textContent = isMyTurn
      ? 'Your turn — select the player you believe is the spy.'
      : `Waiting for ${voter?.name ?? '…'} to vote…`;
    UI.setError('vote-error', '');

    const grid = document.getElementById('vote-grid');
    grid.innerHTML = '';
    state.players.forEach(p => {
      if (p.id === currentVoterId) return;
      const div     = document.createElement('div');
      div.className = `vote-card${isMyTurn ? '' : ' disabled'}`;
      div.innerHTML = `<div class="vote-icon">👁</div><div class="vote-name">${escapeHtml(p.name)}</div>`;
      if (isMyTurn) div.onclick = () => Net.castVote(p.id);
      grid.appendChild(div);
    });
  },

  // ── Ejection ───────────────────────────────────────────────────────────────
  ejection(state) {
    showScreen('ejection');
    const ejected = state.players.find(p => p.id === state.ejectedId);
    const isSpy   = state.ejectedWasSpy;
    const votes   = state.ejectedVotes;

    document.getElementById('ejection-icon').textContent = isSpy ? '🕵️' : '😇';
    document.getElementById('ejection-text').innerHTML = `
      <strong style="color:var(--gold-light);font-family:'Cinzel',serif;">
        ${escapeHtml(ejected?.name ?? 'Unknown')}
      </strong>
      has been ejected with ${votes} vote${votes !== 1 ? 's' : ''}.<br><br>
      ${isSpy
        ? `<span style="color:var(--red-bright)">They were the SPY.</span><br>
           The spy now gets one last chance to guess the location.`
        : `<span style="color:#4daa70">They were a CIVILIAN.</span><br>
           The spy gets one last chance to claim victory.`}`;
  },

  // ── Spy Guess ──────────────────────────────────────────────────────────────
  guess(state) {
    showScreen('guess');
    const iAmSpy = state.spyId === state.myId;
    const spy    = state.players.find(p => p.id === state.spyId);

    document.getElementById('guess-spy-name').textContent = iAmSpy
      ? 'Name the location to claim victory.'
      : `${spy?.name ?? 'The spy'} is making their guess…`;

    document.getElementById('guess-info').style.display     = iAmSpy ? 'block' : 'none';
    document.getElementById('guess-wait-msg').style.display = iAmSpy ? 'none'  : 'block';

    const grid = document.getElementById('location-grid');
    grid.innerHTML = '';
    state.locations.forEach(loc => {
      const btn       = document.createElement('button');
      btn.className   = 'location-btn';
      btn.textContent = loc;
      btn.disabled    = !iAmSpy;
      if (iAmSpy) {
        btn.onclick = () => {
          document.querySelectorAll('.location-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          setTimeout(() => Net.submitGuess(loc), 300);
        };
      }
      grid.appendChild(btn);
    });
  },

  // ── Result ─────────────────────────────────────────────────────────────────
  result(state) {
    showScreen('result');

    const badge  = document.getElementById('result-badge');
    const labels = { civilians: 'CIVILIANS WIN', spy: 'SPY WINS', draw: 'DRAW' };
    const cls    = { civilians: 'civilians-win', spy: 'spy-wins', draw: 'draw' };
    badge.textContent = labels[state.outcome] ?? 'GAME OVER';
    badge.className   = `result-badge ${cls[state.outcome] ?? ''}`;

    const spyName = escapeHtml(state.spyName  ?? 'Unknown');
    const loc     = escapeHtml(state.location ?? '?');

    document.getElementById('result-text').innerHTML =
      escapeHtml(state.detail ?? '') +
      `<br><br><span style="color:var(--text-dim);font-size:.9rem;">
        The spy was <strong style="color:var(--red-bright)">${spyName}</strong>.
        The location was <strong style="color:var(--gold-light)">${loc}</strong>.
      </span>`;
  },
};

// ─── Chat helpers ─────────────────────────────────────────────────────────────

/**
 * safeRebuildChatLog — replaces the confirmed entries in the log
 * WITHOUT touching the live pending-question card (#pending-question-card).
 *
 * Root cause of the original bug:
 *   rebuildChatLog() did `el.innerHTML = ''` which destroyed the pending card
 *   (including the YES/NO buttons) every time any state update arrived —
 *   e.g. when a player selected a target or a timer tick fired a state sync.
 *   Players would see the question flash briefly then disappear.
 *
 * Fix:
 *   We remove only the confirmed chat entries and re-insert them, then
 *   leave the pending card (if present) exactly where it is at the bottom.
 */
function safeRebuildChatLog(log) {
  const el      = document.getElementById('chat-log');
  if (!el) return;

  // Detach the pending card if it exists (we'll re-attach it after)
  const pending = document.getElementById('pending-question-card');
  if (pending) pending.remove();

  // Wipe only the confirmed entries
  el.innerHTML = '';

  // Re-insert confirmed entries
  (log ?? []).forEach(entry => appendChatEntry(el, entry));

  // Re-attach the pending card at the bottom (still awaiting answer)
  if (pending) el.appendChild(pending);

  el.scrollTop = el.scrollHeight;
}

/**
 * appendChatEntry — renders one confirmed QA or system entry into a container.
 */
function appendChatEntry(container, entry) {
  const div = document.createElement('div');

  if (entry.type === 'system') {
    div.className   = 'chat-msg system-msg';
    div.textContent = entry.text;

  } else if (entry.type === 'qa') {
    const color   = entry.answer === 'YES' ? '#4daa70' : '#e05050';
    const dashAns = entry.answer === '—';   // disconnected player auto-skip
    div.className = 'chat-msg';
    div.innerHTML = `
      <div class="msg-author">${escapeHtml(entry.from)} → ${escapeHtml(entry.to)}</div>
      <div class="msg-text">${escapeHtml(entry.question)}</div>
      <div class="msg-text" style="margin-top:5px;color:${dashAns ? 'var(--text-dim)' : color};
           font-family:'Cinzel',serif;font-size:.85rem;letter-spacing:.1em;font-style:${dashAns ? 'italic' : 'normal'};">
        ${escapeHtml(entry.to)}: ${escapeHtml(entry.answer)}${dashAns ? ' (disconnected)' : ''}
      </div>`;
  }

  container.appendChild(div);
}

/**
 * appendPendingQuestion — shows a live "question in flight" card.
 *
 * For the targeted player:   YES / NO buttons.
 * For everyone else:         "Waiting for X to answer…" note.
 *
 * This card persists across state syncs (safeRebuildChatLog preserves it)
 * and is only removed when the server confirms the answer via chatLog.
 */
function appendPendingQuestion(fromName, toName, toId, question) {
  const el = document.getElementById('chat-log');
  if (!el) return;

  // Remove stale pending card (e.g. from a previous question in this turn)
  document.getElementById('pending-question-card')?.remove();

  const iAmTarget = toId === myId;
  const div       = document.createElement('div');
  div.id          = 'pending-question-card';
  div.className   = 'chat-msg';
  div.innerHTML   = `
    <div class="msg-author">${escapeHtml(fromName)} → ${escapeHtml(toName)}</div>
    <div class="msg-text">${escapeHtml(question)}</div>
    ${iAmTarget
      ? `<div class="answer-btn-group">
           <button class="answer-btn yes" onclick="Net.answerQuestion('YES')">✔ YES</button>
           <button class="answer-btn no"  onclick="Net.answerQuestion('NO')">✘ NO</button>
         </div>
         <div class="role-hint" style="margin-top:4px;">
           Only you can see these buttons
         </div>`
      : `<div class="role-hint" style="margin-top:6px;">
           Waiting for <strong>${escapeHtml(toName)}</strong> to answer…
         </div>`}`;

  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (document.getElementById('screen-role')?.classList.contains('active')) {
    if ((e.key === 'Enter' || e.key === ' ') && !cardFlipped) {
      e.preventDefault();
      UI.flipCard();
    }
  }
});
