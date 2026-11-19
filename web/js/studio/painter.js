/**
 * The painter on the device. It cannot render; it sketches, quickly and honestly: colour ramps, washes, halftones,
 * pixels and ink for looks, flat scenery for words, tints and stickers for pinned regions. Every sketch it makes is
 * stamped as one. It also drafts the first impression of a render while the studio paints the real thing.
 */
import { rgb, hex, mix, luminance, hsl, fromHsl, alpha } from '../core/color.js';
import { vibeOf, readVibe } from '../room/maker.js';
import { rng } from '../core/dom.js';
import { path2d } from '../room/ornaments.js';
import { rampAround } from './looks.js';
import { placeIn, ownLand, placeSays, placeNote, paintPlace, mars as marsLand } from './atlas.js';

export const MAX = 1024;
export function make(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
export const ctx2d = c => /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true }));
export const fitSize = (w, h, max = MAX) => { const s = Math.min(1, max / Math.max(w, h)); return [Math.round(w * s), Math.round(h * s)]; };
/** @returns {Promise<HTMLCanvasElement>} */
export async function fromBlob(blob, max = MAX) {
  const bmp = await createImageBitmap(blob), [w, h] = fitSize(bmp.width, bmp.height, max), c = make(w, h);
  c.getContext('2d').drawImage(bmp, 0, 0, w, h); bmp.close?.(); return c;
}
export const toBlob = (c, type = 'image/jpeg', q = .9) => new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('The picture could not be saved'))), type, q));
export function copy(src, w = src.width, h = src.height) { const c = make(w, h); c.getContext('2d').drawImage(src, 0, 0, w, h); return c; }

/** The main colours of a picture, darkest first (k-means on a small copy). */
export function paletteOf(src, k = 5) {
  const s = copy(src, 40, Math.max(1, Math.round(40 * src.height / src.width))), d = ctx2d(s).getImageData(0, 0, s.width, s.height).data, px = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
  let cs = [px[Math.floor(px.length / 2)]];
  while (cs.length < k) { let best = null, bd = -1; for (const p of px) { const dd = Math.min(...cs.map(c => (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2)); if (dd > bd) { bd = dd; best = p; } } cs.push(best); }
  for (let it = 0; it < 8; it++) {
    const sum = cs.map(() => [0, 0, 0, 0]);
    for (const p of px) { let bi = 0, bd = Infinity; cs.forEach((c, i) => { const dd = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (dd < bd) { bd = dd; bi = i; } }); const s2 = sum[bi]; s2[0] += p[0]; s2[1] += p[1]; s2[2] += p[2]; s2[3]++; }
    cs = sum.map((s2, i) => (s2[3] ? [s2[0] / s2[3], s2[1] / s2[3], s2[2] / s2[3]] : cs[i]));
  }
  return cs.map(c => hex(c)).sort((a, b) => luminance(a) - luminance(b));
}

function rampLUT(ramp) {
  const stops = ramp.map(rgb), lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255 * (stops.length - 1), j = Math.min(stops.length - 2, Math.floor(t)), f = t - j;
    for (let k = 0; k < 3; k++) lut[i * 3 + k] = stops[j][k] + (stops[j + 1][k] - stops[j][k]) * f;
  }
  return lut;
}

/**
 * A look, sketched onto a picture.
 * @param {HTMLCanvasElement} src @param {Partial<import('./looks.js').Look>} look @param {number} [strength] @param {number} [seed]
 */
export function grade(src, look, strength = 1, seed = 1, stages = null) {
  const w = src.width, h = src.height, out = make(w, h), c = ctx2d(out), rnd = rng(seed);
  if (look.halftone) return halftone(src, look.halftone, strength);
  if (look.wash) return watercolour(src, look, strength, seed, stages);
  if (look.pixel) { const pw = look.pixel, ph = Math.round(pw * h / w), small = copy(src, pw, ph); c.imageSmoothingEnabled = false; c.drawImage(small, 0, 0, w, h); c.imageSmoothingEnabled = true; }
  else { c.filter = look.pre || 'none'; c.drawImage(src, 0, 0); c.filter = 'none'; }
  const img = c.getImageData(0, 0, w, h), d = img.data, lut = look.ramp ? rampLUT(look.ramp) : null, keep = look.keep ?? .2;
  const lv = look.posterize || 0, grain = (look.grain || 0) * 255, fade = (look.fade || 0) * 255, o = ctx2d(src).getImageData(0, 0, w, h).data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (lv) { const q = 255 / (lv - 1); r = Math.round(r / q) * q; g = Math.round(g / q) * q; b = Math.round(b / q) * q; }
    if (lut) {
      const L = (r * .299 + g * .587 + b * .114) | 0, R = lut[L * 3], G = lut[L * 3 + 1], B = lut[L * 3 + 2];
      if (keep) { const m = (r + g + b) / 3; r = R + (r - m) * keep; g = G + (g - m) * keep; b = B + (b - m) * keep; } else { r = R; g = G; b = B; }
    }
    if (fade) { r = r * (1 - fade / 255) + fade; g = g * (1 - fade / 255) + fade * .96; b = b * (1 - fade / 255) + fade * .9; }
    if (grain) { const n = (rnd() - .5) * grain; r += n; g += n; b += n; }
    const s = strength; d[i] = o[i] + (r - o[i]) * s; d[i + 1] = o[i + 1] + (g - o[i + 1]) * s; d[i + 2] = o[i + 2] + (b - o[i + 2]) * s;
  }
  c.putImageData(img, 0, 0);
  if (look.edges) inkEdges(out, src, look.edges * strength, look.ramp?.[0] || '#111111');
  if (look.paper) paper(out, look.paper, strength);
  if (look.bloom) bloom(out, look.bloom * strength);
  if (look.scan) scanlines(out, look.scan * strength);
  if (look.vignette) vignette(out, look.vignette * strength);
  return out;
}

/**
 * Watercolour as a medium: the picture's own colours (or a look's ramp) laid in flat, transparent washes, pigment pooled
 * darker where one wash meets another, blooms where the water sat, granulated on cold-press paper that shows through
 * at ragged margins, over a faint pencil drawing.
 * Pass stages (an array) to keep the painting's steps as it goes: the pencil, the washes, the finish.
 * @param {HTMLCanvasElement} src @param {any} look @param {{ label: string, canvas: HTMLCanvasElement, reveal?: string }[] | null} [stages]
 */
function watercolour(src, look, strength = 1, seed = 1, stages = null) {
  const w = src.width, h = src.height, rnd = rng(seed), sw = Math.max(48, Math.round(w * .6)), sh = Math.max(48, Math.round(h * .6)), n = sw * sh;
  const soft = make(sw, sh), sc = ctx2d(soft);
  sc.filter = 'blur(1px) saturate(1.12)'; sc.drawImage(src, 0, 0, sw, sh); sc.filter = 'none';
  const pig = paletteOf(soft, 10).map(rgb), img = sc.getImageData(0, 0, sw, sh), d = img.data, L = new Float32Array(n);
  const lut = look.ramp ? rampLUT(look.ramp) : null, keep = look.keep ?? .5, [pr, pg, pb] = rgb(look.paper || '#fbf6ec');
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    let r = d[i], g = d[i + 1], b = d[i + 2], best = pig[0], bd = 1e9;
    for (const c of pig) { const dd = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (dd < bd) { bd = dd; best = c; } }
    r = r * .5 + best[0] * .5; g = g * .5 + best[1] * .5; b = b * .5 + best[2] * .5;   // a few pigments, flat washes
    if (lut) { const l = (r * .299 + g * .587 + b * .114) | 0, m = (r + g + b) / 3; r = lut[l * 3] + (r - m) * keep; g = lut[l * 3 + 1] + (g - m) * keep; b = lut[l * 3 + 2] + (b - m) * keep; }
    r = pr - (pr - r) * .84; g = pg - (pg - g) * .84; b = pb - (pb - b) * .84;            // transparent: the paper shows through every wash
    d[i] = r; d[i + 1] = g; d[i + 2] = b; L[p] = r * .299 + g * .587 + b * .114;
  }
  const flat = stages ? make(sw, sh) : null; flat?.getContext('2d').putImageData(img, 0, 0);
  const E = new Float32Array(n);
  for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) { const i = y * sw + x; E[i] = Math.min(1, Math.max(0, (Math.hypot(L[i + 1] - L[i - 1], L[i + sw] - L[i - sw]) - 6) / 40)); }
  // where the water sat: a coarse random field, smoothly enlarged
  const coarse = make(Math.ceil(sw / 14), Math.ceil(sh / 14)), cx = ctx2d(coarse), cn = cx.createImageData(coarse.width, coarse.height);
  for (let i = 0; i < cn.data.length; i += 4) { cn.data[i] = cn.data[i + 1] = cn.data[i + 2] = rnd() * 255; cn.data[i + 3] = 255; }
  cx.putImageData(cn, 0, 0);
  const field = make(sw, sh), fc = ctx2d(field); fc.imageSmoothingQuality = 'high'; fc.drawImage(coarse, 0, 0, sw, sh);
  const N = fc.getImageData(0, 0, sw, sh).data, edge = cx.createImageData(sw, sh), ed = edge.data;
  for (let y = 0, p = 0; y < sh; y++) for (let x = 0; x < sw; x++, p++) {
    const i = p * 4, e = (E[p] + (E[p - 1] || 0) + (E[p + 1] || 0) + (E[p - sw] || 0) + (E[p + sw] || 0)) / 5, nz = N[i] / 255;
    const k = 1 - e * .3 - (nz - .5) * .14 - (rnd() - .5) * .05;                         // pooled at the edges, blooms, granulation
    const rim = Math.min(x, y, sw - 1 - x, sh - 1 - y) / Math.min(sw, sh), a = Math.max(0, Math.min(1, (rim - .03 - nz * .05) / .025)); // ragged white margin
    d[i] = pr + (d[i] * k - pr) * a; d[i + 1] = pg + (d[i + 1] * k - pg) * a; d[i + 2] = pb + (d[i + 2] * k - pb) * a; ed[i + 3] = a * 255;
  }
  sc.putImageData(img, 0, 0);
  const out = make(w, h), c = ctx2d(out);
  c.imageSmoothingQuality = 'high'; c.drawImage(soft, 0, 0, w, h);
  const tooth = c.getImageData(0, 0, w, h), td = tooth.data;                               // the paper's own tooth
  for (let i = 0; i < td.length; i += 4) { const v = (rnd() - .5) * 14; td[i] += v; td[i + 1] += v; td[i + 2] += v; }
  c.putImageData(tooth, 0, 0);
  // the pencil underneath, holding the likeness where the washes soften it, and only where there is paint
  const pencil = make(w, h), pc = ctx2d(pencil), painted = make(sw, sh); ctx2d(painted).putImageData(edge, 0, 0);
  inkEdges(pencil, src, .34, '#5e574e'); pc.globalCompositeOperation = 'destination-in'; pc.drawImage(painted, 0, 0, w, h);
  c.drawImage(pencil, 0, 0);
  if (stages && flat) {
    const half = (/** @type {(x: CanvasRenderingContext2D) => void} */ draw) => { const s = make(w / 2, h / 2), x = s.getContext('2d'); x.scale(.5, .5); draw(x); return s; };
    stages.push({ label: 'A pencil drawing first', canvas: half(x => { x.fillStyle = look.paper || '#fbf6ec'; x.fillRect(0, 0, w, h); x.drawImage(pencil, 0, 0); }), reveal: 'fade' });
    stages.push({ label: 'Washes, in its own colours', canvas: half(x => { x.drawImage(flat, 0, 0, w, h); x.drawImage(pencil, 0, 0); }) });
    stages.push({ label: 'Pigment at the edges, paper at the margins', canvas: copy(out, w / 2, h / 2), reveal: 'fade' });
  }
  if (strength >= 1) return out;
  const mixed = make(w, h), mc = ctx2d(mixed); mc.drawImage(src, 0, 0); mc.globalAlpha = Math.max(0, strength); mc.drawImage(out, 0, 0);
  return mixed;
}

function inkEdges(out, src, amount, ink) {
  const w = src.width, h = src.height, sw = Math.round(w / 2), sh = Math.round(h / 2), s = copy(src, sw, sh), d = ctx2d(s).getImageData(0, 0, sw, sh).data, L = new Float32Array(sw * sh);
  for (let i = 0; i < L.length; i++) L[i] = d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114;
  const e = ctx2d(s).createImageData(sw, sh), ed = e.data, [ir, ig, ib] = rgb(ink);
  for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) {
    const i = y * sw + x, gx = L[i + 1 - sw] + 2 * L[i + 1] + L[i + 1 + sw] - L[i - 1 - sw] - 2 * L[i - 1] - L[i - 1 + sw], gy = L[i - 1 + sw] + 2 * L[i + sw] + L[i + 1 + sw] - L[i - 1 - sw] - 2 * L[i - sw] - L[i + 1 - sw];
    const m = Math.min(255, Math.hypot(gx, gy) * 1.1), a = m > 46 ? Math.min(255, (m - 46) * 2.2) : 0;
    ed[i * 4] = ir; ed[i * 4 + 1] = ig; ed[i * 4 + 2] = ib; ed[i * 4 + 3] = a * amount;
  }
  const t = make(sw, sh); t.getContext('2d').putImageData(e, 0, 0);
  const c = out.getContext('2d'); c.globalAlpha = .9; c.drawImage(t, 0, 0, w, h); c.globalAlpha = 1;
}
function paper(out, tone, amount) {
  const c = out.getContext('2d'), w = out.width, h = out.height, t = make(w, h), tc = t.getContext('2d');
  tc.fillStyle = tone; tc.fillRect(0, 0, w, h); tc.globalCompositeOperation = 'multiply'; tc.drawImage(out, 0, 0);
  c.globalAlpha = amount; c.drawImage(t, 0, 0); c.globalAlpha = 1;
}
function bloom(out, amount) {
  const c = out.getContext('2d'), w = out.width, h = out.height, t = make(w / 4, h / 4), tc = t.getContext('2d');
  tc.filter = 'brightness(1.25) contrast(1.4) blur(3px)'; tc.drawImage(out, 0, 0, t.width, t.height);
  c.globalCompositeOperation = 'screen'; c.globalAlpha = amount * .8; c.drawImage(t, 0, 0, w, h); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}
function scanlines(out, amount) {
  const c = out.getContext('2d'); c.fillStyle = `rgb(0 0 0 / ${.5 * amount})`;
  for (let y = 0; y < out.height; y += 3) c.fillRect(0, y, out.width, 1);
}
export function vignette(out, amount) {
  const c = out.getContext('2d'), w = out.width, h = out.height, g = c.createRadialGradient(w / 2, h * .45, Math.min(w, h) * .3, w / 2, h * .45, Math.hypot(w, h) * .62);
  g.addColorStop(0, 'rgb(0 0 0 / 0)'); g.addColorStop(1, `rgb(0 0 0 / ${amount * .7})`);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
}
function halftone(src, { inks, paper: tone, cell }, strength) {
  const w = src.width, h = src.height, out = make(w, h), c = out.getContext('2d'), d = ctx2d(src).getImageData(0, 0, w, h).data;
  c.fillStyle = tone; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'multiply';
  const size = Math.max(3, Math.round(cell * w / 600));
  inks.forEach((ink, k) => {
    c.fillStyle = ink; const ox = k * size * .4, oy = k * size * .3, ang = k ? .5 : 0;
    for (let y = -size; y < h + size; y += size) for (let x = -size; x < w + size; x += size) {
      const sx = Math.min(w - 1, Math.max(0, Math.round(x + (k ? (y % (size * 2) ? size / 2 : 0) : 0)))), sy = Math.min(h - 1, Math.max(0, Math.round(y))), i = (sy * w + sx) * 4;
      const L = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) / 255, warm = (d[i] - d[i + 2]) / 255;
      const v = k ? Math.max(0, .55 - L * .6 + warm * .6) : 1 - L, r = Math.sqrt(Math.max(0, v)) * size * .62;
      if (r > .3) { c.beginPath(); c.arc(x + ox + Math.cos(ang) * .5, y + oy, r, 0, Math.PI * 2); c.fill(); }
    }
  });
  c.globalCompositeOperation = 'source-over';
  if (strength < 1) { const m = make(w, h), mc = m.getContext('2d'); mc.drawImage(src, 0, 0); mc.globalAlpha = strength; mc.drawImage(out, 0, 0); return m; }
  return out;
}

