/**
 * The first time: what Likeness is for and how to begin, told on the app itself. A title card says it in a line and three
 * steps; then a light picks out each part of the first screen in turn (the ring, mixing a look, your own face, the rooms)
 * while it does what it says: two styles are picked and every face in the ring wears both, then they are put back as
 * they were. Skipped or finished, it is remembered; the name at the top of the Lookbook brings it back.
 */
import { h, stage } from '../core/dom.js';
import { settings } from '../core/store.js';
import { studio } from '../studio/studio.js';
import { reduced } from '../core/motion.js';
import { plateSVG, lookName } from '../looks/vocab.js';
import { examples } from '../looks/book.js';

/** Whether the welcome has been seen (or skipped). */
export const welcomed = () => !!settings.get('welcomed', false);

/** @typedef {{ at: string[], title: string, say: string, place: 'above' | 'below', demo?: boolean }} Step */
/** @type {Step[]} */
const STEPS = [
  { at: ['.lb-orbit'], title: 'Looks, on faces', say: 'Each face changes one thing as you watch. Swipe to turn the ring; touch the one in front to see it close up in the mirror.', place: 'below' },
  { at: ['.lb-orbit'], title: 'Mix your own', say: 'Pick a style from any part below (bangs, brows, lips, colour) and every face wears them all at once.', place: 'below', demo: true },
  { at: ['.lb-ask'], title: 'Then, on you', say: 'The camera, or a photo, and your look goes on your own face. Your pictures stay on this device.', place: 'above' },
  { at: ['.lb-bar__room'], title: 'Make it yours', say: 'Rooms dress the whole app: the Salon, Little Princess, Night Arcade and more. Change whenever you like.', place: 'below' },
];
const wait = (/** @type {number} */ ms) => new Promise(r => setTimeout(r, ms));

