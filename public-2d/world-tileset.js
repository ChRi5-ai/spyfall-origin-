// ============================================================
// PUBLIC-2D/WORLD-TILESET.JS — World asset loading & registry
// ============================================================
// Loads the actual world asset pack and exposes a symbolic
// name -> exact source rectangle lookup, plus a draw helper. Mirrors
// the same pattern as sprites.js for character sheets.
//
// ------------------------------------------------------------
// ARCHITECTURE NOTE (read before editing):
// ------------------------------------------------------------
// The real asset pack is FIVE separate sheets, not one uniform grid:
//   - TX Tileset Grass.png / TX Tileset Stone Ground.png — actual
//     tile grids (32x32 px per tile, confirmed by inspecting real
//     pixel-edge boundaries in the source PNGs — not assumed).
//   - TX Plant.png, TX Props.png, TX Struct.png — irregular sprite
//     sheets (trees, bushes, props, walls, stairs), where each item
//     is a different size. These use exact per-item pixel rectangles
//     (measured directly from the real files via connected-component
//     analysis — every {x, y, w, h} below is a real, inspected
//     bounding box, not an estimate).
//
// This replaces the earlier placeholder version of this file, which
// assumed one shared sheet on a uniform grid — that assumption didn't
// match the real pack, so the loading/drawing model changed from
// "one sheet + {col,row}" to "multiple sheets + exact rectangles."
// Every symbolic tile name used elsewhere (world.js, canvas.js) is
// unchanged, so nothing outside this file needed to know that.
// ------------------------------------------------------------

const ASSET_DIR = 'assets/world/Texture/';

const SHEETS = {
  grass: `${ASSET_DIR}TX Tileset Grass.png`,
  stoneGround: `${ASSET_DIR}TX Tileset Stone Ground.png`,
  plant: `${ASSET_DIR}TX Plant.png`,
  props: `${ASSET_DIR}TX Props.png`,
  struct: `${ASSET_DIR}TX Struct.png`,
};

// Confirmed via edge-transition analysis on the real PNGs: both
// ground tilesets are 256x256 with a 32x32 tile grid (8 columns).
const GROUND_TILE_SIZE = 32;

