// Anti-slop review: measurable "made by AI" tells on a rendered frame, its spec, its copy and the kit as a set.
// Pixel stats run in the page (canvas); rules and wording live here so they are easy to tune.
// Scoring follows the pixelslop idea: count tells, judge the combination. See references/anti-slop.md.

/* ---------- copy ---------- */
const SLOP_EN = ['elevate', 'unleash', 'unlock', 'revolutioni', 'game-chang', 'game chang', 'next-level', 'next level', 'seamless',
  'empower', 'supercharge', 'cutting-edge', 'cutting edge', 'state-of-the-art', 'world-class', 'innovative', 'transform your',
  'redefin', 'embark', 'journey', 'dive into', 'delve', 'tapestry', "in today's", 'look no further', 'harness', 'leverage',
  'unparalleled', 'reimagin', 'experience the', 'discover the', 'like never before', 'the future of', 'where innovation',
  'crafted for', 'boost your', 'skyrocket', 'effortless', 'all-in-one', 'all in one', 'build faster', 'ship smarter',
  'powered by ai', 'ai-powered', 'level up', 'one-stop', 'curated'];
const SLOP_TR = ['yükselt', 'keşfet', 'deneyimle', 'sınırları zorla', 'fark yarat', 'devrim', 'yeni nesil', 'geleceği', 'eşsiz',
  'benzersiz', 'mükemmel', 'büyülü', 'zahmetsiz', 'dönüştür', 'bir üst seviye', 'kusursuz', 'hayallerin', 'yolculuk', 'zirveye',
  'ayrıcalıklı', 'vazgeçilmez', 'hepsi bir arada', 'tek adres'];
const PLACEHOLDER = /\b(acme|lorem|ipsum|john doe|jane doe|your brand|brand name|company name|example)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;

