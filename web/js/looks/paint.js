/**
 * Paint, where the picture is a photograph: a look laid on a real face from the face itself, so it reads as hair and
 * make-up rather than as a line drawn over someone. A fringe falls in strands of the person's own hair colour, the way
 * the markup's strokes fall, and casts its shadow on the forehead; brows are filled hair by hair in their own colour
 * (the old shape blended away where the new one is finer); liner and lashes are ink; a beard grows in in the hair's
 * colour. A cut stays a line: only a render can take hair away. Whatever shows this still says Sketch: it is drawn here.
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
 * @param {CanvasImageSource & { width: number, height: number }} pic @param {import('../studio/face.js').Face} f @param {CanvasImageSource | null} [hairMask]
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
  return { hair: hair || fall, brows: brows || hair || fall, skin: skin || { dark: [120, 86, 70], mid: [170, 128, 104], light: [210, 170, 146] } };
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
    if (q.part === 'bangs') fringe(x, layer, f, q, t, r, k, at);
    else if (q.part === 'brows') brows(x, f, q, t, r, k, pic, box);
    else if (q.part === 'lashes') ink(x, f, q, t, k);
    else if (q.part === 'beard') beard(x, layer, f, q, t, r, k, at);
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
  /** @typedef {{ cover: Pt[][], flow: Pt[][], along: (d: Pt, s: number, t: number) => Pt, m: ReturnType<typeof measure>, thick: number, straight: boolean, dir: number }} Fringe */
  /** @type {Fringe} */
  const out = { cover: [], flow: [], along: (d) => d, m, thick: 0, straight: false, dir: 0 };
  if (style === 'curtain') {
    const mid = m.cx + v('part') * m.bw * .12, drop = v('length') * m.F * .9;
    for (const s of [-1, 1]) {
      const sd = side(s), edge = smooth([{ x: mid + s * m.bw * .008, y: m.hair - m.F * .2 }, { x: mid + s * m.bw * .08, y: m.hair + m.F * .3 }, { x: sd.browOut.x - s * m.bw * .03, y: m.brow - m.F * .1 + drop * .4 }, { x: sd.cheek.x - s * m.bw * .05, y: sd.corner.y + m.F * .55 + drop }]);
      const back = [{ x: sd.cheek.x + s * m.bw * .03, y: sd.corner.y + m.F * .15 + drop }, { x: sd.temple.x + s * m.bw * .08, y: m.hair + m.F * .05 }, { x: mid + s * m.bw * .3, y: m.hair - m.F * .75 }, { x: mid + s * m.bw * .008, y: m.hair - m.F * .75 }];
      out.cover.push([...edge, ...back]); out.flow.push(edge);
    }
    out.along = (d, s, t) => ({ x: d.x + s * t * m.bw * .2, y: d.y - t * m.F * .42 });
    return out;
  }
  if (style === 'side') {
    const part = m.cx - m.bw * .2 + v('part') * m.bw * .15, drop = v('length') * m.F * .6, dir = part < m.cx ? 1 : -1, far = side(dir);
    const edge = smooth([{ x: part, y: m.hair - m.F * .15 }, { x: part + dir * m.bw * .1, y: m.hair + m.F * .38 }, { x: m.cx + dir * m.bw * .22, y: m.brow - m.F * .22 + drop * .5 }, { x: far.temple.x + dir * m.bw * .01, y: m.brow + m.F * .02 + drop }]);
    const back = [{ x: far.temple.x + dir * m.bw * .09, y: m.brow - m.F * .4 + drop }, { x: far.temple.x + dir * m.bw * .06, y: m.hair - m.F * .35 }, { x: part + dir * m.bw * .2, y: m.hair - m.F * .75 }, { x: part - dir * m.bw * .04, y: m.hair - m.F * .6 }];
    out.cover.push([...edge, ...back]); out.flow.push(edge);
    out.along = (d, s, t) => ({ x: d.x - dir * t * m.bw * .1, y: d.y - t * m.F * .55 }); out.dir = dir;
    return out;
  }
  // straight fringes: the markup's strands, closed into one, and a bridge up into the hair across the top
  const strokes = markup(f, 'bangs', style, shape), L = side(-1).temple, R = side(1).temple;
  // each line resampled to the same number of points, so strands can be drawn anywhere between two of them
  const even = (/** @type {Pt[]} */ ps, n = 24) => Array.from({ length: n }, (_, i) => ps[Math.min(ps.length - 1, Math.round(i / (n - 1) * (ps.length - 1)))]);
  out.flow = strokes.filter(s => s.w < m.u * .8).map(s => even(along(s.d, m.u * .6))).sort((a, b) => a[0].x - b[0].x);
  out.cover.push([{ x: L.x - m.bw * .02, y: m.hair - m.F * .75 }, { x: R.x + m.bw * .02, y: m.hair - m.F * .75 }, { x: R.x + m.bw * .03, y: m.hair + m.F * .1 }, { x: L.x - m.bw * .03, y: m.hair + m.F * .1 }]);
  out.along = (d, s, t) => ({ x: d.x + (t - .5) * m.bw * .02, y: d.y + (s - .5) * m.F * .04 }); out.thick = m.bw * .1; out.straight = true;
  return out;
}

