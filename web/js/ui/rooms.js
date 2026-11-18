/**
 * Rooms: every room as a postcard painted in its own colours and type, so choosing one is seeing it. Tapping a card
 * moves in, the new room growing from your finger in its own shape. You can also invent a room from a few words
 * or from a picture's colours.
 */
import { h, icon, sheet, toast, sleep } from '../core/dom.js';
import { glyph } from '../room/ornaments.js';
import { TYPES } from '../room/rooms.js';
import { varsFor, atmosphere } from '../room/theme.js';
import { SET_PIECES } from '../room/set.js';
import { allRooms, changeRoom } from '../room/atmosphere.js';
import { roomFromWords, roomFromPalette } from '../room/maker.js';
import { app, saveRoom, forgetRoom, threadPrints, urlOf } from '../state.js';
import { studio } from '../studio/studio.js';
import * as P from '../studio/painter.js';
import { sound } from '../core/sound.js';

const VIBES = ['Rainy Paris bookshop', 'Lavender fields at noon', 'Cyber koi pond', 'Cosy cabin, first snow', 'Mermaid lagoon', 'Baroque opera night', 'Matcha morning'];
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
      onPick: (room, ev) => { close(); setTimeout(() => changeRoom(room, { x: ev.clientX, y: ev.clientY }), 60); },
      onForget: r.mine ? async room => { await forgetRoom(room.id); paintGrid(); toast('Room forgotten'); } : null,
    })));
    paintGrid();
    const maker = makerEl(room => { paintGrid(); close(); setTimeout(() => changeRoom(room, null), 60); });
    return [
      h('div.sheet__head', null, h('h2.t-title', null, 'Rooms'), h('span.t-mono.t-soft', null, `${allRooms().length} to choose from`)),
      h('p.t-lede', { style: { marginBottom: '4cqw' } }, 'Where would you like to be?'),
      grid, maker,
    ];
  }, { cls: 'sheet--rooms', label: 'Rooms' });
}

/** Invent a room: words, or a picture's colours. */
function makerEl(onMoveIn) {
  const input = h('input.maker__input', { type: 'text', placeholder: 'Describe a vibe…', enterkeyhint: 'go', 'aria-label': 'Describe a room' });
  const out = h('div.maker__out');
  const prints = threadPrints().slice(-6).reverse();
  let made = null;
  async function make(fn, label) {
    out.replaceChildren(h('div.maker__dreaming', null, h('span', { html: glyph('sparkle') }), h('span', null, label)));
    try {
      const t0 = performance.now();
      made = await fn();
      await sleep(Math.max(0, 700 - (performance.now() - t0)));
      out.replaceChildren(postcard(made, { big: true, onPick: () => keep() }), h('div.maker__actions', null,
        h('button.btn.btn--accent', { onclick: () => keep() }, 'Move in'),
        h('button.btn.btn--quiet', { onclick: () => make(fn, 'Trying again…') }, 'Again')),
        h('p.t-mono.t-soft', { style: { textAlign: 'center', marginTop: '2cqw' } }, made.made === 'studio' ? 'Invented by the studio' : 'Invented on this device'));
    } catch (e) { out.replaceChildren(h('p.t-soft', null, e.message || 'That room would not come.')); }
  }
  async function keep() { if (!made) return; await saveRoom(made); onMoveIn(made); }
  const fromWords = text => async () => {
    if (studio.live) { try { const r = await studio.engine.room(text); return { ...r, mine: true, made: 'studio' }; } catch (e) { toast('The studio could not; drawing it here'); } }
    const r = roomFromWords(text); r.id += Math.random().toString(36).slice(2, 5); return r;
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && input.value.trim()) make(fromWords(input.value.trim()), 'Imagining ' + input.value.trim() + '…'); });
  return h('section.maker', null,
    h('h3.maker__title', null, h('span', { html: glyph('sparkle') }), 'Invent a room'),
    h('div.maker__row', null, input, h('button.send', { 'aria-label': 'Make it', html: icon('arrow'), onclick: () => input.value.trim() && make(fromWords(input.value.trim()), 'Imagining ' + input.value.trim() + '…') })),
    h('div.maker__vibes', null, VIBES.map(v => h('button.chip', { onclick: () => { input.value = v; make(fromWords(v), 'Imagining ' + v + '…'); } }, v))),
    prints.length ? h('div.maker__from', null, h('span.t-mono.t-soft', null, 'Or from a picture’s colours'), h('div.maker__prints', null, prints.map(p => h('button.maker__print', { 'aria-label': `From picture ${p.handle}`, onclick: () => make(async () => roomFromPalette(P.paletteOf(await P.fromBlob(p.blob, 200)), 'From ' + p.handle), 'Reading the colours of ' + p.handle + '…') }, h('img', { src: urlOf(p), alt: '' }), h('b', null, p.handle))))) : null,
    out);
}
