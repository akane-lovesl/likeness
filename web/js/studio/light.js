/**
 * The light of a place, on whoever is put there. A photo comes with the light it was taken in (a window, a lamp, an
 * office); put in Lisbon at dawn, they should catch the dawn instead. From what the painter painted (the sky's colours,
 * where the sun or the moon is, a lit tower, neon, a fire, the sea) this works out a rig: the colour all round, the
 * strongest lights and where they come from, how much of the light catches the edge of them, and the lights that move.
 * Then it lights someone cut out of a photo by it: tinted by the sky, brighter on the side the light comes from and
 * darker away from it, with an edge of light along the outline that faces it. All of it is drawn on the device, as a
 * sketch; a render lights people itself.
 */
import { rgb, mix } from '../core/color.js';

/** @typedef {{ x: number, y: number, c: string, k: number }} Key a light: where it is (fractions of the picture, and it may be off the edge), its colour and strength */
/** @typedef {{ kind: string, c: string, c2?: string, x: number, y: number, a: number, per?: number, two?: boolean }} Move a light that moves on them, and how strongly */
/**
 * @typedef {{ amb: string, ak: number, exp: number, keys: Key[], rim: number, rc: string, wrap: number, haze: string | null, hk: number, moves: Move[] }} Rig
 * amb the colour all round and ak how much of it; exp how much light there is; keys the lights, strongest first; rim how
 * much light catches the edge facing the strongest, rc its colour; wrap an edge all round, for a light behind them;
 * haze a colour laid over them (fog), hk how much; moves the lights that move.
 */

const HOURS = ['day', 'dawn', 'dusk', 'night'];
/** One of four, by the hour. @template T @param {string} L @param {T[]} v @returns {T} */
const by = (L, v) => v[Math.max(0, HOURS.indexOf(L))];
/** The middle of some points. @param {number[][]} pts */
const centre = (pts) => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
/** @param {number} w @param {number} h */
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const ctx = (/** @type {HTMLCanvasElement} */ c, read = false) => /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', read ? { willReadFrequently: true } : undefined));

/**
 * The rig for a place, from what was painted in it.
 * @param {any} desc @param {string} L the hour @param {string[]} sky its colours, top to horizon @param {any[]} life the hints of what moves in it
 * @returns {Rig}
 */
