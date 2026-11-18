/**
 * The painter on the device. It cannot render; it sketches, quickly and honestly: colour ramps, washes, halftones,
 * pixels and ink for looks, flat scenery for words, tints and stickers for pinned regions. Every sketch it makes is
 * stamped as one. It also drafts the first impression of a render while the studio paints the real thing.
 */
import { rgb, hex, mix, luminance, hsl, fromHsl, alpha } from '../core/color.js';
import { vibeOf } from '../room/maker.js';
import { rng } from '../core/dom.js';
import { path2d } from '../room/ornaments.js';
import { rampAround } from './looks.js';

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
export function grade(src, look, strength = 1, seed = 1) {
  const w = src.width, h = src.height, out = make(w, h), c = ctx2d(out), rnd = rng(seed);
  if (look.halftone) return halftone(src, look.halftone, strength);
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
const CITY = /city|street|tokyo|paris|lisbon|\btown\b|skyline|rooftop|alley|neon|new york|london|seoul|hong kong|shibuya|downtown|cyberpunk|vienna|prague|venice|rome|berlin|madrid|barcelona|amsterdam|copenhagen|stockholm|istanbul|cairo|mumbai|shanghai|kyoto|osaka|bangkok|havana|new orleans|san francisco|los angeles|chicago|buenos aires|edinburgh|dublin/;
const FRUIT = { lemon: '#f3d23a', orange: '#f08a2a', cherr: '#c8243a', apple: '#d23a2a', olive: '#6b7a2a', peach: '#f6a07a', plum: '#6b2a5a', fig: '#5a2a4a' };
export function sceneFrom(text, ramp = null, seed = 1) {
  const t = (text || '').toLowerCase(), vibe = vibeOf(text || '');
  // the light: said outright, or the time of day the words carry, or after dark when the words are
  let light = has(t, /night|midnight|moon|star|neon|dark/) ? 'night' : has(t, /sunset|dusk|evening|twilight|golden hour/) ? 'dusk' : has(t, /dawn|sunrise|morning/) ? 'dawn' : 'day';
  if (has(t, /\bmars\b|martian|\bspace\b|planet|lunar|moon ?base|alien|galaxy|nebula|cosmos|cosmic|asteroid|starship|spaceship|rocket|\borbit/)) light = 'night';
  else if (light === 'day' && vibe) light = vibe.light === 'golden' || vibe.light === 'dusk' ? 'dusk' : vibe.light === 'dawn' ? 'dawn' : vibe.light === 'night' || (vibe.dark && vibe.light !== 'day') ? 'night' : 'day';
  const land = has(t, /underwater|under the sea|beneath the (?:waves|sea)|deep sea|ocean floor|seabed|aquarium|coral reef|submarine|abyss/) ? 'under'
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
  if (!inside && land === 'sea' && has(t, /\bkoi\b|goldfish|\bfish\b|carp/)) things.push('koi');
  if (!inside && has(t, /\bgrove\b|orchard|(?:lemon|orange|olive|apple|cherry|peach|fig) trees?|citrus/)) things.push('grove');
  if (!inside && has(t, /tree ?house/)) things.push('treehouse');
  if (!inside && (land === 'sea' || land === 'desert') && has(t, /\bpalms?\b|tropic|island|lagoon|hawaii|caribbean|maldives|tiki|bali|oasis/)) things.push('palm');
  const colour = Object.entries(COLOUR_WORDS).find(([w]) => new RegExp('\\b' + w + '\\b').test(t))?.[1];
  // colour words alone make a ramp; words the room maker knows bring a whole palette instead (pal)
  return { light, land, inside, weather, things, ramp: ramp || (!vibe && colour ? rampAround(colour) : null), arch: has(t, /arch|castle|palace|chapel/), seed, pal: vibe?.colors || null, marks: vibe?.marks || [], props, shelf, sign: sign.toUpperCase(),
    fruit: Object.entries(FRUIT).find(([k]) => t.includes(k))?.[1] || null, frozen: has(t, /frozen|\bicy\b|\bice\b|glacier|arctic|polar/), skyline: land === 'sea' && (props.includes('neon') || has(t, CITY)) };
}
export const COLOUR_WORDS = { red: '#c8322d', crimson: '#a5122a', scarlet: '#e0301e', pink: '#ec7fa0', rose: '#d9667f', blush: '#f2b8c6', orange: '#ec7a2c', peach: '#f6b08a', coral: '#f07560', gold: '#d6a540', golden: '#d6a540', yellow: '#f0c93a', lemon: '#f3e05a', green: '#3f8f4f', emerald: '#1f8a5c', mint: '#93d8b8', sage: '#8fa883', olive: '#7d7a32', teal: '#1f8a8a', turquoise: '#33c3c0', cyan: '#35d2e8', blue: '#2f6fdc', navy: '#1a2e6b', cobalt: '#2148b8', sky: '#7dbbf0', lavender: '#b39ddb', lilac: '#c8a2d8', purple: '#7a3ea8', violet: '#6a3fd0', plum: '#6b2a5a', magenta: '#d5248f', brown: '#7a4a2a', chocolate: '#5a3218', silver: '#b8c0cc', white: '#f4f2ee', black: '#141414', grey: '#8a8a8a', gray: '#8a8a8a', cream: '#f4ead2', ivory: '#f6f0dc', burgundy: '#6e1a2c', amber: '#e09a2a', copper: '#b8673a' };

/** A flat, poster-like scene from words. Not a render: a sketch for the idea's shape and colour. */
export function scene(desc, w = 768, h = 1024) {
  const c = make(w, h), x = c.getContext('2d'), rnd = rng(desc.seed || 7), L = desc.light, horizon = h * (desc.inside ? .62 : .6);
  const skies = { day: ['#9ccaf0', '#d8ecf7', '#fff4e2'], dawn: ['#7e9ed8', '#f2b8b0', '#ffe2bd'], dusk: ['#2a1d52', '#a8467a', '#f39a5a'], night: ['#04061a', '#15204a', '#2b3a72'] };
  let sky = skies[L];
  if (desc.ramp) sky = L === 'night' ? [desc.ramp[0], desc.ramp[1], desc.ramp[2]] : [desc.ramp[2], desc.ramp[3], desc.ramp[4]];
  else if (desc.pal) {
    // the words' own colours wash the sky: neon over a night city, azulejo blue over a Lisbon morning
    const p = desc.pal, tint = L === 'night' ? [mix(p.ground, '#000000', .2), p.ground2, mix(p.ground2, p.accent, .4)]
      : L === 'dusk' ? [mix(p.ground2, p.accent2, .35), mix(p.accent, '#ffffff', .35), mix(p.accent2, '#ffffff', .4)]
      : L === 'dawn' ? [mix(p.accent2, '#ffffff', .5), mix(p.accent, '#ffffff', .7), mix(p.ground, '#ffffff', .3)]
      : [mix(p.accent, '#ffffff', .55), mix(p.accent, '#ffffff', .8), mix(p.ground, '#ffffff', .4)];
    sky = sky.map((s, i) => mix(s, tint[i], .55));
  }
  if (desc.weather === 'rain' && L !== 'night') sky = sky.map(s => mix(s, '#7d8796', .42));
  const props = desc.props || [], pal = desc.pal;
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
      return floorY;
    }
    if (desc.land === 'space') {
      // a black sky thick with stars, a ringed planet hanging low, the ground of somewhere else
      x.fillStyle = mix(pal ? pal.ground : '#05060f', '#000000', .65); x.fillRect(ox, oy, ow, oh);
      const nb = x.createRadialGradient(ox + ow * .3, oy + oh * .25, 0, ox + ow * .3, oy + oh * .25, ow * .7); nb.addColorStop(0, alpha(pal ? pal.accent2 : '#7a3ea8', .3)); nb.addColorStop(1, alpha(pal ? pal.accent2 : '#7a3ea8', 0)); x.fillStyle = nb; x.fillRect(ox, oy, ow, oh);
      for (let i = 0; i < 260 * ow / w; i++) { x.globalAlpha = .3 + rnd() * .7; x.fillStyle = '#ffffff'; const s = rnd() < .08 ? 2 : 1; x.fillRect(ox + rnd() * ow, oy + rnd() * oh * .8, s, s); }
      x.globalAlpha = 1;
      const pr = ow * .15, pcx = ox + ow * .68, pcy = oy + oh * .3, pc = pal ? pal.accent : '#d9824a', pg = x.createLinearGradient(pcx - pr, pcy - pr, pcx + pr, pcy + pr);
      pg.addColorStop(0, mix(pc, '#ffffff', .35)); pg.addColorStop(1, mix(pc, '#000000', .6)); x.fillStyle = pg; x.beginPath(); x.arc(pcx, pcy, pr, 0, Math.PI * 2); x.fill();
      x.strokeStyle = alpha(mix(pc, '#ffffff', .55), .75); x.lineWidth = Math.max(2, ow * .01); x.beginPath(); x.ellipse(pcx, pcy, pr * 1.75, pr * .32, -.35, 0, Math.PI * 2); x.stroke();
      const gy = oy + oh * .76, gc = pal ? mix(pal.accent2, '#3a1a10', .5) : '#7a3a22';
      x.fillStyle = gc; x.beginPath(); x.moveTo(ox, oy + oh); for (let q = 0; q <= ow; q += 8) x.lineTo(ox + q, gy - Math.sin(q / ow * 5 + 1) * oh * .025); x.lineTo(ox + ow, oy + oh); x.fill();
      for (let i = 0; i < 7; i++) { const cx = ox + rnd() * ow, cy = gy + oh * (.05 + rnd() * .15), cr = ow * (.02 + rnd() * .05); x.fillStyle = mix(gc, '#000000', .3); x.beginPath(); x.ellipse(cx, cy, cr, cr * .3, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = mix(gc, '#ffffff', .12); x.beginPath(); x.ellipse(cx, cy + cr * .06, cr * .8, cr * .2, 0, 0, Math.PI); x.fill(); }
      return gy;
    }
    const hz = oy + oh * .6;
    const g = x.createLinearGradient(0, oy, 0, hz); g.addColorStop(0, sky[0]); g.addColorStop(.6, sky[1]); g.addColorStop(1, sky[2]); x.fillStyle = g; x.fillRect(ox, oy, ow, oh);
    if (L === 'night') for (let i = 0; i < 160 * ow / w; i++) { x.globalAlpha = .3 + rnd() * .7; x.fillStyle = '#fff'; x.fillRect(ox + rnd() * ow, oy + rnd() * (hz - oy), rnd() < .1 ? 2 : 1, rnd() < .1 ? 2 : 1); }
    x.globalAlpha = 1;
    const sx = ox + ow * (.62 + rnd() * .2), sy = oy + (hz - oy) * (L === 'day' ? .32 : .72), sr = ow * (L === 'night' ? .07 : .1);
    if (desc.weather !== 'rain') {
    const glow = x.createRadialGradient(sx, sy, sr * .4, sx, sy, sr * 4); glow.addColorStop(0, L === 'night' ? 'rgb(255 250 230 / .4)' : 'rgb(255 236 190 / .7)'); glow.addColorStop(1, 'rgb(255 236 190 / 0)');
    x.fillStyle = glow; x.fillRect(ox, oy, ow, hz - oy);
    x.fillStyle = L === 'night' ? '#f4f0dc' : L === 'dusk' ? '#ffd28a' : '#fff6da'; x.beginPath(); x.arc(sx, sy, sr, 0, Math.PI * 2); x.fill();
    if (L === 'night') { x.fillStyle = sky[1]; x.beginPath(); x.arc(sx + sr * .45, sy - sr * .2, sr * .9, 0, Math.PI * 2); x.fill(); }
    }
    if (L !== 'night') for (let i = 0; i < 4; i++) { const cx = ox + rnd() * ow, cy = oy + (hz - oy) * (.15 + rnd() * .45), cw = ow * (.18 + rnd() * .2); x.fillStyle = desc.weather === 'rain' ? 'rgb(120 128 142 / .55)' : 'rgb(255 255 255 / .55)'; for (let k = 0; k < 5; k++) { x.beginPath(); x.ellipse(cx + (k - 2) * cw * .22, cy + Math.sin(k) * 6, cw * .22, cw * .12, 0, 0, Math.PI * 2); x.fill(); } }
    const far = mix(sky[1], sky[2], .3), mid = mix(sky[0], '#203040', L === 'night' ? .3 : .45), near = mix(sky[0], '#101820', L === 'night' ? .55 : .7);
    if (desc.land === 'mountains') for (const [col, base, amp] of [[far, hz, .2], [mid, hz + oh * .03, .14]]) { x.fillStyle = col; x.beginPath(); x.moveTo(ox, base); let px = ox; while (px < ox + ow) { px += ow * (.06 + rnd() * .1); x.lineTo(px, base - oh * amp * (.3 + rnd() * .7)); px += ow * (.05 + rnd() * .08); x.lineTo(px, base - oh * amp * rnd() * .3); } x.lineTo(ox + ow, base); x.lineTo(ox + ow, oy + oh); x.lineTo(ox, oy + oh); x.fill(); }
    if (desc.land === 'city') {
      // a painted town by day (facades in the words' colours), lit windows after dark
      const faces = pal && L !== 'night' ? [mix(pal.ground, '#ffffff', .15), mix(pal.accent2, '#ffffff', .5), mix(pal.accent, '#ffffff', .6), mix(pal.ground2, '#ffffff', .2), mix(pal.accent2, '#ffffff', .72)] : null;
      for (const [row, col, top, lit] of /** @type {[number, string, number, number][]} */ ([[0, far, .2, .2], [1, near, .12, .5]])) {
        let px = ox;
        while (px < ox + ow) {
          const bw = ow * (.06 + rnd() * .09), bh = oh * (top * .5 + rnd() * top), face = row && faces ? faces[Math.floor(rnd() * faces.length)] : col;
          x.fillStyle = face; x.fillRect(px, hz - bh, bw, bh + oh);
          if (L === 'night' || L === 'dusk') { for (let wy = hz - bh + 8; wy < hz - 6; wy += 11) for (let wx = px + 4; wx < px + bw - 5; wx += 9) if (rnd() < lit) { x.fillStyle = rnd() < .5 ? '#ffd27a' : (desc.ramp ? desc.ramp[3] : pal ? pal.accent2 : '#ff7ab8'); x.fillRect(wx, wy, 4, 5); } }
          else if (face !== col) {
            const cw = Math.max(4, ow * .012), ch = Math.max(6, oh * .024); x.fillStyle = mix(face, '#26323f', .5);
            for (let wy = hz - bh + ch; wy < hz + oh * .3 - ch; wy += ch * 2) for (let wx = px + cw; wx < px + bw - cw * 1.5; wx += cw * 2.2) x.fillRect(wx, wy, cw, ch);
            x.fillStyle = mix(face, '#000000', .2); x.fillRect(px, hz - bh, bw, Math.max(2, oh * .008));
          }
          px += bw + 2;
        }
      }
      if (props.includes('neon')) for (let i = 0; i < 4; i++) {
        // signs stacked up the buildings, glowing in the words' own colours
        const col = i % 2 ? (pal?.accent2 || '#35e8ff') : (pal?.accent || '#ff3fa4'), sw = ow * (.03 + rnd() * .02), sh = oh * (.07 + rnd() * .07), sx2 = ox + ow * (.06 + i * .24 + rnd() * .08), sy2 = hz - oh * (.1 + rnd() * .12);
        neon(col, () => { x.lineWidth = Math.max(1.5, ow * .005); x.beginPath(); x.roundRect(sx2, sy2, sw, sh, sw * .3); x.stroke(); for (let k = 0; k < 3; k++) x.fillRect(sx2 + sw * .3, sy2 + sh * (.2 + k * .25), sw * .4, Math.max(1.5, sh * .07)); }, ow * .035);
      }
    }
    if (desc.land === 'desert') {
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
      x.fillStyle = mix(far, rowB, .5); x.beginPath(); x.moveTo(ox, hz); for (let px = 0; px <= ow; px += 10) x.lineTo(ox + px, hz - oh * (.02 + .015 * Math.sin(px / ow * 7 + rnd()))); x.lineTo(ox + ow, hz); x.fill();
      x.fillStyle = mix(rowB, near, .35); x.fillRect(ox, hz, ow, oy + oh - hz);
      for (let i = 0; i < n; i++) {
        const a = ox - ow + (i / n) * ow * 3, b = a + ow * 3 / n * .62, top = (/** @type {number} */ v) => vx + (v - vx) * .02;
        x.fillStyle = mix(rowA, '#000000', L === 'night' ? .55 : .05 + (i % 2) * .08);
        x.beginPath(); x.moveTo(top(a), hz); x.lineTo(top(b), hz); x.lineTo(b, oy + oh); x.lineTo(a, oy + oh); x.fill();
        x.fillStyle = mix(rowA, '#ffffff', L === 'night' ? .05 : .3);
        for (let k = 0; k < 26; k++) { const f = Math.pow(rnd(), 1.7), cx = top((a + b) / 2) + ((a + b) / 2 - top((a + b) / 2)) * f + (rnd() - .5) * (b - a) * f * .7, cy = hz + (oy + oh - hz) * f; x.beginPath(); x.arc(cx, cy, .6 + f * w * .006, 0, Math.PI * 2); x.fill(); }
      }
    }
    if (desc.land === 'hills') for (let k = 0; k < 3; k++) { x.fillStyle = mix(L === 'night' ? '#1a2a3a' : desc.pal ? mix('#7fa860', desc.pal.accent2, .2) : '#7fa860', near, k * .3); x.beginPath(); x.moveTo(ox, oy + oh); for (let px = 0; px <= ow; px += 8) x.lineTo(ox + px, hz + k * oh * .05 - Math.sin(px / ow * Math.PI * (1.2 + k) + k * 2) * oh * .04 - oh * .02); x.lineTo(ox + ow, oy + oh); x.fill(); }
    if (desc.land === 'sea' && desc.skyline) {
      // a town across the water, lit after dark
      const tone = mix(far, near, .45); let px = ox;
      while (px < ox + ow) { const bw = ow * (.03 + rnd() * .06), bh = oh * (.03 + rnd() * .11); x.fillStyle = tone; x.fillRect(px, hz - bh, bw, bh + 1); if (L === 'night' || L === 'dusk') for (let wy = hz - bh + 4; wy < hz - 3; wy += 6) for (let wx = px + 2; wx < px + bw - 3; wx += 5) if (rnd() < .35) { x.fillStyle = rnd() < .5 ? '#ffd27a' : pal ? (rnd() < .5 ? pal.accent : pal.accent2) : '#ff7ab8'; x.fillRect(wx, wy, 2, 3); } px += bw + 1; }
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
      x.globalAlpha = .5; x.fillStyle = L === 'night' ? '#f4f0dc' : '#ffe2a0'; for (let ly = hz + 4; ly < oy + oh; ly += 7) { const wv = sr * (1.4 - (ly - hz) / oh) * (.5 + rnd()); x.fillRect(sx - wv / 2, ly, wv, 2); }
      x.globalAlpha = 1;
      if (props.includes('neon')) for (let i = 0; i < 7; i++) {
        // neon from across the water, drawn down the surface
        const col = i % 2 ? (pal?.accent2 || '#35e8ff') : (pal?.accent || '#ff3fa4'), rx = ox + ow * (.05 + rnd() * .9), len = oh * (.08 + rnd() * .22);
        x.globalAlpha = .5; neon(col, () => { for (let ly = hz + 3; ly < hz + len; ly += 5) x.fillRect(rx - 1 + Math.sin(ly * .3) * 2, ly, 3 + rnd() * 4, 2); }, ow * .02); x.globalAlpha = 1;
      }
      }
    }
    if (props.includes('neon') && desc.sign && !desc.inside && desc.land !== 'city') {
      // a sign on a pole by the road, saying what the place is, an arrow pointing the way in
      const c1 = pal?.accent || '#ff3fa4', c2 = pal?.accent2 || '#35e8ff', px0 = ox + ow * .76, base = hz + oh * .16, top = hz - oh * .2, sw = ow * .3, sh = oh * .085;
      x.fillStyle = mix(near, '#000000', .35); x.fillRect(px0 - ow * .007, top, ow * .014, base - top);
      x.fillStyle = mix(near, '#000000', .5); x.beginPath(); x.roundRect(px0 - sw / 2, top - sh, sw, sh, sh * .25); x.fill();
      neon(c2, () => { x.lineWidth = Math.max(1.5, ow * .006); x.beginPath(); x.roundRect(px0 - sw / 2 + 3, top - sh + 3, sw - 6, sh - 6, sh * .2); x.stroke(); }, ow * .03);
      const word = desc.sign; x.font = '800 ' + Math.round(Math.min(sh * .55, sw * 1.5 / Math.max(3, word.length))) + 'px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      neon(c1, () => x.fillText(word, px0, top - sh / 2 + 1), ow * .04);
      neon(c1, () => { x.lineWidth = Math.max(2, ow * .008); x.beginPath(); x.moveTo(px0 + sw * .3, top + oh * .03); x.lineTo(px0 - sw * .1, top + oh * .03); x.lineTo(px0 - sw * .1, top + oh * .09); x.moveTo(px0 - sw * .1 - ow * .025, top + oh * .065); x.lineTo(px0 - sw * .1, top + oh * .095); x.lineTo(px0 - sw * .1 + ow * .025, top + oh * .065); x.stroke(); }, ow * .03);
    }
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
      } else neon(c1, () => sticker(x, desc.marks?.[1] || 'notes', w * .1, h * .26, w * .1, -.2), w * .04);
      neon(c2, () => sticker(x, desc.marks?.[0] || 'star', w * .9, h * .26, w * .1, .2), w * .04);
    }
    const wx = w * .2, wy = h * .12, ww = w * .6, wh = h * .42; win = [wx, wy, ww, wh]; hz = drawOutdoor(wx, wy, ww, wh);
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
    if (!desc.things.some(k => k === 'teacup' || k === 'glass')) desc.things.push('teacup');
    if (props.includes('mirrorball')) {
      // a mirror ball, and the light it throws all over the room
      const bx = w * .5, by = h * .1, br = w * .07;
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
    }
  } else hz = drawOutdoor(0, 0, w, h);

  for (const thing of desc.things) drawThing(x, thing, w, h, desc.inside ? horizon + h * .06 : hz, rnd, desc);
  x.save();
  if (win) { x.beginPath(); x.rect(win[0], win[1], win[2], win[3]); x.clip(); } // indoors, the weather stays outside the window
  if (desc.weather === 'rain') { x.strokeStyle = L === 'night' ? 'rgb(220 230 255 / .45)' : 'rgb(60 70 95 / .35)'; x.lineWidth = 1.2; for (let i = 0; i < 220; i++) { const rx = rnd() * w, ry = rnd() * h, rl = 14 + rnd() * 20; x.beginPath(); x.moveTo(rx, ry); x.lineTo(rx - 4, ry + rl); x.stroke(); } }
  if (desc.weather === 'snow') { x.fillStyle = 'rgb(255 255 255 / .85)'; for (let i = 0; i < 260; i++) { x.beginPath(); x.arc(rnd() * w, rnd() * h, .8 + rnd() * 2.6, 0, Math.PI * 2); x.fill(); } }
  if (desc.weather === 'petals') { for (let i = 0; i < 46; i++) { x.fillStyle = rnd() < .5 ? '#f6b6c8' : '#fbd7e1'; sticker(x, 'petal', rnd() * w, rnd() * h, 10 + rnd() * 10, rnd() * 6); } }
  if (win && desc.weather === 'rain') for (let i = 0; i < 26; i++) { const dx = win[0] + rnd() * win[2], dy = win[1] + rnd() * win[3], dr = 1.5 + rnd() * w * .006; x.fillStyle = 'rgb(255 255 255 / .25)'; x.beginPath(); x.arc(dx, dy, dr, 0, Math.PI * 2); x.fill(); x.fillStyle = 'rgb(255 255 255 / .6)'; x.beginPath(); x.arc(dx - dr * .3, dy - dr * .3, dr * .3, 0, Math.PI * 2); x.fill(); }
  x.restore();
  if (desc.arch) { const m = make(w, h), mc = m.getContext('2d'); mc.fillStyle = desc.ramp ? desc.ramp[4] : desc.pal ? desc.pal.ground : '#f6efe2'; mc.fillRect(0, 0, w, h); mc.globalCompositeOperation = 'destination-out'; mc.beginPath(); mc.moveTo(w * .1, h); mc.lineTo(w * .1, h * .4); mc.arc(w / 2, h * .4, w * .4, Math.PI, 0); mc.lineTo(w * .9, h); mc.fill(); x.drawImage(m, 0, 0); }
  const grainy = x.getImageData(0, 0, w, h), gd = grainy.data;
  for (let i = 0; i < gd.length; i += 4) { const n = (rnd() - .5) * 14; gd[i] += n; gd[i + 1] += n; gd[i + 2] += n; }
  x.putImageData(grainy, 0, 0);
  vignette(c, .35);
  return c;
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
    const beam = x.createLinearGradient(bx, 0, w, 0); beam.addColorStop(0, 'rgb(255 236 170 / .55)'); beam.addColorStop(1, 'rgb(255 236 170 / 0)'); x.fillStyle = beam; x.beginPath(); x.moveTo(bx, top - h * .018); x.lineTo(w, top - h * .1); x.lineTo(w, top + h * .05); x.fill();
  } else if (thing === 'boat') {
    const bx = w * .66, by = ground + h * .1; x.fillStyle = ink; x.beginPath(); x.moveTo(bx - w * .1, by); x.lineTo(bx + w * .1, by); x.lineTo(bx + w * .07, by + h * .025); x.lineTo(bx - w * .07, by + h * .025); x.fill();
    x.fillStyle = '#f6efe0'; x.beginPath(); x.moveTo(bx, by - h * .14); x.lineTo(bx, by - h * .01); x.lineTo(bx + w * .08, by - h * .01); x.fill(); x.fillStyle = '#e8d7bd'; x.beginPath(); x.moveTo(bx - 3, by - h * .12); x.lineTo(bx - 3, by - h * .01); x.lineTo(bx - w * .06, by - h * .01); x.fill();
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
    x.strokeStyle = 'rgb(255 255 255 / .5)'; x.lineWidth = 2; for (let i = 0; i < 2; i++) { x.beginPath(); const sx = cx - 10 + i * 20; x.moveTo(sx, cy - h * .09); x.bezierCurveTo(sx - 10, cy - h * .11, sx + 10, cy - h * .13, sx, cy - h * .16); x.stroke(); }
  } else if (thing === 'flowers') {
    for (let i = 0; i < 70; i++) { const fx = rnd() * w, fy = ground + Math.pow(rnd(), .7) * (h - ground); x.fillStyle = ['#f6b6c8', '#ffd36e', '#f4f1ea', desc.ramp ? desc.ramp[3] : desc.pal ? desc.pal.accent : '#e0718b'][i % 4]; sticker(x, 'flower', fx, fy, 6 + (fy - ground) / h * 40, rnd() * 3); }
  } else if (thing === 'heart') {
    x.fillStyle = desc.ramp ? desc.ramp[2] : desc.pal ? desc.pal.accent : '#e0607e'; sticker(x, 'heart', w * .5, ground - h * .18, w * .32, 0);
  } else if (thing === 'castle') {
    const cx = w * .5, cb = ground, cw = w * .34; x.fillStyle = dark ? '#1b1a2c' : '#d9cfc0';
    x.fillRect(cx - cw / 2, cb - h * .16, cw, h * .16); for (const tx of [-cw / 2, cw / 2 - w * .06]) { x.fillRect(cx + tx, cb - h * .24, w * .06, h * .24); x.beginPath(); x.moveTo(cx + tx - 4, cb - h * .24); x.lineTo(cx + tx + w * .03, cb - h * .3); x.lineTo(cx + tx + w * .06 + 4, cb - h * .24); x.fillStyle = '#c9506a'; x.fill(); x.fillStyle = dark ? '#1b1a2c' : '#d9cfc0'; }
    x.fillStyle = dark ? '#ffd27a' : '#6b5a7a'; x.beginPath(); x.arc(cx, cb - h * .05, w * .035, Math.PI, 0); x.fillRect(cx - w * .035, cb - h * .05, w * .07, h * .05); x.fill();
  } else if (thing === 'balloon') {
    for (let i = 0; i < 3; i++) { const bx = w * (.3 + i * .2 + rnd() * .05), by = h * (.18 + rnd() * .15); x.fillStyle = ['#e0607e', '#ffd36e', '#5aa0e8'][i]; x.beginPath(); x.ellipse(bx, by, w * .045, h * .042, 0, 0, Math.PI * 2); x.fill(); x.strokeStyle = 'rgb(0 0 0 / .3)'; x.beginPath(); x.moveTo(bx, by + h * .042); x.quadraticCurveTo(bx - 8, by + h * .1, bx, by + h * .16); x.stroke(); }
  }
}

