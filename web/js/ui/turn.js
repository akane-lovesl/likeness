/**
 * A turn: what you asked, sent to the studio, and the card that shows it developing. The card is honest about time:
 * a fuse burns around each frame toward the estimate, the words say what stage the studio is at, a draft drawn on
 * the device appears at once (labelled as a draft) and is replaced by previews and then the real picture.
 */
import { h, icon, eta, uid } from '../core/dom.js';
import { glyph } from '../room/ornaments.js';
import { app, addItem, patchItem, addPrint, printById, handleOf, settings } from '../state.js';
import { atmosphere } from '../room/theme.js';
import { skyFor } from '../room/atmosphere.js';
import { studio } from '../studio/studio.js';
import { sketch } from '../studio/local.js';
import { describeIntent } from '../studio/intent.js';
import { nextIdeas } from '../studio/next.js';
import { placeIn } from '../room/maker.js';
import { estimate, record, progressAt } from '../core/estimate.js';
import { sound } from '../core/sound.js';
import { sky } from '../room/sky.js';
import { printEl, museEl } from './cards.js';
import { emit } from '../core/bus.js';
import { reduced } from '../core/motion.js';

export const PACES = { quick: { label: 'Quick', icon: 'bolt' }, fine: { label: 'Fine', icon: 'feather' }, deep: { label: 'Deep', icon: 'gem' } };
const STAGES = ['read', 'plan', 'draw', 'finish'];
const cards = new Map();
const svgNS = 'http://www.w3.org/2000/svg';

function fuse() {
  const s = document.createElementNS(svgNS, 'svg'), r = document.createElementNS(svgNS, 'rect');
  s.setAttribute('class', 'fuse'); s.setAttribute('preserveAspectRatio', 'none'); s.setAttribute('viewBox', '0 0 100 100');
  for (const [k, v] of Object.entries({ x: 1, y: 1, width: 98, height: 98, rx: 3, pathLength: 100, 'stroke-dasharray': 100, 'stroke-dashoffset': 100 })) r.setAttribute(k, String(v));
  s.append(r); return { el: s, set: p => r.setAttribute('stroke-dashoffset', String(100 * (1 - p))) };
}

/** The card for a job item, live or remembered. */
export function jobEl(item, { onOpen, onIdea, onRetry }) {
  const el = h('article.job', { data: { id: item.id } });
  const card = { el, item, frames: [], timer: 0, onOpen };
  cards.set(item.id, card);
  const room = atmosphere.room, voice = room.voice;
  const ar = item.ar || '3 / 4';

  if (item.state === 'done') {
    el.append(museEl(item.reply || pickDone(), { sub: item.ms ? `${(item.ms / 1000).toFixed(1)} s · ${PACES[item.pace]?.label || ''}` : '' }));
    el.append(h('div.prints', { data: { n: Math.min(4, item.prints.length) } }, item.prints.map((id, i) => { const p = printById(id); return p ? printEl(p, { i, onOpen }) : null; })));
    return el;
  }
  if (item.state === 'failed' || item.state === 'stopped') {
    el.classList.add('job--failed');
    el.append(h('header.job__head', null, h('span.muse', { html: glyph(room.ornament) }), h('span.job__stage', null, item.state === 'stopped' ? 'Stopped.' : 'That didn’t work.'), h('span')));
    el.append(h('div.job__notes', null, h('span', null, item.error || '')));
    if (item.hint) el.append(h('div.job__notes', null, h('span', null, item.hint)));
    el.append(h('div.job__retry', null, h('button.chip', { onclick: () => onRetry?.(item) }, h('span', { html: icon('retry') }), 'Try again')));
    return el;
  }

  card.muse = h('span.muse.is-thinking', { html: glyph(room.ornament) });
  card.stage = h('span.job__stage', null, h('span', null, (voice.stages.read || 'Reading') + '…'));
  card.eta = h('span.job__eta.num', null, eta(item.eta));
  card.steps = h('ol.steps', { 'aria-hidden': 'true' }, STAGES.map(s => h('li', { data: { s } })));
  card.notes = h('div.job__notes', { 'aria-live': 'polite' });
  card.prompt = h('p.job__prompt', { hidden: true });
  const pills = [...(item.summary || []), { k: 'pace', text: PACES[item.pace]?.label }];
  card.plan = h('div.job__plan', null, pills.map((s, i) => h('span.plan-pill', { data: { k: s.k }, style: { '--i': i } }, s.text)));
  const row = h('div.prints', { data: { n: Math.min(4, item.n) } });
  for (let i = 0; i < item.n; i++) {
    const f = fuse(), label = h('span.print__label', null, 'Waiting'), draft = h('img.print__draft', { alt: '', hidden: true }), partial = h('img.print__partial', { alt: '' });
    const frame = h('div.print__frame', null, h('div.dev'), draft, partial, label, f.el);
    const fig = h('figure.print.is-developing', { style: { '--ar': ar, '--i': i } }, frame);
    row.append(fig); card.frames.push({ fig, frame, fuse: f, label, draft, partial, done: false });
  }
  el.append(h('header.job__head', null, card.muse, card.stage, card.eta), card.plan, row, card.notes, card.prompt,
    h('footer.job__foot', null, card.steps, h('button.job__stop', { onclick: () => studio.engine.cancel(item.spec || item.id, item.job || null) }, 'Stop')));
  card.timer = setInterval(() => tick(card), 250); tick(card);
  return el;
}

