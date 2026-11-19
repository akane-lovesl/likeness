/**
 * The Lookbook: the first thing you see. A ring of faces, each changing one thing in a sweep of light (the bangs, the
 * brows, the colour), that turns under a finger and on its own; the parts a look can change, drawn; one line to ask in.
 * Pick a face or bring your own, and the mirror opens on it. Until the studio's portraits are in, the ring holds the
 * drawn plates instead: one part redrawn style after style.
 */
import { h, icon, toast, stage, fitting } from '../core/dom.js';
import { spring, drag, reduced } from '../core/motion.js';
import { studio } from '../studio/studio.js';
import { PARTS, partById, styleOf, plateSVG } from './vocab.js';
import { openMirror, bringPhoto } from './mirror.js';
import { openLive, canLive } from './live.js';

/** @typedef {{ part: string, style: string, words?: string, image: string, takes?: string[], angles?: string[] }} Look */
/** @typedef {{ id: string, name?: string, kind?: string, portrait: string, looks: Look[] }} Person */
/** @typedef {{ kind: 'photo', person: Person, look: Look } | { kind: 'plate', part: string, style: string }} Card */

const BASE = new URL('../../examples/', import.meta.url);
/** @type {Promise<{ by: string | null, kind: string, people: Person[] }> | null} */
let manifest = null;
/** The studio's example portraits, and the looks rendered on each. */
export function examples() {
  manifest ||= fetch(new URL('manifest.json', BASE), { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(m => ({
    by: m?.by || null, kind: m?.kind === 'render' ? 'render' : 'simulated',
    // every address made whole, against the folder the manifest is in
    people: (m?.people || []).filter((/** @type {any} */ p) => p?.portrait && Array.isArray(p.looks)).map((/** @type {any} */ p) => ({ ...p, kind: m?.kind === 'render' ? 'render' : 'simulated', portrait: at(p.portrait), looks: p.looks.filter((/** @type {any} */ l) => l?.image && styleOf(l.part, l.style)).map((/** @type {any} */ l) => ({ ...l, image: at(l.image), takes: (l.takes || []).map(at), angles: (l.angles || []).map(at) })) })),
  }));
  return manifest;
}
const at = (/** @type {string} */ path) => new URL(path, BASE).href;

const PLATES = /** @type {[string, string][]} */ ([['bangs', 'curtain'], ['brows', 'feathered'], ['colour', 'copper'], ['cut', 'bob'], ['lashes', 'wing'], ['lips', 'red'], ['beard', 'trimmed'], ['bangs', 'birkin']]);
const SAYINGS = ['Curtain bangs, a bit longer', 'Softer, straighter brows', 'Copper, with a few lowlights', 'A sleek chin-length bob', 'A fine winged liner', 'Feathered brows, brushed up'];

/** The name a card goes by. @param {Card} c */
const titleOf = (c) => { const part = c.kind === 'photo' ? c.look.part : c.part, s = styleOf(part, c.kind === 'photo' ? c.look.style : c.style); return s ? (['bangs', 'brows'].includes(part) ? s.name + ' ' + (partById(part)?.name || '').toLowerCase() : s.name) : ''; };

let book = /** @type {HTMLElement | null} */ (null);
/** The Lookbook in front: made the first time, brought back after that (from the desk). */
export function showBook() {
  if (!book) { book = lookbook().el; stage().append(book); }
  book.classList.remove('is-away'); book.removeAttribute('inert');
}
const open = openMirror;

/** Builds the Lookbook, over the desk. */
function lookbook() {
  const ring = h('div.lb-ring'), orbit = h('div.lb-orbit', { role: 'listbox', 'aria-label': 'Looks to try' }, ring);
  const title = h('p.lb-caption__title'), sub = h('p.lb-caption__part');
  const caption = h('div.lb-caption', { 'aria-live': 'polite' }, title, sub);
  const desk = h('button.lb-bar__desk', { type: 'button', 'aria-label': 'Your pictures', title: 'Your pictures', html: icon('album'), onclick: () => away() });
  const edition = h('span.lb-bar__edition', null, studio.label);
  const bar = h('header.lb-bar', null, h('span.lb-bar__mark', null, 'Likeness'), edition, desk);
  const parts = h('div.lb-parts', { role: 'toolbar', 'aria-label': 'What to change' }, ...PARTS.map(p => h('button.lb-part', { type: 'button', 'data-part': p.id, 'aria-pressed': 'false', onclick: () => choosePart(p.id) },
    h('span.lb-part__glyph', { html: plateSVG(p.id, p.styles[0].id) }), h('span.lb-part__name', null, p.name))));
  const styles = h('div.lb-styles', { hidden: true, role: 'listbox' });
  const photoBtn = h('button.lb-ask__photo', { type: 'button', 'aria-label': 'Your face: the camera, or a photo', title: 'Your face: the camera, or a photo', html: icon('camera'), onclick: () => pickPhoto() });
  const tokens = h('div.lb-ask__tokens');
  const input = h('input.lb-ask__input', { type: 'text', 'aria-label': 'Describe a change', autocomplete: 'off', enterkeyhint: 'go' });
  const go = h('button.lb-ask__go', { type: 'submit', 'aria-label': 'Try it on', html: icon('arrow') });
  const ask = h('form.lb-ask', { onsubmit: (/** @type {Event} */ e) => { e.preventDefault(); submit(); } }, photoBtn, h('div.lb-ask__field', null, tokens, input), go);
  const el = h('section.book', { 'aria-label': 'Lookbook' }, h('div.lb-light', { 'aria-hidden': 'true' }), bar, orbit, caption, h('div.lb-dock', null, parts, styles, ask));

  /** @type {Card[]} */ let cards = [];
  /** @type {HTMLElement[]} */ let els = [];
  let spin = 0, R = 300, step = 45, front = 0, anim = /** @type {{ stop(): void } | null} */ (null), touched = 0, moved = false;
  /** @type {{ part: string, style: any }[]} */ let picks = [];
  /** @type {any} */ let photo = null;
  let part = '';

  function deal(/** @type {Card[]} */ list) {
    cards = list; step = 360 / Math.max(5, list.length);
    els = list.map((c, i) => {
      const card = h('button.lb-card', { type: 'button', role: 'option', 'aria-label': titleOf(c), style: { '--d': (60 + i * 55) + 'ms' }, onclick: (/** @type {MouseEvent} */ e) => { if (e.detail === 0) tap(i); } });
      if (c.kind === 'photo') card.append(h('img.lb-card__before', { src: c.person.portrait, alt: '', draggable: false }), h('img.lb-card__after', { src: c.look.image, alt: '', draggable: false }), h('span.lb-card__glint'), h('span.lb-card__tag', null, c.person.kind === 'render' ? 'GPT Image' : 'Simulated'));
      else card.append(h('div.lb-card__plate', { html: plateSVG(c.part, c.style) }), h('span.lb-card__tag', null, 'Drawn'), h('span.lb-card__me', { 'aria-hidden': 'true' }, h('span', { html: icon('camera') }), 'On me'));
      card.classList.add('lb-card--' + c.kind);
      return card;
    });
    ring.replaceChildren(...els); spin = 0; front = 0; layout(); show(0);
  }
  function layout() {
    const w = orbit.clientWidth || 400, hh = orbit.clientHeight || 600, cw = Math.min(w * .62, hh * .84 * .75);
    ring.style.setProperty('--cw', cw.toFixed(1) + 'px');
    R = cw / (2 * Math.tan(Math.PI / Math.max(5, cards.length))) * 1.05;
    ring.style.transform = 'translateZ(' + (-R).toFixed(1) + 'px)';
    place();
  }
  function place() {
    let best = 0, bestA = 999;
    els.forEach((card, i) => {
      const a = ((i * step + spin) % 360 + 540) % 360 - 180, f = Math.cos(a * Math.PI / 180);
      card.style.transform = 'translate(-50%, -50%) rotateY(' + a.toFixed(2) + 'deg) translateZ(' + R.toFixed(1) + 'px)';
      card.style.opacity = f < -.15 ? '0' : Math.min(1, .2 + f).toFixed(3);
      card.style.setProperty('--lit', (.38 + .62 * Math.pow(Math.max(0, f), 1.6)).toFixed(3));
      card.style.visibility = f < -.2 ? 'hidden' : 'visible';
      if (Math.abs(a) < bestA) { bestA = Math.abs(a); best = i; }
    });
    if (best !== front) { front = best; show(front); }
    els.forEach((card, i) => card.classList.toggle('is-front', i === front));
  }
  /** The front card's name, under the ring; a plate starts drawing its part, style after style. */
  function show(/** @type {number} */ i) {
    const c = cards[i]; if (!c) return;
    const p = partById(c.kind === 'photo' ? c.look.part : c.part);
    title.textContent = titleOf(c); sub.textContent = (p?.name || '').toUpperCase() + (c.kind === 'photo' && c.person.name ? ' · ' + c.person.name.toUpperCase() : '');
    if (!reduced) caption.animate([{ opacity: 0, translate: '0 .6em' }, { opacity: 1, translate: '0 0' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    els.forEach(e => e.removeAttribute('aria-selected')); els[i]?.setAttribute('aria-selected', 'true');
  }
  function turnTo(/** @type {number} */ i, velocity = 0) {
    anim?.stop();
    let target = -i * step; while (target - spin > 180) target -= 360; while (spin - target > 180) target += 360;
    anim = spring({ from: spin, to: target, velocity, stiffness: 120, damping: 20, onUpdate: v => { spin = v; place(); }, onRest: () => { spin = ((target % 360) + 360) % 360; place(); } });
  }
  // a finger turns the ring; let go and it comes to rest on the nearest face, carried on a little by the throw
  let from = 0;
  drag(orbit, {
    start: () => { anim?.stop(); from = spin; moved = false; touched = Date.now(); },
    move: d => { if (Math.abs(d.dx) > 6) moved = true; spin = from + d.dx * step / (orbit.clientWidth * .5); place(); },
    end: d => {
      touched = Date.now();
      // a tap: the drag held the pointer, so the card under it is found here
      if (!moved) { const card = document.elementFromPoint(d.x, d.y)?.closest('.lb-card'), i = card ? els.indexOf(/** @type {HTMLElement} */ (card)) : -1; if (i >= 0) tap(i); return; }
      const v = d.vx * step / (orbit.clientWidth * .5), to = Math.round(-(spin + v * .28) / step); turnTo(((to % cards.length) + cards.length) % cards.length, v); setTimeout(() => { moved = false; }, 60); },
  });
  orbit.addEventListener('keydown', e => { if (e.key === 'ArrowRight') turnTo((front + 1) % cards.length); else if (e.key === 'ArrowLeft') turnTo((front - 1 + cards.length) % cards.length); });
  // left alone, it turns by itself, one face at a time
  const turning = setInterval(() => { if (reduced || document.hidden || el.classList.contains('is-away') || el.classList.contains('is-under') || Date.now() - touched < 7000) return; turnTo((front + 1) % cards.length); }, 4600);
  // a plate redraws its part, style after style
  const redraw = setInterval(() => {
    const c = cards[front], card = els[front]; if (!c || c.kind !== 'plate' || reduced || el.classList.contains('is-away')) return;
    const all = partById(c.part)?.styles || [], next = all[(all.findIndex(s => s.id === c.style) + 1) % all.length];
    c.style = next.id; const plate = card.querySelector('.lb-card__plate'); if (plate) plate.innerHTML = plateSVG(c.part, c.style);
    card.setAttribute('aria-label', titleOf(c)); show(front);
  }, 2600);
  new ResizeObserver(layout).observe(orbit);

  /** A card touched: the front one is chosen, another is turned to the front. @param {number} i */
  const tap = (i) => (i === front ? choose(i) : turnTo(i));
  /** The front card, chosen: its face in the mirror, or its style picked and a face asked for. */
  function choose(/** @type {number} */ i) {
    const c = cards[i]; if (!c) return;
    if (c.kind === 'photo') { open({ person: c.person, look: c.look, picks: [{ part: c.look.part, style: styleOf(c.look.part, c.look.style) }], from: els[i] }); return; }
    pick(c.part, c.style);
    if (photo) open({ print: photo, picks, words: input.value, from: els[i] }); else pickPhoto(els[i]);
  }
  function choosePart(/** @type {string} */ id) {
    part = part === id ? '' : id;
    parts.querySelectorAll('.lb-part').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-part') === part)));
    styles.hidden = !part;
    if (part) {
      const p = partById(part);
      styles.replaceChildren(...(p?.styles || []).map((s, i) => h('button.lb-style', { type: 'button', role: 'option', 'data-style': s.id, style: { '--d': (i * 55) + 'ms' }, 'aria-selected': String(picks.some(q => q.part === part && q.style.id === s.id)), onclick: () => pick(part, s.id) },
        h('span.lb-style__plate', { html: plateSVG(part, s.id) }), h('span.lb-style__name', null, s.name))));
      if (!reduced) styles.animate([{ opacity: 0, translate: '0 30%' }, { opacity: 1, translate: '0 0' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    examples().then(m => deal(cardsFor(m, part)));
  }
  /** A style, picked (one per part): shown as a token on the line, and its face turned to the front. */
  function pick(/** @type {string} */ p, /** @type {string} */ id) {
    const s = styleOf(p, id); if (!s) return;
    const had = picks.find(q => q.part === p);
    picks = had && had.style.id === id ? picks.filter(q => q !== had) : [...picks.filter(q => q.part !== p), { part: p, style: s }];
    tokens.replaceChildren(...picks.map(q => h('button.lb-token', { type: 'button', 'aria-label': 'Remove ' + q.style.name, onclick: () => pick(q.part, q.style.id) }, h('span.lb-token__plate', { html: plateSVG(q.part, q.style.id) }), h('span.lb-token__name', null, q.style.name))));
    styles.querySelectorAll('.lb-style').forEach(b => b.setAttribute('aria-selected', String(picks.some(q => q.part === p && q.style.id === b.getAttribute('data-style')))));
    const i = cards.findIndex(c => (c.kind === 'photo' ? c.look.part === p && c.look.style === id : c.part === p && c.style === id));
    if (i >= 0 && i !== front) turnTo(i);
  }
  function nudge() {
    photoBtn.classList.remove('is-asking'); void photoBtn.offsetWidth; photoBtn.classList.add('is-asking');
    toast('Whose face? Add a photo, or pick a face above.');
  }
  /** Your face, for the look: the live mirror where there is a camera (a photo can be chosen from it), else a photo. */
  async function pickPhoto(/** @type {HTMLElement} */ from = photoBtn) {
    const got = /** @type {{ print: any, picks: any[], from?: Element, face?: any } | null} */ ((await canLive()) ? await openLive({ picks: livePicks(), keep: picks, fallback: bringPhoto, from }) : await bringPhoto().then(p => (p ? { print: p, picks } : null)));
    if (!got) return;
    photo = got.print; photoBtn.replaceChildren(h('img', { src: URL.createObjectURL(photo.blob), alt: '' })); photoBtn.classList.add('has-photo');
    open({ print: photo, picks: got.picks, words: input.value, from: got.from || from, face: got.face });
  }
  /** The look the live mirror opens on: what was picked here, or the one at the front of the ring. */
  function livePicks() {
    if (picks.length) return picks;
    const c = cards[front]; if (!c) return [];
    const p = c.kind === 'photo' ? c.look.part : c.part, s = styleOf(p, c.kind === 'photo' ? c.look.style : c.style);
    return s ? [{ part: p, style: s }] : [];
  }
  function submit() {
    if (!picks.length && !input.value.trim()) { input.focus(); return; }
    if (!photo) { nudge(); return; }
    open({ print: photo, picks, words: input.value, from: ask, go: true });
  }
  function away() { el.classList.add('is-away'); el.setAttribute('inert', ''); }

  // the line, saying what could be asked, one thing after another
  let say = 0, typed = 0;
  const typing = setInterval(() => {
    // beside picks, only that more can be said
    if (picks.length) { if (!input.value) input.placeholder = fitting(input, ['Say more…', 'More…']); typed = 0; return; }
    if (document.activeElement === input || input.value || reduced) { input.placeholder = reduced ? SAYINGS[0] : input.placeholder; return; }
    const s = SAYINGS[say % SAYINGS.length]; typed++;
    if (typed <= s.length) input.placeholder = s.slice(0, typed);
    else if (typed > s.length + 26) { typed = 0; say++; }
  }, 70);

  examples().then(m => deal(cardsFor(m, '')));
  return { el };
}

/** The ring's cards: every look on every face, the faces taking turns; or the drawn plates. @param {{ people: Person[] }} m @param {string} part */
function cardsFor(m, part) {
  const looks = (m.people || []).map(p => (p.looks || []).filter(l => !part || l.part === part).map(look => /** @type {Card} */ ({ kind: 'photo', person: p, look })));
  const out = []; for (let k = 0; looks.some(l => l[k]); k++) for (const l of looks) if (l[k]) out.push(l[k]);
  if (out.length >= 3) return out.slice(0, 12);
  const plates = part ? (partById(part)?.styles || []).map(s => [part, s.id]) : PLATES;
  return plates.map(([p, s]) => /** @type {Card} */ ({ kind: 'plate', part: p, style: s }));
}