/** Shows the welcome (once, unless asked for again). @param {{ force?: boolean }} [o] */
export function welcome({ force = false } = {}) {
  const root = stage();
  if ((!force && welcomed()) || root.querySelector('.wl')) return;
  const how = studio.mode === 'workstation' ? 'Rendered by GPT Image on your own computer.' : studio.mode === 'simulator' ? 'Here the simulator stands in for GPT Image, and says so.' : 'Sketched here on the device; a studio on your computer renders them.';
  const card = h('div.wl-title', null,
    h('p.wl-title__hello', null, 'Welcome to'),
    h('h1.wl-title__name', null, 'Likeness'),
    h('p.wl-title__line', null, 'Try a look on before you commit to it.'),
    h('ol.wl-title__steps', null,
      h('li', { style: { '--i': 0 } }, h('b', null, 'Find a look you love'), h('span', null, 'on the faces in the ring')),
      h('li', { style: { '--i': 1 } }, h('b', null, 'Mix it your way'), h('span', null, 'bangs, brows, lips and colour, all at once')),
      h('li', { style: { '--i': 2 } }, h('b', null, 'See it on you'), h('span', null, how))),
    h('div.wl-title__row', null,
      h('button.wl-go', { type: 'button', onclick: () => tour() }, 'Show me around'),
      h('button.wl-skip', { type: 'button', onclick: () => end() }, 'Skip')));
  // the point of it, shown before it is said: one of the studio's people, then a look sweeping across their face
  const hero = h('div.wl-hero', { 'aria-hidden': 'true' });
  card.prepend(hero);
  heroOf(hero, card);
  const hole = h('div.wl-hole', { 'aria-hidden': 'true' });
  const say = h('div.wl-card', { role: 'dialog', 'aria-live': 'polite' });
  const el = h('div.wl', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Welcome to Likeness' }, hole, say, card);
  root.append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  let step = -1, timer = 0, demoing = /** @type {Promise<void> | null} */ (null), stop = false;

  /** The box round what a step picks out, in the stage's own pixels. @param {string[]} sels */
  const boxOf = (sels) => {
    const s = root.getBoundingClientRect(), rs = sels.map(q => root.querySelector(q)?.getBoundingClientRect()).filter(r => r && r.width);
    if (!rs.length) return null;
    const x0 = Math.min(...rs.map(r => r.left)), y0 = Math.min(...rs.map(r => r.top)), x1 = Math.max(...rs.map(r => r.right)), y1 = Math.max(...rs.map(r => r.bottom));
    return { x: x0 - s.left, y: y0 - s.top, w: x1 - x0, h: y1 - y0, W: s.width, H: s.height };
  };
  /** The light and the card, where the step's part of the screen is now (it moves: the ring makes room for styles). */
  const place = () => {
    const st = STEPS[step]; if (!st) return;
    const b = boxOf(st.at); if (!b) return;
    const pad = b.W * .02;
    Object.assign(hole.style, { left: b.x - pad + 'px', top: b.y - pad + 'px', width: b.w + pad * 2 + 'px', height: b.h + pad * 2 + 'px' });
    const gap = b.W * .035;
    if (st.place === 'below') { say.style.top = Math.min(b.H - say.offsetHeight - gap, b.y + b.h + pad + gap) + 'px'; say.style.bottom = ''; }
    else { say.style.bottom = Math.min(b.H - say.offsetHeight - gap, b.H - b.y + pad + gap) + 'px'; say.style.top = ''; }
  };
  function tour() {
    el.classList.add('is-touring'); card.remove();
    timer = setInterval(place, 160);
    next();
  }
  async function next() {
    if (demoing) { stop = true; await demoing; stop = false; }
    step++;
    const st = STEPS[step]; if (!st) { end(); return; }
    const last = step === STEPS.length - 1;
    say.replaceChildren(...[
      h('p.wl-card__n', null, step + 1 + ' of ' + STEPS.length),
      h('h2.wl-card__title', null, st.title),
      h('p.wl-card__say', null, st.say),
      st.demo ? h('div.wl-card__mix', { 'aria-hidden': 'true' }) : null,
      h('div.wl-card__row', null,
        h('button.wl-skip', { type: 'button', onclick: () => end() }, last ? '' : 'Skip'),
        h('button.wl-go', { type: 'button', onclick: () => next() }, last ? 'Start' : 'Next'))].filter(x => !!x));
    el.dataset.step = String(step);
    place();
    if (!reduced) say.animate([{ opacity: 0, translate: '0 3cqw' }, { opacity: 1, translate: '0 0' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    /** @type {HTMLButtonElement | null} */ (say.querySelector('.wl-go'))?.focus({ preventScroll: true });
    if (st.demo) demoing = demo(/** @type {HTMLElement} */ (say.querySelector('.wl-card__mix'))).finally(() => { demoing = null; });
  }
  /**
   * Mixing a look, done for real on the ring: curtain bangs picked, then a red lip, and every face wears both; then put
   * back as it was. Only on a ring with nothing picked (it never touches a look of yours). @param {HTMLElement} mix
   */
  async function demo(mix) {
    const book = /** @type {HTMLElement | null} */ (root.querySelector('section.book'));
    if (!book || book.querySelector('.lb-token') || book.querySelector('.lb-part[aria-pressed="true"]')) return;
    const press = (/** @type {string} */ sel) => /** @type {HTMLElement | null} */ (book.querySelector(sel))?.click();
    const took = [];
    try {
      for (const [part, style, name] of [['bangs', 'curtain', 'Curtain bangs'], ['lips', 'red', 'Red lips']]) {
        if (stop) break;
        press('.lb-part[data-part="' + part + '"]'); await wait(reduced ? 0 : 700); if (stop) break;
        press('.lb-style[data-style="' + style + '"]'); took.push(part);
        mix.append(h('span.wl-chip', null, h('i', { html: plateSVG(part, style) }), name));
        await wait(reduced ? 0 : 2200);
      }
      if (!stop) await wait(reduced ? 0 : 2600);
    } finally {
      // as it was: the picks taken back, the part closed
      if (took.length) book.querySelectorAll('.lb-token').forEach(t => /** @type {HTMLElement} */ (t).click());
      press('.lb-part[aria-pressed="true"]');
    }
  }
  async function end() {
    settings.set('welcomed', true);
    stop = true; if (demoing) await demoing;
    clearInterval(timer);
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), reduced ? 0 : 420);
  }
}

/**
 * The title card's picture: the studio's people one after another, each as they are and then, in a sweep of light,
 * wearing a look, the way the ring shows them. Only where their pictures are here: the drawn sitters' looks are
 * sketches, and the card does without. Held still on the look for anyone who asks for less motion.
 * @param {HTMLElement} hero @param {HTMLElement} card
 */
async function heroOf(hero, card) {
  const m = await examples().catch(() => null);
  const pairs = (m?.people || []).flatMap(p => (p.looks[0] ? [{ before: p.portrait, after: p.looks[0].image, say: lookName(p.looks[0].part, p.looks[0].style) + ' · ' + (p.name || '') }] : []));
  if (!pairs.length || !hero.isConnected) return;
  const before = h('img.wl-hero__before', { alt: '' }), after = h('img.wl-hero__after', { alt: '' }), say = h('p.wl-hero__say');
  hero.append(before, after, h('i.wl-hero__light'), say);
  /** A picture fetched ahead, so a change is ready when it comes. @param {string} src */
  const load = (src) => new Promise(done => { const i = new Image(); i.onload = i.onerror = () => done(null); i.src = src; });
  let k = 0;
  const next = async () => {
    if (!hero.isConnected) return;
    const x = pairs[k++ % pairs.length];
    await Promise.all([load(x.before), load(x.after)]);
    if (!hero.isConnected) return;
    before.src = x.before; after.src = x.after; say.textContent = x.say;
    hero.classList.remove('is-sweeping'); void hero.offsetWidth;
    card.classList.add('has-hero'); hero.classList.add('is-in');
    if (reduced) { hero.classList.add('is-after'); return; }
    const y = pairs[k % pairs.length]; load(y.before); load(y.after);
    setTimeout(() => hero.classList.add('is-sweeping'), 1000);
    setTimeout(() => { hero.classList.remove('is-in'); setTimeout(next, 450); }, 5600);
  };
  next();
}
