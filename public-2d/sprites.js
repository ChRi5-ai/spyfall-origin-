// ============================================================
// PUBLIC-2D/SPRITES.JS — Reusable sprite sheet system
// ============================================================
// Owns loading and drawing character sprite sheets. Used by both the
// character-selection grid (characters.js, lobby.js — static preview
// frames) and the in-game world renderer (canvas.js — animated
// frames), so sprite loading only happens once per sheet regardless
// of how many places draw from it.
//
// Sheet format (per the actual restored assets):
//   - 256x512 px total, 4 columns x 8 rows
//   - Frame size is DERIVED from each loaded image's real dimensions
//     (naturalWidth / 4, naturalHeight / 8) rather than assumed as a
//     fixed constant — see getFrameDimensions below. This is what
//     fixes the cropping bug: a previous fixed 32x32 guess only
//     captured a quarter of each real 64x64 frame. Computing it from
//     the sheet itself is correct regardless of the sheet's actual
//     resolution, as long as the 4-column x 8-row grid layout holds.
//   - 8 rows: idle-up, idle-left, idle-down, idle-right,
//             walk-up, walk-left, walk-down, walk-right
//
// Character ids (server/characters.js's 'char-1'..'char-10') map to
// files 'npc1.png'..'npc10.png' in public-2d/assets/characters/.
// Sheets npc11.png/npc12.png exist but are unused — the game's
// character count stays at the existing 10 fixed slots (an
// established gameplay rule from server/characters.js, not something
// this change alters).
// ============================================================

const SHEET_COLUMNS = 4;
const SHEET_ROWS = 8;

const ROW = {
  idleUp: 0,
  idleLeft: 1,
  idleDown: 2,
  idleRight: 3,
  walkUp: 4,
  walkLeft: 5,
  walkDown: 6,
  walkRight: 7,
};

// Maps a facing direction + moving state to the correct sheet row.
function getRowForState(facing, moving) {
  const key = (moving ? 'walk' : 'idle') + facing[0].toUpperCase() + facing.slice(1);
  return ROW[key] ?? ROW.idleDown;
}

const sheetCache = {}; // characterId -> HTMLImageElement

function getSheetSrc(characterId) {
  const num = characterId.replace('char-', '');
  return `assets/characters/npc${num}.png`;
}

// Returns the (possibly still-loading) Image for a character id,
// creating and caching it on first request. Callers should check
// `.complete` (or just attempt to draw — drawImage on an unloaded
// image is a silent no-op, never an error) before relying on it
// having rendered.
function getSheet(characterId) {
  let img = sheetCache[characterId];
  if (!img) {
    img = new Image();
    img.src = getSheetSrc(characterId);
    sheetCache[characterId] = img;
  }
  return img;
}

// Computes one frame's actual pixel dimensions by inspecting the
// loaded image itself, rather than assuming a fixed size. This is
// the "detect from the sheet" fix: naturalWidth/naturalHeight are the
// real, already-loaded image dimensions, so dividing by the known
// 4x8 grid always yields the correct frame size for whatever sheet
// resolution actually exists on disk — 256x512 today, or anything
// else in the future, without this file needing to change again.
function getFrameDimensions(img) {
  return {
    frameWidth: img.naturalWidth / SHEET_COLUMNS,
    frameHeight: img.naturalHeight / SHEET_ROWS,
  };
}

// Draws one frame of a character's sheet at (x, y) on `ctx`, scaled
// to `size` x `size`. `row`/`col` index directly into the sheet.
// Safe to call even if `characterId` is null/undefined (e.g. a
// player who hasn't finished selecting a character yet) — silently
// draws nothing rather than throwing, same as the unloaded-image case
// below.
function drawSpriteFrame(ctx, characterId, row, col, x, y, size) {
  if (!characterId) return;
  const img = getSheet(characterId);
  if (!img.complete || img.naturalWidth === 0) return; // not loaded yet — draw nothing this frame

  const { frameWidth, frameHeight } = getFrameDimensions(img);
  ctx.drawImage(
    img,
    col * frameWidth, row * frameHeight, frameWidth, frameHeight,
    x, y, size, size
  );
}

// Convenience for static previews (character-selection grid, lobby
// list) — always the first frame of the idle-down row, matching a
// natural "front-facing portrait" pose without needing animation.
function drawPreviewFrame(ctx, characterId, x, y, size) {
  drawSpriteFrame(ctx, characterId, ROW.idleDown, 0, x, y, size);
}

export { ROW, getRowForState, getSheet, drawSpriteFrame, drawPreviewFrame };
