/**
 * Where you are, and the way back. Every screen and every step inside one is an entry in the browser's history, so the
 * phone's back gesture, the browser's back button and the app's own ← all do the same thing; an address (#/mine,
 * #/create/princess) opens the screen it names. Screens are stacked: the one below stays as it was (its scroll, its
 * carousel), so going back is instant.
 *
 * A screen is a function of its params that returns { el, step?(name), shown?(), left?() }.
 */
import { screens } from './dom.js';
import { reduced } from './motion.js';
import { emit } from './bus.js';

/** @typedef {{ el: HTMLElement, step?: (name: string) => void, shown?: () => void, left?: () => void, keep?: boolean }} Screen */
/** @typedef {{ i: number, name: string, params: Record<string, any>, step: string, screen: Screen | null }} Entry */

/** @type {Record<string, (params: Record<string, any>) => Screen>} */
const routes = {};
/** @type {Entry[]} */
const stack = [];
let seq = 0;
/** The screens that have no screen of their own: the desk under everything (nothing on top of it is the desk). */
const BARE = new Set(['desk']);

/** @param {string} name @param {(params: Record<string, any>) => Screen} make */
export function define(name, make) { routes[name] = make; }

export const current = () => stack[stack.length - 1] || null;
export const here = () => current()?.name || '';

/** The address for an entry: #/name/param. @param {string} name @param {Record<string, any>} params */
const address = (name, params) => '#/' + [name === 'home' ? '' : name, params.id || ''].filter(Boolean).join('/');
const state = (/** @type {Entry} */ e) => ({ likeness: true, i: e.i, name: e.name, params: e.params, step: e.step });

/**
 * Opens a screen on top of this one (or, with replace, in its place).
 * @param {string} name @param {Record<string, any>} [params] @param {{ replace?: boolean }} [o]
 */
export function go(name, params = {}, { replace = false } = {}) {
  const top = current();
  if (top && top.name === name && JSON.stringify(top.params) === JSON.stringify(params) && !top.step) return;
  /** @type {Entry} */ const e = { i: ++seq, name, params, step: '', screen: null };
  if (replace && top) { stack.pop(); close(top, 'replace'); }
  // a tab (home, mine, the desk) is a fresh start: what was stacked under it is put away
  const tab = name === 'home' || name === 'mine' || name === 'desk';
  if (tab) while (stack.length) close(/** @type {Entry} */ (stack.pop()), 'replace');
  stack.push(e);
  (replace ? history.replaceState : history.pushState).call(history, state(e), '', address(name, params));
  show(e, 'forward', !tab && !replace);
}

/** A step inside the screen on top (the create flow's photo, tune, paint): its own entry in the history. @param {string} step */
export function step(step) {
  const top = current(); if (!top || top.step === step) return;
  top.step = step;
  history.pushState(state(top), '', address(top.name, top.params));
}

/** The step on top, said again without a new entry (a finished painting's step becomes its result). @param {string} step */
export function restep(step) {
  const top = current(); if (!top) return;
  top.step = step;
  history.replaceState(state(top), '', address(top.name, top.params));
}

/** Back one: a step, or a screen; from the first screen, home. */
export function back() {
  if (history.state?.likeness && stack.length > 1 || current()?.step) history.back();
  else go('home', {}, { replace: true });
}

/** Mounts an entry's screen, or brings it back. @param {Entry} e @param {'forward' | 'back'} way @param {boolean} [animate] */
function show(e, way, animate = true) {
  const make = routes[e.name] || routes.home;
  if (!e.screen) {
    e.screen = make(e.params);
    const el = e.screen.el;
    if (el) {
      el.classList.add('nav-screen');
      screens().append(el);
      if (animate && !reduced) el.animate(way === 'forward'
        ? [{ opacity: 0, transform: 'translateX(6cqw)' }, { opacity: 1, transform: 'none' }]
        : [{ opacity: 0, transform: 'translateX(-4cqw)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  } else if (e.screen.el) { e.screen.el.hidden = false; e.screen.el.inert = false; }
  for (const below of stack) if (below !== e && below.screen?.el) { below.screen.el.inert = true; hideLater(below.screen.el); }
  document.documentElement.dataset.screen = e.name;
  if (e.step) e.screen.step?.(e.step);
  e.screen.shown?.();
  emit('nav', e.name);
}
/** A screen under another is hidden once the one above has come in (so it is never seen to vanish). @param {HTMLElement} el */
function hideLater(el) { setTimeout(() => { if (el.inert) el.hidden = true; }, reduced ? 0 : 320); }

/** Takes a screen away. @param {Entry} e @param {string} why */
function close(e, why) {
  const s = e.screen; e.screen = null; if (!s) return;
  s.left?.();
  const el = s.el; if (!el) return;
  if (reduced || why === 'replace' || el.hidden) { el.remove(); return; }
  el.inert = true;
  el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(8cqw)' }], { duration: 220, easing: 'cubic-bezier(.4,0,1,1)' }).finished.then(() => el.remove(), () => el.remove());
}

/** The phone's back (or forward) moved through the history: follow it. */
addEventListener('popstate', ev => {
  const s = ev.state;
  if (!s?.likeness) { go('home', {}, { replace: true }); return; }
  const at = stack.findIndex(e => e.i === s.i);
  if (at >= 0) {
    while (stack.length - 1 > at) close(/** @type {Entry} */ (stack.pop()), 'back');
    const e = stack[at];
    const stepChanged = e.step !== s.step;
    e.step = s.step || '';
    if (!e.screen || e.screen.el?.hidden || e.screen.el?.inert) show(e, 'back');
    else if (stepChanged) e.screen.step?.(e.step);
    return;
  }
  // an entry this page no longer holds (after a reload, or forward again): opened fresh
  /** @type {Entry} */ const e = { i: s.i, name: s.name, params: s.params || {}, step: s.step || '', screen: null };
  seq = Math.max(seq, s.i);
  const tab = e.name === 'home' || e.name === 'mine' || e.name === 'desk';
  if (tab) while (stack.length) close(/** @type {Entry} */ (stack.pop()), 'replace');
  stack.push(e); show(e, 'forward', !tab);
});

/** The screen the address asks for when the page opens (#/mine, #/create/princess), or home. */
export function start(fallback = 'home') {
  const [name = '', id = ''] = location.hash.replace(/^#\/?/, '').split('/');
  const known = name && routes[name] ? name : fallback;
  /** @type {Entry} */ const e = { i: ++seq, name: known, params: id ? { id } : {}, step: '', screen: null };
  stack.push(e);
  history.replaceState(state(e), '', address(e.name, e.params));
  show(e, 'forward', false);
}
export const isBare = (/** @type {string} */ name) => BARE.has(name);
