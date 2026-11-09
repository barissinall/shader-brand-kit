---
name: shader-brand-kit
description: "Turns any logo (SVG, PNG or JPG) into premium brand visuals rendered locally on the GPU - liquid chrome and gold, thick refractive glass, frosted glass and silk-gradient posters - as Instagram posts (4:5), stories and looping MP4 reels, in one command. Use when the user wants a logo made chrome, metallic, gold, glass, liquid glass, shiny or 3D-looking, a brand gradient background, a logo animation or reveal, or launch/teaser posts, stories or reels made from their logo, even if they never say shader or WebGL."
license: MIT
compatibility: "Local machine. Needs Node 18+, Chrome/Edge/Chromium with WebGL2, and ffmpeg for MP4 (PNG frames otherwise)."
metadata:
  author: barissinall
  version: "2.0.0"
---

# Shader Brand Kit

One logo in, a finished kit out. The logo becomes a signed distance field, so **any** shape works (marks, wordmarks, thin strokes, opaque JPGs) with no per-logo code. Original WebGL2 code, rendered in headless Chrome; output is PNG + H.264 MP4.

## Quick start

`SKILL_DIR` = the folder containing this file (`${CLAUDE_SKILL_DIR}` when available). Use forward slashes and quote paths.

```bash
node "$SKILL_DIR/scripts/brandkit.mjs" doctor                       # once: checks Node, browser, GPU, ffmpeg
node "$SKILL_DIR/scripts/brandkit.mjs" logo.svg --text "Slow coffee." --sub "Roasted in small batches"
```

Run `--help` for every flag. Do not read the engine source to use it; the CLI and the spec JSON are the interface. First run installs `puppeteer-core` (pinned, one time).

Output in `brandkit-out/<logo-name>/`:
- `<look>-post.png` for each look, `chrome-reveal.mp4`, `glass-drift.mp4`
- `contact-post.png` - all stills side by side. **Read this first.**
- `review.json` + a printed **AI-look grade** (CLEAN / MILD / SLOPPY / TERMINAL) from the automatic anti-slop review
- `index.html` gallery, and `specs/*.json` - the exact, editable recipe of each file

## Pick the look

| the user wants | look | notes |
|---|---|---|
| "make it chrome / premium / metallic" (default) | `chrome` | dark studio; works for every logo |
| luxury, award, launch | `gold` | warm amber room |
| metallic but keep the brand colour | `molten` | chrome melting into brand colour over deep brand silk |
| logo over a product/food/place photo | `glass` + `--photo` | photo needs texture: crust, foam, fabric, leaves, lights |
| typographic poster without a photo | `glass` + `--word "WORD"` | big word bends through the lens |
| soft, app-like, friendly | `frost` | milky glass on a vivid gradient |
| announcement, quote, carousel cover | `silk` | big headline, small chrome mark |

Layouts vary per look on purpose (chrome centred, gold and frost editorial, molten cropped, silk left-hung) so a kit reads as a series, not one template; `--layout centered|editorial|crop` forces one.

Formats: `--formats post,portrait,square,story,wide` (post = 1080x1350). Reels are always 1080x1920: `--reels chrome,glass,silk` or `none`; motions `reveal` (metal), `drift` (glass, loops), `flow` (silk).

## Workflow

Copy this checklist and tick it off:

```
- [ ] doctor passes (or note the software-render warning)
- [ ] run the kit with the user's real copy and brand font if available (never invent claims; no copy -> no --text)
- [ ] AI-look grade is CLEAN or MILD; fix SLOPPY/TERMINAL first (max 3 rounds; waive a warning only with a stated reason)
- [ ] Read contact-post.png and run the vision check in references/anti-slop.md (first/second/third read, portability test, remove one accessory)
- [ ] check: logo reads clearly (cropping is deliberate, not accidental), text clear of the logo, brand colour right, no clipped glyphs
- [ ] art-direct by editing specs/<file>.json (see references/spec.md), re-render: --spec specs/<file>.json
- [ ] reels: check the lint output (! lines) for UI-zone warnings
- [ ] deliver the chosen files and say which look/settings were used
```

For hands-on tuning: `node "$SKILL_DIR/scripts/brandkit.mjs" logo.svg --playground` opens a slider UI that exports the same JSON.

## Taste rules (why they exist)

1. **One material per image.** Metal *or* glass on the mark; mixing reads as a template.
2. **Metal needs darkness around it** (studio or deep silk) - reflections only read against dark.
3. **Glass needs something to bend.** Over a flat colour it is invisible; use a textured photo or `--word`. Never put small body text under glass.
4. **No subject, no post.** Silk gradients are a stage for a mark or headline, never the content (pure gradients read as AI wallpaper).
5. **Keep the brand recognisable.** Brand colour is auto-detected and drives palettes; pass `--colors` if detection is wrong. Neutral logos get graphite, never stock indigo.
6. **Copy only this brand could say.** 2-5 words, sentence case, no benefit-speak (elevate, unlock, journey, yeni nesil...), no "not X, it's Y", no em-dashes, no emoji. The CLI lints this. Use the brand font via `--font`; Inter is only a fallback.
7. **Not AI-looking.** No unbranded violet, no neon glow, no clipped highlights, one focal point, and vary layouts across a kit. Full rules and the vision check: references/anti-slop.md.
8. **9:16 safe zones:** nothing important in the top 14% or bottom 25%; the looks already respect this and the CLI warns when an edited spec does not.
9. **Motion is one gesture:** first frame already readable, logo resolved and held >= 1.5 s, 6 s total.

## Inputs and caveats

- Transparent SVG/PNG is best. Opaque logos (JPG, PNG on white) are keyed against their border colour automatically; light-on-dark opaque logos need `--invert`.
- SVG `<text>` is drawn with fallback fonts (fonts are not embedded in SVG images) - convert text to outlines.
- Thin wordmarks: in the spec lower `material.bevel` to 0.3-0.4 and `material.dispersion` to <= 0.02.
- Turkish copy uppercases correctly (İ/ı) when it contains Turkish letters, or set `"lang": "tr"` on the text item.

## When to read what

- `references/anti-slop.md` - **always, before delivering** (rules, grade, vision self-check).
- `references/spec.md` - before editing any spec JSON (all fields, ranges, keyframes).
- `references/troubleshooting.md` - when `doctor` fails or a render looks wrong.
