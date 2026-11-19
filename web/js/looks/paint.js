/**
 * Paint, where the picture is a photograph: a look laid on a real face from the face itself, so it reads as hair and
 * make-up rather than as a line drawn over someone. A fringe is the person's own hair brought forward (combed: mirrored
 * down through the hairline the way it falls, so its curl, grey and grain are theirs) and casts its shadow on the
 * forehead; where the hair in the picture is not known, it falls in strands of their hair's tones instead. Brows are
 * filled hair by hair in their own colour (the old shape blended away where the new one is finer); liner is ink and a
 * smoky eye shadow; a beard darkens the skin's own light toward the hair's colour. A cut stays a line: only a render can
 * take hair away. Whatever shows this still says Sketch: it is drawn here.
 */
import { markup } from './markup.js';
import { shapesOf, LIPS } from '../studio/face.js';
import { dyeHair } from './tint.js';

/** The parts painted on a photograph; the others are a pencil line (a cut) or a colour washed in (hair colour, lips). */
export const PAINTED = new Set(['bangs', 'brows', 'lashes', 'beard']);

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
/** @param {CanvasImageSource & { width: number, height: number }} pic @param {import('../studio/face.js').Face} f */
function pixels(pic, f) {
  let r = read.get(pic);
  if (!r) { const k = Math.min(1, 720 / Math.max(f.w, f.h)), c = make(f.w * k, f.h * k); ctx(c).drawImage(pic, 0, 0, c.width, c.height); r = { c, k }; read.set(pic, r); }
  return r;
}
/**
 * The tones of a region of the picture (darkest, middle, lightest of what is kept), from its pixels sorted by how light.
 * @param {{ c: HTMLCanvasElement, k: number }} r @param {Pt[][]} rings where to look, in the picture's pixels
 * @param {(i: number) => boolean} [keep] which of the region's pixels count @returns {Tones | null}
 */
