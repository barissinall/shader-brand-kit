# Spec reference

A spec is one JSON object = one image (or one video when `duration` is set). The CLI writes one next to every render in `specs/`; edit it and run `node brandkit.mjs --spec specs/<name>.json`. Paths inside a spec are relative to the spec file.

Positions and sizes are **fractions**, so a spec works at any resolution: `x`/`y` are fractions of width/height (0,0 = top-left), text `size` is a fraction of width, `logo.size` is a fraction of the shorter side.

## Contents
- Top level
- logo
- material: metal / glass
- background: studio / silk / photo / solid
- text
- animate (keyframes)
- Recipes

## Top level

| key | default | notes |
|---|---|---|
| `format` | `"post"` | `post` 1080x1350, `portrait` 1080x1440, `square`, `story`/`reel` 1080x1920, `wide` 1920x1080, or `{ "w": 1200, "h": 628 }` |
| `t` | 1.2 | time (s) rendered for a still |
| `duration`, `fps` | - | set `duration` to render an MP4 |
| `grain` | 0.045 | film grain (video uses ~half automatically). 0-0.08 |
| `vignette` | 0.2 | 0-0.6 |
| `fade` | 1 | global brightness multiplier (animatable) |
| `fonts` | [] | `[{ "family": "Brand", "src": "brand.woff2", "weight": "100 900" }]` - Inter is built in |
| `images` | [] | flat overlays: `[{ "src": "badge.png", "x": .5, "y": .9, "width": .2, "opacity": 1 }]` |

## logo

| key | default | range / notes |
|---|---|---|
| `src` | - | SVG / PNG / JPG |
| `x`, `y` | .5, .46 | centre |
| `size` | .56 | longest logo side as a fraction of the shorter frame side; .1-.9 |
| `rotate` | 0 | degrees |
| `opacity` | 1 | 0-1 |
| `invert` | false | light-on-dark opaque logos |
| `threshold` | .5 | mask threshold (alpha, or keying distance for opaque logos) |

## material

`"type": "metal" | "glass" | "none"`. Shared shape controls:

| key | metal | glass | notes |
|---|---|---|---|
| `bevel` | .45 | .75 | rounded-edge width as a fraction of the shape's thickest part. Low = flat top with crisp rim; 1 = fully pillowed |
| `depth` | 1 | 1 | bevel height |
| `profile` | .45 | .55 | 0 = round (sharper rim), 1 = soft S-curve |
| `dome` | .3 | .15 | gentle overall curvature so flat faces catch a gradient |
| `liquid` | .06 | .03 | slow surface wobble; >.15 looks melted |
| `speed` | .25 | .2 | wobble speed |
| `dispersion` | .02 | .05 | colour fringing at edges; keep metal <= .03 |
| `env` | studio | studio | reflected room: `studio` (black + softboxes), `horizon` (classic sky/ground chrome), `warm` (amber) |
| `envRotate` | 0 | 0 | degrees; animate it for moving reflections |
| `envSpin` | 0 | 0 | degrees per second, added to envRotate |
| `envGain` | 1 | 1 | room brightness |
| `shadow` | .35 | .22 | drop-shadow strength; `shadowDist`, `shadowSoft` scale it |

Metal only: `finish` = `chrome` `silver` `gold` `rose` `copper` `bronze` `black` or any colour; `envTint` + `envTintAmount` (0-1) push the dark reflections toward a brand colour (that is the `molten` look).

Glass only:

| key | default | notes |
|---|---|---|
| `refraction` | .6 | how far the edge bends the background; .3-.7 |
| `magnify` | 1.15 | lens zoom; 1.03-1.2 reads as glass, more reads as a magnifier |
| `frost` | 0 | blur through the glass, 0-1 |
| `milk` | 0 | milky white body, 0-.4 |
| `tint`, `tintAmount` | #fff, 0 | coloured glass |
| `reflect` | .55 | environment reflection at grazing angles |
| `specular` | .8 | highlight + rim line strength |
| `caustic` | .3 | light focused into the shadow |

## background

| type | keys |
|---|---|
| `studio` | `colors: [top, bottom, spotColour]`, `spot` (0-.3), `spotPos: [x, y]` (default: logo position) |
| `silk` | `colors` (2-5 stops, dark to light works best), `scale` (.6-1.5; lower = bigger folds), `speed`, `angle` (deg), `warp` (0.8-2), `bump` (fold relief), `sheen` (highlight) |
| `photo` | `src`, `zoom`, `center: [x, y]` (0-1 in the photo), `dim` (0-1), `shade` (bottom darkening for white text, 0-.6), `blur` (mip level 0-6) |
| `solid` | `color` |

## text

Array of items: `{ "text": "Slow coffee.", "x": .5, "y": .86, "size": .056, "weight": 800, "color": "#fff", "align": "center", "tracking": -.02, "lineHeight": 1.02, "font": "Brand", "uppercase": false, "lang": "tr", "opacity": 1, "shadow": false, "layer": "over" }`.

- `y` is the **baseline** of the first line; `\n` makes extra lines.
- `layer: "under"` draws the text into the background, so glass bends it.
- `tracking` is in em (-.04 tight display, .02 airy labels).

## animate

Map of dotted paths to keyframes `[time, value, ease?]`; values interpolate (numbers and number arrays). Eases: `linear`, `in`, `out`, `inOut` (default), `back`.

```json
"animate": {
  "logo.size": [[0, 0.5], [2.4, 0.58, "out"]],
  "material.envRotate": [[0, -70], [6, 35]],
  "text.0.opacity": [[1.8, 0], [2.6, 1, "out"]]
}
```

Any numeric field works: `logo.x`, `logo.rotate`, `material.magnify`, `background.zoom`, `text.1.y`, `fade`, ...

## Recipes

- **Brushed / softer chrome:** `env: "studio"`, `envGain: .8`, `liquid: .02`, `dome: .5`.
- **Classic 80s chrome:** `env: "horizon"`, `bevel: .35`, `profile: .2`.
- **Coloured glass:** `tint: "<brand>"`, `tintAmount: .5`, `milk: .1`.
- **Glass over a photo, lens on the detail:** move `logo.x/y` over the most tactile area; never over flat sky or walls.
- **Seamless loop:** make every keyframe track end on its start value (see the `drift` motion).
