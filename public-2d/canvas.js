// ============================================================
// CANVAS.JS — Rendering entry point for Spyfall 2D
// ============================================================
// Phase 3 scope: continuously render the static map plus every
// connected player's placeholder square + name label, at whatever
// positions network.js last received from the server.
//
// This module only reads state — it never computes movement and
// never touches the socket. That logic lives in movement.js
// (server) and network.js (client) respectively. It doesn't know or
// care how many players there are; it just draws whatever roster
// array it's given each frame.
//
// Deliberate placeholders for future phases:
//   - sprite art instead of the flat-color square
//   - visually distinguishing "self" from other players
//   - camera/viewport logic (only if multiple areas are added)
// ============================================================

import { TILE_SIZE, MAP_WIDTH_TILES, MAP_HEIGHT_TILES, getPlaceholderMap, getTileColor } from './world.js';
import { getLatestPlayers } from './network.js';

const PLAYER_SIZE = 28; // must match server/movement.js PLAYER_SIZE
const LABEL_COLOR = '#f1faee';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const placeholderMap = getPlaceholderMap(); // static for Phase 3, computed once

function drawMap() {
  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    for (let x = 0; x < MAP_WIDTH_TILES; x++) {
      ctx.fillStyle = getTileColor(placeholderMap[y][x]);
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
}

function drawPlayer(player) {
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE);

  ctx.fillStyle = LABEL_COLOR;
  ctx.font = '12px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(player.name, player.x + PLAYER_SIZE / 2, player.y - 6);
}

function renderLoop() {
  drawMap();
  for (const player of getLatestPlayers()) {
    drawPlayer(player);
  }
  requestAnimationFrame(renderLoop);
}

requestAnimationFrame(renderLoop);
