/**
 * Paint, where the picture is a photograph: a look laid on a real face from the face itself, so it reads as hair and
 * make-up rather than as a line drawn over someone. A fringe is the person's own hair brought forward, lock by lock (in
 * its own colours, its shadows and the light on it; curly hair filled with its own curls), and casts its shadow on the
 * forehead, no longer than their hair is; where the hair in the picture is not known there is nothing to make it from,
 * and it is left to the pencil (`paints`, `painted`). Brows are
 * filled hair by hair in their own colour (the old shape blended away where the new one is finer); liner is ink and a
 * smoky eye shadow; a beard darkens the skin's own light toward the hair's colour. A cut stays a line: only a render can
 * take hair away. Whatever shows this still says Sketch: it is drawn here.
 */
import { markup } from './markup.js';
import { shapesOf, LIPS } from '../studio/face.js';
import { dyeHair } from './tint.js';

/** The parts painted on a photograph; the others are a pencil line (a cut) or a colour washed in (hair colour, lips). */
export const PAINTED = new Set(['bangs', 'brows', 'lashes', 'beard']);
/**
 * Whether a part is painted on a picture: a fringe only where the picture's hair was found, since it is made from
 * that hair (elsewhere it is left to the pencil, which says honestly that it is only drawn).
 * @param {string} part @param {unknown} hair the hair found in the picture, if any
 */
export const paints = (part, hair) => PAINTED.has(part) && (part !== 'bangs' || !!hair);

/** @typedef {[number, number, number]} RGB */
/** @typedef {{ dark: RGB, mid: RGB, light: RGB }} Tones */
/** @typedef {{ x: number, y: number }} Pt */

const lum = (/** @type {number[]} */ c) => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
const css = (/** @type {number[]} */ c, a = 1) => 'rgb(' + c.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(' ') + ' / ' + a.toFixed(3) + ')';
const mix = (/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {number} */ t) => /** @type {RGB} */ (a.map((v, i) => v + (b[i] - v) * t));
/** Lighter (k > 0) or darker (k < 0), the way light and shadow fall on hair: warm toward the light, deep toward the dark. */
const shade = (/** @type {number[]} */ c, /** @type {number} */ k) => (k > 0 ? mix(c, [255, 241, 222], k) : mix(c, [10, 6, 5], -k));
/** A seeded random in [0, 1): the same strands each time for the same look. @param {number} seed */
function rng(seed) { let s = Math.abs(Math.round(seed)) % 2147483646 + 1; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

/** A canvas. @param {number} w @param {number} h */
function make(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
const ctx = (/** @type {HTMLCanvasElement} */ c) => /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true }));

/**
 * Points along a markup stroke's path (M, L, C, Q and h, as markup draws them), about every step pixels.
 * @param {string} d @param {number} step @returns {Pt[]}
 */
export function along(d, step) {
  const out = /** @type {Pt[]} */ ([]), nums = (/** @type {string} */ s) => (s.match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []).map(Number);
  let at = { x: 0, y: 0 };
  for (const [, cmd, args] of d.matchAll(/([MLCQh])([^MLCQh]*)/g)) {
    const v = nums(args);
    if (cmd === 'M') { at = { x: v[0], y: v[1] }; out.push(at); continue; }
    if (cmd === 'h') { const to = { x: at.x + v[0], y: at.y }; out.push(to); at = to; continue; }
    const pts = cmd === 'L' ? [at, { x: v[0], y: v[1] }] : cmd === 'Q' ? [at, { x: v[0], y: v[1] }, { x: v[2], y: v[3] }] : [at, { x: v[0], y: v[1] }, { x: v[2], y: v[3] }, { x: v[4], y: v[5] }];
    const end = pts[pts.length - 1], n = Math.max(2, Math.ceil(Math.hypot(end.x - at.x, end.y - at.y) * 1.3 / Math.max(.5, step)));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push(pts.length === 2 ? { x: at.x + (end.x - at.x) * t, y: at.y + (end.y - at.y) * t }
        : pts.length === 3 ? { x: u * u * pts[0].x + 2 * u * t * pts[1].x + t * t * pts[2].x, y: u * u * pts[0].y + 2 * u * t * pts[1].y + t * t * pts[2].y }
        : { x: u * u * u * pts[0].x + 3 * u * u * t * pts[1].x + 3 * u * t * t * pts[2].x + t * t * t * pts[3].x, y: u * u * u * pts[0].y + 3 * u * u * t * pts[1].y + 3 * u * t * t * pts[2].y + t * t * t * pts[3].y });
    }
    at = end;
  }
  return out;
}

/** What a picture's pixels are, read once, at a size enough for its tones. @type {WeakMap<object, { c: HTMLCanvasElement, k: number }>} */
const read = new WeakMap();
/** @param {CanvasImageSource & { width: number, height: number }} pic @param {import('../studio/face.js').Face} f @param {boolean} [moving] */
function pixels(pic, f, moving = false) {
  let r = moving ? null : read.get(pic);
  if (!r) {
    if (moving) return { c: /** @type {HTMLCanvasElement} */ (pic), k: 1 };
    const k = Math.min(1, 720 / Math.max(f.w, f.h)), c = make(f.w * k, f.h * k);
    ctx(c).drawImage(pic, 0, 0, c.width, c.height); r = { c, k }; read.set(pic, r);
  }
  return r;
}
/**
 * The tones of a region of the picture (darkest, middle, lightest of what is kept), from its pixels sorted by how light.
 * @param {{ c: HTMLCanvasElement, k: number }} r @param {Pt[][]} rings where to look, in the picture's pixels
 * @param {(i: number, d: Uint8ClampedArray) => boolean} [keep] which of the region's pixels count (by their index in d)
 * @param {number} [least] the share of the region that must count, else nothing is said @returns {Tones | null}
 */
function tonesIn(r, rings, keep, least = 0) {
  const all = rings.flat(); if (!all.length) return null;
  const x0 = Math.max(0, Math.floor(Math.min(...all.map(p => p.x)) * r.k)), y0 = Math.max(0, Math.floor(Math.min(...all.map(p => p.y)) * r.k));
  const x1 = Math.min(r.c.width, Math.ceil(Math.max(...all.map(p => p.x)) * r.k)), y1 = Math.min(r.c.height, Math.ceil(Math.max(...all.map(p => p.y)) * r.k));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  const m = make(x1 - x0, y1 - y0), mx = ctx(m);
  mx.fillStyle = '#fff'; mx.beginPath();
  for (const ring of rings) ring.forEach((p, i) => (i ? mx.lineTo(p.x * r.k - x0, p.y * r.k - y0) : mx.moveTo(p.x * r.k - x0, p.y * r.k - y0)));
  mx.fill();
  const inside = mx.getImageData(0, 0, m.width, m.height).data, d = ctx(r.c).getImageData(x0, y0, m.width, m.height).data, px = [];
  let n = 0;
  for (let i = 0; i < inside.length; i += 4) if (inside[i + 3] > 127) { n++; if (!keep || keep(i, d)) px.push([d[i], d[i + 1], d[i + 2]]); }
  if (px.length < Math.max(8, n * least)) return null;
  px.sort((a, b) => lum(a) - lum(b));
  const avg = (/** @type {number} */ lo, /** @type {number} */ hi) => { const s = px.slice(Math.floor(px.length * lo), Math.max(Math.floor(px.length * lo) + 1, Math.floor(px.length * hi))); return /** @type {RGB} */ (s.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map(v => v / s.length)); };
  return { dark: avg(.08, .3), mid: avg(.4, .7), light: avg(.8, .97) };
}

/** The frame of a face the strokes are measured by. @param {import('../studio/face.js').Face} f */
function measure(f) {
  const P = (/** @type {number} */ i) => f.pts[i], [bx, by, bw, bh] = f.box, hair = P(10).y - bh * .02, brow = Math.min(P(105).y, P(334).y);
  return { P, bx, by, bw, bh, u: bw / 100, hair, brow, F: Math.max(bh * .12, brow - hair), cx: P(10).x };
}

/**
 * The colours a look is painted in, from the picture: the hair (from the hair found in it if given, else what above the
 * forehead is neither skin nor wall, else the brows' darkest), the brows, and the skin (for the shadows cast on it).
 * @param {CanvasImageSource & { width: number, height: number }} pic @param {import('../studio/face.js').Face} f @param {(CanvasImageSource & { width: number, height: number }) | null} [hairMask] @param {boolean} [moving]
 */