function tick(card) {
  const { item } = card;
  if (!card.el.isConnected && card.el.parentNode === null && Date.now() - item.startedAt > 2000) { /* detached: keep counting quietly */ }
  const elapsed = Date.now() - item.startedAt, p = progressAt(elapsed, item.eta), left = item.eta - elapsed;
  for (const f of card.frames) if (!f.done) f.fuse.set(p);
  card.eta.textContent = left > 1500 ? eta(left) + ' left' : elapsed > item.eta * 1.25 ? 'a little longer than usual' : 'nearly there';
}
const pickDone = () => { const d = atmosphere.room.voice.done; return d[Math.floor(Math.random() * d.length)]; };

function setStage(card, stage) {
  const voice = atmosphere.room.voice, idx = STAGES.indexOf(stage);
  card.stage.replaceChildren(h('span', null, (voice.stages[stage] || stage) + '…'));
  [...card.steps.children].forEach((li, i) => { li.classList.toggle('is-done', i < idx); li.classList.toggle('is-now', i === idx); });
  if (stage === 'draw') for (const f of card.frames) if (!f.done) f.label.textContent = studio.live ? 'Painting' : 'Sketching';
}
/** The words the studio will paint from, typed out as they arrive: a look over its shoulder. */
function typeOut(el, text) {
  el.hidden = false; el.title = text;
  const words = text.split(/\s+/).slice(0, 48), full = words.join(' ') + (text.split(/\s+/).length > 48 ? '…' : '');
  if (reduced) { el.textContent = full; return; }
  let i = 0; el.textContent = '';
  const step = () => { i = Math.min(words.length, i + 1); el.textContent = words.slice(0, i).join(' ') + (i < words.length ? ' ▍' : full.endsWith('…') ? '…' : ''); if (i < words.length && el.isConnected) setTimeout(step, 55 + Math.random() * 60); };
  step();
}
/** A picture landed: a small tap on the hand, and a mark on the tab if you are elsewhere. */
function arrived() {
  try { navigator.vibrate?.(14); } catch { /* not allowed */ }
  if (!document.hidden) return;
  const was = document.title; document.title = '● ' + was.replace(/^● /, '');
  document.addEventListener('visibilitychange', () => { document.title = was.replace(/^● /, ''); }, { once: true });
}
function note(card, text, quick = false) {
  card?.notes?.replaceChildren(h(quick ? 'span.is-quick' : 'span', null, text));
}
/** A layer of a sketch being painted: it sweeps in over the one before, which then goes. */
async function layOn(f, canvas) {
  const img = h('img.print__layer', { alt: '' }); await showOn(img, canvas);
  f.label.before(img); f.label.textContent = studio.live ? 'Painting' : 'Sketching';
  const older = [...f.frame.querySelectorAll('.print__layer')].filter(el => el !== img);
  img.addEventListener('animationend', () => older.forEach(el => el.remove()), { once: true });
  if (reduced) older.forEach(el => el.remove());
}
async function showOn(img, src) {
  const url = src instanceof Blob ? URL.createObjectURL(src) : src.toDataURL('image/jpeg', .7);
  img.src = url; try { await img.decode(); } catch { /* shown anyway */ }
}

