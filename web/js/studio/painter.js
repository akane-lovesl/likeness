/**
 * The painter on the device. It cannot render; it sketches, quickly and honestly: colour ramps, washes, halftones,
 * pixels and ink for looks, flat scenery for words, tints and stickers for pinned regions. Every sketch it makes is
 * stamped as one. It also drafts the first impression of a render while the studio paints the real thing.
 */
import { rgb, hex, mix, luminance, hsl, fromHsl } from '../core/color.js';
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
export function sceneFrom(text, ramp = null, seed = 1) {
  const t = (text || '').toLowerCase();
  const light = has(t, /night|midnight|moon|star|neon|dark/) ? 'night' : has(t, /sunset|dusk|evening|twilight/) ? 'dusk' : has(t, /dawn|sunrise|morning/) ? 'dawn' : 'day';
  const land = has(t, /sea|ocean|beach|wave|lake|harbou?r|bay|coast|river|lighthouse|boat|sail/) ? 'sea' : has(t, /mountain|alps|peak|summit|volcano/) ? 'mountains' : has(t, /city|street|tokyo|paris|town|skyline|rooftop|alley|neon/) ? 'city' : has(t, /forest|wood|jungle|pine/) ? 'forest' : 'hills';
  const inside = has(t, /room|interior|caf[eé]|library|bedroom|kitchen|studio|parlou?r|window seat|tea ?room/);
  const weather = has(t, /rain|storm|drizzle/) ? 'rain' : has(t, /snow|winter|blizzard/) ? 'snow' : has(t, /petal|sakura|cherry blossom|blossom/) ? 'petals' : '';
  const things = ['lighthouse', 'boat', 'tree', 'house', 'teacup', 'flowers', 'heart', 'castle', 'balloon'].filter(k => t.includes(k === 'flowers' ? 'flower' : k) || (k === 'flowers' && /garden|rose|tulip|meadow|bloom/.test(t)) || (k === 'castle' && /palace|tower/.test(t)));
  const colour = Object.entries(COLOUR_WORDS).find(([w]) => new RegExp('\\b' + w + '\\b').test(t))?.[1];
  return { light, land, inside, weather, things, ramp: ramp || (colour ? rampAround(colour) : null), arch: has(t, /arch|castle|palace|chapel/), seed };
}
export const COLOUR_WORDS = { red: '#c8322d', crimson: '#a5122a', scarlet: '#e0301e', pink: '#ec7fa0', rose: '#d9667f', blush: '#f2b8c6', orange: '#ec7a2c', peach: '#f6b08a', coral: '#f07560', gold: '#d6a540', golden: '#d6a540', yellow: '#f0c93a', lemon: '#f3e05a', green: '#3f8f4f', emerald: '#1f8a5c', mint: '#93d8b8', sage: '#8fa883', olive: '#7d7a32', teal: '#1f8a8a', turquoise: '#33c3c0', cyan: '#35d2e8', blue: '#2f6fdc', navy: '#1a2e6b', cobalt: '#2148b8', sky: '#7dbbf0', lavender: '#b39ddb', lilac: '#c8a2d8', purple: '#7a3ea8', violet: '#6a3fd0', plum: '#6b2a5a', magenta: '#d5248f', brown: '#7a4a2a', chocolate: '#5a3218', silver: '#b8c0cc', white: '#f4f2ee', black: '#141414', grey: '#8a8a8a', gray: '#8a8a8a', cream: '#f4ead2', ivory: '#f6f0dc', burgundy: '#6e1a2c', amber: '#e09a2a', copper: '#b8673a' };