function tonesIn(r, rings, keep) {
  const all = rings.flat(); if (!all.length) return null;
  const x0 = Math.max(0, Math.floor(Math.min(...all.map(p => p.x)) * r.k)), y0 = Math.max(0, Math.floor(Math.min(...all.map(p => p.y)) * r.k));
  const x1 = Math.min(r.c.width, Math.ceil(Math.max(...all.map(p => p.x)) * r.k)), y1 = Math.min(r.c.height, Math.ceil(Math.max(...all.map(p => p.y)) * r.k));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  const m = make(x1 - x0, y1 - y0), mx = ctx(m);
  mx.fillStyle = '#fff'; mx.beginPath();
  for (const ring of rings) ring.forEach((p, i) => (i ? mx.lineTo(p.x * r.k - x0, p.y * r.k - y0) : mx.moveTo(p.x * r.k - x0, p.y * r.k - y0)));
  mx.fill();
  const inside = mx.getImageData(0, 0, m.width, m.height).data, d = ctx(r.c).getImageData(x0, y0, m.width, m.height).data, px = [];
  for (let i = 0; i < inside.length; i += 4) if (inside[i + 3] > 127 && (!keep || keep(i))) px.push([d[i], d[i + 1], d[i + 2]]);
  if (px.length < 8) return null;
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
 * The colours a look is painted in, from the picture: the hair (from the hair found in it if given, else the crown above
 * the forehead), the brows, and the skin (for the shadows cast on it).
 * @param {CanvasImageSource & { width: number, height: number }} pic @param {import('../studio/face.js').Face} f @param {(CanvasImageSource & { width: number, height: number }) | null} [hairMask]
 */
export function coloursOf(pic, f, hairMask = null) {
  const r = pixels(pic, f), m = measure(f), s = shapesOf(f);
  let hair = null;
  if (hairMask) {
    const hm = make(r.c.width, r.c.height), hx = ctx(hm); hx.drawImage(hairMask, 0, 0, hm.width, hm.height);
    const all = hx.getImageData(0, 0, hm.width, hm.height).data, W = hm.width;
    // the hair round the top of the head, where the mask is sure of it
    const ring = [{ x: m.bx - m.bw * .3, y: m.by - m.bh * .45 }, { x: m.bx + m.bw * 1.3, y: m.by - m.bh * .45 }, { x: m.bx + m.bw * 1.3, y: m.brow }, { x: m.bx - m.bw * .3, y: m.brow }];
    const x0 = Math.max(0, Math.floor(ring[0].x * r.k)), y0 = Math.max(0, Math.floor(ring[0].y * r.k)), w = Math.min(r.c.width, Math.ceil(ring[1].x * r.k)) - x0;
    hair = tonesIn(r, [ring], (i) => { const px = i / 4, x = x0 + px % w, y = y0 + Math.floor(px / w); return all[(y * W + x) * 4 + 3] > 160 && all[(y * W + x) * 4] > 160; });
  }
  // no mask: the crown, just above the hairline, across the middle of the head
  hair ||= tonesIn(r, [[{ x: m.cx - m.bw * .26, y: m.hair - m.F * .62 }, { x: m.cx + m.bw * .26, y: m.hair - m.F * .62 }, { x: m.cx + m.bw * .2, y: m.hair - m.F * .12 }, { x: m.cx - m.bw * .2, y: m.hair - m.F * .12 }]]);
  const brows = tonesIn(r, s.brows), skin = tonesIn(r, [[m.P(50), m.P(101), m.P(118), m.P(117)], [m.P(280), m.P(330), m.P(347), m.P(346)]]);
  const fall = /** @type {Tones} */ ({ dark: [38, 26, 20], mid: [70, 50, 38], light: [120, 92, 70] });
  return { hair: hair || fall, brows: brows || hair || fall, skin: skin || { dark: [120, 86, 70], mid: [170, 128, 104], light: [210, 170, 146] }, mask: hairMask };
}

/** How straight a picture's hair is, read once. @type {WeakMap<object, number>} */
const straightness = new WeakMap();
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
 * The person's own hair, brought forward: each point of a fringe takes the hair that lies past the hairline the way
 * the fringe falls, mirrored through the hairline (and back again where the hair runs out), so its curl, its grey, its
 * light and its grain are the person's own, and it meets the hair already there without a seam. Where the picture
 * shows no hair on the way (a parting, the wall past short hair) the hair round it stands in, blurred. One line runs up
 * from the fringe's lowest row through each pixel across, leaning the way the hair falls; each line's end is its own
 * (some strands shorter, by how far apart they part), ragged by the hair's own light, and the hair is a little lighter
 * where it bends forward and deeper toward its ends.
 * @param {CanvasImageSource} pic @param {import('../studio/face.js').Face} f @param {CanvasImageSource} hairMask
 * @param {(x: CanvasRenderingContext2D) => void} at @param {HTMLCanvasElement} shape the fringe's shape over the layer
 * @param {{ lean: number, from: number, to: number }[]} ways how far a line moves across for each row up, and the columns of the layer it fills (a curtain's two sides lean each its own way)
 * @param {number} deep how far into the hair a line may go, in the layer's pixels @param {number} F the forehead's height, in them
 * @param {{ ends: number, apart: number, see: number, back: number, straight: number }} how how ragged the ends are, how far strands part, how much shows through, how far back from the hairline it is combed from (of the forehead's height), how straight the hair is
 * @param {() => number} r @param {Tones} skin the face's own skin, which is never taken for hair @returns {HTMLCanvasElement | null}
 */
function combed(pic, f, hairMask, at, shape, ways, deep, F, how, r, skin) {
  const W = shape.width, H = shape.height, sd = ctx(shape).getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sd[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < x0) return null;
  const tall = y1 - y0 + deep, lm = Math.max(...ways.map(w => Math.abs(w.lean)));
  const rx0 = Math.max(0, Math.floor(x0 - tall * lm - 2)), rx1 = Math.min(W, Math.ceil(x1 + tall * lm + 3)), ry0 = Math.max(0, Math.floor(y0 - deep)), ry1 = Math.min(H, y1 + 1);
  const rw = rx1 - rx0, rh = ry1 - ry0; if (rw < 4 || rh < 4) return null;
  const grab = (/** @type {CanvasImageSource} */ src) => { const c = make(rw, rh), x = ctx(c); at(x); const t = x.getTransform(); x.setTransform(t.a, 0, 0, t.d, t.e - rx0, t.f - ry0); x.drawImage(src, 0, 0, f.w, f.h); return c; };
  const pc = grab(pic), mc = grab(hairMask);
  const S = ctx(pc).getImageData(0, 0, rw, rh).data, M = ctx(mc).getImageData(0, 0, rw, rh).data;
  // the hair alone, spread into what is not hair round it: blurred, its colour is the hair's nearby
  const ho = make(rw, rh), hx = ctx(ho); hx.drawImage(pc, 0, 0); hx.globalCompositeOperation = 'destination-in'; hx.drawImage(mc, 0, 0);
  const B = ctx(soft(ho, Math.max(2, F * .18))).getImageData(0, 0, rw, rh).data;
  // the hair's lightest, so what is much lighter (a parting's skin, a wall between strands) can be told from it
  const hist = new Uint32Array(256); let hn = 0;
  for (let j = 0; j < M.length; j += 4) if (M[j + 3] > 200) { hist[Math.round(.2126 * S[j] + .7152 * S[j + 1] + .0722 * S[j + 2])]++; hn++; }
  let hi = 255; for (let v = 0, c = 0; v < 256; v++) { c += hist[v]; if (c >= hn * .9) { hi = v; break; } }
  const over = hi + 14, skinAt = [skin.mid, skin.light, mix(skin.mid, skin.dark, .5)];
  // how far skin can be told from this hair by its colour: not at all where they are alike (a warm blonde on fair skin)
  const hairMid = [0, 0, 0]; { let c = 0; for (let j = 0; j < M.length; j += 16) if (M[j + 3] > 200) { hairMid[0] += S[j]; hairMid[1] += S[j + 1]; hairMid[2] += S[j + 2]; c++; } if (c) for (let q = 0; q < 3; q++) hairMid[q] /= c; }
  const skinny = Math.max(0, Math.min(1, (Math.hypot(hairMid[0] - skin.mid[0], hairMid[1] - skin.mid[1], hairMid[2] - skin.mid[2]) - 30) / 30));
  // what a line takes from: the picture where it is hair, the hair round it where it is not
  const src = new Float32Array(rw * rh * 3);
  let sum = 0, n = 0;
  for (let i = 0, j = 0; i < rw * rh; i++, j += 4) {
    const lj = .2126 * S[j] + .7152 * S[j + 1] + .0722 * S[j + 2];
    let near = 1e9; for (const s of skinAt) { const dr = S[j] - s[0], dg = S[j + 1] - s[1], db = S[j + 2] - s[2]; near = Math.min(near, Math.sqrt(dr * dr + dg * dg + db * db)); }
    const bright = Math.max(Math.max(0, Math.min(1, (lj - over) / 36)), skinny * Math.max(0, Math.min(1, (34 - near) / 16)));
    const a = Math.max(0, Math.min(1, (M[j + 3] - 80) / 110)) * (1 - bright), b = B[j + 3] > 4 ? 1 - a : 0, s = a + b || 1;
    src[i * 3] = (S[j] * a + B[j] * b) / s; src[i * 3 + 1] = (S[j + 1] * a + B[j + 1] * b) / s; src[i * 3 + 2] = (S[j + 2] * a + B[j + 2] * b) / s;
    if (a > .5) { sum += .2126 * S[j] + .7152 * S[j + 1] + .0722 * S[j + 2]; n++; }
  }
  if (n < 16) return null;
  const mean = sum / n;
  const straight = how.straight;

  // straight hair brought forward falls in strands: what it takes is drawn out along its fall, and each strand its own light
  const fall = F * (.04 + .34 * straight), taps = straight > .15 ? 5 : 1, strand = noise1(r, W * 2, 1.3);
  const hairAt = (/** @type {number} */ x, /** @type {number} */ y) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < rw && yi < rh ? M[(yi * rw + xi) * 4 + 3] : 0; };
  // bilinear, from what a line takes from
  const take = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number[]} */ o) => {
    x = Math.max(0, Math.min(rw - 1.001, x)); y = Math.max(0, Math.min(rh - 1.001, y));
    const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, a = (yi * rw + xi) * 3, b = a + 3, c = a + rw * 3, d = c + 3;
    for (let ch = 0; ch < 3; ch++) o[ch] = (src[a + ch] * (1 - u) + src[b + ch] * u) * (1 - v) + (src[c + ch] * (1 - u) + src[d + ch] * u) * v;
    return o;
  };
  const out = make(W, H), ox = ctx(out), img = ox.createImageData(rw, rh), D = img.data;
  const fine = noise1(r, W, Math.max(2, F * .07)), see = noise1(r, W, Math.max(3, F * .12)), hairs = noise1(r, W * 2, Math.max(1, F * .014));
  // the fringe in pieces: clumps of strands across it, each its own length, each coming to a point
  const pieces = /** @type {{ a: number, b: number, len: number }[]} */ ([]);
  for (let px = x0 - tall - F; px < x1 + tall + F;) { const w = F * (.14 + r() * .2); pieces.push({ a: px, b: px + w, len: .55 + r() * .6 }); px += w; }
  const pieceAt = (/** @type {number} */ x) => { let lo = 0, hi = pieces.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pieces[mid].a <= x) lo = mid; else hi = mid - 1; } return pieces[lo]; };
  // the hair is combed forward from a little way back from the hairline, so the front of a parting goes under it
  const fade = Math.max(2, F * .17), seam = F * .3, back = F * how.back, o = [0, 0, 0];
  const combedPx = new Uint8Array(rw * rh);
  const hs = new Uint8Array(rh), from = new Int32Array(rh), run = new Int32Array(rh);
  let sumC = 0, nC = 0;
  for (const way of ways) for (let xb = Math.floor(x0 - tall * Math.abs(way.lean)); xb <= Math.ceil(x1 + tall * Math.abs(way.lean)); xb++) {
    const L = way.lean, xAt = (/** @type {number} */ y) => xb + (y1 - y) * L - rx0;
    // down the line from the top: hair or not (firmly either way), and for each row off the hair, the hair just above
    // it (its last row, and how deep it went); and the lowest row the fringe covers
    let inHair = false, last = -1, runTop = -1, end = -1;
    for (let y = ry0; y <= y1; y++) {
      const i = y - ry0, xr = Math.round(xAt(y)), h = xr >= 0 && xr < rw ? M[(i * rw + xr) * 4 + 3] : 0;
      if (!inHair && h > 140) { inHair = true; runTop = y; } else if (inHair && h < 60) inHair = false;
      hs[i] = inHair ? 1 : 0;
      if (inHair) { last = y; run[i] = y - runTop + 1; } else { from[i] = last; run[i] = last >= 0 ? last - runTop + 1 : 0; }
      const xs = xr + rx0; if (xs >= 0 && xs < W && sd[(y * W + xs) * 4 + 3] > 128) end = y;
    }
    if (end < 0) continue;
    // this strand's own end: some a little shorter than the shape, by how far apart they part
    const pc0 = pieceAt(xb), u = Math.min(1, Math.abs(xb - (pc0.a + pc0.b) / 2) / ((pc0.b - pc0.a) / 2));
    // its own length: its clump's (rounded, the middle longest, each clump its own length) and its own as a strand
    const cut = how.apart * F * (.16 * (1 - Math.cos(Math.PI * u)) / 2 * pc0.len + .1 * (1 - pc0.len) + .04 * (fine(xb) * .5 + .5))
      + (hairs(xb + W) * .5 + .5) * F * (.035 + .07 * how.apart);
    const thin = 1 - how.see * (.5 + .5 * see(xb));
    // and up it again, writing: off the hair (and a little way back into it), the hair above mirrored down; above that,
    // itself, fading out, so the two meet without a seam
    let below = -1e9, hairline = -1;
    for (let y = Math.min(y1, end + Math.ceil(fade)); y >= ry0; y--) {
      const i = y - ry0, xf = xAt(y), xr = Math.round(xf) + rx0;
      if (hs[i] && hairline < 0 && below > -1e9) hairline = y;
      if (!hs[i]) hairline = -1;
      if (xr < 0 || xr >= W || xr < way.from || xr >= way.to) continue;
      const A = sd[(y * W + xr) * 4 + 3] / 255; if (A <= 0) continue;
      let alpha = 0, lift = 1;
      const hy = hs[i] ? hairline : from[i], axis = hy - Math.min(back, Math.max(0, run[i] - 4) * .5);
      if (hy >= 0 && y > axis) {
        const d = (y - axis) / 1.12, avail = Math.max(2, Math.min(run[i] - (hy - axis), deep)), p = d % (2 * avail), t = p <= avail ? p : 2 * avail - p, ty = axis - t;
        if (taps > 1) {
          let s0 = 0, s1 = 0, s2 = 0;
          for (let q = 0; q < taps; q++) { const yy = ty + (q / (taps - 1) - .5) * fall; take(xb + (y1 - yy) * L - rx0, yy - ry0, o); s0 += o[0]; s1 += o[1]; s2 += o[2]; }
          const sh2 = 1 + .16 * straight * strand(xb + 3 * W);
          o[0] = s0 / taps * sh2; o[1] = s1 / taps * sh2; o[2] = s2 / taps * sh2;
        } else take(xb + (y1 - ty) * L - rx0, ty - ry0, o);
        const l = .2126 * o[0] + .7152 * o[1] + .0722 * o[2], tex = Math.max(-1, Math.min(1, (l - mean) / 40));
        // the ends: this strand's, made ragged by its own light; where strands part, the forehead shows between them
        // more toward their ends
        const along = Math.max(0, y - hy) / Math.max(1, end - hy);
        const fromEnd = end - y - cut + tex * how.ends * F * .1, tip = Math.max(0, Math.min(1, fromEnd / fade));
        alpha = A * tip * tip * (3 - 2 * tip) * thin;
        if (hs[i]) { const up = Math.max(0, Math.min(1, (hy - y) / Math.max(1, hy - axis))); alpha *= 1 - up * up * (3 - 2 * up); }
        // lighter where it bends forward
        const dd = y - axis, bend = dd < F * .5 ? Math.sin(Math.PI * dd / (F * .5)) : 0;
        lift = 1 + .09 * bend - .05 * along;
        if (!hs[i]) { sumC += l * lift; nC++; }
        combedPx[i * rw + (xr - rx0)] = 1;
        below = y;
      } else {
        const dn = below - y; if (dn > seam || below < -1e8) continue;
        take(xf, i, o); alpha = A * (1 - dn / seam);
      }
      if (alpha <= .004) continue;
      const k4 = (i * rw + (xr - rx0)) * 4;
      D[k4] = o[0] * lift; D[k4 + 1] = o[1] * lift; D[k4 + 2] = o[2] * lift; D[k4 + 3] = Math.max(D[k4 + 3], alpha * 255);
    }
  }
  // as light as the hair is: what is brought forward came from nearer the roots, a little darker than the hair seen
  let mid = mean; for (let v = 0, c = 0; v < 256; v++) { c += hist[v]; if (c >= hn * .55) { mid = v; break; } }
  if (nC > 32) {
    const gain = Math.max(1, Math.min(1.45, Math.max(mean, mid) / Math.max(1, sumC / nC)));
    if (gain > 1.01) for (let j = 0, i = 0; j < D.length; j += 4, i++) if (D[j + 3] && combedPx[i]) { D[j] *= gain; D[j + 1] *= gain; D[j + 2] *= gain; }
  }
  ox.putImageData(img, rx0, ry0);
  /** @type {any} */ (out).hairMean = mid;
  return out;
}