export function coloursOf(pic, f, hairMask = null, moving = false) {
  const r = pixels(pic, f, moving), m = measure(f), s = shapesOf(f);
  const brows = tonesIn(r, s.brows), skin = tonesIn(r, [[m.P(50), m.P(101), m.P(118), m.P(117)], [m.P(280), m.P(330), m.P(347), m.P(346)]]);
  let hair = null;
  if (hairMask) {
    const hm = make(r.c.width, r.c.height), hx = ctx(hm); hx.drawImage(hairMask, 0, 0, hm.width, hm.height);
    const all = hx.getImageData(0, 0, hm.width, hm.height).data, W = hm.width;
    // the hair round the top of the head, where the mask is sure of it
    const ring = [{ x: m.bx - m.bw * .3, y: m.by - m.bh * .45 }, { x: m.bx + m.bw * 1.3, y: m.by - m.bh * .45 }, { x: m.bx + m.bw * 1.3, y: m.brow }, { x: m.bx - m.bw * .3, y: m.brow }];
    const x0 = Math.max(0, Math.floor(ring[0].x * r.k)), y0 = Math.max(0, Math.floor(ring[0].y * r.k)), w = Math.min(r.c.width, Math.ceil(ring[1].x * r.k)) - x0;
    hair = tonesIn(r, [ring], (i) => { const px = i / 4, x = x0 + px % w, y = y0 + Math.floor(px / w); return all[(y * W + x) * 4 + 3] > 160 && all[(y * W + x) * 4] > 160; });
  }
  // no mask: above the forehead, across the middle of the head, leaving out what is the skin's colour (a high forehead,
  // a bald crown) and the wall's (past short hair); with too little left, the brows' darkest stand in
  if (!hair) {
    const chroma = (/** @type {number[]} */ c) => { const t = Math.max(1, c[0] + c[1] + c[2]); return [c[0] / t, c[1] / t]; };
    const sc = skin && chroma(skin.mid), lo = skin ? lum(skin.dark) * .7 : 0, hi = skin ? lum(skin.light) * 1.15 : 0;
    const wall = tonesIn(r, [[{ x: 0, y: 0 }, { x: f.w * .08, y: 0 }, { x: f.w * .08, y: f.h * .08 }, { x: 0, y: f.h * .08 }], [{ x: f.w * .92, y: 0 }, { x: f.w, y: 0 }, { x: f.w, y: f.h * .08 }, { x: f.w * .92, y: f.h * .08 }]]);
    hair = tonesIn(r, [[{ x: m.cx - m.bw * .3, y: m.hair - m.F * 1.1 }, { x: m.cx + m.bw * .3, y: m.hair - m.F * 1.1 }, { x: m.cx + m.bw * .24, y: m.hair - m.F * .08 }, { x: m.cx - m.bw * .24, y: m.hair - m.F * .08 }]], (i, d) => {
      const p = [d[i], d[i + 1], d[i + 2]], l = lum(p);
      if (wall && Math.hypot(p[0] - wall.mid[0], p[1] - wall.mid[1], p[2] - wall.mid[2]) < 34) return false;
      if (sc && l > lo && l < hi) { const c = chroma(p); if (Math.hypot(c[0] - sc[0], c[1] - sc[1]) < .03) return false; }
      return true;
    }, .12);
  }
  hair ||= brows && { dark: shade(brows.dark, -.12), mid: brows.dark, light: shade(brows.dark, .3) };
  const fall = /** @type {Tones} */ ({ dark: [38, 26, 20], mid: [70, 50, 38], light: [120, 92, 70] });
  return { hair: hair || fall, brows: brows || hair || fall, skin: skin || { dark: [120, 86, 70], mid: [170, 128, 104], light: [210, 170, 146] }, mask: hairMask };
}

/** How straight a picture's hair is, read once. @type {WeakMap<object, number>} */
const straightness = new WeakMap();
/** Re-evaluate strand direction when the live camera exposes a different side. @param {HTMLCanvasElement} frame */
export function refreshHairTexture(frame) { straightness.delete(frame); }
/**
 * How straight the hair is, 0 (curls, running every way) to 1 (strands all running one way): in small blocks round the
 * top of the head, at a size where the forehead is 32 pixels, how much the light's edges agree on a direction. Each
 * block is read on its own, since straight hair parted runs two ways at once.
 * @param {CanvasImageSource} pic @param {import('../studio/face.js').Face} f @param {CanvasImageSource} hairMask
 */
function straightOf(pic, f, hairMask) {
  const had = straightness.get(pic); if (had !== undefined) return had;
  const m = measure(f), sc = 32 / Math.max(1, m.F), rx = m.bx - m.bw * .25, ry = m.hair - m.F * 2.2, rwp = m.bw * 1.5, rhp = m.F * 3;
  const gw = Math.max(8, Math.round(rwp * sc)), gh = Math.max(8, Math.round(rhp * sc)), c = make(gw, gh), x = ctx(c);
  x.drawImage(pic, rx, ry, rwp, rhp, 0, 0, gw, gh); x.globalCompositeOperation = 'destination-in';
  x.setTransform(gw / rwp, 0, 0, gh / rhp, -rx * gw / rwp, -ry * gh / rhp); x.drawImage(hairMask, 0, 0, f.w, f.h);
  const G = x.getImageData(0, 0, gw, gh).data, Lg = (/** @type {number} */ px, /** @type {number} */ py) => { const j = (py * gw + px) * 4; return G[j + 3] > 200 ? .2126 * G[j] + .7152 * G[j + 1] + .0722 * G[j + 2] : -1; };
  let cs = 0, cw = 0;
  for (let by = 1; by + 7 < gh; by += 6) for (let bx = 1; bx + 7 < gw; bx += 6) {
    let jxx = 0, jyy = 0, jxy = 0, ok = 0;
    for (let py = by; py < by + 6; py++) for (let px = bx; px < bx + 6; px++) {
      const a = Lg(px - 1, py), b = Lg(px + 1, py), u = Lg(px, py - 1), d = Lg(px, py + 1); if (a < 0 || b < 0 || u < 0 || d < 0) continue;
      const ex = b - a, ey = d - u; jxx += ex * ex; jyy += ey * ey; jxy += ex * ey; ok++;
    }
    if (ok < 24 || jxx + jyy < 1) continue;
    const e = Math.sqrt(jxx + jyy); cs += Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy) / (jxx + jyy) * e; cw += e;
  }
  const v = cw ? Math.max(0, Math.min(1, (cs / cw - .44) / .2)) : .5;
  straightness.set(pic, v); return v;
}

/** Smooth noise along a line, in [-1, 1]: a value every so many pixels, eased between. @param {() => number} r @param {number} n @param {number} every */
function noise1(r, n, every) {
  const v = Array.from({ length: Math.ceil(n / every) + 3 }, () => r() * 2 - 1);
  return (/** @type {number} */ x) => { const t = Math.max(0, x / every), i = Math.min(v.length - 2, Math.floor(t)), e = (1 - Math.cos(Math.PI * (t - i))) / 2; return v[i] + (v[i + 1] - v[i]) * e; };
}

/**
 * A fringe made of hair: locks of it, each rooted a little way back in the person's own hair, falling the way the
 * fringe falls (a curtain's sweeping out from its parting, a side fringe's across the forehead) and waving as their
 * hair waves. Its colours are the hair's own (its shadows, its body and the light on it, read from the hair above the
 * hairline, lock by lock where that hair is lighter or greyer); each lock darker where it leaves the hair and lighter
 * where it bends forward into the light, casting a little shadow on those behind it, its grain drawn over it in strands.
 * Curly hair is too curly to draw strand by strand: its locks are filled with the person's own curls. Toward its end a
 * lock's strands gather (a blunt cut's barely, a wispy one's to a point, the forehead showing between), each lock
 * ending a little apart from the next, a few strays past them, never longer than the hair it comes from.
 * @param {CanvasImageSource} pic @param {import('../studio/face.js').Face} f @param {CanvasImageSource} hairMask
 * @param {(x: CanvasRenderingContext2D) => void} at @param {HTMLCanvasElement} shape the fringe's shape over the layer
 * @param {{ lean: number, from: number, to: number, curve?: number }[]} ways how far a strand moves across for each row down, and the columns of the layer it may cross (a curtain's two sides each their own)
 * @param {number} F the forehead's height, in the layer's pixels
 * @param {{ ends: number, apart: number, see: number, taper: number, wisp: number, sheen: number, straight: number, h0: number, reach: number, cx: number, half: number }} how
 * @param {() => number} r @param {Tones} tones the hair's own, for where too little hair can be read
 * @param {number[]} bb where the shape is on the layer: left, top, right, bottom
 * @returns {HTMLCanvasElement | null}
 */
