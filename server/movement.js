// ============================================================
// SERVER/MOVEMENT.JS — Server-authoritative player movement
// ============================================================
// This module owns all movement math for Spyfall 2D. The server
// is the single source of truth for player position: clients only
// ever send *input* (which keys are held), never a position, and
// this module is what turns that input into an actual (x, y).
//
// NOTE on map constants: these mirror public-2d/world.js (TILE_SIZE,
// MAP_WIDTH_TILES, MAP_HEIGHT_TILES). They're duplicated here rather
// than imported because the client module is ESM (`export`) and this
// server module is CommonJS (`require`). Duplication is an intentional
// tradeoff for Phase 2 — if the map grows or changes, both files need
// updating together. A follow-up recommendation is to extract these
// into a shared JSON config both sides can load, once the map stops
// being a placeholder (see recommendations in the Phase 2 summary).
// ------------------------------------------------------------

const TILE_SIZE = 40;
const MAP_WIDTH_TILES = 20;
const MAP_HEIGHT_TILES = 15;

const MAP_PIXEL_WIDTH = MAP_WIDTH_TILES * TILE_SIZE;
const MAP_PIXEL_HEIGHT = MAP_HEIGHT_TILES * TILE_SIZE;

const PLAYER_SIZE = 28;   // px — placeholder square, smaller than a tile
const MOVE_SPEED = 160;   // px per second

// world.js draws a 1-tile wall border around the map, so the playable
// area (for collision purposes) is inset by one tile on every side.
// This is edge-of-map collision only, per Phase 2 scope — no interior
// obstacles yet.
const MIN_X = TILE_SIZE;
const MIN_Y = TILE_SIZE;
const MAX_X = MAP_PIXEL_WIDTH - TILE_SIZE - PLAYER_SIZE;
const MAX_Y = MAP_PIXEL_HEIGHT - TILE_SIZE - PLAYER_SIZE;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Creates a fresh server-side player record. Spawns centered on the map.
// `id` and `color` are opaque identity fields owned by the networking
// layer (see server/movement-network.js) — movement.js doesn't care what
// they are, it just carries them alongside position so callers don't
// need to merge two separate objects back together every tick.
function createPlayerState(id, name, color) {
  // Small random spawn offset so simultaneous connections aren't stacked
  // exactly on top of one another (purely cosmetic — same clamp bounds
  // and movement rules apply to everyone regardless of spawn point).
  const offsetX = (Math.random() - 0.5) * 80;
  const offsetY = (Math.random() - 0.5) * 80;
  return {
    id,
    name,
    color,
    x: clamp(MAP_PIXEL_WIDTH / 2 - PLAYER_SIZE / 2 + offsetX, MIN_X, MAX_X),
    y: clamp(MAP_PIXEL_HEIGHT / 2 - PLAYER_SIZE / 2 + offsetY, MIN_Y, MAX_Y),
    input: { up: false, down: false, left: false, right: false },
  };
}

// Advances one player's position by dtSeconds, based on their currently
// held input. Called once per player per server tick — see server.js's
// movement loop. Mutates and returns the player object.
function stepPlayer(player, dtSeconds) {
  let dx = 0;
  let dy = 0;
  if (player.input.up) dy -= 1;
  if (player.input.down) dy += 1;
  if (player.input.left) dx -= 1;
  if (player.input.right) dx += 1;

  if (dx !== 0 && dy !== 0) {
    // Normalize diagonal movement so it isn't faster than
    // moving in a single direction (1/sqrt(2) per axis).
    const norm = Math.SQRT1_2;
    dx *= norm;
    dy *= norm;
  }

  player.x = clamp(player.x + dx * MOVE_SPEED * dtSeconds, MIN_X, MAX_X);
  player.y = clamp(player.y + dy * MOVE_SPEED * dtSeconds, MIN_Y, MAX_Y);

  return player;
}

// Validates an incoming input payload from a client, discarding anything
// malformed instead of trusting it directly. This is the server's guard
// against a malicious or buggy client sending garbage input data.
function sanitizeInput(rawInput) {
  if (!rawInput || typeof rawInput !== 'object') {
    return { up: false, down: false, left: false, right: false };
  }
  return {
    up: !!rawInput.up,
    down: !!rawInput.down,
    left: !!rawInput.left,
    right: !!rawInput.right,
  };
}

module.exports = {
  createPlayerState,
  stepPlayer,
  sanitizeInput,
  PLAYER_SIZE,
  MOVE_SPEED,
  MAP_PIXEL_WIDTH,
  MAP_PIXEL_HEIGHT,
};