/**
 * A look painted over a photograph: transparent but where it is painted, over box (picture pixels) at k output pixels
 * to one of the picture's. Only the parts in PAINTED; the rest is left to the pencil and the washes.
 * @param {CanvasImageSource & { width: number, height: number }} pic @param {import('../studio/face.js').Face} f
 * @param {{ part: string, style: string, shape?: Record<string, number> }[]} look
 * @param {number[]} box @param {number} k @param {ReturnType<typeof coloursOf> & { dye?: string }} [tone] a dye: the hair colour the look also asks for, which the fringe and the beard take
 * @returns {HTMLCanvasElement | null}
 */
export function paintLook(pic, f, look, box, k, tone) {
  const parts = look.filter(q => PAINTED.has(q.part)); if (!parts.length) return null;
  const t = tone || coloursOf(pic, f), out = make(box[2] * k, box[3] * k), o = ctx(out);
  const at = (/** @type {CanvasRenderingContext2D} */ x) => x.setTransform(k, 0, 0, k, -box[0] * k, -box[1] * k);
  // the parts laid on in the order make-up and hair are: brows, eyes, then a beard, then the fringe over all
  const order = ['brows', 'lashes', 'beard', 'bangs'];
  for (const q of [...parts].sort((a, b) => order.indexOf(a.part) - order.indexOf(b.part))) {
    const layer = make(out.width, out.height), x = ctx(layer); at(x);
    const r = rng(q.part.length * 977 + q.style.length * 131 + Math.round(f.box[2]));
    if (q.part === 'bangs') fringe(x, layer, f, q, t, r, k, at, pic, box);
    else if (q.part === 'brows') brows(x, f, q, t, r, k, pic, box);
    else if (q.part === 'lashes') ink(x, f, q, t, k);
    else if (q.part === 'beard') beard(x, layer, f, q, t, r, k, at, pic);
    o.drawImage(layer, 0, 0);
  }
  return out;
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
 * there) and the lines its strands follow, with how far a strand may stray from its line. Straight fringes fall from
 * the markup's own strokes; curtains part in the middle and sweep down and out to the cheekbones, leaving the middle
 * of the forehead open; a side fringe sweeps from its parting across to the far temple. Shaped as the markup is.
 * @param {import('../studio/face.js').Face} f @param {string} style @param {Record<string, number>} shape
 */