/** Reading words for scenery. */
const has = (t, re) => re.test(t);
const MOON = /^\s*(?:the\s+)?moon\b|\b(?:on|to|from) the moon\b|\bthe moon['’]s surface|\blunar\b|\bmoon ?(?:base|walk|landing|surface|rock|dust|scape)|\bcraters?\b|\bapollo\b|\bmoonwalk/;
const CLOUDS = /^\s*(?:the\s+)?(?:clouds|sky|heavens?)\b|\babove the clouds|\bin the clouds|\bon (?:a )?cloud|\bcloud ?nine\b|\bsea of clouds|\bin the sky\b|\bup in the sky|\bheaven(?:s|ly)?\b|\bsky ?high\b/;
const CITY = /city|street|tokyo|paris|lisbon|\btown\b|skyline|rooftop|alley|neon|new york|london|seoul|hong kong|shibuya|downtown|cyberpunk|vienna|prague|venice|rome|berlin|madrid|barcelona|amsterdam|copenhagen|stockholm|istanbul|cairo|mumbai|shanghai|kyoto|osaka|bangkok|havana|new orleans|san francisco|los angeles|chicago|buenos aires|edinburgh|dublin/;
const FRUIT = { lemon: '#f3d23a', orange: '#f08a2a', cherr: '#c8243a', apple: '#d23a2a', olive: '#6b7a2a', peach: '#f6a07a', plum: '#6b2a5a', fig: '#5a2a4a' };
export function sceneFrom(text, ramp = null, seed = 1) {
  const t = (text || '').toLowerCase(), vibe = vibeOf(text || ''), place = placeIn(t);
  // the light: said outright, or the time of day the words carry, or after dark when the words are
  let light = has(t, /night|midnight|moon|star|neon|dark/) ? 'night' : has(t, /sunset|dusk|evening|twilight|golden hour/) ? 'dusk' : has(t, /dawn|sunrise|morning/) ? 'dawn' : 'day';
  if (place?.id !== 'mars' && has(t, /\bmars\b|martian|\bspace\b|planet|lunar|moon ?base|alien|galaxy|nebula|cosmos|cosmic|asteroid|starship|spaceship|rocket|\borbit|northern lights|aurora/)) light = 'night';
  else if (light === 'day' && vibe) light = vibe.light === 'golden' || vibe.light === 'dusk' ? 'dusk' : vibe.light === 'dawn' ? 'dawn' : vibe.light === 'night' || (vibe.dark && vibe.light !== 'day') ? 'night' : 'day';
  // on the moon or above the clouds the hour is whatever the words say: the moon itself is no reason for night
  const moon = has(t, MOON), clouds = !moon && has(t, CLOUDS);
  if (moon || clouds || place?.id === 'mars') light = has(t, /\bnight|midnight|\bdark\b|starry/) ? 'night' : has(t, /sunset|dusk|evening|twilight|golden hour/) ? 'dusk' : has(t, /dawn|sunrise|morning/) ? 'dawn' : 'day';
  const land = moon ? 'moon' : clouds ? 'clouds' : has(t, /underwater|under the sea|beneath the (?:waves|sea)|deep sea|ocean floor|seabed|aquarium|coral reef|submarine|abyss/) ? 'under'
    : place ? place.land
    : has(t, /\bmars\b|martian|\bspace\b|planet|lunar|moon ?base|alien|galaxy|nebula|cosmos|cosmic|asteroid|starship|spaceship|rocket|\borbit/) ? 'space'
    : has(t, /\bseas?\b|seaside|ocean|beach|\bwaves?\b|\blake\b|\bpond\b|harbou?r|\bbay\b|coast|river|lighthouse|\bboat|\bsail|lagoon|\breef|mermaid|island|shore|\bsurf|\bpier\b|marina|riviera|amalfi|\bcove\b|fjord/) ? 'sea'
    : has(t, /desert|\bdunes?\b|sahara|\bmesa\b|canyon|arizona|nevada|route 66|motel|mojave|cact(?:us|i)|oasis|badlands/) ? 'desert'
    : has(t, /mountain|\balps\b|alpine|\bpeaks?\b|summit|volcano/) ? 'mountains'
    : has(t, CITY) ? 'city'
    : has(t, /forest|\bwoods?\b|woodland|jungle|\bpines?\b/) ? 'forest'
    : has(t, /lavender|\bfields?\b|meadow|vineyard|tulip|wheat|\brows\b|\bfarm|prairie|orchard|\bgrove\b/) ? 'fields' : 'hills';
  const inside = land !== 'under' && has(t, /(?<!mush)room\b|interior|caf[eé]|library|kitchen|studio|parlou?r|window seat|\bbar\b|jazz|club|bakery|bookshop|bookstore|apothecar|attic|cabin|diner|theat|cinema|museum|gallery|laundr|hotel|lobby|\bpub\b|tavern|lounge|speakeasy|\bshop\b|greenhouse|glasshouse|conservatory|orangery|sauna|boudoir|nursery|night train|carriage|disco|roller|\brink\b|skating|bowling|arcade|casino|karaoke|opera|ballet|concert hall|station/);
  // what the words furnish: a tiled wall, wood, neon (spelling the place, if it has a name for it), a low lamp
  const props = [];
  if (has(t, /\btiles?\b|tiled|azulejo|lisbon|porto\b|portug|mosaic|majolica|kitchen|bathroom|istanbul|morocc|marrakech|hammam/)) props.push('tiles');
  if (has(t, /neon|cyber|tokyo|arcade|synth|\b80s\b|eighties|vegas|diner|motel|\bbar\b|club|jazz|hong kong|seoul|shibuya|casino|night market|disco|karaoke|drive-in/)) props.push('neon');
  if (has(t, /\bbar\b|jazz|caf[eé]|coffee|library|lamp|candle|study|speakeasy|kitchen|\bpub\b|tavern|lounge|bookshop|bookstore|cabin|cos[yz]|hearth|fireplace|lodge|chalet|attic|bakery|apothecar|diner/)) props.push('lamp');
  if (has(t, /cabin|lodge|chalet|\bbarn\b|treehouse|\blog\b|sauna|galleon|\bship\b|tavern|attic|farmhouse/)) props.push('wood');
  // shelves, and what is on them
  const shelf = has(t, /library|book ?shop|bookstore|\bbooks\b|\bstudy\b|reading room|archive/) ? 'books' : has(t, /apothecar|potion|witch|alchemist|pharmacy|herbal|spice|pantry|perfum|wine cellar/) ? 'jars' : has(t, /candy|sweet ?shop|confection|bonbon|chocolat|patisserie|ice cream/) ? 'sweets' : has(t, /bakery|boulangerie|\bbread\b|\bbaker\b|loaves|croissant/) ? 'bread' : '';
  if (inside && has(t, /haunted|spooky|gothic|abandoned|crypt|cobweb|ghost/)) props.push('webs');
  if (inside && has(t, /\btrain\b|carriage|railway|compartment|sleeper car|orient express/)) props.push('train');
  if (inside && has(t, /art deco|\bdeco\b|gatsby|1920s|twenties|jazz age/)) props.push('deco');
  if (inside && shelf) props.push('shelves');
  if (inside && has(t, /ballroom|theat|opera|ballet|cinema|boudoir|parlou?r|hotel|haunted|velvet|manor|mansion|palace|victorian|princess|castle/)) props.push('curtains');
  if (inside && has(t, /ballroom|opera|palace|mansion|manor|haunted|castle|grand hotel|lobby|candlelit|banquet/)) props.push('chandelier');
  if (inside && has(t, /disco|roller|\brink\b|dance|mirror ?ball|glitter ball|\b70s\b|seventies|197\d|studio 54|\bparty\b/)) props.push('mirrorball');
  if (inside && has(t, /greenhouse|glasshouse|conservatory|orangery|botanic|\bplants?\b|\bferns?\b|jungle|garden room|terrarium/)) props.push('plants');
  const sign = props.includes('neon') ? (t.match(/\b(motel|diner|jazz|bar|club|arcade|casino|cinema|hotel|karaoke|disco|ramen|noodles|sushi|pizza|cocktails|records|bowling|drive-in)\b/) || [])[1] || '' : '';
  const said = has(t, /rain|storm|drizzle|monsoon/) ? 'rain' : has(t, /snow|winter|blizzard/) ? 'snow' : has(t, /petal|sakura|cherry blossom|blossom/) ? 'petals' : '';
  const weather = said || (vibe && ['rain', 'snow', 'petals'].includes(vibe.sky || '') ? vibe.sky : vibe?.sky === 'drizzle' ? 'rain' : '');
  const things = ['lighthouse', 'boat', 'tree', 'house', 'teacup', 'flowers', 'heart', 'castle', 'balloon'].filter(k => new RegExp('\\b' + (k === 'flowers' ? 'flower' : k)).test(t) || (k === 'flowers' && /garden|rose|tulip|meadow|bloom/.test(t)) || (k === 'castle' && /palace|tower/.test(t)));
  if (inside && has(t, /\bbar\b|jazz|cocktail|martini|wine|whisk|speakeasy|club|\bpub\b|lounge|champagne/)) things.push('glass');
  // who sits for it: a few simple silhouettes, and what they wear
  const who = has(t, /\bcats?\b|kitten|kitty/) ? 'cat' : has(t, /\bdogs?\b|pupp(?:y|ies)|\bpup\b|corgi|terrier|labrador|poodle/) ? 'dog' : has(t, /\bbirds?\b|robin|sparrow|parrot|\bowl\b|\bcrow\b|raven|finch/) ? 'bird' : has(t, /rabbit|bunny|bunnies|\bhare\b/) ? 'rabbit'
    : has(t, /portrait|\bwom[ae]n\b|\bm[ae]n\b|\bgirl\b|\bboy\b|\bperson\b|\blady\b|gentleman|princess|prince\b|\bking\b|\bqueen\b|knight|wizard|\bwitch\b(?!['’]s)|myself/) ? 'person' : '';
  const wears = !who ? '' : has(t, /\bhat\b|top hat|bowler/) ? 'hat' : has(t, /crown|tiara|princess|prince\b|\bking\b|\bqueen\b/) ? 'crown' : has(t, /\bbow\b|ribbon/) ? 'bow' : '';
  const hair = who === 'person' && has(t, /wom[ae]n|girl|lady|princess|queen|witch|\bher\b/);
  if (!inside && land === 'sea' && has(t, /\bkoi\b|goldfish|\bfish\b|carp/)) things.push('koi');
  if (!inside && has(t, /\bgrove\b|orchard|(?:lemon|orange|olive|apple|cherry|peach|fig) trees?|citrus/)) things.push('grove');
  if (!inside && has(t, /tree ?house/)) things.push('treehouse');
  if (!inside && (land === 'sea' || land === 'desert') && has(t, /\bpalms?\b|tropic|island|lagoon|hawaii|caribbean|maldives|tiki|bali|oasis/)) things.push('palm');
  const colour = Object.entries(COLOUR_WORDS).find(([w]) => new RegExp('\\b' + w + '\\b').test(t))?.[1];
  // colour words alone make a ramp; words the room maker knows bring a whole palette instead (pal)
  return { words: text || '', light, land, inside, weather, things, ramp: ramp || (!vibe && colour ? rampAround(colour) : null), arch: has(t, /arch|castle|palace|chapel/), seed, pal: vibe?.colors || null, marks: vibe?.marks || [], props, shelf, sign: sign.toUpperCase(), who, wears, hair, aurora: has(t, /northern lights|aurora/), mars: has(t, /\bmars\b|martian|red planet/),
    fruit: Object.entries(FRUIT).find(([k]) => t.includes(k))?.[1] || null, frozen: has(t, /frozen|\bicy\b|\bice\b|glacier|arctic|polar/), skyline: land === 'sea' && !place && (props.includes('neon') || has(t, CITY)), place: place?.id || '' };
}
export const COLOUR_WORDS = { red: '#c8322d', crimson: '#a5122a', scarlet: '#e0301e', pink: '#ec7fa0', rose: '#d9667f', blush: '#f2b8c6', orange: '#ec7a2c', peach: '#f6b08a', coral: '#f07560', gold: '#d6a540', golden: '#d6a540', yellow: '#f0c93a', lemon: '#f3e05a', green: '#3f8f4f', emerald: '#1f8a5c', mint: '#93d8b8', sage: '#8fa883', olive: '#7d7a32', teal: '#1f8a8a', turquoise: '#33c3c0', cyan: '#35d2e8', blue: '#2f6fdc', navy: '#1a2e6b', cobalt: '#2148b8', sky: '#7dbbf0', lavender: '#b39ddb', lilac: '#c8a2d8', purple: '#7a3ea8', violet: '#6a3fd0', plum: '#6b2a5a', magenta: '#d5248f', brown: '#7a4a2a', chocolate: '#5a3218', silver: '#b8c0cc', white: '#f4f2ee', black: '#141414', grey: '#8a8a8a', gray: '#8a8a8a', cream: '#f4ead2', ivory: '#f6f0dc', burgundy: '#6e1a2c', amber: '#e09a2a', copper: '#b8673a' };

const MANY = { leaf: 'leaves', notes: 'notes', note: 'notes', confetti: 'confetti', ink: 'ink', sparkle: 'sparkles', asterisk: 'asterisks' };
const THING = { teacup: 'a teacup', glass: 'a cocktail', lighthouse: 'a lighthouse', boat: 'a boat', tree: 'a tree', house: 'a house', flowers: 'flowers', heart: 'a heart', castle: 'a castle', balloon: 'balloons', palm: 'a palm', koi: 'koi', grove: 'trees, and their fruit', treehouse: 'a treehouse' };
const cap = (/** @type {string} */ s) => s ? s[0].toUpperCase() + s.slice(1) : s;
/** What the painter says as it lays each layer down: the reading, in plain words. */
function notesFor(d) {
  const p = d.props || [], night = d.light === 'night' || d.light === 'dusk';
  const land = d.place ? placeSays(d.place, d.light) : ({ sea: d.frozen ? 'ice, where the water was' : 'the sea', city: night ? 'the town, lit' : 'the town', hills: 'hills', fields: 'rows running to the horizon', forest: 'the woods', mountains: 'mountains', desert: 'mesas, sand, a saguaro', under: 'under the surface, light coming down', space: 'space: a ringed planet, and the ground of somewhere else', moon: 'the moon: grey dust and craters, and the Earth up in the black', clouds: 'a sea of clouds, all the way to the horizon' })[d.land] + (d.skyline ? ', a town across the water' : '');
  const outside = cap(land) + (p.includes('neon') && d.land === 'city' ? '. Neon up the buildings' : '') + (p.includes('neon') && d.sign && d.land !== 'city' ? '. The sign: ' + d.sign : '');
  const mark = d.marks?.[0];
  return {
    sky: d.land === 'moon' ? 'The sky: black at every hour, with the Earth in it' : d.land === 'mars' ? 'The sky: ' + (({ day: 'butterscotch, the dust lit through', night: 'night, and two small moons' })[d.light] || 'brown, and blue around the sun') : 'The sky: ' + (d.weather === 'rain' && !night ? 'grey, rain coming' : ({ day: 'a clear day', dawn: 'first light', dusk: 'the sun going down', night: 'night' })[d.light]),
    land: outside,
    walls: p.includes('wood') ? 'Wood on the walls' : p.includes('deco') ? 'Gold fans along the walls' : p.includes('tiles') ? 'Tiles on the wall, a pattern in each' : mark && d.pal ? 'Wallpaper: ' + (MANY[mark] || mark + 's') : 'The walls',
    furnish: p.includes('shelves') ? ({ books: 'Shelves of books', jars: 'Shelves of jars and bottles', sweets: 'Jars of sweets', bread: 'Loaves on the shelves' })[d.shelf] || 'Shelves' : p.includes('neon') ? (d.sign ? 'The sign: ' + d.sign : 'Neon on the walls') : '',
    view: 'Out of the window: ' + land + (p.includes('train') ? ', going by' : '') + (p.includes('curtains') ? '. Curtains' : '') + (p.includes('webs') ? '. Cobwebs' : ''),
    light: p.includes('mirrorball') ? 'A mirror ball, and the light it throws' : p.includes('chandelier') ? 'A chandelier, five candles' : p.includes('lamp') ? 'A low lamp' + (night ? ', and its pool of light' : '') : '',
    weather: ({ rain: d.inside ? 'Rain on the glass' : 'Rain', snow: d.inside ? 'Snow, outside' : 'Snow falling', petals: 'Petals in the air' })[d.weather] || '',
  };
}

/**
 * What an edit asks of a sketch's scene, applied to it: the light, the weather, who sits for it and what they wear,
 * things added, colours named, closer or further. Returns the changes in words; none when nothing was understood.
 * @param {any} desc @param {string} text
 */
export function changeScene(desc, text, { light = true } = {}) {
  const t = String(text || '').toLowerCase(), said = /** @type {string[]} */ ([]);
  const set = (/** @type {string} */ k, /** @type {any} */ v, /** @type {string} */ words) => { if (desc[k] !== v) { desc[k] = v; said.push(words); } };
  const hour = !light ? null : /\b(night|midnight|after dark|dark(?:er)?)\b/.test(t) ? ['night', 'now at night'] : /\b(dawn|sunrise|morning|first light)\b/.test(t) ? ['dawn', 'at first light']
    : /golden|sunset|dusk|evening/.test(t) ? ['dusk', 'in the golden hour'] : /\b(day|daytime|noon|daylight|sunny|sunshine|brighter)\b/.test(t) ? ['day', 'in daylight'] : null;
  if (hour) { if (desc.sun) { delete desc.sun; desc.blend = null; desc.light = ''; } set('light', hour[0], hour[1]); }
  if (/\b(?:no|stop|without|less)\b[^.]*\b(?:rain|snow)|\bdry\b|clear (?:sky|skies|up)/.test(t)) set('weather', '', 'the weather cleared');
  else if (/rain|drizzle|storm|shower/.test(t)) set('weather', 'rain', 'rain');
  else if (/snow|blizzard|winter/.test(t)) set('weather', 'snow', 'snow falling');
  else if (/petal|blossom|sakura/.test(t)) set('weather', 'petals', 'petals in the air');
  const who = /\bcats?\b|kitten/.test(t) ? 'cat' : /\bdogs?\b|pupp/.test(t) ? 'dog' : /\bbirds?\b|\bowl\b|robin/.test(t) ? 'bird' : /rabbit|bunny/.test(t) ? 'rabbit' : /\b(?:person|someone|woman|man|girl|boy|figure)\b/.test(t) ? 'person' : '';
  const wears = /\bhat\b/.test(t) ? 'hat' : /crown|tiara/.test(t) ? 'crown' : /\bbow\b|ribbon/.test(t) ? 'bow' : '';
  if (/\b(?:no|without|remove|lose|get rid of)\b[^.]*\b(?:cat|dog|bird|rabbit|person|someone|figure|animal)/.test(t)) set('who', '', 'no one sitting');
  else if ((who && desc.who !== who) || (wears && (who || desc.who) && desc.wears !== wears)) {
    // who sits, and what they wear, said as one: "a rabbit in a crown"
    if (who) desc.who = who; if (wears) desc.wears = wears; said.push(sitter(desc));
  }
  for (const k of ['lighthouse', 'boat', 'tree', 'house', 'balloon', 'castle', 'heart', 'palm', 'flower']) {
    const thing = k === 'flower' ? 'flowers' : k;
    if (new RegExp('\\b' + k).test(t) && !desc.things.includes(thing)) { desc.things.push(thing); said.push(THING[thing] || thing); }
  }
  if (readVibe(text).some(x => x.cue.kind === 'colour')) { const v = vibeOf(text + ', ' + (desc.words || '')); if (v) { desc.pal = v.colors; desc.ramp = null; said.push('new colours'); } }
  if (/closer|zoom(?:ed)? in|tighter|crop/.test(t)) { desc.zoom = Math.min(2.4, (desc.zoom || 1) * 1.35); said.push('closer in'); }
  else if (/further|farther|zoom(?:ed)? out|wider/.test(t) && (desc.zoom || 1) > 1) { desc.zoom = Math.max(1, desc.zoom / 1.35); said.push('further back'); }
  return said;
}
/**
 * A device sketch's scene, read again: its words, painted from its seed (or another, for a new take), with every
 * change asked of it since, in order.
 * @param {{ words: string, seed: number, edits?: (string | { sun: number[] })[] }} kept
 */
export function sceneAgain(kept, seed = kept.seed) {
  const desc = sceneFrom(kept.words, null, seed);
  for (const e of kept.edits || []) typeof e === 'string' ? changeScene(desc, e) : e?.sun ? setSun(desc, e.sun) : null;
  return desc;
}

/**
 * The hour, from where the sun is: [across, down] in the sky, down running 0 at the top to 1 at the horizon and past it
 * below. High is day; low in the east (the left) is first light, low in the west the golden hour; under the horizon it
 * is night, the moon up across the sky. Between two hours both are painted and mixed, so the light changes smoothly.
 * @param {any} desc @param {number[]} sun
 */
export function setSun(desc, sun) {
  const u = Math.min(.97, Math.max(.03, sun[0])), v = Math.min(1.9, Math.max(.04, sun[1])), e = 1 - v, side = u < .5 ? 'dawn' : 'dusk';
  const ease = (/** @type {number} */ t) => t * t * (3 - 2 * t);
  desc.sun = [u, v];
  if (e >= .6) { desc.light = 'day'; desc.blend = null; }
  else if (e >= .32) { desc.light = 'day'; desc.blend = { light: side, t: ease((.6 - e) / .28) }; }
  else if (e >= 0) { desc.light = side; desc.blend = null; }
  else if (e >= -.22) { desc.light = side; desc.blend = { light: 'night', t: ease(-e / .22) }; }
  else { desc.light = 'night'; desc.blend = null; }
  return desc;
}
/** The hour a sun's place makes, in words: "at golden hour", "just before dawn". @param {number[]} sun */
export function hourWords(sun) {
  const e = 1 - sun[1], east = sun[0] < .5;
  return e >= .6 ? 'in full daylight' : e >= .32 ? (east ? 'on a bright morning' : 'in the afternoon') : e >= .1 ? (east ? 'in the early morning' : 'at golden hour')
    : e >= 0 ? (east ? 'at sunrise' : 'at sunset') : e >= -.22 ? (east ? 'just before dawn' : 'at dusk') : 'at night';
}

/** The sitter, in words: "a cat in a hat", "someone in a crown". */
const sitter = (/** @type {any} */ d) => ({ cat: 'a cat', dog: 'a dog', bird: 'a bird', rabbit: 'a rabbit', person: 'someone' })[d.who] + ({ hat: ' in a hat', crown: ' in a crown', bow: ' with a bow' })[d.wears || ''] || '';

/**
 * What a sketch shows, as a few short phrases for the reply, most telling first:
 * "the JAZZ sign", "the town lit up outside", "rain on the glass".
 */
export function describeScene(d) {
  const p = d.props || [], night = d.light === 'night' || d.light === 'dusk', out = [];
  if (d.who) out.push(sitter(d));
  if (d.sign) out.push('the ' + d.sign + ' sign');
  if (p.includes('shelves')) out.push(({ books: 'shelves of books', jars: 'jars and bottles on every shelf', sweets: 'jars of sweets', bread: 'loaves on the shelves' })[d.shelf] || 'full shelves');
  if (p.includes('mirrorball')) out.push('a mirror ball'); else if (p.includes('chandelier')) out.push('a chandelier');
  if (p.includes('tiles')) out.push('tiles on the wall');
  if (p.includes('webs')) out.push('cobwebs');
  if (p.includes('train')) out.push('the country going by');
  if (p.includes('plants')) out.push('plants and ivy');
  const land = d.place ? placeSays(d.place, d.light) : ({ sea: d.frozen ? 'the ice' : d.skyline ? 'a town across the water' : 'the sea', city: night ? 'the town lit up' : 'the town', fields: 'rows to the horizon', forest: 'the woods', mountains: 'the mountains', desert: 'mesas and a saguaro', under: 'light coming down through the water', space: 'a ringed planet', hills: 'hills' })[d.land];
  if (d.inside) { if (d.place || d.land !== 'hills') out.push(land + ' outside'); } else if (d.place || d.land !== 'hills') out.push(land);
  if (d.things?.includes('glass')) out.push('a cocktail on the bar');
  const things = (d.things || []).filter((/** @type {string} */ k) => !['teacup', 'glass'].includes(k)).map((/** @type {string} */ k) => THING[k]).filter(Boolean);
  if (things.length) out.push(things.join(' and '));
  if (d.weather) out.push(({ rain: d.inside ? 'rain on the glass' : 'rain', snow: d.inside ? 'snow outside' : 'snow falling', petals: 'petals in the air' })[d.weather]);
  return out.filter(Boolean);
}

/** A flat, poster-like scene from words. Not a render: a sketch for the idea's shape and colour. Pass desc.layers (an array) to keep each layer as it is laid down, with its note. */
export function scene(desc, w = 768, h = 1024) {
  if (desc.blend?.light && desc.blend.t > .01) {
    // between two hours (the sun part way down the sky): both painted from the same seed, the second laid over the first
    const { blend, ...one } = desc, two = { ...one, light: blend.light, layers: null }, a = scene(one, w, h), b = scene(two, w, h), ax = a.getContext('2d');
    ax.globalAlpha = Math.min(1, blend.t); ax.drawImage(b, 0, 0); ax.globalAlpha = 1;
    desc.sunAt = one.sunAt; desc.life = blend.t > .5 ? two.life : one.life;
    return a;
  }
  const c = make(w, h), x = c.getContext('2d'), rnd = rng(desc.seed || 7), L = desc.light, horizon = h * (desc.inside ? .62 : .6);
  // lit windows, glints on water and a field's ridge are counted by the pixel: they draw from their own stream, so the
  // composition (which takes from rnd) comes out the same at any size, and a small proof agrees with the full sketch
  const spark = rng((desc.seed || 7) + 104729), twinkle = rng((desc.seed || 7) + 7919);
  const notes = notesFor(desc), mark = (/** @type {string} */ label) => { if (desc.layers && label) desc.layers.push({ label, canvas: copy(c, Math.round(w / 2), Math.round(h / 2)) }); };
  // what in it can move, for a picture that lives a little while it is looked at: hints in fractions of the picture,
  // sampled from a stream of their own, so the painting comes out the same with them or without
  const life = desc.life = /** @type {any[]} */ ([]), lr = rng((desc.seed || 7) + 31337), lights = /** @type {any[]} */ ([]);
  let inWin = false;
  const live = (/** @type {any} */ o) => { if (inWin) o.win = true; life.push(o); };
  const fr = (/** @type {number} */ px, /** @type {number} */ py, /** @type {number} */ pw, /** @type {number} */ ph) => [px / w, py / h, pw / w, ph / h];
  const skies = { day: ['#9ccaf0', '#d8ecf7', '#fff4e2'], dawn: ['#7e9ed8', '#f2b8b0', '#ffe2bd'], dusk: ['#2a1d52', '#a8467a', '#f39a5a'], night: ['#04061a', '#15204a', '#2b3a72'] };
  let sky = skies[L];
  if (desc.ramp) sky = L === 'night' ? [desc.ramp[0], desc.ramp[1], desc.ramp[2]] : [desc.ramp[2], desc.ramp[3], desc.ramp[4]];
  else if (desc.pal) {
    // the words' own colours wash the sky: neon over a night city, azulejo blue over a Lisbon morning
    const p = desc.pal, tint = L === 'night' ? [mix(p.ground, '#000000', .2), p.ground2, mix(p.ground2, p.accent, .4)].map(c => luminance(c) > .25 ? mix(c, '#0a0c24', .72) : c)
      : L === 'dusk' ? [mix(p.ground2, p.accent2, .35), mix(p.accent, '#ffffff', .35), mix(p.accent2, '#ffffff', .4)]
      : L === 'dawn' ? [mix(p.accent2, '#ffffff', .5), mix(p.accent, '#ffffff', .7), mix(p.ground, '#ffffff', .3)]
      : [mix(p.accent, '#ffffff', .55), mix(p.accent, '#ffffff', .8), mix(p.ground, '#ffffff', .4)];
    sky = sky.map((s, i) => mix(s, tint[i], .55));
  }
  if (desc.weather === 'rain' && L !== 'night') sky = sky.map(s => mix(s, '#7d8796', .42));
  const props = desc.props || [], pal = desc.pal;
  // a famous place: its landmark to one side (away from whoever stands in it), painted from a stream of its own
  const placeRnd = rng((desc.seed || 7) + 4241), sided = rng((desc.seed || 7) + 77)(), own = !!desc.place && ownLand(desc.place);
  const side = desc.clear?.side || (sided < .5 ? -1 : 1), at = desc.clear?.at ?? (side < 0 ? (desc.who ? .2 : .3) : (desc.who ? .8 : .7));
  /** @param {number} ox @param {number} oy @param {number} ow @param {number} oh @param {number} hz @param {string[]} sk @param {number} sunX @returns {import('./atlas.js').Brush} */
  const brush = (ox, oy, ow, oh, hz, sk, sunX) => ({ x, ox, oy, ow, oh, hz, w, h, L, sky: sk, far: mix(sk[1], sk[2], .3), near: mix(sk[0], '#101820', L === 'night' ? .55 : .7), pal, q: placeRnd, spark, lr, live, fr,
    at, side, bare: !!desc.bare, holes: [], lights: [], sunX, skyOnly: !!desc.skyOnly, mark: () => { if (!desc.inside) mark(notes.sky); } });
  /** Neon: drawn once in its colour with a glow, then again paler, for the hot core. */
  const neon = (/** @type {string} */ col, /** @type {() => void} */ draw, blur = w * .035) => {
    x.save(); x.shadowColor = col; x.shadowBlur = blur; x.fillStyle = x.strokeStyle = col; draw();
    x.shadowBlur = 0; x.globalAlpha = .55; x.fillStyle = x.strokeStyle = mix(col, '#ffffff', .7); draw(); x.restore();
  };
  const drawOutdoor = (ox, oy, ow, oh) => {
    if (desc.land === 'under') {
      // seen from under the surface: light falling in shafts, weed swaying up from the sand, bubbles rising
      const deep = pal ? mix(pal.ground, '#021018', L === 'night' ? .75 : .5) : '#03243a', top = pal ? mix(pal.accent, '#c8f6ff', L === 'night' ? .15 : .5) : '#4fc3d9';
      const g = x.createLinearGradient(0, oy, 0, oy + oh); g.addColorStop(0, top); g.addColorStop(.55, mix(top, deep, .6)); g.addColorStop(1, deep); x.fillStyle = g; x.fillRect(ox, oy, ow, oh);
      x.fillStyle = 'rgb(255 255 255 / .22)'; for (let i = 0; i < 30; i++) { x.beginPath(); x.ellipse(ox + rnd() * ow, oy + rnd() * oh * .06, ow * (.03 + rnd() * .06), oh * .004, 0, 0, Math.PI * 2); x.fill(); }
      x.save(); x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) { const s0 = ox + ow * (rnd() * 1.1 - .05), sp = ow * (.04 + rnd() * .06), lean = ow * (.1 + rnd() * .15), sg = x.createLinearGradient(0, oy, 0, oy + oh * .85); sg.addColorStop(0, 'rgb(230 251 255 / .2)'); sg.addColorStop(1, 'rgb(230 251 255 / 0)'); x.fillStyle = sg; x.beginPath(); x.moveTo(s0, oy); x.lineTo(s0 + sp, oy); x.lineTo(s0 + sp * 3 + lean, oy + oh * .85); x.lineTo(s0 + lean, oy + oh * .85); x.fill(); }
      x.restore();
      const floorY = oy + oh * .86; x.fillStyle = mix(pal ? mix(pal.ground, '#e8d6a8', .5) : '#c9b48a', deep, .45); x.beginPath(); x.moveTo(ox, oy + oh); for (let px = 0; px <= ow; px += 8) x.lineTo(ox + px, floorY + Math.sin(px / ow * 9) * oh * .012); x.lineTo(ox + ow, oy + oh); x.fill();
      x.lineCap = 'round';
      for (let i = 0; i < 11; i++) { const bx = ox + rnd() * ow, ht = oh * (.1 + rnd() * .24), sw = (rnd() - .5) * ow * .09; x.strokeStyle = i % 3 === 0 && pal ? mix(pal.accent2, deep, .2) : mix(pal ? pal.accent : '#2f8f6a', deep, .3 + rnd() * .25); x.lineWidth = ow * (.008 + rnd() * .01); x.beginPath(); x.moveTo(bx, floorY + oh * .03); x.bezierCurveTo(bx + sw, floorY - ht * .33, bx - sw, floorY - ht * .66, bx + sw * .5, floorY - ht); x.stroke(); }
      x.lineCap = 'butt'; x.strokeStyle = 'rgb(255 255 255 / .55)'; x.lineWidth = 1.2;
      for (let i = 0; i < 40; i++) { x.beginPath(); x.arc(ox + rnd() * ow, oy + rnd() * oh * .85, 1 + Math.pow(rnd(), 2) * ow * .012, 0, Math.PI * 2); x.stroke(); }
      live({ k: 'under', box: fr(ox, oy, ow, floorY - oy) });
      return floorY;
    }
    if (desc.land === 'space') {
      // a black sky thick with stars, a ringed planet hanging low, the ground of somewhere else
      x.fillStyle = mix(pal && !desc.mars ? pal.ground : '#05060f', '#000000', .65); x.fillRect(ox, oy, ow, oh);
      const haze = desc.mars ? '#b8562e' : pal ? pal.accent2 : '#7a3ea8', nb = x.createRadialGradient(ox + ow * .3, oy + oh * .25, 0, ox + ow * .3, oy + oh * .25, ow * .7); nb.addColorStop(0, alpha(haze, .3)); nb.addColorStop(1, alpha(haze, 0)); x.fillStyle = nb; x.fillRect(ox, oy, ow, oh);
      for (let i = 0; i < 260 * ow / w; i++) { x.globalAlpha = .3 + rnd() * .7; x.fillStyle = '#ffffff'; const s = rnd() < .08 ? 2 : 1; x.fillRect(ox + rnd() * ow, oy + rnd() * oh * .8, s, s); }
      x.globalAlpha = 1;
      const pr = ow * .15, pcx = ox + ow * .68, pcy = oy + oh * .3, pc = pal ? pal.accent : '#d9824a', pg = x.createLinearGradient(pcx - pr, pcy - pr, pcx + pr, pcy + pr);
      pg.addColorStop(0, mix(pc, '#ffffff', .35)); pg.addColorStop(1, mix(pc, '#000000', .6)); x.fillStyle = pg; x.beginPath(); x.arc(pcx, pcy, pr, 0, Math.PI * 2); x.fill();
      x.strokeStyle = alpha(mix(pc, '#ffffff', .55), .75); x.lineWidth = Math.max(2, ow * .01); x.beginPath(); x.ellipse(pcx, pcy, pr * 1.75, pr * .32, -.35, 0, Math.PI * 2); x.stroke();
      const gy = oy + oh * .76, gc = desc.mars ? '#a9482a' : pal ? mix(pal.accent2, '#3a1a10', .5) : '#7a3a22';
      x.fillStyle = gc; x.beginPath(); x.moveTo(ox, oy + oh); for (let q = 0; q <= ow; q += 8) x.lineTo(ox + q, gy - Math.sin(q / ow * 5 + 1) * oh * .025); x.lineTo(ox + ow, oy + oh); x.fill();
      for (let i = 0; i < 7; i++) { const cx = ox + rnd() * ow, cy = gy + oh * (.05 + rnd() * .15), cr = ow * (.02 + rnd() * .05); x.fillStyle = mix(gc, '#000000', .3); x.beginPath(); x.ellipse(cx, cy, cr, cr * .3, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = mix(gc, '#ffffff', .12); x.beginPath(); x.ellipse(cx, cy + cr * .06, cr * .8, cr * .2, 0, 0, Math.PI); x.fill(); }
      live({ k: 'glide', box: fr(ox, oy, ow, (gy - oy) * .75) });
      return gy;
    }
    if (desc.land === 'moon') {
      // no air, so the sky is black at every hour: the sun a white disc in it, the Earth hanging there, the dust lit or not
      const hz = oy + oh * .58;
      x.fillStyle = '#030408'; x.fillRect(ox, oy, ow, oh);
      for (let i = 0; i < 300 * ow / w; i++) { x.globalAlpha = .2 + twinkle() * .8; x.fillStyle = '#ffffff'; const s = twinkle() < .06 ? 2 : 1; x.fillRect(ox + twinkle() * ow, oy + twinkle() * (hz - oy), s, s); }
      x.globalAlpha = 1;
      const su = rnd(), along = L === 'dawn' ? .32 - su * .16 : .66 + su * .18;
      const sun = desc.sun || (L === 'night' ? [1 - along, 1.28] : [along, L === 'day' ? .28 : .74]);
      const sx = ox + ow * sun[0], sy = oy + (hz - oy) * sun[1], sr = ow * .045, up = sun[1] < 1.02;
      desc.sunAt = { x: sx / w, y: sy / h, r: ow * .1 / w, box: [ox / w, oy / h, ow / w, (hz - oy) / h], sun };
      if (up) { const g = x.createRadialGradient(sx, sy, sr * .6, sx, sy, sr * 6); g.addColorStop(0, 'rgb(255 255 255 / .5)'); g.addColorStop(1, 'rgb(255 255 255 / 0)'); x.fillStyle = g; x.fillRect(ox, oy, ow, hz - oy); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(sx, sy, sr, 0, Math.PI * 2); x.fill(); }
      // the Earth: blue, clouded, lit on the side the sun is on
      const er = ow * .085, ex = ox + ow * (.18 + rnd() * .14), ey = oy + (hz - oy) * (.22 + rnd() * .12);
      const atm = x.createRadialGradient(ex, ey, er * .9, ex, ey, er * 1.35); atm.addColorStop(0, 'rgb(120 180 255 / .5)'); atm.addColorStop(1, 'rgb(120 180 255 / 0)'); x.fillStyle = atm; x.beginPath(); x.arc(ex, ey, er * 1.35, 0, Math.PI * 2); x.fill();
      x.save(); x.beginPath(); x.arc(ex, ey, er, 0, Math.PI * 2); x.clip();
      const og = x.createRadialGradient(ex - er * .3, ey - er * .3, er * .1, ex, ey, er); og.addColorStop(0, '#3f86e0'); og.addColorStop(1, '#173f8c'); x.fillStyle = og; x.fillRect(ex - er, ey - er, er * 2, er * 2);
      for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? '#5a8f45' : '#a08a52'; x.beginPath(); x.ellipse(ex + (rnd() - .5) * er * 1.5, ey + (rnd() - .5) * er * 1.5, er * (.18 + rnd() * .3), er * (.1 + rnd() * .2), rnd() * 3, 0, Math.PI * 2); x.fill(); }
      // weather in bands, then night on the side away from the sun, with a soft edge between
      x.fillStyle = 'rgb(255 255 255 / .6)'; for (let i = 0; i < 9; i++) { x.beginPath(); x.ellipse(ex + (rnd() - .5) * er * 1.6, ey + (rnd() - .5) * er * 1.6, er * (.22 + rnd() * .3), er * (.035 + rnd() * .05), (rnd() - .5) * .6, 0, Math.PI * 2); x.fill(); }
      const dx = sx - ex, dy = sy - ey, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl, night = x.createLinearGradient(ex + ux * er, ey + uy * er, ex - ux * er, ey - uy * er);
      night.addColorStop(0, 'rgb(2 4 12 / 0)'); night.addColorStop(.42, 'rgb(2 4 12 / 0)'); night.addColorStop(.6, 'rgb(2 4 12 / .82)'); night.addColorStop(1, 'rgb(2 4 12 / .92)'); x.fillStyle = night; x.fillRect(ex - er, ey - er, er * 2, er * 2);
      x.restore();
      // no air: the stars hold still, but the Earth turns, and now and then something in orbit goes over
      live({ k: 'earth', at: [ex / w, ey / h], r: er / w, sun: [sx / w, sy / h] }); live({ k: 'glide', box: fr(ox, oy, ow, (hz - oy) * .8) });
      if (!desc.inside) mark(notes.sky);
      if (desc.skyOnly) return oy + oh;
      // the ground: bright grey under a high sun, long-shadowed under a low one, blue with earthlight after dark
      const lit = !up ? .12 : sun[1] < .5 ? 1 : sun[1] < .9 ? .75 : .45;
      const far = mix('#262b38', '#c4c2bd', lit), near = mix('#11141c', '#7b7976', lit), toSun = sun[0] < .5 ? -1 : 1;
      x.fillStyle = mix(far, '#ffffff', .05); x.beginPath(); x.moveTo(ox, hz + oh * .02); let px = ox;
      while (px < ox + ow) { px += ow * (.06 + rnd() * .12); x.lineTo(px, hz - oh * (.005 + rnd() * .035)); }
      x.lineTo(ox + ow, hz + oh * .02); x.lineTo(ox + ow, oy + oh); x.lineTo(ox, oy + oh); x.fill();
      const gg = x.createLinearGradient(0, hz, 0, oy + oh); gg.addColorStop(0, far); gg.addColorStop(1, near); x.fillStyle = gg;
      x.beginPath(); x.moveTo(ox, hz + oh * .035); x.quadraticCurveTo(ox + ow / 2, hz - oh * .005, ox + ow, hz + oh * .035); x.lineTo(ox + ow, oy + oh); x.lineTo(ox, oy + oh); x.fill();
      // craters, smaller toward the horizon: the wall nearer the sun in shadow, the far one lit
      for (let i = 0; i < 16; i++) {
        const t = Math.pow(rnd(), .85), cy = hz + oh * .04 + (oy + oh - hz - oh * .04) * t, cr = ow * (.018 + t * .09) * (.6 + rnd() * .6), cx = ox + rnd() * ow, ry = cr * (.2 + t * .16);
        x.fillStyle = mix(far, '#ffffff', .12 * lit); x.beginPath(); x.ellipse(cx, cy, cr * 1.1, ry * 1.25, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = mix(far, near, .35); x.beginPath(); x.ellipse(cx, cy, cr, ry, 0, 0, Math.PI * 2); x.fill();
        x.save(); x.beginPath(); x.ellipse(cx, cy, cr, ry, 0, 0, Math.PI * 2); x.clip();
        x.fillStyle = mix(near, '#000000', .45); x.beginPath(); x.ellipse(cx + toSun * cr * .55, cy - ry * .2, cr * .9, ry * 1.1, 0, 0, Math.PI * 2); x.fill(); x.restore();
      }
      // a small flag, in the room's colour
      const fx = ox + ow * (.06 + rnd() * .1), fb = hz + oh * .07, fh = oh * .075, fc = pal ? pal.accent : '#e04a3a';
      x.fillStyle = mix(far, '#ffffff', .4); x.fillRect(fx, fb - fh, Math.max(1.5, ow * .004), fh);
      x.fillStyle = mix(fc, '#000000', .15 * (1 - lit)); x.fillRect(fx + Math.max(1.5, ow * .004), fb - fh, ow * .05, fh * .38);
      return hz;
    }
    if (desc.land === 'mars') {
      // its own sky, and the sun smaller in it: the place to hold it and drag it is where it would be on Earth
      const hz = oy + oh * .6, su = rnd(), along = L === 'dawn' ? .38 - su * .2 : .62 + su * .2;
      const sun = desc.sun || (L === 'night' ? [1 - along, 1.28] : [along, L === 'day' ? .32 : .72]), sx = ox + ow * sun[0], sy = oy + (hz - oy) * sun[1];
      desc.sunAt = { x: sx / w, y: sy / h, r: ow * .1 / w, box: [ox / w, oy / h, ow / w, (hz - oy) / h], sun };
      return marsLand(brush(ox, oy, ow, oh, hz, sky, sun[0]), { sx, sy, sr: ow * .07, sun });
    }
    const hz = oy + oh * .6;
    const g = x.createLinearGradient(0, oy, 0, hz); g.addColorStop(0, sky[0]); g.addColorStop(.6, sky[1]); g.addColorStop(1, sky[2]); x.fillStyle = g; x.fillRect(ox, oy, ow, oh);
    if (L === 'night') for (let i = 0; i < 160 * ow / w; i++) { x.globalAlpha = .3 + twinkle() * .7; x.fillStyle = '#fff'; x.fillRect(ox + twinkle() * ow, oy + twinkle() * (hz - oy), twinkle() < .1 ? 2 : 1, twinkle() < .1 ? 2 : 1); }
    x.globalAlpha = 1;
    if (desc.aurora) {
      // curtains of light, green rising into violet, rippling across the sky
      const c1 = pal ? pal.accent : '#3dffa8', c2 = pal ? pal.accent2 : '#b45cff', span = hz - oy;
      x.save(); x.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const base = oy + span * (.38 + k * .13), amp = span * .07, tall = span * (.22 + rnd() * .12), ph = rnd() * 6;
        for (let px = 0; px < ow; px += 3) {
          const y0 = base + Math.sin(px / ow * 5 + ph) * amp + Math.sin(px / ow * 13 + ph * 2) * amp * .3, g = x.createLinearGradient(0, y0 - tall, 0, y0);
          g.addColorStop(0, alpha(c2, 0)); g.addColorStop(.6, alpha(c2, .07)); g.addColorStop(1, alpha(c1, .26)); x.fillStyle = g; x.fillRect(ox + px, y0 - tall, 3, tall);
        }
      }
      x.restore();
      live({ k: 'aurora', box: fr(ox, oy + span * .1, ow, span * .75), c: [c1, c2] });
    }
    // the sun, where it was put or where the words leave it (east, on the left, at first light), and after dark the moon
    // across the sky from it, rising as the sun sinks. Its place always takes one draw, so the hour can change and
    // nothing else in the scene moves.
    const su = rnd(), along = L === 'dawn' ? .38 - su * .2 : .62 + su * .2;
    const sun = desc.sun || (L === 'night' ? [1 - along, 1.28] : [along, L === 'day' ? .32 : .72]);
    const body = L === 'night' ? [1 - sun[0], Math.max(.18, Math.min(.92, 2 - sun[1]))] : sun;
    const sx = ox + ow * body[0], sy = oy + (hz - oy) * body[1], sr = ow * (L === 'night' ? .07 : .1);
    desc.sunAt = { x: (ox + ow * sun[0]) / w, y: (oy + (hz - oy) * sun[1]) / h, r: ow * .1 / w, box: [ox / w, oy / h, ow / w, (hz - oy) / h], sun };
    // after dark the stars come and go, never over the moon, and now and then one falls
    if (L === 'night') { live({ k: 'stars', box: fr(ox, oy, ow, (hz - oy) * .82), n: 26, avoid: [sx / w, sy / h, sr * 1.6 / w] }); live({ k: 'meteor', box: fr(ox, oy, ow, (hz - oy) * .7) }); }
    if (desc.weather !== 'rain') {
    const glow = x.createRadialGradient(sx, sy, sr * .4, sx, sy, sr * 4); glow.addColorStop(0, L === 'night' ? 'rgb(255 250 230 / .4)' : 'rgb(255 236 190 / .7)'); glow.addColorStop(1, 'rgb(255 236 190 / 0)');
    x.fillStyle = glow; x.fillRect(ox, oy, ow, hz - oy);
    x.fillStyle = L === 'night' ? '#f4f0dc' : L === 'dusk' ? '#ffd28a' : '#fff6da'; x.beginPath(); x.arc(sx, sy, sr, 0, Math.PI * 2); x.fill();
    if (L === 'night') { x.fillStyle = sky[1]; x.beginPath(); x.arc(sx + sr * .45, sy - sr * .2, sr * .9, 0, Math.PI * 2); x.fill(); }
    }
    for (let i = 0; i < 4; i++) { const cx = ox + rnd() * ow, cy = oy + (hz - oy) * (.15 + rnd() * .45), cw = ow * (.18 + rnd() * .2); if (L === 'night') continue; x.fillStyle = desc.weather === 'rain' ? 'rgb(120 128 142 / .55)' : 'rgb(255 255 255 / .55)'; for (let k = 0; k < 5; k++) { x.beginPath(); x.ellipse(cx + (k - 2) * cw * .22, cy + Math.sin(k) * 6, cw * .22, cw * .12, 0, 0, Math.PI * 2); x.fill(); } }
    if (L !== 'night' && desc.weather !== 'rain' && desc.weather !== 'snow') live({ k: 'birds', box: fr(ox, oy + (hz - oy) * .08, ow, (hz - oy) * .5), dusk: L === 'dusk' });
    if (!desc.inside) mark(notes.sky);
    if (desc.skyOnly) return oy + oh;
    const far = mix(sky[1], sky[2], .3), mid = mix(sky[0], '#203040', L === 'night' ? .3 : .45), near = mix(sky[0], '#101820', L === 'night' ? .55 : .7);
    const B = desc.place ? brush(ox, oy, ow, oh, hz, sky, sun[0]) : null;
    if (B) paintPlace(B, desc.place, 'behind');
    if (desc.land === 'mountains') for (const [col, base, amp] of [[far, hz, .2], [mid, hz + oh * .03, .14]]) { x.fillStyle = col; x.beginPath(); x.moveTo(ox, base); let px = ox; while (px < ox + ow) { px += ow * (.06 + rnd() * .1); x.lineTo(px, base - oh * amp * (.3 + rnd() * .7)); px += ow * (.05 + rnd() * .08); x.lineTo(px, base - oh * amp * rnd() * .3); } x.lineTo(ox + ow, base); x.lineTo(ox + ow, oy + oh); x.lineTo(ox, oy + oh); x.fill(); }
    if (desc.land === 'city' && !own) {
      // a painted town by day (facades in the words' colours), lit windows after dark
      const faces = pal && L !== 'night' ? [mix(pal.ground, '#ffffff', .15), mix(pal.accent2, '#ffffff', .5), mix(pal.accent, '#ffffff', .6), mix(pal.ground2, '#ffffff', .2), mix(pal.accent2, '#ffffff', .72)] : null;
      for (const [row, col, top, lit] of /** @type {[number, string, number, number][]} */ ([[0, far, .2, .2], [1, near, .12, .5]])) {
        let px = ox;
        while (px < ox + ow) {
          const bw = ow * (.06 + rnd() * .09), bh = oh * (top * .5 + rnd() * top), face = row && faces ? faces[Math.floor(rnd() * faces.length)] : col;
          x.fillStyle = face; x.fillRect(px, hz - bh, bw, bh + oh);
          if (L === 'night' || L === 'dusk') { for (let wy = hz - bh + 8; wy < hz - 6; wy += 11) for (let wx = px + 4; wx < px + bw - 5; wx += 9) if (spark() < lit) { x.fillStyle = spark() < .5 ? '#ffd27a' : (desc.ramp ? desc.ramp[3] : pal ? pal.accent2 : '#ff7ab8'); x.fillRect(wx, wy, 4, 5); if (lr() < .06) lights.push([wx / w, wy / h, 4 / w, 5 / h, face, 0]); } else if (lr() < .05) lights.push([wx / w, wy / h, 4 / w, 5 / h, '#ffd27a', 1]); }
          else if (face !== col) {
            const cw = Math.max(4, ow * .012), ch = Math.max(6, oh * .024); x.fillStyle = mix(face, '#26323f', .5);
            for (let wy = hz - bh + ch; wy < hz + oh * .3 - ch; wy += ch * 2) for (let wx = px + cw; wx < px + bw - cw * 1.5; wx += cw * 2.2) x.fillRect(wx, wy, cw, ch);
            x.fillStyle = mix(face, '#000000', .2); x.fillRect(px, hz - bh, bw, Math.max(2, oh * .008));
          }
          px += bw + 2;
        }
      }
      if (lights.length) live({ k: 'windows', rects: lights.splice(0) });
      if (props.includes('neon')) for (let i = 0; i < 4; i++) {
        // signs stacked up the buildings, glowing in the words' own colours
        const col = i % 2 ? (pal?.accent2 || '#35e8ff') : (pal?.accent || '#ff3fa4'), sw = ow * (.03 + rnd() * .02), sh = oh * (.07 + rnd() * .07), sx2 = ox + ow * (.06 + i * .24 + rnd() * .08), sy2 = hz - oh * (.1 + rnd() * .12);
        live({ k: 'neon', box: fr(sx2, sy2, sw, sh), c: col });
        neon(col, () => { x.lineWidth = Math.max(1.5, ow * .005); x.beginPath(); x.roundRect(sx2, sy2, sw, sh, sw * .3); x.stroke(); for (let k = 0; k < 3; k++) x.fillRect(sx2 + sw * .3, sy2 + sh * (.2 + k * .25), sw * .4, Math.max(1.5, sh * .07)); }, ow * .035);
      }
    }
    if (desc.land === 'desert' && !own) {
      // mesas on the horizon, dunes in front, a saguaro or two
      const rock = mix(pal ? pal.accent2 : '#c8553d', far, L === 'night' ? .7 : .4), sand = L === 'night' ? mix('#2a2238', near, .3) : pal ? mix(pal.ground, '#e8b77a', .55) : '#e2b47c';
      x.fillStyle = rock; x.beginPath(); x.moveTo(ox, hz); let px = ox;
      while (px < ox + ow) { px += ow * (.06 + rnd() * .2); x.lineTo(px, hz); const mw = ow * (.08 + rnd() * .18), mh = oh * (.04 + rnd() * .08); x.lineTo(px + mw * .12, hz - mh); x.lineTo(px + mw * .88, hz - mh); x.lineTo(px + mw, hz); px += mw; }
      x.lineTo(ox + ow, hz); x.closePath(); x.fill();
      for (let k = 0; k < 3; k++) { x.fillStyle = mix(sand, near, L === 'night' ? .3 + k * .12 : k * .1); x.beginPath(); x.moveTo(ox, oy + oh); for (let q = 0; q <= ow; q += 8) x.lineTo(ox + q, hz + k * oh * .07 - Math.sin(q / ow * Math.PI * (1 + k * .7) + k * 1.7 + 1) * oh * .03); x.lineTo(ox + ow, oy + oh); x.fill(); }
      x.strokeStyle = mix(L === 'night' ? '#0e1a14' : '#3f6b45', near, .25); x.lineCap = 'round'; x.lineJoin = 'round';
      for (const [cx, s] of [[ox + ow * (.1 + rnd() * .12), 1], [ox + ow * (.58 + rnd() * .1), .55]]) {
        const base = hz + oh * .22 * s, ht = oh * .26 * s, tw = ow * .03 * s;
        x.lineWidth = tw; x.beginPath(); x.moveTo(cx, base); x.lineTo(cx, base - ht); x.stroke();
        x.lineWidth = tw * .72; x.beginPath(); x.moveTo(cx, base - ht * .42); x.lineTo(cx - tw * 1.5, base - ht * .42); x.lineTo(cx - tw * 1.5, base - ht * .72); x.moveTo(cx, base - ht * .56); x.lineTo(cx + tw * 1.4, base - ht * .56); x.lineTo(cx + tw * 1.4, base - ht * .86); x.stroke();
      }
      x.lineCap = 'butt'; x.lineJoin = 'miter';
    }
    if (desc.land === 'forest') for (let row = 0; row < 3; row++) { x.fillStyle = mix(far, near, row / 2); for (let i = 0; i < 18; i++) { const tx = ox + rnd() * ow, th = oh * (.08 + rnd() * .1) * (1 + row * .3), tb = hz + row * oh * .03; x.beginPath(); x.moveTo(tx, tb - th); x.lineTo(tx - th * .32, tb); x.lineTo(tx + th * .32, tb); x.fill(); } }
    if (desc.land === 'fields') {
      // rows running to the horizon, flowers on every row (lavender, tulips, vines: whatever colour leads)
      const rowA = desc.pal ? desc.pal.accent : '#8e7cc3', rowB = L === 'night' ? '#16241a' : '#6b8e5a', vx = ox + ow * (.4 + rnd() * .2), n = 16;
      x.fillStyle = mix(far, rowB, .5); x.beginPath(); x.moveTo(ox, hz); for (let px = 0; px <= ow; px += 10) x.lineTo(ox + px, hz - oh * (.02 + .015 * Math.sin(px / ow * 7 + spark()))); x.lineTo(ox + ow, hz); x.fill();
      x.fillStyle = mix(rowB, near, .35); x.fillRect(ox, hz, ow, oy + oh - hz);
      for (let i = 0; i < n; i++) {
        const a = ox - ow + (i / n) * ow * 3, b = a + ow * 3 / n * .62, top = (/** @type {number} */ v) => vx + (v - vx) * .02;
        x.fillStyle = mix(rowA, '#000000', L === 'night' ? .55 : .05 + (i % 2) * .08);
        x.beginPath(); x.moveTo(top(a), hz); x.lineTo(top(b), hz); x.lineTo(b, oy + oh); x.lineTo(a, oy + oh); x.fill();
        x.fillStyle = mix(rowA, '#ffffff', L === 'night' ? .05 : .3);
        for (let k = 0; k < 26; k++) { const f = Math.pow(rnd(), 1.7), cx = top((a + b) / 2) + ((a + b) / 2 - top((a + b) / 2)) * f + (rnd() - .5) * (b - a) * f * .7, cy = hz + (oy + oh - hz) * f; x.beginPath(); x.arc(cx, cy, .6 + f * w * .006, 0, Math.PI * 2); x.fill(); }
      }
    }
    if (desc.land === 'hills' && !own) for (let k = 0; k < 3; k++) { x.fillStyle = mix(L === 'night' ? '#1a2a3a' : desc.pal ? mix('#7fa860', desc.pal.accent2, .2) : '#7fa860', near, k * .3); x.beginPath(); x.moveTo(ox, oy + oh); for (let px = 0; px <= ow; px += 8) x.lineTo(ox + px, hz + k * oh * .05 - Math.sin(px / ow * Math.PI * (1.2 + k) + k * 2) * oh * .04 - oh * .02); x.lineTo(ox + ow, oy + oh); x.fill(); }
    if (desc.land === 'clouds') {
      // above the clouds: their tops spread to the horizon, lit by the hour, deeper in shade toward the front
      const lit = L === 'night' ? mix(sky[2], '#c8d0f0', .35) : L === 'dusk' ? mix('#fff1e0', sky[2], .45) : L === 'dawn' ? mix('#fff6f0', sky[2], .35) : '#ffffff';
      const shade = L === 'night' ? mix(sky[0], '#2a3a6a', .5) : mix(mix(sky[0], '#8a93b0', .3), lit, .4);
      for (let row = 0; row < 6; row++) {
        const t = row / 5, y = hz + (oy + oh - hz) * Math.pow(t, 1.35) * .92, r = ow * (.03 + t * .11);
        x.fillStyle = shade; x.fillRect(ox, y + r * .35, ow, oy + oh - y);
        for (let px = ox - r; px < ox + ow + r; px += r * (.9 + rnd() * .5)) {
          const py = y + (rnd() - .5) * r * .5, rr = r * (.8 + rnd() * .5), g = x.createLinearGradient(0, py - rr, 0, py + rr); g.addColorStop(0, lit); g.addColorStop(.55, mix(lit, shade, .35)); g.addColorStop(1, shade);
          x.fillStyle = g; x.beginPath(); x.arc(px, py, rr, 0, Math.PI * 2); x.fill();
        }
      }
    }
    if (desc.land === 'sea' && desc.skyline) {
      // a town across the water, lit after dark
      const tone = mix(far, near, .45); let px = ox;
      while (px < ox + ow) { const bw = ow * (.03 + rnd() * .06), bh = oh * (.03 + rnd() * .11); x.fillStyle = tone; x.fillRect(px, hz - bh, bw, bh + 1); if (L === 'night' || L === 'dusk') for (let wy = hz - bh + 4; wy < hz - 3; wy += 6) for (let wx = px + 2; wx < px + bw - 3; wx += 5) if (spark() < .35) { x.fillStyle = spark() < .5 ? '#ffd27a' : pal ? (spark() < .5 ? pal.accent : pal.accent2) : '#ff7ab8'; x.fillRect(wx, wy, 2, 3); if (lr() < .05) lights.push([wx / w, wy / h, 2 / w, 3 / h, tone, 0]); } else if (lr() < .04) lights.push([wx / w, wy / h, 2 / w, 3 / h, '#ffd27a', 1]); px += bw + 1; }
      if (lights.length) live({ k: 'windows', rects: lights.splice(0) });
    }
    if (desc.land === 'sea') {
      const sg = x.createLinearGradient(0, hz, 0, oy + oh); const aqua = pal && [pal.accent, pal.accent2].find(c => { const [hh, ss] = hsl(c); return hh > 150 && hh < 250 && ss > .25; });
      sg.addColorStop(0, aqua ? mix(mix(sky[2], '#1d4a7a', .5), aqua, .5) : mix(sky[2], '#1d4a7a', .5)); sg.addColorStop(1, aqua ? mix(mix(sky[0], '#06203a', .6), aqua, .25) : mix(sky[0], '#06203a', .6)); x.fillStyle = sg; x.fillRect(ox, hz, ow, oy + oh - hz);
      if (desc.frozen) {
        // ice: pale, with cracks instead of waves
        const ig = x.createLinearGradient(0, hz, 0, oy + oh); ig.addColorStop(0, mix(sky[2], '#e8f1f6', .7)); ig.addColorStop(1, mix(sky[0], '#a9c2d6', .55)); x.fillStyle = ig; x.fillRect(ox, hz, ow, oy + oh - hz);
        x.strokeStyle = 'rgb(70 95 120 / .35)'; x.lineWidth = 1; for (let i = 0; i < 9; i++) { let cx = ox + rnd() * ow, cy = hz + rnd() * (oy + oh - hz); x.beginPath(); x.moveTo(cx, cy); for (let k = 0; k < 4; k++) { cx += (rnd() - .5) * ow * .15; cy += (rnd() - .3) * oh * .05; x.lineTo(cx, cy); } x.stroke(); }
      } else {
      x.strokeStyle = 'rgb(255 255 255 / .35)'; x.lineWidth = 1.2; for (let i = 0; i < 40; i++) { const ly = hz + Math.pow(rnd(), 1.6) * (oy + oh - hz), lw = 10 + rnd() * 40; x.globalAlpha = .2 + rnd() * .5; x.beginPath(); x.moveTo(ox + rnd() * ow, ly); x.lineTo(ox + rnd() * ow + lw, ly); x.stroke(); }
      x.globalAlpha = .5; x.fillStyle = L === 'night' ? '#f4f0dc' : '#ffe2a0'; if (body[1] < 1) for (let ly = hz + 4; ly < oy + oh; ly += 7) { const wv = sr * (1.4 - (ly - hz) / oh) * (.5 + spark()); x.fillRect(sx - wv / 2, ly, wv, 2); }
      x.globalAlpha = 1;
      live({ k: 'water', box: fr(ox, hz, ow, oy + oh - hz), path: body[1] < 1 && desc.weather !== 'rain' ? [sx / w, sr / w] : null, night: L === 'night' });
      if (props.includes('neon')) for (let i = 0; i < 7; i++) {
        // neon from across the water, drawn down the surface
        const col = i % 2 ? (pal?.accent2 || '#35e8ff') : (pal?.accent || '#ff3fa4'), rx = ox + ow * (.05 + rnd() * .9), len = oh * (.08 + rnd() * .22);
        x.globalAlpha = .5; neon(col, () => { for (let ly = hz + 3; ly < hz + len; ly += 5) x.fillRect(rx - 1 + Math.sin(ly * .3) * 2, ly, 3 + spark() * 4, 2); }, ow * .02); x.globalAlpha = 1;
      }
      }
    }
    if (B) {
      // what sits in front of the place, its lit windows going on and off, and no star in front of a tower
      paintPlace(B, desc.place, 'after');
      if (B.lights.length) live({ k: 'windows', rects: B.lights });
      if (B.holes.length) for (const o of life) if (o.k === 'stars') o.holes = B.holes;
    }
    if (props.includes('neon') && desc.sign && !desc.inside && desc.land !== 'city') {
      // a sign on a pole by the road, saying what the place is, an arrow pointing the way in
      const c1 = pal?.accent || '#ff3fa4', c2 = pal?.accent2 || '#35e8ff', px0 = ox + ow * .76, base = hz + oh * .16, top = hz - oh * .2, sw = ow * .3, sh = oh * .085;
      x.fillStyle = mix(near, '#000000', .35); x.fillRect(px0 - ow * .007, top, ow * .014, base - top);
      x.fillStyle = mix(near, '#000000', .5); x.beginPath(); x.roundRect(px0 - sw / 2, top - sh, sw, sh, sh * .25); x.fill();
      live({ k: 'neon', box: fr(px0 - sw / 2, top - sh, sw, sh), c: c1 });
      neon(c2, () => { x.lineWidth = Math.max(1.5, ow * .006); x.beginPath(); x.roundRect(px0 - sw / 2 + 3, top - sh + 3, sw - 6, sh - 6, sh * .2); x.stroke(); }, ow * .03);
      const word = desc.sign; x.font = '800 ' + Math.round(Math.min(sh * .55, sw * 1.5 / Math.max(3, word.length))) + 'px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      neon(c1, () => x.fillText(word, px0, top - sh / 2 + 1), ow * .04);
      neon(c1, () => { x.lineWidth = Math.max(2, ow * .008); x.beginPath(); x.moveTo(px0 + sw * .3, top + oh * .03); x.lineTo(px0 - sw * .1, top + oh * .03); x.lineTo(px0 - sw * .1, top + oh * .09); x.moveTo(px0 - sw * .1 - ow * .025, top + oh * .065); x.lineTo(px0 - sw * .1, top + oh * .095); x.lineTo(px0 - sw * .1 + ow * .025, top + oh * .065); x.stroke(); }, ow * .03);
    }
    if ((L === 'night' || L === 'dusk') && ['fields', 'forest', 'hills'].includes(desc.land) && desc.weather !== 'rain' && desc.weather !== 'snow') live({ k: 'fireflies', box: fr(ox, hz - oh * .06, ow, (oy + oh - hz) * .55) });
    return hz;
  };
  let hz, win = null;
  if (desc.inside) {
    const plain = desc.ramp ? desc.ramp[3] : pal ? (L === 'night' ? mix(pal.ground2, pal.ground, .35) : pal.ground) : (L === 'night' ? '#2b2440' : '#efe2cf');
    const wall = props.includes('wood') ? mix(plain, L === 'night' ? '#4a2c18' : '#a0703f', .55) : plain;
    const floor = desc.ramp ? desc.ramp[1] : desc.pal ? mix(desc.pal.accent2, L === 'night' ? '#0a0a12' : '#3a2a20', .5) : (L === 'night' ? '#1a1526' : '#b88a5e');
    x.fillStyle = wall; x.fillRect(0, 0, w, h);
    if (props.includes('wood')) {
      // boards, each a shade apart
      const bh = h * .05;
      for (let by = 0, k = 0; by < horizon; by += bh, k++) { x.fillStyle = mix(wall, k % 2 ? '#000000' : '#ffffff', .04 + rnd() * .05); x.fillRect(0, by, w, bh); x.fillStyle = mix(wall, '#000000', .3); x.fillRect(0, by + bh - 1.5, w, 1.5); for (let j = 0; j < 2; j++) x.fillRect(rnd() * w, by, 1.5, bh); }
    } else if (props.includes('deco')) {
      // art deco: fine gold stripes, and a frieze of fans
      const gold = pal ? mix(pal.accent2, '#d6a540', .55) : '#d6a540'; x.fillStyle = mix(wall, gold, .18); for (let sx = w * .025; sx < w; sx += w * .05) x.fillRect(sx, 0, Math.max(1, w * .003), horizon);
      x.strokeStyle = mix(wall, gold, .6); x.lineWidth = Math.max(1, w * .003);
      for (let fx = w * .08; fx < w; fx += w * .14) { const fr = w * .055, fy = h * .065; x.fillStyle = mix(wall, gold, .25); x.beginPath(); x.arc(fx, fy, fr, Math.PI, 0); x.fill(); for (let k = 0; k <= 6; k++) { const a = Math.PI + k * Math.PI / 6; x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr); x.stroke(); } x.beginPath(); x.arc(fx, fy, fr, Math.PI, 0); x.stroke(); }
    } else if (!props.includes('tiles') && desc.marks?.[0] && pal) {
      // wallpaper in the room's own ornament
      x.save(); x.fillStyle = x.strokeStyle = mix(wall, pal.accent, luminance(wall) < .2 ? .16 : .13); const step = w / 6.5;
      for (let r = 0, py = step * .5; py < horizon; py += step * .8, r++) for (let px = (r % 2) * step / 2; px < w + step; px += step) sticker(x, desc.marks[0], px, py, w * .034, r % 2 ? .25 : -.25);
      x.restore();
    }
    if (props.includes('tiles')) {
      // a tiled wall to shoulder height: a diamond in each tile, circles where four tiles meet
      const motif = desc.pal ? desc.pal.accent : '#2b5fa6', glaze = desc.pal ? mix(desc.pal.ground, '#ffffff', .6) : '#f4f1ea', ts = w / 11, y0 = h * .3;
      x.fillStyle = mix(glaze, motif, .25); x.fillRect(0, y0 - 2, w, horizon - y0 + 2);
      for (let ty = y0; ty < horizon; ty += ts) for (let tx = 0; tx < w; tx += ts) { x.fillStyle = glaze; x.fillRect(tx + .5, ty + .5, ts - 1, ts - 1); }
      x.fillStyle = motif;
      for (let ty = y0; ty < horizon; ty += ts) for (let tx = 0; tx < w; tx += ts) {
        const cx = tx + ts / 2, cy = ty + ts / 2, r = ts * .3;
        x.beginPath(); x.moveTo(cx, cy - r); x.lineTo(cx + r, cy); x.lineTo(cx, cy + r); x.lineTo(cx - r, cy); x.closePath(); x.fill();
        x.beginPath(); x.arc(tx, ty, ts * .17, 0, Math.PI * 2); x.fill();
      }
      x.fillStyle = glaze; for (let ty = y0; ty < horizon; ty += ts) for (let tx = 0; tx < w; tx += ts) { x.beginPath(); x.arc(tx + ts / 2, ty + ts / 2, ts * .1, 0, Math.PI * 2); x.fill(); }
    }
    mark(notes.walls);
    if (props.includes('shelves')) {
      // shelves either side of the window, and on them what the words keep: books, jars, sweets
      const kept = pal ? [pal.accent, pal.accent2, mix(pal.accent, '#000000', .35), mix(pal.accent2, '#ffffff', .3), pal.ground2, mix(pal.ink, pal.accent, .3)] : ['#8a2b2b', '#2b4a6b', '#c9a24a', '#3f6b45', '#6b3f5a', '#e8dcc0'];
      const wood = mix(wall, '#3a2414', .55), sh = h * .085, kind = desc.shelf;
      for (const [x0, x1] of [[0, w * .18], [w * .82, w]]) {
        x.fillStyle = mix(wood, '#000000', .35); x.fillRect(x0, h * .05, x1 - x0, horizon - h * .05);
        for (let sy = h * .05 + sh; sy <= horizon; sy += sh) {
          let bx = x0 + w * .008;
          while (bx < x1 - w * .025) {
            const col = kept[Math.floor(rnd() * kept.length)];
            if (kind === 'books') { const bw = w * (.012 + rnd() * .014), bht = sh * (.6 + rnd() * .3); if (rnd() > .08) { x.fillStyle = col; x.fillRect(bx, sy - bht, bw - 1, bht); x.fillStyle = 'rgb(255 255 255 / .2)'; x.fillRect(bx + bw * .25, sy - bht * .8, bw * .4, 1.5); } bx += bw; continue; }
            const bw = w * (.026 + rnd() * .012), cx = bx + bw / 2, bht = sh * (.5 + rnd() * .3);
            if (kind === 'bread') {
              // loaves with their scores, and the odd baguette leaning
              const crust = mix('#c98a46', col, .12);
              if (rnd() < .3) { x.save(); x.translate(cx, sy); x.rotate(-.3); x.fillStyle = mix(crust, '#ffffff', .12); x.beginPath(); x.roundRect(-bw * .17, -sh * .82, bw * .34, sh * .82, bw * .17); x.fill(); x.restore(); }
              else { x.fillStyle = crust; x.beginPath(); x.ellipse(cx, sy, bw * .5, bht * .5, 0, Math.PI, 0); x.fill(); x.strokeStyle = mix(crust, '#fff3dc', .5); x.lineWidth = 1.2; for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(cx + k * bw * .2 - bw * .05, sy - bht * .38); x.lineTo(cx + k * bw * .2 + bw * .05, sy - bht * .2); x.stroke(); } }
            } else if (kind === 'sweets') {
              // a glass jar of sweets with a lid
              x.fillStyle = 'rgb(255 255 255 / .22)'; x.beginPath(); x.roundRect(bx + 1, sy - bht, bw - 2, bht, bw * .2); x.fill();
              for (let k = 0; k < 9; k++) { x.fillStyle = [pal?.accent || '#ff6fa0', pal?.accent2 || '#ffd36e', '#ffffff', '#7fd1c7'][k % 4]; x.beginPath(); x.arc(bx + bw * (.25 + rnd() * .5), sy - bht * (.12 + rnd() * .55), bw * .12, 0, Math.PI * 2); x.fill(); }
              x.fillStyle = mix(col, '#000000', .2); x.fillRect(bx + bw * .1, sy - bht - sh * .06, bw * .8, sh * .07);
            } else {
              // a bottle or a flask of something
              x.fillStyle = alpha(col, .85);
              if (rnd() < .5) { x.beginPath(); x.arc(cx, sy - bw * .42, bw * .42, 0, Math.PI * 2); x.fill(); x.fillRect(cx - bw * .1, sy - bht, bw * .2, bht - bw * .6); }
              else { x.beginPath(); x.roundRect(bx + bw * .15, sy - bht * .7, bw * .7, bht * .7, bw * .12); x.fill(); x.fillRect(cx - bw * .1, sy - bht, bw * .2, bht * .32); }
              x.fillStyle = mix(wood, '#000000', .1); x.fillRect(cx - bw * .13, sy - bht - sh * .04, bw * .26, sh * .05);
              x.fillStyle = 'rgb(255 255 255 / .35)'; x.fillRect(bx + bw * .3, sy - bht * .55, 1.5, bht * .3);
            }
            bx += bw + w * .004;
          }
          x.fillStyle = wood; x.fillRect(x0, sy, x1 - x0, h * .008);
        }
      }
    }
    if (props.includes('neon') && !props.includes('shelves')) {
      // either side of the window: the place's name read top to bottom, as on a Tokyo street, and a sign in the words' own shape
      const c1 = pal?.accent || '#ff3fa4', c2 = pal?.accent2 || '#35e8ff', word = desc.sign || '';
      if (word) {
        const n = word.length, y0 = h * .15, span = h * .36, fs = Math.min(w * .075, span / n * .82);
        x.fillStyle = mix(wall, '#000000', .4); x.beginPath(); x.roundRect(w * .1 - fs * .62, y0 - fs * .3, fs * 1.24, span + fs * .6, fs * .2); x.fill();
        x.font = '800 ' + Math.round(fs) + 'px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        neon(c1, () => { for (let k = 0; k < n; k++) x.fillText(word[k], w * .1, y0 + span * (k + .5) / n); }, w * .03);
        live({ k: 'neon', box: fr(w * .1 - fs * .62, y0 - fs * .3, fs * 1.24, span + fs * .6), c: c1 });
      } else { neon(c1, () => sticker(x, desc.marks?.[1] || 'notes', w * .1, h * .26, w * .1, -.2), w * .04); live({ k: 'neon', box: fr(w * .05, h * .26 - w * .05, w * .1, w * .1), c: c1 }); }
      neon(c2, () => sticker(x, desc.marks?.[0] || 'star', w * .9, h * .26, w * .1, .2), w * .04); live({ k: 'neon', box: fr(w * .85, h * .26 - w * .05, w * .1, w * .1), c: c2 });
    }
    mark(notes.furnish);
    const wx = w * .2, wy = h * .12, ww = w * .6, wh = h * .42; win = [wx, wy, ww, wh]; inWin = true; hz = drawOutdoor(wx, wy, ww, wh); inWin = false;
    live({ k: 'window', box: fr(wx, wy, ww, wh), bars: [.022, .012], inner: props.includes('curtains') ? [.16, .84] : null });
    if (props.includes('train')) live({ k: 'rush', box: fr(wx, wy + wh * .45, ww, wh * .55), win: true });
    x.strokeStyle = mix(wall, '#000', .35); x.lineWidth = w * .022; x.strokeRect(wx, wy, ww, wh); x.lineWidth = w * .012; x.beginPath(); x.moveTo(wx + ww / 2, wy); x.lineTo(wx + ww / 2, wy + wh); x.moveTo(wx, wy + wh / 2); x.lineTo(wx + ww, wy + wh / 2); x.stroke();
    if (props.includes('curtains')) {
      // drapes from a pelmet, gathered at a tie-back, falling to the floor
      const cc = pal ? (L === 'night' ? mix(pal.accent, '#000000', .2) : pal.accent) : '#9c2a3a', fold = mix(cc, '#000000', .32), top = wy - h * .035;
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? wx - w * .07 : wx + ww + w * .07, xi = side < 0 ? wx + ww * .16 : wx + ww * .84, tie = wy + wh * .6, xt = x0 + (xi - x0) * .22;
        x.fillStyle = cc; x.beginPath(); x.moveTo(x0, top); x.lineTo(xi, top); x.quadraticCurveTo(xi, tie - wh * .2, xt, tie); x.quadraticCurveTo(x0 + (xi - x0) * .3, tie + wh * .25, x0 + (xi - x0) * .45, horizon); x.lineTo(x0, horizon); x.closePath(); x.fill();
        x.strokeStyle = fold; x.lineWidth = w * .005; for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(x0 + (xi - x0) * k / 4.5, top); x.quadraticCurveTo(x0 + (xi - x0) * k / 5, tie - wh * .15, xt, tie); x.stroke(); }
        x.fillStyle = pal ? pal.accent2 : '#d6a540'; x.beginPath(); x.ellipse(xt, tie, w * .03, h * .008, side * .3, 0, Math.PI * 2); x.fill();
      }
      x.fillStyle = fold; x.fillRect(wx - w * .09, top - h * .02, ww + w * .18, h * .028);
    }
    if (props.includes('train')) {
      // the country going by, and a luggage rack overhead
      x.save(); x.beginPath(); x.rect(wx, wy, ww, wh); x.clip(); x.strokeStyle = 'rgb(255 255 255 / .22)'; x.lineWidth = 1.5;
      for (let i = 0; i < 26; i++) { const sy2 = wy + wh * (.45 + rnd() * .55), sx2 = wx + rnd() * ww; x.beginPath(); x.moveTo(sx2, sy2); x.lineTo(sx2 + ww * (.1 + rnd() * .25), sy2); x.stroke(); }
      x.restore();
      const brass = pal ? mix(pal.accent2, '#d6a540', .5) : '#c9a24a'; x.fillStyle = brass; x.fillRect(w * .08, wy - h * .07, w * .84, h * .005); x.fillRect(w * .08, wy - h * .05, w * .84, h * .005); for (let rx = w * .1; rx < w * .92; rx += w * .07) x.fillRect(rx, wy - h * .07, w * .004, h * .025);
    }
    if (props.includes('webs')) {
      // cobwebs in both top corners
      x.strokeStyle = luminance(wall) < .3 ? 'rgb(235 235 245 / .4)' : 'rgb(40 40 50 / .3)'; x.lineWidth = 1.2;
      for (const [cx, dir] of [[0, 1], [w, -1]]) {
        const R = w * .22, angles = [0, 1, 2, 3, 4, 5].map(k => k / 5 * Math.PI / 2);
        for (const a of angles) { x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx + dir * Math.cos(a) * R, Math.sin(a) * R); x.stroke(); }
        for (let r = R * .22; r <= R; r += R * .2) { x.beginPath(); angles.forEach((a, k) => { const px = cx + dir * Math.cos(a) * r, py = Math.sin(a) * r; if (!k) x.moveTo(px, py); else { const m = (a + angles[k - 1]) / 2; x.quadraticCurveTo(cx + dir * Math.cos(m) * r * .86, Math.sin(m) * r * .86, px, py); } }); x.stroke(); }
      }
    }
    const fg = x.createLinearGradient(0, horizon, 0, h); fg.addColorStop(0, floor); fg.addColorStop(1, mix(floor, '#000', .35)); x.fillStyle = fg; x.fillRect(0, horizon, w, h - horizon);
    x.fillStyle = mix(floor, '#000', .25); x.fillRect(w * .12, horizon + h * .06, w * .76, h * .025);
    if (L !== 'night' && desc.weather !== 'rain' && desc.sunAt && desc.sunAt.sun[1] < 1) {
      // the sun comes in: the window laid across the table, bars and all, away from the sun, and longer as it sinks
      const [su2, sv2] = desc.sunAt.sun, low = Math.max(0, Math.min(1, sv2)), dx = (.5 - su2) * w * (.3 + low * .5), spread = (.5 - su2) * w * .25;
      const top = horizon + h * .015, deep = h * (.1 + low * .2), tint = L === 'day' ? '255 246 222' : L === 'dawn' ? '255 208 196' : '255 186 110';
      const tl = [wx + dx * .4, top], tr = [wx + ww + dx * .4, top], bl = [wx + dx + spread - w * .06, top + deep], br = [wx + ww + dx + spread + w * .06, top + deep];
      const at = (/** @type {number} */ s, /** @type {number} */ t) => { const a = tl[0] + (tr[0] - tl[0]) * s, b = bl[0] + (br[0] - bl[0]) * s; return [a + (b - a) * t, top + deep * t]; };
      live({ k: 'motes', box: fr(Math.min(tl[0], bl[0]), wy + wh * .55, Math.max(tr[0], br[0]) - Math.min(tl[0], bl[0]), top + deep - wy - wh * .55) });
      const a = L === 'day' ? .22 : .34, fade = x.createLinearGradient(0, top, 0, top + deep); fade.addColorStop(0, `rgb(${tint} / ${a})`); fade.addColorStop(1, `rgb(${tint} / ${a * .4})`);
      x.save(); x.globalCompositeOperation = 'screen'; x.fillStyle = fade;
      for (const [s0, s1] of [[0, .47], [.53, 1]]) for (const [t0, t1] of [[0, .46], [.54, 1]]) {
        const p = [at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)]; x.beginPath(); x.moveTo(p[0][0], p[0][1]); for (const q of p.slice(1)) x.lineTo(q[0], q[1]); x.closePath(); x.fill();
      }
      x.restore();
    }
    mark(notes.view);
    if (!desc.things.some(k => k === 'teacup' || k === 'glass')) desc.things.push('teacup');
    if (props.includes('mirrorball')) {
      // a mirror ball, and the light it throws all over the room
      const bx = w * .5, by = h * .1, br = w * .07;
      live({ k: 'specks', at: [bx / w, by / h], r: br / w, c: [pal?.accent || '#ff5fa2', pal?.accent2 || '#5fd8ff', '#ffffff'] });
      x.strokeStyle = mix(wall, '#000000', .45); x.lineWidth = 2; x.beginPath(); x.moveTo(bx, 0); x.lineTo(bx, by - br); x.stroke();
      x.save(); x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 110; i++) { const a = rnd() * Math.PI * 2, d = w * (.12 + rnd() * .75); x.fillStyle = alpha([pal?.accent || '#ff5fa2', pal?.accent2 || '#5fd8ff', '#ffffff'][i % 3], .3 + rnd() * .4); x.beginPath(); x.ellipse(bx + Math.cos(a) * d, by + Math.abs(Math.sin(a)) * d * 1.15, w * (.005 + rnd() * .006), w * .0035, a, 0, Math.PI * 2); x.fill(); }
      x.restore();
      const bg = x.createRadialGradient(bx - br * .4, by - br * .4, br * .1, bx, by, br); bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#5d6478'); x.fillStyle = bg; x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.fill();
      x.save(); x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.clip(); x.strokeStyle = 'rgb(30 34 50 / .4)'; x.lineWidth = 1;
      for (let k = -4; k <= 4; k++) { x.beginPath(); x.moveTo(bx - br, by + k * br / 4.5); x.lineTo(bx + br, by + k * br / 4.5); x.stroke(); x.beginPath(); x.ellipse(bx, by, Math.abs(k) * br / 4.5, br, 0, 0, Math.PI * 2); x.stroke(); }
      x.restore();
    } else if (props.includes('chandelier')) {
      // a chandelier: arms of brass, five candles, and their glow
      const cx = w * .5, cy = h * .075, arm = w * .14, brass = pal ? mix(pal.accent2, '#d6a540', .6) : '#d6a540';
      const tips = [-1, -.5, 0, .5, 1].map(k => [cx + k * arm, cy + h * .045 - Math.abs(k) * h * .012]);
      live({ k: 'flames', pts: tips.map(([tx, ty]) => [tx / w, (ty - h * .025) / h]) });
      x.strokeStyle = brass; x.lineWidth = 2; x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx, cy + h * .05); x.stroke();
      x.lineWidth = w * .006; for (const [tx, ty] of tips) { x.beginPath(); x.moveTo(cx, cy + h * .05); x.quadraticCurveTo(tx, cy + h * .075, tx, ty); x.stroke(); }
      x.save(); x.globalCompositeOperation = 'lighter';
      for (const [tx, ty] of tips) { const g = x.createRadialGradient(tx, ty - h * .02, 0, tx, ty - h * .02, w * .1); g.addColorStop(0, 'rgb(255 214 140 / .4)'); g.addColorStop(1, 'rgb(255 214 140 / 0)'); x.fillStyle = g; x.fillRect(tx - w * .1, ty - h * .1, w * .2, h * .18); }
      x.restore();
      for (const [tx, ty] of tips) { x.fillStyle = '#f4ecdc'; x.fillRect(tx - w * .005, ty - h * .018, w * .01, h * .018); x.fillStyle = '#ffd98a'; x.beginPath(); x.ellipse(tx, ty - h * .025, w * .0045, h * .007, 0, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = 'rgb(255 255 255 / .75)'; for (let k = -3; k <= 3; k++) { x.beginPath(); x.arc(cx + k * arm / 3.4, cy + h * .085 - Math.abs(k) * h * .006, w * .005, 0, Math.PI * 2); x.fill(); }
    } else if (props.includes('lamp')) {
      // a low lamp over the table, and its pool of warm light
      const lx = w * .5, ly = h * .085, warm = desc.pal ? mix(desc.pal.accent, '#ffd8a0', .78) : '#ffd27a', shade = mix(wall, '#000000', .45);
      x.strokeStyle = shade; x.lineWidth = 2; x.beginPath(); x.moveTo(lx, 0); x.lineTo(lx, ly - h * .03); x.stroke();
      if (L === 'night' || L === 'dusk' || luminance(wall) < .25) {
      x.save(); x.globalCompositeOperation = 'lighter';
      const g = x.createLinearGradient(0, ly, 0, horizon + h * .12); g.addColorStop(0, alpha(warm, .3)); g.addColorStop(1, alpha(warm, 0));
      x.fillStyle = g; x.beginPath(); x.moveTo(lx - w * .045, ly); x.lineTo(lx + w * .045, ly); x.lineTo(lx + w * .36, horizon + h * .12); x.lineTo(lx - w * .36, horizon + h * .12); x.fill(); x.restore(); }
      x.fillStyle = shade; x.beginPath(); x.moveTo(lx - w * .055, ly); x.lineTo(lx + w * .055, ly); x.lineTo(lx + w * .028, ly - h * .032); x.lineTo(lx - w * .028, ly - h * .032); x.fill();
      x.fillStyle = warm; x.beginPath(); x.ellipse(lx, ly, w * .04, h * .006, 0, 0, Math.PI * 2); x.fill();
    }
    mark(notes.light);
    if (props.includes('plants')) {
      // ivy trailing from the top corners, and two big pots in front
      const leaf = pal && [pal.accent, pal.accent2].find(c => { const [hh, ss] = hsl(c); return hh > 70 && hh < 170 && ss > .2; }) || (L === 'night' ? '#2c5a3c' : '#3f7a4a');
      for (const side of [-1, 1]) {
        const ax = side < 0 ? w * .02 : w * .98; x.strokeStyle = mix(leaf, '#000000', .3); x.lineWidth = 2;
        x.beginPath(); x.moveTo(ax, 0); x.quadraticCurveTo(ax - side * w * .12, h * .2, ax - side * w * .04, h * .36); x.stroke();
        for (let k = 0; k < 12; k++) { const f = k / 12, lx = ax - side * w * (.12 * 2 * f * (1 - f) + .04 * f * f) + (rnd() - .5) * w * .03, ly = h * .36 * f; x.fillStyle = mix(leaf, k % 2 ? '#ffffff' : '#000000', .12); x.beginPath(); x.ellipse(lx, ly, w * .018, w * .01, rnd() * 3, 0, Math.PI * 2); x.fill(); }
        const px = side < 0 ? w * .12 : w * .88, py = h * .97, pw = w * .14;
        for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + (k - 4) * .32, len = h * (.14 + rnd() * .1); x.strokeStyle = mix(leaf, k % 2 ? '#000000' : '#ffffff', .1); x.lineWidth = w * .03; x.lineCap = 'round'; x.beginPath(); x.moveTo(px, py - h * .08); x.quadraticCurveTo(px + Math.cos(a) * len * .5, py - h * .08 + Math.sin(a) * len * .8, px + Math.cos(a) * len, py - h * .08 + Math.sin(a) * len * .7); x.stroke(); }
        x.lineCap = 'butt'; x.fillStyle = pal ? mix(pal.accent2, '#b5543c', .4) : '#b5543c'; x.beginPath(); x.moveTo(px - pw / 2, py - h * .09); x.lineTo(px + pw / 2, py - h * .09); x.lineTo(px + pw * .38, py); x.lineTo(px - pw * .38, py); x.fill();
      }
      mark('Plants, and ivy coming down');
    }
  } else { hz = drawOutdoor(0, 0, w, h); mark(notes.land); }

  if (!desc.bare) for (const thing of desc.things) drawThing(x, thing, w, h, desc.inside ? horizon + h * .06 : hz, rnd, desc);
  if (desc.who && !desc.bare) {
    // the sitter: a silhouette in front, rimmed with light after dark, wearing what the words say
    const person = desc.who === 'person', size = w * (person ? .7 : .44), cx = w * (person ? .5 : .44), base = person ? h * 1.02 : desc.inside ? h * .97 : Math.min(h * .93, hz + h * .3);
    const tone = pal ? mix(luminance(pal.ink) < luminance(pal.ground) ? pal.ink : pal.ground, '#000000', .3) : (L === 'night' ? '#0b0d18' : '#2a2320');
    if (!person) { x.fillStyle = 'rgb(0 0 0 / .2)'; x.beginPath(); x.ellipse(cx, base, size * .36, size * .045, 0, 0, Math.PI * 2); x.fill(); }
    if (L === 'night') figure(x, desc, cx - size / 2 - size * .012, base - size - size * .012, size, pal ? pal.accent2 : '#9fb4ff');
    const head = figure(x, desc, cx - size / 2, base - size, size, tone);
    const hat = pal ? pal.accent : '#c9372c';
    if (desc.wears === 'hat') { x.fillStyle = hat; x.fillRect(head.x - head.r * 1.25, head.y - head.r * .95, head.r * 2.5, head.r * .3); x.fillRect(head.x - head.r * .78, head.y - head.r * 2.3, head.r * 1.56, head.r * 1.45); x.fillStyle = pal ? pal.accent2 : '#f4efe6'; x.fillRect(head.x - head.r * .78, head.y - head.r * 1.15, head.r * 1.56, head.r * .26); }
    if (desc.wears === 'crown') { x.fillStyle = '#e2b13c'; sticker(x, 'crown', head.x, head.y - head.r * 1.25, head.r * 2.2, 0); }
    if (desc.wears === 'bow') { x.fillStyle = hat; sticker(x, 'bow', head.x + head.r * .75, head.y - head.r * .7, head.r * 1.3, .3); }
    mark(cap(sitter(desc)));
  }
  const listed = desc.things.map((/** @type {string} */ k) => THING[k]).filter(Boolean);
  if (listed.length) mark(cap(listed.join(', ')) + (desc.inside ? (desc.things.includes('glass') ? ' on the bar' : ' on the table') : ''));
  if (['rain', 'snow', 'petals'].includes(desc.weather)) life.push({ k: desc.weather, box: win ? fr(win[0], win[1], win[2], win[3]) : [0, 0, 1, 1], night: L === 'night', win: !!win });
  x.save();
  if (win) { x.beginPath(); x.rect(win[0], win[1], win[2], win[3]); x.clip(); } // indoors, the weather stays outside the window
  if (!desc.quiet) {
  if (desc.weather === 'rain') { x.strokeStyle = L === 'night' ? 'rgb(220 230 255 / .45)' : 'rgb(60 70 95 / .35)'; x.lineWidth = 1.2; for (let i = 0; i < 220; i++) { const rx = rnd() * w, ry = rnd() * h, rl = 14 + rnd() * 20; x.beginPath(); x.moveTo(rx, ry); x.lineTo(rx - 4, ry + rl); x.stroke(); } }
  if (desc.weather === 'snow') { x.fillStyle = 'rgb(255 255 255 / .85)'; for (let i = 0; i < 260; i++) { x.beginPath(); x.arc(rnd() * w, rnd() * h, .8 + rnd() * 2.6, 0, Math.PI * 2); x.fill(); } }
  if (desc.weather === 'petals') { for (let i = 0; i < 46; i++) { x.fillStyle = rnd() < .5 ? '#f6b6c8' : '#fbd7e1'; sticker(x, 'petal', rnd() * w, rnd() * h, 10 + rnd() * 10, rnd() * 6); } }
  if (win && desc.weather === 'rain') for (let i = 0; i < 26; i++) { const dx = win[0] + rnd() * win[2], dy = win[1] + rnd() * win[3], dr = 1.5 + rnd() * w * .006; x.fillStyle = 'rgb(255 255 255 / .25)'; x.beginPath(); x.arc(dx, dy, dr, 0, Math.PI * 2); x.fill(); x.fillStyle = 'rgb(255 255 255 / .6)'; x.beginPath(); x.arc(dx - dr * .3, dy - dr * .3, dr * .3, 0, Math.PI * 2); x.fill(); }
  }
  x.restore();
  mark(notes.weather);
  if (desc.arch) life.push({ k: 'arch' });
  if (desc.arch) { const m = make(w, h), mc = m.getContext('2d'); mc.fillStyle = desc.ramp ? desc.ramp[4] : desc.pal ? desc.pal.ground : '#f6efe2'; mc.fillRect(0, 0, w, h); mc.globalCompositeOperation = 'destination-out'; mc.beginPath(); mc.moveTo(w * .1, h); mc.lineTo(w * .1, h * .4); mc.arc(w / 2, h * .4, w * .4, Math.PI, 0); mc.lineTo(w * .9, h); mc.fill(); x.drawImage(m, 0, 0); }
  if (desc.zoom > 1) {
    const z = desc.zoom, was = copy(c), k = (1 - 1 / z) / 2; x.drawImage(was, w * k, h * k, w / z, h / z, 0, 0, w, h);
    const s = desc.sunAt; if (s) desc.sunAt = { ...s, x: (s.x - k) * z, y: (s.y - k) * z, r: s.r * z, box: [(s.box[0] - k) * z, (s.box[1] - k) * z, s.box[2] * z, s.box[3] * z] };
    for (const o of life) zoomHint(o, z, k);
  }
  if (desc.quiet) { vignette(c, .35); return c; }
  const grainy = x.getImageData(0, 0, w, h), gd = grainy.data;
  for (let i = 0; i < gd.length; i += 4) { const n = (rnd() - .5) * 14; gd[i] += n; gd[i + 1] += n; gd[i + 2] += n; }
  x.putImageData(grainy, 0, 0);
  vignette(c, .35);
  return c;
}

