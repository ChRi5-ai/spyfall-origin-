/**
 * SPYFALL — Browser Client
 *
 * Net.*    — Socket.IO emit wrappers (client -> server)
 * Render.* — Screen renderers (state snapshot -> DOM)
 * UI.*     — UI helpers (panels, card flip, tutorial, settings, etc.)
 */

'use strict';

const socket = io({ autoConnect: true });

let myId            = null;
let currentState    = null;
let cardFlipped     = false;
let pendingAnswered  = false;
let lastChatLength = 0;


// ─── Utility ──────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
const UI = {

  /** Cover page -> fade out -> show title screen with entry animation */
  revealMenu() {
    const cover = document.getElementById('screen-cover');
    cover.classList.add('cover-exit');
    setTimeout(() => {
      cover.classList.remove('active');
      const title = document.getElementById('screen-title');
      title.classList.add('active', 'title-enter');
      setTimeout(() => title.classList.remove('title-enter'), 700);
    }, 500);
  },

  /** Toggle create / join sub-panels on the title screen */
  showPanel(which) {
    document.getElementById('panel-create').style.display = which === 'create' ? 'block' : 'none';
    document.getElementById('panel-join').style.display   = which === 'join'   ? 'block' : 'none';
    const inputId = which === 'create' ? 'create-name' : 'join-name';
    setTimeout(() => document.getElementById(inputId)?.focus(), 60);
  },

  /** Navigate to the tutorial screen */
  showTutorial() {
    showScreen('tutorial');
  },

  /** Return from tutorial back to title screen */
  closeTutorial() {
    showScreen('title');
  },

  /**
   * Called whenever the maxPlayers number input changes.
   * Clamps spyCount to the maximum allowed for the chosen player count
   * and updates the hint text next to the spy count label.
   */
  onMaxPlayersChange() {
    const maxP   = parseInt(document.getElementById('create-maxplayers').value) || 6;
    const maxSpy = maxP <= 5 ? 1 : maxP <= 8 ? 2 : 3;
    const spyEl  = document.getElementById('create-spycount');
    if (parseInt(spyEl.value) > maxSpy) spyEl.value = maxSpy;
    const hint = document.getElementById('spycount-hint');
    if (hint) hint.textContent = `(max ${maxSpy} for ${maxP} players)`;
  },

  /**
   * Increment / decrement a numeric input by delta, clamped to [min, max].
   * Used by the +/- stepper buttons on the create-room form.
   */
  adjustSetting(inputId, delta, min, max) {
    const el  = document.getElementById(inputId);
    if (!el) return;
    const val = Math.min(max, Math.max(min, (parseInt(el.value) || 0) + delta));
    el.value  = val;
    if (inputId === 'create-maxplayers') UI.onMaxPlayersChange();
  },

  /** Flip the role card (one-way; reveals the player's role) */
  flipCard() {
    if (cardFlipped) return;
    cardFlipped = true;
    document.getElementById('role-card').classList.add('flipped');
    setTimeout(() => {
      document.getElementById('role-ready-btn').style.display = 'block';
    }, 650);
  },

  /** Copy the room code to the clipboard */
  copyCode() {
    const code = document.getElementById('lobby-code').textContent.trim();
    if (!code || code === '----') return;
    navigator.clipboard?.writeText(code).catch(() => {});
  },

  /** Display an error message in the named element; auto-clears after 5 s */
  setError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    clearTimeout(el._t);
    if (msg) el._t = setTimeout(() => { el.textContent = ''; }, 5000);
  },
};

