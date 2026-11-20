/**
 * Rooms: every room as a postcard painted in its own colours and type, so choosing one is seeing it. Tapping a card
 * moves in, the new room growing from your finger in its own shape. You can also invent a room from a few words
 * or from a picture's colours.
 */
import { h, icon, sheet, toast, afterPaint, rng } from '../core/dom.js';
import { reduced } from '../core/motion.js';
import { hsl } from '../core/color.js';
import { glyph } from '../room/ornaments.js';
import { TYPES } from '../room/rooms.js';
import { varsFor, atmosphere } from '../room/theme.js';
import { SET_PIECES } from '../room/set.js';
import { allRooms, changeRoom } from '../room/atmosphere.js';
import { roomFromWords, roomFromPalette, readVibe, heardSpans } from '../room/maker.js';
import { app, saveRoom, forgetRoom, threadPrints, urlOf } from '../state.js';
import { studio } from '../studio/studio.js';
import * as P from '../studio/painter.js';
import { sound } from '../core/sound.js';

const VIBES = ['Grandmother’s kitchen in Lisbon', 'Tokyo jazz bar at midnight', 'Cyberpunk koi pond', 'Lavender fields at noon', 'Cosy cabin, first snow', 'Mermaid lagoon', 'Haunted ballroom', 'Art deco night train', 'Witch’s apothecary', 'Desert motel, golden hour', 'Rainy Paris bookshop', 'Lemon grove on the Amalfi coast', 'Roller disco, 1979', 'Moonlit greenhouse', 'Bakery at dawn', 'Space station greenhouse', 'Seaside diner in the rain', 'Treehouse in summer', 'Brutalist library', 'Opera night in Vienna', 'Nordic sauna by a frozen lake', 'Candy shop on Mars'];
/** Six of them, a different six each day. */
const todaysVibes = (d = new Date()) => { const r = rng(d.getFullYear() * 1000 + d.getMonth() * 40 + d.getDate()); return VIBES.map(v => ({ v, k: r() })).sort((a, b) => a.k - b.k).slice(0, 6).map(x => x.v); };
let fontsLoaded = null;
const loadAllFonts = () => (fontsLoaded ||= Promise.all(Object.values(TYPES).flatMap(t => t.faces.map(f => document.fonts.load(f).catch(() => null)))));

