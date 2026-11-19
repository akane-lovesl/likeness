/**
 * The first time: a sitting, not a slideshow. One of the studio's people fills the screen and wears a look in a sweep
 * of light; under them are the looks they were made in, by GPT Image on the studio's own computer. Touch one and it
 * sweeps in; drag across the picture and the light follows the finger, before on one side and after on the other; ask
 * for someone else. Then the same look on you (the camera, or a photo), or the Lookbook with that face in front.
 * Where the studio's people are not here (the drawn sitters stand in), it says the same in a line and three steps.
 * Skipped or finished, it is remembered; the name at the top of the Lookbook brings it back.
 */
import { h, stage } from '../core/dom.js';
import { settings } from '../core/store.js';
import { studio } from '../studio/studio.js';
import { reduced } from '../core/motion.js';
import { emit } from '../core/bus.js';
import { plateSVG, lookName } from '../looks/vocab.js';
import { examples } from '../looks/book.js';

/** Whether the welcome has been seen (or skipped). */
export const welcomed = () => !!settings.get('welcomed', false);

/** What your own looks will be, in this edition, said plainly. */
const how = () => (studio.mode === 'workstation' ? 'On you, GPT Image makes them on your own computer.'
  : studio.mode === 'simulator' ? 'On you, the simulator stands in for GPT Image here, and says so.'
  : 'On you, they are sketched on this device until a studio on your computer renders them.');