/** A hint where a zoomed picture shows it: about the middle, z times nearer. @param {any} o @param {number} z @param {number} k */
function zoomHint(o, z, k) {
  const X = (/** @type {number} */ v) => (v - k) * z;
  if (o.box) o.box = [X(o.box[0]), X(o.box[1]), o.box[2] * z, o.box[3] * z];
  for (const key of ['at', 'sun']) if (o[key]) o[key] = [X(o[key][0]), X(o[key][1])];
  if (o.pts) o.pts = o.pts.map((/** @type {number[]} */ p) => [X(p[0]), X(p[1])]);
  if (o.rects) o.rects = o.rects.map((/** @type {any[]} */ q) => [X(q[0]), X(q[1]), q[2] * z, q[3] * z, q[4], q[5]]);
  if (o.path) o.path = [X(o.path[0]), o.path[1] * z];
  if (o.avoid) o.avoid = [X(o.avoid[0]), X(o.avoid[1]), o.avoid[2] * z];
  if (o.holes) o.holes = o.holes.map((/** @type {number[]} */ q) => [X(q[0]), X(q[1]), q[2] * z, q[3] * z]);
  if (o.pivot) o.pivot = [X(o.pivot[0]), X(o.pivot[1])];
  if (o.devil) o.devil = [X(o.devil[0]), X(o.devil[1]), o.devil[2] * z];
  if (typeof o.r === 'number') o.r *= z;
  if (o.k === 'arch') o.zoom = [z, k];
}