/** A room as a small card styled entirely by its own variables. */
export function postcard(room, { current = false, onPick = null, onForget = null, big = false } = {}) {
  const vars = varsFor(room), style = {};
  for (const [k, v] of Object.entries(vars)) style[k] = String(v);
  const tag = Math.random().toString(36).slice(2, 7), set = (SET_PIECES[room.set] || SET_PIECES.none).draw(room.colors).replace(/id="(\w+)"/g, 'id="$1-' + tag + '"').replace(/url\(#(\w+)\)/g, 'url(#$1-' + tag + ')');
  const el = h('button.postcard' + (big ? '.postcard--big' : ''), { style, data: { room: room.id, frame: room.frame }, 'aria-label': `${room.name}. ${room.line}`, 'aria-current': current ? 'true' : null },
    h('span.postcard__set', { html: set }),
    h('span.postcard__orn', { html: glyph(room.ornament) }),
    h('span.postcard__name', null, room.name),
    h('span.postcard__line', null, room.line),
    h('span.postcard__swatches', null, ['accent', 'accent2', 'ink'].map(k => h('i', { style: { background: room.colors[k] } }))),
    current ? h('span.postcard__here', null, 'You’re here') : null,
    onForget ? h('span.postcard__forget', { role: 'button', 'aria-label': 'Forget this room', html: icon('close'), onclick: e => { e.stopPropagation(); onForget(room); } }) : null);
  if (room.dark) el.dataset.dark = '';
  el.addEventListener('click', e => onPick?.(room, e));
  return el;
}

export function openRooms(e = null) {
  sound.play('tap');
  loadAllFonts();
  return sheet((close, panel) => {
    const grid = h('div.rooms');
    const paintGrid = () => grid.replaceChildren(...allRooms().map(r => postcard(r, {
      current: r.id === atmosphere.room.id,
      onPick: (room, ev) => { close(); changeRoom(room, { x: ev.clientX, y: ev.clientY }); },
      onForget: r.mine ? async room => { await forgetRoom(room.id); paintGrid(); toast('Room forgotten'); } : null,
    })));
    paintGrid();
    const maker = makerEl(room => { close(); changeRoom(room, null); });
    return [
      h('div.sheet__head', null, h('h2.t-title', null, 'Rooms'), h('span.t-mono.t-soft', null, `${allRooms().length} to choose from`)),
      h('p.t-lede', { style: { marginBottom: '4cqw' } }, 'Where would you like to be?'),
      grid, maker,
    ];
  }, { cls: 'sheet--rooms', label: 'Rooms' });
}

const chroma = (/** @type {string} */ c) => { const [, s, l] = hsl(c); return s * (1 - Math.abs(2 * l - 1)); };
/** How the maker names what it heard. */
/** @type {Record<string, [string, string]>} */
const HEARD = { place: ['a place', 'places'], venue: ['a setting', 'settings'], era: ['a style', 'styles'], thing: ['a thing', 'things'], who: ['someone', 'people'], season: ['a season', 'seasons'], weather: ['the weather', 'weathers'], time: ['a time of day', 'times of day'], mood: ['a mood', 'moods'], colour: ['a colour', 'colours'] };
const listed = (/** @type {string[]} */ a) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

/**
 * The words as the maker hears them: each cue it knows lights up in its own colours, one after another, and drops its
 * paint. When the room is ready the drops pour away into it.
 * @param {string} text
 */
function readingEl(text) {
  const hits = readVibe(text), said = h('p.maker__said');
  let at = 0, i = 0;
  for (const x of heardSpans(text)) {
    said.append(text.slice(at, x.at));
    // the cue's liveliest colours: the underline in the first, a drop of each
    const colours = [...x.cue.c].sort((a, b) => chroma(b) - chroma(a)).slice(0, 3);
    said.append(h('span.maker__cue', { style: { '--i': String(i++), '--c': colours[0] || 'var(--soft)' } }, text.slice(x.at, x.end),
      h('span.maker__drops', { 'aria-hidden': 'true' }, colours.map((c, j) => h('i', { style: { background: c, '--j': String(j) } })))));
    at = x.end;
  }
  said.append(text.slice(at));
  const caption = h('p.maker__caption.t-mono.t-soft', null, 'Listening…');
  const el = h('div.maker__reading', null, said, caption);
  const lit = reduced ? 0 : 380 + i * 170 + 420;
  /** @type {Map<string, number>} */ const counts = new Map();
  for (const x of hits) counts.set(x.cue.kind, (counts.get(x.cue.kind) || 0) + 1);
  const heard = [...counts].map(([k, n]) => HEARD[k][n > 1 ? 1 : 0]);
  const timer = setTimeout(() => { caption.textContent = studio.mode === 'workstation' ? 'The studio is imagining it…' : 'Mixing the colours…'; }, lit);
  return {
    el,
    done() { clearTimeout(timer); el.classList.add('is-poured'); caption.textContent = heard.length ? 'Heard ' + listed(heard) : 'Nothing I know yet, so colours from the sound of the words'; },
  };
}
const dreaming = (/** @type {string} */ label) => ({ el: h('div.maker__dreaming', null, h('span', { html: glyph('sparkle') }), h('span', null, label)), done() {} });

/**
 * Invent a room from words, or from a picture's colours. Every source can be asked again: "Another take" settles the
 * maker's close calls another way (or asks the studio's model again).
 * @param {(room: any) => void} onMoveIn
 */
function makerEl(onMoveIn) {
  const input = h('input.maker__input', { type: 'text', placeholder: 'A place, a mood, a memory…', enterkeyhint: 'go', 'aria-label': 'Describe a room', maxlength: '160' });
  const out = h('div.maker__out', { 'aria-live': 'polite' });
  const prints = threadPrints().slice(-6).reverse();
  /** @type {any} */ let made = null;
  /** @type {((take: number) => Promise<any>) | null} */ let source = null;
  let take = 0, run = 0;

  /** @param {(take: number) => Promise<any>} src @param {{ el: HTMLElement, done: () => void }} reading */
  async function begin(src, reading) {
    const mine = ++run;
    source = src; take = 0;
    out.replaceChildren(reading.el);
    out.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    let room = null, err = null;
    await afterPaint();
    if (mine !== run) return;
    try { room = await src(0); } catch (e) { err = e; }
    reading.done();
    if (mine !== run || !out.isConnected) return;
    if (!room) { out.replaceChildren(h('p.t-soft', null, /** @type {any} */ (err)?.message || 'That room would not come.')); return; }
    sound.play('arrive');
    present(room, 'is-arriving');
  }
  async function again() {
    if (!source) return;
    const mine = ++run;
    take++;
    out.querySelector('.postcard')?.classList.add('is-leaving');
    sound.play('tap');
    let room = null;
    await afterPaint();
    if (mine !== run) return;
    try { room = await source(take); } catch { /* keep the last one */ }
    if (mine !== run || !out.isConnected) return;
    if (!room) { out.querySelector('.postcard')?.classList.remove('is-leaving'); return; }
    present(room, 'is-shuffled');
  }
  /** @param {any} room @param {string} how */
  function present(room, how) {
    made = room;
    const card = postcard(room, { big: true, onPick: () => keep() });
    card.classList.add(how);
    const by = h('p.t-mono.t-soft.maker__by', null, (room.made === 'studio' ? 'Invented by the studio' : 'Invented on this device') + (take ? ' · take ' + (take + 1) : ''));
    out.replaceChildren(...[out.querySelector('.maker__reading'), card,
      h('div.maker__actions', null, h('button.btn.btn--accent', { onclick: () => keep() }, 'Move in'), h('button.btn.btn--quiet', { onclick: () => again() }, 'Another take')), by].filter(Boolean));
    by.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }
  async function keep() { if (!made) return; await saveRoom(made); onMoveIn(made); }
  /** Words become a room: the studio's model invents it on a workstation; the maker on this device does otherwise. */
  const fromWords = (/** @type {string} */ text) => async (/** @type {number} */ n) => {
    if (studio.mode === 'workstation') { try { return { ...(await studio.engine.room(text)), mine: true, made: 'studio' }; } catch { toast('The studio could not; made it here instead'); } }
    return roomFromWords(text, n);
  };
  const say = (/** @type {string} */ text) => { const t = text.trim(); if (!t) return; input.value = t; input.blur(); begin(fromWords(t), readingEl(t)); };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') say(input.value); });
  return h('section.maker', null,
    h('h3.maker__title', null, h('span', { html: glyph('sparkle') }), 'Invent a room'),
    h('div.maker__row', null, input, h('button.send', { 'aria-label': 'Make it', html: icon('arrow'), onclick: () => say(input.value) })),
    h('div.maker__vibes', null, todaysVibes().map(v => h('button.chip', { onclick: () => say(v) }, v))),
    prints.length ? h('div.maker__from', null, h('span.t-mono.t-soft', null, 'Or from a picture’s colours'), h('div.maker__prints', null, prints.map(p => h('button.maker__print', {
      'aria-label': 'From picture ' + p.handle,
      onclick: async () => { const palette = P.paletteOf(await P.fromBlob(p.blob, 200)); begin(async n => roomFromPalette(palette, 'From ' + p.handle, n), dreaming('Reading the colours of ' + p.handle + '…')); },
    }, h('img', { src: urlOf(p), alt: '' }), h('b', null, p.handle))))) : null,
    out);
}
