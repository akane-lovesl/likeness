/**
 * The studio's work, wherever you are. While something is being made, a small pill in the bar says how much and how
 * long is left; touched, it lists everything asked for lately, each with how far it got. Everything is kept on this
 * device as it arrives, so leaving the app loses nothing: a turn still being made carries on in the studio and is
 * picked up again when you come back (see resumeTurn), and any of them opens again in the mirror, its takes with it.
 */
import { h, icon, sheet } from '../core/dom.js';
import { app, printById, urlOf } from '../state.js';
import { on } from '../core/bus.js';
import { studio } from '../studio/studio.js';
import { progressAt } from '../core/estimate.js';

/** The kinds of turn the mirror asks for: a look tried on (in its part, or over the picture), and every angle. */
const MIRROR = new Set(['region', 'edit', 'angles']);

/** The mirror's turns in this thread, the latest first. */
export const turns = () => (app.thread?.items || []).filter((/** @type {any} */ it) => it.type === 'job' && MIRROR.has(it.op)).slice().reverse();

/** How long ago, in a few words. @param {number} t */
const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 50 ? 'just now' : s < 3300 ? Math.round(s / 60) + ' min ago' : new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
/** How long is left, honestly: an estimate while there is one, then the time it has taken so far. @param {any} it */
const left = (it) => { const gone = Date.now() - it.startedAt, l = it.eta - gone; return l > 4500 ? 'about ' + Math.ceil(l / 5000) * 5 + ' s left' : l > -6000 ? 'any moment' : Math.round(gone / 1000) + ' s so far'; };
/** Where a turn stands, in words. @param {any} it */
function standing(it) {
  const n = it.prints?.length || 0;
  if (it.state === 'running') return (n ? n + ' of ' + (it.n || 4) + ' in · ' : '') + left(it);
  if (it.state === 'done') return n + (n === 1 ? ' picture' : ' pictures') + ' · ' + ago(it.startedAt + (it.ms || 0));
  if (it.state === 'stopped') return 'Stopped' + (n ? ' · ' + n + ' kept' : '');
  return 'Did not work' + (it.error ? ': ' + String(it.error).slice(0, 60) : '');
}
/** What was asked for, in its own words. @param {any} it */
const asked = (it) => it.said || (it.op === 'angles' ? 'Every angle' : it.summary || it.text || 'A change');

/**
 * The pill: hidden while nothing is being made; "Making" with a ring burning round to the estimate while something is
 * (how many, if more than one); "Ready" for a while after something lands. Touched, the list.
 */
export function activityPill() {
  const ring = h('span.act__ring', { 'aria-hidden': 'true' }), label = h('span.act__label');
  const el = h('button.act', { type: 'button', hidden: true, onclick: () => openActivity() }, ring, label);
  let readyAt = 0, seen = false, tick = 0, was = 0, telling = 0;
  /** Its word, said for a moment, then just the ring. @param {number} ms */
  const tell = (ms) => { el.classList.add('is-telling'); clearTimeout(telling); telling = setTimeout(() => el.classList.remove('is-telling'), ms); };
  const paint = () => {
    if (seen && !el.isConnected) { stop(); return; }
    if (el.isConnected) seen = true;
    const run = turns().filter((/** @type {any} */ t) => t.state === 'running'), ready = Date.now() - readyAt < 9000;
    el.hidden = !run.length && !ready;
    el.classList.toggle('is-ready', !run.length && ready);
    if (run.length > was) tell(3200);
    was = run.length; el.dataset.n = run.length > 1 ? String(run.length) : '';
    if (run.length) {
      const t = run[run.length - 1], p = progressAt(Date.now() - t.startedAt, t.eta);
      ring.style.setProperty('--p', p.toFixed(3));
      label.textContent = run.length > 1 ? 'Making ' + run.length : 'Making';
      el.setAttribute('aria-label', (run.length > 1 ? run.length + ' being made' : 'One being made, ' + left(t)) + ': see them');
    } else if (ready) { label.textContent = 'Ready'; el.setAttribute('aria-label', 'Ready: see it'); }
    if (!tick && run.length) tick = setInterval(paint, 1000);
    if (tick && !run.length && !ready) { clearInterval(tick); tick = 0; }
  };
  const offs = [on('item', paint), on('item:patch', (/** @type {any} */ it) => { if (it?.type === 'job' && MIRROR.has(it.op) && it.state === 'done' && Date.now() - readyAt > 1500) { readyAt = Date.now(); tell(9000); if (!tick) tick = setInterval(paint, 1000); } paint(); })];
  const stop = () => { clearInterval(tick); tick = 0; offs.forEach(f => f()); };
  queueMicrotask(paint);
  return el;
}

/** The list: everything the mirror asked the studio for lately, the latest first, each opening again in the mirror. */
export function openActivity() {
  return sheet((close) => {
    const list = h('div.acts'), count = h('span.t-mono.t-soft');
    const paintList = () => {
      if (done) return;
      const all = turns().slice(0, 12), run = all.filter(t => t.state === 'running').length;
      count.textContent = run ? run + ' being made' : all.length ? all.length + ' lately' : '';
      list.replaceChildren(...(all.length ? all.map(it => row(it, close)) : [h('p.acts__none', null, studio.live ? 'Nothing asked for yet. Try a look on: whatever you ask for is listed here as it is made.' : 'The showcase sketches on this device, at once. A studio (the simulator, or GPT Image on your computer) makes renders, and they are listed here as they are made.')]));
    };
    let done = false;
    const offs = [on('item', paintList), on('item:patch', paintList)], tick = setInterval(paintList, 1000);
    const end = () => { done = true; clearInterval(tick); offs.forEach(f => f()); };
    new MutationObserver((_, mo) => { if (!list.isConnected) { end(); mo.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
    paintList();
    return [
      h('div.sheet__head', null, h('h2.t-title', null, 'In the studio'), count),
      h('p.t-lede', null, studio.live ? 'Everything you have asked for, and how far it has got. Ask for several at once: they are made side by side.' : 'Looks are sketched here on the device. With a studio, renders are listed here as they are made.'),
      list,
      h('p.acts__kept', null, h('span', { html: icon('heart') }), 'Kept on this device as it arrives. Close the app whenever you like: what is being made carries on in the studio and is here when you come back.'),
    ];
  }, { cls: 'sheet--acts', label: 'In the studio' });
}

/** One turn in the list: its first picture (or the face it was asked of), what was asked, and where it stands. @param {any} it @param {() => void} close */
function row(it, close) {
  const subject = printById(it.parents?.[0]), first = printById((it.prints || []).find(Boolean)), pic = first || subject;
  return h('button.acts__row', { type: 'button', 'data-state': it.state, disabled: !subject, onclick: () => { close(); if (subject) import('../looks/mirror.js').then(m => m.openMirror({ print: subject, after: it })); } },
    h('span.acts__pic', null, pic ? h('img', { src: urlOf(pic), alt: '' }) : null),
    h('span.acts__say', null, h('b', null, asked(it)), h('small', null, standing(it))),
    h('span.acts__go', { html: icon(it.state === 'running' ? 'dial' : 'expand') }));
}