function locks(pic, f, hairMask, at, shape, ways, F, how, r, tones, bb) {
  // the shape, read only where it can be
  const W = shape.width, H = shape.height, bx0 = Math.max(0, Math.floor(bb[0]) - 2), by0 = Math.max(0, Math.floor(bb[1]) - 2), bw = Math.min(W, Math.ceil(bb[2]) + 2) - bx0, bh = Math.min(H, Math.ceil(bb[3]) + 2) - by0;
  if (bw < 2 || bh < 2) return null;
  const sd = ctx(shape).getImageData(bx0, by0, bw, bh).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (sd[(y * bw + x) * 4 + 3] > 100) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < x0) return null;
  x0 += bx0; x1 += bx0; y0 += by0; y1 += by0;
  const inside = (/** @type {number} */ x, /** @type {number} */ y) => { const xi = Math.round(x) - bx0, yi = Math.round(y) - by0; return xi >= 0 && yi >= 0 && xi < bw && yi < bh && sd[(yi * bw + xi) * 4 + 3] > 100; };
  // the picture and its hair over the layer
  const lm = Math.max(.15, ...ways.map(w => Math.abs(w.lean))), tall = y1 - y0;
  const rx0 = Math.max(0, Math.floor(x0 - tall * lm - F * .3)), rx1 = Math.min(W, Math.ceil(x1 + tall * lm + F * .3)), ry0 = Math.max(0, Math.floor(how.h0 - F * 1.6)), ry1 = Math.min(H, Math.ceil(y1 + F * .3));
  const rw = rx1 - rx0, rh = ry1 - ry0; if (rw < 4 || rh < 4) return null;
  const grab = (/** @type {CanvasImageSource} */ src) => { const c = make(rw, rh), x = ctx(c); at(x); const t = x.getTransform(); x.setTransform(t.a, 0, 0, t.d, t.e - rx0, t.f - ry0); x.drawImage(src, 0, 0, f.w, f.h); return c; };
  const picC = grab(pic), S = ctx(picC).getImageData(0, 0, rw, rh).data, M = ctx(grab(hairMask)).getImageData(0, 0, rw, rh).data;
  const hairAt = (/** @type {number} */ x, /** @type {number} */ y) => { const xi = Math.round(x) - rx0, yi = Math.round(y) - ry0; return xi >= 0 && yi >= 0 && xi < rw && yi < rh ? M[(yi * rw + xi) * 4 + 3] : 0; };
  // the hairline, column by column: the foot of the hair above the forehead, near where the face says it is
  const feet = new Float32Array(rw);
  for (let i = 0; i < rw; i++) {
    let foot = -1;
    for (let y = Math.max(ry0, how.h0 - F * 1.2); y < Math.min(ry1, how.h0 + F * .7); y++) { if (hairAt(rx0 + i, y) > 140) foot = y; else if (foot >= 0 && y - foot > F * .06) break; }
    feet[i] = foot >= 0 ? foot : how.h0;
  }
  // where the light falls across it: the hairline smoothed into the curve of the head; and the hairline itself kept near
  // that curve and eased, so a fringe never starts in steps where the hair beside the face runs on down
  const smooth1 = (/** @type {Float32Array} */ a, /** @type {number} */ span) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) { let s = 0, n = 0; for (let j = Math.max(0, i - span); j <= Math.min(a.length - 1, i + span); j++) { s += a[j]; n++; } o[i] = s / n; } return o; };
  // (the top of the forehead's hairline carried across: where the hair comes down beside the face it is still the top of
  // the head that a fringe is combed forward from)
  const env = feet.map((_, i) => { let lo = Infinity; const s = Math.round(F * .35); for (let j = Math.max(0, i - s); j <= Math.min(rw - 1, i + s); j++) lo = Math.min(lo, feet[j]); return lo; });
  const crown = smooth1(env, Math.max(2, Math.round(F * .4))).map(v => Math.max(how.h0 - F * 1.2, Math.min(how.h0 + F * .35, v)));
  feet.set(smooth1(feet.map((v, i) => Math.max(crown[i] - F * .2, Math.min(crown[i] + F * .16, v))), Math.max(1, Math.round(F * .08))));
  const hairlineAt = (/** @type {number} */ x) => feet[Math.max(0, Math.min(rw - 1, Math.round(x) - rx0))];
  const crownAt = (/** @type {number} */ x) => crown[Math.max(0, Math.min(rw - 1, Math.round(x) - rx0))];
  // the hair's own colours, from all of it round the face (above the hairline it is mostly in shadow): its shadows, its
  // body, the light on it
  const seen = /** @type {number[][]} */ ([]);
  {
    const b = f.box, sc = Math.min(1, 140 / b[2]), gw = Math.max(8, Math.round(b[2] * 1.8 * sc)), gh = Math.max(8, Math.round(b[3] * 1.5 * sc)), gx = b[0] - b[2] * .4, gy = b[1] - b[3] * .45;
    const c = make(gw, gh), x = ctx(c), sx = gw / (b[2] * 1.8), sy = gh / (b[3] * 1.5); x.setTransform(sx, 0, 0, sy, -gx * sx, -gy * sy);
    x.drawImage(pic, 0, 0, f.w, f.h); const P0 = x.getImageData(0, 0, gw, gh).data;
    x.globalCompositeOperation = 'copy'; x.drawImage(hairMask, 0, 0, f.w, f.h); const M0 = x.getImageData(0, 0, gw, gh).data;
    for (let j = 0; j < P0.length; j += 8) if (M0[j + 3] > 220) seen.push([P0[j], P0[j + 1], P0[j + 2]]);
  }
  seen.sort((a, b) => lum(a) - lum(b));
  const part = (/** @type {number} */ t) => {
    if (seen.length < 40) return [...(t < .35 ? tones.dark : t > .75 ? tones.light : tones.mid)];
    const a = Math.floor(seen.length * Math.max(0, t - .05)), b = Math.max(a + 1, Math.ceil(seen.length * Math.min(1, t + .05))), s = [0, 0, 0];
    for (let i = a; i < b; i++) for (let c = 0; c < 3; c++) s[c] += seen[i][c];
    return s.map(v => v / (b - a));
  };
  // dark hair's light is a sheen well above its body (too little of it is lit to be read as often as it is seen)
  const dark = part(.15), body = part(.58), light0 = part(.94), mean = lum(part(.45)), want = Math.min(lum(body) * 1.5 + 16, lum(body) + 55, 235);
  const light = lum(light0) >= want ? light0 : light0.map(v => Math.min(255, v * want / Math.max(4, lum(light0))));
  // where a lock's hair is lighter or darker than the rest (a grey streak, the light on one side)
  const localAt = (/** @type {number} */ x, /** @type {number} */ y) => {
    let s = 0, n = 0; const d = Math.max(1, Math.round(F * .03));
    for (let dy = -3; dy <= 3; dy++) for (let dx = -2; dx <= 2; dx++) { const xi = Math.round(x + dx * d) - rx0, yi = Math.round(y + dy * d) - ry0; if (xi < 0 || yi < 0 || xi >= rw || yi >= rh) continue; const j = (yi * rw + xi) * 4; if (M[j + 3] < 200) continue; s += lum([S[j], S[j + 1], S[j + 2]]); n++; }
    return n >= 8 ? Math.max(.9, Math.min(1.1, s / n / Math.max(8, mean))) : 1;
  };
  // how each way falls, row by row down from the top: straight down from the hairline and, for a curve, sweeping out further down
  const Gn = ry1 - ry0 + 2;
  const curves = ways.map(way => {
    const G = new Float64Array(Gn), c = way.curve || 0;
    for (let i = 1; i < Gn; i++) { const y = ry0 + i - .5, d = Math.max(0, Math.min(1, (y - how.h0) / (1.25 * F))); G[i] = G[i - 1] + way.lean * (1 - c + c * (.18 + .82 * d * d * (3 - 2 * d))); }
    return (/** @type {number} */ y) => { const t = Math.max(0, Math.min(Gn - 1.001, y - ry0)), i = Math.floor(t); return G[i] + (G[i + 1] - G[i]) * (t - i); };
  });
  const sm = (/** @type {number} */ v) => { const e = Math.max(0, Math.min(1, v)); return e * e * (3 - 2 * e); };
  // curly hair: the person's own curls, quilted from patches of the hair above the hairline into one piece to fill locks with
  let curls = /** @type {HTMLCanvasElement | null} */ (null);
  if (how.straight < .3) {
    const P = Math.max(6, Math.round(F * .34)), found = /** @type {number[][]} */ ([]);
    for (let k = 0; k < 260 && found.length < 36; k++) {
      const x = x0 + r() * (x1 - x0), hl = hairlineAt(x), y = hl - F * (.25 + r() * 1.05);
      let ok = 0; for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) if (hairAt(x + (a / 4 - .5) * P, y + (b / 4 - .5) * P) > 200) ok++;
      if (ok >= 23) found.push([x - rx0 - P / 2, y - ry0 - P / 2]);
    }
    if (found.length >= 6) {
      const tw = Math.round(F * 1.4), th = Math.round(F * 2.2), T = make(tw, th), tx = ctx(T), patch = make(P, P), px = ctx(patch);
      for (let gy = -P * .4; gy < th; gy += P * .5) for (let gx = -P * .4 + (r() - .5) * P * .3; gx < tw; gx += P * .5) {
        const [sx, sy] = found[Math.floor(r() * found.length)];
        px.globalCompositeOperation = 'copy'; px.drawImage(picC, sx, sy, P, P, 0, 0, P, P);
        const g = px.createRadialGradient(P / 2, P / 2, P * .18, P / 2, P / 2, P / 2); g.addColorStop(0, '#000'); g.addColorStop(1, 'rgb(0 0 0 / 0)');
        px.globalCompositeOperation = 'destination-in'; px.fillStyle = g; px.fillRect(0, 0, P, P);
        tx.drawImage(patch, gx, gy);
      }
      // what the patches leave between them, in the hair's body colour beneath
      tx.globalCompositeOperation = 'destination-over'; tx.fillStyle = css(body); tx.fillRect(0, 0, tw, th);
      curls = T;
    }
  }
  // a cut's ends: how much a lock's strands gather toward its end, over how long, and how far its edges end short of its middle
  const sweeps = ways.some(w => w.lean), clump = curls ? -.25 : .12 + .7 * how.apart * how.apart, gather = F * (.07 + .3 * how.apart), point = F * (curls ? .06 : (.012 + .22 * how.apart * how.apart) * (sweeps ? .5 : 1)), round = curls ? 2.4 : 2.6 - how.apart * 1.5;
  // waves run across neighbouring locks together, as hair's do
  const curl = curls ? 0 : Math.pow(1 - how.straight, 1.4), lam = F * (.2 + .3 * how.straight), amp = lam * (.01 + .1 * curl), drift = noise1(r, W + 2, F * .7), step = Math.max(1, F * .02);
  /** @type {{ c: number[], y0: number, hw: number, hl: number, band: number, shine: number, stop: number, end: number, k: number, way: number, stray: number }[]} */
  const all = [];
  ways.forEach((way, wi) => {
    const G = curves[wi], xa = Math.max(rx0, Math.min(rx1, way.from - tall * Math.abs(way.lean))), xb = Math.min(rx1, Math.max(rx0, way.to + tall * Math.abs(way.lean)));
    for (let x = xa; x < xb;) {
      const wl = F * (curls ? .1 + .07 * r() : (.06 + .06 * r() + (r() - .5) * .08 * how.apart * how.apart) * (1 + .4 * curl) * (way.lean ? .7 : 1)), xr = x + wl / 2; x += wl * (curls ? .8 : 1);
      // rooted along the curve of the head (a fringe is combed forward from the top of it, over the hairline beneath)
      const hl = crownAt(xr), yr = hl - F * (.12 + .14 * r()), ph = drift(xr) * 3 + (r() - .5) * 6.283 * curl, A = amp * (.7 + .6 * r());
      const lean = (way.lean ? 0 : (xr - how.cx) / Math.max(1, how.half) * .07) + (r() - .5) * .02;
      // down the way it falls, until it leaves the fringe's shape or has come as far as the hair is long
      /** @type {number[]} */ const c = []; let end = -1, len = 0, px0 = xr, inn = false;
      for (let y = yr; y < ry1; y += step) {
        const px = xr + G(y) - G(yr) + lean * (y - yr) + A * sm((y - hl) / (F * .3)) * Math.sin((y - yr) / lam * 6.283 + ph);
        if (y > hl) len += Math.hypot(step, px - px0); px0 = px;
        const here = inside(px, y); if (here && y > hl - F * .1) inn = true;
        if (end < 0 && inn && y > hl + F * .04 && (!here || (way.lean ? len > how.reach * F * 1.2 : y > crownAt(xr) + how.reach * F))) end = y;
        c.push(px);
        if (end >= 0 && y > end + F * .14) break;
      }
      if (end < 0) continue;
      // its end: the cut's, a little uneven, some locks shorter where a cut parts (a curl's springing up, shorter still)
      let stop = end - F * (.004 + .045 * how.ends) * r();
      if (r() < how.apart * .4) stop -= F * how.apart * (.14 + .14 * how.see * 4) * r();
      else if (r() < how.wisp) stop += F * how.wisp * .8 * r();
      // (curls spring up into a mass as they grow; they never hang in single ringlets far below the rest)
      if (curls) stop = Math.max(end - F * .2, Math.min(stop, end) - F * .14 * r());
      if (stop - hl < F * .05) continue;
      all.push({ c, y0: yr, hw: wl * (curls ? .62 : .6), hl, band: F * (r() - .5) * .1, shine: .6 + .6 * r(), stop, end, k: localAt(xr, hl - F * (.15 + .3 * r())) * (.975 + .05 * r()), way: wi, stray: r() });
    }
  });
  if (all.length < 6) return null;
  const xAt = (/** @type {typeof all[number]} */ L, /** @type {number} */ y) => { const t = Math.max(0, Math.min(L.c.length - 1.001, (y - L.y0) / step)), i = Math.floor(t); return L.c[i] + (L.c[i + 1] - L.c[i]) * (t - i); };
  const hwAt = (/** @type {typeof all[number]} */ L, /** @type {number} */ y) => { const g = Math.min(gather, (L.stop - L.hl) * .7); return L.hw * (1 - clump * sm((y - (L.stop - g)) / g)); };
  const out = make(W, H), o = ctx(out); o.lineCap = 'round'; o.lineJoin = 'round';
  const toward = (/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {number} */ t) => a.map((v, i) => v + (b[i] - v) * t);
  const glint = lum(light) >= 80 ? light : light.map(v => Math.min(255, v * 80 / Math.max(4, lum(light))));
  // light hair's shadows are lighter: it lets light through
  const deep = 1 - Math.min(.7, lum(body) / 255 * .9);
  // light down a lock: in shadow where it leaves the hair, catching the light where it bends forward, its body, a little
  // darker and finer at its end
  const lightOf = (/** @type {typeof all[number]} */ L, /** @type {number} */ a0, /** @type {number} */ k, /** @type {number} */ lift) => {
    const g = o.createLinearGradient(0, L.y0, 0, L.stop + 1), span = L.stop + 1 - L.y0;
    let last = 0; const put = (/** @type {number} */ y, /** @type {number[]} */ c, /** @type {number} */ a, /** @type {number} */ up) => { last = Math.max(last, Math.max(0, Math.min(1, (y - L.y0) / span))); g.addColorStop(last, css(toward(c, glint, lift * up).map(v => v * k * L.k), a * a0)); };
    const b0 = L.hl + Math.max(F * .14, L.band + F * .2);
    put(L.y0, toward(dark, body, .25), 1, 0); put(L.hl + F * .08, toward(dark, body, .7), 1, .25); put(b0, toward(body, light, (.2 + how.sheen * 1.6) * L.shine), 1, 1);
    put(b0 + F * .14, toward(body, light, .15), 1, .6); put(Math.max(b0 + F * .2, L.hl + F * .55), body, 1, .3); put(L.stop - F * (.03 + how.taper * .3), body, 1 - how.see * .4, .2); put(L.stop + 1, toward(body, dark, .2 * deep), (1 - how.see * .6) * .45, .1);
    return g;
  };
  const exitOf = (/** @type {typeof all[number]} */ L, /** @type {number} */ s) => {
    for (let y = Math.max(L.hl + F * .04, L.end - F * .6); y < L.end + F * .6; y += step) if (!inside(xAt(L, y) + s * hwAt(L, y) * .85, y)) return Math.min(L.end + F * .25, y) - (L.end - L.stop);
    return L.stop;
  };
  const endsOf = (/** @type {typeof all[number]} */ L) => { const lo = L.y0 + F * .06; return [Math.max(lo, exitOf(L, -1) - point), Math.max(lo, exitOf(L, 1) - point)]; };
  const outline = (/** @type {typeof all[number]} */ L) => {
    const [tl, tr] = endsOf(L), p = new Path2D(), right = [];
    p.moveTo(xAt(L, L.y0) - hwAt(L, L.y0), L.y0);
    for (let y = L.y0 + step; y < tl; y += step) p.lineTo(xAt(L, y) - hwAt(L, y), y);
    for (let y = L.y0; y < tr; y += step) right.push(xAt(L, y) + hwAt(L, y), y);
    const ax = xAt(L, tl) - hwAt(L, tl), bx = xAt(L, tr) + hwAt(L, tr), my = (tl + tr) / 2 + point, mx = xAt(L, my), q = Math.max(0, Math.min(1, (round - 1.4) / 1.2));
    p.lineTo(ax, tl); p.quadraticCurveTo(ax + (mx - ax) * (1 - q) * .5, my - (my - tl) * (1 - q) * .5 + (q ? 0 : 0), mx, my); p.quadraticCurveTo(bx + (mx - bx) * (1 - q) * .5, my - (my - tr) * (1 - q) * .5, bx, tr);
    for (let i = right.length - 2; i >= 0; i -= 2) p.lineTo(right[i], right[i + 1]);
    p.closePath(); return p;
  };
  const order = all.map((_, i) => i).sort(() => r() - .5), shadowOf = css(dark.map(v => v * .45), .5 * deep);
  ways.forEach((way, wi) => {
    o.save(); o.beginPath(); o.rect(Math.max(-1, way.from), 0, Math.min(W + 2, way.to) - Math.max(-1, way.from), H); o.clip();
    const mine = order.map(i => all[i]).filter(L => L.way === wi);
    if (!curls) for (const L of mine) {
      const g = Math.min(gather, (L.stop - L.hl) * .7), e = Math.min(...endsOf(L)) - g * .5; if (e - L.y0 < F * .1) continue;
      o.beginPath(); o.moveTo(xAt(L, L.y0) - L.hw * 1.5, L.y0);
      for (let y = L.y0; y < e; y += step) o.lineTo(xAt(L, y) - L.hw * 1.5, y);
      for (let y = e; y > L.y0; y -= step) o.lineTo(xAt(L, y) + L.hw * 1.5, y);
      o.closePath(); o.fillStyle = lightOf(L, 1, .62 + .25 * (1 - deep), 0); o.fill();
    }
    for (const L of mine) {
      // its body, with a little shadow on what is behind it; curls filled with the person's own, in the same light
      const p = outline(L);
      o.save(); o.shadowColor = shadowOf; o.shadowBlur = Math.max(1, F * .03); o.shadowOffsetY = F * .012; o.fillStyle = lightOf(L, 1, 1, 0); o.fill(p); o.restore();
      if (curls) {
        o.save(); o.clip(p);
        const bx = xAt(L, L.y0) - L.hw * 2 - F * .3, by = L.y0;
        o.drawImage(curls, -r() * Math.max(0, curls.width - L.hw * 4 - F * .6) + bx, -r() * Math.max(0, curls.height - (L.stop - L.y0) - 2) + by);
        // the same light over them: in shadow at the root, the light where it bends forward, darker underneath
        const g = o.createLinearGradient(0, L.y0, 0, L.stop);
        const at = (/** @type {number} */ y) => Math.max(0, Math.min(1, (y - L.y0) / (L.stop - L.y0)));
        g.addColorStop(0, css(dark, .3)); g.addColorStop(at(L.hl + F * .1), css(dark, .06)); g.addColorStop(at(L.hl + F * .22), css(light, .12)); g.addColorStop(at(L.hl + F * .4), css(body, 0)); g.addColorStop(1, css(dark, .18));
        o.fillStyle = g; o.fillRect(bx - F, L.y0, L.hw * 4 + F * 2.6, L.stop - L.y0 + 2);
        o.restore();
      }
    }
    // the grain: strands over each lock, gathering with it, some in shadow, some in the light; then a few strays past its end
    if (!curls) for (const L of mine) {
      const n = Math.max(3, Math.round(L.hw * 2 / Math.max(1.1, F * .014))), te = endsOf(L);
      for (let s = 0; s < n; s++) {
        const d = ((s + .2 + .6 * r()) / n) * 2 - 1, endY = te[0] + (te[1] - te[0]) * (d + 1) / 2 + point * (1 - Math.pow(Math.abs(d), 1.4)) - F * .015 * r(), v = r(), sy = L.y0 + F * .06 * r();
        if (endY - sy < F * .1) continue;
        const k = v < .34 ? .62 + .18 * (1 - deep) + .1 * r() : 1, lift = v > .74 ? (.5 + .4 * r()) * (.5 + .5 * deep) * (sweeps ? .5 : 1) : 0;
        o.strokeStyle = lightOf(L, .3 + .4 * r(), k, lift); o.lineWidth = Math.max(.6, F * (.006 + .006 * r()));
        o.beginPath(); o.moveTo(xAt(L, sy) + d * hwAt(L, sy) * 1.12, sy);
        for (let y = sy + step; y < endY; y += step) o.lineTo(xAt(L, y) + d * hwAt(L, y) * 1.12, y);
        o.stroke();
      }
      if (L.stray < how.wisp * 1.5) {
        const sy = L.stop - F * .3, ey = L.stop + F * (.03 + .08 * r()), d = (r() - .5) * .6;
        o.strokeStyle = css(body.map(v => v * L.k), .5); o.lineWidth = Math.max(.5, F * .005);
        o.beginPath(); o.moveTo(xAt(L, sy) + d * L.hw, sy); for (let y = sy + step; y < ey; y += step) o.lineTo(xAt(L, y) + d * hwAt(L, y), y); o.stroke();
      }
    }
    o.restore();
  });
  // out of the hair: each column fading in from a little above its hairline, where the fringe's roots are in the hair already there
  const roots = make(W, H), rc = ctx(roots);
  for (let i = 0; i < rw; i += 2) {
    const hl = crown[i], g = rc.createLinearGradient(0, hl - F * .3, 0, hl); g.addColorStop(0, '#0000'); g.addColorStop(1, '#000');
    rc.fillStyle = g; rc.fillRect(rx0 + i, hl - F * .3, 2, H);
  }
  rc.fillStyle = '#000'; rc.fillRect(0, 0, rx0, H); rc.fillRect(rx1, 0, W - rx1, H);
  const fade = rc.createLinearGradient(x0, 0, x1, 0), fw = Math.min(.3, F * .3 / Math.max(1, x1 - x0));
  fade.addColorStop(0, '#0000'); fade.addColorStop(fw, '#000'); fade.addColorStop(1 - fw, '#000'); fade.addColorStop(1, '#0000');
  rc.globalCompositeOperation = 'destination-in'; rc.fillStyle = fade; rc.fillRect(0, 0, W, H);
  o.globalCompositeOperation = 'destination-in'; o.drawImage(roots, 0, 0); o.globalCompositeOperation = 'source-over';
  /** @type {any} */ (out).hairMean = lum(body);
  return out;
}

