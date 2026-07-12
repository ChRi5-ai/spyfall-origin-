// ============================================================
// SERVER/SETTINGS.JS — Host lobby settings for Spyfall 2D
// ============================================================
// Owns the two host-configurable match settings — map and discussion
// timer — for a room. Same isolation pattern as characters.js: no
// sockets, no broadcasting, just validated state on the room object
// (room.settings), so the rules here stay easy to review on their own.
//
// The server is the sole authority on these values. A client can only
// ever *request* a change via 'updateSettings'; this module is what
// decides whether that request is from the host and whether the
// requested values are actually valid options.
// ------------------------------------------------------------

const MAPS = ['Garden', 'Office', 'Rooftop', 'City'];
const TIMER_OPTIONS_MINUTES = [8, 10, 15];

const DEFAULT_MAP = MAPS[0];
const DEFAULT_TIMER_MINUTES = TIMER_OPTIONS_MINUTES[0];

function ensureSettingsInitialized(room) {
  if (!room.settings) {
    room.settings = {
      map: DEFAULT_MAP,
      timerMinutes: DEFAULT_TIMER_MINUTES,
    };
  }
}

function isValidMap(map) {
  return MAPS.includes(map);
}

function isValidTimer(timerMinutes) {
  return TIMER_OPTIONS_MINUTES.includes(timerMinutes);
}

// Attempts to apply a settings change requested by `socketId`. Either
// or both of `map` / `timerMinutes` may be provided — only the
// provided field(s) are validated and changed. Returns
// { success: true } or { error: string }.
function updateSettings(room, socketId, { map, timerMinutes } = {}) {
  ensureSettingsInitialized(room);

  if (room.hostId !== socketId) {
    return { error: 'Only the host can change settings.' };
  }
  if (map !== undefined && !isValidMap(map)) {
    return { error: 'That is not a valid map.' };
  }
  if (timerMinutes !== undefined && !isValidTimer(timerMinutes)) {
    return { error: 'That is not a valid timer option.' };
  }

  if (map !== undefined) room.settings.map = map;
  if (timerMinutes !== undefined) room.settings.timerMinutes = timerMinutes;

  return { success: true };
}

function getSettings(room) {
  ensureSettingsInitialized(room);
  return { ...room.settings };
}

module.exports = {
  MAPS,
  TIMER_OPTIONS_MINUTES,
  updateSettings,
  getSettings,
  isValidMap,
  isValidTimer,
};