/**
 * What can move in a scene, and what stands in front of it: the hints the painter leaves as it paints (stars, water,
 * rain, steam, a lamp), in fractions of the picture, and a small mask of what was painted over the place (the things in
 * it, and the sitter), found by painting it again without them. Painted at the picture's own size, since lit windows are
 * counted by the pixel. The picture itself is not touched.
 * @param {any} desc @param {number} w @param {number} h @returns {{ hints: any[], front: HTMLCanvasElement, bare: HTMLCanvasElement | null, cut: HTMLCanvasElement | null }}
 */
export function lifeIn(desc, w, h) {
  const again = (/** @type {any} */ more) => ({ ...desc, things: [...(desc.things || [])], layers: null, quiet: true, ...more });
  const full = again({}), whole = scene(full, w, h);
  const sw = 160, sh = Math.max(1, Math.round(sw * h / w));
  const a = ctx2d(scene(again({}), sw, sh)).getImageData(0, 0, sw, sh).data, b = ctx2d(scene(again({ bare: true }), sw, sh)).getImageData(0, 0, sw, sh).data;
  const front = make(sw, sh), fx = ctx2d(front), m = fx.createImageData(sw, sh);
  for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) m.data[i + 3] = 255;
  fx.putImageData(m, 0, 0);
  // what moves itself (a boat, balloons, a heart): cut along where it differs from the place without it, at full size,
  // and the place without it, to show through as it moves
  const moving = (full.life || []).filter(o => MOVES.has(o.k));
  if (!moving.length) return { hints: full.life || [], front, bare: null, cut: null };
  const bare = scene(again({ bare: true }), w, h), cut = make(w, h), A = ctx2d(whole), Bc = ctx2d(bare), C = ctx2d(cut);
  for (const o of moving) {
    const x0 = Math.max(0, Math.floor(o.box[0] * w)), y0 = Math.max(0, Math.floor(o.box[1] * h)), x1 = Math.min(w, Math.ceil((o.box[0] + o.box[2]) * w)), y1 = Math.min(h, Math.ceil((o.box[1] + o.box[3]) * h));
    if (x1 <= x0 || y1 <= y0) continue;
    const pa = A.getImageData(x0, y0, x1 - x0, y1 - y0).data, pb = Bc.getImageData(x0, y0, x1 - x0, y1 - y0).data, mm = C.createImageData(x1 - x0, y1 - y0);
    for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 6) mm.data[i + 3] = 255;
    C.putImageData(mm, x0, y0);
  }
  return { hints: full.life || [], front, bare, cut };
}
/** Hints for things that move themselves: cut out of the picture and moved whole. */
const MOVES = new Set(['bob', 'sway', 'beat', 'spin']);