/** A pinned region, changed as the words say: recoloured, cleared, brightened, or given small additions. */
export function regionEdit(src, mask, note, seed = 1) {
  const w = src.width, h = src.height, t = (note || '').toLowerCase(), rnd = rng(seed), edit = make(w, h), e = edit.getContext('2d');
  const colour = Object.entries(COLOUR_WORDS).find(([word]) => new RegExp('\\b' + word + '\\b').test(t))?.[1];
  const motif = /** @type {[string, RegExp][]} */ ([['heart', /heart|love/], ['bow', /bow|ribbon/], ['star', /star/], ['flower', /flower|blossom|daisy/], ['rose', /rose/], ['sparkle', /sparkl|glitter|shin|magic/], ['note', /music|note/], ['crown', /crown|tiara/], ['leaf', /leaf|leaves|ivy/], ['moon', /moon/]]).find(([, re]) => re.test(t))?.[0];
  if (/remove|erase|delete|get rid|clean|without/.test(t)) { e.filter = 'blur(22px) saturate(.9)'; e.drawImage(src, 0, 0); e.filter = 'none'; }
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
  const w = subject.width, h = subject.height, out = make(w, h), c = out.getContext('2d');
  c.drawImage(backdrop, 0, 0, w, h);
  const m = make(w, h), mc = m.getContext('2d');
  if (mask) { mc.filter = `blur(${Math.max(1.5, w / 400)}px)`; mc.drawImage(mask, 0, 0, w, h); }
  else { const g = mc.createRadialGradient(w / 2, h * .56, Math.min(w, h) * .18, w / 2, h * .56, Math.min(w, h) * .52); g.addColorStop(0, '#000'); g.addColorStop(.7, 'rgb(0 0 0 / .85)'); g.addColorStop(1, 'rgb(0 0 0 / 0)'); mc.fillStyle = g; mc.fillRect(0, 0, w, h); }
  const cut = make(w, h), cc = cut.getContext('2d'); cc.drawImage(subject, 0, 0); cc.globalCompositeOperation = 'destination-in'; cc.drawImage(m, 0, 0);
  c.drawImage(cut, 0, 0);
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
