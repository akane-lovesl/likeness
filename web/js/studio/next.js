/**
 * What to suggest next. Engines offer ideas; this keeps them fresh: never what was just asked or asked lately, never
 * the same three twice in a row, and mixed with steps this conversation has not tried yet.
 */
const POOL = {
  create: ['Make it night', 'In watercolour', 'Two more like this', 'Golden hour light', 'Closer in', 'As an old photograph', 'Add a little rain'],
  edit: ['Warmer', 'Try a backdrop', 'Two more like this', 'Brighter', 'Make it night', 'As a film still'],
  restyle: ['Softer', 'Stronger', 'Try a backdrop', 'Another look', 'Keep more colour', 'Make it night'],
  reference: ['Less of the reference', 'More of the reference', 'Two more like this', 'Try a backdrop'],
  blend: ['More of the first', 'More of the second', 'Make it dreamier', 'Try a backdrop'],
  region: ['Brighter', 'Try a backdrop', 'Three variations', 'Warmer light', 'Make it night'],
  remove: ['Bring it back', 'Try a backdrop', 'Clean up more'],
  backdrop: ['Somewhere else', 'Golden hour light', 'Make it night', 'Closer in', 'Somewhere dreamier'],
  vary: ['More like the first', 'In watercolour', 'Wilder', 'Make it night'],
};
const ANYWHERE = ['Try a backdrop', 'Three variations', 'Golden hour light', 'Make it night', 'In watercolour', 'As a postcard', 'Softer light'];
const norm = s => String(s || '').toLowerCase().replace(/@[a-z]{1,2}\b/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * @param {{ op: string, offered?: string[], recent?: string[], previous?: string[], turn?: number }} o
 * @returns {string[]}
 */
export function nextIdeas({ op, offered = [], recent = [], previous = [], turn = 0 }) {
  const said = new Set(recent.map(norm)), before = new Set(previous.map(norm)), seen = new Set();
  const fresh = s => { const k = norm(s); if (!k || seen.has(k) || [...said].some(r => r === k || (r.length > 4 && k.includes(r)))) return false; seen.add(k); return true; };
  const engine = offered.filter(fresh).slice(0, 2);
  const pool = [...(POOL[op] || POOL.edit), ...ANYWHERE].filter(fresh);
  const shift = turn % Math.max(1, pool.length);
  const rest = [...pool.slice(shift), ...pool.slice(0, shift)];
  let out = [...engine, ...rest].slice(0, 3);
  if (out.length === 3 && out.every(s => before.has(norm(s)))) out = [...engine, ...rest.slice(1)].slice(0, 3);
  return out;
}