/**
 * A look painted over a photograph: transparent but where it is painted, over box (picture pixels) at k output pixels
 * to one of the picture's. Only the parts in PAINTED, and of those only what could be painted here (`painted` says
 * which): the rest is left to the pencil and the washes. Null when nothing could be.
 * @param {CanvasImageSource & { width: number, height: number }} pic @param {import('../studio/face.js').Face} f
 * @param {{ part: string, style: string, shape?: Record<string, number> }[]} look
 * @param {number[]} box @param {number} k @param {ReturnType<typeof coloursOf> & { dye?: string, roots?: CanvasImageSource | null }} [tone] a dye: the hair colour the look also asks for, which the fringe and the beard take; roots: where, weeks on, the hair's own colour has grown back in (time.js)
 * @returns {(HTMLCanvasElement & { painted: Set<string> }) | null}
 */
export function paintLook(pic, f, look, box, k, tone) {
  const parts = look.filter(q => PAINTED.has(q.part)); if (!parts.length) return null;
  const t = tone || coloursOf(pic, f), out = Object.assign(make(box[2] * k, box[3] * k), { painted: new Set() }), o = ctx(out);
  const at = (/** @type {CanvasRenderingContext2D} */ x) => x.setTransform(k, 0, 0, k, -box[0] * k, -box[1] * k);
  // the parts laid on in the order make-up and hair are: brows, eyes, then a beard, then the fringe over all
  const order = ['brows', 'lashes', 'beard', 'bangs'];
  for (const q of [...parts].sort((a, b) => order.indexOf(a.part) - order.indexOf(b.part))) {
    const layer = make(out.width, out.height), x = ctx(layer); at(x);
    const r = rng(q.part.length * 977 + q.style.length * 131 + Math.round(f.box[2]));
    if (q.part === 'bangs') { if (!fringe(x, layer, f, q, t, r, k, at, pic, box)) continue; }
    else if (q.part === 'brows') brows(x, f, q, t, r, k, pic, box);
    else if (q.part === 'lashes') ink(x, f, q, t, k);
    else if (q.part === 'beard') beard(x, layer, f, q, t, r, k, at, pic);
    // brows weeks on: the new shape fading as the old one grows back
    o.globalAlpha = q.part === 'brows' ? 1 - Math.min(.55, (q.shape?.grow || 0) * 1.1) : 1;
    o.drawImage(layer, 0, 0); o.globalAlpha = 1; out.painted.add(q.part);
  }
  return out.painted.size ? out : null;
}

