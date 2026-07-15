// ============================================================
// PUBLIC-2D/AUDIO.JS — Shared audio manager
// ============================================================
// Owns every music track's playback as a set of singleton <audio>
// elements, created once and reused for the lifetime of the page —
// not per-screen. This is what lets music started on the opening
// screen keep playing, unrestarted, straight through the main menu
// and the entire lobby, since every caller (opening.js's "click to
// begin" handler; this file's own match-start listener below) always
// operates on the exact same element rather than creating a new one.
//
// Adding a future track is just adding another entry to TRACKS and
// calling playTrack('thatKey', ...) from wherever it should start —
// no new audio-handling logic needed per track.
//
// AUTOPLAY: browsers block audio before a user gesture. This module
// never attempts to play anything on its own; playTrack() must always
// be called from inside a real click/keydown handler. The only place
// that currently does so is opening.js's "click anywhere to begin"
// handler — see PLAYBACK ENTRY POINT below for why that's the single
// point of entry.
//
// DUPLICATE PLAYBACK: each track's <audio> element is created at most
// once (see getAudioEl's `if (!el)` guard) and playTrack() no-ops if
// that element is already playing, so repeated clicks, repeated
// 'gameStart' broadcasts, or multiple modules importing this file all
// safely resolve to the same single playing instance rather than
// stacking duplicate playback.
// ============================================================

import socket from './socket.js';

const TRACKS = {
  openingLobby: {
    src: 'assets/audio/music/opening-lobby.mp3',
    volume: 0.5,
    loop: true,
  },
};

const audioEls = {}; // trackKey -> HTMLAudioElement
const fadeIntervals = {}; // trackKey -> interval handle, while a fade is running

function getAudioEl(trackKey) {
  const track = TRACKS[trackKey];
  if (!track) return null;

  let el = audioEls[trackKey];
  if (!el) {
    el = new Audio(track.src);
    el.loop = track.loop;
    el.volume = track.volume;
    // If the file is missing or fails to load, this fires once and is
    // ignored — there's nothing meaningful to do about a missing
    // asset here, and it must never break the surrounding UI.
    el.addEventListener('error', () => {
      /* missing/broken audio file — silently no-op */
    });
    audioEls[trackKey] = el;
  }
  return el;
}

// Starts a track if it isn't already playing. Safe to call
// repeatedly (e.g. from more than one "first interaction" handler, or
// if a broadcast event fires more than once) — an already-playing
// track is left exactly as it is, never restarted.
function playTrack(trackKey) {
  const el = getAudioEl(trackKey);
  if (!el || !el.paused) return;

  // Restore full volume in case a previous fade-out left it lowered
  // (e.g. the same track being played again in a later match).
  const track = TRACKS[trackKey];
  el.volume = track.volume;

  const playPromise = el.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      /* autoplay/policy rejection or missing file — ignore */
    });
  }
}

// Smoothly fades a playing track's volume down to zero over
// `durationMs`, then pauses and resets it, rather than cutting it off
// abruptly. Safe to call even if the track isn't playing (no-op), and
// safe to call again while already fading (the existing fade is
// simply cancelled and restarted, never stacked).
function fadeOutTrack(trackKey, durationMs = 2000) {
  const el = getAudioEl(trackKey);
  if (!el || el.paused) return;

  if (fadeIntervals[trackKey]) {
    clearInterval(fadeIntervals[trackKey]);
  }

  const track = TRACKS[trackKey];
  const startVolume = el.volume;
  const stepMs = 50;
  const steps = Math.max(1, Math.round(durationMs / stepMs));
  let step = 0;

  fadeIntervals[trackKey] = setInterval(() => {
    step += 1;
    el.volume = Math.max(0, startVolume * (1 - step / steps));
    if (step >= steps) {
      clearInterval(fadeIntervals[trackKey]);
      delete fadeIntervals[trackKey];
      el.pause();
      el.currentTime = 0;
      el.volume = track.volume; // restored for the next time this track plays
    }
  }, stepMs);
}

// --- PLAYBACK ENTRY POINT ---
// opening.js calls this exact function, from inside its "click
// anywhere to begin" handler — the one and only place a track is
// ever started from a direct user gesture, satisfying the autoplay
// requirement without duplicating that logic anywhere else.
function playOpeningLobbyMusic() {
  playTrack('openingLobby');
}

// --- MATCH START ---
// A read-only reaction to the existing 'gameStart' broadcast, exactly
// like several other client modules (timer.js, role-reveal.js,
// vote-request.js, investigation-log.js) already independently listen
// to the same event. This never emits anything and never touches
// networking or gameplay logic — it only starts a 2-second fade-out
// of the lobby music once a match actually begins.
socket.on('gameStart', () => {
  fadeOutTrack('openingLobby', 2000);
});

export { playOpeningLobbyMusic, playTrack, fadeOutTrack };