/**
 * Runs a turn end to end.
 * @param {{ text: string, intent: any, pace: string, n?: number, backdrop?: any, subjectMask?: HTMLCanvasElement|null }} t
 */
export async function runTurn(t) {
  const room = atmosphere.room, n = t.n || t.intent.n || 1, id = uid('j-');
  const inputs = {};
  for (const pid of [t.intent.subject, ...t.intent.refs.map(r => r.id), ...(t.intent.pins || []).map(p => p.print)].filter(Boolean)) {
    const p = printById(pid); if (p) inputs[pid] = { blob: p.blob, handle: p.handle, w: p.w, h: p.h };
  }
  const subject = t.intent.subject && printById(t.intent.subject);
  const ar = subject?.w ? `${subject.w} / ${subject.h}` : '3 / 4';
  const est = estimate(studio.mode, t.intent.op, t.pace, n);
  const spec = { id, text: t.text, intent: t.intent, pace: t.pace, n, room, mood: skyFor().mood?.id || null, backdrop: t.backdrop || null, subjectMask: t.subjectMask || null, taste: settings.get('taste', '').trim() };
  if (t.subjectMask) spec.subjectMaskBlob = await new Promise(r => t.subjectMask.toBlob(r, 'image/png'));
  for (const pin of spec.intent.pins || []) if (pin.mask && !pin.maskBlob) pin.maskBlob = await new Promise(r => pin.mask.toBlob(r, 'image/png'));

  await addItem({ type: 'you', text: t.text, pins: (t.intent.pins || []).map(p => ({ n: p.n, note: p.note, print: p.print })) });
  const item = await addItem({ type: 'job', state: 'running', spec: id, text: t.text, parents: Object.keys(inputs), look: t.intent.look?.id || null, room: room.id, op: t.intent.op, n, pace: t.pace, ar, eta: est.ms, startedAt: Date.now(), summary: describeIntent(t.intent, handleOf), prints: [] });
  sound.play('send');
  const card = cards.get(item.id);

  if (studio.live && (subject || t.intent.op === 'create')) {
    sketch(spec, Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, { ...v }])), 0, 480).then(({ canvas }) => {
      if (!card) return;
      for (const f of card.frames) if (!f.done) { f.draft.hidden = false; showOn(f.draft, canvas); f.label.textContent = 'Draft · on this device'; }
    }).catch(() => {});
  }
  await develop(item, studio.engine.turn(spec, inputs), { learn: true });
  return item;
}

/**
 * A live turn that was still developing when the page closed: the studio kept working, so follow it again from its
 * first event. Pictures that already arrived are not added twice.
 */
export async function resumeTurn(item) {
  if (!studio.live || !studio.engine.resume || !item.job) {
    await patchItem(item, { state: 'stopped', error: 'Interrupted when the page was closed.', retry: { text: item.text || '', pace: item.pace } });
    return item;
  }
  note(cards.get(item.id), 'Picking up where it was');
  await develop(item, studio.engine.resume(item.job), { learn: false });
  return item;
}