/** A soft copy of a canvas (blurred by px), the cheap way where filters are missing. @param {HTMLCanvasElement} c @param {number} px */
function soft(c, px) {
  const s = make(c.width, c.height), x = ctx(s);
  if (typeof /** @type {any} */ (x).filter === 'string') { x.filter = 'blur(' + Math.max(.01, px).toFixed(2) + 'px)'; x.drawImage(c, 0, 0); return s; }
  const q = Math.max(1, px), small = make(c.width / q, c.height / q); ctx(small).drawImage(c, 0, 0, small.width, small.height);
  x.imageSmoothingQuality = 'high'; x.drawImage(small, 0, 0, s.width, s.height); return s;
}

/** A smooth line through points (Catmull-Rom), sampled. @param {Pt[]} ps @param {number} n per span */
function smooth(ps, n = 8) {
  const out = [ps[0]];
  for (let i = 0; i < ps.length - 1; i++) {
    const p0 = ps[Math.max(0, i - 1)], p1 = ps[i], p2 = ps[i + 1], p3 = ps[Math.min(ps.length - 1, i + 2)];
    for (let j = 1; j <= n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      out.push({ x: .5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: .5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3) });
    }
  }
  return out;
}
const line = (/** @type {Pt[]} */ ps) => { const p = new Path2D(); ps.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y))); return p; };

