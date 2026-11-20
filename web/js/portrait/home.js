/**
 * The first screen: the styles, each a portrait in its own frame, swiped like a gallery wall. The whole app wears the
 * style in front (its room: colours, type, ornaments, weather), and changes through the room's own wipe as you swipe.
 * Each plate shows the photograph it was painted from, so what the app does is plain at a glance; holding a plate
 * shows that photograph whole. One button paints you in the style in front.
 */
import { h, icon, sheet, stage, assetUrl } from '../core/dom.js';
import { glyph } from '../room/ornaments.js';
import { roomById, changeRoom } from '../room/atmosphere.js';
import { atmosphere } from '../room/theme.js';
import { settings } from '../core/store.js';
import { reduced } from '../core/motion.js';
import { studio } from '../studio/studio.js';
import { go } from '../core/nav.js';
import { STYLES, styleById } from './styles.js';
import { tabs, catalogue, artOf, photoOf, etaLine, openSpace } from './common.js';

/** @typedef {import('./styles.js').Style} Style */

export function homeScreen(/** @type {Record<string, any>} */ params = {}) {
  const cat = catalogue();
  const startId = params.id && styleById(params.id) ? params.id : settings.get('style', STYLES[0].id);
  let at = Math.max(0, STYLES.findIndex(s => s.id === startId)), settled = -1, settleTimer = 0, raf = 0;
  const bgA = h('img.ph-bg__img', { alt: '', decoding: 'async' }), bgB = h('img.ph-bg__img', { alt: '', decoding: 'async' });
  const bg = h('div.ph-bg', { 'aria-hidden': 'true' }, bgA, bgB);
  const name = h('h2.ph-name'), line = h('p.ph-line'), dots = h('div.ph-dots', { 'aria-hidden': 'true' });
  const go1 = h('button.btn.btn--accent.ph-go', { type: 'button', onclick: () => paintMe() });
  const eta = h('p.ph-eta');
  const more = h('button.ph-more', { type: 'button', onclick: () => examples(current()) }, h('span', { html: icon('vary') }), 'More examples');
  const plates = [...STYLES.map((s, i) => plate(s, i)), ownPlate()];
  const track = h('div.ph-track', { role: 'listbox', 'aria-label': 'Styles', tabindex: '0' }, ...plates);
  const spaceBtn = h('button.ph-space', { type: 'button', 'aria-label': 'Your space', onclick: () => openSpace() }, h('span', { html: icon('heart') }));
  const bar = h('header.ph-bar', null,
    h('div.ph-brand', null, h('span.ph-mark', null, 'Likeness'), h('span.edition', { data: { mode: studio.mode }, title: 'This studio makes ' + studio.makes }, h('i'), studio.label)),
    spaceBtn);
  const el = h('section.screen.ph', { 'aria-label': 'Styles' }, bg, bar,
    h('p.ph-kicker', null, 'Your portrait, painted in any world.'),
    track,
    h('div.ph-caption', { 'aria-live': 'polite' }, name, line, dots),
    h('div.ph-actions', null, go1, h('div.ph-sub', null, eta, more)),
    tabs('home'));
  plates.forEach((_, i) => dots.append(h('i', { data: { i } })));

  function current() { return at < STYLES.length ? STYLES[at] : null; }

  /** One style's plate: its hero portrait in the style's own frame, and the photo it came from. @param {Style} s @param {number} i */
  function plate(s, i) {
    const art = artOf(cat, s, s.hero), before = photoOf(s.hero), room = roomById(s.room);
    const img = h('img.ph-art', { alt: s.name + ': a portrait painted in this style', src: art.image, decoding: 'async', loading: i === at ? 'eager' : 'lazy', fetchpriority: i === at ? 'high' : 'auto' });
    const was = h('img.ph-was', { alt: '', src: before, decoding: 'async', loading: 'lazy' });
    const orn = h('div.ph-orn', { 'aria-hidden': 'true' }, ...[room.ornament, room.motifs?.[0] || room.ornament, room.motifs?.[1] || room.ornament].map((g, k) => h('span', { data: { k }, html: glyph(g) })));
    const polaroid = h('button.ph-before', { type: 'button', 'aria-label': 'The photo this was painted from', onclick: (/** @type {Event} */ e) => { e.stopPropagation(); peek(card, true); setTimeout(() => peek(card, false), 1600); } },
      h('img', { alt: '', src: before, decoding: 'async', loading: 'lazy' }), h('span', null, 'from this photo'));
    const card = h('article.ph-plate', { role: 'option', data: { style: s.id, frame: room.frame }, 'aria-label': s.name, onclick: () => (i === at ? paintMe() : scrollTo(i)) },
      h('div.ph-frame', null, img, was, h('span.ph-kind', null, cat.kind === 'render' ? 'Example' : 'Drawn example')), polaroid, orn);
    hold(card);
    return card;
  }
  function ownPlate() {
    return h('article.ph-plate.ph-plate--own', { role: 'option', data: { style: 'own', frame: 'print' }, 'aria-label': 'A style of your own', onclick: () => (at === STYLES.length ? go('create', { id: 'own' }) : scrollTo(STYLES.length)) },
      h('div.ph-frame', null, h('div.ph-own', null, h('span.ph-own__plus', { html: icon('plus') }), h('b', null, 'Your own style'), h('span', null, 'Describe it in words, or show a picture of it'))));
  }
  /** Holding a plate shows the photograph it was painted from. @param {HTMLElement} card */
  function hold(card) {
    let timer = 0;
    card.addEventListener('pointerdown', () => { timer = setTimeout(() => peek(card, true), 280); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) card.addEventListener(ev, () => { clearTimeout(timer); peek(card, false); });
    card.addEventListener('contextmenu', e => e.preventDefault());
  }
  function peek(/** @type {HTMLElement} */ card, on) { card.classList.toggle('is-before', on); }

  /** The plates lean away from the middle as they move, like pictures on a curved wall. */
  function lean() {
    raf = 0;
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0, bestD = Infinity;
    plates.forEach((p, i) => {
      const c = p.offsetLeft + p.offsetWidth / 2, d = (c - mid) / p.offsetWidth;
      if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = i; }
      if (!reduced) { p.style.setProperty('--d', Math.max(-1.6, Math.min(1.6, d)).toFixed(3)); p.style.setProperty('--ad', Math.min(1, Math.abs(d)).toFixed(3)); }
    });
    if (best !== at) { at = best; caption(); }
    clearTimeout(settleTimer); settleTimer = setTimeout(settle, 140);
  }
  track.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(lean); }, { passive: true });
  track.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); scrollTo(Math.min(plates.length - 1, at + 1)); } if (e.key === 'ArrowLeft') { e.preventDefault(); scrollTo(Math.max(0, at - 1)); } });
  function scrollTo(/** @type {number} */ i, smooth = !reduced) {
    const p = plates[i]; if (!p) return;
    track.scrollTo({ left: p.offsetLeft + p.offsetWidth / 2 - track.clientWidth / 2, behavior: smooth ? 'smooth' : 'auto' });
  }

  /** The words under the plates, at once. */
  function caption() {
    const s = current();
    name.textContent = s ? s.name : 'Your own style';
    line.textContent = s ? s.line : 'Words, a picture of a style you love, or both.';
    go1.replaceChildren(h('span', { html: icon('sparkle') }), s ? 'Paint me in this style' : 'Make my own style');
    eta.textContent = etaLine();
    more.hidden = !s;
    dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('is-on', k === at));
    plates.forEach((p, k) => { p.setAttribute('aria-selected', String(k === at)); p.classList.toggle('is-front', k === at); });
    el.dataset.style = s?.id || 'own';
  }
  /** Once the swipe rests: the room and the light behind change to the style in front. */
  function settle() {
    if (settled === at) return;
    settled = at;
    const s = current();
    if (s) settings.set('style', s.id);
    const src = s ? artOf(cat, s, s.hero).thumb : '';
    const [show, hide] = bgA.classList.contains('is-on') ? [bgB, bgA] : [bgA, bgB];
    if (src) { show.src = src; show.classList.add('is-on'); hide.classList.remove('is-on'); }
    const room = roomById(s?.room || 'atelier');
    if (room.id !== atmosphere.room?.id) {
      const r = plates[at].querySelector('.ph-frame')?.getBoundingClientRect();
      changeRoom(room, r ? { x: r.left + r.width / 2, y: r.top + r.height * .4 } : null);
    }
  }
  function paintMe() { const s = current(); go('create', { id: s ? s.id : 'own' }); }

  /** The style on three people: each photograph, and the portrait it became. @param {Style | null} s */
  function examples(s) {
    if (!s) return;
    sheet(close => [
      h('div.sheet__head', null, h('h3.t-title', null, s.name), h('button.icon-btn', { 'aria-label': 'Close', html: icon('close'), onclick: () => close() })),
      h('p.t-soft.ph-ex__lede', null, 'The same words, three people. Each began as the photo on the left.'),
      h('div.ph-ex', null, ...s.sitters.map(who => {
        const art = artOf(cat, s, who);
        return h('figure.ph-ex__pair', null, h('img.ph-ex__was', { alt: 'Photo', src: photoOf(who), loading: 'lazy' }), h('span.ph-ex__arrow', { html: icon('arrow') }), h('img.ph-ex__art', { alt: s.name + ' portrait', src: art.image, loading: 'lazy' }));
      })),
      h('button.btn.btn--accent.btn--wide', { onclick: () => { close(); paintMe(); } }, 'Paint me in this style'),
    ], { cls: 'sheet--examples', label: s.name + ' examples' });
  }

  caption();
  return {
    el,
    shown() {
      eta.textContent = etaLine();
      requestAnimationFrame(() => { scrollTo(at, false); lean(); settle(); });
    },
  };
}

