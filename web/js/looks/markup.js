/**
 * A stylist's markup over a real face: the change drawn where it would go, from the face's own points, in a few sure
 * strokes. Bangs fall from the hairline to the brows, brows follow the brow bone, a wing leaves the corner of the eye,
 * a beard follows the jaw, a cut is outlined round the head. Colours are washes, not strokes (see the mirror). All in
 * the picture's pixels.
 */

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ d: string, w: number }} Stroke */

const n = (/** @type {number} */ v) => v.toFixed(1);
const pt = (/** @type {Pt} */ p) => n(p.x) + ' ' + n(p.y);
const lerp = (/** @type {Pt} */ a, /** @type {Pt} */ b, /** @type {number} */ t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
/** A smooth line through points (Catmull-Rom, as cubic curves). @param {Pt[]} ps */
function through(ps) {
  let d = 'M' + pt(ps[0]);
  for (let i = 0; i < ps.length - 1; i++) {
    const p0 = ps[Math.max(0, i - 1)], p1 = ps[i], p2 = ps[i + 1], p3 = ps[Math.min(ps.length - 1, i + 2)];
    d += ' C' + pt({ x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }) + ', ' + pt({ x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }) + ', ' + pt(p2);
  }
  return d;
}
/** A seeded jitter, so a markup comes out the same each time. */
function jitter(seed = 7) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647) - .5; }

const BROW = [{ up: [70, 63, 105, 66, 107], low: [46, 53, 52, 65, 55] }, { up: [300, 293, 334, 296, 336], low: [276, 283, 282, 295, 285] }];
const LID = [[133, 173, 157, 158, 159, 160, 161, 246, 33], [362, 398, 384, 385, 386, 387, 388, 466, 263]];
const JAW = [127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454, 356];

/**
 * The strokes that show one style of one part on this face.
 * @param {import('../studio/face.js').Face} f @param {string} part @param {string} style @returns {Stroke[]}
 */
