#!/usr/bin/env node
// Shader Brand Kit CLI - one logo in, a premium brand kit out.
//   node brandkit.mjs logo.svg --text "Slow coffee."        -> stills for every look + reels + gallery
//   node brandkit.mjs --spec out/acme/specs/glass-post.json  -> re-render an edited spec
//   node brandkit.mjs logo.svg --playground                  -> live slider playground
//   node brandkit.mjs doctor                                 -> check Node, browser, GPU, ffmpeg
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { LOOKS, MOTION, DEFAULT_MOTION, LAYOUTS, paletteFrom, hexToHsl } from './looks.mjs';
import { lintCopy, PAGE_STATS, textBoxes, judge, judgeSet, grade } from './review.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');                 // the skill folder (holds package.json + lockfile)
const ENGINE = path.join(HERE, 'engine');
const FORMATS = { post: [1080, 1350], portrait: [1080, 1440], square: [1080, 1080], story: [1080, 1920], reel: [1080, 1920], wide: [1920, 1080] };

/* ---------------- args ---------------- */
const HELP = `Shader Brand Kit - one logo in, a premium brand kit out.

Usage:
  node brandkit.mjs <logo.svg|png|jpg> [options]
  node brandkit.mjs --spec <spec.json> [more.json ...] [--out dir]
  node brandkit.mjs <logo> --playground
  node brandkit.mjs doctor

Options:
  --text "Headline"        main line (\\n for a line break). Use the user's real copy.
  --sub "Small line"       secondary line
  --word "WORD"            big word behind the glass logo (glass look without a photo)
  --photo photo.jpg        photo background for the glass look
  --colors "#ff5a1f,#..."  brand colour(s); default: detected from the logo
  --font file.woff2|URL    font for all text (--font-family "Name" sets its family name)
  --looks a,b,c            ${Object.keys(LOOKS).join(', ')} (default: all)
  --formats a,b            ${Object.keys(FORMATS).join(', ')} (default: post)
  --reels a,b|none         looks to animate as 1080x1920 MP4 (default: chrome,glass)
  --layout name            force one layout for all looks: ${LAYOUTS.join(', ')} (default: varied per look)
  --motion name            override motion for all reels: ${Object.keys(MOTION).join(', ')}
  --duration 6 --fps 30    reel length / frame rate
  --invert                 light logo on a dark, non-transparent background
  --out dir                output folder (default: ./brandkit-out/<logo-name>)
  --quick                  half-resolution stills, no reels (fast preview)
  --playground [--no-open] write (and open) the live slider playground

Env: CHROME_PATH, FFMPEG_PATH, BRANDKIT_DATA (where puppeteer-core is installed if the skill folder is read-only)
`;
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) { const key = k.slice(2), nxt = argv[i + 1];
      if (nxt === undefined || nxt.startsWith('--')) a[key] = true; else { a[key] = nxt; i++; } }
    else a._.push(k);
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
const COMMAND = ['doctor', 'review'].includes(args._[0]) ? args._[0] : null;
if (args.help || (!args._.length && !args.spec)) { console.log(HELP); process.exit(args.help ? 0 : 1); }

/* ---------------- environment ---------------- */
const writable = d => { try { fs.accessSync(d, fs.constants.W_OK); return true; } catch { return false; } };
const dataDir = () => process.env.BRANDKIT_DATA || process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.cache', 'shader-brand-kit');
function tryRequire(dir) { const req = createRequire(path.join(dir, 'package.json'));
  for (const n of ['puppeteer-core', 'puppeteer']) { try { return req(n); } catch { } } return null; }