/**
 * A sitter as one flat shape, drawn in a 100-unit box (feet at the bottom) at ox, oy and size s.
 * Returns where the head is, for a hat or a crown.
 */
function figure(x, d, ox, oy, s, fill) {
  const k = s / 100, T = Math.PI * 2, at = (/** @type {number} */ hx, /** @type {number} */ hy, /** @type {number} */ r) => ({ x: ox + hx * k, y: oy + hy * k, r: r * k });
  const blob = (/** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ rx, /** @type {number} */ ry, rot = 0) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, T); x.fill(); };
  const tri = (/** @type {number[]} */ ...p) => { x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(p[2], p[3]); x.lineTo(p[4], p[5]); x.closePath(); x.fill(); };
  x.save(); x.translate(ox, oy); x.scale(k, k); x.fillStyle = x.strokeStyle = fill; x.lineCap = 'round';
  let head;
  if (d.who === 'cat') {
    blob(45, 74, 23, 26); blob(55, 35, 14, 13); tri(42, 30, 44, 12, 53, 23); tri(57, 23, 66, 12, 68, 30);
    x.lineWidth = 6.5; x.beginPath(); x.moveTo(27, 93); x.bezierCurveTo(8, 93, 5, 72, 14, 60); x.stroke(); head = at(55, 34, 14);
  } else if (d.who === 'dog') {
    blob(44, 72, 22, 28); blob(54, 34, 14, 13); blob(67, 39, 10, 6.5); blob(44, 37, 5, 12, .35);
    x.lineWidth = 6; x.beginPath(); x.moveTo(25, 88); x.quadraticCurveTo(12, 84, 12, 68); x.stroke(); head = at(54, 33, 14);
  } else if (d.who === 'bird') {
    blob(48, 68, 23, 15, -.3); blob(67, 50, 10, 10); tri(76, 47, 88, 51, 76, 55); tri(30, 74, 8, 86, 28, 64);
    x.lineWidth = 2.5; x.beginPath(); x.moveTo(46, 80); x.lineTo(44, 98); x.moveTo(54, 79); x.lineTo(55, 98); x.stroke(); head = at(67, 48, 10);
  } else if (d.who === 'rabbit') {
    blob(46, 77, 22, 23); blob(56, 48, 12, 11); blob(50, 23, 4.5, 15, -.15); blob(62, 23, 4.5, 15, .15); blob(25, 86, 6, 6); head = at(56, 47, 12);
  } else {
    if (d.hair) { x.save(); x.globalAlpha = .85; blob(50, 44, 20, 28); x.restore(); }
    x.beginPath(); x.moveTo(10, 100); x.bezierCurveTo(10, 72, 28, 63, 50, 63); x.bezierCurveTo(72, 63, 90, 72, 90, 100); x.closePath(); x.fill();
    x.fillRect(43, 48, 14, 18); blob(50, 35, 15, 18); head = at(50, 30, 16);
  }
  x.restore();
  return head;
}