/**
 * A fringe: the shape it covers, filled with strands of the hair's own tones that fall along its lines, a sheen where
 * it curves, fading in above the hairline into the hair already there, and its shadow on the forehead.
 */
function fringe(/** @type {CanvasRenderingContext2D} */ x, /** @type {HTMLCanvasElement} */ layer, f, q, t, r, k, at) {
  const g0 = fringeOf(f, q.style, q.shape || {}), m = g0.m;
  const shape = make(layer.width, layer.height), sx = ctx(shape); at(sx);
  sx.lineCap = 'round'; sx.lineJoin = 'round'; sx.strokeStyle = sx.fillStyle = '#fff';
  for (const c of g0.cover) sx.fill(line(c));
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
  const fill = make(layer.width, layer.height), fx = ctx(fill); fx.fillStyle = css(mix(t.hair.mid, t.hair.light, light ? .25 : .3)); fx.fillRect(0, 0, fill.width, fill.height);
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
    x.save(); x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = css(col, q.style === 'feathered' ? .28 : .42); x.lineWidth = s.w * (q.style === 'feathered' ? 2.2 : .9);
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
        x.strokeStyle = css(r() < .3 ? shade(col, -.3) : col, .35 + r() * .45); x.lineWidth = m.u * (.1 + r() * .14) + .3 / k;
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
  for (const [i, s] of strokes.entries()) {
    const smudge = q.style === 'smoky' && i % 2 === 1;
    x.save(); x.strokeStyle = css(smudge ? mix(col, t.skin.dark, .35) : col, smudge ? .5 : .88); x.lineWidth = s.w * (smudge ? 2.4 : 1);
    x.filter = 'blur(' + (smudge ? m.u * 1.1 * k : Math.max(.35, m.u * .08 * k)).toFixed(2) + 'px)'; x.stroke(new Path2D(s.d)); x.restore();
  }
}

/**
 * A beard: its shape from the markup (the jaw's edge, closed along the moustache), soft where it meets the cheek, clear
 * of the lips; filled thinly in the hair's darker tones, so the skin's own light shows through, and grown hair by hair;
 * stubble is a shadow of it with its dots; a moustache only over the lip.
 */