/** A flat, poster-like scene from words. Not a render: a sketch for the idea's shape and colour. */
export function scene(desc, w = 768, h = 1024) {
  const c = make(w, h), x = c.getContext('2d'), rnd = rng(desc.seed || 7), L = desc.light, horizon = h * (desc.inside ? .62 : .6);
  const skies = { day: ['#9ccaf0', '#d8ecf7', '#fff4e2'], dawn: ['#7e9ed8', '#f2b8b0', '#ffe2bd'], dusk: ['#2a1d52', '#a8467a', '#f39a5a'], night: ['#04061a', '#15204a', '#2b3a72'] };
  let sky = skies[L];
  if (desc.ramp) sky = L === 'night' ? [desc.ramp[0], desc.ramp[1], desc.ramp[2]] : [desc.ramp[2], desc.ramp[3], desc.ramp[4]];
  const drawOutdoor = (ox, oy, ow, oh) => {
    const hz = oy + oh * .6;
    const g = x.createLinearGradient(0, oy, 0, hz); g.addColorStop(0, sky[0]); g.addColorStop(.6, sky[1]); g.addColorStop(1, sky[2]); x.fillStyle = g; x.fillRect(ox, oy, ow, oh);
    if (L === 'night') for (let i = 0; i < 160 * ow / w; i++) { x.globalAlpha = .3 + rnd() * .7; x.fillStyle = '#fff'; x.fillRect(ox + rnd() * ow, oy + rnd() * (hz - oy), rnd() < .1 ? 2 : 1, rnd() < .1 ? 2 : 1); }
    x.globalAlpha = 1;
    const sx = ox + ow * (.62 + rnd() * .2), sy = oy + (hz - oy) * (L === 'day' ? .32 : .72), sr = ow * (L === 'night' ? .07 : .1);
    const glow = x.createRadialGradient(sx, sy, sr * .4, sx, sy, sr * 4); glow.addColorStop(0, L === 'night' ? 'rgb(255 250 230 / .4)' : 'rgb(255 236 190 / .7)'); glow.addColorStop(1, 'rgb(255 236 190 / 0)');
    x.fillStyle = glow; x.fillRect(ox, oy, ow, hz - oy);
    x.fillStyle = L === 'night' ? '#f4f0dc' : L === 'dusk' ? '#ffd28a' : '#fff6da'; x.beginPath(); x.arc(sx, sy, sr, 0, Math.PI * 2); x.fill();
    if (L === 'night') { x.fillStyle = sky[1]; x.beginPath(); x.arc(sx + sr * .45, sy - sr * .2, sr * .9, 0, Math.PI * 2); x.fill(); }
    if (L !== 'night') for (let i = 0; i < 4; i++) { const cx = ox + rnd() * ow, cy = oy + (hz - oy) * (.15 + rnd() * .45), cw = ow * (.18 + rnd() * .2); x.fillStyle = 'rgb(255 255 255 / .55)'; for (let k = 0; k < 5; k++) { x.beginPath(); x.ellipse(cx + (k - 2) * cw * .22, cy + Math.sin(k) * 6, cw * .22, cw * .12, 0, 0, Math.PI * 2); x.fill(); } }
    const far = mix(sky[1], sky[2], .3), mid = mix(sky[0], '#203040', L === 'night' ? .3 : .45), near = mix(sky[0], '#101820', L === 'night' ? .55 : .7);
    if (desc.land === 'mountains') for (const [col, base, amp] of [[far, hz, .2], [mid, hz + oh * .03, .14]]) { x.fillStyle = col; x.beginPath(); x.moveTo(ox, base); let px = ox; while (px < ox + ow) { px += ow * (.06 + rnd() * .1); x.lineTo(px, base - oh * amp * (.3 + rnd() * .7)); px += ow * (.05 + rnd() * .08); x.lineTo(px, base - oh * amp * rnd() * .3); } x.lineTo(ox + ow, base); x.lineTo(ox + ow, oy + oh); x.lineTo(ox, oy + oh); x.fill(); }
    if (desc.land === 'city') { for (const [col, top, lit] of /** @type {[string, number, number][]} */ ([[far, .2, .2], [near, .12, .5]])) { let px = ox; x.fillStyle = col; while (px < ox + ow) { const bw = ow * (.06 + rnd() * .09), bh = oh * (top * .5 + rnd() * top); x.fillRect(px, hz - bh, bw, bh + oh); if (L === 'night' || L === 'dusk') { for (let wy = hz - bh + 8; wy < hz - 6; wy += 11) for (let wx = px + 4; wx < px + bw - 5; wx += 9) if (rnd() < lit) { x.fillStyle = rnd() < .5 ? '#ffd27a' : (desc.ramp ? desc.ramp[3] : '#ff7ab8'); x.fillRect(wx, wy, 4, 5); } x.fillStyle = col; } px += bw + 2; } } }
    if (desc.land === 'forest') for (let row = 0; row < 3; row++) { x.fillStyle = mix(far, near, row / 2); for (let i = 0; i < 18; i++) { const tx = ox + rnd() * ow, th = oh * (.08 + rnd() * .1) * (1 + row * .3), tb = hz + row * oh * .03; x.beginPath(); x.moveTo(tx, tb - th); x.lineTo(tx - th * .32, tb); x.lineTo(tx + th * .32, tb); x.fill(); } }
    if (desc.land === 'hills') for (let k = 0; k < 3; k++) { x.fillStyle = mix(L === 'night' ? '#1a2a3a' : '#7fa860', near, k * .3); x.beginPath(); x.moveTo(ox, oy + oh); for (let px = 0; px <= ow; px += 8) x.lineTo(ox + px, hz + k * oh * .05 - Math.sin(px / ow * Math.PI * (1.2 + k) + k * 2) * oh * .04 - oh * .02); x.lineTo(ox + ow, oy + oh); x.fill(); }
    if (desc.land === 'sea') {
      const sg = x.createLinearGradient(0, hz, 0, oy + oh); sg.addColorStop(0, mix(sky[2], '#1d4a7a', .5)); sg.addColorStop(1, mix(sky[0], '#06203a', .6)); x.fillStyle = sg; x.fillRect(ox, hz, ow, oy + oh - hz);
      x.strokeStyle = 'rgb(255 255 255 / .35)'; x.lineWidth = 1.2; for (let i = 0; i < 40; i++) { const ly = hz + Math.pow(rnd(), 1.6) * (oy + oh - hz), lw = 10 + rnd() * 40; x.globalAlpha = .2 + rnd() * .5; x.beginPath(); x.moveTo(ox + rnd() * ow, ly); x.lineTo(ox + rnd() * ow + lw, ly); x.stroke(); }
      x.globalAlpha = .5; x.fillStyle = L === 'night' ? '#f4f0dc' : '#ffe2a0'; for (let ly = hz + 4; ly < oy + oh; ly += 7) { const wv = sr * (1.4 - (ly - hz) / oh) * (.5 + rnd()); x.fillRect(sx - wv / 2, ly, wv, 2); }
      x.globalAlpha = 1;
    }
    return hz;
  };
  let hz;
  if (desc.inside) {
    const wall = desc.ramp ? desc.ramp[3] : (L === 'night' ? '#2b2440' : '#efe2cf'), floor = desc.ramp ? desc.ramp[1] : (L === 'night' ? '#1a1526' : '#b88a5e');
    x.fillStyle = wall; x.fillRect(0, 0, w, h);
    const wx = w * .2, wy = h * .12, ww = w * .6, wh = h * .42; hz = drawOutdoor(wx, wy, ww, wh);
    x.strokeStyle = mix(wall, '#000', .35); x.lineWidth = w * .022; x.strokeRect(wx, wy, ww, wh); x.lineWidth = w * .012; x.beginPath(); x.moveTo(wx + ww / 2, wy); x.lineTo(wx + ww / 2, wy + wh); x.moveTo(wx, wy + wh / 2); x.lineTo(wx + ww, wy + wh / 2); x.stroke();
    const fg = x.createLinearGradient(0, horizon, 0, h); fg.addColorStop(0, floor); fg.addColorStop(1, mix(floor, '#000', .35)); x.fillStyle = fg; x.fillRect(0, horizon, w, h - horizon);
    x.fillStyle = mix(floor, '#000', .25); x.fillRect(w * .12, horizon + h * .06, w * .76, h * .025);
    if (!desc.things.includes('teacup')) desc.things.push('teacup');
  } else hz = drawOutdoor(0, 0, w, h);

  for (const thing of desc.things) drawThing(x, thing, w, h, desc.inside ? horizon + h * .06 : hz, rnd, desc);
  if (desc.weather === 'rain') { x.strokeStyle = 'rgb(220 230 255 / .45)'; x.lineWidth = 1.2; for (let i = 0; i < 220; i++) { const rx = rnd() * w, ry = rnd() * h, rl = 14 + rnd() * 20; x.beginPath(); x.moveTo(rx, ry); x.lineTo(rx - 4, ry + rl); x.stroke(); } }
  if (desc.weather === 'snow') { x.fillStyle = 'rgb(255 255 255 / .85)'; for (let i = 0; i < 260; i++) { x.beginPath(); x.arc(rnd() * w, rnd() * h, .8 + rnd() * 2.6, 0, Math.PI * 2); x.fill(); } }
  if (desc.weather === 'petals') { for (let i = 0; i < 46; i++) { x.fillStyle = rnd() < .5 ? '#f6b6c8' : '#fbd7e1'; sticker(x, 'petal', rnd() * w, rnd() * h, 10 + rnd() * 10, rnd() * 6); } }
  if (desc.arch) { const m = make(w, h), mc = m.getContext('2d'); mc.fillStyle = desc.ramp ? desc.ramp[4] : '#f6efe2'; mc.fillRect(0, 0, w, h); mc.globalCompositeOperation = 'destination-out'; mc.beginPath(); mc.moveTo(w * .1, h); mc.lineTo(w * .1, h * .4); mc.arc(w / 2, h * .4, w * .4, Math.PI, 0); mc.lineTo(w * .9, h); mc.fill(); x.drawImage(m, 0, 0); }
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
  } else if (thing === 'teacup') {
    const cx = w * .5, cy = ground - h * .005, cw = w * .2, col = desc.ramp ? desc.ramp[4] : '#fbf6ee', trim = desc.ramp ? desc.ramp[2] : '#d9667f';
    x.fillStyle = 'rgb(0 0 0 / .18)'; x.beginPath(); x.ellipse(cx, cy + h * .012, cw * .9, h * .015, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, cw * .85, h * .014, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(cx - cw / 2, cy - h * .07); x.quadraticCurveTo(cx - cw / 2, cy, cx, cy); x.quadraticCurveTo(cx + cw / 2, cy, cx + cw / 2, cy - h * .07); x.fill();
    x.strokeStyle = col; x.lineWidth = w * .014; x.beginPath(); x.arc(cx + cw * .55, cy - h * .045, w * .03, -1.3, 1.3); x.stroke();
    x.fillStyle = trim; x.fillRect(cx - cw / 2, cy - h * .07, cw, h * .007); x.fillStyle = mix(trim, '#000', .2); x.beginPath(); x.ellipse(cx, cy - h * .07, cw / 2, h * .01, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgb(255 255 255 / .5)'; x.lineWidth = 2; for (let i = 0; i < 2; i++) { x.beginPath(); const sx = cx - 10 + i * 20; x.moveTo(sx, cy - h * .09); x.bezierCurveTo(sx - 10, cy - h * .11, sx + 10, cy - h * .13, sx, cy - h * .16); x.stroke(); }
  } else if (thing === 'flowers') {
    for (let i = 0; i < 70; i++) { const fx = rnd() * w, fy = ground + Math.pow(rnd(), .7) * (h - ground); x.fillStyle = ['#f6b6c8', '#ffd36e', '#f4f1ea', desc.ramp ? desc.ramp[3] : '#e0718b'][i % 4]; sticker(x, 'flower', fx, fy, 6 + (fy - ground) / h * 40, rnd() * 3); }
  } else if (thing === 'heart') {
    x.fillStyle = desc.ramp ? desc.ramp[2] : '#e0607e'; sticker(x, 'heart', w * .5, ground - h * .18, w * .32, 0);
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
