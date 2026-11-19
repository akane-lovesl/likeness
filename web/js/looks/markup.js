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
 * @typedef {{ id: string, x: number, y: number, axis: 'x' | 'y', v: number, short: string, phrase: string }} Mark a
 * handle on the markup: where it sits (picture pixels), the way it moves, its value (-1 to 1, 0 as the style is
 * drawn), and what that value says, shortly for the screen and fully for the studio
 */
/** @typedef {Mark & { span: number, dir: 1 | -1 }} Control a handle, with how far it moves for a whole step of its value */

/** What a value says: nothing near the middle, a word either way, a stronger one further out. @param {number} v @param {string[]} more @param {string[]} less */
function say(v, more, less) {
  if (v > .15) return v > .62 && more[2] ? { short: more[2], phrase: more[3] } : { short: more[0], phrase: more[1] };
  if (v < -.15) return v < -.62 && less[2] ? { short: less[2], phrase: less[3] } : { short: less[0], phrase: less[1] };
  return { short: '', phrase: '' };
}

/**
 * The strokes that show one style of one part on this face, shaped as asked.
 * @param {import('../studio/face.js').Face} f @param {string} part @param {string} style @param {Record<string, number>} [shape]
 * @returns {Stroke[]}
 */
export function markup(f, part, style, shape = {}) { return draw(f, part, style, shape).strokes; }

/**
 * The handles a style of a part can be shaped by on this face, each with how far it moves for a whole step of its
 * value (measured, so a handle stays under the finger that drags it).
 * @param {import('../studio/face.js').Face} f @param {string} part @param {string} style @param {Record<string, number>} [shape]
 * @returns {Control[]}
 */
export function controlsOf(f, part, style, shape = {}) {
  return draw(f, part, style, shape).controls.map(c => {
    const at = (/** @type {number} */ v) => draw(f, part, style, { ...shape, [c.id]: v }).controls.find(k => k.id === c.id);
    const hi = at(1), lo = at(-1), d = hi && lo ? (c.axis === 'x' ? hi.x - lo.x : hi.y - lo.y) / 2 : 0;
    return { ...c, span: Math.max(1, Math.abs(d)), dir: d < 0 ? -1 : 1 };
  });
}

/**
 * The drawing itself: strokes, and the handles on them.
 * @param {import('../studio/face.js').Face} f @param {string} part @param {string} style @param {Record<string, number>} shape
 */
