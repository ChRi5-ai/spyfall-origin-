// ============================================================
// PUBLIC-2D/SETTINGS.JS — Host settings UI (client side)
// ============================================================
// Owns the map/timer settings panel: host-only controls, read-only
// display for everyone else. Kept as its own module, separate from
// lobby.js (room info) and characters.js (character grid) even though
// all three render from the same 'lobby' snapshot — same pattern as
// the rest of Phase 5/6: each module owns its own slice of the DOM
// and reacts to the server independently.
//
// Never decides validity itself — every click just asks the server
// via 'updateSettings' and re-renders from whatever comes back. The
// server (settings.js) is the only place a change is ever actually
// applied.
// ============================================================

import socket from './socket.js';

let selfId = null;

const mapOptionsEl = document.getElementById('map-options');
const timerOptionsEl = document.getElementById('timer-options');
const settingsErrorEl = document.getElementById('settings-error');

// Mirrors server/settings.js's fixed option lists purely for
// rendering labels/buttons — the server remains the sole authority
// on which values are actually valid; this list is not trusted for
// validation, only for knowing what buttons to draw.
const MAPS = ['Garden', 'Office', 'Rooftop', 'City'];
const TIMER_OPTIONS_MINUTES = [8, 10, 15];

socket.on('self', ({ id }) => {
  selfId = id;
});

function requestSettingsChange(partialSettings) {
  socket.emit('updateSettings', partialSettings, (res) => {
    if (res?.error) {
      settingsErrorEl.textContent = res.error;
    } else {
      settingsErrorEl.textContent = '';
    }
  });
}

function renderSettings(lobby) {
  const isHost = lobby.hostId === selfId;
  const { map: currentMap, timerMinutes: currentTimer } = lobby.settings;

  mapOptionsEl.innerHTML = '';
  for (const map of MAPS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = map;
    btn.className = 'settings-option';
    if (map === currentMap) btn.classList.add('selected-option');
    if (!isHost || lobby.started) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => requestSettingsChange({ map }));
    }
    mapOptionsEl.appendChild(btn);
  }

  timerOptionsEl.innerHTML = '';
  for (const minutes of TIMER_OPTIONS_MINUTES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `${minutes} min`;
    btn.className = 'settings-option';
    if (minutes === currentTimer) btn.classList.add('selected-option');
    if (!isHost || lobby.started) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => requestSettingsChange({ timerMinutes: minutes }));
    }
    timerOptionsEl.appendChild(btn);
  }
}

socket.on('lobby', renderSettings);