/**
 * Where a fringe lies and how its hair falls, on this face: the shape it covers (reaching up into the hair already
 * there) and the ways it falls (how far it leans, either side of a parting). Straight fringes end where the markup's
 * own strokes end; curtains part in the middle and sweep down and out to the cheekbones, leaving the middle of the
 * forehead open; a side fringe sweeps from its parting across to the far temple. Shaped as the markup is.
 * @param {import('../studio/face.js').Face} f @param {string} style @param {Record<string, number>} shape
 */
function fringeOf(f, style, shape) {
  const m = measure(f), P = m.P, v = (/** @type {string} */ id) => Math.max(-1, Math.min(1, shape[id] || 0)), g = Math.max(0, shape.grow || 0);
  // each side of the face by where it is in the picture (a mirrored picture has its points mirrored too)
  const by = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ s) => ((P(a).x < P(b).x) === (s < 0) ? P(a) : P(b));
  const side = (/** @type {number} */ s) => ({ temple: by(54, 284, s), cheek: by(234, 454, s), corner: by(33, 263, s), browOut: by(70, 300, s) });
  /** @typedef {{ cover: Pt[][], m: ReturnType<typeof measure>, ways: { lean: number, from: number, to: number, curve?: number }[] }} Fringe */
  /** @type {Fringe} */
  const out = { cover: [], m, ways: [{ lean: 0, from: -Infinity, to: Infinity }] };
  if (style === 'curtain') {
    const mid = m.cx + v('part') * m.bw * .12, drop = v('length') * m.F * .9 + g * m.F;
    // weeks on, grown heavier, it falls into the eyes (cut longer, it is only longer: it still sweeps clear of them)
    const open = 1 - Math.min(.36, g * .55);
    for (const s of [-1, 1]) {
      // as a curtain is worn: parted, open across the forehead, the hair swept out from the parting over its corners,
      // clear of the eyes, and down past the outer end of the brow to the cheekbone, framing the face. Its inner edge is
      // the way the hair falls (as each strand does: nearly straight down from the hairline, sweeping out further down),
      // opening faster than the strands, so they leave it one by one rather than being cut along a line
      const sd = side(s), eye = sd.corner.y, low = eye + m.F * .55 + drop, top = m.hair - m.F * .1, N = 18, far = sd.cheek.x - s * m.bw * .02;
      const fall = (/** @type {number} */ y) => { const d = Math.max(0, Math.min(1, (y - m.hair) / (1.25 * m.F))); return .6 * (.18 + .82 * d * d * (3 - 2 * d)); };
      // how much faster than its strands it must open to be past the eye's outer corner by the eye
      let xs = mid + s * m.bw * .015; for (let y = top, dy = (eye - top) / 40; y < eye; y += dy) xs += s * fall(y) * dy;
      const need = Math.max(0, s * (sd.corner.x + s * m.bw * .03 - xs)) * open, reach = Math.max(m.F * .3, eye - m.hair);
      const edge = [{ x: mid + s * m.bw * .01, y: m.hair - m.F * .25 }];
      let x = mid + s * m.bw * .015;
      for (let i = 1; i <= N; i++) {
        const dy = (low - top) / N, y = top + dy * i, e = Math.max(0, Math.min(1, (y - m.hair) / reach));
        x += s * fall(y - dy / 2) * dy;
        const at = x + s * need * e * e * (3 - 2 * e);
        edge.push({ x: s > 0 ? Math.min(at, far) : Math.max(at, far), y });
      }
      const back = [{ x: sd.cheek.x + s * m.bw * .03, y: sd.corner.y + m.F * .15 + drop }, { x: sd.temple.x + s * m.bw * .08, y: m.hair + m.F * .05 }, { x: sd.temple.x + s * m.bw * .02, y: m.hair - m.F * 1.6 }, { x: mid + s * m.bw * .008, y: m.hair - m.F * 2 }];
      out.cover.push([...edge, ...back]);
    }
    // from the parting nearly straight down, then sweeping out
    out.ways = [{ lean: .6, curve: 1, from: -Infinity, to: mid }, { lean: -.6, curve: 1, from: mid, to: Infinity }];
    return out;
  }
  if (style === 'side') {
    const part = m.cx - m.bw * .2 + v('part') * m.bw * .15, dir = part < m.cx ? 1 : -1, far = side(dir);
    // longer (and, weeks on, grown), it falls further before it sweeps across
    const L = 2.7 / (1 + Math.max(0, v('length') * .6 + g) * .9);
    // its lower edge is the way the hair falls from the parting, as each strand beside it does: down from the hairline,
    // then sweeping across the forehead to the far temple; the strands run along it, never cut across by it
    const edge = [{ x: part, y: m.hair - m.F * .2 }], end = far.temple.x + dir * m.bw * .03, dy = m.F * .04;
    let x = part, y = m.hair - m.F * .05;
    while (dir * (end - x) > 0 && y < m.brow + m.F * 1.6) {
      const d = Math.max(0, Math.min(1, (y - m.hair) / (1.25 * m.F)));
      x += dir * L * (.18 + .82 * d * d * (3 - 2 * d)) * dy; y += dy; edge.push({ x, y });
    }
    const back = [{ x: far.temple.x + dir * m.bw * .09, y: y - m.F * .3 }, { x: far.temple.x + dir * m.bw * .06, y: m.hair - m.F * .35 }, { x: far.temple.x + dir * m.bw * .02, y: m.hair - m.F * 1.6 }, { x: part - dir * m.bw * .04, y: m.hair - m.F * 2 }];
    out.cover.push([...edge, ...back]);
    out.ways = [{ lean: -dir * L, curve: 1, from: -Infinity, to: Infinity }];
    return out;
  }
  // straight fringes: the markup's strands, closed into one, and a bridge up into the hair across the top
  const strokes = markup(f, 'bangs', style, shape), L = side(-1).temple, R = side(1).temple;
  const flow = strokes.filter(s => s.w < m.u * .8).map(s => along(s.d, m.u * .6)).filter(fl => fl.length).sort((a, b) => a[0].x - b[0].x);
  // the shape: across the top of the head, down each temple, and along where its strands end (a Birkin parts a little
  // in the middle)
  const ends = flow.map(fl => fl[fl.length - 1]);
  if (style === 'birkin' && ends.length > 3) { const i = ends.findIndex(p => p.x > m.cx); if (i > 0) ends.splice(i, 0, { x: m.cx, y: (ends[i - 1].y + ends[i].y) / 2 - m.F * .16 }); }
  const low = ends.length > 1 ? smooth(ends, 4) : [];
  out.cover.push([{ x: L.x - m.bw * .02, y: m.hair - m.F * 2 }, { x: R.x + m.bw * .02, y: m.hair - m.F * 2 }, { x: R.x + m.bw * .03, y: m.hair + m.F * .1 }, ...[...low].reverse(), { x: L.x - m.bw * .03, y: m.hair + m.F * .1 }]);
  return out;
}

/** How far a fringe can reach below the hairline, of the forehead's height, read once per hair. @type {WeakMap<object, number>} */
const reaches = new WeakMap();
/**
 * How long the hair is, for a fringe: hair falling past the cheeks can be brought down as far as any fringe goes; short
 * hair only as far as it is long on top (its depth above the hairline), so a short crop makes a short fringe.
 * @param {import('../studio/face.js').Face} f @param {CanvasImageSource & { width: number, height: number }} mask
 */
