// ============================================================
// PUBLIC-2D/PLAYER-ANIMATION.JS — Facing/walking animation state
// ============================================================
// Purely a rendering concern: the server only ever sends (x, y) per
// player (see network.js's 'state' snapshots) — it has no concept of
// "facing direction" or "is walking," and this module doesn't ask it
// to. Instead, this infers both from position changes over time. This
// is the same "server owns movement, client only renders what it's
// told" boundary already used everywhere else — nothing here feeds
// back into movement.js or the tick loop; it only reads positions
// canvas.js already receives.
//
// PHASE 10.4 FIX: movement detection is no longer based on comparing
// position between consecutive render calls. The render loop runs at
// the browser's frame rate (~60fps via requestAnimationFrame), but
// the server only broadcasts new positions at its fixed 30Hz tick
// rate (see server/movement-network.js) — so on roughly half of all
// render frames, a player's position simply hasn't changed yet
// because no new network update has arrived, not because they
// stopped moving. Comparing every render frame to the previous one
// read that as "stopped" on those frames, snapping the animation back
// to idle and only showing a walk frame for the single frame a new
// position happened to land on — the "stuck on idle" symptom.
//
// The fix: only update facing/"last seen moving" when a position
// ACTUALLY differs from the last one observed (i.e. a real network
// update arrived), and keep `moving` true for a short window after
// that — long enough to bridge the gap until the next expected
// update, so continuous movement reads as continuously walking
// instead of flickering. This never touches movement.js, the tick
// loop, or anything server-authoritative; it only smooths over the
// render-rate vs. network-rate mismatch for animation purposes.
// ============================================================

import { getRowForState } from './sprites.js';

const MOVE_THRESHOLD = 0.5; // px — below this, a position "change" is just floating-point noise
const FRAME_INTERVAL_MS = 140; // how long each of the 4 walk frames is held

// The server ticks at 30Hz (~33ms between position updates). This
// window needs to comfortably bridge that gap — generous enough to
// never falsely drop to idle between two consecutive real updates
// while someone is genuinely still moving, but still short enough to
// return to idle promptly (well under human perception of "instant")
// once they actually stop.
const STOP_TIMEOUT_MS = 120;

const states = {}; // playerId -> { facing, moving, frameIndex, frameElapsedMs, lastX, lastY, lastMoveObservedAt }

function ensureState(playerId, x, y, now) {
  if (!states[playerId]) {
    states[playerId] = {
      facing: 'down',
      moving: false,
      frameIndex: 0,
      frameElapsedMs: 0,
      lastX: x,
      lastY: y,
      lastMoveObservedAt: now,
    };
  }
  return states[playerId];
}

// Call once per render frame with the current player roster (as
// received from network.js) and the elapsed time since last frame.
// Mutates and returns nothing — read back via getFrameForPlayer.
function updateAnimations(players, dtMs) {
  const now = Date.now();

  for (const player of players) {
    const state = ensureState(player.id, player.x, player.y, now);

    const dx = player.x - state.lastX;
    const dy = player.y - state.lastY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > MOVE_THRESHOLD) {
      // A genuinely new position arrived since we last checked (not
      // just an unchanged value re-read on a render frame the network
      // hasn't caught up to yet). Update facing from it, and record
      // that we just saw real movement.
      if (Math.abs(dx) > Math.abs(dy)) {
        state.facing = dx > 0 ? 'right' : 'left';
      } else {
        state.facing = dy > 0 ? 'down' : 'up';
      }
      state.lastMoveObservedAt = now;
      state.lastX = player.x;
      state.lastY = player.y;
    }

    // "Moving" means real movement was observed recently — not
    // necessarily on this exact frame. This is what bridges the gap
    // between the server's slower update rate and the faster render
    // loop: as long as new positions keep arriving within
    // STOP_TIMEOUT_MS of each other (true whenever someone is
    // continuously walking, since the server updates every ~33ms,
    // well under this window), `moving` stays continuously true.
    state.moving = now - state.lastMoveObservedAt < STOP_TIMEOUT_MS;

    if (state.moving) {
      state.frameElapsedMs += dtMs;
      if (state.frameElapsedMs >= FRAME_INTERVAL_MS) {
        state.frameElapsedMs = 0;
        state.frameIndex = (state.frameIndex + 1) % 4;
      }
    } else {
      state.frameIndex = 0;
      state.frameElapsedMs = 0;
    }
  }
}

// Returns { row, col } ready to pass into sprites.js's
// drawSpriteFrame for the given player, or a safe idle-down default
// if this player hasn't been tracked yet (e.g. the very first frame
// they appear).
function getFrameForPlayer(playerId) {
  const state = states[playerId];
  if (!state) return { row: getRowForState('down', false), col: 0 };
  return { row: getRowForState(state.facing, state.moving), col: state.frameIndex };
}

// Drops tracking for players no longer in the roster (e.g. someone
// disconnected), so this doesn't grow unbounded across a long session.
function pruneStaleStates(currentPlayerIds) {
  const idSet = new Set(currentPlayerIds);
  for (const id of Object.keys(states)) {
    if (!idSet.has(id)) delete states[id];
  }
}

export { updateAnimations, getFrameForPlayer, pruneStaleStates };
