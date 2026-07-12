// ============================================================
// CANVAS.JS — Rendering entry point for Spyfall 2D
// ============================================================
// Phase 2 scope: continuously render the static map plus a single
// placeholder square representing this client's own player, using
// whatever position network.js last received from the server.
//
// This module only reads state — it never computes movement and
// never touches the socket. That logic lives in movement.js
// (server) and network.js (client) respectively.
//
// Deliberate placeholders for future phases:
//   - drawing other connected players (multiplayer avatars)
//   - sprite art instead of the flat-color square
//   - camera/viewport logic (only if multiple areas are added)
// ============================================================

import { TILE_SIZE, MAP_WIDTH_TILES, MAP_HEIGHT_TILES, getPlaceholderMap, getTileColor } from './world.js';
import { getLatestState } from './network.js';

const PLAYER_SIZE = 28; // must match server/movement.js PLAYER_SIZE
const PLAYER_COLOR = '#e63946';
const LABEL_COLOR = '#f1faee';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const placeholderMap = getPlaceholderMap(); // static for Phase 2, computed once

function drawMap() {
  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    for (let x = 0; x < MAP_WIDTH_TILES; x++) {
      ctx.fillStyle = getTileColor(placeholderMap[y][x]);
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
}

function drawPlayer(state) {
  if (!state) return; // no state received from server yet

  ctx.fillStyle = PLAYER_COLOR;
  ctx.fillRect(state.x, state.y, PLAYER_SIZE, PLAYER_SIZE);

  ctx.fillStyle = LABEL_COLOR;
  ctx.font = '12px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(state.name, state.x + PLAYER_SIZE / 2, state.y - 6);
}

function renderLoop() {
  drawMap();
  drawPlayer(getLatestState());
  requestAnimationFrame(renderLoop);
}

requestAnimationFrame(renderLoop);
