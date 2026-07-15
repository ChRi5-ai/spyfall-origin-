// ============================================================
// PUBLIC-2D/MAIN-MENU.JS — Main menu (Phase 10.2 + 10.3)
// ============================================================
// Owns the main menu screen, its two popups (Tutorial, Settings),
// and the shared "Back to Menu" control. Does not touch lobby.js or
// any gameplay/networking file for its own screens — "Create Party"
// and "Join Party" both simply fade this overlay away, which reveals
// the pre-existing #lobby-entry screen underneath exactly as it
// already is (its own Create Room / Join Room controls are
// completely untouched, same pattern opening.js already used in
// Phase 10.1 to reveal it).
//
// PHASE 10.3: the single shared #back-to-menu-btn is shown whenever
// the player is on one of the four "left the main menu" screens
// (lobby entry, Tutorial popup, Settings popup) and always returns to
// the main menu — reusing the same show() fade-in the opening
// sequence already uses, rather than a separate transition. It also
// listens (read-only) for the existing 'lobby' socket event purely to
// hide itself once the player actually creates/joins a room, since at
// that point lobby.js's own (unmodified) enterRoomView() has taken
// over and "back to menu" no longer applies.
//
// show() is called by opening.js once the opening sequence is
// dismissed — kept as an explicit exported function rather than this
// module reaching into opening.js, so the two stay independently
// readable: opening.js decides *when* the menu appears, this file
// owns *what* the menu does once it's showing.
// ============================================================

import { playSfx } from './sfx.js';
import socket from './socket.js';

const mainMenuEl = document.getElementById('main-menu-overlay');

// The pre-existing (untouched) lobby entry screen. Hidden by default
// in the markup now (see index.html) so it can never render behind
// the opening/menu screens — this module is the only thing that
// reveals it, at the exact moment the menu finishes fading away.
const lobbyEntryEl = document.getElementById('lobby-entry');

const createPartyBtn = document.getElementById('menu-create-party-btn');
const joinPartyBtn = document.getElementById('menu-join-party-btn');
const tutorialBtn = document.getElementById('menu-tutorial-btn');
const settingsBtn = document.getElementById('menu-settings-btn');

const settingsPopupEl = document.getElementById('settings-popup');
const settingsCloseBtn = document.getElementById('settings-close-btn');

const tutorialPopupEl = document.getElementById('tutorial-popup');
const tutorialCloseBtn = document.getElementById('tutorial-close-btn');

const backToMenuBtn = document.getElementById('back-to-menu-btn');

// Pre-existing element from the (untouched) lobby entry screen —
// only ever read/focused here, never modified in behavior.
const joinCodeInput = document.getElementById('join-code-input');

function showBackButton() {
  backToMenuBtn.classList.remove('hidden');
}
function hideBackButton() {
  backToMenuBtn.classList.add('hidden');
}

function fadeOutMenu() {
  mainMenuEl.classList.remove('main-menu-visible');
  mainMenuEl.classList.add('main-menu-fading');
  mainMenuEl.addEventListener(
    'transitionend',
    () => {
      mainMenuEl.classList.add('hidden');
      // Reveal the lobby only now — never earlier — so there is
      // exactly one menu-like UI visible at any given moment: the
      // main menu fades fully out before the lobby screen appears,
      // rather than the two ever being visible at the same time.
      lobbyEntryEl.classList.remove('hidden');
      showBackButton();
    },
    { once: true }
  );
}

function goToLobby({ focusJoinCode } = {}) {
  fadeOutMenu();
  if (focusJoinCode) {
    // Let the fade begin before shifting focus, so the input isn't
    // visibly focused half a second before the screen it's on is
    // even visible.
    setTimeout(() => joinCodeInput?.focus(), 550);
  }
}

// Called once by opening.js when the opening sequence finishes, and
// again by the Back to Menu button to return here from any of the
// four destination screens — same fade-in animation both times.
function show() {
  mainMenuEl.classList.remove('hidden');
  mainMenuEl.classList.remove('main-menu-fading');
  // Two-step (remove hidden, then add visible on the next frame) so
  // the browser actually applies the opacity/transform transition
  // instead of jumping straight to the end state.
  requestAnimationFrame(() => {
    mainMenuEl.classList.add('main-menu-visible');
  });
}

function returnToMainMenu() {
  tutorialPopupEl.classList.add('hidden');
  settingsPopupEl.classList.add('hidden');
  lobbyEntryEl.classList.add('hidden');
  hideBackButton();
  show();
}

createPartyBtn.addEventListener('click', () => {
  playSfx('click');
  goToLobby({ focusJoinCode: false });
});

joinPartyBtn.addEventListener('click', () => {
  playSfx('click');
  goToLobby({ focusJoinCode: true });
});

tutorialBtn.addEventListener('click', () => {
  playSfx('click');
  tutorialPopupEl.classList.remove('hidden');
  showBackButton();
});
tutorialCloseBtn.addEventListener('click', () => {
  playSfx('click');
  tutorialPopupEl.classList.add('hidden');
  hideBackButton();
});

settingsBtn.addEventListener('click', () => {
  playSfx('click');
  settingsPopupEl.classList.remove('hidden');
  showBackButton();
});
settingsCloseBtn.addEventListener('click', () => {
  playSfx('click');
  settingsPopupEl.classList.add('hidden');
  hideBackButton();
});

backToMenuBtn.addEventListener('click', () => {
  playSfx('click');
  returnToMainMenu();
});

// Placeholder hover sound on every interactive menu control — see
// sfx.js for why missing audio files don't cause any errors here.
[
  createPartyBtn,
  joinPartyBtn,
  tutorialBtn,
  settingsBtn,
  settingsCloseBtn,
  tutorialCloseBtn,
  backToMenuBtn,
].forEach((btn) => btn.addEventListener('mouseenter', () => playSfx('hover')));

// Read-only reaction to the existing 'lobby' event: once the player
// has actually created/joined a room, lobby.js's own unmodified
// enterRoomView() takes over the screen, so "back to menu" no longer
// applies. This never emits anything and never alters what lobby.js
// itself does with the event.
socket.on('lobby', () => {
  hideBackButton();
});

export { show };
