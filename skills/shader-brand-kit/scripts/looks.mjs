// Looks = art-directed spec builders. Each takes a context and returns a full engine spec.
// ctx: { logo, brand (hex), palette {brand, light, deep, accent, ink}, text, sub, photo, font, format }

/* ---------- colour helpers ---------- */
export function hexToHsl(h) {
  h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let hh = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; }
  return [hh, s, l];
}
export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
/** One brand colour -> a small, harmonious palette. Neutral or undetected brands get graphite (never stock indigo). */
const GRAPHITE = { brand: '#8d939c', muted: '#5d636b', light: '#e4e6ea', deep: '#1b1d21', darker: '#0a0b0d', accent: '#b9a27e', soft: '#b5bac2', ink: '#0c0d0f' };
export function paletteFrom(brand, extra = []) {
  if (!brand || hexToHsl(brand)[1] < .12) return { ...GRAPHITE, ...(brand ? { brand } : {}), ...(extra[1] ? { light: extra[1] } : {}), ...(extra[2] ? { accent: extra[2] } : {}) };
  const [h, s0] = hexToHsl(brand), s = Math.max(s0, .35);
  // Shift accents away from muddy yellow-greens: warm brands lean to red/magenta, cool brands lean to violet.
  const dir = (h < 75 || h > 300) ? -1 : 1;
  return {
    brand,
    light: extra[1] || hslToHex(h + 4 * dir, s * .5, .88),
    deep: hslToHex(h + 4 * dir, Math.min(s, .75), .13),
    darker: hslToHex(h, Math.min(s, .5), .045),
    accent: extra[2] || hslToHex(h + 26 * dir, Math.min(1, s * 1.05), .58),
    soft: hslToHex(h - 18 * dir, s * .4, .74),
    muted: hslToHex(h, s * .62, .4),            // brand hue with the saturation pulled back: grounds that don't scream
    ink: hslToHex(h, .15, .08)
  };
}

/* ---------- layout helpers ---------- */
const isTall = f => f === 'story' || f === 'reel';
// Layout families. A kit mixes them on purpose: identical centred layouts on every post read as one template
// re-rendered (an AI tell). `--layout` forces one family for every look.
//   centered  - symmetric, calm; the safe default for a single hero post
//   editorial - mark large and off-centre on the right third, type hung from the left margin
//   crop      - mark oversized and bleeding off the frame edge, small type bottom-left (the mark is the image)
export const LAYOUTS = ['centered', 'editorial', 'crop'];
const layoutOf = (ctx, def) => ctx.layout || def;
function headline(ctx, o = {}) {
  if (!ctx.text) return [];
  const tall = isTall(ctx.format), lay = o.layout || 'centered', left = lay !== 'centered';
  const t = [{
    text: ctx.text, x: left ? .08 : .5, y: o.y ?? (tall ? .69 : (left ? .87 : .855)), size: o.size ?? (tall ? .066 : (lay === 'crop' ? .05 : .056)), weight: o.weight ?? 800,
    color: o.color ?? '#ffffff', align: left ? 'left' : 'center', tracking: -.02, font: ctx.font?.family, lineHeight: 1.04
  }];
  const lines = ctx.text.split('\n').length - 1;
  if (ctx.sub) t.push({ text: ctx.sub, x: t[0].x, y: t[0].y + lines * t[0].size * 1.04 * (tall ? 1080 / 1920 : 1080 / 1350) + (o.subGap ?? (tall ? .042 : .045)), size: tall ? .028 : .027, weight: 500,
    color: o.subColor ?? 'rgba(255,255,255,.62)', align: t[0].align, tracking: .01, font: ctx.font?.family });
  if (left && ctx.sub && !tall) { t[0].y -= .03; t[1].y -= .03; }
  return t;
}
// Tall (9:16) frames: logo a bit bigger; keep everything out of the top ~14% and bottom ~25% (Instagram/TikTok UI).
const logoPos = (ctx, size, lay = 'centered') => {
  const tall = isTall(ctx.format), s = (ctx.text ? size : size * 1.12) * (tall ? 1.12 : 1);
  if (lay === 'editorial') return { src: ctx.logo, x: .6, y: tall ? .4 : .41, size: s * 1.22, invert: ctx.invert };
  if (lay === 'crop') return { src: ctx.logo, x: .64, y: tall ? .38 : .36, size: s * 1.75, invert: ctx.invert };
  return { src: ctx.logo, x: .5, y: ctx.text ? (tall ? .41 : .43) : (tall ? .45 : .5), size: s, invert: ctx.invert };
};