export function lintCopy(texts) {
  const out = [], add = (level, rule, msg) => out.push({ level, rule, msg });
  for (const raw of texts.filter(Boolean)) {
    const t = String(raw).replace(/\n/g, ' '), low = t.toLocaleLowerCase('tr'), q = `"${t.slice(0, 40)}"`;
    const hits = [...SLOP_EN, ...SLOP_TR].filter(w => low.includes(w));
    if (hits.length) add('warn', 'copy-cliche', `${q} uses stock AI phrasing (${hits.join(', ')}). Say the concrete thing only this brand could say: a place, an ingredient, a year, a fact the user gave.`);
    if (EMOJI.test(t)) add('warn', 'copy-emoji', `${q} contains emoji - never set emoji in poster type.`);
    if (/\s[—–]\s|[—–]/.test(t)) add('warn', 'copy-dash', `${q} uses an em/en dash as a separator - the most common LLM rhythm tell. Use a full stop.`);
    if (/\s·\s|→|->/.test(t)) add('warn', 'copy-ornament', `${q} uses a middot or arrow ornament - template chrome, drop it.`);
    if (/\b(not|isn't|it's not)\b.{1,40}?(,|;|\.|—|–|\s-)\s*(it's|it is|but|just)\b/i.test(t) || /\bdeğil\s*[,.—–]\s*\S/i.test(low))
      add('warn', 'copy-flip', `${q} uses the "not X, it's Y" flip - an LLM fingerprint. State Y plainly.`);
    if (/\b\d+(\.\d+)?\s?%|\b\d+x\b|99[.,]9/.test(t)) add('info', 'copy-number', `${q} contains a precise number. Fine if the user supplied it; never invent stats.`);
    if (PLACEHOLDER.test(t)) add('warn', 'copy-placeholder', `${q} looks like placeholder copy.`);
    if ((t.match(/!/g) || []).length) add('info', 'copy-exclaim', `${q} uses "!" - premium copy rarely shouts.`);
    const words = t.split(/\s+/).filter(w => /^\p{L}/u.test(w));
    if (words.length >= 3 && words.every(w => w[0] === w[0].toLocaleUpperCase('tr') && w.slice(1) !== w.slice(1).toLocaleUpperCase('tr')))
      add('info', 'copy-titlecase', `${q} is Title Case Every Word - sentence case reads more human.`);
    if (words.length > 9) add('info', 'copy-long', `${q} has ${words.length} words - a poster line works at 2-6. Cut words so the important ones can be big.`);
  }
  return out;
}

/* ---------- pixels (runs inside the page) ---------- */
export const PAGE_STATS = async (src, textBoxes) => {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const W = 270, H = Math.round(270 * img.height / img.width), c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, W, H); const d = x.getImageData(0, 0, W, H).data;
  const lum = (r, g, b) => { const f = v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  let purple = 0, sat = 0, clipped = 0, pure = 0, neon = 0, n = W * H, sym = 0, symN = 0;
  const hueHist = new Array(12).fill(0), gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0;
    let h = 0; if (mx !== mn) { h = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn); h = (h * 60 + 360) % 360; }
    gray[i] = .3 * r + .59 * g + .11 * b; sat += s;
    if (s > .25 && mx > 40) { hueHist[Math.floor(h / 30) % 12]++; if (h >= 245 && h <= 295) purple++; }
    if (s > .85 && mx > 230) neon++;
    if (r > 250 && g > 250 && b > 250) clipped++;
    if ((r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)) pure++;
  }
  for (let y = 0; y < H; y += 2) for (let xx = 0; xx < W / 2; xx += 2) {
    const a = (y * W + xx) * 4, bq = (y * W + (W - 1 - xx)) * 4;
    sym += (Math.abs(d[a] - d[bq]) + Math.abs(d[a + 1] - d[bq + 1]) + Math.abs(d[a + 2] - d[bq + 2])) / 765; symN++;
  }
  // focal structure: Sobel edge energy on a 6x8 grid -> entropy (1 = detail spread evenly) and share of the top 3 cells
  const GX = 6, GY = 8, cells = new Float64Array(GX * GY); let etot = 0;
  for (let y = 1; y < H - 1; y++) for (let xx = 1; xx < W - 1; xx++) {
    const k = y * W + xx, gx = gray[k + 1] - gray[k - 1] + .5 * (gray[k - W + 1] - gray[k - W - 1] + gray[k + W + 1] - gray[k + W - 1]),
      gy = gray[k + W] - gray[k - W] + .5 * (gray[k + W - 1] - gray[k - W - 1] + gray[k + W + 1] - gray[k - W + 1]), e = Math.hypot(gx, gy);
    if (e > 12) { cells[Math.min(GY - 1, Math.floor(y / H * GY)) * GX + Math.min(GX - 1, Math.floor(xx / W * GX))] += e; etot += e; }
  }
  let ent = 0; const sorted = [...cells].sort((p, q) => q - p);
  for (const v of cells) if (v > 0) { const p = v / etot; ent -= p * Math.log(p); }
  const quiet = [...cells].filter(v => v < etot / cells.length * .15).length / cells.length;
  // centroid of visual mass (edge energy) relative to the frame centre
  let cx = 0, cy = 0; cells.forEach((v, i) => { cx += v * ((i % GX) + .5) / GX; cy += v * (Math.floor(i / GX) + .5) / GY; });
  // text contrast against the background inside each text box
  const probe = document.createElement('canvas').getContext('2d');
  const contrast = (textBoxes || []).map(tb => {
    probe.fillStyle = '#000'; probe.fillStyle = tb.color || '#fff'; probe.fillRect(0, 0, 1, 1); const tc = probe.getImageData(0, 0, 1, 1).data;
    const x0 = Math.max(0, Math.floor(tb.x0 * W)), x1 = Math.min(W - 1, Math.ceil(tb.x1 * W)), y0 = Math.max(0, Math.floor(tb.y0 * H)), y1 = Math.min(H - 1, Math.ceil(tb.y1 * H));
    const tl = lum(tc[0], tc[1], tc[2]), bgs = [];
    for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) { const k = (y * W + xx) * 4, l = lum(d[k], d[k + 1], d[k + 2]);
      if (Math.abs(Math.log((l + .05) / (tl + .05))) > .45) bgs.push(l); }          // skip glyphs and their AA edges
    if (bgs.length < 20) return { text: tb.text, ratio: 1, role: tb.role };
    bgs.sort((p, q) => p - q); const bl = bgs[Math.floor(bgs.length * (tl > .3 ? .6 : .4))];
    return { text: tb.text, role: tb.role, ratio: +((Math.max(tl, bl) + .05) / (Math.min(tl, bl) + .05)).toFixed(2) };
  });
  const colourful = hueHist.reduce((a, b) => a + b, 0);
  return { purpleShare: colourful ? purple / colourful : 0, colourShare: colourful / n, meanSat: sat / n, clipped: clipped / n, pure: pure / n,
    neon: neon / n, symmetry: 1 - sym / symN, hueBins: hueHist.filter(v => v > colourful * .08).length,
    entropy: etot ? ent / Math.log(cells.length) : 0, top3: etot ? (sorted[0] + sorted[1] + sorted[2]) / etot : 1, quiet,
    centroid: etot ? [cx / etot, cy / etot] : [.5, .5], contrast };
};

