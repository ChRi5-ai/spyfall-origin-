// ============================================================
// PUBLIC-2D/CHARACTERS.JS — Character selection UI (client side)
// ============================================================
// Owns the character-selection grid: 10 fixed slots, rendered from
// whatever the server's 'lobby' snapshot says about availability.
// Kept as its own module, separate from lobby.js (which owns room
// code / host / player-list display) even though both render from
// the same 'lobby' event — each module owns its own slice of the DOM
// and reacts to the server independently, rather than one calling
// into the other. This mirrors the server-side separation between
// characters.js and movement-network.js.
//
// Never decides on its own whether a character is available — every
// click just asks the server via 'selectCharacter' and renders
// whatever comes back. If the server rejects the pick (character
// already taken by someone else), the rejection response carries a
// fresh 'lobby' snapshot that this module re-renders from immediately,
// so the UI can't be left showing a stale/incorrect grid.
//
// Scope note: this is intentionally just the selection grid. Start
// Game / host gating is a separate concern for a later step and is
// not implemented here.
// ============================================================

import socket from './socket.js';
import { drawPreviewFrame, getSheet } from './sprites.js';

let selfId = null;

const gridEl = document.getElementById('character-grid');
const PREVIEW_SIZE = 32; // matches sprites.js's FRAME_SIZE — native resolution, scaled via CSS for crisp pixels

socket.on('self', ({ id }) => {
  selfId = id;
});

function renderCharacterGrid(lobby) {
  gridEl.innerHTML = '';

  for (const character of lobby.characters) {
    const slot = document.createElement('button');
    slot.className = 'character-slot';
    slot.type = 'button';

    // PHASE 10.3: character previews only, no NPC names or numbers —
    // a small canvas drawing the sheet's idle-down frame.
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = PREVIEW_SIZE;
    previewCanvas.height = PREVIEW_SIZE;
    previewCanvas.className = 'character-slot-preview';
    const previewCtx = previewCanvas.getContext('2d');
    drawPreviewFrame(previewCtx, character.id, 0, 0, PREVIEW_SIZE);
    // Sprite sheets load asynchronously — drawPreviewFrame is a
    // silent no-op if the image isn't ready yet (see sprites.js), so
    // redraw once it actually loads in case this render happened
    // before that finished (e.g. the very first grid render of the
    // whole lobby, before any sheet has ever been requested).
    getSheet(character.id).addEventListener(
      'load',
      () => drawPreviewFrame(previewCtx, character.id, 0, 0, PREVIEW_SIZE),
      { once: true }
    );
    slot.appendChild(previewCanvas);

    if (character.takenBy) {
      slot.classList.add('taken');
      slot.disabled = true;
      if (character.takenBy === selfId) {
        // A player's own current selection stays visibly distinct
        // (and clickable, so they can see it's theirs) rather than
        // looking identical to a character someone else took.
        slot.classList.add('selected-self');
        slot.disabled = false;
      }
    } else {
      slot.classList.add('available');
    }

    slot.addEventListener('click', () => {
      socket.emit('selectCharacter', { characterId: character.id }, (res) => {
        if (res?.error) {
          // Lost the race (or picked something invalid) — resync
          // immediately from the snapshot the server sent back,
          // rather than waiting on a broadcast that may not include
          // this rejection's outcome.
          if (res.lobby) {
            renderCharacterGrid(res.lobby);
          }
        }
      });
    });

    gridEl.appendChild(slot);
  }
}

socket.on('lobby', renderCharacterGrid);
