// ============================================================
// CANVAS.JS — Rendering entry point for Spyfall 2D
// ============================================================
// Continuously renders the static map plus every connected player,
// at whatever positions network.js last received from the server.
//
// This module only reads state — it never computes movement and
// never touches the socket. That logic lives in movement.js
// (server) and network.js (client) respectively. It doesn't know or
// care how many players there are; it just draws whatever roster
// array it's given each frame.
//
// PHASE 10.3: player rendering now draws each player's selected
// character sprite (via sprites.js) instead of a flat colored
// square, with idle/walking animation state derived by
// player-animation.js. The codename label above each player is
// unchanged in spirit — it's still just player.name, which now holds
// whatever codename the player entered (see lobby.js), rather than
// an auto-generated "Player N".
// ============================================================

import { TILE_SIZE, MAP_WIDTH_TILES, MAP_HEIGHT_TILES, getPlaceholderMap, getTileColor } from './world.js';
import { getLatestPlayers } from './network.js';
import { drawSpriteFrame } from './sprites.js';
import { updateAnimations, getFrameForPlayer, pruneStaleStates } from './player-animation.js';

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
  const { row, col } = getFrameForPlayer(player.id);
  drawSpriteFrame(ctx, player.characterId, row, col, player.x, player.y, PLAYER_SIZE);

  ctx.fillStyle = LABEL_COLOR;
  ctx.font = '12px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(player.name, player.x + PLAYER_SIZE / 2, player.y - 6);
}

let lastFrameTimestamp = null;

function renderLoop(timestamp) {
  const dtMs = lastFrameTimestamp === null ? 16 : Math.min(timestamp - lastFrameTimestamp, 100);
  lastFrameTimestamp = timestamp;

  const players = getLatestPlayers();
  updateAnimations(players, dtMs);
  pruneStaleStates(players.map((p) => p.id));

  drawMap();
  for (const player of players) {
    drawPlayer(player);
  }
  requestAnimationFrame(renderLoop);
}

requestAnimationFrame(renderLoop);