function sticker(x, name, px, py, size, rot = 0) {
  const p = path2d(name); x.save(); x.translate(px, py); x.rotate(rot); x.scale(size / 24, size / 24); x.translate(-12, -12); if (p.f) x.fill(p.f); if (p.s) { x.lineWidth = 1.6; x.stroke(p.s); } x.restore();
}
function drawThing(x, thing, w, h, ground, rnd, desc) {
  const dark = desc.light === 'night', ink = dark ? '#0b0d18' : '#2a2320';
  if (thing === 'lighthouse') {
    const bx = w * .26, top = ground - h * .3, bw = w * .07;
    x.fillStyle = dark ? '#1a1d2e' : '#6b5a4c'; x.beginPath(); x.ellipse(bx, ground + 6, w * .14, h * .025, 0, 0, Math.PI * 2); x.fill();
    for (let i = 0; i < 5; i++) { x.fillStyle = i % 2 ? '#f4efe6' : '#c9372c'; const y0 = top + (ground - top) * i / 5, y1 = top + (ground - top) * (i + 1) / 5; x.beginPath(); x.moveTo(bx - bw * (.7 + i * .06), y0); x.lineTo(bx + bw * (.7 + i * .06), y0); x.lineTo(bx + bw * (.76 + i * .06), y1); x.lineTo(bx - bw * (.76 + i * .06), y1); x.fill(); }
    x.fillStyle = '#ffe9a8'; x.fillRect(bx - bw * .55, top - h * .035, bw * 1.1, h * .035); x.fillStyle = ink; x.beginPath(); x.moveTo(bx - bw * .8, top - h * .035); x.lineTo(bx, top - h * .07); x.lineTo(bx + bw * .8, top - h * .035); x.fill();
    desc.life?.push({ k: 'lamp', at: [bx / w, (top - h * .018) / h], r: bw / w });
    const beam = x.createLinearGradient(bx, 0, w, 0); beam.addColorStop(0, 'rgb(255 236 170 / .55)'); beam.addColorStop(1, 'rgb(255 236 170 / 0)'); x.fillStyle = beam; x.beginPath(); x.moveTo(bx, top - h * .018); x.lineTo(w, top - h * .1); x.lineTo(w, top + h * .05); x.fill();
  } else if (thing === 'boat') {
    const bx = w * .66, by = ground + h * .1; x.fillStyle = ink; x.beginPath(); x.moveTo(bx - w * .1, by); x.lineTo(bx + w * .1, by); x.lineTo(bx + w * .07, by + h * .025); x.lineTo(bx - w * .07, by + h * .025); x.fill();
    x.fillStyle = '#f6efe0'; x.beginPath(); x.moveTo(bx, by - h * .14); x.lineTo(bx, by - h * .01); x.lineTo(bx + w * .08, by - h * .01); x.fill(); x.fillStyle = '#e8d7bd'; x.beginPath(); x.moveTo(bx - 3, by - h * .12); x.lineTo(bx - 3, by - h * .01); x.lineTo(bx - w * .06, by - h * .01); x.fill();
    desc.life?.push({ k: 'bob', box: [(bx - w * .12) / w, (by - h * .16) / h, .24, .2] });
  } else if (thing === 'tree') {
    const tx = w * .7, tb = ground + h * .02; x.fillStyle = ink; x.fillRect(tx - 5, tb - h * .12, 10, h * .12);
    x.fillStyle = dark ? '#132418' : (desc.ramp ? desc.ramp[1] : '#2f6a3c'); for (let i = 0; i < 7; i++) { x.beginPath(); x.arc(tx + (rnd() - .5) * w * .14, tb - h * .15 - rnd() * h * .08, w * (.05 + rnd() * .04), 0, Math.PI * 2); x.fill(); }
  } else if (thing === 'house') {
    const hx = w * .58, hb = ground + h * .015, hw = w * .16, hh = h * .09; x.fillStyle = dark ? '#221f2c' : '#e9dcc6'; x.fillRect(hx, hb - hh, hw, hh);
    x.fillStyle = dark ? '#3a1f2a' : '#b5543c'; x.beginPath(); x.moveTo(hx - 8, hb - hh); x.lineTo(hx + hw / 2, hb - hh - h * .06); x.lineTo(hx + hw + 8, hb - hh); x.fill();
    x.fillStyle = dark ? '#ffd27a' : '#4a6a8a'; x.fillRect(hx + hw * .2, hb - hh * .7, hw * .22, hh * .3); x.fillRect(hx + hw * .6, hb - hh * .7, hw * .22, hh * .3);
  } else if (thing === 'grove') {
    const fruit = desc.fruit || (desc.pal ? desc.pal.accent : '#f3d23a'), leaf = dark ? '#10241a' : '#2f5a32';
    for (const [tx, ty, r] of [[w * .1, h * .8, w * .22], [w * .9, h * .76, w * .2], [w * .52, h * 1.02, w * .26]]) {
      x.fillStyle = dark ? '#0b0d18' : '#3a2a20'; x.fillRect(tx - w * .015, ty, w * .03, h);
      for (let k = 0; k < 10; k++) { x.fillStyle = mix(leaf, k % 2 ? '#000000' : '#6a9a52', .12 + rnd() * .22); x.beginPath(); x.arc(tx + (rnd() - .5) * r * 1.4, ty - rnd() * r * .9, r * (.3 + rnd() * .25), 0, Math.PI * 2); x.fill(); }
      x.fillStyle = dark ? mix(fruit, '#000000', .45) : fruit; for (let k = 0; k < 14; k++) { x.beginPath(); x.ellipse(tx + (rnd() - .5) * r * 1.3, ty - rnd() * r * .9, w * .011, w * .014, rnd(), 0, Math.PI * 2); x.fill(); }
    }
  } else if (thing === 'treehouse') {
    const tx = w * .7, tb = ground + h * .02, hw = w * .16, hh = h * .07, hx = tx - hw / 2, hy = tb - h * .21, wood = dark ? '#2a2030' : '#a0703f';
    x.fillStyle = wood; x.fillRect(hx, hy, hw, hh); x.fillStyle = mix(wood, '#000000', .35); for (let k = 1; k < 4; k++) x.fillRect(hx, hy + hh * k / 4, hw, 1.5);
    x.fillStyle = dark ? '#3a1f2a' : '#b5543c'; x.beginPath(); x.moveTo(hx - w * .015, hy); x.lineTo(hx + hw / 2, hy - h * .05); x.lineTo(hx + hw + w * .015, hy); x.fill();
    x.fillStyle = dark ? '#ffd27a' : '#2a2320'; x.fillRect(hx + hw * .38, hy + hh * .25, hw * .26, hh * .45);
    x.strokeStyle = mix(wood, '#000000', .2); x.lineWidth = 2; x.beginPath(); x.moveTo(hx + hw * .12, hy + hh); x.lineTo(hx + hw * .12, tb); x.moveTo(hx + hw * .26, hy + hh); x.lineTo(hx + hw * .26, tb); for (let ry = hy + hh + h * .02; ry < tb; ry += h * .02) { x.moveTo(hx + hw * .12, ry); x.lineTo(hx + hw * .26, ry); } x.stroke();
  } else if (thing === 'koi') {
    for (let i = 0; i < 5; i++) { const fx = w * (.15 + rnd() * .7), fy = ground + (h - ground) * (.25 + rnd() * .6), s = w * (.03 + rnd() * .02) * (.6 + (fy - ground) / (h - ground)), a = rnd() * Math.PI * 2; x.save(); x.translate(fx, fy); x.rotate(a); x.scale(1, .55);
      x.fillStyle = i % 2 ? '#f6f1ea' : '#f07a2a'; x.beginPath(); x.ellipse(0, 0, s, s * .4, 0, 0, Math.PI * 2); x.fill(); x.beginPath(); x.moveTo(-s * .8, 0); x.lineTo(-s * 1.5, -s * .4); x.lineTo(-s * 1.5, s * .4); x.fill();
      x.fillStyle = i % 2 ? '#f07a2a' : '#f6f1ea'; x.beginPath(); x.ellipse(s * .2, -s * .05, s * .3, s * .18, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
  } else if (thing === 'palm') {
    const px = w * .2, base = ground + h * .22, top = base - h * .4, sand = dark ? '#262838' : desc.pal ? mix(desc.pal.ground, '#f1dcaa', .6) : '#f1dcaa', crown = [px + w * .12, top];
    x.fillStyle = sand; x.beginPath(); x.ellipse(px, base + h * .01, w * .3, h * .035, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = dark ? '#121420' : '#7a5634'; x.lineCap = 'round'; x.lineWidth = w * .024;
    x.beginPath(); x.moveTo(px, base); x.quadraticCurveTo(px - w * .02, (base + top) / 2, crown[0], crown[1]); x.stroke();
    x.strokeStyle = dark ? '#0d1a14' : desc.pal ? mix(desc.pal.accent, '#2f6a3c', .55) : '#2f7a4a'; x.lineWidth = w * .016;
    for (let i = 0; i < 8; i++) { const a = -Math.PI - .2 + i * (Math.PI + .4) / 7 + (rnd() - .5) * .2, len = w * (.14 + rnd() * .06); x.beginPath(); x.moveTo(crown[0], crown[1]); x.quadraticCurveTo(crown[0] + Math.cos(a) * len * .6, crown[1] + Math.sin(a) * len * .5 - h * .03, crown[0] + Math.cos(a) * len, crown[1] + Math.sin(a) * len * .3 + len * .45); x.stroke(); }
    x.lineCap = 'butt';
  } else if (thing === 'glass') {
    const gx = w * .5, base = ground, gw = w * .085, top = base - h * .13, clear = dark ? 'rgb(225 232 255 / .6)' : 'rgb(255 255 255 / .78)';
    x.fillStyle = clear; x.beginPath(); x.ellipse(gx, base, gw * .7, h * .007, 0, 0, Math.PI * 2); x.fill();
    x.fillRect(gx - w * .003, top + h * .04, w * .006, base - top - h * .04);
    x.fillStyle = desc.pal ? desc.pal.accent : '#c9733a'; x.beginPath(); x.ellipse(gx, top, gw, h * .045, 0, 0, Math.PI); x.fill();
    x.strokeStyle = clear; x.lineWidth = w * .004; x.beginPath(); x.ellipse(gx, top, gw, h * .012, 0, 0, Math.PI * 2); x.stroke();
  } else if (thing === 'teacup') {
    const cx = w * .5, cy = ground - h * .005, cw = w * .2, col = desc.ramp ? desc.ramp[4] : '#fbf6ee', trim = desc.ramp ? desc.ramp[2] : desc.pal ? desc.pal.accent : '#d9667f';
    x.fillStyle = 'rgb(0 0 0 / .18)'; x.beginPath(); x.ellipse(cx, cy + h * .012, cw * .9, h * .015, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, cw * .85, h * .014, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(cx - cw / 2, cy - h * .07); x.quadraticCurveTo(cx - cw / 2, cy, cx, cy); x.quadraticCurveTo(cx + cw / 2, cy, cx + cw / 2, cy - h * .07); x.fill();
    x.strokeStyle = col; x.lineWidth = w * .014; x.beginPath(); x.arc(cx + cw * .55, cy - h * .045, w * .03, -1.3, 1.3); x.stroke();
    x.fillStyle = trim; x.fillRect(cx - cw / 2, cy - h * .07, cw, h * .007); x.fillStyle = mix(trim, '#000', .2); x.beginPath(); x.ellipse(cx, cy - h * .07, cw / 2, h * .01, 0, 0, Math.PI * 2); x.fill();
    desc.life?.push({ k: 'steam', at: [cx / w, (cy - h * .085) / h], r: cw / w });
    x.strokeStyle = 'rgb(255 255 255 / .5)'; x.lineWidth = 2; for (let i = 0; i < 2; i++) { x.beginPath(); const sx = cx - 10 + i * 20; x.moveTo(sx, cy - h * .09); x.bezierCurveTo(sx - 10, cy - h * .11, sx + 10, cy - h * .13, sx, cy - h * .16); x.stroke(); }
  } else if (thing === 'flowers') {
    for (let i = 0; i < 70; i++) { const fx = rnd() * w, fy = ground + Math.pow(rnd(), .7) * (h - ground); x.fillStyle = ['#f6b6c8', '#ffd36e', '#f4f1ea', desc.ramp ? desc.ramp[3] : desc.pal ? desc.pal.accent : '#e0718b'][i % 4]; sticker(x, 'flower', fx, fy, 6 + (fy - ground) / h * 40, rnd() * 3); }
  } else if (thing === 'heart') {
    x.fillStyle = desc.ramp ? desc.ramp[2] : desc.pal ? desc.pal.accent : '#e0607e'; sticker(x, 'heart', w * .5, ground - h * .18, w * .32, 0);
    desc.life?.push({ k: 'beat', box: [.31, (ground - h * .18 - w * .19) / h, .38, w * .38 / h] });
  } else if (thing === 'castle') {
    const cx = w * .5, cb = ground, cw = w * .34; x.fillStyle = dark ? '#1b1a2c' : '#d9cfc0';
    x.fillRect(cx - cw / 2, cb - h * .16, cw, h * .16); for (const tx of [-cw / 2, cw / 2 - w * .06]) { x.fillRect(cx + tx, cb - h * .24, w * .06, h * .24); x.beginPath(); x.moveTo(cx + tx - 4, cb - h * .24); x.lineTo(cx + tx + w * .03, cb - h * .3); x.lineTo(cx + tx + w * .06 + 4, cb - h * .24); x.fillStyle = '#c9506a'; x.fill(); x.fillStyle = dark ? '#1b1a2c' : '#d9cfc0'; }
    x.fillStyle = dark ? '#ffd27a' : '#6b5a7a'; x.beginPath(); x.arc(cx, cb - h * .05, w * .035, Math.PI, 0); x.fillRect(cx - w * .035, cb - h * .05, w * .07, h * .05); x.fill();
  } else if (thing === 'balloon') {
    for (let i = 0; i < 3; i++) { const bx = w * (.3 + i * .2 + rnd() * .05), by = h * (.18 + rnd() * .15); x.fillStyle = ['#e0607e', '#ffd36e', '#5aa0e8'][i]; x.beginPath(); x.ellipse(bx, by, w * .045, h * .042, 0, 0, Math.PI * 2); x.fill(); x.strokeStyle = 'rgb(0 0 0 / .3)'; x.beginPath(); x.moveTo(bx, by + h * .042); x.quadraticCurveTo(bx - 8, by + h * .1, bx, by + h * .16); x.stroke(); desc.life?.push({ k: 'sway', box: [(bx - w * .06) / w, (by - h * .05) / h, .12, .22], pivot: [bx / w, (by + h * .16) / h] }); }
  }
}

/** A pinned region, changed as the words say: recoloured, cleared, brightened, or given small additions. */
/** Whether a pin's note is scenery (a place, a setting, weather, or a sky at some hour), to be painted into the pin. */
export function isScenery(note) {
  const t = String(note || '').toLowerCase(), kinds = new Set(readVibe(note || '').map(x => x.cue.kind)), skyward = /\bsk(?:y|ies)\b/.test(t);
  return !/remove|erase|delete|get rid|clean|without/.test(t) && (kinds.has('place') || kinds.has('venue') || kinds.has('weather') || (skyward && kinds.has('time')));
}

/** Where a mask is, in a picture of w × h: its bounding box (the whole picture when the mask is empty). */
function maskBox(mask, w, h) {
  const md = ctx2d(mask).getImageData(0, 0, mask.width, mask.height).data, sx = w / mask.width, sy = h / mask.height;
  let x0 = mask.width, y0 = mask.height, x1 = -1, y1 = -1;
  for (let py = 0; py < mask.height; py += 2) for (let px = 0; px < mask.width; px += 2) if (md[(py * mask.width + px) * 4 + 3] > 100) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
  return x1 < 0 ? { x: 0, y: 0, w, h } : { x: Math.floor(x0 * sx), y: Math.floor(y0 * sy), w: Math.max(8, Math.ceil((x1 - x0 + 2) * sx)), h: Math.max(8, Math.ceil((y1 - y0 + 2) * sy)) };
}

export function regionEdit(src, mask, note, seed = 1) {
  const w = src.width, h = src.height, t = (note || '').toLowerCase(), rnd = rng(seed), edit = make(w, h), e = edit.getContext('2d');
  const colour = Object.entries(COLOUR_WORDS).find(([word]) => new RegExp('\\b' + word + '\\b').test(t))?.[1];
  // a note that names a place, a setting or weather is scenery: it is painted into the pin, the sky alone when no place was named
  const kinds = new Set(readVibe(note || '').map(x => x.cue.kind)), skyward = /\bsk(?:y|ies)\b/.test(t), placed = kinds.has('place') || kinds.has('venue'), scenic = isScenery(note);
  const motif = scenic ? null : /** @type {[string, RegExp][]} */ ([['heart', /heart|love/], ['bow', /bow|ribbon/], ['star', /star/], ['flower', /flower|blossom|daisy/], ['rose', /rose/], ['sparkle', /sparkl|glitter|shin|magic/], ['note', /music|note/], ['crown', /crown|tiara/], ['leaf', /leaf|leaves|ivy/], ['moon', /moon/]]).find(([, re]) => re.test(t))?.[0];
  if (/remove|erase|delete|get rid|clean|without/.test(t)) { e.filter = 'blur(22px) saturate(.9)'; e.drawImage(src, 0, 0); e.filter = 'none'; }
  else if (scenic) {
    const box = maskBox(mask, w, h), desc = sceneFrom(note, null, seed);
    if (skyward || !placed) desc.skyOnly = true;
    e.drawImage(src, 0, 0); e.drawImage(scene(desc, box.w, box.h), box.x, box.y);
  }
  else {
    e.drawImage(src, 0, 0);
    if (/bright|light(er)?\b|glow|sun/.test(t)) { e.globalCompositeOperation = 'screen'; e.fillStyle = 'rgb(255 236 200 / .45)'; e.fillRect(0, 0, w, h); }
    else if (/dark|shadow|night|dim/.test(t)) { e.globalCompositeOperation = 'multiply'; e.fillStyle = 'rgb(40 40 80 / .55)'; e.fillRect(0, 0, w, h); }
    if (colour) { e.globalCompositeOperation = 'color'; e.fillStyle = colour; e.fillRect(0, 0, w, h); e.globalCompositeOperation = 'soft-light'; e.globalAlpha = .4; e.fillRect(0, 0, w, h); e.globalAlpha = 1; }
    if (!colour && !motif && !/bright|light|glow|dark|shadow/.test(t)) { e.globalCompositeOperation = 'source-over'; e.filter = 'hue-rotate(' + Math.round(30 + rnd() * 300) + 'deg) saturate(1.35)'; e.drawImage(src, 0, 0); e.filter = 'none'; }
    e.globalCompositeOperation = 'source-over';
  }
  const soft = make(w, h), sc = soft.getContext('2d'); sc.filter = `blur(${Math.max(2, w / 300)}px)`; sc.drawImage(mask, 0, 0, w, h); sc.filter = 'none';
  const cut = make(w, h), cc = cut.getContext('2d'); cc.drawImage(edit, 0, 0); cc.globalCompositeOperation = 'destination-in'; cc.drawImage(soft, 0, 0);
  const out = copy(src), oc = out.getContext('2d'); oc.drawImage(cut, 0, 0);
  if (motif) {
    const md = ctx2d(mask).getImageData(0, 0, mask.width, mask.height).data, sx = w / mask.width, sy = h / mask.height, spots = [];
    for (let tries = 0; tries < 600 && spots.length < 9; tries++) { const px = Math.floor(rnd() * mask.width), py = Math.floor(rnd() * mask.height); if (md[(py * mask.width + px) * 4 + 3] > 140) spots.push([px * sx, py * sy]); }
    oc.fillStyle = colour || '#e0607e'; oc.strokeStyle = colour || '#e0607e'; oc.shadowColor = 'rgb(0 0 0 / .25)'; oc.shadowBlur = 6;
    const big = spots.length < 3 || /a |one /.test(t);
    spots.slice(0, big ? 1 : 9).forEach(([px, py]) => sticker(oc, motif, px, py, (big ? w * .16 : w * (.05 + rnd() * .05)), (rnd() - .5) * .6));
    oc.shadowBlur = 0;
  }
  return out;
}

/** The subject, kept, in front of new scenery. Without a mask the device guesses an oval around the centre. */
export function composite(subject, mask, backdrop) {
  const out = make(subject.width, subject.height), c = out.getContext('2d');
  if (backdrop) c.drawImage(backdrop, 0, 0, out.width, out.height);
  c.drawImage(cutout(subject, mask), 0, 0);
  return out;
}
/** The subject alone, kept by its outline (softened a little), or by a soft oval in the middle when there is none. */
export function cutout(subject, mask) {
  const w = subject.width, h = subject.height, m = make(w, h), mc = m.getContext('2d');
  if (mask) { mc.filter = `blur(${Math.max(1.5, w / 400)}px)`; mc.drawImage(mask, 0, 0, w, h); }
  else { const g = mc.createRadialGradient(w / 2, h * .56, Math.min(w, h) * .18, w / 2, h * .56, Math.min(w, h) * .52); g.addColorStop(0, '#000'); g.addColorStop(.7, 'rgb(0 0 0 / .85)'); g.addColorStop(1, 'rgb(0 0 0 / 0)'); mc.fillStyle = g; mc.fillRect(0, 0, w, h); }
  const cut = make(w, h), cc = cut.getContext('2d'); cc.drawImage(subject, 0, 0); cc.globalCompositeOperation = 'destination-in'; cc.drawImage(m, 0, 0);
  return cut;
}
/**
 * A mask in one piece: crumbs lying apart from the main shape (a dark corner the segmenter half-believed in) are
 * dropped, and pinholes inside it are filled. Pieces are found at a quarter of full strength, so each keeps its soft
 * edge. Works in place and returns the mask.
 * @param {HTMLCanvasElement} mask
 */
export function whole(mask) {
  const w = mask.width, h = mask.height, x = mask.getContext('2d', { willReadFrequently: true }), img = x.getImageData(0, 0, w, h), d = img.data, n = w * h;
  const label = new Int32Array(n).fill(-1), stack = new Int32Array(n), pieces = /** @type {{ inside: boolean, size: number, edge: boolean }[]} */ ([]);
  const inside = (/** @type {number} */ i) => d[i * 4 + 3] > 64;
  for (let s = 0; s < n; s++) {
    if (label[s] !== -1) continue;
    const want = inside(s), id = pieces.length; let top = 0, size = 0, edge = false;
    label[s] = id; stack[top++] = s;
    while (top) {
      const i = stack[--top], px = i % w, py = (i - px) / w; size++;
      if (px === 0 || py === 0 || px === w - 1 || py === h - 1) edge = true;
      if (px > 0 && label[i - 1] === -1 && inside(i - 1) === want) { label[i - 1] = id; stack[top++] = i - 1; }
      if (px < w - 1 && label[i + 1] === -1 && inside(i + 1) === want) { label[i + 1] = id; stack[top++] = i + 1; }
      if (py > 0 && label[i - w] === -1 && inside(i - w) === want) { label[i - w] = id; stack[top++] = i - w; }
      if (py < h - 1 && label[i + w] === -1 && inside(i + w) === want) { label[i + w] = id; stack[top++] = i + w; }
    }
    pieces.push({ inside: want, size, edge });
  }
  let biggest = 0; for (const p of pieces) if (p.inside && p.size > biggest) biggest = p.size;
  if (!biggest) return mask;
  for (let i = 0; i < n; i++) {
    const p = pieces[label[i]];
    if (p.inside && p.size < biggest * .04) d[i * 4 + 3] = 0;                     // a crumb
    else if (!p.inside && !p.edge && p.size < biggest * .02) d[i * 4 + 3] = 255;  // a pinhole
  }
  x.putImageData(img, 0, 0);
  return mask;
}
/** A plain backdrop: one colour, a little lighter in the middle, like a studio sweep. */
export function plainBackdrop(w, h, colour) {
  const c = make(w, h), x = c.getContext('2d'), g = x.createRadialGradient(w * .5, h * .38, 0, w * .5, h * .5, Math.max(w, h) * .75);
  g.addColorStop(0, mix(colour, '#ffffff', .2)); g.addColorStop(1, mix(colour, '#000000', .1)); x.fillStyle = g; x.fillRect(0, 0, w, h);
  return c;
}

/** Changes any picture can honestly take on the device, and the words for each. */
const ADJUST = /** @type {[RegExp, string, string][]} */ ([
  [/\bwarm(?:er|th|ing)?\b(?! light)/, 'warm', 'warmer'], [/\bcool(?:er|ing)?\b|\bcolder\b/, 'cool', 'cooler'],
  [/\bbright(?:er|en)?\b|\blight(?:er|en)\b/, 'bright', 'brighter'], [/\bdark(?:er|en)?\b|\bdimm?(?:er)?\b/, 'dark', 'darker'],
  [/more contrast|\bpunch(?:y|ier)\b|\bcrisp(?:er)?\b|\bstronger\b|\bbolder\b|\bsharper\b/, 'punch', 'with more punch'],
  [/less contrast|\bsoft(?:er|en)?\b|\bgentler\b|\bsubtler\b|\bflatter\b/, 'soft', 'softer'],
  [/more colou?r|\bvivid\b|\bsaturated?\b|\bcolou?rful\b|\bvibrant\b|\bricher\b/, 'vivid', 'more vivid'], [/less colou?r|\bmuted\b|desaturat|washed[- ]out|\bsubdued\b|\bpaler\b/, 'muted', 'muted'],
  [/black (?:and|&) white|\bb ?& ?w\b|monochrome|gr[ae]yscale|no colou?r/, 'mono', 'in black and white'],
]);
/** The adjustments some words ask for ("warmer and brighter", "in black and white"), or null. @param {string} text */
export function adjustmentsIn(text) {
  const t = String(text || '').toLowerCase(), ops = /** @type {string[]} */ ([]), said = /** @type {string[]} */ ([]);
  for (const [re, op, word] of ADJUST) if (re.test(t)) { ops.push(op); said.push(word); }
  return ops.length ? { ops, said } : null;
}
/** @param {HTMLCanvasElement} src @param {string[]} ops */
export function adjust(src, ops) {
  const w = src.width, h = src.height, out = make(w, h), c = out.getContext('2d');
  const f = /** @type {Record<string, string>} */ ({ bright: 'brightness(1.14)', dark: 'brightness(.84)', punch: 'contrast(1.18) saturate(1.08)', soft: 'contrast(.88) saturate(.88) brightness(1.03)', vivid: 'saturate(1.38)', muted: 'saturate(.6)', mono: 'grayscale(1) contrast(1.1)' });
  c.filter = ops.map(o => f[o]).filter(Boolean).join(' ') || 'none'; c.drawImage(src, 0, 0); c.filter = 'none';
  for (const [o, col] of [['warm', 'rgb(255 150 70 / .55)'], ['cool', 'rgb(70 140 255 / .5)']]) if (ops.includes(o)) { c.globalCompositeOperation = 'soft-light'; c.fillStyle = col; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over'; }
  return out;
}

/**
 * A profile picture: a square around the face (the middle of the outline's top, above the shoulders), the subject kept
 * by its outline on a soft backdrop in the picture's own light.
 * @param {HTMLCanvasElement} src @param {HTMLCanvasElement | null} mask
 */
export function portrait(src, mask, size = 768) {
  const { sx, sy, side } = portraitBox(src, mask), out = make(size, size), c = out.getContext('2d'), pal = paletteOf(src, 5);
  const g = c.createRadialGradient(size * .5, size * .38, size * .05, size * .5, size * .5, size * .78);
  g.addColorStop(0, mix(pal[4], '#ffffff', .45)); g.addColorStop(1, mix(pal[2], pal[1], .5)); c.fillStyle = g; c.fillRect(0, 0, size, size);
  c.drawImage(cutout(src, mask), sx, sy, side, side, 0, 0, size, size);
  return out;
}
/** Where a profile picture's square goes on a picture. @param {HTMLCanvasElement} src @param {HTMLCanvasElement | null} mask */
export function portraitBox(src, mask) {
  const w = src.width, h = src.height;
  let box = { x0: w * .2, x1: w * .8, y0: h * .1, y1: h }, cx = w / 2, head = h * .3;
  if (mask) {
    const mw = 96, mh = Math.max(1, Math.round(96 * h / w)), d = copy(mask, mw, mh).getContext('2d').getImageData(0, 0, mw, mh).data;
    let x0 = mw, x1 = -1, y0 = mh, y1 = -1;
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (d[(y * mw + x) * 4 + 3] > 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 > x0 && y1 > y0) {
      box = { x0: x0 / mw * w, x1: (x1 + 1) / mw * w, y0: y0 / mh * h, y1: (y1 + 1) / mh * h };
      // the head: from the top of the outline down to the neck, the narrowest row before the shoulders spread wider
      const rows = []; for (let y = y0; y <= y1; y++) { let a = 0; for (let x = x0; x <= x1; x++) if (d[(y * mw + x) * 4 + 3] > 128) a++; rows.push(a); }
      let widest = 0, neck = -1, narrowest = 1e9;
      for (let k = 0; k < rows.length; k++) {
        if (neck < 0 && rows[k] >= widest) widest = rows[k];
        else if (rows[k] < widest * .8 && rows[k] < narrowest) { narrowest = rows[k]; neck = k; }
        if (neck >= 0 && rows[k] > widest * 1.15) break;
      }
      head = (neck > 0 ? neck : (y1 - y0) * .45) / mh * h;
      let sum = 0, n = 0; const top = y0 + Math.max(1, Math.round(head / h * mh * .8));
      for (let y = y0; y < top; y++) for (let x = x0; x <= x1; x++) if (d[(y * mw + x) * 4 + 3] > 128) { sum += x; n++; }
      if (n) cx = (sum / n + .5) / mw * w;
    }
  }
  // head and shoulders: the head a little under half the square, with room above it
  const side = Math.min(w, h, Math.max(head * 2.2, w * .35));
  const sx = Math.max(0, Math.min(w - side, cx - side / 2)), sy = Math.max(0, Math.min(h - side, box.y0 - side * .14));
  return { sx, sy, side };
}

/** Who the picture is of, found: the room dimmed, and a light along the outline. @param {HTMLCanvasElement} src @param {HTMLCanvasElement | null} mask */
export function traced(src, mask, colour = '#fff3d6') {
  const w = src.width, h = src.height, out = copy(src), c = out.getContext('2d');
  c.fillStyle = 'rgb(12 10 8 / .5)'; c.fillRect(0, 0, w, h); c.drawImage(cutout(src, mask), 0, 0);
  if (!mask) return out;
  const ring = make(w, h), rc = ring.getContext('2d');
  rc.filter = `blur(${Math.max(2, w / 150)}px)`; rc.drawImage(mask, 0, 0, w, h); rc.drawImage(mask, 0, 0, w, h); rc.filter = 'none';
  rc.globalCompositeOperation = 'source-in'; rc.fillStyle = colour; rc.fillRect(0, 0, w, h);
  rc.globalCompositeOperation = 'destination-out'; rc.drawImage(mask, 0, 0, w, h);
  c.save(); c.shadowColor = colour; c.shadowBlur = w / 30; c.drawImage(ring, 0, 0); c.restore(); c.drawImage(ring, 0, 0);
  return out;
}
/** A picture with nothing behind it, laid on the old checkerboard so a frame of it shows what has gone. @param {HTMLCanvasElement} src */
export function checkered(src) {
  const w = src.width, h = src.height, out = make(w, h), c = out.getContext('2d'), s = Math.max(8, Math.round(w / 24));
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { c.fillStyle = Math.round((x + y) / s) % 2 ? '#d9d6d0' : '#f4f2ee'; c.fillRect(x, y, s, s); }
  c.drawImage(src, 0, 0);
  return out;
}
/** The square a profile picture will be, shown on the picture: the rest dimmed, a fine frame, a camera's thirds. */
export function squareOn(src, { sx, sy, side }) {
  const out = copy(src), c = out.getContext('2d');
  c.fillStyle = 'rgb(12 10 8 / .55)'; c.beginPath(); c.rect(0, 0, out.width, out.height); c.rect(sx, sy, side, side); c.fill('evenodd');
  c.strokeStyle = 'rgb(255 255 255 / .9)'; c.lineWidth = Math.max(2, out.width / 260); c.strokeRect(sx, sy, side, side);
  c.strokeStyle = 'rgb(255 255 255 / .35)'; c.lineWidth = 1;
  for (const k of [1, 2]) { c.beginPath(); c.moveTo(sx + side * k / 3, sy); c.lineTo(sx + side * k / 3, sy + side); c.moveTo(sx, sy + side * k / 3); c.lineTo(sx + side, sy + side * k / 3); c.stroke(); }
  return out;
}

/** Two pictures as one: a double exposure, then one shared palette. */
export function blend(a, b, seed = 1) {
  const w = a.width, h = a.height, out = copy(a), c = out.getContext('2d');
  c.globalCompositeOperation = 'screen'; c.globalAlpha = .62; c.drawImage(b, 0, 0, w, h); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  return grade(out, { ramp: paletteOf(b, 5), keep: .45, grain: .03 }, .7, seed);
}

/** Coarse previews of a finished picture, coarsest first, as a render's partial images would arrive. */
export function partials(final, steps = [10, 24, 56]) {
  return steps.map(pw => { const ph = Math.round(pw * final.height / final.width), s = copy(final, pw, ph), out = make(final.width / 2, final.height / 2), c = out.getContext('2d'); c.imageSmoothingEnabled = true; c.filter = `blur(${Math.round(out.width / pw / 1.6)}px)`; c.drawImage(s, 0, 0, out.width, out.height); return out; });
}

/** The honest mark every sketch carries, even after it is saved. */
export function stamp(c, text = 'Sketch · drawn on this device') {
  const x = c.getContext('2d'), size = Math.max(10, Math.round(c.width / 64)), pad = size * .7;
  x.font = `500 ${size}px "IBM Plex Mono", monospace`; const tw = x.measureText(text.toUpperCase()).width;
  x.fillStyle = 'rgb(0 0 0 / .42)'; x.beginPath(); x.roundRect(c.width - tw - pad * 3, c.height - size - pad * 3, tw + pad * 2, size + pad * 1.6, size); x.fill();
  x.fillStyle = 'rgb(255 255 255 / .9)'; x.textBaseline = 'top'; x.fillText(text.toUpperCase(), c.width - tw - pad * 2, c.height - size - pad * 2.2);
  return c;
}
