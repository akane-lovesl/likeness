/**
 * How long things take. Every finished job is remembered per studio, kind of change and pace, and the next estimate
 * is the median of the last dozen; until there are any, a sensible default for that studio. The studio can send its
 * own estimate with a job, which wins.
 */
import { settings } from './store.js';

const DEFAULTS = { showcase: { quick: 2600, fine: 4400, deep: 7600 }, simulator: { quick: 3200, fine: 5200, deep: 8800 }, workstation: { quick: 28000, fine: 48000, deep: 95000 } };
const OPS = { create: 1, edit: 1, restyle: .95, reference: 1.12, blend: 1.2, region: 1.05, backdrop: 1.1, vary: 1, remove: .95, angles: 1.1, room: .6, look: .6, backdrops: .7 };
const key = (mode, op, pace, n) => `${mode}:${op}:${pace}:${n > 1 ? 'n' : '1'}`;
const median = xs => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** @returns {{ ms: number, learned: number }} */
export function estimate(mode, op = 'edit', pace = 'fine', n = 1) {
  const seen = settings.get('eta', {})[key(mode, op, pace, n)] || [];
  if (seen.length >= 2) return { ms: median(seen), learned: seen.length };
  const base = (DEFAULTS[mode] || DEFAULTS.showcase)[pace] || 5000;
  return { ms: base * (OPS[op] || 1) * (1 + (n - 1) * .45), learned: 0 };
}
export function record(mode, op, pace, n, ms) {
  const all = settings.get('eta', {}), k = key(mode, op, pace, n);
  all[k] = [...(all[k] || []), Math.round(ms)].slice(-12);
  settings.set('eta', all);
}
/** Progress that never lies: it eases toward 97 % around the estimate and waits there for the real thing. */
export const progressAt = (elapsed, expected) => Math.min(.97, 1 - Math.exp(-1.9 * elapsed / Math.max(1, expected)));