function draw(f, part, style, shape) {
  const P = (/** @type {number} */ i) => f.pts[i], [bx, by, bw, bh] = f.box, u = bw / 100, cx = P(10).x;
  const hair = P(10).y - bh * .02, brow = Math.min(P(105).y, P(334).y), F = Math.max(bh * .12, brow - hair);
  const out = /** @type {Stroke[]} */ ([]), controls = /** @type {Mark[]} */ ([]), r = jitter(part.length * 31 + style.length);
  const v = (/** @type {string} */ id) => Math.max(-1, Math.min(1, shape[id] || 0));
  const control = (/** @type {string} */ id, /** @type {Pt} */ at, /** @type {'x' | 'y'} */ axis, /** @type {{ short: string, phrase: string }} */ words) => { controls.push({ id, x: at.x, y: at.y, axis, v: v(id), ...words }); };
  // which way round the face is: a front camera's picture is mirrored, its points with it, so sides are found by where they are
  const m = P(263).x >= P(33).x ? 1 : -1;
  const side = (/** @type {number} */ s) => (s * m < 0 ? { temple: P(54), edge: P(127), cheek: P(234), corner: P(33), browOut: P(70) } : { temple: P(284), edge: P(356), cheek: P(454), corner: P(263), browOut: P(300) });

  if (part === 'bangs') {
    if (style === 'curtain') {
      // the parting moves with 'part'; the curtains fall further with 'length'
      const mid = cx + v('part') * bw * .12, drop = v('length') * F * .9;
      let tip = { x: 0, y: 0 };
      for (const s of [-1, 1]) {
        const sd = side(s);
        for (let k = 0; k < 4; k++) {
          const a = { x: mid + s * bw * (.005 + k * .014), y: hair - F * (.25 - k * .04) };
          const c1 = { x: mid + s * bw * (.2 + k * .03), y: a.y + F * (.02 + k * .05) }, c2 = { x: sd.browOut.x + s * bw * (.02 + k * .02), y: brow - F * (.55 - k * .12) + drop * .3 };
          const e = { x: sd.cheek.x - s * bw * (.05 - k * .03), y: sd.corner.y + F * (.4 + k * .15) + drop };
          out.push({ d: 'M' + pt(a) + ' C' + pt(c1) + ', ' + pt(c2) + ', ' + pt(e), w: u * (k ? .55 : .8) });
          if (s > 0 && k === 1) tip = e;
        }
      }
      control('length', tip, 'y', say(v('length'), ['longer', 'longer, falling past the cheekbones', 'to the jaw', 'long, falling to the jaw'], ['shorter', 'shorter, ending at the cheekbones', 'eye level', 'short, ending level with the eyes']));
      control('part', { x: mid, y: hair - F * .25 }, 'x', say(v('part'), ['parted right', 'the parting moved toward the right of the picture'], ['parted left', 'the parting moved toward the left of the picture']));
    }
    else if (style === 'side') {
      const a = { x: cx - bw * .2 + v('part') * bw * .15, y: hair - F * .25 }, drop = v('length') * F * .6;
      let tip = { x: 0, y: 0 };
      for (let k = 0; k < 6; k++) {
        const s = { x: a.x + bw * k * .035, y: a.y + F * k * .02 }, e = { x: side(1).temple.x + bw * (.04 - k * .015), y: brow - F * (.05 - k * .1) + drop };
        out.push({ d: 'M' + pt(s) + ' C' + pt({ x: s.x - bw * .02, y: s.y + F * .5 }) + ', ' + pt({ x: e.x - bw * .3, y: e.y + F * .15 }) + ', ' + pt(e), w: u * (k === 0 ? .8 : .5) });
        if (k === 3) tip = e;
      }
      control('length', tip, 'y', say(v('length'), ['longer', 'longer, sweeping down past the brow'], ['shorter', 'shorter, clear of the brow']));
      control('part', a, 'x', say(v('part'), ['nearer the middle', 'from a part nearer the middle'], ['deeper part', 'from a deeper side part']));
    }
    else {
      // fringes that fall straight: how far down, how many strands, how loose
      const look = /** @type {Record<string, { to: number, n: number, line: boolean, loose: number }>} */ ({ blunt: { to: .86, n: 11, line: true, loose: .15 }, micro: { to: .42, n: 11, line: true, loose: .1 }, wispy: { to: .95, n: 9, line: false, loose: .9 }, birkin: { to: 1.36, n: 13, line: false, loose: .5 } })[style] || { to: .86, n: 11, line: true, loose: .2 };
      const to = Math.max(.25, Math.min(1.45, look.to + v('length') * .38));
      const L = side(-1).temple, R = side(1).temple, w = R.x - L.x + bw * .08, x0 = L.x - bw * .04, end = (/** @type {number} */ t) => hair + F * to + Math.sin(t * Math.PI) * F * .08;
      for (let k = 0; k < look.n; k++) {
        const t = (k + .5) / look.n, x = x0 + w * t, y1 = end(t) + (look.line ? 0 : r() * F * .22 * look.loose), lean = (t - .5) * bw * .06 + r() * bw * .015 * look.loose;
        if (style === 'birkin' && Math.abs(t - .5) < .05) continue;
        out.push({ d: 'M' + pt({ x: x - lean * .4, y: hair - F * .22 }) + ' C' + pt({ x: x - lean * .2, y: hair + F * .2 }) + ', ' + pt({ x: x + lean * .6, y: y1 - F * .3 }) + ', ' + pt({ x: x + lean, y: y1 }), w: u * (look.line ? .5 : .42) });
      }
      if (look.line) out.push({ d: 'M' + pt({ x: x0, y: end(0) }) + ' Q' + pt({ x: x0 + w / 2, y: end(.5) + F * .1 }) + ', ' + pt({ x: x0 + w, y: end(1) }), w: u * .9 });
      // where the fringe ends, said by what it ends at
      const at = hair + F * to, lid = Math.min(P(159).y, P(386).y);
      const where = at < brow - F * .45 ? ['high', 'short, high on the forehead'] : at < brow - F * .12 ? ['above the brows', 'ending well above the brows'] : at < brow + F * .06 ? ['at the brows', 'ending right at the brows'] : at < lid - F * .05 ? ['below the brows', 'falling just below the brows'] : ['to the lashes', 'long enough to brush the lashes'];
      control('length', { x: x0 + w / 2, y: end(.5) + (look.line ? F * .05 : 0) }, 'y', Math.abs(v('length')) > .1 ? { short: where[0], phrase: where[1] } : { short: '', phrase: '' });
    }
  }

  if (part === 'brows') for (const [i, b] of BROW.entries()) {
    const s = (i ? 1 : -1) * m, arch = v('arch'), full = v('full'), tail = v('tail');
    const up0 = b.up.map(P), low0 = b.low.map(P), thick0 = up0.reduce((a, p, k) => a + Math.hypot(p.x - low0[k].x, p.y - low0[k].y), 0) / up0.length;
    // the arch lifts the brow most near its peak; fullness spreads it both ways; the tail is drawn out (or in) along it
    const lift = [.3, 1, .75, .25, 0], body = [1, 1, 1, 1, .5];
    const up = up0.map((p, k) => ({ x: p.x, y: p.y - arch * thick0 * 1.1 * lift[k] - full * thick0 * .3 * body[k] }));
    const low = low0.map((p, k) => ({ x: p.x, y: p.y - arch * thick0 * .9 * lift[k] + full * thick0 * .3 * body[k] }));
    for (const ps of [up, low]) { const d = { x: ps[0].x - ps[1].x, y: ps[0].y - ps[1].y }; ps[0] = { x: ps[0].x + d.x * tail * .55, y: ps[0].y + d.y * tail * .55 + Math.max(0, tail) * thick0 * .25 }; }
    const mid = up.map((p, k) => lerp(p, low[k], .5)), thick = up.reduce((a, p, k) => a + Math.hypot(p.x - low[k].x, p.y - low[k].y), 0) / up.length;
    const outer = mid[0], inner = mid[mid.length - 1];
    if (style === 'feathered') {
      for (let k = 0; k < 16; k++) {
        const t = k / 15, j = Math.min(3, Math.floor(t * 4)), w = t * 4 - j, a = lerp(low[4 - j], low[3 - j] || low[0], 1 - w), c = lerp(up[4 - j], up[3 - j] || up[0], 1 - w);
        out.push({ d: 'M' + pt(lerp(a, c, -.1)) + ' L' + pt({ x: c.x + s * thick * .35, y: c.y - thick * .55 }), w: u * .3 });
      }
    } else {
      const line = style === 'straight' ? mid.map((p, k) => lerp(p, lerp(inner, outer, 1 - k / (mid.length - 1)), .75))
        : style === 'arched' ? mid.map((p, k) => (k === 1 ? { x: p.x, y: p.y - thick * .9 } : k === 0 ? { x: p.x, y: p.y + thick * .3 } : p))
        : style === 'thin' ? mid.map(p => ({ x: p.x, y: p.y - thick * .2 })) : mid;
      out.push({ d: through(line), w: thick * ({ bold: 1.15, thin: .3, soft: .7, straight: .75, arched: .6 }[style] || .7) });
    }
    // the handles sit on one brow each, so they have room: the arch and the tail on the right, the fullness on the left
    if (s > 0) {
      control('arch', { x: up[1].x, y: up[1].y - thick * 2.3 }, 'y', say(arch, ['higher arch', 'with a higher, lifted arch', 'high arch', 'with a sharp, high arch'], ['softer arch', 'with a softer, flatter arch', 'almost straight', 'almost straight, barely arched']));
      control('tail', { x: outer.x + s * thick * 2.4, y: outer.y + thick * .2 }, 'x', say(tail, ['longer tails', 'with longer tails, drawn out toward the temples'], ['shorter tails', 'with shorter tails']));
    } else control('full', { x: low[2].x, y: low[2].y + thick * 1.5 }, 'y', say(full, ['fuller', 'fuller and thicker', 'much fuller', 'much fuller, thick and brushed'], ['finer', 'finer and thinner', 'very fine', 'very fine and thin']));
  }

  if (part === 'lashes') for (const [i, lid] of LID.entries()) {
    const ps = lid.map(P), s = (i ? 1 : -1) * m, eh = Math.abs(P(i ? 374 : 145).y - P(i ? 386 : 159).y) || bh * .04, L = v('long');
    if (style === 'wing' || style === 'smoky') {
      const c = ps[ps.length - 1], tip = { x: c.x + s * bw * .085 * (1 + L * .6), y: c.y - eh * 1.1 * (1 + L * .35) };
      out.push({ d: through(ps.slice(2)) + ' L' + pt(tip), w: u * (style === 'wing' ? .7 : 1.6) });
      if (style === 'smoky') out.push({ d: through(ps.map(p => ({ x: p.x, y: p.y - eh * .55 }))), w: u * 1.4 });
      if (s > 0) control('long', tip, 'x', say(L, ['longer wing', 'with a longer, more dramatic wing'], ['short flick', 'with a short, subtle flick']));
      continue;
    }
    const long = (style === 'bright' ? 1.6 : 1) * (1 + L * .55);
    let tip = { x: 0, y: 0 };
    for (let k = 2; k < ps.length; k++) {
      const p = ps[k], t = (k - 2) / (ps.length - 3), len = eh * (.55 + .5 * t) * long, a = -Math.PI / 2 + s * (.15 + t * .9);
      const e = { x: p.x + Math.cos(a) * len + s * len * .25 * (long - .8), y: p.y + Math.sin(a) * len };
      out.push({ d: 'M' + pt(p) + ' Q' + pt({ x: p.x + Math.cos(a) * len * .4, y: p.y + Math.sin(a) * len * .7 }) + ', ' + pt(e), w: u * .32 });
      if (k === ps.length - 3) tip = e;
    }
    if (s > 0) control('long', tip, 'y', say(L, ['longer', 'longer, fuller lashes'], ['shorter', 'shorter, more natural lashes']));
  }

  if (part === 'beard') {
    const mid = { x: (P(234).x + P(454).x) / 2, y: (P(234).y + P(152).y) / 2 };
    const push = (/** @type {number} */ k) => JAW.map(i => { const p = P(i); return { x: mid.x + (p.x - mid.x) * (1 + k), y: mid.y + (p.y - mid.y) * (1 + k * 1.4) }; });
    const lipTop = P(0), lip = m > 0 ? { l: P(61), r: P(291) } : { l: P(291), r: P(61) }, under = P(17);
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
      const n0 = style === 'full' ? 22 : 12, k = (style === 'full' ? .12 : .05) + v('length') * .07, edge = push(k).slice(1, -1);
      out.push({ d: through(edge), w: u * .8 });
      const cheek = (/** @type {number} */ s) => { const c = side(s).cheek, l = s < 0 ? lip.l : lip.r; return 'M' + pt({ x: c.x - s * bw * .02, y: c.y + bh * .02 }) + ' Q' + pt({ x: c.x - s * bw * .1, y: l.y - bh * .12 }) + ', ' + pt({ x: l.x - s * bw * .05, y: l.y + bh * .01 }); };
      out.push({ d: cheek(-1), w: u * .6 }, { d: cheek(1), w: u * .6 }, { d: moustache, w: u * 1.1 });
      for (let j = 0; j < n0; j++) { const a = edge[1 + Math.floor((j + .5) / n0 * (edge.length - 2))], p = lerp(a, { x: cx, y: under.y }, .25 + r() * .1); out.push({ d: 'M' + pt(lerp(a, p, .15)) + ' L' + pt(p), w: u * .3 }); }
      control('length', edge[Math.floor(edge.length / 2)], 'y', say(v('length'), ['longer', 'longer and fuller', 'much longer', 'much longer and fuller'], ['shorter', 'shorter, closer to the skin', 'very short', 'very short, close-cropped']));
    }
  }

  if (part === 'cut') {
    const vol = v('volume'), top = by - bh * .3, chin = P(152).y, L = bx - bw * (.16 + vol * .06), R = bx + bw * (1.16 + vol * .06), mid = (L + R) / 2;
    const crown = (/** @type {number} */ k) => 'M' + pt({ x: L - bw * k, y: chin }) + ' C' + pt({ x: L - bw * (k + .06), y: by }) + ', ' + pt({ x: mid - bw * .62, y: top }) + ', ' + pt({ x: mid, y: top }) + ' C' + pt({ x: mid + bw * .62, y: top }) + ', ' + pt({ x: R + bw * (k + .06), y: by }) + ', ' + pt({ x: R + bw * k, y: chin });
    const lengths = /** @type {Record<string, number>} */ ({ bob: 1.06, long: 1.9, shag: 1.4, curls: 1.25 });
    if (style === 'buzz' || style === 'pixie') {
      const t = by - bh * (style === 'buzz' ? .1 : .2), ear = P(234).y - (style === 'buzz' ? bh * .05 : -bh * .04);
      out.push({ d: 'M' + pt({ x: bx - bw * .04, y: ear }) + ' C' + pt({ x: bx - bw * .1, y: by }) + ', ' + pt({ x: mid - bw * .55, y: t }) + ', ' + pt({ x: mid, y: t }) + ' C' + pt({ x: mid + bw * .55, y: t }) + ', ' + pt({ x: bx + bw * 1.1, y: by }) + ', ' + pt({ x: bx + bw * 1.04, y: ear }), w: u * .9 });
      if (style === 'pixie') for (let k = 0; k < 7; k++) { const x = bx + bw * (.15 + k * .11); out.push({ d: 'M' + pt({ x, y: t + bh * .02 }) + ' Q' + pt({ x: x + bw * .06, y: hair }) + ', ' + pt({ x: x + bw * .1, y: hair + F * .45 }), w: u * .45 }); }
      else for (let k = 0; k < 90; k++) { const a = Math.PI * (1.05 + (r() + .5) * .9), rr = .35 + (r() + .5) * .12; out.push({ d: 'M' + pt({ x: mid + Math.cos(a) * bw * rr * 1.25, y: by + bh * .12 + Math.sin(a) * bh * rr * .7 }) + ' h.1', w: u * .45 }); }
    } else {
      const fall = chin + (lengths[style] - 1) * bh * 1.2 + v('length') * bh * .7, wave = style === 'curls' ? 1 : 0;
      /** @type {Pt[]} */ let right = [];
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? L : R, pts = [];
        for (let k = 0; k <= 8; k++) { const t = k / 8, y = by + (fall - by) * t, x = x0 + s * bw * (.02 + t * .14) * (1 + vol * .6) + Math.sin(t * Math.PI * 5) * bw * .05 * wave; pts.push({ x, y }); }
        out.push({ d: through(pts), w: u * .9 });
        if (style === 'bob') out.push({ d: 'M' + pt(pts[8]) + ' Q' + pt({ x: pts[8].x - s * bw * .05, y: fall + bh * .05 }) + ', ' + pt({ x: pts[8].x - s * bw * .22, y: fall - bh * .02 }), w: u * .9 });
        if (style === 'shag') for (let j = 1; j <= 3; j++) { const p = pts[2 * j + 1]; out.push({ d: 'M' + pt(p) + ' l' + n(-s * bw * .1) + ' ' + n(bh * .08), w: u * .6 }); }
        if (style === 'long') for (let j = 0; j < 3; j++) { const p = pts[3 + j * 2]; out.push({ d: 'M' + pt({ x: p.x - s * bw * .1, y: p.y - bh * .2 }) + ' Q' + pt({ x: p.x - s * bw * .04, y: p.y }) + ', ' + pt({ x: p.x - s * bw * .08, y: p.y + bh * .25 }), w: u * .45 }); }
        if (s > 0) right = pts;
      }
      out.push({ d: crown(0).replace(/^M[^C]*/, 'M' + pt({ x: L, y: by + bh * .1 })), w: u * .9 });
      // where it ends, said by where on the body that is
      const d = (fall - chin) / bh, where = d < -.1 ? ['above the chin', 'cropped above the chin'] : d < .15 ? ['chin length', 'ending at the chin'] : d < .5 ? ['to the neck', 'just past the chin, at the neck'] : d < .9 ? ['to the shoulders', 'resting on the shoulders'] : d < 1.4 ? ['past the shoulders', 'falling past the shoulders'] : ['long', 'long, well down the back'];
      control('length', right[8], 'y', Math.abs(v('length')) > .1 ? { short: where[0], phrase: where[1] } : { short: '', phrase: '' });
      control('volume', right[4], 'x', say(vol, ['fuller', 'with more volume and body'], ['sleeker', 'sleek, close to the head']));
    }
  }

  // colours have no strokes, only a shade: lighter up, deeper down
  if (part === 'colour') control('shade', { x: bx + bw * .5, y: by - bh * .16 - v('shade') * bh * .18 }, 'y', say(v('shade'), ['lighter', 'a shade lighter', 'much lighter', 'much lighter, several shades up'], ['deeper', 'a shade deeper', 'much deeper', 'much deeper and richer']));
  if (part === 'lips') control('shade', { x: P(17).x, y: P(17).y + bh * .07 - v('shade') * bh * .08 }, 'y', say(v('shade'), ['lighter', 'a lighter, softer shade'], ['deeper', 'a deeper, richer shade']));
  return { strokes: out, controls };
}
