/**
 * The app's memory in one place: the current thread and its items, every print (picture) with its handle, and the
 * looks and rooms you made. Changes are saved at once and announced on the bus.
 */
import { put, all, remove, settings } from './core/store.js';
import { emit } from './core/bus.js';
import { uid } from './core/dom.js';

export const app = {
  /** @type {{ id: string, createdAt: number, updatedAt: number, items: any[], handles: number }} */ thread: null,
  /** @type {Map<string, any>} */ prints: new Map(),
  /** @type {any[]} */ looks: [],
  /** @type {any[]} */ rooms: [],
};

const letters = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const fresh = () => ({ id: uid('t-'), createdAt: Date.now(), updatedAt: Date.now(), items: [], handles: 0 });

export async function boot() {
  const [threads, prints, looks, rooms] = await Promise.all([all('threads'), all('prints'), all('looks'), all('rooms')]);
  for (const p of prints) app.prints.set(p.id, p);
  app.thread = threads.sort((a, b) => b.updatedAt - a.updatedAt)[0] || fresh();
  for (const it of app.thread.items) if (it.type === 'job' && it.state === 'running' && !it.job) { it.state = 'stopped'; it.error = 'Interrupted when the page was closed.'; it.retry ||= { text: it.text || '', pace: it.pace }; }
  app.looks = looks; app.rooms = rooms;
}
export const urlOf = p => (p.url ||= URL.createObjectURL(p.blob));
export const printById = id => app.prints.get(id);
export const handleOf = id => app.prints.get(id)?.handle;
export async function save() { app.thread.updatedAt = Date.now(); await put('threads', app.thread); }

/** @returns {Promise<any>} */
export async function addPrint(o) {
  const p = { id: uid('p-'), handle: letters(app.thread.handles++), threadId: app.thread.id, createdAt: Date.now(), kept: false, parents: [], ...o };
  app.prints.set(p.id, p); await put('prints', p); return p;
}
/** Prints in the order they appeared in this thread. */
export function threadPrints() {
  const out = [];
  for (const it of app.thread.items) for (const id of it.prints || []) { const p = app.prints.get(id); if (p) out.push(p); }
  return out;
}
export async function addItem(item) { item.id ||= uid('i-'); item.at ||= Date.now(); app.thread.items.push(item); await save(); emit('item', item); return item; }
export async function patchItem(item, patch) { Object.assign(item, patch); await save(); emit('item:patch', item); }
export async function newThread() { app.thread = fresh(); await save(); emit('thread', app.thread); }
export async function setKept(id, kept) { const p = app.prints.get(id); if (!p) return; p.kept = kept; await put('prints', p); emit('print', p); }
export async function forget(id) { const p = app.prints.get(id); if (p?.url) URL.revokeObjectURL(p.url); app.prints.delete(id); await remove('prints', id); emit('print:gone', id); }
export async function saveLook(look) { app.looks = [look, ...app.looks.filter(l => l.id !== look.id)]; await put('looks', look); emit('looks', app.looks); }
export async function saveRoom(room) { app.rooms = [room, ...app.rooms.filter(r => r.id !== room.id)]; await put('rooms', room); emit('rooms', app.rooms); }
export async function forgetRoom(id) { app.rooms = app.rooms.filter(r => r.id !== id); await remove('rooms', id); emit('rooms', app.rooms); }
export { settings };
