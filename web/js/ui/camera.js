/**
 * The look camera: the world through a look, live. Each frame is sketched on the device in the look you choose (a
 * preview, labelled as one). The shutter keeps the real photograph and, when a look is on, asks the studio to paint
 * it properly. Swipe across the picture, or tap a name, to change the look.
 */
import { h, icon, stage } from '../core/dom.js';
import * as P from '../studio/painter.js';
import { LOOKS } from '../studio/looks.js';
import { app } from '../state.js';
import { sound } from '../core/sound.js';

let open = null;
export const canFilm = () => !!navigator.mediaDevices?.getUserMedia;

/** @param {{ onTake: (blob: Blob, w: number, h: number, look: any) => void, onFallback?: () => void }} o */
export function openCamera({ onTake, onFallback = () => {} }) {
  if (open) return;
  const looks = [null, ...app.looks, ...LOOKS];
  let facing = 'environment', stream = null, look = null, raf = 0, last = 0, busy = false, nameTimer = 0;
  const video = /** @type {HTMLVideoElement} */ (h('video', { autoplay: true, playsinline: true }));
  video.muted = true; video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
  const view = /** @type {HTMLCanvasElement} */ (h('canvas.camera__view'));
  const name = h('div.camera__name');
  const frameEl = h('div.camera__frame', null, view, name, h('span.camera__note', null, 'Preview · sketched on this device'));
  const strip = h('div.camera__looks', { role: 'listbox', 'aria-label': 'Looks' });
  const shutter = h('button.camera__shutter', { 'aria-label': 'Take the picture', onclick: () => take() }, h('i'));
  const flip = h('button.icon-btn.camera__flip', { 'aria-label': 'Turn the camera around', html: icon('retry'), onclick: () => { sound.play('tap'); start(facing === 'environment' ? 'user' : 'environment'); } });
  const close = h('button.icon-btn.camera__close', { 'aria-label': 'Close', html: icon('back'), onclick: () => shut() });
  const el = h('section.camera', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Camera' },
    h('header.camera__bar', null, close, h('span.camera__title.t-mono', null, 'Through a look'), flip), frameEl,
    h('footer.camera__foot', null, strip, h('div.camera__row', null, shutter)));
  stage().append(el); open = el;
  requestAnimationFrame(() => el.classList.add('is-in'));
  const small = P.make(240, 320);

  function paintStrip() {
    strip.replaceChildren(...looks.map(l => {
      const b = h('button.camera__look', { role: 'option', 'aria-selected': String(l === look), style: { '--sw': l?.ramp?.[3] || l?.halftone?.inks?.[0] || '#ffffff' }, onclick: () => choose(l) }, h('i'), l ? l.name : 'As it is');
      return b;
    }));
    strip.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
  function choose(l) {
    if (l === look) return;
    look = l; sound.play('tap'); paintStrip();
    name.textContent = l ? l.name : 'As it is';
    name.classList.remove('is-on'); void name.offsetWidth; name.classList.add('is-on');
    clearTimeout(nameTimer); nameTimer = setTimeout(() => name.classList.remove('is-on'), 1200);
  }
  function size() {
    const r = frameEl.getBoundingClientRect(), k = Math.min(devicePixelRatio || 1, 2);
    view.width = Math.max(2, Math.round(r.width * k)); view.height = Math.max(2, Math.round(r.height * k));
  }
  /** The part of the video that fills the frame, the way the viewfinder shows it. */
  function crop() {
    const vw = video.videoWidth, vh = video.videoHeight, ar = view.width / view.height;
    let sw = vw, sh = vh;
    if (vw / vh > ar) sw = vh * ar; else sh = vw / ar;
    return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
  }
  function draw(ctx, src, w, h, mirror) {
    ctx.save();
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src, 0, 0, w, h);
    ctx.restore();
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (busy || !video.videoWidth || t - last < (look ? 50 : 0)) return;
    last = t;
    const { sx, sy, sw, sh } = crop(), ctx = view.getContext('2d'), mirror = facing === 'user';
    const gh = Math.round(240 * view.height / view.width);
    if (small.height !== gh) small.height = gh;
    small.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, small.width, small.height);
    if (!look) { ctx.save(); if (mirror) { ctx.translate(view.width, 0); ctx.scale(-1, 1); } ctx.drawImage(video, sx, sy, sw, sh, 0, 0, view.width, view.height); ctx.restore(); return; }
    draw(ctx, P.grade(small, look, .95, 7), view.width, view.height, mirror);
  }
  async function start(want) {
    stream?.getTracks().forEach(tr => tr.stop());
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: want, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      facing = want; video.srcObject = stream; await video.play().catch(() => {});
      frameEl.querySelector('.camera__msg')?.remove();
      size(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    } catch {
      frameEl.append(h('div.camera__msg', null, h('p', null, 'The camera isn’t available here. Allow it in the browser, or bring a photo instead.'),
        h('button.btn.btn--accent', { onclick: () => { shut(); onFallback(); } }, 'Choose a photo')));
    }
  }
  async function take() {
    if (!video.videoWidth || busy) return;
    busy = true; sound.play('pin');
    frameEl.append(h('div.camera__flash'));
    const { sx, sy, sw, sh } = crop(), scale = Math.min(1, 1600 / Math.max(sw, sh));
    const c = P.make(sw * scale, sh * scale), ctx = c.getContext('2d');
    if (facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const blob = await P.toBlob(c, 'image/jpeg', .92);
    setTimeout(() => { shut(); onTake(blob, c.width, c.height, look); }, 240);
  }
  function shut() {
    cancelAnimationFrame(raf); stream?.getTracks().forEach(tr => tr.stop()); stream = null;
    el.classList.remove('is-in'); setTimeout(() => el.remove(), 360); open = null;
  }
  let x0 = null;
  frameEl.addEventListener('pointerdown', e => { x0 = e.clientX; });
  frameEl.addEventListener('pointerup', e => {
    if (x0 === null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) < 40) return;
    const i = looks.indexOf(look), next = looks[(i + (dx < 0 ? 1 : -1) + looks.length) % looks.length];
    choose(next);
  });
  addEventListener('resize', size);
  paintStrip();
  start(facing);
}
