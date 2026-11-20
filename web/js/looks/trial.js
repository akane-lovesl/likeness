/**
 * The fitting: a look fitted to a face the way an optometrist finds a prescription. Nobody is asked what they want in
 * words or numbers. They are shown two, one and then the other, and asked which: "one, or two?" Coarse first (the
 * style, or the one a stylist would suggest beside it), then finer (a length, a parting, a shade), each answer halving
 * the step, the way lenses are refined. Either is an answer too: then the one that is easier to live with, or as it was.
 */
import { upkeepOf, weeksSaid } from './time.js';

/**
 * For each style, the one a stylist would suggest beside it: a close cousin, the easier to live with where there is
 * one (a wispy fringe for a blunt one, honey for platinum). Jet and clean-shaven have none.
 * @type {Record<string, Record<string, string>>}
 */
export const NEAR = {
  bangs: { blunt: 'wispy', micro: 'blunt', wispy: 'curtain', birkin: 'curtain', curtain: 'side', side: 'curtain' },
  colour: { platinum: 'honey', silver: 'platinum', rose: 'copper', copper: 'honey', honey: 'copper' },
  cut: { bob: 'shag', pixie: 'bob', shag: 'long', long: 'shag', curls: 'shag', buzz: 'pixie' },
  brows: { soft: 'feathered', straight: 'soft', arched: 'soft', feathered: 'soft', bold: 'feathered', thin: 'soft' },
  lashes: { natural: 'bright', wing: 'smoky', smoky: 'wing', bright: 'natural' },
  lips: { nude: 'gloss', red: 'berry', berry: 'red', gloss: 'nude' },
  beard: { stubble: 'trimmed', trimmed: 'stubble', full: 'trimmed', moustache: 'trimmed' },
};

/** The order a look is fitted in: what changes a face most, first. */
const ORDER = ['bangs', 'cut', 'colour', 'brows', 'beard', 'lashes', 'lips'];
/** What each part is called when it is being looked at. */
export const PART_SAID = /** @type {Record<string, string>} */ ({ bangs: 'The fringe', cut: 'The cut', colour: 'The colour', brows: 'The brows', beard: 'The beard', lashes: 'The eyes', lips: 'The lips' });
/** What each way a part is shaped is called. */
export const SHAPE_SAID = /** @type {Record<string, string>} */ ({ length: 'length', part: 'parting', shade: 'shade', arch: 'arch', tail: 'tails', full: 'fullness', long: 'length', volume: 'volume' });
/** Two of a shape side by side, said of each other: [the lower, the higher]. A side fringe's parting runs the other way. */
const BETWEEN = /** @type {Record<string, [string, string]>} */ ({ length: ['shorter', 'longer'], part: ['parted left', 'parted right'], shade: ['deeper', 'lighter'], arch: ['a softer arch', 'a higher arch'], tail: ['shorter tails', 'longer tails'], full: ['finer', 'fuller'], long: ['shorter', 'longer'], volume: ['sleeker', 'fuller'] });

/** @typedef {{ part: string, style: { id: string, name: string }, shape?: Record<string, number> }} Fitting a pick, as the fitting needs it */
/** @typedef {{ part: string, kind: 'style' } | { part: string, kind: 'shape', id: string, step: number }} Step */
/**
 * A question: the two looks for the part, in the order they are shown (one, two), what each is said to be, and what
 * Either would keep (an index into looks; -1, the look as it was before the question).
 * @typedef {{ looks: [Fitting, Fitting], said: [string, string], either: number, why: string, was: Fitting }} Question
 */

/**
 * The steps a look is fitted by, coarse to fine: for each part its neighbour, then the first of its shapes twice (a
 * whole step, then a half) and the second once; with more parts, fewer for each, so the whole is a minute or so.
 * @param {Fitting[]} picks @param {(q: Fitting) => string[]} shapes the ways a pick can be shaped on this face
 * @returns {Step[]}
 */
