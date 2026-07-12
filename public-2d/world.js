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
