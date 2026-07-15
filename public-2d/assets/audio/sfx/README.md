# Menu Sound Effects

Placeholder hook-up only — no files ship with this phase. Place short
one-shot sound effects here as:

    hover.mp3
    click.mp3

These exact paths — `assets/audio/sfx/hover.mp3` and
`assets/audio/sfx/click.mp3` — are already wired up in
`public-2d/sfx.js`. No code changes are needed once the files are
added; every menu button already calls `playSfx('hover')` on
mouseenter and `playSfx('click')` on click.

Until files are added, `sfx.js` fails silently (a caught, ignored
`play()` rejection) — menu interactivity is unaffected either way.
