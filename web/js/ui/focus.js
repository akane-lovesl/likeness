/**
 * A picture, up close, in a lightbox lit by its own colours. From here you can pin parts of it and write what each
 * should become (the retoucher's marks), give it a new backdrop or look, ask for variations, keep it, or save it.
 * Hold the picture to see what it was made from.
 */
import { h, icon, toast, stage, sheet } from '../core/dom.js';
import { flip, reduced } from '../core/motion.js';
import { glyph } from '../room/ornaments.js';
import { app, urlOf, printById, setKept, settings } from '../state.js';
import { atmosphere } from '../room/theme.js';
import { sound } from '../core/sound.js';
import { sky } from '../room/sky.js';
import * as P from '../studio/painter.js';
import { selectAt, brush, loadSegmenter } from '../studio/segment.js';
import { pinMark } from './cards.js';
import { studio } from '../studio/studio.js';
import { proofOf, standStage, standWords, makingOf, lifeOf, tripOf, sunOf } from '../studio/local.js';
import { film, travel, canFilm } from './reel.js';
import { alive } from './life.js';

let open = null;

/** @param {any} print @param {HTMLElement} fromEl @param {{ onSend: (t: any) => void, onUse: (id: string) => void }} o */
/** The chain of pictures this one came from, oldest first (at most six). */
function lineage(print) {
  const chain = [print];
  for (let p = print; chain.length < 6;) {
    const up = p.parents?.map(printById).find(Boolean);
    if (!up || chain.includes(up)) break;
    chain.unshift(up); p = up;
  }
  return chain;
}
/** What was asked to make a picture, in a few words. */
function stepWords(p) {
  if (/pinned/i.test(p.provenance?.detail || '') || /^changes to/i.test(p.prompt || '')) return 'pinned';
  const words = String(p.prompt || '').replace(/@[A-Z]{1,2}\b/g, '').replace(/\s+/g, ' ').trim();
  return (words.length > 20 ? words.slice(0, 19).trim() + '…' : words || 'changed').replace(/^./, c => c.toLowerCase());
}