function loadPuppeteer() {
  const found = tryRequire(ROOT) || tryRequire(dataDir()); if (found) return found;
  const target = writable(ROOT) ? ROOT : dataDir();
  if (target !== ROOT) { fs.mkdirSync(target, { recursive: true });
    for (const f of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(ROOT, f), path.join(target, f)); }
  console.log(`[brandkit] first run: installing puppeteer-core into ${target} (one time) ...`);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['ci', '--omit=dev', '--no-fund', '--no-audit'], { cwd: target, stdio: 'inherit', shell: process.platform === 'win32' });
  const mod = r.status === 0 && tryRequire(target);
  if (!mod) { console.error(`[brandkit] could not install puppeteer-core. Run:  cd "${target}" && npm ci`); process.exit(1); }
  return mod;
}
function chromeCandidates() {
  const L = process.env.LOCALAPPDATA || '', PF = process.env.PROGRAMFILES || 'C:/Program Files', PF86 = process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', H = os.homedir();
  const which = n => { const r = spawnSync('which', [n], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
  return ({
    win32: [`${PF}/Google/Chrome/Application/chrome.exe`, `${PF86}/Google/Chrome/Application/chrome.exe`, `${L}/Google/Chrome/Application/chrome.exe`,
      `${PF86}/Microsoft/Edge/Application/msedge.exe`, `${PF}/Microsoft/Edge/Application/msedge.exe`, `${L}/Microsoft/Edge/Application/msedge.exe`],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', `${H}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
      '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    linux: () => ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'].map(which).filter(Boolean)
      .concat(['/usr/bin/google-chrome', '/usr/bin/chromium', '/snap/bin/chromium'])
  }[process.platform]);
}
function findChrome() {
  const env = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH; if (env && fs.existsSync(env)) return { exe: env, tried: [env] };
  let c = chromeCandidates(); if (typeof c === 'function') c = c(); c = c || [];
  return { exe: c.find(p => fs.existsSync(p)), tried: c };
}
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
let _ff; const hasFfmpeg = () => (_ff ??= spawnSync(FFMPEG, ['-version'], { stdio: 'ignore' }).status === 0);
const INSTALL = {
  chrome: { win32: 'winget install Google.Chrome', darwin: 'brew install --cask google-chrome', linux: 'sudo apt install chromium (or google-chrome-stable)' },
  ffmpeg: { win32: 'winget install Gyan.FFmpeg', darwin: 'brew install ffmpeg', linux: 'sudo apt install ffmpeg' }
};

/* ---------------- assets -> data URLs ---------------- */
const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };
function dataUrl(p, base) {
  if (!p || /^(data:|https?:)/.test(p)) return p;
  const abs = path.resolve(base || process.cwd(), p); if (!fs.existsSync(abs)) throw new Error('file not found: ' + abs);
  const ext = path.extname(abs).toLowerCase(); let buf = fs.readFileSync(abs);
  if (ext === '.svg') { // SVGs without width/height draw at 300x150 in a canvas -> give them a real size from the viewBox
    let s = buf.toString('utf8'); const tag = s.match(/<svg[^>]*>/i)?.[0] || '';
    if (!/\swidth=/.test(tag) || /\swidth="\d+%"/.test(tag)) { const vb = tag.match(/viewBox="([^"]+)"/i);
      if (vb) { const [, , w, h] = vb[1].trim().split(/[\s,]+/).map(Number), k = 2000 / Math.max(w, h);
        s = s.replace(tag, tag.replace(/\s(width|height)="[^"]*"/g, '').replace(/<svg/i, `<svg width="${Math.round(w * k)}" height="${Math.round(h * k)}"`)); } }
    if (/<text[\s>]/i.test(s)) console.warn('[brandkit] warning: the SVG contains <text>. Fonts are not embedded in SVG images, so convert text to outlines for an exact shape.');
    buf = Buffer.from(s, 'utf8'); }
  return `data:${MIME[ext] || 'application/octet-stream'};base64,${buf.toString('base64')}`;
}
function embed(spec, base) {
  const s = JSON.parse(JSON.stringify(spec));
  if (s.logo?.src) s.logo.src = dataUrl(s.logo.src, base);
  if (s.background?.src) s.background.src = dataUrl(s.background.src, base);
  (s.fonts || []).forEach(f => f.src = dataUrl(f.src, base));
  (s.images || []).forEach(im => im.src = dataUrl(im.src, base));
  return s;
}

/* ---------------- browser ---------------- */
const SOFTWARE = /SwiftShader|llvmpipe|Basic Render|Software/i;
async function openEngine({ quiet } = {}) {
  const puppeteer = loadPuppeteer(), { exe, tried } = findChrome();
  if (!exe) { console.error(`[brandkit] No Chrome, Edge or Chromium found. Tried:\n  ${tried.join('\n  ')}\nInstall one (${INSTALL.chrome[process.platform] || 'install Chrome'}) or set CHROME_PATH.`); process.exit(1); }
  const base = ['--allow-file-access-from-files', '--ignore-gpu-blocklist', '--enable-gpu', '--hide-scrollbars', '--mute-audio', '--force_high_performance_gpu'];
  const gpu = process.platform === 'win32' ? ['--use-angle=d3d11'] : process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=vulkan', '--enable-features=Vulkan'];
  const ladder = [[...base, ...gpu], [...base, '--use-angle=gl'], [...base, '--use-angle=swiftshader', '--enable-unsafe-swiftshader']];
  for (const flags of ladder) {
    let browser;
    try {
      browser = await puppeteer.launch({ executablePath: exe, headless: true, args: flags, protocolTimeout: 600000 });
      const page = await browser.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (m.type() === 'warning' && !quiet) console.warn('[page]', m.text()); });
      await page.goto(pathToFileURL(path.join(ENGINE, 'render.html')).href);
      const renderer = await page.evaluate(() => { try { const c = document.createElement('canvas').getContext('webgl2'); if (!c) return null;
        const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER); } catch { return null; } });
      if (renderer) return { browser, page, errors, exe, renderer, software: SOFTWARE.test(renderer) };
    } catch (e) { if (!quiet) console.warn('[brandkit] browser start failed with', flags.slice(-1)[0], '-', e.message.split('\n')[0]); }
    if (browser) await browser.close().catch(() => { });
  }
  console.error('[brandkit] WebGL2 is unavailable, even in software mode. Run `node brandkit.mjs doctor`.'); process.exit(1);
}
function checkErrors(eng, what) {
  if (!eng.errors.length) return;
  const msg = eng.errors.splice(0).join('\n  '); throw new Error(`render failed (${what}):\n  ${msg}`);
}

