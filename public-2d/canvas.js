// ============================================================
// CANVAS.JS — Rendering entry point for Spyfall 2D
// ============================================================
// Phase 1 scope: draw the static placeholder map once. No render
// loop, no input handling, no player sprites, no networking.
//
// Deliberate placeholders for future phases:
//   - requestAnimationFrame loop        (needed for movement/animation)
//   - player sprite rendering            (needed once positions exist)
//   - socket.io client connection        (needed once movement syncs)
//   - camera/viewport logic              (only if multiple areas are added)
// ============================================================

import { TILE_SIZE, MAP_WIDTH_TILES, MAP_HEIGHT_TILES, getPlaceholderMap, getTileColor } from './world.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function drawMap() {
  const tiles = getPlaceholderMap();
  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    for (let x = 0; x < MAP_WIDTH_TILES; x++) {
      ctx.fillStyle = getTileColor(tiles[y][x]);
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
}

// PLACEHOLDER: once movement (Phase 2+) is implemented, this single
// draw call will be replaced by a render loop that also draws player
// sprites each frame:
//
//   function renderLoop() {
//     drawMap();
//     drawPlayers();   // not implemented yet
//     requestAnimationFrame(renderLoop);
//   }
//   requestAnimationFrame(renderLoop);

drawMap();