/* ---------- looks ---------- */
export const LOOKS = {
  chrome: {
    about: 'Mirror chrome on a black studio sweep. The safest premium look; works for every logo.',
    build: ctx => { const lay = layoutOf(ctx, 'centered'); return {
      format: ctx.format,
      background: { type: 'studio', colors: ['#161514', '#050404', '#fff6ea'], spot: .09 },
      logo: logoPos(ctx, .58, lay),
      material: { type: 'metal', finish: 'chrome', env: 'studio', envRotate: -8, bevel: .5, dome: .35, liquid: .05, dispersion: .02, shadow: .4 },
      text: headline(ctx, { color: '#f2f0ed', layout: lay }), grain: .045, vignette: .25
    }; }
  },
  gold: {
    about: 'Polished gold in a warm amber room. Luxury, awards, launches.',
    build: ctx => { const lay = layoutOf(ctx, 'editorial'); return {
      format: ctx.format,
      background: { type: 'studio', colors: ['#1d130b', '#070403', '#ffb36b'], spot: .1 },
      logo: logoPos(ctx, .56, lay),
      material: { type: 'metal', finish: 'gold', env: 'warm', envRotate: 4, bevel: .55, dome: .3, liquid: .05, dispersion: .01, shadow: .45 },
      text: headline(ctx, { color: '#f1dcbc', subColor: 'rgba(241,220,188,.6)', layout: lay }), grain: .05, vignette: .3
    }; }
  },
  molten: {
    about: 'Chrome whose dark bands melt into the brand colour, floating over a deep brand-tinted silk.',
    build: ctx => { const lay = layoutOf(ctx, 'crop'); return {
      format: ctx.format,
      background: { type: 'silk', colors: [ctx.palette.darker, ctx.palette.deep, ctx.palette.muted, ctx.palette.deep], scale: .9, speed: .2, angle: 30, sheen: .2, bump: .9 },
      logo: logoPos(ctx, .58, lay),
      material: { type: 'metal', finish: 'chrome', env: 'studio', envGain: .85, envTint: ctx.palette.brand, envTintAmount: .75, envRotate: 10, bevel: .5, dome: .35, liquid: .08, dispersion: .02, shadow: .3 },
      text: headline(ctx, { layout: lay }), grain: .05, vignette: .3
    }; }
  },
  glass: {
    about: 'The logo becomes a thick lens. Over a photo (best: tactile detail) or over big type and a bright brand gradient.',
    build: ctx => {
      const tall = isTall(ctx.format), bg = ctx.photo
        ? { type: 'photo', src: ctx.photo, zoom: 1.0, shade: ctx.text ? .55 : 0 }
        : { type: 'silk', colors: [ctx.palette.deep, ctx.palette.muted, ctx.palette.brand, ctx.palette.light], scale: .9, speed: .25, angle: -25, sheen: .3 };
      const under = (!ctx.photo && ctx.word) ? [{
        text: ctx.word, layer: 'under', x: .5, y: (ctx.text ? (tall ? .41 : .44) : (tall ? .45 : .5)) + (tall ? .045 : .065), size: tall ? .23 : .2, weight: 900, uppercase: true,
        color: 'rgba(255,255,255,.92)', align: 'center', tracking: -.04, font: ctx.font?.family, lineHeight: .9
      }] : [];
      return {
        format: ctx.format, background: bg,
        logo: { ...logoPos(ctx, .6), y: ctx.text ? (tall ? .41 : .44) : (tall ? .45 : .5) },
        material: { type: 'glass', bevel: .8, refraction: under.length ? .3 : .45, magnify: under.length ? 1.1 : 1.18, dispersion: .025, reflect: .5, specular: .9, shadow: ctx.photo ? .3 : .18, caustic: .35 },
        text: [...under, ...headline(ctx)],
        grain: .04, vignette: .15
      };
    }
  },
  frost: {
    about: 'Frosted, milky glass on a vivid gradient - soft, modern UI feel.',
    build: ctx => { const lay = layoutOf(ctx, 'editorial'); return {
      format: ctx.format,
      background: { type: 'silk', colors: [ctx.palette.soft, ctx.palette.muted, ctx.palette.deep, ctx.palette.brand], scale: .85, speed: .3, angle: 40, sheen: .3, bump: 1 },
      logo: logoPos(ctx, .6, lay),
      material: { type: 'glass', bevel: .9, profile: .7, refraction: .5, magnify: 1.05, frost: .55, milk: .22, tint: '#ffffff', reflect: .45, specular: .7, dispersion: .02, shadow: .25, caustic: .2 },
      text: headline(ctx, { layout: lay }), grain: .05, vignette: .1
    }; }
  },
  silk: {
    about: 'Editorial poster: brand silk gradient, big headline, a small chrome mark as the signature.',
    build: ctx => {
      const tall = isTall(ctx.format), text = [];
      const y0 = tall ? .6 : .70, lines = ctx.text ? ctx.text.split('\n').length : 0;
      if (ctx.text) text.push({ text: ctx.text, x: .08, y: y0, size: tall ? .1 : .095, weight: 800, align: 'left', tracking: -.035, color: '#ffffff', font: ctx.font?.family, lineHeight: 1.0 });
      if (ctx.sub) text.push({ text: ctx.sub, x: .08, y: y0 + (lines > 1 ? (lines - 1) * (tall ? .056 : .095) : 0) + (tall ? .05 : .085), size: .03, weight: 500, align: 'left', color: 'rgba(255,255,255,.7)', font: ctx.font?.family });
      return {
        format: ctx.format,
        background: { type: 'silk', colors: [ctx.palette.darker, ctx.palette.deep, ctx.palette.muted, ctx.palette.brand], scale: .8, speed: .22, angle: 60, sheen: .25, bump: .9 },
        logo: { src: ctx.logo, x: .14, y: tall ? .155 : .1, size: .13, invert: ctx.invert },
        material: { type: 'metal', finish: 'chrome', env: 'studio', bevel: .6, dome: .2, liquid: .05, dispersion: .02, shadow: .25 },
        text, grain: .05, vignette: .15
      };
    }
  }
};

