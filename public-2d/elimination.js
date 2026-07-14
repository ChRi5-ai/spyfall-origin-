// ============================================================
// PUBLIC-2D/ELIMINATION.JS — Elimination reveal (client side)
// ============================================================
// Displays the server's public 'eliminationReveal' — who was
// eliminated and whether they were the spy. Unlike role-reveal.js
// (which only ever shows this client's own private role), this
// event and its contents are the same for every player, since an
// elimination reveal is public information by design.
//
// Placeholder only, per Phase 9B scope — no animation, just the
// information itself.
// ============================================================

import socket from './socket.js';

const conferencePanelEl = document.getElementById('conference-panel');
const eliminationPanelEl = document.getElementById('elimination-panel');
const eliminationTextEl = document.getElementById('elimination-text');

socket.on('eliminationReveal', ({ eliminatedName, wasSpy }) => {
  // The conference table stays up through voting (including its
  // "Voting has ended." status), but this reveal is a distinct next
  // step, so it takes over the screen.
  conferencePanelEl.classList.add('hidden');

  eliminationTextEl.textContent = wasSpy
    ? `${eliminatedName} has been eliminated. They were the SPY.`
    : `${eliminatedName} has been eliminated. They were a CIVILIAN.`;
  eliminationPanelEl.classList.remove('hidden');
});

socket.on('returnToLobby', () => {
  eliminationPanelEl.classList.add('hidden');
});
