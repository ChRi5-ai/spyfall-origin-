// ============================================================
// SERVER/GAME-TIMER.JS — Discussion timer for Spyfall 2D
// ============================================================
// Owns the server-side countdown for a room's discussion phase. The
// server's own setTimeout is what actually decides when time is up —
// clients are told a duration and an absolute end timestamp so they
// can render a synced countdown locally, but the phase transition
// itself only ever happens here, never based on a client claiming
// its clock ran out.
//
// Keyed by room code rather than stored on the room object itself,
// so this module owns its own bookkeeping (the timeout handle) fully
// separately from general room/game state.
// ------------------------------------------------------------

const activeTimers = {}; // roomCode -> { timeoutHandle, endsAt, durationMs }

// Starts (or restarts) a room's discussion timer. `onExpire` is called
// with no arguments once the timer naturally reaches zero — it is
// NOT called if the timer is cleared early via clearTimer.
// Returns { endsAt, durationMs } for the caller to pass along to
// clients.
function startTimer(room, timerMinutes, onExpire) {
  clearTimer(room);

  const durationMs = timerMinutes * 60 * 1000;
  const endsAt = Date.now() + durationMs;

  const timeoutHandle = setTimeout(() => {
    delete activeTimers[room.code];
    onExpire();
  }, durationMs);

  activeTimers[room.code] = { timeoutHandle, endsAt, durationMs };

  return { endsAt, durationMs };
}

function clearTimer(room) {
  const existing = activeTimers[room.code];
  if (existing) {
    clearTimeout(existing.timeoutHandle);
    delete activeTimers[room.code];
  }
}

function getTimerInfo(room) {
  const existing = activeTimers[room.code];
  if (!existing) return null;
  return { endsAt: existing.endsAt, durationMs: existing.durationMs };
}

// PHASE 9A ADDITIONS — pausing/resuming for the conference room
// transition. Neither of these touches startTimer/clearTimer/
// getTimerInfo above; they're purely additive so nothing that already
// depends on this module's existing behavior is affected.

// Pauses a running timer, remembering how much time was left so it
// can be resumed later from the same point rather than restarting.
// Returns { remainingMs } or null if there was no active timer.
function pauseTimer(room) {
  const existing = activeTimers[room.code];
  if (!existing || !existing.timeoutHandle) return null;

  clearTimeout(existing.timeoutHandle);
  const remainingMs = Math.max(0, existing.endsAt - Date.now());
  activeTimers[room.code] = {
    ...existing,
    timeoutHandle: null,
    remainingMs,
  };
  return { remainingMs };
}

// Resumes a previously-paused timer from its remaining duration.
// Returns { endsAt, durationMs } (the new end time), or null if
// there was nothing paused to resume.
function resumeTimer(room, onExpire) {
  const existing = activeTimers[room.code];
  if (!existing || existing.remainingMs == null) return null;

  const remainingMs = existing.remainingMs;
  const endsAt = Date.now() + remainingMs;
  const timeoutHandle = setTimeout(() => {
    delete activeTimers[room.code];
    onExpire();
  }, remainingMs);

  activeTimers[room.code] = { timeoutHandle, endsAt, durationMs: existing.durationMs };
  return { endsAt, durationMs: remainingMs };
}

module.exports = { startTimer, clearTimer, getTimerInfo, pauseTimer, resumeTimer };