/* ---------- rules ---------- */
export function textBoxes(spec, W, H) {
  return (spec.text || []).filter(t => (t.layer || 'over') === 'over' && (t.opacity ?? 1) > .5).map((t, i) => {
    const size = (t.size ?? .05), lines = String(t.text).split('\n'), longest = Math.max(...lines.map(l => l.length));
    const w = longest * size * .55, hFrac = size * W / H;
    const x = t.x ?? .5, ax = t.align || 'center', x0 = ax === 'left' ? x : ax === 'right' ? x - w : x - w / 2, y = t.y ?? .85;
    return { text: t.text, color: t.color, role: i === 0 ? 'headline' : 'sub', x0, x1: x0 + w, y0: y - hFrac * .75, y1: y + hFrac * ((lines.length - 1) * (t.lineHeight ?? 1.02)) + hFrac * .1 };
  });
}
export function judge(stats, spec, brandHex, hueOf) {
  const out = [], add = (level, rule, msg) => out.push({ level, rule, msg });
  const bh = brandHex ? hueOf(brandHex) : null, brandIsPurple = bh != null && bh >= 225 && bh <= 310;
  if (!brandIsPurple && stats.purpleShare > .15 && stats.colourShare > .12)
    add('warn', 'purple-drift', `${Math.round(stats.purpleShare * 100)}% of the colour is violet/indigo but the brand is not - the #1 AI-default tell. Use the brand hue or graphite.`);
  if (stats.meanSat > .7) add(stats.meanSat > .8 ? 'warn' : 'info', 'oversaturated', `mean saturation ${stats.meanSat.toFixed(2)} - reads as filtered/synthetic. Use the muted/deep brand tones for the ground.`);
  if (stats.neon > .02) add('warn', 'neon', `${(stats.neon * 100).toFixed(1)}% neon pixels - decorative glow signals nothing. Pull saturation or brightness down.`);
  if (stats.hueBins > 3) add('warn', 'rainbow', `${stats.hueBins} competing hue families - keep one dominant brand hue, one sharp accent at most.`);
  if (stats.clipped > .015) add('warn', 'blown-highlights', `${(stats.clipped * 100).toFixed(1)}% pure white - blown highlights look CG. Lower envGain/specular.`);
  if (stats.pure > .05) add('warn', 'pure-black-white', `${Math.round(stats.pure * 100)}% exact #000/#FFF - an undecided ground. Tint it (warm or cool) and keep grain on.`);
  for (const c of stats.contrast) { const need = c.role === 'headline' ? 3 : 4.5;
    if (c.ratio < need) add(c.ratio < need * .7 ? 'warn' : 'info', 'text-contrast', `"${String(c.text).slice(0, 30)}" contrast ${c.ratio}:1 (want >= ${need}:1). Shade the background, darken the ground or change the text colour.`); }
  if (stats.entropy > .93 && stats.top3 < .25) add('warn', 'no-focal-point', 'detail is spread evenly across the frame - nothing leads the eye. Make one thing loud (bigger mark or bigger type) and quiet the rest.');
  if (stats.quiet < .2) add('info', 'crowded', 'little negative space - remove one element (the restraint pass).');
  const centred = stats.symmetry > .97 && Math.abs(stats.centroid[0] - .5) < .03 && (spec.text || []).every(t => (t.align || 'center') === 'center');
  if (centred) add('info', 'dead-centre', 'perfectly mirrored and centred - fine once per kit, a template tell when every post does it.');
  return { issues: out, centred };
}

/** Kit-level checks: monoculture across posts, and the default font. */
export function judgeSet(perFile, specs, usedCustomFont) {
  const out = [], files = Object.keys(perFile);
  const centredAll = files.length >= 3 && files.every(f => perFile[f].centred);
  if (centredAll) out.push({ level: 'warn', rule: 'set-monoculture', msg: 'every post is centred and mirrored - the kit reads as one template re-rendered. Mix layouts (--layout per run, or edit logo.x / text.align in some specs).' });
  const fp = specs.map(s => [Math.round((s.logo?.x ?? .5) * 10), Math.round((s.logo?.y ?? .5) * 10), (s.text?.[0]?.align || 'center')].join('|'));
  if (specs.length >= 4 && new Set(fp).size === 1) out.push({ level: 'info', rule: 'same-layout', msg: 'all specs share one layout fingerprint.' });
  if (!usedCustomFont && specs.some(s => (s.text || []).length)) out.push({ level: 'info', rule: 'default-font', msg: 'type is set in the built-in Inter - an unchosen font is a tell. Pass the brand font with --font (and --font-family).' });
  return out;
}

export function grade(all) {
  // copy tells weigh double: weightless copy makes even a good render read as generated
  const tells = all.filter(i => i.level === 'warn').reduce((n, i) => n + (i.rule.startsWith('copy') ? 2 : 1), 0) + Math.floor(all.filter(i => i.level === 'info').length / 3);
  return tells <= 1 ? 'CLEAN' : tells <= 3 ? 'MILD' : tells <= 6 ? 'SLOPPY' : 'TERMINAL';
}
