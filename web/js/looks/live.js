/**
 * The live mirror: the front camera as a mirror, with a look sketched on the face as it moves. It is the same markup
 * the mirror draws over a photograph, redrawn on MediaPipe's points frame by frame, so turn your head and the look
 * turns with you. Swipe across the face, or touch a style, to change it. The shutter keeps that moment as a photo and
 * opens the mirror on it with the look already picked. All of it on the device: nothing is kept or sent until the
 * shutter, and the frame says it is a sketch.
 */
import { h, icon, stage } from '../core/dom.js';
import { reduced, flip } from '../core/motion.js';
import * as P from '../studio/painter.js';
import { follower, hairFollower, reframed, LIPS, MOUTH } from '../studio/face.js';
import { addPrint, addItem } from '../state.js';
import { studio } from '../studio/studio.js';
import { partById, styleOf, plateSVG, tintOf } from './vocab.js';
import { markup } from './markup.js';
import { coat } from './tint.js';

/** @typedef {{ part: string, style: import('./vocab.js').Style, shape?: Record<string, number>, said?: string }} Pick */

/** Whether there is a camera to be a mirror (found without asking for it). */
export async function canLive() {
  try { return !!navigator.mediaDevices?.getUserMedia && (await navigator.mediaDevices.enumerateDevices()).some(d => d.kind === 'videoinput'); }
  catch { return false; }
}

/** The parts a live sketch can show, in the order they are offered. */
const LIVE = ['bangs', 'brows', 'lashes', 'lips', 'beard', 'cut', 'colour'];
const ctx = (/** @type {HTMLCanvasElement} */ c) => /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
let current = /** @type {null | (() => void)} */ (null);

/**
 * The live mirror, on a look. Resolves with the photo taken and the look it was taken in; with a photo chosen
 * instead (by the fallback) and only the looks that were chosen (here, or before: keep); or null when it is closed.
 * @param {{ picks: Pick[], keep?: Pick[], fallback: () => Promise<any>, from?: Element | null }} o
 * @returns {Promise<{ print: any, picks: Pick[], from?: Element, face?: import('../studio/face.js').Face | null } | null>}
 */
