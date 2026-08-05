// ============================================================
// WORLD.JS — Static map definition for Spyfall 2D
// ============================================================
// Phase 1 scope: a single fixed placeholder scene, defined as a
// simple grid of colored tiles. This is intentionally primitive —
// real tileset art, collision data, and multiple areas are explicit
// non-goals for this phase (see project brief).
//
// Later phases will extend this file with:
//   - real tile/sprite assets
//   - collision map (needed once movement is implemented)
//   - interaction zones (needed once proximity gameplay is implemented)
// ============================================================

export const TILE_SIZE = 40;

export const MAP_WIDTH_TILES = 20;  // 800px / 40
export const MAP_HEIGHT_TILES = 15; // 600px / 40

// Placeholder tile palette. Real pixel-art tiles will replace this
// flat-color approach in a later phase.
const TILE_COLORS = {
  floor: '#3a5a40',
  wall: '#344e41',
};

// A simple bordered room: walls around the edge, floor everywhere else.
// This is a placeholder layout only — not final level design.
export function getPlaceholderMap() {
  const tiles = [];
  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    const row = [];
    for (let x = 0; x < MAP_WIDTH_TILES; x++) {
      const isBorder =
        x === 0 || y === 0 || x === MAP_WIDTH_TILES - 1 || y === MAP_HEIGHT_TILES - 1;
      row.push(isBorder ? 'wall' : 'floor');
    }
    tiles.push(row);
  }
  return tiles;
}

export function getTileColor(tileType) {
  return TILE_COLORS[tileType] || '#000000';
}

// ============================================================
// PHASE 11 — Themed maps (Garden, Office, Rooftop, City)
// ============================================================
// Each map keeps the EXACT same pixel footprint as the original
// placeholder (MAP_WIDTH_TILES x MAP_HEIGHT_TILES x TILE_SIZE) and
// the same solid 1-tile border ring — both of these are load-bearing:
// server/movement.js independently clamps player positions to this
// same 800x600 area with a 1-tile margin, so changing either here
// would visually desync from where players can actually walk. Only
// what's *drawn* changed, never the numeric bounds.
//
// Ground and border tiles are returned as a full grid (one entry per
// cell, matching the original getPlaceholderMap shape) so canvas.js's
// existing per-cell draw loop doesn't need to change its structure —
// only which tile-drawing function it calls. Decorations are a
// separate sparse list layered on top afterward, since they don't
// need one tile per grid cell.
//
// Decoration placement follows "multiplayer arena" principles per
// the design brief: symmetric, sparse, kept off the main open
// interior so sightlines and movement routes stay clear from any
// point on the map — nothing here blocks movement (no obstacle
// collision exists, intentionally unmodified), so placement is about
// visual clarity and fairness, not physical blocking.
// ------------------------------------------------------------

function buildGroundGrid(primaryTile, secondaryTile, borderTile) {
  const tiles = [];
  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    const row = [];
    for (let x = 0; x < MAP_WIDTH_TILES; x++) {
      const isBorder =
        x === 0 || y === 0 || x === MAP_WIDTH_TILES - 1 || y === MAP_HEIGHT_TILES - 1;
      if (isBorder) {
        row.push(borderTile);
      } else {
        // Light alternating texture rather than one flat tile
        // everywhere, kept subtle (checker-ish but sparse) so it
        // reads as ground variation, not a distracting pattern.
        const useSecondary = (x + y) % 5 === 0;
        row.push(useSecondary ? secondaryTile : primaryTile);
      }
    }
    tiles.push(row);
  }
  return tiles;
}

// Symmetric ring of decoration a couple of tiles in from the border,
// with gaps left at the cardinal midpoints and corners so every edge
// of the map has multiple clear routes through to the center — no
// single choke point anywhere.
function buildPerimeterDecorations(tileNames) {
  const decorations = [];
  const inset = 3;
  const points = [];

  for (let x = inset; x < MAP_WIDTH_TILES - inset; x += 4) {
    points.push({ x, y: inset });
    points.push({ x, y: MAP_HEIGHT_TILES - 1 - inset });
  }
  for (let y = inset; y < MAP_HEIGHT_TILES - inset; y += 4) {
    points.push({ x: inset, y });
    points.push({ x: MAP_WIDTH_TILES - 1 - inset, y });
  }

  points.forEach((p, i) => {
    decorations.push({ x: p.x, y: p.y, tile: tileNames[i % tileNames.length] });
  });

  return decorations;
}

// PHASE 11 (asset pack confirmed): each map's tile names below are
// all real, measured entries from world-tileset.js's TILE_INDEX —
// none of these are placeholders. Ground and border use the 32x32
// tile-grid sheets; decorations use the irregular sprite sheets
// (trees, bushes, walls, props), each drawn at its real aspect ratio.
const MAPS = {
  Garden: {
    ground: () => buildGroundGrid('grassA', 'grassB', 'wallStoneA'),
    decorations: () => buildPerimeterDecorations([
      'treeLarge', 'bushB', 'treeMedium', 'bushC', 'treeSmall', 'bushD', 'bushA', 'bushE',
    ]),
  },
  Office: {
    ground: () => buildGroundGrid('stoneFloor', 'stoneFloorAlt', 'wallStoneB'),
    decorations: () => buildPerimeterDecorations([
      'crateA', 'barrelA', 'barrelB', 'crateA', 'barrelC', 'barrelD',
    ]),
  },
  Rooftop: {
    ground: () => buildGroundGrid('concrete', 'concreteAlt', 'wallStoneC'),
    decorations: () => buildPerimeterDecorations([
      'crateA', 'rockA', 'archwayShort', 'rockB', 'crateA', 'barrelA',
    ]),
  },
  City: {
    ground: () => buildGroundGrid('pathA', 'pathB', 'wallStoneD'),
    decorations: () => buildPerimeterDecorations([
      'stairCornerA', 'barrelB', 'rockA', 'stairCornerC', 'barrelD', 'rockB',
    ]),
  },
};

const DEFAULT_MAP_NAME = 'Garden';

// Returns { ground, decorations } for a given map name (as sent by
// the server — see server/settings.js's MAPS list, which already
// defines exactly these four names). Falls back to a default rather
// than throwing if an unrecognized name is ever passed, so rendering
// never breaks even in an unexpected state.
export function getMapLayout(mapName) {
  const map = MAPS[mapName] || MAPS[DEFAULT_MAP_NAME];
  return { ground: map.ground(), decorations: map.decorations() };
}

export function getAvailableMapNames() {
  return Object.keys(MAPS);
}
