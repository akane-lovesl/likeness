/**
 * A look, weeks on: what the days after the salon do to it. Hair grows about a centimetre and a quarter a month, a
 * little over a fifth of a forehead's height, so a fringe falls lower and loses its line, a colour's roots come in at
 * the parting and along the hairline, a cut grows out of its shape, shaped brows grow back and a beard fills in. Make-up
 * is put on each morning, and does not age. Each look also says when it will want seeing to (a trim, its roots), so its
 * upkeep is seen before it is chosen.
 */

/** How far hair grows in a week, of the forehead's height (about 1.25 cm a month, on a forehead about 5.5 cm high). */
export const GROW = .055;
/** The weeks the mirror looks ahead: today to three months on. */
export const WEEKS = 12;

/** When each look wants seeing to, in weeks, and what for. @type {Record<string, Record<string, [number, string]>>} */
const UPKEEP = {
  bangs: { blunt: [3, 'trim'], micro: [2, 'trim'], wispy: [4, 'trim'], birkin: [4, 'trim'], curtain: [6, 'trim'], side: [6, 'trim'] },
  colour: { platinum: [4, 'roots'], silver: [5, 'roots'], rose: [4, 'refresh'], copper: [6, 'gloss'], jet: [6, 'roots'], honey: [12, 'roots'] },
  cut: { pixie: [4, 'trim'], buzz: [2, 'trim'], bob: [8, 'trim'], shag: [8, 'trim'], long: [12, 'trim'], curls: [10, 'trim'] },
  brows: { soft: [5, 'shape'], straight: [4, 'shape'], arched: [3, 'shape'], feathered: [6, 'lift'], bold: [4, 'tint'], thin: [2, 'shape'] },
  beard: { stubble: [1, 'trim'], trimmed: [2, 'trim'], full: [4, 'shape'], moustache: [2, 'trim'] },
};
/** What the wanting looks like, said in the mirror once it is due. @type {Record<string, Record<string, string>>} */
const DUE = {
  bangs: { trim: 'the fringe in the eyes' }, colour: { roots: 'roots showing', refresh: 'the colour fading', gloss: 'the colour dulling' },
  cut: { trim: 'the cut losing its shape' }, brows: { shape: 'brows growing back', lift: 'brows dropping', tint: 'the tint fading' },
  beard: { trim: 'the beard growing out', shape: 'the beard losing its line' },
};

/** @typedef {{ part: string, style: { id: string }, shape?: Record<string, number> }} Aging */

/** What a look will want, and when: one for each pick that ages. @param {Aging[]} picks */
export function upkeepOf(picks) {
  return picks.flatMap(q => { const u = UPKEEP[q.part]?.[q.style.id]; return u ? [{ part: q.part, at: u[0], what: u[1] }] : []; });
}
/** Whether anything in a look changes with time. @param {Aging[]} picks */
export const ages = (picks) => upkeepOf(picks).length > 0;

/**
 * A pick as it will be so many weeks on: its shape carries how far the hair has grown (grow, in foreheads' height),
 * which the drawing and the paint both take. @template {Aging} T @param {T} q @param {number} weeks @returns {T}
 */
export function aged(q, weeks) {
  if (!weeks || !UPKEEP[q.part]?.[q.style.id]) return q;
  return { ...q, shape: { ...(q.shape || {}), grow: weeks * GROW } };
}

/** "6 weeks", "2½ months": a time ahead, said plainly (to the nearest half month, from two months on). @param {number} weeks */
export function weeksSaid(weeks) {
  if (weeks <= 0) return 'Today';
  if (weeks === 1) return '1 week';
  if (weeks < 8) return weeks + ' weeks';
  const m = Math.round(weeks / 4.33 * 2) / 2;
  return (m % 1 ? Math.floor(m) + '½' : String(m)) + ' months';
}

