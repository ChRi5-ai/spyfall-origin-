# Pixel Font

Place the downloaded pixel font file here as:

    pixel-font.woff2

(WOFF2 is preferred for file size/browser support. If only a .ttf or
.otf is available, either convert it to .woff2, or update the `src:`
line in style.css's `@font-face` rule to point at the actual filename
and format you have, e.g.:

    src: url('assets/fonts/pixel-font.ttf') format('truetype');

Until a font file is placed here, the opening title automatically
falls back to the existing monospace stack ('Courier New', monospace)
already used throughout the rest of the UI, so nothing appears broken
in the meantime.