function fringeOf(f, style, shape) {
  const m = measure(f), P = m.P, v = (/** @type {string} */ id) => Math.max(-1, Math.min(1, shape[id] || 0));
  // each side of the face by where it is in the picture (a mirrored picture has its points mirrored too)
  const by = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ s) => ((P(a).x < P(b).x) === (s < 0) ? P(a) : P(b));
  const side = (/** @type {number} */ s) => ({ temple: by(54, 284, s), cheek: by(234, 454, s), corner: by(33, 263, s), browOut: by(70, 300, s) });
  /** @typedef {{ cover: Pt[][], flow: Pt[][], along: (d: Pt, s: number, t: number) => Pt, m: ReturnType<typeof measure>, thick: number, straight: boolean, dir: number, ways: { lean: number, from: number, to: number }[] }} Fringe */
  /** @type {Fringe} */
  const out = { cover: [], flow: [], along: (d) => d, m, thick: 0, straight: false, dir: 0, ways: [{ lean: 0, from: -Infinity, to: Infinity }] };
  if (style === 'curtain') {
    const mid = m.cx + v('part') * m.bw * .12, drop = v('length') * m.F * .9;
    for (const s of [-1, 1]) {
      // the inner edge: from the parting, an arch over the middle of the forehead, down past the brow's outer half to
      // the cheekbone; the hair it covers is everything outside it, up to the hair already there
      const sd = side(s), browMid = { x: (sd.browOut.x + P(s * (P(263).x - P(33).x) > 0 ? 334 : 105).x) / 2, y: m.brow };
      const sd2 = sd, edge = smooth([{ x: mid + s * m.bw * .006, y: m.hair - m.F * .25 }, { x: mid + s * m.bw * .07, y: m.hair + m.F * .28 }, { x: mid + s * m.bw * .19, y: m.hair + m.F * .66 + drop * .2 }, { x: browMid.x + s * m.bw * .03, y: m.brow - m.F * .16 + drop * .4 }, { x: sd2.corner.x + s * m.bw * .07, y: sd2.corner.y - m.F * .05 + drop * .7 }, { x: sd2.cheek.x - s * m.bw * .03, y: sd2.corner.y + m.F * .6 + drop }]);
      const back = [{ x: sd.cheek.x + s * m.bw * .03, y: sd.corner.y + m.F * .15 + drop }, { x: sd.temple.x + s * m.bw * .08, y: m.hair + m.F * .05 }, { x: sd.temple.x + s * m.bw * .02, y: m.hair - m.F * 1.6 }, { x: mid + s * m.bw * .008, y: m.hair - m.F * 2 }];
      out.cover.push([...edge, ...back]); out.flow.push(edge);
    }
    out.along = (d, s, t) => ({ x: d.x + s * t * m.bw * .2, y: d.y - t * m.F * .42 });
    out.ways = [{ lean: .42, from: -Infinity, to: mid }, { lean: -.42, from: mid, to: Infinity }];
    return out;
  }
  if (style === 'side') {
    const part = m.cx - m.bw * .2 + v('part') * m.bw * .15, drop = v('length') * m.F * .6, dir = part < m.cx ? 1 : -1, far = side(dir);
    const edge = smooth([{ x: part, y: m.hair - m.F * .2 }, { x: part + dir * m.bw * .04, y: m.hair + m.F * .32 }, { x: part + dir * m.bw * .16, y: m.hair + m.F * .66 + drop * .3 }, { x: m.cx + dir * m.bw * .16, y: m.brow - m.F * .26 + drop * .6 }, { x: far.browOut.x - dir * m.bw * .02, y: m.brow - m.F * .08 + drop * .8 }, { x: far.temple.x + dir * m.bw * .03, y: m.brow + m.F * .2 + drop }]);
    const back = [{ x: far.temple.x + dir * m.bw * .09, y: m.brow - m.F * .4 + drop }, { x: far.temple.x + dir * m.bw * .06, y: m.hair - m.F * .35 }, { x: far.temple.x + dir * m.bw * .02, y: m.hair - m.F * 1.6 }, { x: part - dir * m.bw * .04, y: m.hair - m.F * 2 }];
    out.cover.push([...edge, ...back]); out.flow.push(edge);
    out.along = (d, s, t) => ({ x: d.x - dir * t * m.bw * .1, y: d.y - t * m.F * .55 }); out.dir = dir;
    out.ways = [{ lean: -dir * .6, from: -Infinity, to: Infinity }];
    return out;
  }
  // straight fringes: the markup's strands, closed into one, and a bridge up into the hair across the top
  const strokes = markup(f, 'bangs', style, shape), L = side(-1).temple, R = side(1).temple;
  // each line resampled to the same number of points, so strands can be drawn anywhere between two of them
  const even = (/** @type {Pt[]} */ ps, n = 24) => Array.from({ length: n }, (_, i) => ps[Math.min(ps.length - 1, Math.round(i / (n - 1) * (ps.length - 1)))]);
  out.flow = strokes.filter(s => s.w < m.u * .8).map(s => even(along(s.d, m.u * .6))).sort((a, b) => a[0].x - b[0].x);
  // the shape: across the top of the head, down each temple, and along where its strands end (a Birkin parts a little
  // in the middle)
  const ends = out.flow.map(fl => fl[fl.length - 1]);
  if (style === 'birkin' && ends.length > 3) { const i = ends.findIndex(p => p.x > m.cx); if (i > 0) ends.splice(i, 0, { x: m.cx, y: (ends[i - 1].y + ends[i].y) / 2 - m.F * .16 }); }
  const low = ends.length > 1 ? smooth(ends, 4) : [];
  out.cover.push([{ x: L.x - m.bw * .02, y: m.hair - m.F * 2 }, { x: R.x + m.bw * .02, y: m.hair - m.F * 2 }, { x: R.x + m.bw * .03, y: m.hair + m.F * .1 }, ...[...low].reverse(), { x: L.x - m.bw * .03, y: m.hair + m.F * .1 }]);
  out.along = (d, s, t) => ({ x: d.x + (t - .5) * m.bw * .02, y: d.y + (s - .5) * m.F * .04 }); out.straight = true;
  return out;
}