/** Follows a turn's events into its card and its item, whichever way they come. */
async function develop(item, events, { learn }) {
  const card = cards.get(item.id);
  let reply = null, firstResult = true;
  try {
    for await (const ev of events) {
      if (!card) continue;
      switch (ev.type) {
        case 'accepted': await patchItem(item, { job: ev.job || item.job || null, eta: ev.eta || item.eta }); break;
        case 'stage': setStage(card, ev.stage); break;
        case 'note': note(card, ev.text, ev.quick); break;
        case 'plan': if (ev.plan?.summary) note(card, ev.plan.summary); if (ev.plan?.prompt && ev.plan.prompt !== item.text) typeOut(card.prompt, ev.plan.prompt); break;
        case 'partial': {
          const f = card.frames[ev.index]; if (!f || f.done) break;
          if (ev.layer) { await layOn(f, ev.canvas); break; }
          await showOn(f.partial, ev.canvas || ev.blob); f.partial.classList.add('is-in'); f.label.textContent = 'Preview'; break;
        }
        case 'result': {
          const kept = item.prints[ev.index] && printById(item.prints[ev.index]);
          const p = kept || await addPrint({ blob: ev.blob, w: ev.w, h: ev.h, origin: 'made', provenance: ev.provenance, parents: item.parents || [], prompt: item.text || '', look: item.look || null, room: item.room || atmosphere.room.id });
          if (!kept) { item.prints[ev.index] = p.id; await patchItem(item, { prints: item.prints }); }
          const f = card.frames[ev.index];
          if (f && !f.done) {
            f.done = true; f.fuse.set(1);
            const fresh = printEl(p, { i: 0, onOpen: card.onOpen });
            if (!kept) fresh.querySelector('.print__img').classList.add('is-revealing');
            f.fig.replaceWith(fresh); f.fig = fresh;
            if (!kept) { const r = fresh.getBoundingClientRect(); sky.burst(r.left + r.width / 2, r.top + r.height / 3, { n: 10 }); }
          }
          if (firstResult && !kept) { sound.play('arrive'); arrived(); firstResult = false; }
          break;
        }
        case 'reply': reply = ev; break;
        case 'done': {
          const ms = Date.now() - item.startedAt;
          if (learn) record(studio.mode, item.op, item.pace, item.n, ms);
          clearInterval(card.timer);
          await patchItem(item, { state: 'done', ms: ev.ms || ms, reply: reply?.text || pickDone(), suggestions: ideasAfter(item, reply) });
          break;
        }
      }
    }
    if (item.state === 'running') { clearInterval(card?.timer); await patchItem(item, { state: 'done', ms: Date.now() - item.startedAt, reply: reply?.text || pickDone(), suggestions: ideasAfter(item, reply) }); }
  } catch (e) {
    clearInterval(card?.timer);
    sound.play('error');
    await patchItem(item, { state: e.cancelled ? 'stopped' : 'failed', error: e.cancelled ? '' : (e.message || String(e)), hint: e.hint || '', retry: { text: item.text || '', pace: item.pace } });
  }
  emit('turn:done', item);
}

/**
 * Three fresh ideas for what to say next: the engine's own, minus what was just asked, topped up from the room of
 * possibilities. After painting a place, the first is to go there: the picture becomes the room.
 */
function ideasAfter(item, reply) {
  const items = app.thread.items, mine = items.indexOf(item);
  const recent = items.slice(0, mine + 1).filter(i => i.type === 'you').slice(-4).map(i => i.text || '');
  const previous = (items.slice(0, mine).reverse().find(i => i.type === 'job' && i.suggestions?.length)?.suggestions || []).map(s => s.text || s);
  const ideas = nextIdeas({ op: item.op, offered: reply?.suggestions || [], recent, previous, turn: items.filter(i => i.type === 'job').length });
  const there = item.op === 'create' ? placeIn(item.text || '') : null;
  return there ? [{ text: 'Take me there', room: there }, ...ideas].slice(0, 3) : ideas;
}
export const cardFor = id => cards.get(id);
