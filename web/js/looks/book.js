/**
 * The Lookbook: the first thing you see. A ring of faces, each changing one thing in a sweep of light (the bangs, the
 * brows, the colour), that turns under a finger and on its own; the parts a look can change, drawn; one line to ask in.
 * Pick a face or bring your own, and the mirror opens on it. Until the studio's portraits are in, the ring holds drawn
 * sitters (invented people, drawn), each wearing a look sketched on the device: the front one leans in on the part it
 * changes and tries that part's styles on, one after another. Once the studio's people are in, their faces are read on
 * the device as the ring comes in, and they lean in and wear words the same way, as sketches that say so.
 */
import { h, icon, stage, fitting } from '../core/dom.js';
import { spring, drag, reduced } from '../core/motion.js';
import { studio } from '../studio/studio.js';
import { PARTS, partById, styleOf, plateSVG, tintOf, lookName } from './vocab.js';
import { faceFrom, shapesOf, faceOf, hairOf, maskOf, LIPS, MOUTH } from '../studio/face.js';
import * as P from '../studio/painter.js';
import { app, printById } from '../state.js';
import { on } from '../core/bus.js';
import { markup, controlsOf } from './markup.js';
import { paintLook, coloursOf, PAINTED } from './paint.js';
import { hear } from './words.js';
import { coat, dyeHair } from './tint.js';
import { openMirror, bringPhoto } from './mirror.js';
import { openLive, canLive } from './live.js';
import { openRooms } from '../ui/rooms.js';
import { activityPill } from '../ui/activity.js';
import { welcome } from '../ui/welcome.js';
import { atmosphere } from '../room/theme.js';

/** @typedef {{ part: string, style: string, words?: string, image: string, takes?: string[], angles?: string[] }} Look */
/** @typedef {{ id: string, name?: string, kind?: string, portrait: string, looks: Look[] }} Person */
/** @typedef {{ id: string, name: string, portrait: string, w: number, h: number, face: import('../studio/face.js').Face, hair: string | null, person?: Person }} Sitter a drawn sitter, its face read already (or one of the studio's people, once read: person) */
/** @typedef {{ part: string, style: string, shape?: Record<string, number> }} Worn1 one more look a card wears, beside its own */
/** @typedef {{ shape?: Record<string, number>, heard?: boolean, base?: string }} Worn how a drawn card wears words: the shape they say, whether it is wearing them now, and the style it wore before them */
/** @typedef {({ kind: 'photo', person: Person, look: Look, seen?: Seen, sketch?: string } & Worn) | ({ kind: 'sitter', sitter: Sitter, part: string, style: string, more?: Worn1[] } & Worn) | ({ kind: 'plate', part: string, style: string } & Worn)} Card */
/** @typedef {{ face: import('../studio/face.js').Face, hair: string | null }} Seen a render's face (and hair, where a colour is among its looks), read on the device */

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

const SITTERS = new URL('../../sitters/', import.meta.url);
/** @type {Promise<Sitter[]> | null} */
let sitting = null;
/** The drawn sitters, with their faces and hair read already (tools/sitters.mjs), so no model is needed to dress them. */
function sitters() {
  sitting ||= fetch(new URL('sitters.json', SITTERS)).then(r => (r.ok ? r.json() : null)).catch(() => null).then(j => (j?.sitters || []).map((/** @type {any} */ s) => ({
    id: s.id, name: s.name, portrait: new URL(s.portrait, SITTERS).href, w: s.w, h: s.h, face: faceFrom(s.pts, s.w, s.h), hair: s.hair || null,
  })));
  return sitting;
}
/** The ring when no portraits have been made: a look on each face it shows well on (or, failing the faces, its drawing). */
const PLATES = /** @type {[string, string, string][]} */ ([['bangs', 'curtain', 'lena'], ['brows', 'feathered', 'kofi'], ['colour', 'copper', 'ruth'], ['cut', 'bob', 'ines'], ['lashes', 'wing', 'lena'], ['lips', 'red', 'mei'], ['beard', 'trimmed', 'tomas'], ['bangs', 'birkin', 'ines']]);
/** Whose face a part's styles are tried on, when the ring holds only that part. */
const SITS = /** @type {Record<string, string>} */ ({ bangs: 'lena', brows: 'kofi', colour: 'ruth', cut: 'ines', lashes: 'lena', lips: 'mei', beard: 'tomas' });
/** What the line says while no one is there, one card after another round the ring: each is heard, and acted out on the face it names. */
const SAYINGS = ['Curtain bangs, a lot longer', 'Feathered brows, much fuller', 'Copper, a shade deeper', 'A sleek bob, a little longer', 'A winged liner, much longer', 'A red lip, a touch deeper', 'A trimmed beard, much shorter', 'Birkin bangs, a bit shorter'];