function beard(/** @type {CanvasRenderingContext2D} */ x, /** @type {HTMLCanvasElement} */ layer, f, q, t, r, k, at) {
  const m = measure(f), P = m.P, lips = LIPS.map(i => P(i)), col = mix(t.hair.dark, [16, 11, 9], .3);
  const strokes = markup(f, 'beard', q.style === 'stubble' ? 'trimmed' : q.style, q.style === 'stubble' ? { length: -1 } : q.shape || {});
  const lr = (/** @type {Pt[]} */ ps) => (ps[0].x <= ps[ps.length - 1].x ? ps : [...ps].reverse());
  const shape = make(layer.width, layer.height), sx = ctx(shape); at(sx);
  sx.fillStyle = sx.strokeStyle = '#fff'; sx.lineCap = 'round'; sx.lineJoin = 'round';
  if (q.style === 'moustache') { sx.lineWidth = (strokes[0]?.w || m.u * 2) * 1.3; strokes.forEach(s => sx.stroke(new Path2D(s.d))); }
  else {
    // the jaw's edge (the first stroke) and the moustache (the fourth), closed into one shape
    const edge = lr(along(strokes[0].d, m.u)), lip = lr(along(strokes[3].d, m.u));
    sx.beginPath(); [...edge, ...[...lip].reverse()].forEach((p, i) => (i ? sx.lineTo(p.x, p.y) : sx.moveTo(p.x, p.y))); sx.closePath(); sx.fill();
    sx.lineWidth = strokes[3].w; sx.stroke(new Path2D(strokes[3].d));
  }
  // never over the lips
  sx.globalCompositeOperation = 'destination-out'; sx.beginPath(); lips.forEach((p, i) => (i ? sx.lineTo(p.x, p.y) : sx.moveTo(p.x, p.y))); sx.closePath(); sx.lineWidth = m.u * .7; sx.fill(); sx.stroke();
  // softer toward the cheek: the top of it fades
  sx.globalCompositeOperation = 'destination-in';
  const top = Math.min(P(234).y, P(454).y), g = sx.createLinearGradient(0, top, 0, P(2).y + m.bh * .06); g.addColorStop(0, 'rgb(255 255 255 / 0)'); g.addColorStop(1, '#fff');
  sx.fillStyle = g; sx.fillRect(m.bx - m.bw, m.by - m.bh, m.bw * 3, m.bh * 3);
  const mask = soft(shape, m.u * k * (q.style === 'stubble' ? 1.6 : 1));
  const hair = make(layer.width, layer.height), hx = ctx(hair); at(hx);
  const full = q.style === 'full', base = q.style === 'stubble' ? .2 : q.style === 'moustache' ? .62 : full ? .62 : .44;
  hx.fillStyle = css(col, base); hx.fillRect(m.bx - m.bw, m.by - m.bh, m.bw * 3, m.bh * 3);
  hx.lineCap = 'round';
  const tonesOf = [shade(col, -.35), col, t.hair.dark, mix(t.hair.mid, col, .4)];
  const y0 = P(2).y - m.bh * .06, span = m.bh * .95;
  const many = Math.min(q.style === 'stubble' ? 5200 : 3400, Math.max(400, m.bw * k * (q.style === 'stubble' ? 12 : 9)));
  for (let i = 0; i < many; i++) {
    const p = { x: m.bx - m.bw * .1 + r() * m.bw * 1.2, y: y0 + r() * span }, side = (p.x - m.cx) / (m.bw / 2);
    if (q.style === 'stubble') { hx.fillStyle = css(col, .2 + r() * .45); hx.fillRect(p.x, p.y, m.u * .3, m.u * .3); continue; }
    const a = Math.PI / 2 + side * .55 + (r() - .5) * .8, len = m.u * (full ? 1.6 + r() * 2.6 : .7 + r() * 1.3);
    hx.strokeStyle = css(tonesOf[Math.floor(r() * 4)], .22 + r() * .5); hx.lineWidth = m.u * (.1 + r() * .18) + .3 / k;
    hx.beginPath(); hx.moveTo(p.x, p.y); hx.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len); hx.stroke();
  }
  hx.setTransform(1, 0, 0, 1, 0, 0);
  hx.globalCompositeOperation = 'destination-in'; hx.drawImage(mask, 0, 0);
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(hair, 0, 0); x.restore();
}