export function rigOf(desc, L, sky, life) {
  const s = desc.sunAt, lit = s?.lit || (s ? [s.x, s.y] : [.5, .1]), night = L === 'night';
  /** @type {Rig} */
  const r = {
    amb: mix(sky[1], sky[2], .5), ak: by(L, [.12, .26, .3, .36]), exp: by(L, [1, .95, .92, .8]),
    // the sun, or after dark the moon: low behind them at either end of the day, so more of it is on their edge than their face
    keys: [{ x: lit[0], y: Math.min(lit[1], .7), c: by(L, ['#fff1d8', '#ffc4a2', '#ffa257', '#bcd0ff']), k: by(L, [.2, .3, .34, .18]) }],
    rim: by(L, [.25, .7, .85, .45]), rc: by(L, ['#fff4dc', '#ffd2b4', '#ffb46e', '#d2deff']), wrap: by(L, [0, .18, .22, .12]),
    haze: null, hk: 0, moves: [],
  };
  const of = (/** @type {string} */ k) => life.filter(o => o.k === k);
  // the sun or the moon on the water, thrown back up at them
  const water = of('water').find(o => o.path);
  if (water) r.moves.push({ kind: 'shimmer', c: water.night ? '#e4eaff' : L === 'day' ? '#fff6de' : '#ffdcaa', x: water.path[0], y: 1, a: water.night ? .3 : .55 });
  if (desc.land === 'under') {
    // under the surface: all of it teal, the light from above, and the surface's light netted over them
    Object.assign(r, { amb: '#4f97a3', ak: .3, exp: night ? .78 : .94, keys: [{ x: .5, y: -.3, c: '#c4fff4', k: .26 }], rim: .5, rc: '#b8fff2', wrap: .2 });
    r.moves.push({ kind: 'caustic', c: '#d2fff8', x: .5, y: 0, a: night ? .25 : .55 });
  }
  if (desc.land === 'space' || desc.land === 'moon') {
    // no air to soften it: a hard white sun, deep shadow, a bright edge; on the moon a little blue from the Earth
    Object.assign(r, { amb: '#1c2233', ak: .4, exp: .92, rim: 1, rc: '#ffffff', wrap: .12 });
    r.keys[0].c = '#ffffff'; r.keys[0].k = .42;
    const earth = of('earth')[0]; if (earth?.box) r.keys.push({ x: earth.box[0] + earth.box[2] / 2, y: earth.box[1] + earth.box[3] / 2, c: '#9ec2ff', k: .12 });
  }
  if (desc.place === 'mars' || desc.land === 'mars') {
    // butterscotch all day, and at the end of it the sunset blue
    if (L === 'day') Object.assign(r, { amb: '#c9874f', ak: .3 });
    if (L === 'dusk' || L === 'dawn') { r.keys[0].c = '#a9cbff'; r.rc = '#9cc6ff'; r.amb = mix(r.amb, '#8a5a3c', .5); }
  }
  // the Paris tower lit, its bulbs going off on the hour, and its beacon going round; a lighthouse's lamp
  const glitter = of('glitter')[0], beacon = of('beacon')[0], lamp = of('lamp')[0];
  if (night && glitter?.pts?.length) {
    const [gx, gy] = centre(glitter.pts);
    r.keys.unshift({ x: gx, y: gy, c: '#ffc56e', k: .32 }); r.rc = '#ffd9a0'; r.rim = Math.max(r.rim, .7);
    r.moves.push({ kind: 'glint', c: '#ffe7b8', x: gx, y: gy, a: .55 });
  }
  if (beacon?.at) r.moves.push({ kind: 'beam', c: '#fff6dc', x: beacon.at[0], y: beacon.at[1], a: .5, per: 10, two: true });
  if (lamp?.at) r.moves.push({ kind: 'beam', c: '#fff2c8', x: lamp.at[0], y: lamp.at[1], a: .55, per: 5.5 });
  // neon: the two colours most of the signs are, one from each side, stuttering as the signs do
  const neons = of('neon').filter(o => typeof o.c === 'string');
  if (neons.length) {
    const count = new Map(); for (const o of neons) count.set(o.c, (count.get(o.c) || 0) + 1);
    const cs = [...count.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]), c1 = cs[0], c2 = cs[1] || mix(cs[0], '#7fe8ff', .6), k = night ? .3 : .14;
    r.keys.unshift({ x: -.25, y: .45, c: c1, k }, { x: 1.25, y: .45, c: c2, k });
    r.rim = Math.max(r.rim, night ? .75 : .4); r.rc = mix(c1, '#ffffff', .3);
    r.moves.push({ kind: 'neon', c: c1, c2, x: .5, y: .45, a: night ? .45 : .2 });
  }
  // a fire, candles: warm from where they are, flickering
  const flames = of('flames').flatMap(o => o.pts || []);
  if (flames.length) {
    const [fx, fy] = centre(flames);
    r.keys.unshift({ x: fx, y: fy, c: '#ffb066', k: night ? .36 : .2 }); r.moves.push({ kind: 'flicker', c: '#ffb36b', x: fx, y: fy, a: night ? .45 : .25 });
    if (night) r.amb = mix(r.amb, '#ffb37a', .35);
  }
  // the northern lights overhead
  const aurora = of('aurora')[0];
  if (aurora?.c) {
    r.keys.unshift({ x: .5, y: .02, c: aurora.c[0], k: .26 }); r.rc = mix(aurora.c[0], '#ffffff', .4); r.rim = Math.max(r.rim, .65);
    r.moves.push({ kind: 'aurora', c: aurora.c[0], c2: aurora.c[1], x: .5, y: .1, a: .45 });
  }
  // a town with its windows lit throws a little warmth about
  if (night && of('windows').length) r.amb = mix(r.amb, '#ffc98a', .2);
  if (desc.inside) {
    // inside, the day comes in at the window, and after dark the room's own light is warm
    const win = of('window')[0]?.box;
    Object.assign(r, { amb: by(L, ['#f3e6d4', '#f6d9c4', '#f2c9a4', '#ffcf96']), ak: by(L, [.16, .22, .26, .34]), exp: by(L, [1, .98, .95, .86]), rim: by(L, [.3, .4, .45, .25]), rc: by(L, ['#ffffff', '#ffe6d2', '#ffd2a0', '#ffd9a8']), wrap: 0 });
    if (win) r.keys = [{ x: win[0] + win[2] / 2, y: win[1] + win[3] / 2, c: by(L, ['#eef4ff', '#ffe4d0', '#ffcf9a', '#8fa4e8']), k: by(L, [.34, .3, .3, .1]) }, ...r.keys.filter(k => k.c === '#ffb066')];
  }
  if (desc.weather === 'rain') { r.amb = mix(r.amb, '#76828f', .6); r.ak = Math.max(r.ak, .38); r.exp *= .93; for (const k of r.keys) k.k *= .5; r.rim *= .5; }
  if (desc.weather === 'snow') { r.amb = mix(r.amb, '#e3ebf5', .55); r.exp = Math.min(1.06, r.exp * 1.04); r.rim *= .8; }
  if (of('fog').length) { r.haze = night ? '#6f7886' : '#dfe3e8'; r.hk = .12; for (const k of r.keys) k.k *= .6; }
  if (desc.land === 'clouds') { r.amb = mix(r.amb, '#ffffff', .3); r.rim = Math.min(1, r.rim * 1.15); }
  r.keys.sort((a, b) => b.k - a.k);
  return r;
}