function reachOf(f, mask) {
  const had = reaches.get(mask); if (had !== undefined) return had;
  const m = measure(f), sc = 160 / f.w, c = make(160, Math.round(f.h * sc)), x = ctx(c); x.drawImage(mask, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data, at = (/** @type {number} */ px, /** @type {number} */ py) => { const i = Math.round(py * sc), j = Math.round(px * sc); return i >= 0 && j >= 0 && i < c.height && j < c.width ? d[(i * c.width + j) * 4 + 3] : 0; };
  // beside the face past the ears, from the nose to the chin (out of reach of a beard or sideburns, which are hair too)
  let side = 0, n = 0;
  for (const px of [m.bx - m.bw * .22, m.bx + m.bw * 1.22]) for (let t = 0; t <= 1; t += .1) { n++; if (at(px, m.P(1).y + (m.P(152).y - m.P(1).y) * t) > 128) side++; }
  // on top: how far up the hair goes from the hairline, across the middle of the head
  let top = 0;
  for (const px of [m.cx - m.bw * .2, m.cx, m.cx + m.bw * .2]) { let y = m.hair; while (y > 0 && (at(px, y) > 128 || at(px, y - m.F * .1) > 128)) y -= m.F * .05; top += (m.hair - y) / m.F / 3; }
  const v = side / n > .45 ? 9 : Math.max(.7, top * 1.25 + .35);
  reaches.set(mask, v); return v;
}
/**
 * A fringe: locks of the person's own hair brought forward over the shape it covers (`locks`), its shadow on the forehead,
 * dyed as the rest of their hair is if the look dyes it. Only where the picture's hair was found: there is nothing to comb a
 * fringe from without it, and it is left to the pencil. @returns {boolean} whether it was painted
 */
function fringe(/** @type {CanvasRenderingContext2D} */ x, /** @type {HTMLCanvasElement} */ layer, f, q, t, r, k, at, pic, box) {
  if (!t.mask) return false;
  const g0 = fringeOf(f, q.style, q.shape || {}), m = g0.m;
  const shape = make(layer.width, layer.height), sx = ctx(shape); at(sx);
  sx.fillStyle = '#fff';
  for (const c of g0.cover) sx.fill(line(c));
  const tf = sx.getTransform(), pts = g0.cover.flat().map(p => [tf.a * p.x + tf.c * p.y + tf.e, tf.b * p.x + tf.d * p.y + tf.f]);
  const bb = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
  // each cut's ends: how ragged, how far strands part, how much shows through, how far back it is combed from, how long
  // its ends thin out over, how far single strands stray past them, how much light it catches as it falls
  const how = /** @type {Record<string, { ends: number, apart: number, see: number, back: number, taper: number, wisp: number, sheen: number }>} */ ({
    blunt: { ends: .5, apart: .2, see: 0, back: .55, taper: .17, wisp: .04, sheen: .03 }, micro: { ends: .45, apart: .15, see: 0, back: .5, taper: .14, wisp: .03, sheen: .02 },
    wispy: { ends: 1, apart: .8, see: .26, back: .5, taper: .28, wisp: .12, sheen: .04 }, birkin: { ends: .9, apart: .65, see: .1, back: .55, taper: .24, wisp: .08, sheen: .05 },
    curtain: { ends: .9, apart: .55, see: .06, back: .2, taper: .42, wisp: .14, sheen: .1 }, side: { ends: .8, apart: .5, see: .04, back: .3, taper: .38, wisp: .12, sheen: .1 },
  })[q.style] || { ends: .6, apart: .25, see: 0, back: .4, taper: .2, wisp: .06, sheen: .04 };
  const ways = g0.ways.map(w => ({ lean: w.lean, curve: w.curve, from: (w.from - box[0]) * k, to: (w.to - box[0]) * k }));
  // weeks on, it has grown: longer (the hair with it), and its line gone softer and less even
  const g = Math.max(0, q.shape?.grow || 0), cut = g ? { ...how, ends: how.ends + g * 1.6, apart: Math.min(1, how.apart + g * .9), wisp: how.wisp + g * .5, taper: how.taper + g * .35 } : how;
  const hair = locks(pic, f, t.mask, at, shape, ways, m.F * k, { ...cut, straight: straightOf(pic, f, t.mask), h0: (m.hair - box[1]) * k, reach: reachOf(f, t.mask) + g, cx: (m.cx - box[0]) * k, half: m.bw * k / 2 }, r, t.hair, bb);
  if (!hair) return false;
  // its shadow on the forehead, a little below and softer, then the hair (dyed, if the look dyes it)
  const sh = make(layer.width, layer.height), shx = ctx(sh);
  shx.drawImage(soft(hair, m.F * k * .08), 0, m.F * k * .06); shx.globalCompositeOperation = 'source-in'; shx.fillStyle = css(shade(t.skin.dark, -.55), .32); shx.fillRect(0, 0, sh.width, sh.height);
  shx.globalCompositeOperation = 'destination-out'; shx.drawImage(hair, 0, 0);
  // dyed as the rest of the hair is (the layer's own alpha says where the hair is), but for its own roots, weeks on
  if (t.dye) {
    const own = t.roots ? make(hair.width, hair.height) : null;
    if (own && t.roots) { const ox = ctx(own); ox.drawImage(hair, 0, 0); ox.globalCompositeOperation = 'destination-in'; at(ox); ox.drawImage(t.roots, 0, 0, f.w, f.h); }
    dyeHair(ctx(hair), t.dye, null, /** @type {any} */ (hair).hairMean);
    if (own) ctx(hair).drawImage(own, 0, 0);
  }
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(sh, 0, 0); x.drawImage(hair, 0, 0); x.restore();
  return true;
}

/**
 * Brows, hair by hair: where the new shape is finer than the brow there, the old one blended into the skin round it;
 * then the shape filled softly in the brow's colour, and short hairs along it, rising at the inner end and lying along
 * the brow toward the tail.
 */
function brows(/** @type {CanvasRenderingContext2D} */ x, f, q, t, r, k, pic, box) {
  const m = measure(f), strokes = markup(f, 'brows', q.style, q.shape || {});
  const finer = ['thin', 'straight', 'arched', 'soft'].includes(q.style) || (q.shape?.full || 0) < -.2;
  if (finer) {
    // the brow there now, covered in the skin just above it (a concealer's blend)
    const r0 = pixels(pic, f);
    for (const ring of shapesOf(f).brows) {
      // the skin just above this brow, its own light
      const top = Math.min(...ring.map(p => p.y)), x0 = Math.min(...ring.map(p => p.x)), x1 = Math.max(...ring.map(p => p.x)), hgt = m.u * 3.2;
      const skin = tonesIn(r0, [[{ x: x0, y: top - hgt }, { x: x1, y: top - hgt }, { x: x1, y: top - m.u * .8 }, { x: x0, y: top - m.u * .8 }]]) || t.skin;
      x.save(); x.beginPath(); ring.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.closePath();
      x.filter = 'blur(' + (m.u * 1.3 * k).toFixed(2) + 'px)'; x.fillStyle = css(skin.mid, .5); x.fill(); x.restore();
    }
  }
  const col = t.brows.dark, n = q.style === 'bold' ? 1.5 : q.style === 'thin' ? .5 : 1;
  for (const s of strokes) {
    // the body, soft-edged
    x.save(); x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = css(col, q.style === 'feathered' ? .13 : q.style === 'bold' ? .34 : .22); x.lineWidth = s.w * (q.style === 'feathered' ? 1.8 : .9);
    x.filter = 'blur(' + (Math.max(.6, s.w * .18 * k)).toFixed(2) + 'px)'; x.stroke(new Path2D(s.d)); x.restore();
    // the hairs
    const pts = along(s.d, m.u * .35), w = q.style === 'feathered' ? m.u * 2.4 : s.w;
    x.save(); x.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dir = Math.atan2(b.y - a.y, b.x - a.x);
      for (let j = 0; j < 2 * n; j++) {
        const off = (r() - .5) * w * .8, nx = -Math.sin(dir), ny = Math.cos(dir), p = { x: b.x + nx * off, y: b.y + ny * off };
        // hairs rise near the inner end and lie along the brow further out
        const lean = dir + (r() - .5) * .5 - (b.y > a.y ? .35 : -.35) * .5, len = w * (.55 + r() * .7);
        x.strokeStyle = css(r() < .3 ? shade(col, -.3) : col, (q.style === 'bold' ? .3 : .18) + r() * .38); x.lineWidth = m.u * (.08 + r() * .1) + .25 / k;
        x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x + Math.cos(lean) * len * .6, p.y + Math.sin(lean) * len * .6 - len * .25); x.stroke();
      }
    }
    x.restore();
  }
  void pic; void box;
}