export function openLive(o) {
  current?.();
  return new Promise(resolve => {
    let picks = o.picks.filter(q => LIVE.includes(q.part));
    if (!picks.length) { const s = styleOf('bangs', 'curtain'); if (s) picks = [{ part: 'bangs', style: s }]; }
    let part = picks[picks.length - 1]?.part || 'bangs', stream = /** @type {MediaStream | null} */ (null), raf = 0, done = false;
    let follow = /** @type {null | ((v: HTMLVideoElement, c: import('../studio/face.js').Crop, w: number, h: number) => any)} */ (null);
    let hair = /** @type {null | ((f: HTMLCanvasElement) => HTMLCanvasElement | null)} */ (null), hairAsked = false;
    let face = /** @type {any} */ (null), seen = 0, read = 0, slow = 0, chose = false;

    const video = /** @type {HTMLVideoElement} */ (h('video', { autoplay: true, playsinline: true }));
    video.muted = true; video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
    const view = /** @type {HTMLCanvasElement} */ (h('canvas.lv-view', { 'aria-hidden': 'true' }));
    const name = h('p.lv-name', { 'aria-live': 'polite' }), hint = h('p.lv-hint', null, 'Look into the camera');
    const frame = h('div.lv-frame', null, view, h('span.mr-stamp', { 'data-kind': 'sketch' }, 'Live sketch · on this device'), name, hint);
    const partsRow = h('div.mr-parts.lv-parts', { role: 'toolbar', 'aria-label': 'What to change' });
    const stylesRow = h('div.mr-styles.lv-styles', { role: 'listbox', 'aria-label': 'Styles' });
    const shutter = h('button.lv-shutter', { type: 'button', 'aria-label': 'Take it', onclick: () => take() }, h('i'));
    const gallery = h('button.lv-gallery', { type: 'button', 'aria-label': 'Choose a photo instead', title: 'Choose a photo instead', html: icon('image'), onclick: () => finish(null, true) });
    const el = h('section.lv', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Live mirror' },
      h('header.mr-bar', null, h('button.mr-bar__back', { type: 'button', 'aria-label': 'Back', html: icon('back'), onclick: () => finish(null) }), h('span.mr-bar__edition', { 'data-mode': studio.mode }, studio.label)),
      h('div.mr-stage.lv-stage', null, frame),
      h('div.mr-dock.lv-dock', null, partsRow, stylesRow, h('div.lv-row', null, gallery, shutter, h('span.lv-gap'))));
    stage().append(el);
    const was = o.from?.getBoundingClientRect() || null;
    requestAnimationFrame(() => { el.classList.add('is-in'); if (was && !reduced) flip(frame, was, { duration: 620 }); });
    current = () => finish(null);

    // —— the look: a part, its styles, one picked per part ——
    function paintParts() {
      partsRow.replaceChildren(...LIVE.map(id => { const p = partById(id); return h('button.mr-part', { type: 'button', 'data-part': id, 'aria-pressed': String(id === part), onclick: () => { part = id; paintParts(); paintStyles(); } },
        h('span.mr-part__glyph', { html: plateSVG(id, p?.styles[0].id || '') }), h('span.mr-part__name', null, p?.name || id)); }));
      partsRow.querySelectorAll('.mr-part').forEach(b => b.classList.toggle('is-picked', picks.some(q => q.part === /** @type {HTMLElement} */ (b).dataset.part)));
    }
    function paintStyles() {
      const on = picks.find(q => q.part === part)?.style.id;
      stylesRow.replaceChildren(...(partById(part)?.styles || []).map((s, i) => h('button.mr-style', { type: 'button', role: 'option', 'data-style': s.id, style: { '--d': (i * 45) + 'ms' }, 'aria-selected': String(s.id === on), onclick: () => pick(s.id) },
        h('span.mr-style__plate', { html: plateSVG(part, s.id) }), h('span.mr-style__name', null, s.name))));
      stylesRow.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    }
    /** A style for the part on show, picked (or, picked again, taken off). @param {string} id */
    function pick(id) {
      const s = styleOf(part, id); if (!s) return;
      const had = picks.find(q => q.part === part), off = had?.style.id === id; chose = true;
      picks = off ? picks.filter(q => q !== had) : [...picks.filter(q => q.part !== part), { part, style: s }];
      paintParts(); paintStyles();
      say(off ? 'As you are' : s.name + (part === 'bangs' || part === 'brows' ? ' ' + (partById(part)?.name || '').toLowerCase() : ''));
      if (part === 'colour' && !hairAsked) { hairAsked = true; hairFollower().then(f => { hair = f; }).catch(() => {}); }
    }
    /** The look's name, over the face for a moment. @param {string} text */
    function say(text) { name.textContent = text; name.classList.remove('is-on'); void name.offsetWidth; name.classList.add('is-on'); }
    // a swipe across the face: the next style for this part, or the one before
    let x0 = /** @type {number | null} */ (null);
    frame.addEventListener('pointerdown', e => { x0 = e.clientX; });
    frame.addEventListener('pointerup', e => {
      if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) < 40) return;
      const all = partById(part)?.styles || [], i = all.findIndex(s => s.id === picks.find(q => q.part === part)?.style.id);
      const next = all[(i + (dx < 0 ? 1 : -1) + all.length) % all.length]; if (next && next.id !== picks.find(q => q.part === part)?.style.id) pick(next.id);
    });

    // —— the mirror itself: each frame, the camera (mirrored, as you see yourself) and the look on the face in it ——
    const small = P.make(192, 256), tinted = P.make(192, 256);
    // its size as laid out, not as drawn: the frame may still be growing out of what was touched
    function size() { const k = Math.min(2, devicePixelRatio || 1); view.width = Math.max(2, Math.round(frame.clientWidth * k)); view.height = Math.max(2, Math.round(frame.clientHeight * k)); }
    /** The part of the camera's picture the frame shows. */
    function crop() {
      const vw = video.videoWidth, vh = video.videoHeight, ar = view.width / view.height;
      let sw = vw, sh = vh; if (vw / vh > ar) sw = vh * ar; else sh = vw / ar;
      return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
    }
    /** @param {number} now */
    function tick(now) {
      raf = requestAnimationFrame(tick);
      if (!video.videoWidth) return;
      const c = crop(), x = ctx(view), w = view.width, hh = view.height;
      // the face is read as often as the device keeps up with, and drawn on every frame between; its points are turned
      // round with the picture, as you see yourself, so a look that leans one way leans that way here and in the photo
      if (follow && now - read > slow) {
        const t0 = performance.now(); read = now;
        let f = null; try { f = follow(video, c, w, hh); } catch { f = null; }
        face = f ? reframed(f, w, hh, true) : null; if (face) seen = now;
        const took = performance.now() - t0; slow = Math.min(400, Math.max(28, took * 1.1)); el.dataset.read = String(Math.round(took));
      }
      const there = !!face && now - seen < 450, colour = picks.find(q => q.part === 'colour'), tint = there && colour && hair ? tintOf('colour', colour.style.id, colour.shape?.shade || 0) : '';
      x.save(); x.translate(w, 0); x.scale(-1, 1);
      x.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, w, hh);
      if (tint) hairOf(x, c, tint);
      x.restore();
      if (there) look(x, face);
      el.classList.toggle('has-face', there);
    }
    /** The picks on a face (the hair, if it is recoloured, is already done): the lips tinted, then the strokes. @param {CanvasRenderingContext2D} x @param {any} f */
    function look(x, f) {
      for (const q of picks) {
        const tint = q.part === 'lips' && tintOf(q.part, q.style.id, q.shape?.shade || 0);
        if (tint) lips(x, f, tint);
      }
      x.strokeStyle = '#fff4e0'; x.lineCap = 'round'; x.lineJoin = 'round'; x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = Math.max(2, view.width / 320);
      for (const q of picks) for (const s of markup(f, q.part, q.style.id, q.shape)) { x.lineWidth = s.w; x.stroke(new Path2D(s.d)); }
      x.shadowBlur = 0;
    }
    /** The lips tinted, between their outline and the mouth. @param {CanvasRenderingContext2D} x @param {any} f @param {string} tint */
    function lips(x, f, tint) {
      const path = new Path2D();
      for (const ring of [LIPS, MOUTH]) { ring.forEach((i, k) => (k ? path.lineTo(f.pts[i].x, f.pts[i].y) : path.moveTo(f.pts[i].x, f.pts[i].y))); path.closePath(); }
      x.save(); x.clip(path, 'evenodd'); coat(x, tint, 'lips'); x.restore();
    }
    /** The hair recoloured: a small copy of the frame, its hair found a few times a second, tinted and laid back over it. @param {CanvasRenderingContext2D} x @param {import('../studio/face.js').Crop} c @param {string} tint */
    function hairOf(x, c, tint) {
      const sw = small.width, sh = Math.round(sw * view.height / view.width);
      if (small.height !== sh) { small.height = sh; tinted.height = sh; }
      ctx(small).drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, sw, sh);
      const m = hair?.(small); if (!m) return;
      const t = ctx(tinted); t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1; t.clearRect(0, 0, sw, sh); t.drawImage(small, 0, 0);
      coat(t, tint, 'colour');
      t.globalCompositeOperation = 'destination-in'; t.globalAlpha = 1; t.drawImage(m, 0, 0, sw, sh);
      x.drawImage(tinted, 0, 0, view.width, view.height);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (done) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream; await video.play().catch(() => {});
        size(); raf = requestAnimationFrame(tick);
        follow = await follower().catch(() => null);
        if (picks.some(q => q.part === 'colour')) { hairAsked = true; hair = await hairFollower().catch(() => null); }
      } catch {
        el.classList.add('no-camera');
        frame.append(h('div.lv-msg', null, h('p', null, 'The camera isn’t available here. Allow it in the browser, or choose a photo instead.'),
          h('button.lv-msg__go', { type: 'button', onclick: () => finish(null, true) }, 'Choose a photo')));
      }
    }
    /** The shutter: this moment kept, as you saw it, and the mirror opened on it with the look picked. */
    async function take() {
      if (!video.videoWidth || done) return;
      // the moment held: the frame stops where it is (the reading with it) while the photo is kept
      cancelAnimationFrame(raf); follow = null;
      const held = face && performance.now() - seen < 450 ? face : null;
      frame.append(h('div.lv-flash')); el.classList.add('is-taking');
      const c = crop(), k = Math.min(1, 1600 / Math.max(c.sw, c.sh)), still = P.make(Math.round(c.sw * k), Math.round(c.sh * k)), x = ctx(still);
      x.translate(still.width, 0); x.scale(-1, 1); x.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, still.width, still.height);
      const blob = await P.toBlob(still, 'image/jpeg', .92);
      const p = await addPrint({ blob, w: still.width, h: still.height, origin: 'upload', provenance: { kind: 'photo', label: 'Your picture' } });
      studio.engine.glance?.(p);
      await addItem({ type: 'prints', prints: [p.id], mine: true });
      // the face, as it was read at that moment, goes with the photo: the mirror has it at once, with the look on it
      const known = held ? reframed(held, still.width, still.height) : null;
      setTimeout(() => finish({ print: p, picks, from: frame, face: known }), reduced ? 0 : 280);
    }
    /** @param {{ print: any, picks: Pick[], from?: Element, face?: any } | null} result @param {boolean} [instead] a photo chosen instead */
    function finish(result, instead = false) {
      if (done) return; done = true; if (current) current = null;
      cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null;
      removeEventListener('resize', size); document.removeEventListener('keydown', onKey);
      el.classList.remove('is-in'); setTimeout(() => el.remove(), reduced ? 0 : 380);
      // a photo chosen instead takes only the looks someone chose, not the one the mirror opened on to show itself
      if (instead) o.fallback().then(p => resolve(p ? { print: p, picks: chose ? picks : o.keep || o.picks } : null), () => resolve(null)); else resolve(result);
    }
    const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') finish(null); };
    document.addEventListener('keydown', onKey);
    addEventListener('resize', size);
    paintParts(); paintStyles();
    const first = picks.find(q => q.part === part); if (first) say(first.style.name + (part === 'bangs' || part === 'brows' ? ' ' + (partById(part)?.name || '').toLowerCase() : ''));
    start();
  });
}