/**
 * Between two hours, the light between them too: each light of both, at its share.
 * @param {Rig | null | undefined} a @param {Rig | null | undefined} b @param {number} t @returns {Rig | null}
 */
export function mixRig(a, b, t) {
  if (!a || !b) return a || b || null;
  const n = (/** @type {number} */ p, /** @type {number} */ q) => p + (q - p) * t;
  return {
    amb: mix(a.amb, b.amb, t), ak: n(a.ak, b.ak), exp: n(a.exp, b.exp),
    keys: [...a.keys.map(k => ({ ...k, k: k.k * (1 - t) })), ...b.keys.map(k => ({ ...k, k: k.k * t }))].sort((p, q) => q.k - p.k),
    rim: n(a.rim, b.rim), rc: mix(a.rc, b.rc, t), wrap: n(a.wrap, b.wrap),
    haze: a.haze || b.haze ? mix(a.haze || /** @type {string} */ (b.haze), b.haze || /** @type {string} */ (a.haze), t) : null, hk: n(a.hk, b.hk),
    moves: t > .5 ? b.moves : a.moves,
  };
}

/**
 * Where something stands in a layer of its own: the box its outline fills, in fractions of the layer; null if empty.
 * @param {HTMLCanvasElement} c @returns {[number, number, number, number] | null}
 */
export function boundsOf(c) {
  const sw = 96, sh = Math.max(1, Math.round(sw * c.height / c.width)), m = canvas(sw, sh), x = ctx(m, true);
  x.drawImage(c, 0, 0, sw, sh);
  const d = x.getImageData(0, 0, sw, sh).data; let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
  for (let i = 3, p = 0; i < d.length; i += 4, p++) if (d[i] > 40) { const px = p % sw, py = (p - px) / sw; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
  return x1 < 0 ? null : [x0 / sw, y0 / sh, (x1 - x0 + 1) / sw, (y1 - y0 + 1) / sh];
}

/**
 * Someone cut out of a photo, lit by a place: a new layer, the same size, with the same outline.
 * @param {HTMLCanvasElement} layer them, on nothing @param {Rig} rig @returns {HTMLCanvasElement}
 */
export function relight(layer, rig) {
  const b = boundsOf(layer); if (!b) return layer;
  const w = layer.width, h = layer.height, out = canvas(w, h), ox = ctx(out, true);
  ox.drawImage(layer, 0, 0);
  const img = ox.getImageData(0, 0, w, h), d = img.data;
  const bx = b[0] * w, by0 = b[1] * h, bw = b[2] * w, bh = b[3] * h, cx = bx + bw / 2, cy = by0 + bh * .42, R = Math.max(bw, bh) * .55;
  // all round: the colour of the light, kept to its hue so it tints them rather than darkens them, then how much there is
  const a = rgb(rig.amb).map(v => v / 255), al = Math.max(.05, .2126 * a[0] + .7152 * a[1] + .0722 * a[2]);
  const tint = a.map(v => (1 + (Math.min(1.35, v / al) - 1) * rig.ak) * rig.exp);
  // each light: which way it is from the middle of them, and its colour at its strength
  const keys = rig.keys.filter(k => k.k > .01).slice(0, 4).map(k => {
    let dx = k.x * w - cx, dy = k.y * h - cy; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
    return { dx, dy, k: k.k, c: rgb(k.c).map(v => v / 255 * k.k) };
  });
  const band = rig.rim > .02 || rig.wrap > .02 ? edgeOf(layer, keys[0] || null, rig, bh) : null;
  const rc = rgb(rig.rc).map(v => v / 255 * rig.rim), hz = rig.haze ? rgb(rig.haze).map(v => v / 255) : null;
  // the soft edge of a cut-out still holds a little of the room it was cut from (a pale fringe round them, from a light
  // wall): edge pixels take their colour from a step inside, toward where they are solid
  const was = d.slice(), inset = Math.max(2, w / 170), A = (/** @type {number} */ x, /** @type {number} */ y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : was[(y * w + x) * 4 + 3]);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (!d[i + 3]) continue;
    const px = p % w, py = (p - px) / w, ux = (px - cx) / R, uy = (py - cy) / R;
    let cr = d[i], cg = d[i + 1], cb = d[i + 2];
    if (d[i + 3] < 240) {
      let nx = A(px + 2, py) - A(px - 2, py), ny = A(px, py + 2) - A(px, py - 2); const n = Math.hypot(nx, ny);
      if (n > 8) { nx /= n; ny /= n; const qx = Math.round(px + nx * inset), qy = Math.round(py + ny * inset); if (A(qx, qy) > 220) { const q = (qy * w + qx) * 4; cr = was[q]; cg = was[q + 1]; cb = was[q + 2]; } }
    }
    // the light that reaches this part of them: all round, then each light on the side it comes from. Light multiplies
    // what it falls on, so dark hair stays dark under it and a white shirt takes its colour
    let lr = tint[0], lg = tint[1], lb = tint[2];
    for (let j = 0; j < keys.length; j++) {
      const k = keys[j], s = ux * k.dx + uy * k.dy;
      const on = s > -.3 ? Math.min(1, (s + .3) / 1.1) : 0, lo = on * on * (3 - 2 * on);
      lr += k.c[0] * lo; lg += k.c[1] * lo; lb += k.c[2] * lo;
      // and the far side of the strongest a little darker
      if (j === 0 && s < .1) { const off = Math.min(1, (.1 - s) / 1.1), sh = 1 - k.k * .6 * off * off * (3 - 2 * off); lr *= sh; lg *= sh; lb *= sh; }
    }
    let r = cr / 255 * lr, g = cg / 255 * lg, bl = cb / 255 * lb;
    // the edge facing the light catches it whatever it is, hair too: a thin line of it
    if (band) { const e = band[p] / 255; if (e) { r += rc[0] * e; g += rc[1] * e; bl += rc[2] * e; } }
    if (hz) { r += (hz[0] - r) * rig.hk; g += (hz[1] - g) * rig.hk; bl += (hz[2] - bl) * rig.hk; }
    d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = bl * 255;
  }
  ox.putImageData(img, 0, 0);
  return out;
}