export function planOf(picks, shapes) {
  const ps = /** @type {Fitting[]} */ (ORDER.map(p => picks.find(q => q.part === p)).filter(Boolean));
  const n = ps.length, out = /** @type {Step[]} */ ([]);
  for (const q of ps) out.push(...stepsFor(q, shapes(q), n));
  return out.slice(0, 10);
}
/** One part's steps. @param {Fitting} q @param {string[]} ids @param {number} n how many parts are being fitted @returns {Step[]} */
export function stepsFor(q, ids, n) {
  const out = /** @type {Step[]} */ ([]);
  if (NEAR[q.part]?.[q.style.id]) out.push({ part: q.part, kind: 'style' });
  const [a, b] = ids.filter(id => id in BETWEEN);
  if (a) { out.push({ part: q.part, kind: 'shape', id: a, step: .5 }); if (n <= 3) out.push({ part: q.part, kind: 'shape', id: a, step: .25 }); }
  if (b && n <= 2) out.push({ part: q.part, kind: 'shape', id: b, step: .5 });
  return out;
}

const clamp1 = (/** @type {number} */ v) => Math.max(-1, Math.min(1, v));
/**
 * The question a step asks of a look as it now is, or null where it would ask nothing (no neighbour, or both ends of
 * a shape the same). The two are shown the other way round every other question, so neither number is the safe one.
 * @param {Step} s @param {Fitting[]} picks @param {number} i the question's place @param {(id: string) => Fitting['style'] | undefined} styleBy
 * @returns {Question | null}
 */
export function questionOf(s, picks, i, styleBy) {
  const q = picks.find(k => k.part === s.part); if (!q) return null;
  /** @type {[Fitting, Fitting]} */ let looks; /** @type {[string, string]} */ let said; let either = 0, why = '';
  if (s.kind === 'style') {
    const st = styleBy(NEAR[q.part]?.[q.style.id] || ''); if (!st) return null;
    const other = { ...q, style: st };
    looks = [q, other]; said = [q.style.name + ', as it is', st.name];
    // either: the one that keeps longer before it wants seeing to, or as it was
    const keeps = (/** @type {Fitting} */ k) => upkeepOf([k])[0]?.at || 0, a = keeps(q), b = keeps(other);
    if (b > a) { either = 1; why = st.name + ', as it keeps ' + (b - a === 1 ? 'a week' : weeksSaid(b - a).toLowerCase()) + ' longer'; } else { either = 0; why = q.style.name + ', as it was'; }
  } else {
    const v = q.shape?.[s.id] || 0, lo = clamp1(v - s.step), hi = clamp1(v + s.step); if (hi - lo < .2) return null;
    const words = s.id === 'part' && q.style.id === 'side' ? ['a deeper part', 'parted nearer the middle'] : BETWEEN[s.id] || ['less', 'more'];
    looks = [{ ...q, shape: { ...(q.shape || {}), [s.id]: lo } }, { ...q, shape: { ...(q.shape || {}), [s.id]: hi } }];
    said = [(s.step < .5 ? 'a little ' : '') + words[0], (s.step < .5 ? 'a little ' : '') + words[1]];
    either = -1; why = 'as it is, then';
  }
  if (i % 2) { looks = [looks[1], looks[0]]; said = [said[1], said[0]]; if (either >= 0) either = 1 - either; }
  return { looks, said, either, why, was: q };
}

/** What was chosen, said back as the frame's caption ("Two: a little longer."). @param {Question} q @param {number} k 0, 1, or -1 for either */
export function answerSaid(q, k) {
  const n = ['One', 'Two'];
  if (k < 0) return 'Either: ' + q.why + '.';
  return n[k] + ': ' + q.said[k] + '.';
}

/** A step's name, as the dock heads it: "The fringe · length". @param {Step} s */
export const stepSaid = (s) => (PART_SAID[s.part] || s.part) + (s.kind === 'shape' ? ' · ' + (SHAPE_SAID[s.id] || s.id) : '');
