/**
 * What the device remembers: prints (with their pictures), threads, the looks and rooms you made, in IndexedDB;
 * small settings in localStorage. Nothing here leaves the device unless a live studio is asked to paint.
 */
let opening = null;
const info = document.getElementById('studio-state');
const namespace = info ? JSON.parse(info.textContent || '{}').storage : null;
const prefix = namespace ? 'likeness.' + namespace + '.' : 'likeness.';
/** @returns {Promise<IDBDatabase>} */
function db() {
  opening ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(namespace ? 'likeness-studio-' + namespace : 'likeness-studio', 1);
    req.onupgradeneeded = () => { for (const name of ['prints', 'threads', 'looks', 'rooms']) req.result.createObjectStore(name, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  return opening;
}
const run = async (store, mode, fn) => {
  const d = await db();
  return new Promise((resolve, reject) => { const tx = d.transaction(store, mode), req = fn(tx.objectStore(store)); tx.oncomplete = () => resolve(req?.result); tx.onerror = () => reject(tx.error); });
};
/** Object URLs belong to a session, so they are never stored. */
const lean = v => { const { url, ...rest } = v; return rest; };
export const put = (store, value) => run(store, 'readwrite', s => s.put(lean(value))).catch(e => console.warn('store', e));
export const get = (store, id) => run(store, 'readonly', s => s.get(id)).catch(() => null);
export const all = async store => (await run(store, 'readonly', s => s.getAll()).catch(() => [])) || [];
export const remove = (store, id) => run(store, 'readwrite', s => s.delete(id)).catch(() => {});
export const clear = store => run(store, 'readwrite', s => s.clear()).catch(() => {});

/** Settings: tiny, synchronous, JSON. */
export const settings = {
  get(key, fallback = null) { try { const v = localStorage.getItem(prefix + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(prefix + key, JSON.stringify(value)); } catch { /* full or private */ } return value; },
};