/** Liner, a wing, lashes: ink, a little soft, and for smoky a smudge of it over the lid. */
function ink(/** @type {CanvasRenderingContext2D} */ x, f, q, t, k) {
  const m = measure(f), strokes = markup(f, 'lashes', q.style, q.shape || {}), col = [22, 15, 13];
  x.lineCap = 'round'; x.lineJoin = 'round';
  const smoky = q.style === 'smoky';
  for (const [i, s] of strokes.entries()) {
    const lid = smoky && i % 2 === 1;
    if (smoky) {
      // a smoky eye is shadow, not a line: the lid's wide and soft, the line along the lashes smudged into it
      x.save(); x.strokeStyle = css(mix(col, t.skin.dark, lid ? .45 : .2), lid ? .3 : .5); x.lineWidth = s.w * (lid ? 3.4 : 1.5);
      x.filter = 'blur(' + (m.u * (lid ? 1.7 : .7) * k).toFixed(2) + 'px)'; x.stroke(new Path2D(s.d)); x.restore();
      continue;
    }
    x.save(); x.strokeStyle = css(col, .88); x.lineWidth = s.w;
    x.filter = 'blur(' + Math.max(.35, m.u * .08 * k).toFixed(2) + 'px)'; x.stroke(new Path2D(s.d)); x.restore();
  }
}

/**
 * A beard: its shape from the markup (the jaw's edge, closed along the moustache), soft where it meets the cheek, clear
 * of the lips; filled thinly in the hair's darker tones, so the skin's own light shows through, and grown hair by hair;
 * stubble is a shadow of it with its dots; a moustache only over the lip.
 */
function beard(/** @type {CanvasRenderingContext2D} */ x, /** @type {HTMLCanvasElement} */ layer, f, q, t, r, k, at, pic) {
  const m = measure(f), P = m.P, lips = LIPS.map(i => P(i)), col = mix(t.hair.dark, [16, 11, 9], .3);
  const strokes = markup(f, 'beard', q.style === 'stubble' ? 'trimmed' : q.style, q.style === 'stubble' ? { length: -1 } : q.shape || {});
  const lr = (/** @type {Pt[]} */ ps) => (ps[0].x <= ps[ps.length - 1].x ? ps : [...ps].reverse());
  const shape = make(layer.width, layer.height), sx = ctx(shape); at(sx);
  sx.fillStyle = sx.strokeStyle = '#fff'; sx.lineCap = 'round'; sx.lineJoin = 'round';
  if (q.style === 'moustache') { sx.lineWidth = (strokes[0]?.w || m.u * 2) * 2.1; strokes.forEach(s => sx.stroke(new Path2D(s.d))); }
  else {
    // its shape: down each cheek line (from the sideburn to the corner of the mouth), over the lip along the moustache,
    // and round the jaw's edge back to the start
    const edge = lr(along(strokes[0].d, m.u)), lip = lr(along(strokes[3].d, m.u));
    const cheeks = [along(strokes[1].d, m.u), along(strokes[2].d, m.u)].sort((a, b) => a[0].x - b[0].x);
    const ring = [...cheeks[0], ...lip, ...[...cheeks[1]].reverse(), ...[...edge].reverse()];
    sx.beginPath(); ring.forEach((p, i) => (i ? sx.lineTo(p.x, p.y) : sx.moveTo(p.x, p.y))); sx.closePath(); sx.fill();
    sx.lineWidth = strokes[3].w; sx.stroke(new Path2D(strokes[3].d));
  }
  // never over the lips
  sx.globalCompositeOperation = 'destination-out'; sx.beginPath(); lips.forEach((p, i) => (i ? sx.lineTo(p.x, p.y) : sx.moveTo(p.x, p.y))); sx.closePath(); sx.lineWidth = m.u * .7; sx.fill(); sx.stroke();
  // softer toward the cheek: the top of it fades
  sx.globalCompositeOperation = 'destination-in';
  const top = Math.min(P(234).y, P(454).y), g = sx.createLinearGradient(0, top, 0, P(2).y + m.bh * .04); g.addColorStop(0, 'rgb(255 255 255 / .25)'); g.addColorStop(1, '#fff');
  sx.fillStyle = g; sx.fillRect(m.bx - m.bw, m.by - m.bh, m.bw * 3, m.bh * 3);
  const mask = soft(shape, m.u * k * (q.style === 'stubble' ? 2 : 1.8));
  // how thick it grows: a base, then hair by hair, short and pointing down and out along the jaw
  const dens = make(layer.width, layer.height), dx = ctx(dens); at(dx);
  // (weeks on it has filled in)
  // (weeks on, it has filled in, and its hairs are longer)
  const full = q.style === 'full', stub = q.style === 'stubble', grow = Math.max(0, q.shape?.grow || 0), base = Math.min(.6, (stub ? .16 : q.style === 'moustache' ? .42 : full ? .44 : .3) + Math.min(.1, grow * .3));
  const gy = dx.createLinearGradient(0, Math.min(P(234).y, P(454).y), 0, P(152).y);
  gy.addColorStop(0, 'rgb(255 255 255 / ' + (base * .55).toFixed(3) + ')'); gy.addColorStop(.55, 'rgb(255 255 255 / ' + (base * .9).toFixed(3) + ')'); gy.addColorStop(1, 'rgb(255 255 255 / ' + base + ')');
  dx.fillStyle = gy; dx.fillRect(m.bx - m.bw, m.by - m.bh, m.bw * 3, m.bh * 3);
  const y0 = P(2).y - m.bh * .06, span = m.bh * .95;
  // never even: thicker in places and thinner in others, as a beard grows (a few cells of noise, eased between)
  const cells = make(12, 12), cx2 = ctx(cells), cd = cx2.createImageData(12, 12);
  for (let i = 0; i < cd.data.length; i += 4) { cd.data[i] = cd.data[i + 1] = cd.data[i + 2] = 255; cd.data[i + 3] = Math.round(255 * (.45 + r() * .55)); }
  cx2.putImageData(cd, 0, 0);
  dx.save(); dx.globalCompositeOperation = 'destination-in'; dx.imageSmoothingEnabled = true; dx.imageSmoothingQuality = 'high'; dx.drawImage(cells, m.bx - m.bw * .15, y0 - m.bh * .12, m.bw * 1.3, span + m.bh * .24); dx.restore();
  dx.lineCap = 'round';
  const many = Math.min(stub ? 5200 : 8000, Math.max(900, m.bw * k * (stub ? 12 : 21)));
  for (let i = 0; i < many; i++) {
    const p = { x: m.bx - m.bw * .1 + r() * m.bw * 1.2, y: y0 + r() * span }, side = (p.x - m.cx) / (m.bw / 2);
    if (stub) { dx.fillStyle = 'rgb(255 255 255 / ' + (.25 + r() * .5).toFixed(2) + ')'; dx.fillRect(p.x, p.y, m.u * .32, m.u * .32); continue; }
    const a = Math.PI / 2 + side * .55 + (r() - .5) * .8, len = Math.max(4 / k, m.u * (full ? 1.4 + r() * 2.2 : .75 + r() * 1.25) * (1 + grow * (full ? 1 : 1.6)));
    dx.strokeStyle = 'rgb(255 255 255 / ' + (.14 + r() * .42).toFixed(2) + ')'; dx.lineWidth = m.u * (.06 + r() * .08) + .3 / k;
    dx.beginPath(); dx.moveTo(p.x, p.y); dx.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len); dx.stroke();
  }
  dx.setTransform(1, 0, 0, 1, 0, 0); dx.globalCompositeOperation = 'destination-in'; dx.drawImage(mask, 0, 0);
  const grain = soft(dens, Math.max(.35, m.u * k * .12)); dx.globalCompositeOperation = 'copy'; dx.drawImage(grain, 0, 0); dx.globalCompositeOperation = 'source-over';
  // the skin under it, darkened toward the hair's own colour as thickly as the hair grows: the face's light stays on it
  const W = layer.width, H = layer.height, under = make(W, H), ux = ctx(under); at(ux); ux.drawImage(pic, 0, 0, f.w, f.h);
  const Dn = dx.getImageData(0, 0, W, H).data, Pi = ux.getImageData(0, 0, W, H), Pd = Pi.data;
  const ratio = [0, 1, 2].map(c => Math.max(.07, Math.min(1, col[c] / Math.max(40, t.skin.mid[c]))));
  const sheen = mix(t.hair.mid, t.hair.light, .3);
  for (let j = 0; j < Pd.length; j += 4) {
    const d = Dn[j + 3] / 255; if (d <= .003) { Pd[j + 3] = 0; continue; }
    const g = Math.min(.92, d * 1.05);
    for (let c = 0; c < 3; c++) Pd[j + c] = Pd[j + c] * (1 - g + g * ratio[c]) * (1 - .1 * g) + sheen[c] * .1 * g * g;
    Pd[j + 3] = 255;
  }
  ux.putImageData(Pi, 0, 0);
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(under, 0, 0); x.restore();
}