/** The first time: one photograph, painted in every style in turn. Remembered once seen. */
export function intro({ force = false } = {}) {
  if ((!force && settings.get('introduced', false)) || stage().querySelector('.intro')) return;
  const cat = catalogue(), who = 'ama';
  const imgs = [photoOf(who), ...STYLES.map(s => artOf(cat, s, who).image)];
  const pic = h('img.intro__pic', { alt: '', src: imgs[0] }), next = h('img.intro__pic.intro__next', { alt: '' });
  const label = h('p.intro__label', null, 'A photograph');
  const done = () => { settings.set('introduced', true); clearInterval(timer); el.classList.add('is-out'); setTimeout(() => el.remove(), reduced ? 0 : 420); };
  const el = h('div.intro', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Welcome to Likeness' },
    h('div.intro__frame', null, pic, next),
    label,
    h('div.intro__words', null,
      h('h1.intro__title', null, 'One photo.', h('br'), h('em', null, 'Every world.')),
      h('p.intro__lede', null, 'Choose a style, add a photo of your face, and the studio paints your portrait in it. Change any detail, keep every version.'),
      h('button.btn.btn--accent.btn--wide.intro__go', { type: 'button', onclick: done }, 'Show me the styles'),
      h('button.intro__skip', { type: 'button', onclick: done }, 'Skip')));
  stage().append(el);
  let k = 0;
  const timer = setInterval(() => {
    k = (k + 1) % imgs.length;
    next.src = imgs[k];
    next.classList.remove('is-in'); void next.offsetWidth; next.classList.add('is-in');
    label.textContent = k ? STYLES[k - 1].name : 'A photograph';
    setTimeout(() => { pic.src = imgs[k]; next.classList.remove('is-in'); }, reduced ? 0 : 900);
  }, reduced ? 2600 : 1900);
}