/** What a look will want, said on its card for the stylist: "Trim every 3 weeks". @param {Aging} q */
export function upkeepSaid(q) {
  const u = UPKEEP[q.part]?.[q.style.id]; if (!u) return '';
  const [at, what] = u, every = at === 1 ? 'every week' : 'every ' + at + ' weeks';
  return /** @type {Record<string, string>} */ ({ trim: 'Trim ' + every, roots: 'Roots show from ' + weeksSaid(at).toLowerCase(), refresh: 'Refresh ' + every, gloss: 'Gloss ' + every, shape: 'Shape ' + every, lift: 'Lift lasts ' + at + ' weeks', tint: 'Tint lasts ' + at + ' weeks' })[what] || '';
}
/** The word a time's mark is labelled with on the mirror's ruler. @param {{ part: string, what: string }} u */
export const markOf = (u) => (u.part === 'colour' ? u.what : u.part === 'bangs' ? 'trim' : u.part);

/** What shows at a time: what is due by then, a few words. @param {Aging[]} picks @param {number} weeks */
export function noteAt(picks, weeks) {
  if (weeks <= 0) return '';
  const due = upkeepOf(picks).filter(u => weeks >= u.at).sort((a, b) => a.at - b.at).map(u => DUE[u.part]?.[u.what] || '');
  if (!due.length) return 'Still holding its shape';
  const s = due.filter(Boolean).slice(0, 2).join(' · ');
  return s[0].toUpperCase() + s.slice(1);
}

/** About how much the hair has grown, said in centimetres. @param {number} weeks */
const cm = (weeks) => (Math.round(weeks * 2.9) / 10).toString().replace(/\.0$/, '') + ' cm';
/**
 * The words for the studio, for a look so many weeks on: what time has done to each part, in a sentence the studio can
 * draw. Empty for today. @param {Aging[]} picks @param {number} weeks
 */
export function grownWords(picks, weeks) {
  if (weeks <= 0) return '';
  const bits = picks.flatMap(q => {
    if (!UPKEEP[q.part]?.[q.style.id]) return [];
    if (q.part === 'bangs') return ['the fringe grown out about ' + cm(weeks) + ' since it was cut, falling lower and less neatly'];
    if (q.part === 'colour') return ['about ' + cm(weeks) + ' of their own natural colour grown in at the roots, along the parting and the hairline'];
    if (q.part === 'cut') return ['the cut grown out about ' + cm(weeks) + ', softer and less shaped'];
    if (q.part === 'brows') return ['the brows growing back toward their own shape'];
    if (q.part === 'beard') return ['the beard grown out about ' + cm(weeks) + ', fuller and less neat'];
    return [];
  });
  return bits.length ? 'Show it ' + weeksSaid(weeks) + ' after the salon: ' + bits.join('; ') : '';
}

const make = (/** @type {number} */ w, /** @type {number} */ h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const ctx = (/** @type {HTMLCanvasElement} */ c) => /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true }));

/**
 * Where a colour's own roots have come in, so many weeks on: a band along the hairline (across the forehead, between
 * the temples) and up the parting, as wide as the hair has grown, and soft where the colour was put on softly (a
 * balayage). Its alpha is how much of the hair's own colour shows, at the size of the hair's mask; null for none.
 * @param {import('../studio/face.js').Face} f @param {HTMLCanvasElement} mask the hair, over the whole picture
 * @param {number} weeks @param {string} style
 */