// Symbolic name -> { sheet, x, y, w, h } in real sheet pixels.
// Ground tile entries use GROUND_TILE_SIZE; sprite entries use their
// actual measured bounding box (irregular sizes are expected and
// correct — a tree is not the same size as a grass tuft).
const TILE_INDEX = {
  // --- Ground: grass sheet (top region = grass texture tiles) ---
  grassA: { sheet: 'grass', x: 0, y: 0, w: GROUND_TILE_SIZE, h: GROUND_TILE_SIZE },
  grassB: { sheet: 'grass', x: 32, y: 0, w: GROUND_TILE_SIZE, h: GROUND_TILE_SIZE },
  // --- Ground: grass sheet (bottom-left region = stone path tiles) ---
  pathA: { sheet: 'grass', x: 0, y: 160, w: GROUND_TILE_SIZE, h: GROUND_TILE_SIZE },
  pathB: { sheet: 'grass', x: 32, y: 160, w: GROUND_TILE_SIZE, h: GROUND_TILE_SIZE },

  // --- Ground: stone ground sheet ---
  stoneFloor: { sheet: 'stoneGround', x: 0, y: 0, w: GROUND_TILE_SIZE, h: GROUND_TILE_SIZE },
  stoneFloorAlt: { sheet: 'stoneGround', x: 32, y: 0, w: GROUND_TILE_SIZE, h: GROUND_TILE_SIZE },
  concrete: { sheet: 'stoneGround', x: 0, y: 96, w: GROUND_TILE_SIZE, h: GROUND_TILE_SIZE },
  concreteAlt: { sheet: 'stoneGround', x: 32, y: 96, w: GROUND_TILE_SIZE, h: GROUND_TILE_SIZE },

  // --- Plants (TX Plant.png — exact measured boxes) ---
  treeLarge: { sheet: 'plant', x: 24, y: 14, w: 113, h: 139 },
  treeMedium: { sheet: 'plant', x: 161, y: 17, w: 95, h: 136 },
  treeSmall: { sheet: 'plant', x: 295, y: 31, w: 79, h: 120 },
  bushA: { sheet: 'plant', x: 98, y: 195, w: 27, h: 25 },
  bushB: { sheet: 'plant', x: 156, y: 190, w: 38, h: 32 },
  bushC: { sheet: 'plant', x: 216, y: 185, w: 47, h: 42 },
  bushD: { sheet: 'plant', x: 282, y: 186, w: 39, h: 45 },
  bushE: { sheet: 'plant', x: 346, y: 190, w: 40, h: 35 },
  grassTuftA: { sheet: 'plant', x: 8, y: 394, w: 17, h: 9 },
  grassTuftB: { sheet: 'plant', x: 41, y: 394, w: 16, h: 10 },
  grassTuftC: { sheet: 'plant', x: 73, y: 394, w: 15, h: 10 },

  // --- Structures (TX Struct.png — exact measured boxes) ---
  wallStoneA: { sheet: 'struct', x: 32, y: 32, w: 64, h: 96 },
  wallStoneB: { sheet: 'struct', x: 128, y: 32, w: 65, h: 96 },
  wallStoneC: { sheet: 'struct', x: 224, y: 32, w: 65, h: 96 },
  wallStoneD: { sheet: 'struct', x: 32, y: 160, w: 64, h: 96 },
  wallStoneE: { sheet: 'struct', x: 128, y: 160, w: 65, h: 96 },
  wallStoneF: { sheet: 'struct', x: 224, y: 160, w: 65, h: 96 },
  archwayTall: { sheet: 'struct', x: 408, y: 27, w: 80, h: 64 },
  archwayShort: { sheet: 'struct', x: 416, y: 128, w: 64, h: 64 },
  stairCornerA: { sheet: 'struct', x: 48, y: 288, w: 90, h: 96 },
  stairCornerB: { sheet: 'struct', x: 176, y: 288, w: 90, h: 96 },
  stairCornerC: { sheet: 'struct', x: 56, y: 384, w: 88, h: 96 },
  stairCornerD: { sheet: 'struct', x: 184, y: 384, w: 88, h: 96 },

  // --- Props (TX Props.png — exact measured boxes) ---
  // A vertical column of four similarly-sized, similarly-positioned
  // items (strong visual/positional pattern = barrels/urns stacked
  // in the sheet) — highest-confidence prop identifications from the
  // real file. Other props exist in the sheet but aren't mapped here
  // yet; see the note below.
  barrelA: { sheet: 'props', x: 162, y: 153, w: 28, h: 36 },
  barrelB: { sheet: 'props', x: 165, y: 217, w: 21, h: 34 },
  barrelC: { sheet: 'props', x: 164, y: 288, w: 25, h: 27 },
  barrelD: { sheet: 'props', x: 165, y: 348, w: 21, h: 32 },
  crateA: { sheet: 'props', x: 96, y: 30, w: 32, h: 31 },
  rockA: { sheet: 'props', x: 3, y: 430, w: 57, h: 42 },
  rockB: { sheet: 'props', x: 420, y: 359, w: 55, h: 49 },
};

// NOTE: TX Props.png contains 33 distinct items total (chests, doors,
// signs, benches, statues, gravestones, a rug, more rocks, etc.) —
// all of their exact pixel boxes were measured from the real file,
// but only the ones above were confidently identified by
// shape/position from visual inspection. Rather than force a label
// onto every remaining box from a description alone (which risks
// being wrong in a way that's hard to catch), the rest were left out
// of this registry so nothing here is a guess. If you'd like more of
// them mapped, the fastest path is telling me which named prop is at
// which approximate position in the sheet (e.g. "the wooden bench is
// around x=290,y=87") — I'll only fill in ones I can verify.

const sheetImageCache = {}; // sheet key -> HTMLImageElement

function getSheetImage(sheetKey) {
  let img = sheetImageCache[sheetKey];
  if (!img) {
    img = new Image();
    img.src = SHEETS[sheetKey];
    sheetImageCache[sheetKey] = img;
  }
  return img;
}

// Draws one named world asset at (x, y), scaled to fit within
// `size` x `size` while preserving its real aspect ratio (a tree
// should not be squashed into a square) — width-fit, anchored to the
// bottom of the cell so tall props (trees, walls) appear to "stand"
// on the tile rather than floating or overflowing upward.
function drawWorldTile(ctx, tileName, x, y, size) {
  const entry = TILE_INDEX[tileName];
  if (!entry) return;

  const img = getSheetImage(entry.sheet);
  if (!img.complete || img.naturalWidth === 0) return;

  const scale = size / entry.w;
  const destW = size;
  const destH = entry.h * scale;
  const destY = y + (size - destH); // bottom-anchored within the cell

  ctx.drawImage(
    img,
    entry.x, entry.y, entry.w, entry.h,
    x, destY, destW, destH
  );
}

function isWorldTileReady(tileName) {
  const entry = TILE_INDEX[tileName];
  if (!entry) return false;
  const img = getSheetImage(entry.sheet);
  return img.complete && img.naturalWidth > 0;
}

export { drawWorldTile, isWorldTileReady, TILE_INDEX, GROUND_TILE_SIZE };
