# Anti-slop: making it look art-directed, not generated

Read this before delivering anything. Shader visuals (chrome, liquid glass, gradients) sit right on top of the
2025-26 "AI look", so they need more restraint than usual. The CLI's automatic review catches the measurable tells;
this file covers the rest.

## Contents
1. The grade and how to use it
2. Rules by area (with the reason for each)
3. Vision self-check (do this on the contact sheet)
4. Ten moves that read as human
5. Sources

## 1. The grade

Every kit ends with `[review] AI-look grade: CLEAN | MILD | SLOPPY | TERMINAL` and writes `review.json`.
Warnings count 1 (copy warnings count 2, because weightless copy makes a good render read as generated); every three notes count 1.
0-1 = CLEAN, 2-3 = MILD, 4-6 = SLOPPY, 7+ = TERMINAL.

- **SLOPPY/TERMINAL:** fix before showing the user. At most 3 fix rounds, then show the best one and say what is left.
- A warning may be waived only with a stated reason ("brand colour *is* violet", "client supplied this line"). Never tune a spec just to silence a check while the image still looks generic.
- Re-run the check on an existing folder with `node brandkit.mjs review <out-dir>`.

## 2. Rules

**Composition**
- **Spend boldness in one place.** Either the mark is the hero (big, maybe cropped) with small type, or the type is the hero with a small mark. Never both at medium size. *AI spreads emphasis evenly; people pick a focal point.*
- **Centred is one layout among several.** The kit varies on purpose: chrome centred, gold editorial, molten cropped, frost editorial, silk left-hung. Don't force everything to `--layout centered`. *All-centred, mirrored sets read as one template re-rendered.*
- **Negative space is a decision.** Leave room around the mark, but empty-with-no-idea is "lazy minimalism". Run a restraint pass: remove one element (sub-line, glow, second material).
- **One visual language per frame.** One material, one type family, no stickers or badges mixed in.

**Colour**
- **No unbranded violet/indigo.** It is the statistical default of generated design (the review flags it). Use the brand hue, or graphite for neutral brands.
- **Dominant colour + one sharp accent**, not an evenly spread rainbow. Grounds use the brand's *muted* and *deep* tones; full-saturation brand colour is for accents.
- **Gradients must be chosen, not defaulted:** their hues come from the brand. A gradient is a stage, never the subject.
- **No neon glow, no exact #000/#FFF grounds.** Tint blacks warm or cool and keep grain on (it also kills banding).
- **Take the palette from the brand's real world** when you know it (the roast, the awning, the packaging) and pass it with `--colors`.

**Typography**
- **Use the brand font** (`--font brand.woff2 --font-family "Brand"`). The built-in Inter is a fallback, and an unchosen font is a tell (the review notes it).
- **2-6 words, sentence case**, one size step between headline and sub-line. No single-word colour/italic accent, no tracked ALL-CAPS eyebrow labels, no arrows, no middots, no gradient text.

**Materials and light**
- **One motivated key light.** Highlights shouldn't clip (the review flags >1.5% pure white). No halo glow around the logo.
- **Avoid synthetic sheen:** keep `liquid` low (<= .08), `dispersion` <= .02 on metal, grain on. A little imperfection beats perfect CG.
- **Chrome and liquid glass are trend-fatigued.** Tie them to the brand's world (a photo of the real product/place under glass; a material that matches the craft) or they read as trend wallpaper. Frost: once per kit at most.

**Motion**
- **One orchestrated gesture**, no bounce/elastic easing, no colour cycling for its own sake. First frame readable, logo held >= 1.5 s.

**Copy** (the CLI lints `--text/--sub/--word`)
- **No benefit-speak:** elevate, unlock, unleash, seamless, leverage, next-level, journey, "yeni nesil", "fark yarat", "yükselt", "keşfet" ...
- **No LLM rhythms:** "not X, it's Y" / "X değil, Y"; em/en-dash separators; forced triplets; emoji; "!".
- **No invented facts:** numbers, years, awards and places only if the user gave them. No placeholder brands.
- **Say what only this brand could say:** a place, an ingredient, a year, a number the user actually gave. Read it aloud.

**Process**
- Before rendering: name the subject, the audience and the one job of the post. Ask "would I make this exact image for any other brand?" If yes, change something and say what and why.
- Keep a short notes file per brand (look, layout, what the user rejected) so the next kit starts somewhere new.

## 3. Vision self-check

Read `contact-post.png` (and any frame that looks off), then answer in two or three lines each:
1. What does the eye hit first, second, third? Is the first thing the brand?
2. **Portability test:** swap the logo for another brand's. Would this image still work unchanged? If yes, it's generic: change the ground, layout, or copy.
3. What is the **one accessory to remove**? Remove it.
4. Does the light make sense (one direction, shadows agree, nothing glows by itself)?
5. Does the set vary? At least two of these should differ across the kit: ground, layout family, type scale, crop.

## 4. Ten moves that read as human

1. Offset the mark on a grid line or crop it boldly off the edge (`--layout crop` or edit `logo.x/size`).
2. Make one thing loud, silence the rest.
3. Palette from the brand's real materials: one dominant, one accent.
4. Real photography as the stage (`glass --photo`), especially texture under glass.
5. Controlled imperfection: grain on, slightly off-axis light (`envRotate`), warm/cool split instead of neutral perfection.
6. Light like a photographer: one key, real falloff, no clipped highlights, no halo.
7. Make the type the image: the brand face, large and tight, sentence case.
8. Copy only this brand could say: a concrete noun or fact, 2-5 words, no dashes.
9. Make the set diverge on purpose: post, story and reel differ in ground or layout.
10. A restraint pass with memory: remove one element, log what you did for next time.

## 5. Sources

Anthropic frontend-design skill and the cookbook's frontend-aesthetics prompt; community skills anti-ai-slop
(Vinayak-Shukla-03), taste-skill (Leonxlnx) and the pixelslop pattern catalog (severity bands); designer write-ups
by Mika Reyes, 925studios, prg.sh and Creative Boom's "trends creatives are over in 2026". Pixel thresholds are this
project's own translation of those ideas, so tune them on outputs you approved.