export function openFocus(print, fromEl, { onSend, onUse }) {
  if (open) return;
  const url = urlOf(print), parent = print.parents?.map(printById).find(Boolean);
  let mode = 'view', source = null, active = null, painting = false;
  /** @type {{ n: number, x: number, y: number, mask: HTMLCanvasElement, note: string, el: HTMLElement, shade: HTMLElement, label: HTMLElement }[]} */
  const pins = [];

  const el = h('section.focus', { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Picture ${print.handle}` });
  const ambient = h('div.focus__ambient', { style: { backgroundImage: `url("${url}")` } });
  const img = h('img.focus__img' + (print.blob?.type === 'image/png' ? '.is-alpha' : ''), { src: url, alt: `Picture ${print.handle}`, draggable: false });
  const before = parent ? h('img.focus__before', { src: urlOf(parent), alt: '', draggable: false }) : null;
  const layer = h('div.focus__layer');
  const pic = h('div.focus__pic', null, img, before, layer);
  const stageEl = h('div.focus__stage', null, pic);
  const chain = lineage(print);
  const hint = chain.length > 1 ? lineageEl(chain) : h('p.focus__hint', null, '');
  const title = h('div.focus__title', null, h('b', null, print.handle), h('span.t-mono', null, print.provenance?.label || ''), print.provenance?.detail ? h('span.focus__detail', null, print.provenance.detail) : null);
  const close = h('button.icon-btn.focus__close', { 'aria-label': 'Close', html: icon('back'), onclick: () => shut() });
  const keepBtn = tool('heart', print.kept ? 'Kept' : 'Keep', () => keep());
  keepBtn.setAttribute('aria-pressed', String(!!print.kept));
  const dock = h('div.focus__dock', null,
    tool('pin', 'Pin', () => setMode('pin')),
    tool('wand', 'Look', () => import('./looks.js').then(m => m.openLooks({ print, onSend, after: shut }))),
    tool('backdrop', 'Backdrop', () => import('./backdrops.js').then(m => m.openBackdrops({ print, onSend, after: shut }))),
    tool('vary', 'Vary', () => { onSend({ text: `Three variations of @${print.handle}`, intent: { op: 'vary', subject: print.id, refs: [], look: null, n: 3, pins: [] }, pace: settings.get('pace', 'fine') }); shut(); }),
    tool('at', 'Use', () => { onUse(print.id); shut(); }),
    keepBtn,
    tool('save', 'Save', () => save()));
  const sendBtn = h('button.btn.btn--accent.focus__send', { disabled: true, onclick: () => sendPins() });
  const pinDock = h('div.focus__pindock', { hidden: true }, h('button.btn.btn--quiet.focus__cancel', { onclick: () => setMode('view') }, 'Done'), sendBtn);
  el.append(ambient, h('div.focus__veil'), h('header.focus__bar', null, close, title), stageEl, hint, dock, pinDock);
  stage().append(el);
  open = el;

  /** The picture's ancestry, oldest first, each step labelled with what was asked. Tap one to go there. */
  function lineageEl(list) {
    const shown = list.slice(-4), cut = list.length > shown.length;
    const strip = h('div.lineage', { role: 'list', 'aria-label': 'How this picture was made' }, cut ? h('span.lineage__more', null, '…') : null,
      ...shown.flatMap((p, i) => [
        i ? h('span.lineage__step', { title: p.prompt || '' }, stepWords(p)) : null,
        h('button.lineage__node', { role: 'listitem', 'aria-current': p === print ? 'true' : null, 'aria-label': `Picture ${p.handle}`, style: { '--i': i },
          onclick: () => { if (p === print) return; sound.play('tap'); shut(); setTimeout(() => openFocus(p, null, { onSend, onUse }), 380); } },
          h('img', { src: urlOf(p), alt: '' }), h('b', null, p.handle)),
      ]));
    // how to compare is said until it has been done once
    return h('div.focus__hint.focus__hint--lineage', null, strip, localStorage.getItem('likeness:compared') ? null : h('span.lineage__tip', null, 'Hold the picture to compare with ' + (parent?.handle || 'the one before')));
  }
  function tool(ic, label, fn) { return h('button.tool', { onclick: () => { sound.play('tap'); fn(); } }, h('span', { html: icon(ic) }), h('span', null, label)); }
  function layout() {
    const r = stageEl.getBoundingClientRect(), padX = r.width * .04, padY = r.height * .03, ar = (print.w || 3) / (print.h || 4);
    let w = r.width - padX * 2, hh = w / ar;
    if (hh > r.height - padY * 2) { hh = r.height - padY * 2; w = hh * ar; }
    pic.style.width = w + 'px'; pic.style.height = hh + 'px';
  }
  layout();
  const ro = new ResizeObserver(layout); ro.observe(stageEl);
  requestAnimationFrame(() => el.classList.add('is-in'));
  const fromImg = /** @type {HTMLElement} */ (fromEl?.querySelector('.print__img') || fromEl);
  if (fromImg) flip(pic, fromImg.getBoundingClientRect(), { duration: 560, easing: 'cubic-bezier(.2,.8,.2,1)' });
  history.pushState({ focus: true }, '');
  const onPop = () => shut(true);
  addEventListener('popstate', onPop);

  function shut(fromHistory = false) {
    if (!open) return;
    open = null; removeEventListener('popstate', onPop); ro.disconnect(); filming?.abort(); lifeTicket++; living?.stop(); living = null;
    if (!fromHistory && history.state?.focus) history.back();
    el.classList.remove('is-in');
    const target = fromImg?.isConnected ? fromImg.getBoundingClientRect() : null;
    if (target && !reduced) {
      const r = pic.getBoundingClientRect();
      pic.animate([{ transform: 'none' }, { transformOrigin: '0 0', transform: `translate(${target.left - r.left}px, ${target.top - r.top}px) scale(${target.width / r.width}, ${target.height / r.height})` }], { duration: 380, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
    }
    setTimeout(() => el.remove(), reduced ? 0 : 400);
  }

  async function keep() {
    const kept = !print.kept; await setKept(print.id, kept);
    keepBtn.setAttribute('aria-pressed', String(kept)); keepBtn.lastElementChild.textContent = kept ? 'Kept' : 'Keep';
    if (kept) { const r = keepBtn.getBoundingClientRect(); sky.burst(r.left + r.width / 2, r.top, { n: 12, glyph: 'heart' }); sound.play('pin'); }
    toast(kept ? 'Kept in the album' : 'Taken out of the album');
  }
  /** Save: the picture, or, for one the device made, a short film of its making. */
  function save() {
    // the films the device can make of this picture: the making of it, or the trip it is of
    const films = canFilm() ? [
      ...(trip && from ? [{ id: 'trip', b: 'The trip', s: 'A short film: the world changing behind them, place by place' }] : []),
      ...(!trip && studio.mode === 'showcase' && (print.provenance?.scene || (recipe && from)) ? [{ id: 'film', b: 'How it was made', s: 'A short film of its making, played as it saves' }] : []),
    ] : [];
    if (!films.length) return saveImage();
    sheet(close => [
      h('div.sheet__head', null, h('h2.t-title', null, 'Save')),
      h('div.bring', null,
        h('button.bring__opt', { onclick: () => close('image') }, h('span', { html: icon('image') }), h('b', null, 'The picture'), h('span.t-soft', null, 'As it is, to keep or to send')),
        ...films.map(f => h('button.bring__opt', { onclick: () => close(f.id) }, h('span', { html: icon('film') }), h('b', null, f.b), h('span.t-soft', null, f.s)))),
    ], { label: 'Save' }).then(pick => { if (pick === 'image') saveImage(); else if (pick === 'film') saveFilm(); else if (pick === 'trip') saveTrip(); });
  }
  let filming = /** @type {AbortController | null} */ (null);
  const asksOf = () => lineage(print).map(p => String(p.prompt || '').replace(/@([A-Z]{1,2})\b/g, '$1').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(-3);
  const dayOf = () => new Date(print.createdAt || Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  /**
   * A film the device makes, played over the picture as it records, then saved on the device.
   * @param {(view: HTMLCanvasElement, look: import('./reel.js').Look) => Promise<Blob | null>} make @param {number} w @param {number} hh @param {string} name @param {string} saved @param {string} [cls]
   */
  async function roll(make, w, hh, name, saved, cls = '') {
    if (filming) return;
    const ctl = filming = new AbortController(), view = h('canvas.focus__film' + cls, { width: w, height: hh }), rec = h('span.focus__rec', null, 'Filming');
    pic.append(view, rec); el.classList.add('is-filming');
    try {
      await document.fonts?.ready;
      const css = getComputedStyle(document.documentElement), v = (/** @type {string} */ n, /** @type {string} */ or) => css.getPropertyValue(n).trim() || or;
      const blob = await make(view, { ground: v('--ground', '#f4efe6'), ink: v('--ink', '#1d1a17'), accent: v('--accent', '#d4452f'), display: v('--font-display', 'serif'), hand: v('--font-hand', 'cursive'), mono: v('--font-mono', 'monospace'), signal: ctl.signal });
      if (blob) {
        const href = URL.createObjectURL(blob), a = h('a', { href, download: name + '.' + (blob.type.includes('mp4') ? 'mp4' : 'webm') });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 60_000);
        toast(saved);
      }
    } catch (e) { console.warn('film', e); toast('The film could not be made here'); }
    finally { filming = null; el.classList.remove('is-filming'); view.remove(); rec.remove(); }
  }
  /** The making: what was asked, each step with its note, the picture. */
  function saveFilm() {
    const W = 540, source = from ? { blob: from.blob, handle: from.handle } : null;
    return roll(async (view, look) => {
      const making = await makingOf(print, source), final = await P.fromBlob(print.blob, W), life = await lifeOf(print, source).catch(() => null), asks = asksOf();
      return making && film({ asks: asks.length ? asks : ['A picture'], day: dayOf(), start: making.start, frames: making.frames, final, end: 'Likeness · a sketch, drawn on this device', life }, view, look);
    }, W, Math.round(W * (print.h || 4) / (print.w || 3)), `likeness-${print.handle.toLowerCase()}-making`, 'Saved the film of its making');
  }
  /** The trip: them at home, then each place swung in behind them while they stand still, alive a moment, then home. */
  function saveTrip() {
    if (!from) return;
    const W = 540;
    return roll(async (view, look) => {
      const t = await tripOf(print, { blob: from.blob, handle: from.handle }, W), asks = asksOf();
      return t && travel({ asks: asks.length ? asks : ['A trip'], day: dayOf(), stops: t.stops, home: t.home, me: t.me, end: 'Likeness · sketches, drawn on this device' }, view, look);
    }, W, Math.round(W * (from.h || 4) / (from.w || 3)), `likeness-${print.handle.toLowerCase()}-trip`, 'Saved the trip', '.is-trip');
  }
  function saveImage() {
    const a = h('a', { href: url, download: `likeness-${print.handle.toLowerCase()}-${new Date(print.createdAt).toISOString().slice(0, 10)}.${print.blob.type === 'image/png' ? 'png' : 'jpg'}` });
    document.body.append(a); a.click(); a.remove(); toast('Saved');
  }

  /* Hold to compare. */
  let holdTimer = 0;
  pic.addEventListener('pointerdown', e => {
    if (mode === 'pin') return pinDown(e);
    if (grab?.(e)) return;
    if (!before) return;
    holdTimer = setTimeout(() => { before.classList.add('is-in'); pic.dataset.was = parent.handle; hint.classList.add('is-comparing'); localStorage.setItem('likeness:compared', '1'); }, 160);
  });
  const release = () => { clearTimeout(holdTimer); if (before?.classList.contains('is-in')) { before.classList.remove('is-in'); delete pic.dataset.was; hint.classList.remove('is-comparing'); } };
  pic.addEventListener('pointerup', e => (mode === 'pin' ? pinUp(e) : release()));
  pic.addEventListener('pointercancel', release); pic.addEventListener('pointerleave', release);
  pic.addEventListener('pointermove', e => { if (mode === 'pin') pinMove(e); });
  pic.addEventListener('contextmenu', e => e.preventDefault());

  /* Pins: tap to select a thing, drag to paint, write what it should become. */
  function setMode(m) {
    mode = m; el.dataset.mode = m;
    dock.hidden = m === 'pin'; pinDock.hidden = m !== 'pin';
    hint.textContent = m === 'pin' ? 'Tap anything to pin it · drag to paint' : (parent ? 'Hold the picture to see what it was made from' : '');
    if (m === 'pin') { loadSegmenter().catch(() => {}); ensureSource(); }
    else { for (const p of pins) if (!p.note) removePin(p); bubbleClose(); }
    paintSend();
  }
  async function ensureSource() { source ||= await P.fromBlob(print.blob, 640); return source; }
  let down = null;
  function pinDown(e) { down = { x: e.clientX, y: e.clientY, moved: false }; try { pic.setPointerCapture(e.pointerId); } catch { /* fine */ } }
  function norm(e) { const r = pic.getBoundingClientRect(); return { nx: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), ny: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; }
  async function pinMove(e) {
    if (!down) return;
    if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) {
      down.moved = true; painting = true;
      const src = await ensureSource(), { nx, ny } = norm(e);
      if (!active) active = addPin(nx, ny, P.make(src.width, src.height));
    }
    if (painting && active) { const { nx, ny } = norm(e); brush(active.mask, nx, ny); drawShade(active); }
  }
  async function pinUp(e) {
    const d = down; down = null;
    if (!d) return;
    if (d.moved) { painting = false; if (active) bubble(active); return; }
    const hit = /** @type {HTMLElement} */ (e.target).closest('.pin');
    if (hit) return;
    const { nx, ny } = norm(e), src = await ensureSource();
    const ring = h('span.pin-ring', { style: { left: nx * 100 + '%', top: ny * 100 + '%' } }, h('span.t-mono', null, 'Looking…'));
    layer.append(ring);
    const { mask, guessed } = await selectAt(src, nx, ny);
    ring.remove();
    const p = addPin(nx, ny, mask);
    if (guessed) p.label.textContent = '';
    sound.play('pin');
    bubble(p);
  }
  function addPin(nx, ny, mask) {
    const n = (pins.reduce((m, p) => Math.max(m, p.n), 0) || 0) + 1;
    const shade = h('div.pin-shade'), label = h('span.pin__note');
    const pinEl = h('button.pin', { style: { left: nx * 100 + '%', top: ny * 100 + '%' }, 'aria-label': `Pin ${n}`, onclick: () => bubble(p) }, h('b', null, String(n)), label);
    layer.append(shade, pinEl);
    const p = { n, x: nx, y: ny, mask, note: '', el: pinEl, shade, label };
    pins.push(p); active = p; drawShade(p); paintSend();
    return p;
  }
  function drawShade(p) { const u = p.mask.toDataURL(); p.shade.style.webkitMaskImage = p.shade.style.maskImage = `url("${u}")`; }
  function removePin(p) { p.el.remove(); p.shade.remove(); pins.splice(pins.indexOf(p), 1); if (active === p) active = null; paintSend(); }
  let bub = null;
  function bubbleClose() { bub?.remove(); bub = null; }
  function bubble(p) {
    bubbleClose(); active = p;
    const input = h('input', { type: 'text', value: p.note, placeholder: 'What should this become?', enterkeyhint: 'done', 'aria-label': `What should pin ${p.n} become?` });
    const commit = () => { p.note = input.value.trim(); p.label.textContent = p.note; bubbleClose(); paintSend(); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
    const below = p.y < .55;
    bub = h('div.bubble' + (below ? '.is-below' : ''), { style: { left: '50%', top: p.y * 100 + '%' } },
      h('span.bubble__n', null, pinMark(p.n)), input,
      h('button.icon-btn', { 'aria-label': 'Done', html: icon('check'), onclick: commit }),
      h('button.icon-btn', { 'aria-label': 'Remove this pin', html: icon('trash'), onclick: () => { removePin(p); bubbleClose(); } }));
    layer.append(bub);
    setTimeout(() => input.focus(), 60);
  }
  function paintSend() {
    const ready = pins.filter(p => p.note);
    sendBtn.disabled = !ready.length;
    sendBtn.innerHTML = '';
    sendBtn.append(ready.length ? `Change ${ready.map(p => pinMark(p.n)).join(' ')}` : 'Pin, then write', h('span', { html: icon('arrow') }));
  }
  function sendPins() {
    const ready = pins.filter(p => p.note); if (!ready.length) return;
    onSend({ text: `Changes to @${print.handle}`, intent: { op: 'region', subject: print.id, refs: [], look: null, n: 1, pace: null, pins: ready.map(p => ({ print: print.id, n: p.n, note: p.note, mask: p.mask })) }, pace: settings.get('pace', 'fine') });
    shut();
  }

  /*
   * The sun. On a sketch the device made, the light is something to hold: drag the sun and the scene is painted again
   * under your finger, from first light through the golden hour to night, the moon rising as it sinks. Let go, and it
   * offers to paint it so, or to put the sun back. Only where the device does the painting: anywhere else, a preview
   * drawn here would promise a picture the studio will not make.
   */
  // a picture put somewhere from a photo has its place in its recipe: the sun moves over that place, the person stays.
  // Not in a profile picture's square, where the sky is mostly cut away
  const recipe = print.provenance?.recipe, trip = print.provenance?.trip, from = (recipe || trip) && printById((recipe || trip).from);
  let living = /** @type {{ stop: () => void } | null} */ (null), lifeTicket = 0;
  let resetSun = /** @type {(() => void) | null} */ (null), resetWalk = /** @type {(() => void) | null} */ (null);
  if (studio.mode === 'showcase' && (print.provenance?.scene || (from && recipe?.scene && !recipe.profile))) holdTheSun(print.provenance?.scene || recipe?.scene);
  async function holdTheSun(kept) {
    const tall = (/** @type {number} */ w) => Math.round(w * (print.h || 4) / (print.w || 3));
    const at = await sunOf(print, from ? { blob: from.blob, handle: from.handle } : null).catch(() => null);
    if (!at || open !== el) return;
    const b = at.box, home = at.sun.slice(), low = Math.min(1.85, (1 - b[1]) / b[3] - .03);
    let sun = home.slice(), busy = false, moved = false, queued = /** @type {number[] | null} */ (null);
    const words = () => P.hourWords(sun), relight = () => ({ op: 'edit', subject: print.id, refs: [], look: null, n: 1, pins: [] });
    const view = h('canvas.focus__relit'), say = h('span.sun__say');
    const knob = h('button.sun', { type: 'button', style: { '--d': Math.max(at.r * 2.2, .12) * 100 + '%' } }, say);
    const go = h('button.btn.btn--accent.focus__go', { onclick: () => paintIt() });
    const sunDock = h('div.focus__pindock.focus__sundock', { hidden: true }, h('button.btn.btn--quiet.focus__cancel.focus__undo', { 'aria-label': 'Put the sun back', title: 'Put the sun back', html: icon('undo'), onclick: () => putBack() }), go);
    pic.insertBefore(view, layer); layer.append(knob); el.append(sunDock);
    const seen = Number(localStorage.getItem('likeness:sun') || 0);
    if (seen < 3) { localStorage.setItem('likeness:sun', String(seen + 1)); knob.append(h('span.sun__hint', null, sun[1] > 1 ? 'Drag the sun up' : 'Drag the sun')); }
    place();
    resetSun = () => { if (moved) { sun = home.slice(); moved = false; place(); settle(); } };
    knob.addEventListener('pointerdown', e => { resetWalk?.(); e.stopPropagation(); e.preventDefault(); try { knob.setPointerCapture(e.pointerId); } catch { /* fine */ } knob.classList.add('is-held'); el.classList.add('is-relighting'); knob.querySelector('.sun__hint')?.remove(); });
    knob.addEventListener('pointermove', e => { if (!knob.classList.contains('is-held')) return; const r = pic.getBoundingClientRect(); move(((e.clientX - r.left) / r.width - b[0]) / b[2], ((e.clientY - r.top) / r.height - b[1]) / b[3]); });
    const letGo = () => { if (!knob.classList.contains('is-held')) return; knob.classList.remove('is-held'); el.classList.remove('is-relighting'); settle(); };
    knob.addEventListener('pointerup', letGo); knob.addEventListener('pointercancel', letGo);
    knob.addEventListener('keydown', e => {
      const step = /** @type {Record<string, number[]>} */ ({ ArrowLeft: [-.04, 0], ArrowRight: [.04, 0], ArrowUp: [0, -.06], ArrowDown: [0, .06] })[e.key];
      if (step) { e.preventDefault(); move(sun[0] + step[0], sun[1] + step[1]); settle(); }
      else if (e.key === 'Enter' && moved) { e.preventDefault(); paintIt(); }
    });
    function move(/** @type {number} */ u, /** @type {number} */ v) {
      const was = words();
      sun = [Math.min(.96, Math.max(.04, u)), Math.min(low, Math.max(.06, v))];
      moved = Math.hypot(sun[0] - home[0], sun[1] - home[1]) > .02;
      place(); paint(384, tall(384));
      if (words() !== was) sound.play('tap');
    }
    function place() {
      // after dark the sun waits just under the horizon, not down over whoever is standing there
      knob.style.left = (b[0] + sun[0] * b[2]) * 100 + '%'; knob.style.top = (b[1] + Math.min(sun[1], 1.05) * b[3]) * 100 + '%';
      knob.classList.toggle('is-down', sun[1] > 1); say.textContent = words();
      knob.setAttribute('aria-label', `The sun, ${words()}. Drag it, or use the arrow keys, to change the hour.`);
    }
    async function paint(/** @type {number} */ w, /** @type {number} */ hh) {
      if (busy) { queued = [w, hh]; return; }
      busy = true;
      await new Promise(r => requestAnimationFrame(r));
      const ins = from && !print.provenance?.scene ? { [print.id]: { blob: print.blob, handle: print.handle, recipe }, [from.id]: { blob: from.blob, handle: from.handle } } : { [print.id]: { blob: print.blob, handle: print.handle, scene: kept } };
      const c = await proofOf({ text: `@${print.handle} ${words()}`, intent: relight(), sun }, ins, w, hh).catch(() => null);
      busy = false;
      if (c && open === el) { view.width = c.width; view.height = c.height; view.getContext('2d').drawImage(c, 0, 0); view.classList.toggle('is-in', moved); }
      if (queued) { const [qw, qh] = queued; queued = null; paint(qw, qh); }
    }
    /** Let go: offer to paint it so, sharp this time, or put it back. */
    function settle() {
      sunDock.hidden = !moved; dock.hidden = moved;
      go.replaceChildren('Paint it ' + words(), h('span', { html: icon('arrow') }));
      if (moved) paint(print.w || 768, print.h || 1024); else view.classList.remove('is-in');
      liven(moved ? { sun } : {});
    }
    function putBack() { sun = home.slice(); moved = false; place(); settle(); sound.play('tap'); }
    function paintIt() {
      onSend({ text: `@${print.handle} ${words()}`, intent: relight(), pace: settings.get('pace', 'fine'), sun: sun.map(n => Math.round(n * 1000) / 1000) });
      shut();
    }
  }

  /*
   * Where they stand. In a picture made from a photo and put somewhere, the person can be picked up: drag across to move
   * them, up to step back into the place, down to come closer. The picture is laid out again under the finger from its
   * two layers, the place and the person; let go, and it shows the picture exactly and offers to keep them there.
   */
  let grab = /** @type {((e: PointerEvent) => boolean) | null} */ (null);
  if (studio.mode === 'showcase' && from && recipe && (recipe.scene || recipe.plain || recipe.cut) && !recipe.profile) holdThePerson();
  function holdThePerson() {
    /** @type {any} */ let stage = null;
    let at = { x: 0, s: 1 }, held = /** @type {any} */ (null), moved = false, lift = 0, liftRaf = 0, alpha = /** @type {Uint8ClampedArray | null} */ (null), ticket = 0;
    const view = h('canvas.focus__walk'), keepIt = h('button.btn.btn--accent.focus__go', { onclick: () => keepThere() }, 'Keep them here', h('span', { html: icon('arrow') }));
    const handle = h('button.walk', { type: 'button', hidden: true });
    const walkDock = h('div.focus__pindock.focus__walkdock', { hidden: true }, h('button.btn.btn--quiet.focus__cancel.focus__undo', { 'aria-label': 'Put them back', title: 'Put them back', html: icon('undo'), onclick: () => putBack() }), keepIt);
    pic.insertBefore(view, layer); layer.append(handle); el.append(walkDock);
    const ask = () => ({ op: 'edit', subject: print.id, refs: [], look: null, n: 1, pins: [] });
    const ins = () => ({ [print.id]: { blob: print.blob, handle: print.handle, recipe }, [from.id]: { blob: from.blob, handle: from.handle } });
    standStage(recipe, { blob: from.blob, handle: from.handle }, 384).then(s => {
      if (!s || open !== el) return;
      stage = s; at = { ...s.stand }; placeHandle(); handle.hidden = false;
      const seen = Number(localStorage.getItem('likeness:walk') || 0);
      // one hint at a time: when the sun is being introduced, this one waits for it to finish
      if (seen < 3) { localStorage.setItem('likeness:walk', String(seen + 1)); layer.append(h('span.walk__hint', { style: { left: (s.fx + at.x) * 100 + '%', ...(layer.querySelector('.sun__hint') ? { animationDelay: 'calc(var(--tempo) * 5.2s)' } : {}) } }, 'Drag them · up to step back')); }
    }).catch(() => {});
    resetWalk = () => { if (moved) putBack(true); };
    /** Whether a point on the picture is on the person, where they stand now. */
    function hits(/** @type {number} */ nx, /** @type {number} */ ny) {
      if (!stage) return false;
      const W = stage.person.width, H = stage.person.height;
      alpha ||= stage.person.getContext('2d').getImageData(0, 0, W, H).data;
      const ox = (nx * W - (stage.fx + at.x) * W) / at.s + stage.fx * W, oy = (ny * H - H) / at.s + H;
      return ox >= 0 && oy >= 0 && ox < W && oy < H && /** @type {Uint8ClampedArray} */ (alpha)[(Math.floor(oy) * W + Math.floor(ox)) * 4 + 3] > 60;
    }
    const spot = (/** @type {PointerEvent} */ e) => { const r = pic.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, r]; };
    grab = e => {
      if (!stage) return false;
      const [nx, ny] = spot(e);
      if (!hits(/** @type {number} */ (nx), /** @type {number} */ (ny))) return false;
      e.preventDefault(); resetSun?.();
      try { pic.setPointerCapture(e.pointerId); } catch { /* fine */ }
      held = { x0: e.clientX, y0: e.clientY, from: { ...at } };
      layer.querySelector('.walk__hint')?.remove();
      ticket++; view.classList.add('is-in'); el.classList.add('is-walking'); walkDock.hidden = true; dock.hidden = false;
      lifting(1); sound.play('tap');
      return true;
    };
    pic.addEventListener('pointermove', e => {
      if (!stage || mode === 'pin') return;
      if (!held) { const [nx, ny] = spot(e); pic.style.cursor = hits(/** @type {number} */ (nx), /** @type {number} */ (ny)) ? 'grab' : ''; return; }
      const r = /** @type {DOMRect} */ (spot(e)[2]), dx = (e.clientX - held.x0) / r.width, dy = (e.clientY - held.y0) / r.height;
      moveTo(held.from.x + dx, held.from.s * Math.exp(dy * 1.6));
    });
    const drop = () => { if (!held) return; held = null; el.classList.remove('is-walking'); pic.style.cursor = ''; lifting(0); settle(); };
    pic.addEventListener('pointerup', drop); pic.addEventListener('pointercancel', drop);
    handle.addEventListener('keydown', e => {
      const step = /** @type {Record<string, number[]>} */ ({ ArrowLeft: [-.04, 1], ArrowRight: [.04, 1], ArrowUp: [0, .92], ArrowDown: [0, 1.08] })[e.key];
      if (step) { e.preventDefault(); resetSun?.(); view.classList.add('is-in'); moveTo(at.x + step[0], at.s * step[1]); settle(); }
      else if (e.key === 'Enter' && moved) { e.preventDefault(); keepThere(); }
    });
    function moveTo(/** @type {number} */ x, /** @type {number} */ s) {
      const was = standWords(at);
      at = { x: Math.max(-.45, Math.min(.45, x)), s: Math.max(.35, Math.min(1.25, s)) };
      moved = Math.abs(at.x - stage.stand.x) > .02 || Math.abs(at.s - stage.stand.s) > .03;
      draw(); placeHandle();
      if (standWords(at) !== was) sound.play('tap');
    }
    /** Picked up, they rise a little and glow; put down, they settle. */
    function lifting(/** @type {number} */ to) {
      cancelAnimationFrame(liftRaf);
      if (reduced) { lift = to; draw(); return; }
      const from0 = lift, t0 = performance.now();
      const step = (/** @type {number} */ now) => { const k = Math.min(1, (now - t0) / 170); lift = from0 + (to - from0) * (1 - Math.pow(1 - k, 3)); draw(); if (k < 1) liftRaf = requestAnimationFrame(step); };
      liftRaf = requestAnimationFrame(step);
    }
    function draw() {
      if (!stage) return;
      const W = stage.back.width, H = stage.back.height, s = at.s * (1 + lift * .03);
      if (view.width !== W || view.height !== H) { view.width = W; view.height = H; }
      const x = /** @type {CanvasRenderingContext2D} */ (view.getContext('2d'));
      x.clearRect(0, 0, W, H); x.drawImage(stage.back, 0, 0);
      x.save(); x.translate((stage.fx + at.x) * W, H); x.scale(s, s); x.translate(-stage.fx * W, -H);
      if (lift > .01) { x.shadowColor = `rgba(255, 240, 205, ${(.85 * lift).toFixed(3)})`; x.shadowBlur = 20 * lift; }
      x.drawImage(stage.person, 0, 0); x.restore();
    }
    function placeHandle() {
      if (!stage) return;
      handle.style.left = (stage.fx + at.x) * 100 + '%'; handle.style.top = (1 - .32 * at.s) * 100 + '%';
      handle.setAttribute('aria-label', `Where they stand: ${standWords(at)}. Use the arrow keys to move them, up to step back.`);
    }
    /** Put down: show the picture exactly, look and all, and offer to keep them there. */
    function settle() {
      walkDock.hidden = !moved; dock.hidden = moved;
      liven(moved ? { stand: at } : {});
      if (!moved) { view.classList.remove('is-in'); return; }
      const mine = ++ticket;
      proofOf({ text: `@${print.handle}, ${standWords(at)}`, intent: ask(), stand: at }, ins(), 384, Math.round(384 * (print.h || 4) / (print.w || 3))).then(c => {
        if (!c || mine !== ticket || open !== el) return;
        const x = /** @type {CanvasRenderingContext2D} */ (view.getContext('2d')); view.width = c.width; view.height = c.height; x.drawImage(c, 0, 0);
      }).catch(() => {});
    }
    function putBack(quiet = false) { at = { ...stage.stand }; moved = false; ticket++; draw(); placeHandle(); settle(); if (!quiet) sound.play('tap'); }
    function keepThere() {
      onSend({ text: `@${print.handle}, ${standWords(at)}`, intent: ask(), pace: settings.get('pace', 'fine'), stand: { x: Math.round(at.x * 1000) / 1000, s: Math.round(at.s * 1000) / 1000 } });
      shut();
    }
  }
  /*
   * Alive. A picture the device painted knows what is in it, so while it is looked at, what could move does: stars, the
   * water, rain, the lamp going round, steam off the cup. Played over it, behind whoever stands in it; the picture itself
   * stays as it is. Again after the sun is moved or someone is, as it shows then.
   */
  async function liven(/** @type {{ sun?: number[] | null, stand?: { x: number, s: number } | null }} */ o = {}) {
    const mine = ++lifeTicket; living?.stop(); living = null;
    if (reduced) return;
    await new Promise(r => setTimeout(r, 60));
    if (mine !== lifeTicket || open !== el) return;
    const life = await lifeOf(print, from ? { blob: from.blob, handle: from.handle } : null, o).catch(e => { console.warn('life', e); return null; });
    if (!life || mine !== lifeTicket || open !== el) return;
    living = alive(pic, life, layer);
  }
  setTimeout(() => { if (open === el && !lifeTicket) liven(); }, 520);

  return { close: shut };
}
