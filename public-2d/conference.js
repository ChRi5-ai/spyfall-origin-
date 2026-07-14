// ============================================================
// PUBLIC-2D/CONFERENCE.JS — Conference room (client side)
// ============================================================
// Renders the placeholder conference room once the server broadcasts
// 'conferenceStart', arranges connected players in a circle, and
// handles casting a vote. Movement is disabled entirely server-side
// (see movement-network.js's tick loop skipping stepPlayer while
// room.game.phase === 'voting') — this module doesn't need to touch
// input.js at all; held keys simply stop having any effect.
//
// Never decides who's allowed to vote for whom — every click just
// asks the server via 'castVote' and reflects whatever comes back.
// ============================================================

import socket from './socket.js';

let selfId = null;
let hasVoted = false;

const gameplayPanelEl = document.getElementById('gameplay-panel');
const callVoteBtn = document.getElementById('call-vote-btn');

const conferencePanelEl = document.getElementById('conference-panel');
const conferenceTableEl = document.getElementById('conference-table');
const conferenceStatusEl = document.getElementById('conference-status');

socket.on('self', ({ id }) => {
  selfId = id;
});

function renderTable(players) {
  conferenceTableEl.innerHTML = '';

  const radius = 140;
  const centerX = 160;
  const centerY = 160;

  players.forEach((player, index) => {
    const angle = (index / players.length) * 2 * Math.PI;
    const x = centerX + radius * Math.cos(angle) - 30;
    const y = centerY + radius * Math.sin(angle) - 30;

    const seat = document.createElement('button');
    seat.type = 'button';
    seat.className = 'conference-seat';
    seat.style.left = `${x}px`;
    seat.style.top = `${y}px`;

    const characterLabel = player.characterId ? player.characterId.replace('char-', '') : '?';
    seat.innerHTML = `<span class="conference-seat-character">${characterLabel}</span><span class="conference-seat-name">${player.name}</span>`;

    if (player.id === selfId) {
      seat.disabled = true;
      seat.classList.add('conference-seat-self');
    } else {
      seat.addEventListener('click', () => castVote(player.id));
    }

    conferenceTableEl.appendChild(seat);
  });
}

function castVote(targetId) {
  if (hasVoted) return;
  socket.emit('castVote', { targetId }, (res) => {
    if (res?.error) {
      conferenceStatusEl.textContent = res.error;
      return;
    }
    hasVoted = true;
    conferenceStatusEl.textContent = 'Vote Submitted';
  });
}

socket.on('conferenceStart', ({ players }) => {
  hasVoted = false;
  conferenceStatusEl.textContent = '';

  gameplayPanelEl.classList.add('hidden');
  callVoteBtn.classList.add('hidden');
  conferencePanelEl.classList.remove('hidden');

  renderTable(players);
});

socket.on('conferenceResult', ({ tie }) => {
  if (tie) {
    conferenceStatusEl.textContent = 'No one has been eliminated.';
    setTimeout(() => {
      conferencePanelEl.classList.add('hidden');
      gameplayPanelEl.classList.remove('hidden');
      callVoteBtn.classList.remove('hidden');
    }, 2000);
  } else {
    // Per spec: voting has ended and an elimination was determined,
    // but nothing is revealed yet — that's Phase 9B. Stay on this
    // screen rather than returning to the map.
    conferenceStatusEl.textContent = 'Voting has ended.';
  }
});