/* ---------- motion presets for reels (keyframes on top of a look) ---------- */
export const MOTION = {
  // One gesture each. The first frame is already a readable image (no fade from black - it reads as a dead
  // second in the feed), and the resolved logo is held for at least 1.5 s at the end.
  reveal: (spec, d) => {
    const s = spec.logo.size, settle = Math.min(d * .45, d - 1.5); spec.animate = {
      'logo.size': [[0, s * .9], [settle, s, 'out']], 'logo.opacity': [[0, .35], [.6, 1, 'out']],
      'material.envRotate': [[0, -70], [d, 35, 'inOut']]
    };
    spec.text.forEach((t, i) => { const a = Math.min(d * .3, d - 2) + i * .15;
      spec.animate[`text.${i}.opacity`] = [[a, 0], [a + .8, 1, 'out']];
      spec.animate[`text.${i}.y`] = [[a, t.y + .015], [a + .8, t.y, 'out']]; });
    return spec;
  },
  // Seamless loop: the lens glides across and returns to its start pose. Magnify stays subtle (<=1.08).
  drift: (spec, d) => {
    const y = spec.logo.y, x = spec.logo.x ?? .5; spec.animate = {
      'logo.x': [[0, x - .1], [d * .5, x + .1], [d, x - .1]], 'logo.y': [[0, y + .012], [d * .25, y - .012], [d * .5, y + .012], [d * .75, y - .012], [d, y + .012]],
      'logo.rotate': [[0, -5], [d * .5, 5], [d, -5]], 'material.magnify': [[0, 1.03], [d * .5, 1.08], [d, 1.03]]
    };
    if (spec.background.type === 'photo') spec.animate['background.zoom'] = [[0, 1.04], [d * .5, 1.09], [d, 1.04]];
    return spec;
  },
  flow: (spec, d) => {
    spec.background.speed = (spec.background.speed || .25) * 2;
    spec.animate = { 'material.envRotate': [[0, -30], [d, 30, 'inOut']] };
    spec.text.forEach((t, i) => { const a = .3 + i * .25; spec.animate[`text.${i}.opacity`] = [[a, 0], [a + 1, 1, 'out']];
      spec.animate[`text.${i}.y`] = [[a, t.y + .02], [a + 1, t.y, 'out']]; });
    return spec;
  }
};
export const DEFAULT_MOTION = { chrome: 'reveal', gold: 'reveal', molten: 'reveal', glass: 'drift', frost: 'drift', silk: 'flow' };