export function rootsOf(f, mask, weeks, style) {
  if (weeks <= 0 || !mask) return null;
  const P = (/** @type {number} */ i) => f.pts[i], [bx, , bw, bh] = f.box, sx = mask.width / f.w, sy = mask.height / f.h;
  const hair = P(10).y - bh * .02, brow = Math.min(P(105).y, P(334).y), F = Math.max(bh * .12, brow - hair), r = weeks * GROW * F;
  // the mask, small: column by column across the forehead, where the hair begins, coming up from the brows
  const L = Math.min(P(54).x, P(284).x), R = Math.max(P(54).x, P(284).x), top = Math.max(0, hair - F * 3.4), n = 96;
  const k = n / Math.max(1, R - L), rows = Math.max(8, Math.round((brow - top) * k));
  const c = make(n, rows), x = ctx(c); x.drawImage(mask, L * sx, top * sy, (R - L) * sx, (brow - top) * sy, 0, 0, n, rows);
  const d = x.getImageData(0, 0, n, rows).data, at = (/** @type {number} */ i, /** @type {number} */ j) => d[(j * n + i) * 4 + 3];
  // the top of the face, temple to temple: under a fringe the hairline is about there, whatever hangs over it
  const brim = [54, 103, 67, 109, 10, 338, 297, 332, 284].map(i => ({ x: P(i).x, y: P(i).y - bh * .02 })).sort((a, b) => a.x - b.x);
  const brimAt = (/** @type {number} */ px) => { let j = 1; while (j < brim.length - 1 && brim[j].x < px) j++; const a = brim[j - 1], b = brim[j], t = Math.max(0, Math.min(1, (px - a.x) / Math.max(1e-6, b.x - a.x))); return a.y + (b.y - a.y) * t; };
  const line = new Float64Array(n);
  for (let i = 0; i < n; i++) { let j = rows - 1; while (j > 0 && at(i, j) < 140) j--; line[i] = j > 0 ? Math.min(top + j / k, brimAt(L + i / k) + F * .12) : NaN; }
  // smoothed, and where a column found none, its neighbours'
  const ys = Array.from(line, (_, i) => { let s = 0, w = 0; for (let q = Math.max(0, i - 4); q <= Math.min(n - 1, i + 4); q++) if (!Number.isNaN(line[q])) { s += line[q]; w++; } return w ? s / w : hair; });
  // the parting: across the middle of the head, where there is least hair just above the hairline (the middle if none)
  let part = -1, least = Infinity, sum = 0;
  for (let i = Math.round(n * .3); i < Math.round(n * .7); i++) { let v = 0; const j1 = Math.round((ys[i] - top) * k), j0 = Math.max(0, j1 - Math.round(F * 1.4 * k)); for (let j = j0; j < Math.max(j0 + 1, j1 - Math.round(F * .12 * k)); j++) v += at(i, j); sum += v; if (v < least) { least = v; part = i; } }
  const mean = sum / Math.max(1, Math.round(n * .7) - Math.round(n * .3));
  // (only a clear gap in the hair is a parting: short hair and curls have none, and their roots come in all along)
  const parted = part >= 0 && least < mean * .4, px = parted ? L + part / k : P(10).x;
  const out = make(mask.width, mask.height), o = ctx(out);
  o.setTransform(sx, 0, 0, sy, 0, 0); o.fillStyle = '#fff';
  // the band along the hairline: as wide as the hair has grown, thinning toward the temples
  o.beginPath();
  const wide = parted ? 1 : 1.3;
  for (let i = 0; i < n; i++) { const e = Math.sin(Math.PI * (i + .5) / n) ** .35; o.lineTo(L + i / k, ys[i] - r * e * wide); }
  for (let i = n - 1; i >= 0; i--) o.lineTo(L + i / k, ys[i] + r * .25);
  o.closePath(); o.fill();
  // and up the parting, over the crown, where there is one
  if (parted) {
    const yp = ys[Math.max(0, Math.min(n - 1, Math.round((px - L) * k)))], w0 = Math.max(r * .9, F * .03);
    o.beginPath(); o.moveTo(px - w0, yp + r * .2); o.lineTo(px - w0 * .45, yp - F * 3); o.lineTo(px + w0 * .45, yp - F * 3); o.lineTo(px + w0, yp + r * .2); o.closePath(); o.fill();
  }
  // soft at its edge (a balayage most of all), and only where there is hair
  const soft = make(mask.width, mask.height), so = ctx(soft);
  so.filter = 'blur(' + Math.max(1, r * (style === 'honey' ? 1.1 : .32) * sx).toFixed(1) + 'px)'; so.drawImage(out, 0, 0); so.filter = 'none';
  so.globalCompositeOperation = 'destination-in'; so.drawImage(mask, 0, 0);
  return soft;
}
