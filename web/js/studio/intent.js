/**
 * Reading a request on the device while it is typed, so the composer can say what it understood before anything
 * is sent: which picture is the subject, which is the reference, which look, how many. The studio reads the words
 * again with a real model; this reading only has to be right often enough to be useful, and visible when it is not.
 */
import { lookFromWords } from './looks.js';
import { readVibe } from '../room/maker.js';

const ORD = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3, fifth: 4, '5th': 4 };
const COUNT = { two: 2, three: 3, four: 4, 'a couple of': 2, 'a few': 3, '2': 2, '3': 3, '4': 4 };
const PIC = '(?:image|picture|pic|photo|photograph|print|one|shot|selfie)';
/**
 * A picture's part in a request comes from the words right beside it: "like @B", "in the style of @B", "@B as a
 * reference", "@B's colours" make it the style; "into @B", "@B as the background" make it the setting. Words further
 * off are about something else ("make @A like it", "two more like this").
 */
const STYLE_BEFORE = /(?:\blike|\bas|in the style of|styled (?:like|after)|inspired by|(?:colou?rs?|palette|style|look|vibe|mood|light(?:ing)?|tones?) (?:of|from|in)|\bmatch(?:ing)?)\s*(?:the\s+)?$/;
const STYLE_AFTER = /^\s*(?:as (?:a |an |the |my |our )?(?:reference|style|inspiration|guide|model|example|moodboard)|['’]s (?:style|colou?rs?|palette|look|vibe|mood|light(?:ing)?|tones?|feel)|for (?:the |its )?(?:style|colou?rs?|palette|look|vibe|mood))/;
const SET_BEFORE = /(?:\binto|in front of|on top of|\bonto|(?:background|backdrop|scene|setting|place) (?:of|from))\s*(?:the\s+)?$/;
const SET_AFTER = /^\s*as (?:the |a )?(?:background|backdrop|setting|scene)/;
/**
 * Someone put somewhere: "@A on a beach", "put her in front of a lighthouse at sunset", "@A in Paris at night". A new
 * backdrop when what follows reads as a place; a medium there makes it a restyle instead ("@A in watercolour").
 */
const PLACED = /(?:@[a-z]{1,2}\b|\b(?:her|him|them|me|us|it|she(?:['’]s| is)?|he(?:['’]s| is)?|they(?:['’]re| are)?))[,\s]+(?:(?:standing|sitting|walking|posing|stood|sat|lying|out)\s+)?(?:in front of|on top of|on|at|in|into|onto|by|beside|under|among|inside|outside)\s+(.+)$/;
/** @param {string} t @param {any[] | undefined} looks */
function placedIn(t, looks) {
  const m = t.toLowerCase().match(PLACED), end = m ? m.index + m[0].length : 0, where = m ? t.slice(end - m[1].length, end).replace(/[.!?]+$/, '').trim() : ''; // in the words as they were typed
  if (!where || lookFromWords(where, looks, { moods: false })) return null;
  return readVibe(where).some(x => x.cue.kind === 'place' || x.cue.kind === 'venue') ? where : null;
}
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
  const mention = (id, at, end) => { if (id && !order.some(m => m.id === id)) order.push({ id, at, end }); };
  for (const m of t.matchAll(/@([A-Z]{1,2})\b/g)) mention(byHandle(m[1]), m.index, m.index + m[0].length);
  for (const m of t.matchAll(new RegExp('\\b' + PIC + '\\s+([A-Z])\\b', 'g'))) mention(byHandle(m[1]), m.index, m.index + m[0].length);
  const pool = tray.length >= 2 ? tray : (ctx.batch?.length >= 2 ? ctx.batch : prints.map(p => p.id));
  for (const m of low.matchAll(new RegExp('\\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|last|previous|latest)\\s+' + PIC + '\\b', 'g'))) {
    const w = m[1], id = /last|previous|latest/.test(w) ? pool[pool.length - 1] : pool[ORD[w]];
    mention(id, m.index, m.index + m[0].length);
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
  order.forEach((m, k) => {
    const before = low.slice(Math.max(k ? order[k - 1].end : 0, m.at - 40), m.at), after = low.slice(m.end, Math.min(order[k + 1]?.at ?? low.length, m.end + 48));
    if (STYLE_BEFORE.test(before) || STYLE_AFTER.test(after)) refs.push({ id: m.id, role: 'style' });
    else if (ids.length > 1 && (SET_BEFORE.test(before) || SET_AFTER.test(after))) refs.push({ id: m.id, role: 'backdrop' });
  });
  // "use the second picture as a reference and change this one": the subject is the newest picture that is not the reference
  const subject = ids.find(id => !refs.some(r => r.id === id)) || (refs.length && /\b(this|it|that)\b/.test(low) ? [...prints].reverse().find(p => !refs.some(r => r.id === p.id))?.id : null) || null;
  const others = ids.filter(id => id !== subject && !refs.some(r => r.id === id)).map(id => ({ id, role: 'with' }));
  const where = subject && !pins.length ? placedIn(t, ctx.looks) : null; // "at sunset" there belongs to the place, not a look
  const look = ctx.look || (where ? null : lookFromWords(low, ctx.looks, { moods: !!subject })) || null; // with nothing to restyle, a mood is part of what to paint

  let op = 'create';
  if (pins.length) op = 'region';
  else if (subject && (where || /(background|backdrop|behind (her|him|them|it|me)|scene behind|setting|surroundings|put (her|him|them|it|me) (in|on|at))/.test(low))) op = 'backdrop';
  else if (subject && /\b(remove|erase|get rid of|delete|take out|without)\b/.test(low)) op = 'remove';
  else if (subject && !look && /(variation|alternative|another take|different take|more like (this|that|it|the)|riff|remix|three takes|few takes)/.test(low)) op = 'vary';
  else if (ids.length >= 2 && /(combine|merge|mix|blend|together|fuse|both)/.test(low)) op = 'blend';
  else if (subject && refs.some(r => r.role === 'style')) op = 'reference';
  else if (subject && look) op = 'restyle';
  else if (subject) op = 'edit';

  const cm = low.match(/\b(two|three|four|a couple of|a few|[234])\s+(versions|variations|options|takes|images|pictures|ideas|alternatives|of them|more)\b/);
  const n = cm ? COUNT[cm[1]] : op === 'vary' ? 3 : 1;
  const pace = /\b(quick|quickly|fast|rough|draft)\b/.test(low) ? 'quick' : /\b(detailed|careful|carefully|best|high quality|masterpiece|perfect)\b/.test(low) ? 'deep' : null;
  return { op, subject, refs: [...refs, ...others], look, n: Math.min(4, n), pace, pins, ...(op === 'backdrop' && where ? { where } : {}) };
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
  if (it.op === 'backdrop' && it.where) out.push({ k: 'look', text: it.where.length > 30 ? it.where.slice(0, 29) + '…' : it.where });
  if (it.look) out.push({ k: 'look', text: it.look.name });
  if (it.n > 1) out.push({ k: 'n', text: '×' + it.n });
  return out;
}
