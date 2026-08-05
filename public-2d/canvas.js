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
// PHASE 11: player rendering now draws each player's selected
// character sprite (via sprites.js) instead of a flat colored
// square, with idle/walking animation state derived by
// player-animation.js. The codename label above each player is
// unchanged in spirit — it's still just player.name, which now holds
// whatever codename the player entered (see lobby.js), rather than
// an auto-generated "Player N".
//
// PHASE 11: map rendering now uses the themed tileset (world.js's
// getMapLayout) instead of the old flat-color placeholder. Which of
// the four themes to draw is picked from the server's existing
// 'gameStart' broadcast (already includes `map`, unchanged — see
// server/movement-network.js) — this is a read-only reaction to an
// already-existing event, the same pattern several other client
// modules already use, not a new networking behavior. Defaults to
// the Garden layout before a match has started.
// ============================================================

import { TILE_SIZE, MAP_WIDTH_TILES, MAP_HEIGHT_TILES, getMapLayout } from './world.js';
import { drawWorldTile } from './world-tileset.js';
import { getLatestPlayers } from './network.js';
import { drawSpriteFrame } from './sprites.js';
import { updateAnimations, getFrameForPlayer, pruneStaleStates } from './player-animation.js';
import socket from './socket.js';

const PLAYER_SIZE = 28; // must match server/movement.js PLAYER_SIZE
const LABEL_COLOR = '#f1faee';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let currentMapName = 'Garden';
let currentLayout = getMapLayout(currentMapName);

socket.on('gameStart', ({ map }) => {
  currentMapName = map;
  currentLayout = getMapLayout(currentMapName);
});

function drawMap() {
  // Cheap solid fallback first, in case the tileset image hasn't
  // finished loading yet — drawWorldTile silently no-ops until it has, so
  // without this the canvas would just be blank for a frame or two.
  ctx.fillStyle = '#1b2a23';
  ctx.fillRect(0, 0, MAP_WIDTH_TILES * TILE_SIZE, MAP_HEIGHT_TILES * TILE_SIZE);

  const { ground, decorations } = currentLayout;

  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    for (let x = 0; x < MAP_WIDTH_TILES; x++) {
      drawWorldTile(ctx, ground[y][x], x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE);
    }
  }

  for (const deco of decorations) {
    drawWorldTile(ctx, deco.tile, deco.x * TILE_SIZE, deco.y * TILE_SIZE, TILE_SIZE);
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