/**
 * A fringe: the shape it covers, filled with strands of the hair's own tones that fall along its lines, a sheen where
 * it curves, fading in above the hairline into the hair already there, and its shadow on the forehead.
 */
function fringe(/** @type {CanvasRenderingContext2D} */ x, /** @type {HTMLCanvasElement} */ layer, f, q, t, r, k, at, pic, box) {
  const g0 = fringeOf(f, q.style, q.shape || {}), m = g0.m;
  const shape = make(layer.width, layer.height), sx = ctx(shape); at(sx);
  sx.lineCap = 'round'; sx.lineJoin = 'round'; sx.strokeStyle = sx.fillStyle = '#fff';
  for (const c of g0.cover) sx.fill(line(c));
  // where the hair in the picture is known: the person's own hair, brought forward
  if (t.mask) {
    const how = /** @type {Record<string, { ends: number, apart: number, see: number, back: number }>} */ ({ blunt: { ends: .5, apart: .2, see: 0, back: .55 }, micro: { ends: .45, apart: .15, see: 0, back: .5 }, wispy: { ends: 1, apart: .8, see: .26, back: .5 }, birkin: { ends: .9, apart: .65, see: .1, back: .55 }, curtain: { ends: .9, apart: .55, see: .06, back: .2 }, side: { ends: .8, apart: .5, see: .04, back: .3 } })[q.style] || { ends: .6, apart: .25, see: 0, back: .4 };
    const ways = g0.ways.map(w => ({ lean: w.lean, from: (w.from - box[0]) * k, to: (w.to - box[0]) * k }));
    const hair = combed(pic, f, t.mask, at, soft(shape, m.F * k * .035), ways, m.F * k * 2.4, m.F * k, { ...how, straight: straightOf(pic, f, t.mask) }, r, t.skin);
    if (hair) {
      // its shadow on the forehead, a little below and softer, then the hair (dyed, if the look dyes it)
      const sh = make(layer.width, layer.height), shx = ctx(sh);
      shx.drawImage(soft(hair, m.F * k * .06), 0, m.F * k * .05); shx.globalCompositeOperation = 'source-in'; shx.fillStyle = css(shade(t.skin.dark, -.55), .38); shx.fillRect(0, 0, sh.width, sh.height);
      shx.globalCompositeOperation = 'destination-out'; shx.drawImage(hair, 0, 0);
      // dyed as the rest of the hair is (the layer's own alpha says where the hair is)
      if (t.dye) dyeHair(ctx(hair), t.dye, null, /** @type {any} */ (hair).hairMean);
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(sh, 0, 0); x.drawImage(hair, 0, 0); x.restore();
      return;
    }
  }
  if (g0.thick) { sx.lineWidth = g0.thick; for (const fl of g0.flow) sx.stroke(line(fl)); }
  // the shape, fading in above the hairline into the hair already there (the fill and the strands alike)
  const fade = (/** @type {number} */ a, /** @type {number} */ b) => { const c = make(shape.width, shape.height), cx = ctx(c); cx.drawImage(shape, 0, 0); at(cx); cx.globalCompositeOperation = 'destination-in'; const g = cx.createLinearGradient(0, m.hair + m.F * a, 0, m.hair + m.F * b); g.addColorStop(0, 'rgb(255 255 255 / 0)'); g.addColorStop(1, '#fff'); cx.fillStyle = g; cx.fillRect(m.bx - m.bw, m.by - m.bh, m.bw * 3, m.bh * 3); return soft(c, m.F * k * .03); };
  const mask = fade(-.62, -.02), body = mask;
  // its shadow, a little below and softer, on the skin
  const sh = make(layer.width, layer.height), shx = ctx(sh);
  shx.drawImage(soft(body, m.F * k * .07), 0, m.F * k * .06); shx.globalCompositeOperation = 'source-in'; shx.fillStyle = css(shade(t.skin.dark, -.55), .42); shx.fillRect(0, 0, sh.width, sh.height);
  // the hair: a base between its middle and dark tones, then strands along its lines in its own tones
  const hair = make(layer.width, layer.height), hx = ctx(hair); at(hx);
  const light = lum(t.hair.mid) > 105;
  // the body: the hair's tone, under the strands, kept to where the fringe is sure
  const fill = make(layer.width, layer.height), fx = ctx(fill);
  fx.fillStyle = css(mix(t.hair.mid, t.hair.light, light ? .25 : .3)); fx.fillRect(0, 0, fill.width, fill.height);
  fx.globalCompositeOperation = 'destination-in'; fx.drawImage(body, 0, 0);
  hx.lineCap = 'round'; hx.lineJoin = 'round';
  // light hair (grey, blonde) is many tones at once: dark strands under light ones, and some nearly white
  const tonesOf = light ? [shade(t.hair.dark, -.15), mix(t.hair.dark, t.hair.mid, .5), mix(t.hair.mid, t.hair.light, .5), t.hair.light, shade(t.hair.light, .5)]
    : [shade(t.hair.dark, -.2), t.hair.dark, t.hair.mid, mix(t.hair.mid, t.hair.light, .5), t.hair.light];
  // light caught in clumps, not evenly: a slow wave across the fringe lifts some strands' tones and lowers others'
  const phase = r() * 6.28, clump = (/** @type {number} */ u) => Math.sin(u * 13 + phase) * .5 + Math.sin(u * 5.3 + phase * 2) * .5;
  if (g0.straight) {
    const fl = g0.flow, N = Math.round(Math.min(2600, Math.max(320, m.bw * k * 8)));
    for (let j = 0; j < N && fl.length > 1; j++) {
      // a strand anywhere across the fringe: between two of its lines, and ending a little short or long
      const u = r(), at = u * (fl.length - 1), i = Math.min(fl.length - 2, Math.floor(at)), w = at - i, a = fl[i], b = fl[i + 1];
      const end = Math.round((a.length - 1) * (.82 + r() * .2)), jx = (r() - .5) * m.u * .8;
      const ps2 = []; for (let p = 0; p <= Math.min(end, a.length - 1); p++) ps2.push({ x: a[p].x + (b[p].x - a[p].x) * w + jx * (p / a.length), y: a[p].y + (b[p].y - a[p].y) * w });
      const lift = clump(u) + (r() - .5) * 1.4, tone = tonesOf[Math.max(0, Math.min(4, Math.round(1.6 + lift * 1.4)))];
      hx.strokeStyle = css(tone, (light ? .45 : .3) + r() * .5); hx.lineWidth = m.u * (.1 + r() * .26) + .35 / k;
      hx.stroke(line(ps2));
    }
  }
  const n = g0.straight ? 0 : Math.round(Math.min(2400, Math.max(300, m.bw * k * 7)) / Math.max(1, g0.flow.length));
  for (const [i, fl] of (g0.straight ? [] : g0.flow).entries()) {
    const s = g0.flow.length === 2 ? (i ? 1 : -1) : 1;
    for (let j = 0; j < n; j++) {
      const tt = Math.pow(r(), .8), off = g0.along({ x: 0, y: 0 }, g0.dir ? 1 : s, tt), jx = (r() - .5) * m.u * 1.2, jy = (r() - .5) * m.u * 1.2;
      const p = line(fl), lift = clump(tt) + (r() - .5) * 1.4, tone = tonesOf[Math.max(0, Math.min(4, Math.round(1.6 + lift * 1.4)))];
      hx.save(); hx.translate(off.x + jx, off.y + jy);
      hx.strokeStyle = css(tone, .22 + r() * .5); hx.lineWidth = m.u * (.1 + r() * .28) + .35 / k;
      hx.stroke(p); hx.restore();
    }
    // a sheen along where it curves, the light on it
    hx.save(); const o = g0.along({ x: 0, y: 0 }, g0.dir ? 1 : s, .35); hx.translate(o.x, o.y); hx.strokeStyle = css(shade(t.hair.light, .3), light ? .06 : .09); hx.lineWidth = m.F * .1; hx.filter = 'blur(' + (m.F * .035 * k).toFixed(2) + 'px)'; hx.stroke(line(fl)); hx.restore();
  }
  hx.setTransform(1, 0, 0, 1, 0, 0);
  hx.globalCompositeOperation = 'destination-in'; hx.drawImage(mask, 0, 0);
  // the body under the strands, then the dye over both
  fx.globalCompositeOperation = 'source-over'; fx.drawImage(hair, 0, 0);
  // the ends a little darker, where the hair lies in its own shadow (only over the hair: atop what is there)
  if (!light) {
    at(fx); fx.globalCompositeOperation = 'source-atop';
    const dg = fx.createLinearGradient(0, m.hair, 0, m.brow + m.F * .3);
    dg.addColorStop(0, 'rgb(0 0 0 / 0)'); dg.addColorStop(1, 'rgb(20 12 8 / .22)');
    fx.fillStyle = dg; fx.fillRect(m.bx - m.bw, m.by - m.bh, m.bw * 3, m.bh * 3);
    fx.setTransform(1, 0, 0, 1, 0, 0); fx.globalCompositeOperation = 'source-over';
  }
  if (t.dye) dyeHair(fx, t.dye, mask);
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(sh, 0, 0); x.drawImage(fill, 0, 0); x.restore();
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
  const full = q.style === 'full', stub = q.style === 'stubble', base = stub ? .22 : q.style === 'moustache' ? .55 : full ? .56 : .42;
  const gy = dx.createLinearGradient(0, Math.min(P(234).y, P(454).y), 0, P(152).y);
  gy.addColorStop(0, 'rgb(255 255 255 / ' + (base * .55).toFixed(3) + ')'); gy.addColorStop(.55, 'rgb(255 255 255 / ' + (base * .9).toFixed(3) + ')'); gy.addColorStop(1, 'rgb(255 255 255 / ' + base + ')');
  dx.fillStyle = gy; dx.fillRect(m.bx - m.bw, m.by - m.bh, m.bw * 3, m.bh * 3);
  dx.lineCap = 'round';
  const y0 = P(2).y - m.bh * .06, span = m.bh * .95;
  const many = Math.min(stub ? 5200 : 6400, Math.max(700, m.bw * k * (stub ? 12 : 16)));
  for (let i = 0; i < many; i++) {
    const p = { x: m.bx - m.bw * .1 + r() * m.bw * 1.2, y: y0 + r() * span }, side = (p.x - m.cx) / (m.bw / 2);
    if (stub) { dx.fillStyle = 'rgb(255 255 255 / ' + (.25 + r() * .5).toFixed(2) + ')'; dx.fillRect(p.x, p.y, m.u * .32, m.u * .32); continue; }
    const a = Math.PI / 2 + side * .55 + (r() - .5) * .8, len = Math.max(4 / k, m.u * (full ? 1.4 + r() * 2.2 : .7 + r() * 1.2));
    dx.strokeStyle = 'rgb(255 255 255 / ' + (.1 + r() * .3).toFixed(2) + ')'; dx.lineWidth = m.u * (.08 + r() * .1) + .3 / k;
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