const wait = (/** @type {number} */ ms) => new Promise(r => setTimeout(r, ms));
/** A picture fetched ahead, so it is ready when it is shown. @param {string} src */
const load = (src) => new Promise(done => { const i = new Image(); i.onload = i.onerror = () => done(null); i.src = src; });
const ease = (/** @type {number} */ t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Where the light stands when a look is fully on: past the picture's far edge. */
const ON = 1.18;

/** @typedef {{ act: 'me' | 'look', person: string, part: string, style: string }} Sat what the sitting ended on, and what to do with it */

/** Shows the welcome (once, unless asked for again). @param {{ force?: boolean }} [o] */
export function welcome({ force = false } = {}) {
  const root = stage();
  if ((!force && welcomed()) || root.querySelector('.wl')) return;
  const el = h('div.wl', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Welcome to Likeness' });
  root.append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  let ended = false;
  const stops = /** @type {(() => void)[]} */ ([]);
  /** @param {Sat | null} [then] */
  const end = (then = null) => {
    if (ended) return; ended = true;
    settings.set('welcomed', true);
    stops.forEach(f => f());
    el.classList.remove('is-in');
    setTimeout(() => { el.remove(); if (then) emit('sitting', then); }, reduced ? 0 : 420);
  };
  const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape' && el.isConnected) { e.preventDefault(); end(); } };
  window.addEventListener('keydown', onKey); stops.push(() => window.removeEventListener('keydown', onKey));
  examples().catch(() => null).then(m => {
    if (!el.isConnected || ended) return;
    const people = (m?.people || []).filter(p => p.looks?.length && p.looks.every(l => l.image));
    if (people.length) sitting(el, people, end, stops); else card(el, end);
  });
}

/** Without the studio's people: what it is for in a line, and three steps. @param {HTMLElement} el @param {(then?: Sat | null) => void} end */
function card(el, end) {
  const li = (/** @type {number} */ i, /** @type {string} */ b, /** @type {string} */ s) => h('li', { style: { '--i': i } }, h('b', null, b), h('span', null, s));
  const go = h('button.wl-go', { type: 'button', onclick: () => end() }, 'Start');
  el.append(h('div.wl-title', null,
    h('p.wl-title__hello', null, 'Welcome to'), h('h1.wl-title__name', null, 'Likeness'), h('p.wl-title__line', null, 'Try a look on before you commit to it.'),
    h('ol.wl-title__steps', null, li(0, 'Find a look you love', 'on the faces in the ring'), li(1, 'Mix it your way', 'bangs, brows, lips and colour, all at once'), li(2, 'See it on you', how())),
    h('div.wl-title__row', null, go)));
  go.focus({ preventScroll: true });
}

/**
 * The sitting: a face, the looks it was made in, the light under a finger, and the way on.
 * @param {HTMLElement} el @param {import('../looks/book.js').Person[]} people @param {(then?: Sat | null) => void} end @param {(() => void)[]} stops
 */
function sitting(el, people, end, stops) {
  let who = 0, look = 0, x = 0, held = false, tour = 0, anim = 0;
  const before = /** @type {HTMLImageElement} */ (h('img.wl-hero__before', { alt: '', draggable: false }));
  const after = /** @type {HTMLImageElement} */ (h('img.wl-hero__after', { alt: '', draggable: false }));
  const say = h('p.wl-hero__say');
  const hero = h('div.wl-hero.wl-sit__hero', { role: 'slider', tabindex: '0', 'aria-label': 'Before and after: drag across the picture', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' },
    before, after, h('i.wl-hero__light', { 'aria-hidden': 'true' }), say, h('span.wl-sit__drag', { 'aria-hidden': 'true' }, 'Drag across: before, after'));
  const ask = h('p.wl-sit__ask'), looks = h('div.wl-sit__looks', { role: 'group', 'aria-label': 'Looks' });
  const next = h('button.wl-sit__next', { type: 'button', onclick: () => { stop(); person(who + 1); } }, 'Someone else');
  const go = h('button.wl-go', { type: 'button', onclick: () => end({ act: 'me', ...now() }) }, 'Try it on me');
  const around = h('button.wl-sit__around', { type: 'button', onclick: () => end({ act: 'look', ...now() }) }, 'Look around');
  const skip = h('button.wl-sit__skip', { type: 'button', onclick: () => end() }, 'Skip');
  el.append(h('div.wl-sit', null, hero, skip,
    h('div.wl-sit__body', null,
      h('div.wl-sit__text', null, h('p.wl-title__hello', null, 'Welcome to'), h('h1.wl-title__name', null, 'Likeness'), h('p.wl-title__line', null, 'Try a look on before you commit to it.')),
      h('div.wl-sit__choose', null, h('div.wl-sit__head', null, ask, next), looks),
      h('div.wl-sit__row', null, go, around),
      h('p.wl-sit__note', null, how()))));
  const P = () => people[who], L = () => P().looks[look];
  const now = () => ({ person: P().id, part: L().part, style: L().style });

  /** The light, where it stands: the look shows on its near side, the face as it is on its far side. @param {number} v */
  const set = (v) => {
    x = v; hero.style.setProperty('--x', v.toFixed(4));
    const shown = Math.round(Math.max(0, Math.min(1, v)) * 100);
    hero.setAttribute('aria-valuenow', String(shown));
    hero.setAttribute('aria-valuetext', lookName(L().part, L().style) + ' on ' + (P().name || '') + (shown >= 100 ? '' : shown <= 0 ? ', as they are' : ', ' + shown + '% across'));
  };
  /** The light carried to v. @param {number} to @param {number} ms */
  const glide = (to, ms) => new Promise(done => {
    cancelAnimationFrame(anim);
    if (reduced || ms <= 0) { set(to); done(null); return; }
    const from = x, t0 = performance.now(); hero.classList.add('is-moving');
    const f = (/** @type {number} */ t) => { const u = Math.min(1, (t - t0) / ms); set(from + (to - from) * ease(u)); if (u < 1) anim = requestAnimationFrame(f); else { hero.classList.remove('is-moving'); done(null); } };
    anim = requestAnimationFrame(f);
  });
  /** The looks this face was made in, to choose from. */
  function paintLooks() {
    const p = P();
    ask.textContent = 'Choose a look for ' + (p.name || 'them');
    looks.replaceChildren(...p.looks.map((l, j) => h('button.wl-look', { type: 'button', 'data-style': l.style, 'aria-pressed': String(j === look), onclick: () => { stop(); choose(j); } },
      h('i', { html: plateSVG(l.part, l.style) }), h('span', null, lookName(l.part, l.style)))));
    say.textContent = lookName(L().part, L().style) + ' · ' + (p.name || '');
  }
  /** Someone (else): their portrait, then their first look sweeping in. @param {number} i */
  async function person(i) {
    who = ((i % people.length) + people.length) % people.length; look = 0;
    const p = P(), l = L();
    hero.classList.remove('is-in');
    await Promise.all([load(p.portrait), load(l.image), wait(reduced ? 0 : 380)]);
    if (!el.isConnected) return;
    before.src = p.portrait; after.src = l.image; set(0); paintLooks();
    hero.classList.add('is-in');
    p.looks.slice(1).forEach(k => load(k.image));
    if (reduced) { set(ON); return; }
    await wait(900); if (!el.isConnected) return;
    await glide(ON, 1500);
  }
  /** One of this face's looks: from the one on now, it sweeps in; then the face as it was is under it again. @param {number} j */
  async function choose(j) {
    const p = P(), l = p.looks[j]; if (!l) return;
    if (j === look && x >= 1) { await glide(0, 520); await wait(160); await glide(ON, 900); return; }
    await load(l.image); if (!el.isConnected) return;
    if (x >= 1) before.src = after.src;
    look = j; paintLooks();
    after.src = l.image; set(0);
    await glide(ON, 1300);
    if (look === j && x >= 1) before.src = p.portrait;
  }
  /** The face it shows stops changing by itself. */
  function stop() { held = true; tour++; hero.classList.add('is-held'); }
  /** Until then, one face after another, each wearing its first look. */
  async function round() {
    const me = ++tour;
    await person(0);
    while (!held && me === tour && !reduced) {
      await wait(3400); if (held || me !== tour || !el.isConnected) return;
      await person(who + 1);
    }
  }

  // the light under a finger: before on its far side, the look on its near side; let go, and the look comes back whole
  let dragging = /** @type {number | null} */ (null);
  const at = (/** @type {PointerEvent} */ e) => { const r = hero.getBoundingClientRect(); return Math.max(0, Math.min(ON, (e.clientX - r.left) / r.width)); };
  hero.addEventListener('pointerdown', e => {
    if (e.button) return;
    stop(); dragging = e.pointerId; hero.setPointerCapture(e.pointerId); cancelAnimationFrame(anim); hero.classList.add('is-moving', 'is-dragged', 'was-dragged');
    glide(at(e), 140);
  });
  hero.addEventListener('pointermove', e => { if (dragging !== e.pointerId) return; cancelAnimationFrame(anim); hero.classList.add('is-moving'); set(at(e)); });
  const lift = (/** @type {PointerEvent} */ e) => { if (dragging !== e.pointerId) return; dragging = null; hero.classList.remove('is-dragged'); glide(ON, 700); };
  hero.addEventListener('pointerup', lift); hero.addEventListener('pointercancel', lift);
  hero.addEventListener('keydown', e => {
    const k = { ArrowLeft: -.1, ArrowRight: .1, Home: -9, End: 9 }[e.key]; if (k === undefined) return;
    e.preventDefault(); stop(); glide(Math.max(0, Math.min(ON, x + k)), 160);
  });
  stops.push(() => { tour++; cancelAnimationFrame(anim); });
  round();
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (looks.querySelector('.wl-look'))?.focus({ preventScroll: true }));
}
