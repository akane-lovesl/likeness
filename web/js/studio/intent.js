/**
 * Reading a request on the device while it is typed, so the composer can say what it understood before anything
 * is sent: which picture is the subject, which is the reference, which look, how many. The studio reads the words
 * again with a real model; this reading only has to be right often enough to be useful, and visible when it is not.
 */
import { lookFromWords } from './looks.js';

const ORD = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3, fifth: 4, '5th': 4 };
const COUNT = { two: 2, three: 3, four: 4, 'a couple of': 2, 'a few': 3, '2': 2, '3': 3, '4': 4 };
const PIC = '(?:image|picture|pic|photo|photograph|print|one|shot|selfie)';
/** "Take me to a rainy Tokyo jazz bar", "let's go somewhere cosy", "change the room to noir": the whole place, not a picture. */
const ROOM = /^\s*(?:please\s+)?(?:(?:take|bring) (?:me|us) (?:to|into|(?=somewhere))|move (?:me |us )?(?:to|into)|let['’]?s go (?:to|into|(?=somewhere))|change the room to|switch the room to|make (?:this|the|my) (?:room|place|desk|app) (?:feel )?(?:like|into)|turn (?:this|the) (?:room|place|desk) into|redecorate (?:as|like)|room:)\s*(.+)$/i;

/**
 * @param {string} text
 * @param {{ prints: { id: string, handle: string }[], tray?: string[], batch?: string[], pins?: any[], looks?: any[], look?: any }} ctx
 */
export function readIntent(text, ctx) {
  const t = text || '', low = t.toLowerCase(), prints = ctx.prints || [], tray = ctx.tray || [], pins = ctx.pins || [];
  const byHandle = h => prints.find(p => p.handle === h)?.id;
  const order = [];
  const mention = (id, at) => { if (id && !order.some(m => m.id === id)) order.push({ id, at }); };
  for (const m of t.matchAll(/@([A-Z]{1,2})\b/g)) mention(byHandle(m[1]), m.index);
  for (const m of t.matchAll(new RegExp('\\b' + PIC + '\\s+([A-Z])\\b', 'g'))) mention(byHandle(m[1]), m.index);
  const pool = tray.length >= 2 ? tray : (ctx.batch?.length >= 2 ? ctx.batch : prints.map(p => p.id));
  for (const m of low.matchAll(new RegExp('\\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|last|previous|latest)\\s+' + PIC + '\\b', 'g'))) {
    const w = m[1], id = /last|previous|latest/.test(w) ? pool[pool.length - 1] : pool[ORD[w]];
    mention(id, m.index);
  }
  const room = !order.length && !tray.length && !pins.length && t.match(ROOM);
  if (room && room[1].trim().length > 1) return { op: 'room', subject: null, refs: [], look: null, n: 1, pace: null, pins: [], vibe: room[1].trim().replace(/[.!?]+$/, '') };
  order.sort((a, b) => a.at - b.at);
  let ids = order.map(m => m.id);
  for (const id of tray) if (!ids.includes(id)) ids.push(id);
  const latest = prints[prints.length - 1]?.id;
  if (!ids.length && latest && /\b(this|it|that|her|him|them|me|my|the photo|the picture)\b/.test(low) && !/\b(paint|draw|imagine|create) (a|an|me a)\b/.test(low)) ids = [latest];
  if (pins.length) ids = [pins[0].print, ...ids.filter(i => i !== pins[0].print)];

  /** Roles: whatever is named as a reference, a style or a backdrop; the first other picture is the subject. */
  const refs = [];
  for (const id of ids) {
    const h = prints.find(p => p.id === id)?.handle; if (!h) continue;
    const near = new RegExp('(?:@' + h + '|' + PIC + ' ' + h + ')', 'i');
    const idx = t.search(near), around = idx >= 0 ? low.slice(Math.max(0, idx - 40), idx + 50) : '';
    const ord = Object.entries(ORD).find(([w, i]) => pool[i] === id && new RegExp('\\b' + w + '\\s+' + PIC).test(low));
    const ctxText = around || (ord ? low.slice(Math.max(0, low.indexOf(ord[0]) - 40), low.indexOf(ord[0]) + 60) : '');
    if (/as (a |the )?(reference|style|inspiration|guide|model)|in the style of|styled like|inspired by|(colou?rs?|palette|style|look|vibe|mood|lighting|light) (of|from)|'s (style|colou?rs?|palette|look|vibe|mood|lighting)|\blike\b/.test(ctxText)) refs.push({ id, role: 'style' });
    else if (/(background|backdrop|scene|setting|place) (of|from)|into|in front of|on top of/.test(ctxText) && ids.length > 1) refs.push({ id, role: 'backdrop' });
  }
  const subject = ids.find(id => !refs.some(r => r.id === id)) || null;
  const others = ids.filter(id => id !== subject && !refs.some(r => r.id === id)).map(id => ({ id, role: 'with' }));
  const look = ctx.look || lookFromWords(low, ctx.looks, { moods: !!subject }) || null; // with nothing to restyle, a mood is part of what to paint

  let op = 'create';
  if (pins.length) op = 'region';
  else if (subject && /(background|backdrop|behind (her|him|them|it|me)|scene behind|setting|surroundings|put (her|him|them|it|me) (in|on|at))/.test(low)) op = 'backdrop';
  else if (subject && /\b(remove|erase|get rid of|delete|take out|without)\b/.test(low)) op = 'remove';
  else if (subject && !look && /(variation|alternative|another take|different take|more like (this|that|it|the)|riff|remix|three takes|few takes)/.test(low)) op = 'vary';
  else if (ids.length >= 2 && /(combine|merge|mix|blend|together|fuse|both)/.test(low)) op = 'blend';
  else if (subject && refs.some(r => r.role === 'style')) op = 'reference';
  else if (subject && look) op = 'restyle';
  else if (subject) op = 'edit';

  const cm = low.match(/\b(two|three|four|a couple of|a few|[234])\s+(versions|variations|options|takes|images|pictures|ideas|alternatives|of them|more)\b/);
  const n = cm ? COUNT[cm[1]] : op === 'vary' ? 3 : 1;
  const pace = /\b(quick|quickly|fast|rough|draft)\b/.test(low) ? 'quick' : /\b(detailed|careful|carefully|best|high quality|masterpiece|perfect)\b/.test(low) ? 'deep' : null;
  return { op, subject, refs: [...refs, ...others], look, n: Math.min(4, n), pace, pins };
}

const LABEL = { room: 'Move to', create: 'Paint something new', edit: 'Change', restyle: 'Restyle', reference: 'Change', blend: 'Blend', region: 'Change part of', backdrop: 'New backdrop for', remove: 'Remove from', vary: 'Variations of' };
/** The reading as short phrases for the strip above the composer. */
export function describeIntent(it, handleOf) {
  const h = id => handleOf(id) || '?', out = [];
  const subj = it.subject ? ' ' + h(it.subject) : '';
  if (it.op === 'blend') out.push({ k: 'op', text: `Blend ${[it.subject, ...it.refs.map(r => r.id)].filter(Boolean).map(h).join(' + ')}` });
  else out.push({ k: 'op', text: LABEL[it.op] + (it.op === 'create' ? '' : subj) });
  if (it.op === 'region') out.push({ k: 'pin', text: it.pins.map(p => '①②③④⑤⑥⑦⑧⑨'[p.n - 1] || p.n).join(' ') });
  for (const r of it.refs) if (r.role !== 'with' || it.op !== 'blend') out.push({ k: 'ref', text: r.role === 'style' ? `${h(r.id)}’s style` : r.role === 'backdrop' ? `${h(r.id)} as backdrop` : `with ${h(r.id)}` });
  if (it.look) out.push({ k: 'look', text: it.look.name });
  if (it.n > 1) out.push({ k: 'n', text: '×' + it.n });
  return out;
}
