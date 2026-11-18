/** The pieces of the thread: prints, notes in your hand and the studio's, and small lines between them. */
import { h, icon } from '../core/dom.js';
import { glyph, seal } from '../room/ornaments.js';
import { threadPrints, urlOf } from '../state.js';
import { atmosphere } from '../room/theme.js';

const tilt = id => (([...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 7) - 3) * .5 + 'deg';

/** A print in the thread. */
export function printEl(p, { i = 0, onOpen = null } = {}) {
  const el = h('figure.print', { style: { '--ar': p.w && p.h ? `${p.w} / ${p.h}` : '3 / 4', '--i': i, '--tilt': tilt(p.id) }, data: { id: p.id } },
    h('div.print__frame', null,
      h('img.print__img', { src: urlOf(p), alt: `Picture ${p.handle}`, decoding: 'async', draggable: false }),
      h('span.print__handle', { 'aria-hidden': 'true' }, p.handle),
      p.provenance?.kind && p.provenance.kind !== 'photo' ? h('span.print__stamp', null, p.provenance.label) : null,
      p.kept ? h('span.print__kept', { html: icon('heart') }) : null));
  el.addEventListener('click', () => onOpen?.(p, el));
  return el;
}

/** Text with its @handles drawn as little tokens with the picture in them. */
export function richText(text) {
  const frag = document.createDocumentFragment(), prints = threadPrints();
  let last = 0;
  for (const m of text.matchAll(/@([A-Z]{1,2})\b/g)) {
    frag.append(text.slice(last, m.index));
    const p = prints.find(x => x.handle === m[1]);
    frag.append(p ? h('span.tok', null, h('img', { src: urlOf(p), alt: '' }), m[1]) : m[0]);
    last = m.index + m[0].length;
  }
  frag.append(text.slice(last));
  return frag;
}

export const pinMark = n => '①②③④⑤⑥⑦⑧⑨'[n - 1] || String(n);

/** Your note. In a romantic room it is sealed with wax. */
export function youEl(item) {
  const room = atmosphere.room;
  return h('div.say.say--you', null,
    item.text ? richText(item.text) : null,
    item.pins?.length ? h('div.say__pins', null, item.pins.map(p => h('span.pinnote', null, h('i', null, p.n), p.note || 'this'))) : null,
    room?.type === 'romance' ? h('span', { html: seal(room.ornament === 'bow' ? 'heart' : room.ornament) }) : null);
}

/** The studio speaking, with the room's ornament for a face. */
export function museEl(text, { thinking = false, sub = '' } = {}) {
  const room = atmosphere.room;
  return h('div.say.say--muse', null, h('span.muse' + (thinking ? '.is-thinking' : ''), { html: glyph(room?.ornament || 'sparkle') }), h('p', null, text, sub ? h('span.t-mono', null, sub) : null));
}

/** Pictures you brought. */
export function printsEl(ids, { mine = false, onOpen = null } = {}) {
  const prints = ids.map(id => threadPrints().find(p => p.id === id)).filter(Boolean);
  return h('div.prints' + (mine ? '.prints--you' : ''), { data: { n: Math.min(4, prints.length) } }, prints.map((p, i) => printEl(p, { i, onOpen })));
}
