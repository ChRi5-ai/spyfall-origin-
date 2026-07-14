// ============================================================
// PUBLIC-2D/VOTE-REQUEST.JS — Call Vote UI (client side)
// ============================================================
// Owns the "Call Vote" button and the accept/decline prompt shown to
// everyone else when someone calls one. Never decides on its own
// whether a vote passes — that's entirely server-side (see
// server/vote-request.js). This module only sends requests/responses
// and renders whatever the server broadcasts back.
//
// Kept separate from conference.js: a vote *request* can be declined
// and go nowhere, so its lifecycle is distinct from the conference
// room itself, which only exists once a request has been approved.
// ============================================================

import socket from './socket.js';

let selfId = null;

const callVoteBtn = document.getElementById('call-vote-btn');
const promptEl = document.getElementById('vote-request-prompt');
const promptTextEl = document.getElementById('vote-request-text');
const acceptBtn = document.getElementById('vote-request-accept');
const declineBtn = document.getElementById('vote-request-decline');
const statusEl = document.getElementById('vote-request-status');

socket.on('self', ({ id }) => {
  selfId = id;
});

// game-start.js (unmodified) owns the lobby -> gameplay transition
// itself; this only adds showing the Call Vote button at that same
// moment, without touching that existing file.
socket.on('gameStart', () => {
  callVoteBtn.classList.remove('hidden');
});

callVoteBtn.addEventListener('click', () => {
  socket.emit('callVote', {}, (res) => {
    if (res?.error) {
      statusEl.textContent = res.error;
    }
  });
});

socket.on('voteRequested', ({ callerId, callerName }) => {
  statusEl.textContent = '';
  // The caller already auto-accepted server-side — no need to show
  // them a prompt asking them to respond to their own request.
  if (callerId === selfId) return;

  promptTextEl.textContent = `${callerName} wants to start a vote.`;
  promptEl.classList.remove('hidden');

  const respond = (response) => {
    promptEl.classList.add('hidden');
    socket.emit('respondToVote', { response }, (res) => {
      if (res?.error) statusEl.textContent = res.error;
    });
  };

  acceptBtn.onclick = () => respond('accept');
  declineBtn.onclick = () => respond('decline');
});

socket.on('voteRequestClosed', () => {
  promptEl.classList.add('hidden');
  statusEl.textContent = 'Vote request declined. Discussion continues.';
  setTimeout(() => {
    statusEl.textContent = '';
  }, 3000);
});

socket.on('returnToLobby', () => {
  callVoteBtn.classList.add('hidden');
  promptEl.classList.add('hidden');
  statusEl.textContent = '';
});

// conference.js hides the whole gameplay UI (including this button)
// once voting actually starts — see its 'conferenceStart' handler —
// so there's nothing further for this module to do at that point.
