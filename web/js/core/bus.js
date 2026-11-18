/** A tiny event bus: the room, the sky and the desk tell each other what changed. */
const subs = new Map();
export const on = (name, fn) => { (subs.get(name) || subs.set(name, new Set()).get(name)).add(fn); return () => subs.get(name)?.delete(fn); };
export const emit = (name, data) => { for (const fn of subs.get(name) || []) { try { fn(data); } catch (e) { console.error(e); } } };
