// ============================================================
// PUBLIC-2D/OPENING.JS — Opening sequence (Phase 10.1)
// ============================================================
// Owns only the opening screen's timing and transition: fading the
// title in, showing the "Click Anywhere To Begin" prompt, and
// dismissing the whole overlay into the existing app underneath.
// Deliberately does not touch lobby.js, network.js, or any gameplay
// module — #lobby-entry and everything else in index.html is
// completely unmodified; this overlay simply sits on top of it (see
// the CSS z-index) until dismissed, at which point it hides itself
// and the pre-existing screen the player already lands on (the
// lobby's create/join entry screen) is exactly what shows through,
// untouched.
//
// The background animation lives in opening-scene.js and the shared
// audio manager lives in audio.js — both imported here but owned
// there, so this file stays focused on sequencing rather than
// drawing or playback details.
// ============================================================

import { playOpeningLobbyMusic } from './audio.js';
import { show as showMainMenu } from './main-menu.js';

const overlayEl = document.getElementById('opening-overlay');
const titleEl = document.getElementById('opening-title');
const continuePromptEl = document.getElementById('opening-continue');

const TITLE_FADE_IN_DELAY_MS = 400;
const CONTINUE_PROMPT_DELAY_MS = 3800;

let dismissed = false;

// Step 1: after a short beat on a black screen, fade the title in.
setTimeout(() => {
  titleEl.classList.add('opening-title-visible');
}, TITLE_FADE_IN_DELAY_MS);

// Step 2: after a further delay, show the pulsing continue prompt.
setTimeout(() => {
  continuePromptEl.classList.add('opening-continue-visible');
}, CONTINUE_PROMPT_DELAY_MS);

// Step 3: any click dismisses the opening and starts the music (the
// click itself is the "first user interaction" browsers require
// before allowing audio playback).
overlayEl.addEventListener('click', () => {
  if (dismissed) return;
  dismissed = true;

  playOpeningLobbyMusic();

  overlayEl.classList.add('opening-overlay-fading');

  // Matches the CSS transition duration on .opening-overlay-fading
  // (see style.css) — after it completes, remove the overlay from
  // layout entirely and reveal the main menu (Phase 10.2), rather
  // than the lobby directly.
  overlayEl.addEventListener(
    'transitionend',
    () => {
      overlayEl.classList.add('hidden');
      showMainMenu();
    },
    { once: true }
  );
});
