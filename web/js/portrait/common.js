/** What the portrait screens share: the tabs, where the example art is, the honest wait, and your space. */
import { h, icon, sheet, toast, assetUrl, eta } from '../core/dom.js';
import { go } from '../core/nav.js';
import { studio } from '../studio/studio.js';
import { settings } from '../core/store.js';
import { space, name, persisted, backup, restore, portraits, urlOf } from './keep.js';

/** @typedef {import('./styles.js').Style} Style */

/** The three places, always at the foot of a top-level screen. @param {'home' | 'mine'} active */
export function tabs(active) {
  const tab = (/** @type {string} */ id, /** @type {string} */ label, /** @type {string} */ ic, /** @type {() => void} */ run) =>
    h('button.tabs__tab', { type: 'button', 'aria-current': id === active ? 'page' : null, data: { tab: id }, onclick: run }, h('span', { html: icon(ic) }), h('b', null, label));
  return h('nav.tabs', { 'aria-label': 'Places' },
    tab('home', 'Styles', 'palette', () => go('home')),
    tab('desk', 'Studio', 'feather', () => go('desk')),
    tab('mine', 'Mine', 'album', () => go('mine')));
}

/** The example art's catalogue (inlined by a live studio; the files are where it says either way). */
export function catalogue() {
  try { const c = JSON.parse(document.getElementById('style-catalog')?.textContent || 'null'); if (c) return c; } catch { /* below */ }
  return { kind: 'render', styles: {} };
}
const url = (/** @type {string} */ p) => String(assetUrl(p));
/** A style's portrait of one sitter, large and small. @param {any} cat @param {Style} s @param {string} who */
export function artOf(cat, s, who) {
  const known = cat.styles?.[s.id]?.[who];
  const image = known?.image || s.id + '/' + who + '.webp';
  return { image: url('styles/' + image), thumb: url('styles/' + (known?.thumb || image.replace(/\.webp$/, '-s.webp'))) };
}
/** The photograph a sitter's portraits were painted from. @param {string} who */
export const photoOf = who => url('examples/' + who + '/portrait.webp');
/** The studio's people, for anyone who would rather try a face that is not theirs. */
export const SAMPLES = ['ama', 'sofia', 'kenji', 'noor', 'maeve', 'mateus', 'ingrid', 'priya'];

/** How long a portrait takes here, said plainly. */
export function etaLine() {
  if (!studio.live) return 'Sketched on this phone · your studio paints it for real';
  const ms = (studio.info?.portraitEta || studio.info?.eta)?.[settings.get('pace', 'fine')];
  const said = ms ? eta(ms) : '';
  return (said ? 'Usually ' + said + ' · ' : '') + (studio.mode === 'simulator' ? 'a simulated stand-in' : 'painted by your studio');
}

/** Your space: who you are to the studio, how your portraits are kept, a backup to carry them. */
export async function openSpace() {
  const me = space(), list = await portraits(), safe = await persisted();
  const face = list.find(p => p.blob && p.state === 'done');
  const field = h('input.space__name', { type: 'text', value: me.name, maxlength: 40, placeholder: 'Your name', 'aria-label': 'What the studio calls you', enterkeyhint: 'done' });
  field.addEventListener('change', () => { name(field.value); toast(field.value.trim() ? 'Hello, ' + field.value.trim() : 'Name forgotten'); });
  field.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') field.blur(); });
  const days = Math.max(1, Math.round((Date.now() - me.since) / 864e5));
  sheet(close => [
    h('div.sheet__head', null, h('h3.t-title', null, 'Your space'), h('button.icon-btn', { 'aria-label': 'Close', html: icon('close'), onclick: () => close() })),
    h('div.space__who', null,
      h('div.space__face', null, face ? h('img', { alt: '', src: urlOf(face) }) : h('span', { html: icon('heart') })),
      h('label.space__label', null, h('span.t-mono.t-soft', null, 'The studio calls you'), field)),
    h('ul.space__facts', null,
      h('li', null, h('b', null, String(list.length)), ' portrait' + (list.length === 1 ? '' : 's') + ' kept'),
      h('li', null, h('b', null, String(days)), ' day' + (days === 1 ? '' : 's') + ' here'),
      h('li', null, h('b', null, safe ? 'Kept safe' : 'Kept'), safe ? ' (the browser will not clear it)' : ' on this phone')),
    h('p.space__note.t-soft', null, studio.live
      ? 'Your work is kept in this browser. Photos you choose to paint are sent to your studio for rendering.'
      : 'Your photos and portraits stay on this phone. Nothing leaves it.'),
    h('div.space__acts', null,
      h('button.btn.btn--quiet', { type: 'button', onclick: async () => {
        const blob = await backup(), a = h('a', { href: URL.createObjectURL(blob), download: 'likeness-' + new Date().toISOString().slice(0, 10) + '.likeness.json' });
        document.body.append(a); a.click(); a.remove(); toast('Backup saved');
      } }, h('span', { html: icon('save') }), 'Back up'),
      h('button.btn.btn--quiet', { type: 'button', onclick: async () => {
        const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
        input.addEventListener('change', async () => {
          const f = input.files?.[0]; input.remove(); if (!f) return;
          try { const n = await restore(f); toast(n ? n + ' things brought back' : 'Everything was already here'); close(); } catch (e) { toast(e.message || 'That backup could not be read'); }
        });
        document.body.append(input); input.click();
      } }, h('span', { html: icon('use') }), 'Restore')),
  ], { cls: 'sheet--space', label: 'Your space' });
}