// ─── Net — Socket.IO emit wrappers ────────────────────────────────────────────
const Net = {

  createRoom() {
    const name       = document.getElementById('create-name').value.trim();
    const maxPlayers = parseInt(document.getElementById('create-maxplayers').value) || 6;
    const spyCount   = parseInt(document.getElementById('create-spycount').value)   || 1;
    UI.setError('create-error', '');
    if (!name) { UI.setError('create-error', 'Please enter a name.'); return; }
    socket.emit('createRoom', { name, maxPlayers, spyCount }, res => {
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

  selectTarget(targetId)  { socket.emit('selectTarget',   { targetId }); },

  sendQuestion() {
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();
    if (!text) return;
    socket.emit('sendQuestion', { text });
    input.value = '';
    input.focus();
  },

  answerQuestion(answer) {
    if (pendingAnswered) return;
    pendingAnswered = true;
    document.querySelectorAll('#pending-question-card .answer-btn')
      .forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
    socket.emit('answerQuestion', { answer });
  },

  requestVote()           { socket.emit('requestVote'); },
  castVote(votedForId)    { socket.emit('castVote',      { votedForId }); },
  proceedToGuess()        { socket.emit('proceedToGuess'); },
  submitGuess(location)   { socket.emit('submitGuess',   { location }); },
  playAgain()             { socket.emit('playAgain'); },
};

// ─── Socket events ────────────────────────────────────────────────────────────
socket.on('connect', () => { myId = socket.id; });

socket.on('disconnect', () => {
  showScreen('title');
  UI.setError('create-error', 'Disconnected. Refresh to reconnect.');
});

socket.on('state', state => {
  currentState = state;
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

socket.on('timerTick', ({ secondsLeft }) => {
  const el = document.getElementById('timer');
  if (!el) return;
  el.textContent = fmtTime(secondsLeft);
  el.classList.toggle('urgent', secondsLeft <= 30);
});

socket.on('questionPending', ({ fromName, toId, toName, question }) => {
  if (!document.getElementById('screen-discussion')?.classList.contains('active')) return;
  pendingAnswered = false;
  appendPendingQuestion(fromName, toName, toId, question);
});
socket.on('questionAsked', ({ from, to, question }) => {
  const state = currentState;
  if (!state) return;

  const target = state.players.find(p => p.name === to);
  if (!target) return;

  pendingAnswered = false;
  appendPendingQuestion(from, to, target.id, question);
});

// ─── Renderers ────────────────────────────────────────────────────────────────
const Render = {

  lobby(state) {
    showScreen('lobby');
    document.getElementById('lobby-code').textContent  = state.code;
    document.getElementById('lobby-count').textContent = state.players.length;
    document.getElementById('lobby-max').textContent   = state.settings?.maxPlayers ?? '?';
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

    const settingsEl = document.getElementById('lobby-settings-display');
    if (state.settings && settingsEl) {
      settingsEl.style.display = 'flex';
      settingsEl.innerHTML = `
        <span class="settings-pill">Max ${state.settings.maxPlayers} players</span>
        <span class="settings-pill">${state.settings.spyCount} spy${state.settings.spyCount > 1 ? 'ies' : ''}</span>`;
    }

    const isHost  = state.hostId === state.myId;
    const enough  = state.players.length >= 3;

    document.getElementById('lobby-host-controls').style.display = isHost ? 'block' : 'none';
    document.getElementById('lobby-wait-msg').style.display      = isHost ? 'none'  : 'block';

    if (isHost) {
      const btn       = document.getElementById('lobby-start-btn');
      btn.disabled    = !enough;
      btn.textContent = enough
        ? 'Start Game'
        : `Need ${3 - state.players.length} more player${3 - state.players.length !== 1 ? 's' : ''}`;
    }
  },

  reveal(state) {
    showScreen('role');
    if (!cardFlipped) {
      document.getElementById('role-card').classList.remove('flipped');
      document.getElementById('role-ready-btn').style.display    = 'none';
      document.getElementById('role-waiting-area').style.display = 'none';
    }

    const isSpy = state.role === 'spy';
    const back  = document.getElementById('role-back');
    back.className = `role-face back ${isSpy ? 'spy-role' : 'civilian-role'}`;
    back.innerHTML = isSpy
      ? `<div class="role-icon">&#x1F575;&#xFE0F;</div>
         <div class="role-title">SPY</div>
         <div class="role-hint">
           You don't know the location. Blend in. Don't get caught.
           <span style="color:var(--red);font-size:.8rem;margin-top:8px;display:block;">
             ${state.spyCount > 1 ? 'There are ' + state.spyCount + ' spies total.' : 'You are the only spy.'}
           </span>
         </div>`
      : `<div class="role-icon">&#x1F3DB;&#xFE0F;</div>
         <div class="role-title">CIVILIAN</div>
         <div class="role-location">${escapeHtml(state.location)}</div>
         <div class="role-hint">Find the spy. Don't reveal too much.</div>`;

    const pips = document.getElementById('ready-pips');
    pips.innerHTML = '';
    state.players.filter(p => p.connected).forEach(p => {
      const pip = document.createElement('div');
      pip.className = `ready-pip${p.ready ? ' done' : ''}`;
      pip.title     = p.name;
      pips.appendChild(pip);
    });
  },

  discussion(state) {
    showScreen('discussion');

    const me       = state.myId;
    const isMyTurn = state.currentTurnId === me;

    const timerEl = document.getElementById('timer');
    timerEl.textContent = fmtTime(state.secondsLeft);
    timerEl.classList.toggle('urgent', state.secondsLeft <= 30);

    document.getElementById('vote-badge').textContent =
      `${state.voteRequestCount}/${state.majorityNeeded}`;

    const asker  = state.players.find(p => p.id === state.currentTurnId);
    const target = state.players.find(p => p.id === state.targetId);
    const banner = document.getElementById('turn-banner');
    if (state.awaitingAnswer && target) {
      banner.textContent = `Awaiting ${target.name}'s answer...`;
    } else if (isMyTurn) {
      banner.textContent = target
        ? `Your turn — questioning: ${target.name}`
        : 'Your turn — select a player to question';
    } else {
      banner.textContent = asker
        ? `${asker.name}'s turn${target ? ' — questioning: ' + target.name : ''}`
        : '...';
    }

    const panel = document.getElementById('players-panel');
    panel.innerHTML = '';
    state.players.forEach(p => {
      const div       = document.createElement('div');
      const isCurrent = p.id === state.currentTurnId;
      const isTarget  = p.id === state.targetId;
      const canClick  = isMyTurn && !state.awaitingAnswer && p.id !== me;

      div.className = [
        'player-item',
        isCurrent    && 'current-turn',
        isTarget     && 'active-target',
        !p.connected && 'disconnected',
        canClick     && 'clickable',
      ].filter(Boolean).join(' ');

      div.innerHTML = `<div class="player-dot"></div>
        <span>${escapeHtml(p.name)}${p.id === me ? ' <em style="font-size:.7rem;color:var(--text-dim)">(you)</em>' : ''}${!p.connected ? ' \u26A0' : ''}</span>`;

      if (canClick) div.onclick = () => Net.selectTarget(p.id);
      panel.appendChild(div);
    });

   if (state.chatLog.length !== lastChatLength) {
    safeRebuildChatLog(state.chatLog);
    lastChatLength = state.chatLog.length;}
    

    const chatInput = document.getElementById('chat-input');
    const sendBtn   = document.getElementById('send-btn');
    const canType   = isMyTurn && !state.awaitingAnswer && !!state.targetId;
    chatInput.disabled = !canType;
    sendBtn.disabled   = !canType;
    chatInput.placeholder = !isMyTurn
      ? 'Waiting for your turn...'
      : state.awaitingAnswer
        ? 'Waiting for answer...'
        : !state.targetId
          ? 'Select a player to question first...'
          : 'Type a yes/no question...';
  },

  voting(state) {
    showScreen('voting');
    const currentVoterId = state.votingOrder?.[state.votingIndex];
    const voter          = state.players.find(p => p.id === currentVoterId);
    const isMyTurn       = currentVoterId === state.myId;

    document.getElementById('voting-instruction').textContent = isMyTurn
      ? 'Your turn — select the player you believe is the spy.'
      : `Waiting for ${voter?.name ?? '...'} to vote...`;
    UI.setError('vote-error', '');

    const grid = document.getElementById('vote-grid');
    grid.innerHTML = '';
    state.players.forEach(p => {
      if (p.id === currentVoterId) return;
      const div     = document.createElement('div');
      div.className = `vote-card${isMyTurn ? '' : ' disabled'}`;
      div.innerHTML = `<div class="vote-icon">\uD83D\uDC41</div><div class="vote-name">${escapeHtml(p.name)}</div>`;
      if (isMyTurn) div.onclick = () => Net.castVote(p.id);
      grid.appendChild(div);
    });
  },

  ejection(state) {
    showScreen('ejection');
    const ejected = state.players.find(p => p.id === state.ejectedId);
    const isSpy   = state.ejectedWasSpy;
    const votes   = state.ejectedVotes;
    document.getElementById('ejection-icon').textContent = isSpy ? '\uD83D\uDD75\uFE0F' : '\uD83D\uDE07';
    document.getElementById('ejection-text').innerHTML = `
      <strong style="color:var(--cyan);font-family:'Manrope',sans-serif;">
        ${escapeHtml(ejected?.name ?? 'Unknown')}
      </strong>
      has been ejected with ${votes} vote${votes !== 1 ? 's' : ''}.<br><br>
      ${isSpy
        ? '<span style="color:var(--red)">They were a SPY.</span><br>The spy/spies now get one last chance to guess the location.'
        : '<span style="color:var(--green)">They were a CIVILIAN.</span><br>The spy/spies get one last chance to claim victory.'}`;
  },

  guess(state) {
    showScreen('guess');
    const iAmCurrentSpy = state.currentGuessSpyId === state.myId;
    console.log("===== GUESS SCREEN =====");
console.log("myId:", state.myId);
console.log("currentGuessSpyId:", state.currentGuessSpyId);
console.log("iAmCurrentSpy:", iAmCurrentSpy);
    const currentSpy    = state.players.find(p => p.id === state.currentGuessSpyId);
    console.log("===== GUESS SCREEN =====");
console.log("myId:", state.myId);
console.log("currentGuessSpyId:", state.currentGuessSpyId);
console.log("iAmCurrentSpy:", iAmCurrentSpy);
    const spyIndex      = (state.spyIds ?? []).indexOf(state.currentGuessSpyId);
    const totalSpies    = (state.spyIds ?? []).length;

    const subtitle = totalSpies > 1
      ? `Spy ${spyIndex + 1} of ${totalSpies}: ${currentSpy?.name ?? '?'}`
      : (currentSpy?.name ?? 'The spy');

    document.getElementById('guess-spy-name').textContent = iAmCurrentSpy
      ? 'Name the location to claim victory.'
      : `${subtitle} is making their guess...`;

    document.getElementById('guess-info').style.display     = iAmCurrentSpy ? 'block' : 'none';
    document.getElementById('guess-wait-msg').style.display = iAmCurrentSpy ? 'none'  : 'block';

    const grid = document.getElementById('location-grid');
    grid.innerHTML = '';
    console.log("iAmCurrentSpy:", iAmCurrentSpy);
console.log("myId:", state.myId);
console.log("spyId:", state.spyId);
console.log(state);
    state.locations.forEach(loc => {
      const btn       = document.createElement('button');
      btn.className   = 'location-btn';
      btn.textContent = loc;
      btn.disabled    = !iAmCurrentSpy;
      if (iAmCurrentSpy) {
        btn.onclick = () => {
          document.querySelectorAll('.location-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          setTimeout(() => Net.submitGuess(loc), 300);
        };
      }
      grid.appendChild(btn);
    });
  },

  result(state) {
    showScreen('result');
    const badge  = document.getElementById('result-badge');
    const labels = { civilians: 'CIVILIANS WIN', spy: 'SPY WINS', draw: 'DRAW' };
    const cls    = { civilians: 'civilians-win', spy: 'spy-wins', draw: 'draw' };
    badge.textContent = labels[state.outcome] ?? 'GAME OVER';
    badge.className   = `result-badge ${cls[state.outcome] ?? ''}`;

    const spyLabel = (state.spyNames ?? []).join(' & ') || 'Unknown';
    const loc      = escapeHtml(state.location ?? '?');

    document.getElementById('result-text').innerHTML =
      escapeHtml(state.detail ?? '') +
      `<br><br><span style="color:var(--text-dim);font-size:.85rem;">
        The ${(state.spyIds?.length ?? 1) > 1 ? 'spies were' : 'spy was'}
        <strong style="color:var(--red)">${escapeHtml(spyLabel)}</strong>.
        The location was <strong style="color:var(--cyan)">${loc}</strong>.
      </span>`;
  },
};

// ─── Chat helpers ─────────────────────────────────────────────────────────────
function safeRebuildChatLog(log) {
  const el = document.getElementById('chat-log');
  if (!el) return;
  const pending = document.getElementById('pending-question-card');
  if (pending) pending.remove();
  el.innerHTML = '';
  (log ?? []).forEach(entry => appendChatEntry(el, entry));
  if (pending) el.appendChild(pending);
  el.scrollTop = el.scrollHeight;
}

function appendChatEntry(container, entry) {
  const div = document.createElement('div');
  if (entry.type === 'system') {
    div.className   = 'chat-msg system-msg';
    div.textContent = entry.text;
  } else if (entry.type === 'qa') {
    const isSkip  = entry.answer === '\u2014';
    const color   = isSkip ? 'var(--text-dim)' : entry.answer === 'YES' ? 'var(--green)' : 'var(--red)';
    div.className = 'chat-msg';
    div.innerHTML = `
      <div class="msg-author">${escapeHtml(entry.from)} \u2192 ${escapeHtml(entry.to)}</div>
      <div class="msg-text">${escapeHtml(entry.question)}</div>
      <div class="msg-text" style="margin-top:5px;color:${color};font-family:'Manrope',sans-serif;font-size:.82rem;font-weight:700;letter-spacing:.08em;font-style:${isSkip ? 'italic' : 'normal'}">
        ${escapeHtml(entry.to)}: ${escapeHtml(entry.answer)}${isSkip ? ' (disconnected)' : ''}
      </div>`;
  }
  container.appendChild(div);
}

function appendPendingQuestion(fromName, toName, toId, question) {
  const el = document.getElementById('chat-log');
  if (!el) return;
  document.getElementById('pending-question-card')?.remove();
  const iAmTarget = toId === myId;
  const div       = document.createElement('div');
  div.id          = 'pending-question-card';
  div.className   = 'chat-msg';
  div.innerHTML   = `
    <div class="msg-author">${escapeHtml(fromName)} \u2192 ${escapeHtml(toName)}</div>
    <div class="msg-text">${escapeHtml(question)}</div>
    ${iAmTarget
      ? `<div class="answer-btn-group">
           <button class="answer-btn yes" onclick="Net.answerQuestion('YES')">\u2714 YES</button>
           <button class="answer-btn no"  onclick="Net.answerQuestion('NO')">\u2718 NO</button>
         </div>
         <div class="role-hint" style="margin-top:4px;font-size:.72rem;color:var(--text-dim);">Only you can see these buttons</div>`
      : `<div class="role-hint" style="margin-top:6px;font-size:.78rem;color:var(--text-dim);">
           Waiting for <strong style="color:var(--text)">${escapeHtml(toName)}</strong> to answer...
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
