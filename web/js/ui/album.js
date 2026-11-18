/**
 * The album: what you kept, everything you made, and the pages (earlier threads) you can go back to.
 */
import { h, icon, stage } from '../core/dom.js';
import { app, urlOf, newThread, save, settings } from '../state.js';
import { LOOKS } from '../studio/looks.js';
import { all } from '../core/store.js';
import { emit } from '../core/bus.js';
import { openFocus } from './focus.js';
import { sound } from '../core/sound.js';

/** Words that say something about taste, worth offering back from what you kept. */
const TASTE = new Set('warm cool golden soft moody dreamy vintage film grain pastel vivid muted bright dark cinematic painterly watercolour watercolor ink minimal romantic noir neon misty glow glowing sunlit candlelit dusk dawn gentle bold sepia matte quiet airy rich velvet blush pink gold silver lace wild calm stormy snowy rainy autumn spring summer winter cosy cozy whimsical elegant playful retro analog grainy hazy luminous'.split(' '));

/** What the kept pictures suggest about your taste, minus what the note already says. */
function tasteHints() {
  const counts = new Map(), add = (w, n) => counts.set(w, (counts.get(w) || 0) + n);
  const looks = [...LOOKS, ...app.looks];
  for (const p of app.prints.values()) {
    if (!p.kept) continue;
    const look = p.look && looks.find(l => l.id === p.look);
    if (look) add(`like ${look.name}`, 2);
    for (const w of (p.prompt || '').toLowerCase().match(/[a-z]+/g) || []) if (TASTE.has(w)) add(w, 1);
  }
  const said = settings.get('taste', '').toLowerCase();
  return [...counts].filter(([w]) => !said.includes(w.replace(/^like /, ''))).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
}

/** A standing note for the studio: sent with every request unless the words say otherwise. */
function tasteCard() {
  const field = h('textarea.taste__field', { rows: 2, maxlength: 600, placeholder: 'Warm light, a little film grain, never change my face…', 'aria-label': 'Your taste' });
  field.value = settings.get('taste', '');
  let timer = 0;
  const keep = () => settings.set('taste', field.value.trim());
  field.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(keep, 250); });
  field.addEventListener('blur', keep);
  const hints = h('div.taste__hints');
  const paintHints = () => {
    const list = tasteHints();
    hints.replaceChildren(...(list.length ? [h('span.t-mono.t-soft.taste__from', null, 'From what you kept')] : []),
      ...list.map(w => h('button.chip', { onclick: () => { field.value = field.value.trim() ? field.value.trim().replace(/[,.;]?$/, ', ') + w : w[0].toUpperCase() + w.slice(1); keep(); sound.play('tap'); paintHints(); } }, '+ ' + w)));
  };
  paintHints();
  return h('div.taste', null, h('div.taste__head', null, h('b', null, 'Your taste'), h('span.t-soft', null, 'Sent with every request, unless you say otherwise')), field, hints);
}

/** @param {{ onUse?: (ids: string[]) => void, onSend?: (t: any) => void }} [o] */
export function openAlbum({ onUse = null, onSend = null } = {}) {
  sound.play('tap');
  let tab = 'kept';
  const body = h('div.album__body');
  const tabs = h('div.album__tabs', { role: 'tablist' });
  const el = h('section.album', { role: 'dialog', 'aria-label': 'Album' },
    h('header.album__bar', null, h('button.icon-btn', { 'aria-label': 'Close', html: icon('back'), onclick: () => shut() }), h('h2.t-title', null, 'Album'), tabs), body);
  stage().append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));

  function shut() { el.classList.remove('is-in'); setTimeout(() => el.remove(), 360); }
  async function paint() {
    tabs.replaceChildren(...[['kept', 'Kept'], ['all', 'Everything'], ['pages', 'Pages']].map(([id, label]) => h('button.chip', { role: 'tab', 'aria-pressed': String(tab === id), onclick: () => { tab = id; paint(); } }, label)));
    const prints = [...app.prints.values()].sort((a, b) => b.createdAt - a.createdAt);
    if (tab === 'pages') {
      const threads = (await all('threads')).filter(t => t.items?.length).sort((a, b) => b.updatedAt - a.updatedAt);
      body.replaceChildren(h('button.btn.btn--quiet.btn--wide', { onclick: async () => { await newThread(); shut(); } }, h('span', { html: icon('page') }), 'Start a new page'),
        ...threads.map(t => {
          const ids = t.items.flatMap(i => i.prints || []).filter(id => app.prints.has(id)).slice(-4);
          return h('button.page', { 'aria-current': t.id === app.thread.id ? 'true' : null, onclick: async () => { app.thread = t; await save(); emit('thread', t); shut(); } },
            h('span.page__thumbs', null, ids.map(id => h('img', { src: urlOf(app.prints.get(id)), alt: '' }))),
            h('span.page__text', null, h('b', null, new Date(t.updatedAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })), h('span.t-soft', null, `${t.items.filter(i => i.type === 'you').length} requests · ${ids.length ? t.items.flatMap(i => i.prints || []).length : 0} pictures`)));
        }));
      return;
    }
    const list = tab === 'kept' ? prints.filter(p => p.kept) : prints;
    const head = tab === 'kept' ? [tasteCard()] : [];
    if (!list.length) { body.replaceChildren(...head, h('p.album__empty.t-lede', null, tab === 'kept' ? 'Nothing kept yet. Open a picture and tap Keep: what you keep teaches the studio your taste.' : 'Nothing made yet.')); return; }
    body.replaceChildren(...head, h('div.album__grid', null, list.map((p, i) => {
      const fig = h('figure.album__item', { style: { '--i': Math.min(i, 12) } }, h('img', { src: urlOf(p), alt: `Picture ${p.handle}`, loading: 'lazy' }), p.provenance?.kind !== 'photo' ? h('span.print__stamp', null, p.provenance?.label || '') : null);
      fig.addEventListener('click', () => openFocus(p, fig, { onSend: t => { shut(); onSend?.(t); }, onUse: id => { onUse?.([id]); shut(); } }));
      return fig;
    })));
  }
  paint();
}