/**
 * The edge of someone that the light catches: where a step toward the light leaves them, and, for a light behind them,
 * a thinner edge all round. Where the photo cuts them off (its sides, its foot) is not an edge: the layer is carried on
 * past the frame first. As strengths, one a pixel.
 * @param {HTMLCanvasElement} layer @param {{ dx: number, dy: number } | null} key @param {Rig} rig @param {number} tall how tall they are, in pixels
 */
function edgeOf(layer, key, rig, tall) {
  const w = layer.width, h = layer.height, dist = Math.max(1.5, tall * .0075), pad = Math.ceil(dist * 3) + 2, W = w + pad * 2, H = h + pad * 2;
  const big = canvas(W, H), gx = ctx(big);
  gx.drawImage(layer, pad, pad);
  gx.drawImage(layer, 0, 0, 1, h, 0, pad, pad, h); gx.drawImage(layer, w - 1, 0, 1, h, w + pad, pad, pad, h);
  gx.drawImage(layer, 0, h - 1, w, 1, pad, h + pad, w, pad);
  gx.drawImage(layer, 0, h - 1, 1, 1, 0, h + pad, pad, pad); gx.drawImage(layer, w - 1, h - 1, 1, 1, w + pad, h + pad, pad, pad);
  const e = canvas(W, H), ex = ctx(e);
  if (key && rig.rim > .02) { ex.drawImage(big, 0, 0); ex.globalCompositeOperation = 'destination-out'; ex.drawImage(big, -key.dx * dist, -key.dy * dist); ex.globalCompositeOperation = 'source-over'; }
  if (rig.wrap > .02) {
    const er = canvas(W, H), rx = ctx(er), d2 = dist * .5;
    rx.drawImage(big, 0, 0); rx.globalCompositeOperation = 'destination-in';
    for (const [u, v] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) rx.drawImage(big, u * d2, v * d2);
    const all = canvas(W, H), ax = ctx(all); ax.drawImage(big, 0, 0); ax.globalCompositeOperation = 'destination-out'; ax.drawImage(er, 0, 0);
    ex.globalAlpha = Math.min(1, rig.wrap / Math.max(.05, rig.rim)); ex.drawImage(all, 0, 0); ex.globalAlpha = 1;
  }
  const out = canvas(w, h), ox = ctx(out, true);
  ox.filter = 'blur(' + (dist * .4).toFixed(1) + 'px)'; ox.drawImage(e, -pad, -pad); ox.filter = 'none';
  const d = ox.getImageData(0, 0, w, h).data, band = new Uint8ClampedArray(w * h);
  for (let i = 3, p = 0; p < band.length; i += 4, p++) band[p] = d[i];
  return band;
}