async function renderSpec(eng, spec, base, outFile, opts = {}) {
  const { page } = eng, s = embed(spec, base);
  const video = spec.duration && !opts.still;
  if (video) s.grain = (s.grain ?? .045) * .55;        // per-frame grain eats bitrate; lighter for video
  if (opts.quick) { const f = typeof s.format === 'object' ? [s.format.w, s.format.h] : FORMATS[s.format || 'post']; s.format = { w: Math.round(f[0] / 2), h: Math.round(f[1] / 2) }; }
  const info = await page.evaluate(sp => window.bk_setup(sp), s); checkErrors(eng, 'setup ' + path.basename(outFile));
  await page.setViewport({ width: info.w, height: info.h, deviceScaleFactor: 1 });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const write = (dataurl, file) => fs.writeFileSync(file, Buffer.from(dataurl.split(',')[1], 'base64'));
  if (!video) { write(await page.evaluate(t => window.bk_frame(t), spec.t ?? 1.2), outFile); checkErrors(eng, path.basename(outFile)); return info; }

  const fps = spec.fps || 30, n = Math.round(spec.duration * fps);
  if (!hasFfmpeg()) { const dir = outFile.replace(/\.mp4$/, '_frames'); fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < n; i++) write(await page.evaluate(t => window.bk_frame(t), i / fps), path.join(dir, `f${String(i).padStart(4, '0')}.png`));
    console.warn(`[brandkit] ffmpeg not found - saved PNG frames to ${dir}. Install ffmpeg (${INSTALL.ffmpeg[process.platform]}) or set FFMPEG_PATH.`); return info; }
  // JPEG q.96 frames encode ~4x faster in the page than PNG; H.264 dominates the final quality anyway.
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p',
    '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1', '-preset', 'slow', '-crf', '18', '-g', String(fps * 2), '-bf', '2',
    '-maxrate', '20M', '-bufsize', '40M', '-fps_mode', 'cfr',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => { ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))); ff.on('error', rej); });
  for (let i = 0; i < n; i++) {
    const d = await page.evaluate(t => window.bk_frame(t, 'image/jpeg', .96), i / fps);
    if (i === 0) checkErrors(eng, path.basename(outFile));
    if (!ff.stdin.write(Buffer.from(d.split(',')[1], 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (i % fps === 0 && process.stdout.isTTY) process.stdout.write(`\r  ${path.basename(outFile)}  ${Math.round(100 * i / n)}%   `);
  }
  ff.stdin.end(); await done; checkErrors(eng, path.basename(outFile));
  if (process.stdout.isTTY) process.stdout.write('\r'); console.log(`  ok ${path.basename(outFile)}  (${spec.duration}s, ${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB)`);
  return info;
}

/* ---------------- checks ---------------- */
// Instagram/TikTok UI covers the top ~14% and bottom ~25% of 9:16 frames (reels); stories ~20%.
function lintSpec(spec, id) {
  const tall = spec.format === 'story' || spec.format === 'reel'; const warn = [];
  if (tall) for (const t of spec.text || []) { const y = t.y ?? .85, top = y - (t.size ?? .05) * 0.56 * 0.9;
    if (y > .75) warn.push(`text "${String(t.text).slice(0, 24)}" sits at y=${y.toFixed(2)} - inside the reel UI zone (keep y <= 0.75)`);
    if (top < .14) warn.push(`text "${String(t.text).slice(0, 24)}" reaches into the top UI zone`); }
  if (tall && spec.logo && (spec.logo.y < .14 || spec.logo.y > .75)) warn.push('logo centre is inside a 9:16 UI zone');
  warn.forEach(w => console.warn(`  ! ${id}: ${w}`));
}
function contactSheet(outDir, files, name) {
  if (!hasFfmpeg() || files.length < 2) return null;
  const out = path.join(outDir, name), inputs = files.flatMap(f => ['-i', path.join(outDir, f)]);
  const chains = files.map((_, i) => `[${i}]scale=360:-2[v${i}]`).join(';');   // one sheet per format, so all tiles share a height
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', `${chains};${files.map((_, i) => `[v${i}]`).join('')}hstack=inputs=${files.length},format=rgb24`, out]);
  return r.status === 0 ? name : null;
}

/* ---------------- anti-slop review ---------------- */
async function reviewStill(eng, file, spec) {
  const f = typeof spec.format === 'object' ? [spec.format.w, spec.format.h] : FORMATS[spec.format || 'post'];
  const stats = await eng.page.evaluate(`(${PAGE_STATS.toString()})(${JSON.stringify(dataUrl(file))}, ${JSON.stringify(textBoxes(spec, f[0], f[1]))})`);
  return judge(stats, spec, spec.meta?.brand, h => hexToHsl(h)[0]);
}
function printReview(reviews, copyIssues, outDir, specs = [], customFont = false) {
  const set = judgeSet(reviews, specs, customFont);
  const all = [...copyIssues.map(i => ({ ...i, file: 'copy' })), ...set.map(i => ({ ...i, file: 'kit' })),
    ...Object.entries(reviews).flatMap(([file, r]) => r.issues.map(i => ({ ...i, file })))];
  const g = grade(all);
  fs.writeFileSync(path.join(outDir, 'review.json'), JSON.stringify({ grade: g, issues: all }, null, 2));
  const warns = all.filter(i => i.level === 'warn'), infos = all.filter(i => i.level === 'info');
  console.log(`[review] AI-look grade: ${g}  (${warns.length} warning(s), ${infos.length} note(s); CLEAN/MILD are shippable, fix SLOPPY/TERMINAL first)`);
  for (const i of [...warns, ...infos]) console.log(`  ${i.level === 'warn' ? '!' : '-'} [${i.file}] ${i.rule}: ${i.msg}`);
  console.log('[review] numbers only catch the measurable tells - still Read the contact sheet and run the vision check in references/anti-slop.md.');
}

/* ---------------- gallery ---------------- */
function gallery(dir, items, title) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cards = items.map(it => `<figure>${it.file.endsWith('.mp4')
    ? `<video src="${it.file}" autoplay loop muted playsinline></video>` : `<a href="${it.file}"><img src="${it.file}" loading="lazy" alt="${esc(it.label)}"></a>`}
<figcaption>${esc(it.label)} · <a href="specs/${it.spec}">spec</a></figcaption></figure>`).join('\n');
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} - brand kit</title>
<style>body{margin:0;background:#0b0b0c;color:#ddd;font:15px/1.4 system-ui,sans-serif}h1{font-weight:700;margin:32px 24px 8px}p{margin:0 24px 24px;color:#888}a{color:#bbb}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;padding:0 24px 40px}figure{margin:0}img,video{width:100%;display:block;border-radius:10px;background:#111}
figcaption{margin-top:8px;color:#999;font-size:13px}</style><h1>${esc(title)}</h1><p>Shader Brand Kit · edit any JSON in <code>specs/</code> and re-render with <code>--spec</code>.</p><main>${cards}</main></html>`);
}

/* ---------------- playground ---------------- */
function playground(logo, extra) {
  const dir = path.resolve(args.out || path.join(process.cwd(), 'brandkit-out', 'playground')); fs.mkdirSync(dir, { recursive: true });
  for (const f of ['engine.js', 'playground.html']) fs.copyFileSync(path.join(ENGINE, f), path.join(dir, f === 'playground.html' ? 'index.html' : f));
  const init = { logo: logo ? dataUrl(logo) : null, ...extra };
  // file:// pages cannot fetch fonts from disk in a normal browser -> inline them
  const fontData = Object.fromEntries(['inter-latin.woff2', 'inter-latin-ext.woff2'].map(f => [f, dataUrl(path.join(ENGINE, 'fonts', f))]));
  fs.writeFileSync(path.join(dir, 'init.js'), 'window.BK_INIT=' + JSON.stringify(init) + ';window.BK_FONT_DATA=' + JSON.stringify(fontData) + ';');
  const file = path.join(dir, 'index.html');
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : process.platform === 'darwin' ? ['open', [file]] : ['xdg-open', [file]];
  if (!args['no-open']) spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' }).unref();
  console.log('[brandkit] playground:', file);
}

/* ---------------- doctor ---------------- */
async function doctor() {
  const ok = (b, label, fix) => console.log(`${b ? ' ok ' : 'FAIL'}  ${label}${!b && fix ? `\n      fix: ${fix}` : ''}`);
  const major = +process.versions.node.split('.')[0];
  ok(major >= 18, `Node ${process.versions.node}`, 'install Node 18 or newer');
  const { exe, tried } = findChrome(); ok(!!exe, `browser: ${exe || 'not found (tried ' + tried.length + ' paths)'}`, `${INSTALL.chrome[process.platform]} or set CHROME_PATH`);
  ok(hasFfmpeg(), `ffmpeg: ${hasFfmpeg() ? FFMPEG : 'not found'}`, `${INSTALL.ffmpeg[process.platform]} or set FFMPEG_PATH (without it reels are saved as PNG frames)`);
  if (!exe) return;
  const eng = await openEngine({ quiet: true });
  ok(!eng.software, `WebGL2 renderer: ${eng.renderer}${eng.software ? ' (software - works, but slow)' : ''}`, 'update GPU drivers; on Linux servers install libvulkan1 or run under Xvfb');
  await eng.browser.close();
}

/* ---------------- main ---------------- */
(async () => {
  if (COMMAND === 'doctor') return doctor();
  const list = v => (v && v !== true ? String(v).split(',').map(x => x.trim()).filter(Boolean) : null);
  const font = args.font && args.font !== true ? { family: args['font-family'] || 'BrandFont', src: args.font, weight: '100 900' } : null;
  if (args.playground) { playground(args._[0], { text: args.text, colors: list(args.colors) }); return; }

  const eng = await openEngine(), t0 = process.hrtime.bigint();
  if (eng.software) console.warn('[brandkit] software rendering (no GPU found) - this works but is slow; consider --quick.');
  try {
    if (args.spec) {                                   // re-render explicit spec files
      const files = [args.spec, ...args._].filter(f => f && f !== true && f.endsWith('.json'));
      for (const f of files) { const spec = JSON.parse(fs.readFileSync(f, 'utf8')), base = path.dirname(path.resolve(f));
        const out = path.resolve(args.out || path.dirname(base), path.basename(f, '.json') + (spec.duration ? '.mp4' : '.png'));
        lintSpec(spec, path.basename(f));
        const info = await renderSpec(eng, spec, base, out, { quick: args.quick });
        if (!spec.duration) { console.log('  ok', out, info.w + 'x' + info.h);
          printReview({ [path.basename(out)]: await reviewStill(eng, out, spec) }, lintCopy((spec.text || []).map(t => t.text)), path.dirname(out), [spec], !!(spec.fonts || []).length); } }
      return;
    }
    if (COMMAND === 'review') {                         // review an existing output folder
      const dir = path.resolve(args._[1] || '.'), sdir = path.join(dir, 'specs'), reviews = {}, texts = new Set(), specs = [];
      for (const f of fs.readdirSync(sdir).filter(f => f.endsWith('.json'))) { const png = path.join(dir, f.replace(/\.json$/, '.png'));
        const spec = JSON.parse(fs.readFileSync(path.join(sdir, f), 'utf8')); (spec.text || []).forEach(t => texts.add(t.text));
        if (fs.existsSync(png)) { reviews[path.basename(png)] = await reviewStill(eng, png, spec); specs.push(spec); } }
      printReview(reviews, lintCopy([...texts]), dir, specs, specs.some(s => (s.fonts || []).length)); return;
    }
    const logo = path.resolve(args._[0]); if (!fs.existsSync(logo)) throw new Error('logo not found: ' + logo);
    const name = path.basename(logo).replace(/\.[^.]+$/, '');
    const outDir = path.resolve(args.out || path.join(process.cwd(), 'brandkit-out', name)), specDir = path.join(outDir, 'specs');
    fs.mkdirSync(specDir, { recursive: true });

    const an = await eng.page.evaluate((s, inv) => window.bk_analyze(s, { invert: inv }), dataUrl(logo), !!args.invert); checkErrors(eng, 'logo analysis');
    if (an.coverage < .005) throw new Error('the logo mask is empty. Is the logo white on transparent? Try --invert.');
    if (an.coverage > .9) console.warn('[brandkit] warning: the logo fills its whole box - background keying may have failed. Try --invert or a transparent PNG/SVG.');
    const colors = list(args.colors) || [], brand = colors[0] || an.color, palette = paletteFrom(brand, colors);
    console.log(`[brandkit] ${name}  |  GPU: ${eng.renderer}  |  brand colour: ${brand || 'none detected -> graphite palette'}${an.keyed ? '  |  opaque logo: background keyed out' : ''}`);

    const looks = list(args.looks) || Object.keys(LOOKS), formats = list(args.formats) || ['post'];
    const reels = args.reels === 'none' || args.quick ? [] : (list(args.reels) || ['chrome', 'glass']);
    for (const l of [...looks, ...reels]) if (!LOOKS[l]) throw new Error(`unknown look "${l}". Available: ${Object.keys(LOOKS).join(', ')}`);
    for (const f of formats) if (!FORMATS[f]) throw new Error(`unknown format "${f}". Available: ${Object.keys(FORMATS).join(', ')}`);
    if (args.layout && !LAYOUTS.includes(args.layout)) throw new Error(`unknown layout "${args.layout}". Available: ${LAYOUTS.join(', ')}`);
    if (args.motion && !MOTION[args.motion]) throw new Error(`unknown motion "${args.motion}". Available: ${Object.keys(MOTION).join(', ')}`);
    const fix = s => s && s !== true ? String(s).replace(/\\n/g, '\n') : null;
    const ctxBase = { logo, palette, brand, text: fix(args.text), sub: fix(args.sub), word: fix(args.word), photo: args.photo ? path.resolve(args.photo) : null, font, invert: !!args.invert, layout: args.layout && args.layout !== true ? args.layout : null };
    const rel = p => p && path.relative(specDir, p).split(path.sep).join('/');
    const items = [], stills = {};

    const job = async (look, format, motion) => {
      const spec = LOOKS[look].build({ ...ctxBase, format });
      if (font) spec.fonts = [font];
      if (motion) { spec.format = 'reel'; spec.duration = Number(args.duration || 6); spec.fps = Number(args.fps || 30); MOTION[motion](spec, spec.duration); }
      const saved = JSON.parse(JSON.stringify(spec)); saved.logo.src = rel(logo);   // editable spec, paths relative to it
      saved.meta = { look, brand: brand || null };
      if (saved.background.src) saved.background.src = rel(saved.background.src);
      (saved.fonts || []).forEach(f => { if (!/^(data:|https?:)/.test(f.src)) f.src = rel(path.resolve(f.src)); });
      const id = motion ? `${look}-${motion}` : `${look}-${format}`;
      fs.writeFileSync(path.join(specDir, id + '.json'), JSON.stringify(saved, null, 2));
      lintSpec(saved, id);
      const file = id + (motion ? '.mp4' : '.png');
      await renderSpec(eng, saved, specDir, path.join(outDir, file), { quick: args.quick });
      items.push({ file, spec: id + '.json', label: `${look} · ${motion ? 'reel 9:16 · ' + motion : format}` });
      if (!motion) { console.log('  ok', file); (stills[format] ||= []).push(file); reviews[file] = await reviewStill(eng, path.join(outDir, file), saved); stillSpecs.push(saved); }
    };
    const reviews = {}, stillSpecs = [];
    for (const f of formats) for (const l of looks) await job(l, f);
    for (const l of reels) await job(l, 'reel', args.motion || DEFAULT_MOTION[l] || 'reveal');
    const sheets = Object.entries(stills).map(([f, files]) => contactSheet(outDir, files, `contact-${f}.png`)).filter(Boolean);
    gallery(outDir, items, name);
    printReview(reviews, lintCopy([ctxBase.text, ctxBase.sub, ctxBase.word]), outDir, stillSpecs, !!font);
    const secs = Number(process.hrtime.bigint() - t0) / 1e9;
    console.log(`[brandkit] done in ${secs.toFixed(1)}s -> ${path.join(outDir, 'index.html')}`);
    if (sheets.length) console.log(`[brandkit] contact sheet${sheets.length > 1 ? 's' : ''} (look at these first): ${sheets.map(s => path.join(outDir, s)).join(', ')}`);
  } finally { await eng.browser.close(); }
})().catch(e => { console.error('[brandkit] ' + (e.message || e)); process.exit(1); });
