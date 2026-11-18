/**
 * A picture, up close, in a lightbox lit by its own colours. From here you can pin parts of it and write what each
 * should become (the retoucher's marks), give it a new backdrop or look, ask for variations, keep it, or save it.
 * Hold the picture to see what it was made from.
 */
import { h, icon, toast, stage } from '../core/dom.js';
import { flip, reduced } from '../core/motion.js';
import { glyph } from '../room/ornaments.js';
import { app, urlOf, printById, setKept, settings } from '../state.js';
import { atmosphere } from '../room/theme.js';
import { sound } from '../core/sound.js';
import { sky } from '../room/sky.js';
import * as P from '../studio/painter.js';
import { selectAt, brush, loadSegmenter } from '../studio/segment.js';
import { pinMark } from './cards.js';

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
  const img = h('img.focus__img', { src: url, alt: `Picture ${print.handle}`, draggable: false });
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
    return h('div.focus__hint.focus__hint--lineage', null, strip, h('span.lineage__tip', null, 'Hold the picture to compare with ' + (parent?.handle || 'the one before')));
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
    open = null; removeEventListener('popstate', onPop); ro.disconnect();
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
  function save() {
    const a = h('a', { href: url, download: `likeness-${print.handle.toLowerCase()}-${new Date(print.createdAt).toISOString().slice(0, 10)}.${print.blob.type === 'image/png' ? 'png' : 'jpg'}` });
    document.body.append(a); a.click(); a.remove(); toast('Saved');
  }

  /* Hold to compare. */
  let holdTimer = 0;
  pic.addEventListener('pointerdown', e => {
    if (mode === 'pin') return pinDown(e);
    if (!before) return;
    holdTimer = setTimeout(() => { before.classList.add('is-in'); hint.textContent = 'Before'; }, 160);
  });
  const release = () => { clearTimeout(holdTimer); if (before?.classList.contains('is-in')) { before.classList.remove('is-in'); hint.textContent = 'Hold the picture to see what it was made from'; } };
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
  return { close: shut };
}
