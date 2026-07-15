# Opening / Lobby Music

The looping opening/lobby soundtrack is expected at:

    opening-lobby.mp3

This exact path — `assets/audio/music/opening-lobby.mp3` — is wired
up in `public-2d/audio.js`'s `TRACKS.openingLobby.src`. No further
code changes are needed; it's picked up automatically the next time
the page loads.

Playback starts on the player's first click (the "Click Anywhere To
Begin" interaction in the opening sequence, see `opening.js`), which
satisfies browser autoplay-policy requirements. The same `<audio>`
element persists for the whole page session (see `audio.js`), so it
keeps playing unrestarted through the main menu and the entire lobby,
and fades out smoothly over ~2 seconds once the host starts a match.

To add a future track (e.g. gameplay music), add a new entry to the
`TRACKS` object in `audio.js` and call `playTrack('yourNewKey')` from
wherever it should start — the fade/duplicate-prevention/persistence
behavior is shared automatically, no need to duplicate any of it.