/** The name a card goes by. @param {Card} c */
const titleOf = (c) => {
  // a face wearing a whole look is named for all of it
  if (c.kind === 'sitter' && c.more?.length) return lookTitle([c, ...c.more].map(q => ({ part: q.part, style: { id: q.style } })));
  const part = c.kind === 'photo' ? c.look.part : c.part;
  return lookName(part, c.kind === 'photo' ? c.sketch || c.look.style : c.style);
};

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
  // whose faces the looks are on: the drawn sitters' (or the studio's people), or, once there is a photo of you, yours
  const me = /** @type {HTMLImageElement} */ (h('img.lb-whose__me', { alt: '' }));
  const whoseEl = h('div.lb-whose', { hidden: true, role: 'group', 'aria-label': 'Whose faces the looks are on' },
    h('button', { type: 'button', 'data-who': 'them', 'aria-pressed': 'true', onclick: () => whose(false) }, 'Them'),
    h('button', { type: 'button', 'data-who': 'you', 'aria-pressed': 'false', onclick: () => whose(true) }, me, 'You'));
  // the room the whole app is dressed in, its colours on the button: Rooms, from the first screen
  const roomBtn = h('button.lb-bar__room', { type: 'button', 'aria-label': 'Rooms: how the app is dressed', onclick: (/** @type {MouseEvent} */ e) => openRooms(e) }, h('span.lb-bar__swatch', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
  const paintSwatch = () => { const r = atmosphere.room; if (!r) return; roomBtn.querySelectorAll('i').forEach((d, k) => { /** @type {HTMLElement} */ (d).style.background = [r.colors.accent, r.colors.accent2, r.colors.ink][k]; }); roomBtn.title = 'Rooms · ' + r.name; };
  paintSwatch(); on('room', paintSwatch);
  const bar = h('header.lb-bar', null, h('div.lb-bar__brand', null, h('button.lb-bar__mark', { type: 'button', title: 'How it works', 'aria-label': 'Likeness: how it works', onclick: () => welcome({ force: true }) }, 'Likeness'), edition), activityPill(), whoseEl, roomBtn, desk);
  const parts = h('div.lb-parts', { role: 'toolbar', 'aria-label': 'What to change' }, ...PARTS.map(p => h('button.lb-part', { type: 'button', 'data-part': p.id, 'aria-pressed': 'false', onclick: () => choosePart(p.id) },
    h('span.lb-part__glyph', { html: plateSVG(p.id, p.styles[0].id) }), h('span.lb-part__name', null, p.name))));
  const hint = h('p.lb-hint', { 'aria-live': 'polite' });
  const styles = h('div.lb-styles.is-shut', { role: 'listbox', 'aria-label': 'Styles' });
  const photoBtn = h('button.lb-ask__photo', { type: 'button', 'aria-label': 'Your face: the camera, or a photo', title: 'Your face: the camera, or a photo', html: icon('camera'), onclick: () => pickPhoto() });
  const tokens = h('div.lb-ask__tokens');
  const input = h('input.lb-ask__input', { type: 'text', 'aria-label': 'Describe a change', autocomplete: 'off', enterkeyhint: 'go' });
  const go = h('button.lb-ask__go', { type: 'submit', 'aria-label': 'Try it on', html: icon('arrow') });
  const ask = h('form.lb-ask', { onsubmit: (/** @type {Event} */ e) => { e.preventDefault(); submit(); } }, photoBtn, h('div.lb-ask__field', null, tokens, input), go);
  const el = h('section.book', { 'aria-label': 'Lookbook' }, h('div.lb-light', { 'aria-hidden': 'true' }), bar, orbit, caption, h('div.lb-dock', null, hint, parts, styles, ask));

  /** @type {Card[]} */ let cards = [];
  /** @type {HTMLElement[]} */ let els = [];
  let spin = 0, R = 300, step = 45, front = 0, tried = 0, since = Date.now(), anim = /** @type {{ stop(): void } | null} */ (null), touched = 0, moved = false;
  /** @type {{ part: string, style: any, shape?: Record<string, number> }[]} */ let picks = [];
  /** Whether a look is being mixed: something picked, so the ring shows it on every face rather than looks one by one. */
  const mixing = () => picks.length > 0;
  /** @type {any} */ let photo = null;
  // when the ring last moved: a face is read only while it is still, so a turn never stutters for one
  let lastMove = 0;
  let part = '';

  function deal(/** @type {Card[]} */ list) {
    cards = list; step = 360 / Math.max(5, list.length);
    els = list.map((c, i) => {
      const card = h('button.lb-card', { type: 'button', role: 'option', 'aria-label': titleOf(c), style: { '--d': (60 + i * 55) + 'ms' }, onclick: (/** @type {MouseEvent} */ e) => { if (e.detail === 0) tap(i); } });
      if (c.kind === 'photo') {
        c.seen ||= seen.get(c.person.portrait);
        const label = tagOf(c);
        card.append(...photoCard(c), h('span.lb-card__glint'), h('span.lb-card__tag', { hidden: label === 'GPT Image' }, label));
        if (c.seen) card.classList.add('has-face');
      }
      else if (c.kind === 'sitter') card.append(sitterCard(c), h('span.lb-card__tag', null, c.sitter.id === 'you' || c.sitter.person ? 'Sketch' : 'Drawn'));
      else card.append(h('div.lb-card__plate', { html: plateSVG(c.part, c.style) }), h('span.lb-card__tag', null, 'Drawn'));
      const yours = c.kind === 'sitter' && c.sitter.id === 'you';
      if (!yours) card.append(h('span.lb-card__me', { 'aria-hidden': 'true' }, h('span', { html: icon('camera') }), 'On me'));
      card.classList.add('lb-card--' + c.kind); if (yours) card.classList.add('lb-card--you');
      return card;
    });
    ring.replaceChildren(...els); spin = 0; front = 0; layout(); show(0);
    cards.forEach((c, i) => { if (c.kind === 'sitter') dress(els[i], c, cardW()); });
    readFaces();
  }
  let reads = 0;
  /**
   * The studio's people, their faces read on the device one by one once the ring is in (after that they are known):
   * each card then frames the head and can lean in on its part, and words can be drawn on the face.
   */
  async function readFaces() {
    const run = ++reads, todo = [...new Set(cards.flatMap(c => (c.kind === 'photo' && !c.seen ? [c.person] : [])))];
    if (!todo.length) return;
    await new Promise(r => setTimeout(r, 1200));
    for (const p of todo) {
      if (run !== reads) return;
      await new Promise(r => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => r(0), { timeout: 1500 }) : setTimeout(r, 120)));
      while (run === reads && performance.now() - lastMove < 300) await new Promise(r => setTimeout(r, 120));
      const got = await readPerson(p);
      if (run !== reads || !got) continue;
      cards.forEach((c, k) => { if (c.kind === 'photo' && c.person === p && !c.seen) { c.seen = got; frameCard(els[k], c); } });
      if (input.value.trim()) wear(input.value);
    }
  }
  /** How wide a card is drawn. */
  const cardW = () => parseFloat(ring.style.getPropertyValue('--cw')) || 220;
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
    if (best !== front) { front = best; tried = 0; since = Date.now(); els[front]?.style.removeProperty('--late'); show(front); }
    els.forEach((card, i) => card.classList.toggle('is-front', i === front));
  }
  /** The front card's name, under the ring; a plate starts drawing its part, style after style. */
  function show(/** @type {number} */ i) {
    const c = cards[i]; if (!c) return;
    const p = partById(c.kind === 'photo' ? c.look.part : c.part);
    const who = c.kind === 'photo' ? c.person.name : c.kind === 'sitter' ? c.sitter.name : '';
    if (mixing() && c.kind === 'sitter') {
      // your look: every part of it, on whoever is in front
      title.textContent = lookTitle(said()); sub.textContent = 'YOUR LOOK' + (who ? ' · ON ' + who.toUpperCase() : '');
      title.classList.toggle('is-long', title.textContent.length > 26);
    } else { title.textContent = titleOf(c); title.classList.remove('is-long'); sub.textContent = (p?.name || '').toUpperCase() + (who ? ' · ' + who.toUpperCase() : ''); }
    if (!mixing()) shaped(c, true);
    if (!reduced) caption.animate([{ opacity: 0, translate: '0 .6em' }, { opacity: 1, translate: '0 0' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    els.forEach(e => e.removeAttribute('aria-selected')); els[i]?.setAttribute('aria-selected', 'true');
  }
  /** Under the name, how the words shaped it ("longer · parted left"), coming in as it changes. @param {Card} c @param {boolean} [quiet] */
  function shaped(c, quiet = false) {
    const said = c.kind === 'sitter' && c.shape ? controlsOf(c.sitter.face, c.part, c.style, c.shape).map(k => k.short).filter(Boolean).join(' · ')
      : c.kind === 'photo' && c.heard && c.seen && c.shape ? controlsOf(c.seen.face, c.look.part, c.sketch || c.look.style, c.shape).map(k => k.short).filter(Boolean).join(' · ') : '';
    let em = /** @type {HTMLElement | null} */ (title.querySelector('.lb-caption__shape'));
    if (!said) { em?.remove(); return; }
    if (em?.textContent === said) return;
    if (!em) { em = h('em.lb-caption__shape'); title.append(em); }
    em.textContent = said;
    if (!quiet && !reduced) em.animate([{ opacity: 0, translate: '0 .5em', filter: 'blur(3px)' }, { opacity: 1, translate: '0 0', filter: 'blur(0)' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  function turnTo(/** @type {number} */ i, velocity = 0) {
    anim?.stop();
    let target = -i * step; while (target - spin > 180) target -= 360; while (spin - target > 180) target += 360;
    anim = spring({ from: spin, to: target, velocity, stiffness: 120, damping: 20, onUpdate: v => { spin = v; lastMove = performance.now(); place(); }, onRest: () => { spin = ((target % 360) + 360) % 360; place(); } });
  }
  // a finger turns the ring; let go and it comes to rest on the nearest face, carried on a little by the throw
  let from = 0;
  drag(orbit, {
    start: () => { anim?.stop(); from = spin; moved = false; touched = Date.now(); },
    move: d => { if (Math.abs(d.dx) > 6) moved = true; spin = from + d.dx * step / (orbit.clientWidth * .5); lastMove = performance.now(); place(); },
    end: d => {
      touched = Date.now();
      // a tap: the drag held the pointer, so the card under it is found here
      if (!moved) {
        const hit = document.elementFromPoint(d.x, d.y), card = hit?.closest('.lb-card'), i = card ? els.indexOf(/** @type {HTMLElement} */ (card)) : -1;
        if (i >= 0 && i === front && hit?.closest('.lb-card__me')) onMe(i); else if (i >= 0) tap(i);
        return;
      }
      const v = d.vx * step / (orbit.clientWidth * .5), to = Math.round(-(spin + v * .28) / step); turnTo(((to % cards.length) + cards.length) % cards.length, v); setTimeout(() => { moved = false; }, 60); },
  });
  orbit.addEventListener('keydown', e => { if (e.key === 'ArrowRight') turnTo((front + 1) % cards.length); else if (e.key === 'ArrowLeft') turnTo((front - 1 + cards.length) % cards.length); });
  // left alone, it turns by itself, one face at a time
  const turning = setInterval(() => { if (reduced || acting() || document.hidden || el.classList.contains('is-away') || el.classList.contains('is-under') || Date.now() - touched < 7000 || Date.now() - since < (cards[front]?.kind === 'sitter' ? 5600 : held(cards[front]) ? 6200 : 4600)) return; turnTo((front + 1) % cards.length); }, 400);
  // the face in front tries its part's styles on, one after another (a plate redraws its own)
  const redraw = setInterval(() => {
    const c = cards[front], card = els[front]; if (!c || c.kind === 'photo' || c.heard || mixing() || reduced || el.classList.contains('is-away')) return;
    // a sitter tries its other styles on only while someone is there to see them (left alone, the ring turns instead),
    // each given long enough to be seen; a plate simply redraws
    if (c.kind === 'sitter' ? Date.now() - since < 4200 || Date.now() - touched > 7000 : ++tried % 2) return;
    since = Date.now(); card.style.setProperty('--late', '.05s');
    const all = partById(c.part)?.styles || [], next = all[(all.findIndex(s => s.id === c.style) + 1) % all.length];
    c.style = next.id;
    if (c.kind === 'sitter') dress(card, c, cardW()); else { const plate = card.querySelector('.lb-card__plate'); if (plate) plate.innerHTML = plateSVG(c.part, c.style); }
    card.setAttribute('aria-label', titleOf(c)); show(front);
  }, 1300);
  new ResizeObserver(layout).observe(orbit);

  /** A card touched: the front one is chosen, another is turned to the front. @param {number} i */
  const tap = (i) => (i === front ? choose(i) : turnTo(i));
  /** The front card, chosen: its face in the mirror, or its style picked and a face asked for. */
  function choose(/** @type {number} */ i) {
    const c = cards[i]; if (!c) return;
    if (c.kind === 'photo') { open({ person: c.person, look: c.look, picks: c.heard && input.value.trim() ? said() : [cardPick(c)], words: c.heard ? input.value : '', from: els[i] }); return; }
    // a sitter opens in the mirror wearing the look, its face known already: shape it, turn it, then try it on yourself
    if (c.kind === 'sitter' && mixing()) {
      const look = said(), words = input.value;
      if (c.sitter.id === 'you') open({ print: youOf, picks: look, words, face: c.sitter.face, turns: turnsFor.get(youOf), from: els[i] });
      else if (c.sitter.person) open({ person: c.sitter.person, picks: look, words, from: els[i] });
      else open({ person: { id: 'sitter-' + c.sitter.id, name: c.sitter.name, kind: 'drawn', portrait: c.sitter.portrait, looks: [] }, picks: look, words, face: c.sitter.face, hair: c.sitter.hair, from: els[i] });
      return;
    }
    if (c.kind === 'sitter' && c.sitter.id === 'you') { open({ print: youOf, picks: c.heard && input.value.trim() ? said() : [cardPick(c)], words: c.heard ? input.value : '', face: c.sitter.face, turns: turnsFor.get(youOf), from: els[i] }); return; }
    if (c.kind === 'sitter') { open({ person: { id: 'sitter-' + c.sitter.id, name: c.sitter.name, kind: 'drawn', portrait: c.sitter.portrait, looks: [] }, picks: c.heard && input.value.trim() ? said() : [cardPick(c)], words: c.heard ? input.value : '', face: c.sitter.face, hair: c.sitter.hair, from: els[i] }); return; }
    pick(c.part, c.style);
    if (photo) open({ print: photo, picks, words: input.value, from: els[i] }); else pickPhoto(els[i]);
  }
  function choosePart(/** @type {string} */ id) {
    part = part === id ? '' : id;
    parts.querySelectorAll('.lb-part').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-part') === part)));
    styles.classList.toggle('is-shut', !part);
    if (part) {
      const p = partById(part);
      styles.replaceChildren(...(p?.styles || []).map((s, i) => h('button.lb-style', { type: 'button', role: 'option', 'data-style': s.id, style: { '--d': (i * 55) + 'ms' }, 'aria-selected': String(picks.some(q => q.part === part && q.style.id === s.id)), onclick: () => pick(part, s.id) },
        h('span.lb-style__plate', { html: plateSVG(part, s.id) }), h('span.lb-style__name', null, s.name))));
      if (!reduced) styles.animate([{ opacity: 0, translate: '0 30%' }, { opacity: 1, translate: '0 0' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    hintNow();
    if (!mixing()) redeal();
  }
  /** "On me", on the front card: its look picked, and your own face asked for (the camera, or a photo). @param {number} i */
  function onMe(i) {
    const c = cards[i]; if (!c) return;
    const p = c.kind === 'photo' ? c.look.part : c.part, s = c.kind === 'photo' ? c.sketch || c.look.style : c.style;
    if (!picks.some(q => q.part === p && q.style.id === s)) pick(p, s);
    if (photo) open({ print: photo, picks, words: input.value, from: els[i] }); else pickPhoto(els[i]);
  }
  /**
   * A style, picked: one per part, as many parts as you like, all of them worn at once. Shown as a token on the line and
   * a mark on its part; the ring stops dealing looks one by one and shows your look on every face, each change drawn
   * on as it is picked.
   */
  function pick(/** @type {string} */ p, /** @type {string} */ id) {
    const s = styleOf(p, id); if (!s) return;
    const had = picks.find(q => q.part === p), was = mixing();
    picks = had && had.style.id === id ? picks.filter(q => q !== had) : [...picks.filter(q => q.part !== p), { part: p, style: s }];
    parts.querySelectorAll('.lb-part').forEach(b => {
      const id0 = b.getAttribute('data-part') || '', q = picks.find(x => x.part === id0), glyph = b.querySelector('.lb-part__glyph');
      b.classList.toggle('is-picked', !!q);
      if (glyph) glyph.innerHTML = plateSVG(id0, q ? q.style.id : partById(id0)?.styles[0].id || '');
    });
    hintNow();
    if (was || mixing()) {
      tokens.replaceChildren(...picks.map(q => h('button.lb-token', { type: 'button', 'aria-label': 'Remove ' + q.style.name, onclick: () => pick(q.part, q.style.id) }, h('span.lb-token__plate', { html: plateSVG(q.part, q.style.id) }), h('span.lb-token__name', null, q.style.name))));
      styles.querySelectorAll('.lb-style').forEach(b => b.setAttribute('aria-selected', String(picks.some(q => q.part === p && q.style.id === b.getAttribute('data-style')))));
      if (was && mixing()) relook(); else redeal();
    }
  }
  /** Your face, for the look: the live mirror where there is a camera (a photo can be chosen from it), else a photo. */
  async function pickPhoto(/** @type {HTMLElement} */ from = photoBtn) {
    const got = /** @type {{ print: any, picks: any[], from?: Element, face?: any, turns?: import('./live.js').Side[] } | null} */ ((await canLive()) ? await openLive({ picks: livePicks(), keep: picks, fallback: bringPhoto, from }) : await bringPhoto().then(p => (p ? { print: p, picks } : null)));
    if (!got) return;
    photo = got.print; if (got.turns) turnsFor.set(got.print, got.turns); photoBtn.replaceChildren(h('img', { src: URL.createObjectURL(photo.blob), alt: '' })); photoBtn.classList.add('has-photo');
    open({ print: photo, picks: got.picks, words: input.value, from: got.from || from, face: got.face, turns: got.turns });
  }
  // the welcome's sitting, finished: the look it ended on, put on you; or the ring turned to the face wearing it
  on('sitting', (/** @type {{ act: string, person: string, part: string, style: string }} */ s) => {
    if (!s || !el.isConnected) return;
    if (s.act === 'me') { if (!picks.some(q => q.part === s.part && q.style.id === s.style)) pick(s.part, s.style); pickPhoto(); return; }
    const i = cards.findIndex(c => c.kind === 'photo' && c.person.id === s.person && c.look.part === s.part && c.look.style === s.style);
    if (i >= 0) { touched = Date.now(); turnTo(i); }
  });
  /** A card's look, as a pick: its part, its style, and the shape words gave it. @param {Card} c */
  function cardPick(c) {
    const p = c.kind === 'photo' ? c.look.part : c.part, s = styleOf(p, c.kind === 'photo' ? c.sketch || c.look.style : c.style);
    return s ? { part: p, style: s, ...((c.kind !== 'photo' || c.heard) && c.shape && Object.keys(c.shape).length ? { shape: c.shape } : {}) } : null;
  }
  /** What is asked for: the words' looks (each part they name, in the style they name or the one its face wears, shaped as said), and anything picked by hand that they do not name. */
  function said() {
    // the words in the line, and only those: what the line says by itself, with no one there, is not anyone's
    const words = input.value.trim() ? heard : [];
    const fromWords = words.map(x => { const c = cards.find(k => k.heard && partOf(k) === x.part); const s = styleOf(x.part, x.style || (c ? (c.kind === 'photo' ? c.sketch || c.look.style : c.style) : '') || partById(x.part)?.styles[0].id || ''); return s ? { part: x.part, style: s, shape: x.shape } : null; }).filter(q => !!q);
    return [...picks.filter(q => !words.some(x => x.part === q.part)), ...fromWords];
  }
  /** The look the live mirror opens on: what was asked for here, or the one at the front of the ring. */
  function livePicks() {
    if (input.value.trim() || picks.length) return said();
    const q = cards[front] ? cardPick(cards[front]) : null;
    return q ? [q] : [];
  }
  function submit() {
    if (!picks.length && !input.value.trim()) { input.focus(); return; }
    // whose face: yours (the camera, or a photo of it), with what was said already on it
    const mine = photo || (onYou ? youOf : null);
    if (!mine) { pickPhoto(); return; }
    open({ print: mine, picks: said(), words: input.value, from: ask, go: true, ...(mine === youOf ? { face: you?.face, turns: turnsFor.get(youOf) } : {}) });
  }

  // —— words: the line is heard as it is typed, and the ring does what it says ——
  /** @type {import('./words.js').Heard[]} */ let heard = [];
  /** Whether the line is saying things by itself (no one there, the whole ring dealt). */
  const acting = () => !part && !picks.length && !input.value && document.activeElement !== input && !reduced;
  /**
   * Words worn: the first look they name comes to the front (a face already wearing it, or one wearing that part, which
   * changes into it) and is drawn as said, its strokes gliding to the shape; a face the words leave goes back to how it
   * was. @param {string} text
   */
  function wear(text) {
    if (mixing()) { heard = text.trim() ? hear(text, picks[0]?.part || '') : []; relook(); return; }
    const c0 = cards[front];
    heard = text.trim() ? hear(text, c0 ? partOf(c0) : '') : [];
    const x = heard[0], wore = (/** @type {Card} */ c) => (c.kind === 'photo' ? c.look.style : c.base || c.style);
    let i = -1;
    if (x) {
      if (x.style) i = cards.findIndex(c => partOf(c) === x.part && wore(c) === x.style);
      if (i < 0 && c0 && partOf(c0) === x.part) i = front;
      if (i < 0) i = cards.findIndex(c => partOf(c) === x.part);
    }
    cards.forEach((c, k) => {
      if (c.kind === 'photo') { wearPhoto(c, k, k === i ? x : undefined); return; }
      if (k !== i && !c.heard) return;
      const on = k === i && !!x, was = { style: c.style, shape: c.shape || {} };
      if (on && !c.heard) c.base = c.style;
      const style = on ? x.style || c.base || c.style : c.base || c.style, shape = on ? x.shape : {};
      if (style === was.style && JSON.stringify(shape) === JSON.stringify(was.shape) && c.heard === on) return;
      c.style = style; c.shape = shape; c.heard = on; if (!on) delete c.base;
      const card = els[k];
      if (c.kind === 'plate') { const plate = card.querySelector('.lb-card__plate'); if (plate && was.style !== style) plate.innerHTML = plateSVG(c.part, style); }
      else if (was.style !== style) dress(card, c, cardW()); else morph(card, c, was.shape, shape, cardW());
      card.setAttribute('aria-label', titleOf(c));
    });
    if (i >= 0 && i !== front) turnTo(i);
    else if (cards[front]) { const c = cards[front], t = title.firstChild; if (t && t.nodeType === 3) t.textContent = titleOf(c); else title.prepend(titleOf(c)); shaped(c); }
  }
  /**
   * A render worn by words: the face it was made from, with what they say sketched on it (the card says Sketch, and the
   * render steps aside), until the words let it go and the render comes back. Its face must have been read first.
   * @param {Card & { kind: 'photo' }} c @param {number} k @param {import('./words.js').Heard | undefined} x
   */
  function wearPhoto(c, k, x) {
    const on = !!x && !!c.seen, card = els[k];
    if (!card || (!on && !c.heard)) return;
    const style = x && on ? x.style || c.sketch || c.look.style : '', shape = x && on ? x.shape || {} : {}, was = { style: c.sketch || '', shape: c.shape || {} };
    if (on && c.heard && style === was.style && JSON.stringify(shape) === JSON.stringify(was.shape)) return;
    c.heard = on; c.sketch = on ? style : undefined; c.shape = on ? shape : undefined;
    card.classList.toggle('is-sketched', on);
    const tag = card.querySelector('.lb-card__tag');
    if (tag) {
      const label = tagOf(c);
      tag.textContent = label;
      tag.toggleAttribute('hidden', label === 'GPT Image');
    }
    card.setAttribute('aria-label', titleOf(c));
    if (!on) { dressing.set(card, (dressing.get(card) || 0) + 1); morphs.set(card, (morphs.get(card) || 0) + 1); card.querySelector('.lb-card__sketch')?.remove(); card.querySelectorAll('.lb-card__wash, .lb-card__paint').forEach(x => x.remove()); return; }
    // asked for now, so drawn now
    card.style.setProperty('--late', '.05s');
    const s = worn(c);
    if (was.style !== style || !card.querySelector('.lb-card__sketch')) dress(card, s, cardW()); else morph(card, s, was.shape, shape, cardW());
  }
  /** Words that name a look one of the studio's people wears: the ring turns to them, and nothing is drawn over it. @param {string} text */
  function seek(text) {
    const x = hear(text, '')[0]; if (!x?.style) return;
    const i = cards.findIndex(c => c.kind === 'photo' && c.look.part === x.part && c.look.style === x.style);
    if (i >= 0 && i !== front) turnTo(i);
  }
  /** Typed: heard at once, and the ring holds still for whoever is typing. */
  function listen() { touched = Date.now(); wear(input.value); }
  input.addEventListener('input', listen);
  function away() { el.classList.add('is-away'); el.setAttribute('inert', ''); }

  // the line, saying what could be asked, one thing after another. Over the studio's own pictures it names the looks
  // they wear and the ring turns to each: they are the real thing, and nothing is sketched over them
  let say = 0, typed = 0;
  const renders = () => cards.length > 0 && cards.every(c => c.kind === 'photo');
  const sayings = () => (renders() ? [...new Set(cards.map(c => (c.kind === 'photo' ? lookName(c.look.part, c.look.style) : '')).filter(Boolean))] : SAYINGS);
  const typing = setInterval(() => {
    // beside picks, only that more can be said
    if (picks.length) { if (!input.value) { input.placeholder = fitting(input, ['Say more…', 'More…']); if (heard.length) wear(''); } typed = 0; return; }
    if (document.activeElement === input || input.value || reduced) { input.placeholder = reduced ? SAYINGS[0] : input.placeholder; return; }
    const list = sayings(), s = list[say % list.length] || SAYINGS[0]; typed++;
    if (typed <= s.length) {
      input.placeholder = s.slice(0, typed);
      // left alone, what the line says is done: the face it names turns to the front and wears it, as it is said
      if (acting() && Date.now() - touched > 7000 && hear(s.slice(0, typed)).length) (renders() ? seek(s.slice(0, typed)) : wear(s.slice(0, typed)));
    } else if (typed > s.length + 48) { typed = 0; say++; }
  }, 70);

  redeal();

  // —— you, in the ring: once there is a photo of you, every look in it can be on you ——
  /** @type {Sitter | null} */ let you = null;
  /** @type {any} */ let youOf = null, pending = null;
  let onYou = false, wantYou = false;
  /** The sides of you caught with a photo, for the mirror to turn through. @type {WeakMap<object, any[]>} */
  const turnsFor = new WeakMap();
  /** The ring's cards dealt again, the same looks on whoever the ring is on now. */
  function redeal() { Promise.all([examples(), sitters()]).then(([m, ss]) => deal(mixing() ? lookCards(m, ss, said(), onYou ? you : null, redealSoon) : cardsFor(m, ss, part, onYou ? you : null))); }
  let soon = 0;
  /** Dealt again a moment from now (the studio's people, read since): once, however many are read. */
  const redealSoon = () => { clearTimeout(soon); soon = setTimeout(() => { if (mixing()) redeal(); }, 400); };
  /** Your look, worn again by every card where it is: what was picked, and what the words say. */
  function relook() {
    const look = said();
    if (!look.length) { redeal(); return; }
    cards.forEach((c, k) => {
      if (c.kind !== 'sitter') return;
      const [first, ...rest] = look, next = { part: first.part, style: first.style.id, shape: first.shape, more: rest.map(q => ({ part: q.part, style: q.style.id, shape: q.shape })) };
      if (JSON.stringify([c.part, c.style, c.shape, c.more]) === JSON.stringify([next.part, next.style, next.shape, next.more])) return;
      Object.assign(c, next);
      if (k === front) els[k].style.setProperty('--late', '.05s');
      aim(els[k], c); dress(els[k], c, cardW());
      els[k].setAttribute('aria-label', lookTitle(look) + ' on ' + c.sitter.name);
    });
    show(front);
  }
  /** What the line over the parts says: what they are for, and what to do next. */
  function hintNow() {
    hint.textContent = !picks.length ? (part ? 'Touch a style to put it on' : 'Mix a look: pick from as many parts as you like')
      : picks.length === 1 ? 'Add another part: they all go on together' : 'Your look, on every face. Touch one to open it';
  }
  hintNow();
  /** Whose faces the ring's looks are on. @param {boolean} yours */
  function whose(yours) {
    onYou = yours && !!you;
    whoseEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((/** @type {HTMLElement} */ (b).dataset.who === 'you') === onYou)));
    redeal();
  }
  /** Whether the mirror (or the camera) is over the ring. */
  const covered = () => !!stage().querySelector('section.mr, section.lv');
  /**
   * You as the ring's sitter, from a photo of you: the picture at the size the ring needs, your face read in it, your
   * hair found (not a beard, not the brows), and a small round of your face for the switch. Shown at once when the
   * photo is new and you come back to the ring; from an earlier visit, only offered.
   * @param {any} print
   */
  async function prepareYou(print) {
    if (youOf === print || pending === print) return;
    pending = print;
    const c = await P.fromBlob(print.blob, 1024).catch(() => null);
    const f = c && pending === print ? await faceOf(c).catch(() => null) : null;
    const [portrait, mask] = c && f && pending === print ? await Promise.all([P.toBlob(c, 'image/jpeg', .9), maskOf(c, f, 'colour').catch(() => null)]) : [null, null];
    if (pending !== print) return;
    pending = null;
    // no face found in it: the ring stays as it was
    if (!c || !f || !portrait) return;
    if (you) URL.revokeObjectURL(you.portrait);
    youOf = print; you = { id: 'you', name: 'You', portrait: URL.createObjectURL(portrait), w: c.width, h: c.height, face: f, hair: mask ? mask.toDataURL('image/png') : null };
    const [bx, by, bw, bh] = f.box, s = Math.max(bw, bh) * 1.3, t = document.createElement('canvas'); t.width = t.height = 96;
    t.getContext('2d')?.drawImage(c, bx + bw / 2 - s / 2, by + bh * .45 - s / 2, s, s, 0, 0, 96, 96);
    me.src = t.toDataURL('image/jpeg', .85);
    whoseEl.hidden = false;
    if (onYou) redeal(); else if (wantYou && !covered()) { wantYou = false; whose(true); }
  }
  // a photo of you, kept (by the camera, or chosen): read once the mirror has settled, and the ring yours when you come back
  on('item', (/** @type {any} */ it) => {
    const p = it?.mine && it.type === 'prints' ? printById(it.prints?.[0]) : null;
    if (p?.provenance?.kind === 'photo') { wantYou = true; setTimeout(() => prepareYou(p), 2400); }
  });
  on('print:gone', (/** @type {string} */ id) => { if (youOf?.id === id) { you = null; youOf = null; whoseEl.hidden = true; if (onYou) whose(false); } });
  new MutationObserver(() => { if (wantYou && you && !covered()) { wantYou = false; whose(true); } }).observe(stage(), { childList: true });
  // from an earlier visit, the last photo of you: offered, not shown
  const last = [...app.prints.values()].filter(p => p?.provenance?.kind === 'photo').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  if (last) setTimeout(() => prepareYou(last), 1800);
  return { el };
}

/**
 * The ring's cards: every look on every face, the faces taking turns; until there are some, the drawn sitters wearing
 * looks (a part's styles all on one face, when only that part is asked for); failing those, the drawn plates.
 * @param {{ people: Person[] }} m @param {Sitter[]} ss @param {string} part
 */
function cardsFor(m, ss, part, who = /** @type {Sitter | null} */ (null)) {
  if (who) return (part ? (partById(part)?.styles || []).map(s => [part, s.id]) : PLATES).map(([p, s]) => /** @type {Card} */ ({ kind: 'sitter', sitter: who, part: p, style: s }));
  const looks = (m.people || []).map(p => (p.looks || []).filter(l => !part || l.part === part).map(look => /** @type {Card} */ ({ kind: 'photo', person: p, look })));
  const out = []; for (let k = 0; looks.some(l => l[k]); k++) for (const l of looks) if (l[k]) out.push(l[k]);
  if (out.length >= 3) return out.slice(0, 12);
  const by = new Map(ss.map(s => [s.id, s]));
  const plates = part ? (partById(part)?.styles || []).map(s => [part, s.id, SITS[part]]) : PLATES;
  return plates.map(([p, s, who]) => { const sitter = by.get(who); return /** @type {Card} */ (sitter ? { kind: 'sitter', sitter, part: p, style: s } : { kind: 'plate', part: p, style: s }); });
}

/** A share of a whole, as a CSS percentage. @param {number} v */
const pc = (v) => (v * 100).toFixed(3) + '%';
/**
 * Where a card looks on a sitter, as boxes in the picture's pixels ([x, y, w, h], 3 by 4): the head and shoulders, and
 * the part itself, which the card in front leans in on.
 * @param {import('../studio/face.js').Face} f @param {string} part
 */
function framing(f, part) {
  const [bx, by, bw, bh] = f.box, P = (/** @type {number} */ i) => f.pts[i], cx = bx + bw / 2;
  const fit = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ tall) => {
    let hh = Math.min(tall, f.h), ww = hh * .75; if (ww > f.w) { ww = f.w; hh = ww / .75; }
    return [Math.max(0, Math.min(f.w - ww, x - ww / 2)), Math.max(0, Math.min(f.h - hh, y - hh / 2)), ww, hh];
  };
  const eyes = (P(159).y + P(386).y) / 2, brows = (P(105).y + P(334).y) / 2, mouth = (P(13).y + P(14).y) / 2;
  const head = fit(cx, by + bh * .42, bh * 2.3);
  const near = ({ bangs: fit(cx, by + bh * .3, bh * 1.5), brows: fit(cx, (brows + eyes) / 2, bh * .95), lashes: fit(cx, eyes, bh * .8), lips: fit(P(13).x, mouth - bh * .1, bh * .95), beard: fit(cx, (P(1).y + P(152).y) / 2 + bh * .06, bh * 1.15) })[part] || head;
  return { head, near };
}
/**
 * A picture framed on the head, inside a lens that leans in on the part when the card is in front.
 * @param {import('../studio/face.js').Face} f @param {string} part @param {string} src
 */
function lensOf(f, part, src) {
  const { head, near } = framing(f, part);
  const face = h('div.lb-card__face', { style: { width: pc(f.w / head[2]), height: pc(f.h / head[3]), left: pc(-head[0] / head[2]), top: pc(-head[1] / head[3]) } }, h('img.lb-card__portrait', { src, alt: '', draggable: false }));
  return h('div.lb-card__lens', { style: { '--s': (head[2] / near[2]).toFixed(4), '--tx': pc(-(near[0] - head[0]) / head[2]), '--ty': pc(-(near[1] - head[1]) / head[3]) } }, face);
}
/** A sitter's card: close on its part, or on the head when it wears more than one. @param {{ sitter: Sitter, part: string, more?: Worn1[] }} c */
const sitterCard = (c) => lensOf(c.sitter.face, c.more?.length ? '' : c.part, c.sitter.portrait);
/** Where a sitter's card leans in, again, after what it wears has changed. @param {HTMLElement} card @param {{ sitter: Sitter, part: string, more?: Worn1[] }} c */
function aim(card, c) {
  const lens = /** @type {HTMLElement | null} */ (card.querySelector('.lb-card__lens')); if (!lens) return;
  const f = c.sitter.face, { head, near } = framing(f, c.more?.length ? '' : c.part);
  lens.style.setProperty('--s', (head[2] / near[2]).toFixed(4)); lens.style.setProperty('--tx', pc(-(near[0] - head[0]) / head[2])); lens.style.setProperty('--ty', pc(-(near[1] - head[1]) / head[3]));
}
/** The noun a style's name needs to say what it is ("Red" lips, "Copper" hair). */
/** What a whole look is called: "Curtain bangs · Red lips · Copper hair". @param {{ part: string, style: { id: string } }[]} look */
const lookTitle = (look) => look.map(q => lookName(q.part, q.style.id)).filter(Boolean).join(' · ');
/**
 * The ring wearing your look: each of its faces wearing all of it, sketched on the device. The studio's people once their
 * faces are read (they are read now, and the ring dealt again as they are), until then the drawn sitters; you first,
 * when the ring is on you.
 * @param {{ people: Person[] }} m @param {Sitter[]} ss @param {{ part: string, style: { id: string }, shape?: Record<string, number> }[]} look
 * @param {Sitter | null} who @param {() => void} onRead
 * @returns {Card[]}
 */
function lookCards(m, ss, look, who, onRead) {
  if (!look.length) return [];
  /** @type {Sitter[]} */ const read = [];
  for (const p of m.people || []) { const s = seen.get(p.portrait); if (s) read.push({ id: p.id, name: p.name || '', portrait: p.portrait, w: s.face.w, h: s.face.h, face: s.face, hair: s.hair, person: p }); else readPerson(p).then(got => { if (got) onRead(); }); }
  const faces = [...(who ? [who] : []), ...(read.length >= 3 ? read : ss)].slice(0, 8), [first, ...rest] = look;
  return faces.map(sitter => /** @type {Card} */ ({ kind: 'sitter', sitter, part: first.part, style: first.style.id, shape: first.shape, more: rest.map(q => ({ part: q.part, style: q.style.id, shape: q.shape })) }));
}
/** What a card's corner says it is. @param {Card} c */
const tagOf = (c) => (c.kind === 'photo' ? (c.heard ? 'Sketch' : c.person.kind === 'render' ? 'GPT Image' : 'Simulated') : c.kind === 'sitter' && c.sitter.id === 'you' ? 'Sketch' : 'Drawn');
/** The part a card changes. @param {Card} c */
const partOf = (c) => (c.kind === 'photo' ? c.look.part : c.part);
/** Whether a card is a render framed on its face (given longer in front: it leans in before the look sweeps in). @param {Card | undefined} c */
const held = (c) => c?.kind === 'photo' && !!c.seen;
/**
 * A render's card: its portrait, and the look sweeping in over it. Once the face is read, both are framed on the head as
 * a sitter is (the sweep stays the card's own, so it crosses the card however close the lens is).
 * @param {Card & { kind: 'photo' }} c
 */
function photoCard(c) {
  if (!c.seen) return [h('img.lb-card__before', { src: c.person.portrait, alt: '', draggable: false }), h('img.lb-card__after', { src: c.look.image, alt: '', draggable: false })];
  return [lensOf(c.seen.face, c.look.part, c.person.portrait), h('div.lb-card__after', null, lensOf(c.seen.face, c.look.part, c.look.image))];
}
/**
 * A render's card, framed where it is once its face is read: from the whole picture, as it was shown, the frame closes
 * on the head (and leans in on the part, if the card is in front).
 * @param {HTMLElement} card @param {Card & { kind: 'photo' }} c
 */
function frameCard(card, c) {
  const got = photoCard(c), faces = got.map(x => /** @type {HTMLElement} */ (x.querySelector('.lb-card__face')));
  const to = faces.map(f => ({ left: f.style.left, top: f.style.top, width: f.style.width, height: f.style.height }));
  if (!reduced) { faces.forEach(f => Object.assign(f.style, { left: '0%', top: '0%', width: '100%', height: '100%' })); card.classList.add('is-framing'); }
  card.querySelector('.lb-card__before')?.replaceWith(got[0]); card.querySelector('img.lb-card__after')?.replaceWith(got[1]);
  card.classList.add('has-face');
  if (!reduced) requestAnimationFrame(() => requestAnimationFrame(() => { faces.forEach((f, k) => Object.assign(f.style, to[k])); card.classList.remove('is-framing'); }));
}
/** A render's card as a sitter wearing what words sketch on it, to be dressed as sitters are. @param {Card & { kind: 'photo' }} c */
function worn(c) {
  const s = /** @type {Seen} */ (c.seen);
  return { sitter: { id: c.person.id, name: c.person.name || '', portrait: c.person.portrait, w: s.face.w, h: s.face.h, face: s.face, hair: s.hair, person: c.person }, part: c.look.part, style: c.sketch || c.look.style, shape: c.shape };
}
/** @type {Map<string, Promise<Seen | null>>} */
const reading = new Map();
/** @type {Map<string, Seen>} what has been read, by portrait */
const seen = new Map();
/**
 * A render's face read on the device, and its hair (for a colour washed in, and for the tones a fringe or a beard is
 * painted in): what a drawn sitter brings with it already read. @param {Person} p @returns {Promise<Seen | null>}
 */
function readPerson(p) {
  if (!reading.has(p.portrait)) reading.set(p.portrait, (async () => {
    const img = await picture(p.portrait).catch(() => null); if (!img) return null;
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).drawImage(img, 0, 0);
    const face = await faceOf(c); if (!face) return null;
    const mask = await hairOf(c).catch(() => null);
    /** @type {Seen} */ const got = { face, hair: mask ? URL.createObjectURL(await P.toBlob(mask, 'image/png')) : null };
    seen.set(p.portrait, got);
    return got;
  })());
  return /** @type {Promise<Seen | null>} */ (reading.get(p.portrait));
}
const dressing = new WeakMap();
/**
 * A sitter wearing a look. On a drawing, the strokes the mirror would draw, at least thick enough to be seen at the
 * card's size. On a photograph (the studio's people, or you) a pen would be a line drawn over someone, so what can be is
 * painted from the picture itself (a fringe in their own hair, brows in their own colour, liner, a beard) and only a cut
 * is still a line, a fine one. A colour (lips, hair) is washed in from the picture, the way the mirror does it.
 * @param {HTMLElement} card @param {{ sitter: Sitter, part: string, style: string, shape?: Record<string, number>, more?: Worn1[] }} c @param {number} cw the card's width, drawn
 */
async function dress(card, c, cw) {
  const face = card.querySelector('.lb-card__face'); if (!face) return;
  const f = c.sitter.face, all = [{ part: c.part, style: c.style, shape: c.shape }, ...(c.more || [])];
  const { near } = framing(f, all.length > 1 ? '' : c.part), least = 1.6 * near[2] / Math.max(80, cw), turn = (dressing.get(card) || 0) + 1;
  dressing.set(card, turn);
  face.querySelector('.lb-card__sketch')?.remove();
  const photo = !!c.sitter.person || c.sitter.id === 'you', painted = photo ? all.filter(q => PAINTED.has(q.part)) : [];
  if (!painted.length) face.querySelector('.lb-card__paint')?.remove();
  // the colours it wore stay until the new ones are ready (none to come: they go now)
  const old = [...face.querySelectorAll('.lb-card__wash')], tinted = all.filter(q => tintOf(q.part, q.style, q.shape?.shade || 0));
  if (!tinted.length) old.forEach(w => w.remove());
  const strokes = all.filter(q => !painted.includes(q)).flatMap(q => markup(f, q.part, q.style, q.shape));
  // over a photograph the line that is left (a cut) is finer, a pencil on a print rather than a pen on a drawing
  const width = (/** @type {number} */ w) => (photo ? Math.max(w * .8, least * .75) : Math.max(w * 1.25, least));
  // however many strokes a look takes, it is drawn in about the same time
  if (strokes.length) face.insertAdjacentHTML('beforeend', '<svg class="lb-card__sketch' + (photo ? ' is-fine' : '') + '" viewBox="0 0 ' + f.w + ' ' + f.h + '" preserveAspectRatio="none" aria-hidden="true" style="--step:' + Math.min(40, 700 / Math.max(1, strokes.length)).toFixed(1) + 'ms">'
    + strokes.map((s, k) => '<path d="' + s.d + '" pathLength="1" stroke-width="' + width(s.w).toFixed(2) + '" style="--k:' + k + '"/>').join('') + '</svg>');
  if (painted.length) paintCard(card, face, c, all, cw, near, turn);
  // each colour it wears (the lips, the hair), washed in over its own part; put in together, in place of the ones before
  const washes = [];
  for (const q of tinted) {
    const tint = tintOf(q.part, q.style, q.shape?.shade || 0), box = framing(f, q.part).near, wash = await sitterWash(c.sitter, q.part, tint, box, cw);
    if (dressing.get(card) !== turn) return;
    if (!wash) continue;
    wash.className = 'lb-card__wash' + (old.length ? ' is-again' : '');
    Object.assign(wash.style, { left: pc(box[0] / f.w), top: pc(box[1] / f.h), width: pc(box[2] / f.w), height: pc(box[3] / f.h) });
    washes.push(wash);
  }
  if (tinted.length) { old.forEach(w => w.remove()); const at = face.querySelector('.lb-card__paint') || face.querySelector('.lb-card__sketch'); washes.forEach(w => face.insertBefore(w, at)); }
}
/**
 * Heavy drawing waits its turn: one card at a time with a frame between, so the ring keeps moving while faces are
 * painted; the card in front first, and a card dressed again since it asked dropped without a wait.
 * @type {{ card: HTMLElement, alive: () => boolean, fn: () => any, done: (v: any) => void }[]}
 */
const queue = [];
let draining = false;
/** @template T @param {HTMLElement} card @param {() => boolean} alive @param {() => Promise<T> | T} fn @returns {Promise<T | null>} */
function inTurn(card, alive, fn) { return new Promise(done => { queue.push({ card, alive, fn, done }); drain(); }); }
async function drain() {
  if (draining) return; draining = true;
  try {
    while (queue.length) {
      for (let i = queue.length - 1; i >= 0; i--) if (!queue[i].alive() || !queue[i].card.isConnected) queue.splice(i, 1)[0].done(null);
      if (!queue.length) break;
      await new Promise(r => requestAnimationFrame(() => r(null)));
      const i = queue.findIndex(j => j.card.classList.contains('is-front')), [job] = queue.splice(Math.max(0, i), 1);
      if (!job) continue;
      if (!job.alive()) { job.done(null); continue; }
      try { job.done(await job.fn()); } catch { job.done(null); }
    }
  } finally { draining = false; }
}
/** A sitter's colours, read from its picture once: its hair (where it was found), its brows, its skin. @type {Map<string, Promise<ReturnType<typeof coloursOf>>>} */
const colours = new Map();
/**
 * A look painted over a photograph's card, under its pencil and over its washes: in the hair's own colour, or the one
 * the look dyes it, falling into place from the top.
 * @param {HTMLElement} card @param {Element} face @param {{ sitter: Sitter }} c @param {Worn1[]} all @param {number} cw @param {number[]} near @param {number} turn
 */
async function paintCard(card, face, c, all, cw, near, turn) {
  const f = c.sitter.face, s = c.sitter;
  const got = await inTurn(card, () => dressing.get(card) === turn, async () => {
    const img = await picture(s.portrait).catch(() => null); if (!img || dressing.get(card) !== turn) return null;
    if (!colours.has(s.portrait)) colours.set(s.portrait, (async () => coloursOf(img, f, s.hair ? await picture(s.hair).catch(() => null) : null))());
    const tone = await colours.get(s.portrait), dyed = all.find(q => q.part === 'colour'), dye = dyed ? tintOf('colour', dyed.style, dyed.shape?.shade || 0) : '';
    if (dressing.get(card) !== turn || !tone) return null;
    const { head } = framing(f, ''), k = Math.min(1.6, 2 * cw / near[2]);
    return { canvas: paintLook(img, f, all, head, k, { ...tone, dye: dye || '' }), head };
  });
  if (!got?.canvas || dressing.get(card) !== turn || !card.isConnected) return;
  const { canvas, head } = got, was = face.querySelector('.lb-card__paint');
  canvas.className = 'lb-card__paint'; canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { left: pc(head[0] / f.w), top: pc(head[1] / f.h), width: pc(head[2] / f.w), height: pc(head[3] / f.h) });
  // the look it wore until now stays until this one is ready, then this one takes its place (and falls in only when new)
  if (was) { if (card.classList.contains('is-front')) canvas.classList.add('is-again'); was.replaceWith(canvas); } else face.insertBefore(canvas, face.querySelector('.lb-card__sketch'));
}
/** Past the mark and back, a little: how a shape settles. @param {number} t */
const overshoot = (t) => { const u = t - 1; return 1 + 2.4 * u * u * u + 1.4 * u * u; };
const morphs = new WeakMap();
/**
 * A sitter's look, reshaped where it is: the same strokes glide to the new shape (a little past it, and back), and its
 * colour, if it has one, comes in at the new shade once they are there.
 * @param {HTMLElement} card @param {{ sitter: Sitter, part: string, style: string, shape?: Record<string, number> }} c
 * @param {Record<string, number>} from @param {Record<string, number>} to @param {number} cw
 */
function morph(card, c, from, to, cw) {
  const paths = [...card.querySelectorAll('.lb-card__sketch path')], id = (morphs.get(card) || 0) + 1, t0 = performance.now(), D = reduced ? 0 : 620;
  morphs.set(card, id);
  const keys = [...new Set([...Object.keys(from), ...Object.keys(to)])];
  const frame = (/** @type {number} */ now) => {
    if (morphs.get(card) !== id) return;
    const t = D ? Math.min(1, (now - t0) / D) : 1, e = overshoot(t);
    const strokes = markup(c.sitter.face, c.part, c.style, Object.fromEntries(keys.map(k => [k, (from[k] || 0) + ((to[k] || 0) - (from[k] || 0)) * e])));
    if (strokes.length !== paths.length) { dress(card, c, cw); return; }
    strokes.forEach((s, k) => paths[k].setAttribute('d', s.d));
    if (t < 1) requestAnimationFrame(frame); else if (tintOf(c.part, c.style)) rewash(card, c, cw);
  };
  requestAnimationFrame(frame);
}
/** A sitter's colour, washed in again at its shade, over the one it had. @param {HTMLElement} card @param {{ sitter: Sitter, part: string, style: string, shape?: Record<string, number> }} c @param {number} cw */
async function rewash(card, c, cw) {
  const face = card.querySelector('.lb-card__face'), tint = tintOf(c.part, c.style, c.shape?.shade || 0); if (!face || !tint) return;
  const f = c.sitter.face, { near } = framing(f, c.part), turn = (dressing.get(card) || 0) + 1; dressing.set(card, turn);
  const wash = await sitterWash(c.sitter, c.part, tint, near, cw), old = face.querySelector('.lb-card__wash');
  if (!wash || dressing.get(card) !== turn) return;
  wash.className = 'lb-card__wash';
  Object.assign(wash.style, { left: pc(near[0] / f.w), top: pc(near[1] / f.h), width: pc(near[2] / f.w), height: pc(near[3] / f.h) });
  face.insertBefore(wash, face.querySelector('.lb-card__sketch'));
  if (old && !reduced) wash.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' }).finished.then(() => old.remove(), () => old.remove()); else old?.remove();
}
/** @type {Map<string, Promise<HTMLImageElement>>} */
const pictures = new Map();
const picture = (/** @type {string} */ src) => {
  if (!pictures.has(src)) pictures.set(src, new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }));
  return /** @type {Promise<HTMLImageElement>} */ (pictures.get(src));
};
/**
 * The colour on a sitter, over the box the card leans in on: the picture there, coated, and kept only on the lips (not
 * the mouth between them) or the hair (not a beard, not the brows).
 * @param {Sitter} s @param {string} part @param {string} tint @param {number[]} box @param {number} cw
 */
async function sitterWash(s, part, tint, box, cw) {
  const got = await Promise.all([picture(s.portrait), part === 'colour' && s.hair ? picture(s.hair) : null]).catch(() => null);
  if (!got || (part === 'colour' && !got[1])) return null;
  const [img, hair] = got, k = Math.min(1.5, 2 * cw / box[2]), w = Math.round(box[2] * k), hh = Math.round(box[3] * k);
  const c = document.createElement('canvas'), m = document.createElement('canvas'); c.width = m.width = w; c.height = m.height = hh;
  const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), mx = /** @type {CanvasRenderingContext2D} */ (m.getContext('2d'));
  x.drawImage(img, box[0], box[1], box[2], box[3], 0, 0, w, hh);
  mx.setTransform(k, 0, 0, k, -box[0] * k, -box[1] * k);
  const shape = (/** @type {{ x: number, y: number }[][]} */ rings, /** @type {CanvasFillRule} */ rule) => { mx.beginPath(); for (const r of rings) r.forEach((p, i) => (i ? mx.lineTo(p.x, p.y) : mx.moveTo(p.x, p.y))); mx.fill(rule); };
  mx.fillStyle = '#fff';
  if (hair) {
    mx.drawImage(hair, 0, 0, s.w, s.h);
    mx.globalCompositeOperation = 'destination-out'; mx.filter = 'blur(2px)'; const sh = shapesOf(s.face);
    for (const r of [...sh.beard, ...sh.brows]) shape([r], 'nonzero');
  } else { mx.filter = 'blur(1.5px)'; shape([LIPS.map(i => s.face.pts[i]), MOUTH.map(i => s.face.pts[i])], 'evenodd'); }
  // hair on a photograph is dyed strand by strand (its own light kept); lips, and the drawn sitters, are coated
  if (part === 'colour' && s.person || part === 'colour' && s.id === 'you') dyeHair(x, tint, m); else coat(x, tint, part);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(m, 0, 0);
  return c;
}
