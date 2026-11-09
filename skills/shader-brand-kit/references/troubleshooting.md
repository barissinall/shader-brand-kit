# Troubleshooting

Start with `node brandkit.mjs doctor`; it prints a fix for every failed check.

| symptom | cause | fix |
|---|---|---|
| `No Chrome, Edge or Chromium found` | no browser in the usual places | install one (`winget install Google.Chrome`, `brew install --cask google-chrome`, `sudo apt install chromium`) or set `CHROME_PATH` |
| `software rendering` warning, slow renders | no GPU visible to Chrome (servers, VMs, RDP) | works, just slower; use `--quick` while iterating. On Linux install `libvulkan1` / GPU drivers, or run under Xvfb |
| `WebGL2 is unavailable` | very old browser or blocked GPU process | update Chrome; set `CHROME_PATH` to a current Chrome |
| reels saved as `_frames/` PNGs | ffmpeg not on PATH | install ffmpeg or set `FFMPEG_PATH` |
| `could not install puppeteer-core` | offline, or no npm | run `npm ci` in the skill folder once; or set `BRANDKIT_DATA` to a writable folder |
| logo renders as a filled rectangle | opaque logo the keyer could not separate | use a transparent PNG/SVG; for light-on-dark try `--invert`; or raise `logo.threshold` in the spec |
| `the logo mask is empty` | white logo on transparent read as background, or wrong `--invert` | remove/add `--invert` |
| thin strokes sparkle or blob | bevel too wide for the stroke | spec: `material.bevel` .3-.4, `dispersion` <= .02 |
| text in the wrong font | font not loaded | pass `--font file.woff2 --font-family "Name"`; SVG `<text>` must be converted to outlines |
| glass looks invisible | nothing behind it to refract | add `--photo` with texture or `--word`; raise `refraction`/`specular` slightly |
| `render failed (...)` | a page/shader error - the run stops instead of writing broken files | read the message; report it with the spec JSON |
