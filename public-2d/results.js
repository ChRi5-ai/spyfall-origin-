// ============================================================
// PUBLIC-2D/RESULTS.JS — Results screen (client side)
// ============================================================
// Renders whatever the server's public 'resultsReady' event says —
// winner, the real spy's name, the correct location, and every
// player's actual role. All of this is intentionally public once a
// match has ended, unlike the private per-player role reveal at the
// start of the match (role-reveal.js).
//
// "Play Again" and "Return to Lobby" both call the same 'playAgain'
// event — see server/movement-network.js's comment for why: the
// Phase 9B spec describes both as landing on the same destination
// state (room stays active, characters preserved, host can start
// again), so this module doesn't invent two different behaviors for
// what the server treats as one action. Only the host's click will
// actually succeed; a non-host click surfaces the server's rejection.
// ============================================================

import socket from './socket.js';

let selfId = null;
let currentHostId = null;

const conferencePanelEl = document.getElementById('conference-panel');
const eliminationPanelEl = document.getElementById('elimination-panel');
const spyGuessPanelEl = document.getElementById('spy-guess-panel');

const resultsPanelEl = document.getElementById('results-panel');
const resultsWinnerEl = document.getElementById('results-winner');
const resultsSpyEl = document.getElementById('results-spy');
const resultsLocationEl = document.getElementById('results-location');
const resultsPlayersEl = document.getElementById('results-players');
const playAgainBtn = document.getElementById('play-again-btn');
const returnToLobbyBtn = document.getElementById('return-to-lobby-btn');
const resultsErrorEl = document.getElementById('results-error');

const WINNER_LABELS = {
  SPY_WINS: 'SPY WINS',
  CIVILIANS_WIN: 'CIVILIANS WIN',
  DRAW: 'DRAW — Both teams played well.',
};

socket.on('self', ({ id }) => {
  selfId = id;
});

// Reused from the lobby snapshot purely to know who the host is, so
// this module can decide whether to show the button as usable — the
// server independently re-validates on click regardless.
socket.on('lobby', (lobby) => {
  currentHostId = lobby.hostId;
});

function renderResults({ winner, spyName, correctLocation, players }) {
  conferencePanelEl.classList.add('hidden');
  eliminationPanelEl.classList.add('hidden');
  spyGuessPanelEl.classList.add('hidden');

  resultsErrorEl.textContent = '';
  resultsWinnerEl.textContent = WINNER_LABELS[winner] || winner;
  resultsSpyEl.textContent = spyName;
  resultsLocationEl.textContent = correctLocation;

  resultsPlayersEl.innerHTML = '';
  for (const player of players) {
    const li = document.createElement('li');
    li.textContent = `${player.name} — ${player.role}`;
    resultsPlayersEl.appendChild(li);
  }

  const isHost = selfId === currentHostId;
  playAgainBtn.disabled = !isHost;
  returnToLobbyBtn.disabled = !isHost;

  resultsPanelEl.classList.remove('hidden');
}

function requestPlayAgain() {
  socket.emit('playAgain', {}, (res) => {
    if (res?.error) {
      resultsErrorEl.textContent = res.error;
    }
  });
}

playAgainBtn.addEventListener('click', requestPlayAgain);
returnToLobbyBtn.addEventListener('click', requestPlayAgain);

socket.on('resultsReady', renderResults);

socket.on('returnToLobby', () => {
  resultsPanelEl.classList.add('hidden');
});