export function markup(f, part, style) {
  const P = (/** @type {number} */ i) => f.pts[i], [bx, by, bw, bh] = f.box, u = bw / 100, cx = P(10).x;
  const hair = P(10).y - bh * .02, brow = Math.min(P(105).y, P(334).y), F = Math.max(bh * .12, brow - hair);
  const out = /** @type {Stroke[]} */ ([]), r = jitter(part.length * 31 + style.length);
  const side = (/** @type {number} */ s) => (s < 0 ? { temple: P(54), edge: P(127), cheek: P(234), corner: P(33), browOut: P(70) } : { temple: P(284), edge: P(356), cheek: P(454), corner: P(263), browOut: P(300) });

  if (part === 'bangs') {
    if (style === 'curtain') for (const s of [-1, 1]) {
      const sd = side(s);
      for (let k = 0; k < 4; k++) {
        const a = { x: cx + s * bw * (.005 + k * .014), y: hair - F * (.25 - k * .04) };
        const c1 = { x: cx + s * bw * (.2 + k * .03), y: a.y + F * (.02 + k * .05) }, c2 = { x: sd.browOut.x + s * bw * (.02 + k * .02), y: brow - F * (.55 - k * .12) };
        const e = { x: sd.cheek.x - s * bw * (.05 - k * .03), y: sd.corner.y + F * (.4 + k * .15) };
        out.push({ d: 'M' + pt(a) + ' C' + pt(c1) + ', ' + pt(c2) + ', ' + pt(e), w: u * (k ? .55 : .8) });
      }
    }
    else if (style === 'side') {
      const a = { x: cx - bw * .2, y: hair - F * .25 };
      for (let k = 0; k < 6; k++) {
        const s = { x: a.x + bw * k * .035, y: a.y + F * k * .02 }, e = { x: side(1).temple.x + bw * (.04 - k * .015), y: brow - F * (.05 - k * .1) };
        out.push({ d: 'M' + pt(s) + ' C' + pt({ x: s.x - bw * .02, y: s.y + F * .5 }) + ', ' + pt({ x: e.x - bw * .3, y: e.y + F * .15 }) + ', ' + pt(e), w: u * (k === 0 ? .8 : .5) });
      }
    }
    else {
      // fringes that fall straight: how far down, how many strands, how loose
      const look = /** @type {Record<string, { to: number, n: number, line: boolean, loose: number }>} */ ({ blunt: { to: .86, n: 11, line: true, loose: .15 }, micro: { to: .42, n: 11, line: true, loose: .1 }, wispy: { to: .82, n: 9, line: false, loose: .9 }, birkin: { to: 1.22, n: 13, line: false, loose: .5 } })[style] || { to: .86, n: 11, line: true, loose: .2 };
      const L = side(-1).temple, R = side(1).temple, w = R.x - L.x + bw * .08, x0 = L.x - bw * .04, end = (/** @type {number} */ t) => hair + F * look.to + Math.sin(t * Math.PI) * F * .08;
      for (let k = 0; k < look.n; k++) {
        const t = (k + .5) / look.n, x = x0 + w * t, y1 = end(t) + (look.line ? 0 : r() * F * .22 * look.loose), lean = (t - .5) * bw * .06 + r() * bw * .015 * look.loose;
        if (style === 'birkin' && Math.abs(t - .5) < .05) continue;
        out.push({ d: 'M' + pt({ x: x - lean * .4, y: hair - F * .22 }) + ' C' + pt({ x: x - lean * .2, y: hair + F * .2 }) + ', ' + pt({ x: x + lean * .6, y: y1 - F * .3 }) + ', ' + pt({ x: x + lean, y: y1 }), w: u * (look.line ? .5 : .42) });
      }
      if (look.line) out.push({ d: 'M' + pt({ x: x0, y: end(0) }) + ' Q' + pt({ x: x0 + w / 2, y: end(.5) + F * .1 }) + ', ' + pt({ x: x0 + w, y: end(1) }), w: u * .9 });
    }
  }

  if (part === 'brows') for (const [i, b] of BROW.entries()) {
    const up = b.up.map(P), low = b.low.map(P), mid = up.map((p, k) => lerp(p, low[k], .5)), thick = up.reduce((a, p, k) => a + Math.hypot(p.x - low[k].x, p.y - low[k].y), 0) / up.length;
    const s = i ? 1 : -1, outer = mid[0], inner = mid[mid.length - 1];
    if (style === 'feathered') {
      for (let k = 0; k < 16; k++) {
        const t = k / 15, j = Math.min(3, Math.floor(t * 4)), v = t * 4 - j, a = lerp(low[4 - j], low[3 - j] || low[0], 1 - v), c = lerp(up[4 - j], up[3 - j] || up[0], 1 - v);
        out.push({ d: 'M' + pt(lerp(a, c, -.1)) + ' L' + pt({ x: c.x + s * thick * .35, y: c.y - thick * .55 }), w: u * .3 });
      }
      continue;
    }
    const line = style === 'straight' ? mid.map((p, k) => lerp(p, lerp(inner, outer, 1 - k / (mid.length - 1)), .75))
      : style === 'arched' ? mid.map((p, k) => (k === 1 ? { x: p.x, y: p.y - thick * .9 } : k === 0 ? { x: p.x, y: p.y + thick * .3 } : p))
      : style === 'thin' ? mid.map(p => ({ x: p.x, y: p.y - thick * .2 })) : mid;
    out.push({ d: through(line), w: thick * ({ bold: 1.15, thin: .3, soft: .7, straight: .75, arched: .6 }[style] || .7) });
  }

  if (part === 'lashes') for (const [i, lid] of LID.entries()) {
    const ps = lid.map(P), s = i ? 1 : -1, eh = Math.abs(P(i ? 374 : 145).y - P(i ? 386 : 159).y) || bh * .04;
    if (style === 'wing' || style === 'smoky') {
      const c = ps[ps.length - 1];
      out.push({ d: through(ps.slice(2)) + ' L' + pt({ x: c.x + s * bw * .085, y: c.y - eh * 1.1 }), w: u * (style === 'wing' ? .7 : 1.6) });
      if (style === 'smoky') out.push({ d: through(ps.map(p => ({ x: p.x, y: p.y - eh * .55 }))), w: u * 1.4 });
      continue;
    }
    const long = style === 'bright' ? 1.6 : 1;
    for (let k = 2; k < ps.length; k++) {
      const p = ps[k], t = (k - 2) / (ps.length - 3), len = eh * (.55 + .5 * t) * long, a = -Math.PI / 2 + s * (.15 + t * .9);
      out.push({ d: 'M' + pt(p) + ' Q' + pt({ x: p.x + Math.cos(a) * len * .4, y: p.y + Math.sin(a) * len * .7 }) + ', ' + pt({ x: p.x + Math.cos(a) * len + s * len * .25 * (long - .8), y: p.y + Math.sin(a) * len }), w: u * .32 });
    }
  }

  if (part === 'beard') {
    const mid = { x: (P(234).x + P(454).x) / 2, y: (P(234).y + P(152).y) / 2 };
    const push = (/** @type {number} */ k) => JAW.map(i => { const p = P(i); return { x: mid.x + (p.x - mid.x) * (1 + k), y: mid.y + (p.y - mid.y) * (1 + k * 1.4) }; });
    const lipTop = P(0), lip = { l: P(61), r: P(291) }, under = P(17);
    const moustache = 'M' + pt({ x: lip.l.x - bw * .03, y: lip.l.y + bh * .01 }) + ' C' + pt({ x: lip.l.x, y: lipTop.y - bh * .045 }) + ', ' + pt({ x: cx - bw * .05, y: lipTop.y - bh * .05 }) + ', ' + pt({ x: cx, y: lipTop.y - bh * .03 })
      + ' C' + pt({ x: cx + bw * .05, y: lipTop.y - bh * .05 }) + ', ' + pt({ x: lip.r.x, y: lipTop.y - bh * .045 }) + ', ' + pt({ x: lip.r.x + bw * .03, y: lip.r.y + bh * .01 });
    if (style === 'moustache') out.push({ d: moustache, w: u * 1.6 });
    else if (style === 'stubble') {
      const ring = push(.02).slice(2, -2);
      for (let k = 0; k < 260; k++) {
        const a = ring[Math.floor((r() + .5) * ring.length) % ring.length], t = .1 + (r() + .5) * .55, p = lerp(a, { x: cx, y: under.y + bh * .02 }, t);
        if (p.y < lip.l.y - bh * .07 || (Math.abs(p.x - cx) < bw * .2 && Math.abs(p.y - (lipTop.y + under.y) / 2) < bh * .05)) continue;
        out.push({ d: 'M' + pt(p) + ' h.1', w: u * .5 });
      }
    } else if (style === 'trimmed' || style === 'full') {
      const k = style === 'full' ? .12 : .05, edge = push(k).slice(1, -1);
      out.push({ d: through(edge), w: u * .8 });
      const cheek = (/** @type {number} */ s) => { const c = side(s).cheek; return 'M' + pt({ x: c.x - s * bw * .02, y: c.y + bh * .02 }) + ' Q' + pt({ x: c.x - s * bw * .1, y: P(s < 0 ? 61 : 291).y - bh * .12 }) + ', ' + pt({ x: P(s < 0 ? 61 : 291).x - s * bw * .05, y: P(s < 0 ? 61 : 291).y + bh * .01 }); };
      out.push({ d: cheek(-1), w: u * .6 }, { d: cheek(1), w: u * .6 }, { d: moustache, w: u * 1.1 });
      for (let j = 0; j < (style === 'full' ? 22 : 12); j++) { const a = edge[1 + Math.floor((j + .5) / (style === 'full' ? 22 : 12) * (edge.length - 2))], p = lerp(a, { x: cx, y: under.y }, .25 + r() * .1); out.push({ d: 'M' + pt(lerp(a, p, .15)) + ' L' + pt(p), w: u * .3 }); }
    }
  }

  if (part === 'cut') {
    const top = by - bh * .3, chin = P(152).y, L = bx - bw * .16, R = bx + bw * 1.16, mid = (L + R) / 2;
    const crown = (/** @type {number} */ k) => 'M' + pt({ x: L - bw * k, y: chin }) + ' C' + pt({ x: L - bw * (k + .06), y: by }) + ', ' + pt({ x: mid - bw * .62, y: top }) + ', ' + pt({ x: mid, y: top }) + ' C' + pt({ x: mid + bw * .62, y: top }) + ', ' + pt({ x: R + bw * (k + .06), y: by }) + ', ' + pt({ x: R + bw * k, y: chin });
    const lengths = /** @type {Record<string, number>} */ ({ bob: 1.06, long: 1.9, shag: 1.4, curls: 1.25 });
    if (style === 'buzz' || style === 'pixie') {
      const t = by - bh * (style === 'buzz' ? .1 : .2), ear = P(234).y - (style === 'buzz' ? bh * .05 : -bh * .04);
      out.push({ d: 'M' + pt({ x: bx - bw * .04, y: ear }) + ' C' + pt({ x: bx - bw * .1, y: by }) + ', ' + pt({ x: mid - bw * .55, y: t }) + ', ' + pt({ x: mid, y: t }) + ' C' + pt({ x: mid + bw * .55, y: t }) + ', ' + pt({ x: bx + bw * 1.1, y: by }) + ', ' + pt({ x: bx + bw * 1.04, y: ear }), w: u * .9 });
      if (style === 'pixie') for (let k = 0; k < 7; k++) { const x = bx + bw * (.15 + k * .11); out.push({ d: 'M' + pt({ x, y: t + bh * .02 }) + ' Q' + pt({ x: x + bw * .06, y: hair }) + ', ' + pt({ x: x + bw * .1, y: hair + F * .45 }), w: u * .45 }); }
      else for (let k = 0; k < 90; k++) { const a = Math.PI * (1.05 + (r() + .5) * .9), rr = .35 + (r() + .5) * .12; out.push({ d: 'M' + pt({ x: mid + Math.cos(a) * bw * rr * 1.25, y: by + bh * .12 + Math.sin(a) * bh * rr * .7 }) + ' h.1', w: u * .45 }); }
    } else {
      const fall = chin + (lengths[style] - 1) * bh * 1.2, wave = style === 'curls' ? 1 : 0;
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? L : R, pts = [];
        for (let k = 0; k <= 8; k++) { const t = k / 8, y = by + (fall - by) * t, x = x0 + s * bw * (.02 + t * .14) + Math.sin(t * Math.PI * 5) * bw * .05 * wave; pts.push({ x, y }); }
        out.push({ d: through(pts), w: u * .9 });
        if (style === 'bob') out.push({ d: 'M' + pt(pts[8]) + ' Q' + pt({ x: pts[8].x - s * bw * .05, y: fall + bh * .05 }) + ', ' + pt({ x: pts[8].x - s * bw * .22, y: fall - bh * .02 }), w: u * .9 });
        if (style === 'shag') for (let j = 1; j <= 3; j++) { const p = pts[2 * j + 1]; out.push({ d: 'M' + pt(p) + ' l' + n(-s * bw * .1) + ' ' + n(bh * .08), w: u * .6 }); }
        if (style === 'long') for (let j = 0; j < 3; j++) { const p = pts[3 + j * 2]; out.push({ d: 'M' + pt({ x: p.x - s * bw * .1, y: p.y - bh * .2 }) + ' Q' + pt({ x: p.x - s * bw * .04, y: p.y }) + ', ' + pt({ x: p.x - s * bw * .08, y: p.y + bh * .25 }), w: u * .45 }); }
      }
      out.push({ d: crown(0).replace(/^M[^C]*/, 'M' + pt({ x: L, y: by + bh * .1 })), w: u * .9 });
    }
  }
  return out;
}
