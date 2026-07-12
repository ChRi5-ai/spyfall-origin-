// ============================================================
// PUBLIC-2D/ROLE-REVEAL.JS — Role reveal display (client side)
// ============================================================
// Displays exactly what the server's private 'roleReveal' event told
// this client, and nothing else. This module has no way to learn any
// other player's role — the server only ever sends this event to the
// requesting player's own socket (see server/movement-network.js),
// so there is nothing here to leak even if this code were inspected
// or tampered with client-side.
// ============================================================

import socket from './socket.js';

const roleTitleEl = document.getElementById('role-title');
const roleDetailEl = document.getElementById('role-detail');

socket.on('roleReveal', (reveal) => {
  if (!reveal) return;

  if (reveal.role === 'spy') {
    roleTitleEl.textContent = 'YOU ARE';
    roleDetailEl.textContent = 'THE SPY';
  } else {
    roleTitleEl.textContent = 'LOCATION';
    roleDetailEl.textContent = reveal.location;
  }
});
