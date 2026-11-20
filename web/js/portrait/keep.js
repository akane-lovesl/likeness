/**
 * What is kept, so nothing is lost: each photo you sat for (a sitting) and every portrait painted from it, with the
 * choices it was painted with, saved the moment it is asked for and again as it arrives. Portraits still being
 * painted when the page closes are found again (and a live studio is asked for them) the next time.
 *
 * Your space is the groundwork for accounts: a name the studio calls you by, kept apart from anyone else's (the store
 * is already namespaced per paired device), with storage the browser is asked not to clear, and a backup you can
 * carry to another phone.
 */
import { put, all, remove, get, settings, STORES } from '../core/store.js';
import { uid } from '../core/dom.js';
import { emit } from '../core/bus.js';

/** @typedef {{ id: string, blob: Blob, sample?: string, createdAt: number }} Sitting */
/**
 * @typedef {{ id: string, style: string, styleName: string, room: string, picks: any, prompt: string, sitting: string,
 *   blob?: Blob, kind: 'render' | 'simulated' | 'sketch', state: 'painting' | 'done' | 'failed' | 'stopped', error?: string,
 *   job?: string, asset?: string, w?: number, h?: number, ms?: number, createdAt: number, kept?: boolean, url?: string }} Portrait
 */

const urls = new Map();
/** A displayable URL for a kept blob (made once per session). @param {{ id: string, blob?: Blob }} x */
export function urlOf(x) {
  if (!x?.blob) return '';
  let u = urls.get(x.id + ':' + x.blob.size);
  if (!u) { u = URL.createObjectURL(x.blob); urls.set(x.id + ':' + x.blob.size, u); }
  return u;
}

export async function sit(/** @type {Blob} */ blob, sample = '') {
  /** @type {Sitting} */ const s = { id: uid('s-'), blob, sample, createdAt: Date.now() };
  await put('sittings', s); asked();
  return s;
}
export const sitting = (/** @type {string} */ id) => /** @type {Promise<Sitting | null>} */ (get('sittings', id));
export async function sittings() { return /** @type {Sitting[]} */ (await all('sittings')).sort((a, b) => b.createdAt - a.createdAt); }

/** @param {Portrait} p */
export async function keep(p) { await put('portraits', p); emit('portrait', p); return p; }
export async function portraits() {
  const list = /** @type {Portrait[]} */ (await all('portraits'));
  return list.sort((a, b) => b.createdAt - a.createdAt);
}
export const portrait = (/** @type {string} */ id) => /** @type {Promise<Portrait | null>} */ (get('portraits', id));
export async function forget(/** @type {string} */ id) { await remove('portraits', id); emit('portrait:gone', id); }

/** Your space: who the studio is talking to. */
export function space() {
  let s = settings.get('space', null);
  if (!s) s = settings.set('space', { id: uid('me-'), name: '', since: Date.now() });
  return /** @type {{ id: string, name: string, since: number }} */ (s);
}
export function name(/** @type {string} */ n) { const s = space(); s.name = n.trim().slice(0, 40); settings.set('space', s); emit('space', s); }

/** Asks the browser to keep this site's storage even when space is short (once something worth keeping exists). */
let askedOnce = false;
function asked() { if (askedOnce) return; askedOnce = true; navigator.storage?.persist?.().catch(() => {}); }
export const persisted = async () => !!(await navigator.storage?.persisted?.().catch(() => false));

const toB64 = (/** @type {Blob} */ b) => new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsDataURL(b); });
const fromB64 = (/** @type {string} */ s) => fetch(s).then(r => r.blob());

/** Everything kept, as one file to carry elsewhere: the stores, with each picture written out. */
export async function backup() {
  const out = { likeness: 1, space: space(), at: new Date().toISOString(), stores: /** @type {Record<string, any[]>} */ ({}) };
  for (const name of STORES) {
    const rows = await all(name);
    out.stores[name] = await Promise.all(rows.map(async r => { const o = { ...r }; for (const k of ['blob', 'maskBlob']) if (o[k] instanceof Blob) o[k] = { b64: await toB64(o[k]) }; return o; }));
  }
  return new Blob([JSON.stringify(out)], { type: 'application/json' });
}
/** Brings a backup back in, beside what is here (nothing is overwritten that is newer). @param {Blob} file */
export async function restore(file) {
  const data = JSON.parse(await file.text());
  if (data?.likeness !== 1) throw new Error('That file is not a Likeness backup.');
  let n = 0;
  for (const name of STORES) for (const row of data.stores?.[name] || []) {
    for (const k of ['blob', 'maskBlob']) if (row[k]?.b64) row[k] = await fromB64(row[k].b64);
    const have = await get(name, row.id);
    if (!have || (have.updatedAt || have.createdAt || 0) <= (row.updatedAt || row.createdAt || 0)) { await put(name, row); n++; }
  }
  if (data.space?.name && !space().name) name(data.space.name);
  emit('portrait', null);
  return n;
}

/** What a live studio holds for this device: every picture it made, newest first (for what this phone no longer has). */
export async function studioHistory() {
  try {
    const res = await fetch('api/history', { cache: 'no-store' });
    if (!res.ok) return [];
    return /** @type {{ id: string, url: string, w: number, h: number, created: number, prompt: string, provenance: any }[]} */ ((await res.json()).made || []);
  } catch { return []; }
}
