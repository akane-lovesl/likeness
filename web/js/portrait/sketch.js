/**
 * A study, drawn on this device in a moment: the photograph worked in a style's manner and palette (washes and ink,
 * flat cels, halftone dots, a woodblock's few flat colours). It is what the showcase can honestly make, what a live
 * studio shows at once while the real portrait is being painted, and what the tune step previews a palette with.
 * It is always labelled a sketch, never passed off as a render.
 */

/** @typedef {import('./styles.js').Style} Style @typedef {import('./styles.js').Picks} Picks */

const make = (/** @type {number} */ w, /** @type {number} */ h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const ctx2 = (/** @type {HTMLCanvasElement} */ c) => /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true }));
const hex = (/** @type {string} */ s) => { const n = parseInt(s.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lum = (/** @type {number[]} */ c) => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];

/** How each style is worked: blend of the palette ramp, flat steps, ink, dots, bloom, softness, vignette. */
const MANNER = {
  princess: { keep: true, sat: 1.12, steps: 7, ramp: .34, ink: .32, inkColor: '#a8446a', dots: 0, bloom: .42, soft: 1, vignette: .5, light: true, ends: ['#5b2a3c', '#fff6f8'], lift: .07 },
  storybook: { keep: true, sat: .95, steps: 6, ramp: .3, ink: .6, inkColor: '#3b3326', dots: 0, bloom: .12, soft: 1, vignette: .55, light: true, ends: ['#2e3a2c', '#fffcf3'], lift: .2, paper: true },
  anime: { keep: true, sat: 1.35, steps: 4, ramp: .22, ink: .7, dots: 0, bloom: .25, soft: 0, vignette: 0, ends: ['#16244a', '#ffffff'], lift: .05 },
  oil: { keep: true, sat: .85, steps: 0, ramp: .45, ink: 0, dots: 0, bloom: .2, soft: 2, vignette: .78, ends: ['#140c06', '#f4e2b8'], lift: 0, contrast: 1.25 },
  neon: { ramp: .88, steps: 0, ink: .2, dots: 0, bloom: .55, soft: 0, vignette: .5, ends: ['#07040f', '#f3edff'], lift: 0 },
  pop: { ramp: 1, steps: 3, ink: 1, dots: 1, bloom: 0, soft: 1, vignette: 0, ends: ['#121212', '#ffffff'], lift: 0 },
  woodblock: { ramp: .85, steps: 4, ink: .8, dots: 0, bloom: 0, soft: 1, vignette: .05, ends: ['#1f2a44', '#f4ebd9'], lift: 0, paper: true },
  clay: { keep: true, sat: 1.18, steps: 5, ramp: .3, ink: .12, inkColor: '#7a5a64', dots: 0, bloom: .28, soft: 3, vignette: .35, light: true, ends: ['#3a2e4a', '#fffaf6'], lift: .12 },
  own: { keep: true, sat: 1, steps: 5, ramp: .15, ink: .5, dots: 0, bloom: .15, soft: 1, vignette: .2, ends: ['#1d1915', '#fbf8f2'], lift: .05 },
};

/** The ramp a palette makes, darkest to lightest, with the style's own ends. @param {string[]} swatch @param {string[]} ends */
function rampOf(swatch, ends) {
  const stops = [hex(ends[0]), ...swatch.map(hex).sort((a, b) => lum(a) - lum(b)), hex(ends[1])];
  const out = new Uint8ClampedArray(256 * 3);
  for (let v = 0; v < 256; v++) {
    const t = v / 255 * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
    for (let k = 0; k < 3; k++) out[v * 3 + k] = stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f;
  }
  return out;
}

/** Draws a picture into a canvas of the given shape, cropped to fill it, a little above centre (where a face is). */
function framed(/** @type {CanvasImageSource & { width: number, height: number }} */ src, /** @type {number} */ w, /** @type {number} */ h) {
  const c = make(w, h), x = ctx2(c), sw = src.width, sh = src.height, s = Math.max(w / sw, h / sh);
  const dw = sw * s, dh = sh * s;
  x.drawImage(src, (w - dw) / 2, Math.min(0, (h - dh) * .35), dw, dh);
  return c;
}
/** A softened copy, by drawing small and back (works where canvas filters do not). */
function softened(/** @type {HTMLCanvasElement} */ c, /** @type {number} */ k) {
  if (!k) return c;
  const w = Math.max(8, Math.round(c.width / (1 + k * 1.6))), h = Math.max(8, Math.round(c.height / (1 + k * 1.6)));
  const small = make(w, h); ctx2(small).drawImage(c, 0, 0, w, h);
  const out = make(c.width, c.height), x = ctx2(out); x.imageSmoothingQuality = 'high'; x.drawImage(small, 0, 0, c.width, c.height);
  return out;
}

/**
 * The study itself.
 * @param {CanvasImageSource & { width: number, height: number }} src the photograph
 * @param {Style | null} style null for a style of one's own
 * @param {Picks | null} picks
 * @param {{ width?: number, aspect?: string }} [o]
 * @returns {HTMLCanvasElement}
 */
export function study(src, style, picks, { width = 360, aspect = 'portrait' } = {}) {
  const w = width, h = Math.round(width * (aspect === 'square' ? 1 : aspect === 'tall' ? 16 / 9 : 3 / 2));
  const m = MANNER[style?.id || 'own'] || MANNER.own;
  const palette = style?.tune.palette.find(p => p.id === picks?.palette) || style?.tune.palette[0];
  const ramp = rampOf(palette?.swatch || ['#8a8a8a'], m.ends);
  const base = softened(framed(src, w, h), m.soft), x = ctx2(base);
  const img = x.getImageData(0, 0, w, h), d = img.data, L = new Float32Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) L[p] = lum([d[i], d[i + 1], d[i + 2]]);
  // contrast stretched to the picture's own range, so a dim photo still finds the whole palette
  let lo = 255, hi = 0; for (let p = 0; p < L.length; p += 7) { lo = Math.min(lo, L[p]); hi = Math.max(hi, L[p]); }
  const span = Math.max(24, hi - lo);
  const contrast = m.contrast || 1;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let v = ((L[p] - lo) / span - .5) * contrast * 255 + 127.5;
    if (m.steps) v = Math.round(Math.max(0, Math.min(255, v)) / 255 * (m.steps - 1)) / (m.steps - 1) * 255;
    v = Math.max(0, Math.min(255, v)) | 0;
    for (let k = 0; k < 3; k++) {
      // the photo's own colour moved onto the new light (flat where the style steps it), or left as it was
      let c = m.keep ? (d[i + k] - L[p]) * (m.sat ?? 1) + v : d[i + k];
      c = c * (1 - m.ramp) + ramp[v * 3 + k] * m.ramp;
      d[i + k] = c + (255 - c) * m.lift;
    }
  }
  x.putImageData(img, 0, 0);
  // ink: edges of the light, drawn as a pen would
  if (m.ink) {
    const ink = x.getImageData(0, 0, w, h), e = ink.data, dark = hex(m.inkColor || m.ends[0]);
    for (let y = 1; y < h - 1; y++) for (let xx = 1; xx < w - 1; xx++) {
      const p = y * w + xx;
      const gx = L[p - w + 1] + 2 * L[p + 1] + L[p + w + 1] - L[p - w - 1] - 2 * L[p - 1] - L[p + w - 1];
      const gy = L[p + w - 1] + 2 * L[p + w] + L[p + w + 1] - L[p - w - 1] - 2 * L[p - w] - L[p - w + 1];
      const g = Math.min(1, Math.max(0, (Math.hypot(gx, gy) - 70) / 160)) * m.ink;
      if (g > 0) { const i = p * 4; for (let k = 0; k < 3; k++) e[i + k] = e[i + k] * (1 - g) + dark[k] * g; }
    }
    x.putImageData(ink, 0, 0);
  }
  // halftone: dots in the shadows, bigger where it is darker
  if (m.dots) {
    const cell = Math.max(5, Math.round(w / 56)), dot = palette?.swatch?.[2] || '#1f5fff';
    x.fillStyle = dot; x.globalAlpha = .55;
    for (let y = cell / 2; y < h; y += cell) for (let xx = (Math.round(y / cell) % 2) * cell / 2; xx < w; xx += cell) {
      const v = L[Math.min(h - 1, Math.round(y)) * w + Math.min(w - 1, Math.round(xx))] / 255;
      const r = (1 - v) * cell * .48; if (r < .6 || v > .82) continue;
      x.beginPath(); x.arc(xx, y, r, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
  }
  // bloom: the light spilling, as a lens or a soft brush does
  if (m.bloom) { const b = softened(base, 5); x.globalCompositeOperation = 'screen'; x.globalAlpha = m.bloom; x.drawImage(b, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
  // paper: a little grain where a wash or a print would show it
  if (m.paper) {
    const g = x.getImageData(0, 0, w, h), q = g.data; let s = 7;
    for (let i = 0; i < q.length; i += 4) { s = (s * 16807) % 2147483647; const n = (s / 2147483647 - .5) * 16; q[i] += n; q[i + 1] += n; q[i + 2] += n * .8; }
    x.putImageData(g, 0, 0);
  }
  if (m.vignette) {
    const v = x.createRadialGradient(w / 2, h * .42, Math.min(w, h) * .3, w / 2, h * .45, Math.max(w, h) * .72);
    const [r, gg, b] = hex(m.light ? m.ends[1] : m.ends[0]);
    v.addColorStop(0, 'rgba(' + r + ',' + gg + ',' + b + ',0)'); v.addColorStop(1, 'rgba(' + r + ',' + gg + ',' + b + ',' + m.vignette + ')');
    x.fillStyle = v; x.fillRect(0, 0, w, h);
  }
  return base;
}

/** A picture from a blob, ready to draw. @param {Blob} blob */
export async function bitmap(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch { const url = URL.createObjectURL(blob); const im = new Image(); im.src = url; await im.decode(); return im; }
}
/** A canvas as a blob. @param {HTMLCanvasElement} c */
export const blobOf = (c, type = 'image/jpeg', q = .9) => new Promise(r => c.toBlob(b => r(/** @type {Blob} */ (b)), type, q));
