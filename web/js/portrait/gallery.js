/**
 * Mine: everything you made, never lost. Portraits (newest first, by day, those still painting shown painting), and
 * the conversations you had with the studio, each one reopened where you left it. A live studio's own copies fill in
 * anything this phone no longer has.
 */
import { h, icon, toast } from '../core/dom.js';
import { go } from '../core/nav.js';
import { on } from '../core/bus.js';
import { all } from '../core/store.js';
import { app, save, urlOf as printUrl } from '../state.js';
import { emit } from '../core/bus.js';
import { studio } from '../studio/studio.js';
import { portraits, forget, urlOf, studioHistory, space } from './keep.js';
import { tabs, openSpace } from './common.js';
import { styleById } from './styles.js';

const day = (/** @type {number} */ t) => {
  const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  return diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
};

export function mineScreen() {
  const list = h('div.mine-list');
  const seg = (/** @type {string} */ id, /** @type {string} */ label) => h('button.mine-seg__opt', { type: 'button', role: 'tab', data: { tab: id }, 'aria-selected': String(id === tab), onclick: () => { tab = id; paint(); } }, label);
  let tab = 'portraits';
  const segs = h('div.mine-seg', { role: 'tablist' }, seg('portraits', 'Portraits'), seg('talks', 'Conversations'));
  const who = h('button.mine-who', { type: 'button', onclick: () => openSpace() }, h('span', { html: icon('heart') }), h('b'));
  const el = h('section.screen.mine', { 'aria-label': 'Mine' },
    h('header.mine-bar', null, h('h1.mine-title', null, 'Mine'), who), segs, h('div.mine-scroll', null, list), tabs('mine'));
  const sayWho = () => { who.querySelector('b').textContent = space().name || 'Your space'; };

  async function paint() {
    sayWho();
    segs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(/** @type {HTMLElement} */ (b).dataset.tab === tab)));
    if (tab === 'portraits') await paintPortraits(); else await paintTalks();
  }
  async function paintPortraits() {
    const mine = await portraits();
    if (!mine.length) {
      list.replaceChildren(h('div.mine-empty', null, h('span.mine-empty__orn', { html: icon('sparkle') }), h('h2', null, 'Nothing painted yet'), h('p', null, 'Choose a style, add a photo, and your first portrait will wait for you here, with every one after it.'),
        h('button.btn.btn--accent', { type: 'button', onclick: () => go('home') }, 'Choose a style')));
      return;
    }
    /** @type {Map<string, any[]>} */ const days = new Map();
    for (const p of mine) { const k = day(p.createdAt); if (!days.has(k)) days.set(k, []); days.get(k).push(p); }
    list.replaceChildren(...[...days].map(([k, ps]) => h('section.mine-day', null, h('h2.mine-day__title', null, k), h('div.mine-grid', null, ...ps.map(tile)))));
    if (studio.live) more(mine);
  }
  /** @param {import('./keep.js').Portrait} p */
  function tile(p) {
    const s = styleById(p.style);
    const img = p.blob ? h('img', { alt: '', src: urlOf(p), loading: 'lazy' }) : h('div.mine-tile__blank');
    const state = p.state === 'painting' ? 'Painting…' : p.state === 'failed' ? 'Didn’t finish' : p.state === 'stopped' ? 'Stopped' : p.kind === 'sketch' ? 'Sketch' : p.kind === 'simulated' ? 'Simulated' : '';
    return h('button.mine-tile', { type: 'button', data: { state: p.state, style: p.style }, 'aria-label': (s?.name || p.styleName) + (state ? ', ' + state : ''), onclick: () => go('create', { id: p.style, p: p.id }) },
      img, h('span.mine-tile__name', null, s?.name || p.styleName), state ? h('span.mine-tile__state', null, state) : null,
      h('span.mine-tile__del', { role: 'button', tabindex: '0', 'aria-label': 'Delete', html: icon('trash'), onclick: (/** @type {Event} */ e) => { e.stopPropagation(); remove(p); } }));
  }
  async function remove(p) {
    await forget(p.id); paint();
    toast('Deleted', 4000);
  }
  /** What the studio keeps that this phone does not (after the phone was cleared, say). */
  async function more(mine) {
    const have = new Set(mine.map(p => p.asset).filter(Boolean));
    const theirs = (await studioHistory()).filter(x => !have.has(x.url));
    if (!theirs.length || tab !== 'portraits') return;
    list.append(h('section.mine-day', null, h('h2.mine-day__title', null, 'Also on your studio'), h('div.mine-grid', null,
      ...theirs.slice(0, 60).map(x => h('a.mine-tile', { href: x.url, target: '_blank', rel: 'noopener', 'aria-label': 'A picture your studio kept' }, h('img', { alt: '', src: x.url, loading: 'lazy' }), h('span.mine-tile__name', null, day(x.created * 1000)))))));
  }
  async function paintTalks() {
    const threads = (await all('threads')).filter(t => t.items?.length).sort((a, b) => b.updatedAt - a.updatedAt);
    if (!threads.length) { list.replaceChildren(h('div.mine-empty', null, h('span.mine-empty__orn', { html: icon('feather') }), h('h2', null, 'No conversations yet'), h('p', null, 'Talk to the studio about any picture: “make the bow red”, “use @B as the backdrop”. Every word is kept here.'), h('button.btn.btn--accent', { type: 'button', onclick: () => go('desk') }, 'Talk to the studio'))); return; }
    list.replaceChildren(h('div.mine-talks', null, ...threads.map(t => {
      const said = t.items.find(i => i.type === 'you')?.text || 'Pictures';
      const thumbs = t.items.flatMap(i => i.prints || []).slice(-3).map(id => app.prints.get(id)).filter(Boolean);
      return h('button.mine-talk', { type: 'button', 'aria-current': t.id === app.thread.id ? 'true' : null, onclick: async () => { app.thread = t; await save(); emit('thread', t); go('desk'); } },
        h('span.mine-talk__thumbs', null, ...thumbs.map(p => h('img', { alt: '', src: printUrl(p), loading: 'lazy' }))),
        h('span.mine-talk__text', null, h('b', null, said.length > 70 ? said.slice(0, 68) + '…' : said), h('span', null, day(t.updatedAt) + ' · ' + t.items.length + ' moments')));
    })));
  }
  const offs = [on('portrait', () => { if (el.isConnected && !el.hidden) paint(); }), on('space', sayWho)];
  paint();
  return { el, shown: () => paint(), left: () => offs.forEach(f => typeof f === 'function' && f()) };
}
