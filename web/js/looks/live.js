/**
 * The live mirror: the front camera as a mirror, with a look sketched on the face as it moves. It is the same markup
 * the mirror draws over a photograph, redrawn on MediaPipe's points frame by frame, so turn your head and the look
 * turns with you. Swipe across the face for the next style; touch a part and the mirror shows every style of it on you
 * at once, live, each close on the part, to touch the one you want. The shutter keeps that moment as a photo and
 * opens the mirror on it with the look already picked. Or turn your head: the mirror catches you from the front and
 * from each side, the look on each, and opens on all three, to turn through. All of it on the device: nothing is kept or
 * sent until the shutter (or the last side), and the frame says it is a sketch.
 */
import { h, icon, stage } from '../core/dom.js';
import { reduced, flip } from '../core/motion.js';
import * as P from '../studio/painter.js';
import { follower, hairFollower, reframed, clearNotHair, bearded, faceOf, yawOf, LIPS, MOUTH } from '../studio/face.js';
import { addPrint, addItem } from '../state.js';
import { studio } from '../studio/studio.js';
import { partById, styleOf, plateSVG, tintOf } from './vocab.js';
import { markup } from './markup.js';
import { coat } from './tint.js';

/** @typedef {{ part: string, style: import('./vocab.js').Style, shape?: Record<string, number>, said?: string }} Pick */
/** One side of you, caught: the picture with the look on it, and the face in it (null where it could not be read again). @typedef {{ src: string, face?: import('../studio/face.js').Face | null }} Side */

/** Whether there is a camera to be a mirror (found without asking for it). */
export async function canLive() {
  try { return !!navigator.mediaDevices?.getUserMedia && (await navigator.mediaDevices.enumerateDevices()).some(d => d.kind === 'videoinput'); }
  catch { return false; }
}

/** The parts a live sketch can show, in the order they are offered. */
const LIVE = ['bangs', 'brows', 'lashes', 'lips', 'beard', 'cut', 'colour'];
/** How long the picture takes to come apart into tiles, or back. */
const GRID_MS = 560;
const pc = (/** @type {number} */ v) => (v * 100).toFixed(3) + '%';
const ease = (/** @type {number} */ t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix = (/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {number} */ t) => a.map((v, i) => v + (b[i] - v) * t);
/** Where n tiles go in a w × h picture ([x, y, w, h] each): two across (three past six), the last row centred. @param {number} n @param {number} w @param {number} hh */
function cells(n, w, hh) {
  const cols = n > 6 ? 3 : 2, rows = Math.max(1, Math.ceil(n / cols)), g = w * .024, cw = (w - g * (cols + 1)) / cols, ch = (hh - g * (rows + 1)) / rows;
  return Array.from({ length: n }, (_, i) => { const r = Math.floor(i / cols), row = Math.min(cols, n - r * cols), off = (cols - row) * (cw + g) / 2; return [g + off + (i % cols) * (cw + g), g + r * (ch + g), cw, ch]; });
}
/**
 * What a tile shows of the picture: close on the part, at least as wide as the face, in the tile's proportions.
 * @param {import('../studio/face.js').Face} f @param {string} part @param {number} aspect width over height
 */
function partCrop(f, part, aspect) {
  const [bx, by, bw, bh] = f.box, P = (/** @type {number} */ i) => f.pts[i], cx = bx + bw / 2;
  const [x, y, tall] = ({ bangs: [cx, by + bh * .3, bh * 1.35], brows: [cx, (P(105).y + P(159).y) / 2, bh * .62], lashes: [cx, (P(159).y + P(386).y) / 2, bh * .5], lips: [P(13).x, (P(13).y + P(14).y) / 2, bh * .55], beard: [cx, (P(1).y + P(152).y) / 2 + bh * .05, bh], cut: [cx, by + bh * .55, bh * 2.1], colour: [cx, by + bh * .25, bh * 1.7] })[part] || [cx, by + bh * .5, bh * 1.6];
  let ch = tall, cw = ch * aspect; if (cw < bw * 1.02) { cw = bw * 1.02; ch = cw / aspect; }
  return [x - cw / 2, y - ch / 2, cw, ch];
}
/** The middle of a w × h picture, in a tile's proportions. @param {number} w @param {number} hh @param {number} aspect */
const fitCrop = (w, hh, aspect) => (aspect > w / hh ? [0, (hh - w / aspect) / 2, w, w / aspect] : [(w - hh * aspect) / 2, 0, hh * aspect, hh]);
const ctx = (/** @type {HTMLCanvasElement} */ c) => /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
let current = /** @type {null | (() => void)} */ (null);

/**
 * The live mirror, on a look. Resolves with the photo taken and the look it was taken in; with a photo chosen
 * instead (by the fallback) and only the looks that were chosen (here, or before: keep); or null when it is closed.
 * @param {{ picks: Pick[], keep?: Pick[], fallback: () => Promise<any>, from?: Element | null }} o
 * @returns {Promise<{ print: any, picks: Pick[], from?: Element, face?: import('../studio/face.js').Face | null, turns?: Side[] } | null>}
 */
export function openLive(o) {
  current?.();
  return new Promise(resolve => {
    let picks = o.picks.filter(q => LIVE.includes(q.part));
    if (!picks.length) { const s = styleOf('bangs', 'curtain'); if (s) picks = [{ part: 'bangs', style: s }]; }
    let part = picks[picks.length - 1]?.part || 'bangs', stream = /** @type {MediaStream | null} */ (null), raf = 0, done = false;
    let follow = /** @type {null | ((v: HTMLVideoElement, c: import('../studio/face.js').Crop, w: number, h: number) => any)} */ (null);
    let hair = /** @type {null | ((f: HTMLCanvasElement, now?: boolean) => HTMLCanvasElement | null)} */ (null), hairAsked = false;
    let face = /** @type {any} */ (null), seen = 0, read = 0, slow = 0, chose = false;
    // every style of a part, on you at once: the part shown as tiles, how far apart they have come (0 one picture, 1 all
    // apart), when that began and which way, and the tile the picture closes on
    let grid = '', gt = 0, gAt = 0, gDir = 0, lead = '', nudged = false;
    // every side of you: what has been caught (front, one side, the other: the picture with the look on it), the front
    // kept clean as well for the photo, how far the head is turned now, and how long it has been in the side it is in
    let sides = /** @type {null | { got: Record<string, Promise<Side>>, front: null | { still: HTMLCanvasElement, face: any }, yaw: number, zone: string, since: number }} */ (null);

    const video = /** @type {HTMLVideoElement} */ (h('video', { autoplay: true, playsinline: true }));
    video.muted = true; video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
    const view = /** @type {HTMLCanvasElement} */ (h('canvas.lv-view', { 'aria-hidden': 'true' }));
    const name = h('p.lv-name', { 'aria-live': 'polite' }), hint = h('p.lv-hint', null, 'Look into the camera');
    const tiles = h('div.lv-tiles', { role: 'listbox', 'aria-label': 'Every style, on you' });
    const dot = h('span.lv-level__dot', { 'aria-hidden': 'true' }), told = h('p.lv-level__say', { 'aria-live': 'polite' });
    const level = h('div.lv-level', null, h('span.lv-level__track', { 'aria-hidden': 'true' }), ...['a', 'front', 'b'].map(z => h('span.lv-level__mark', { 'data-side': z, 'aria-hidden': 'true' })), dot, told);
    const frame = h('div.lv-frame', null, view, tiles, h('span.mr-stamp', { 'data-kind': 'sketch' }, 'Live sketch · on this device'), name, hint, level);
    const partsRow = h('div.mr-parts.lv-parts', { role: 'toolbar', 'aria-label': 'What to change' });
    const shutter = h('button.lv-shutter', { type: 'button', 'aria-label': 'Take it', onclick: () => take() }, h('i'));
    const gallery = h('button.lv-gallery', { type: 'button', 'aria-label': 'Choose a photo instead', title: 'Choose a photo instead', html: icon('image'), onclick: () => finish(null, true) });
    const turnsBtn = h('button.lv-turns', { type: 'button', 'aria-label': 'Every side of you: turn your head', title: 'Every side of you', 'aria-pressed': 'false', html: icon('orbit'), onclick: () => turning() });
    const el = h('section.lv', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Live mirror' },
      h('header.mr-bar', null, h('button.mr-bar__back', { type: 'button', 'aria-label': 'Back', html: icon('back'), onclick: () => finish(null) }), h('span.mr-bar__edition', { 'data-mode': studio.mode }, studio.label)),
      h('div.mr-stage.lv-stage', null, frame),
      h('div.mr-dock.lv-dock', null, partsRow, h('div.lv-row', null, gallery, shutter, turnsBtn)));
    stage().append(el);
    const was = o.from?.getBoundingClientRect() || null;
    requestAnimationFrame(() => { el.classList.add('is-in'); if (was && !reduced) flip(frame, was, { duration: 620 }); });
    current = () => finish(null);

    // —— the look: a part, its styles, one picked per part ——
    function paintParts() {
      partsRow.replaceChildren(...LIVE.map(id => {
        const p = partById(id), on = picks.find(q => q.part === id)?.style;
        return h('button.mr-part', { type: 'button', 'data-part': id, 'data-style': on?.id || '', 'aria-pressed': String(id === grid), 'aria-label': (p?.name || id) + (on ? ': ' + on.name : ''), onclick: () => (grid === id && gDir >= 0 ? closeGrid() : openGrid(id)) },
          h('span.mr-part__glyph', { html: plateSVG(id, p?.styles[0].id || '') }), h('span.mr-part__name', null, p?.name || id));
      }));
      partsRow.querySelectorAll('.mr-part').forEach(b => b.classList.toggle('is-picked', picks.some(q => q.part === /** @type {HTMLElement} */ (b).dataset.part)));
    }
    /** A part's styles as tiles over the mirror, each a button over its own picture of you. */
    function paintTiles() {
      const all = partById(grid)?.styles || [], on = picks.find(q => q.part === grid)?.style.id, at = cells(all.length, 1, view.height / view.width || 4 / 3);
      tiles.replaceChildren(...all.map((s, i) => h('button.lv-tile', { type: 'button', role: 'option', 'data-style': s.id, 'aria-selected': String(s.id === on), style: { borderRadius: (frame.clientWidth * .035).toFixed(1) + 'px', left: pc(at[i][0]), top: pc(at[i][1] / (view.height / view.width || 4 / 3)), width: pc(at[i][2]), height: pc(at[i][3] / (view.height / view.width || 4 / 3)), '--i': i }, onclick: () => { const was = picks.find(q => q.part === grid)?.style.id; pick(s.id); closeGrid(was === s.id ? '' : s.id); } },
        h('span.lv-tile__name', null, s.name))));
    }
    /** Every style of a part, on you: the picture comes apart into a tile for each. @param {string} id */
    function openGrid(id) {
      if (!partById(id)) return;
      if (sides) turning();
      part = id; grid = id; lead = picks.find(q => q.part === id)?.style.id || ''; gDir = 1; gAt = performance.now() - (gt * GRID_MS);
      paintParts(); paintTiles(); frame.classList.add('is-grid');
      if (id === 'colour' && !hairAsked) { hairAsked = true; hairFollower().then(f => { hair = f; }).catch(() => {}); }
    }
    /** Back to the one picture, closing on the tile chosen (or the look as it is). @param {string} [on] */
    function closeGrid(on) {
      if (!grid) return;
      lead = on ?? picks.find(q => q.part === grid)?.style.id ?? ''; gDir = -1; gAt = performance.now() - ((1 - gt) * GRID_MS);
      frame.classList.remove('is-grid'); paintParts();
    }
    /** A style for the part on show, picked (or, picked again, taken off). @param {string} id */
    function pick(id) {
      const s = styleOf(part, id); if (!s) return;
      const had = picks.find(q => q.part === part), off = had?.style.id === id; chose = true;
      picks = off ? picks.filter(q => q !== had) : [...picks.filter(q => q.part !== part), { part, style: s }];
      paintParts(); if (grid) paintTiles();
      say(off ? 'As you are' : s.name + (part === 'bangs' || part === 'brows' ? ' ' + (partById(part)?.name || '').toLowerCase() : ''));
      if (part === 'colour' && !hairAsked) { hairAsked = true; hairFollower().then(f => { hair = f; }).catch(() => {}); }
    }
    /** The look's name, over the face for a moment. @param {string} text */
    function say(text) { name.textContent = text; name.classList.remove('is-on'); void name.offsetWidth; name.classList.add('is-on'); }
    // a swipe across the face: the next style for this part, or the one before
    let x0 = /** @type {number | null} */ (null);
    frame.addEventListener('pointerdown', e => { x0 = e.clientX; });
    frame.addEventListener('pointerup', e => {
      if (x0 == null || grid) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) < 40) return;
      const all = partById(part)?.styles || [], i = all.findIndex(s => s.id === picks.find(q => q.part === part)?.style.id);
      const next = all[(i + (dx < 0 ? 1 : -1) + all.length) % all.length]; if (next && next.id !== picks.find(q => q.part === part)?.style.id) pick(next.id);
    });

    // —— the mirror itself: each frame, the camera (mirrored, as you see yourself) and the look on the face in it ——
    const small = P.make(192, 256), base = P.make(2, 2);
    let mask = /** @type {HTMLCanvasElement | null} */ (null);
    /** @type {Map<string, { c: HTMLCanvasElement, at: number }>} each colour laid on the hair, kept a moment (a tile each) */
    const tints = new Map();
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
      const there = !!face && now - seen < 450;
      // the camera, mirrored as you see yourself, once a frame: the view, or each of its tiles, is drawn from it
      if (base.width !== w || base.height !== hh) { base.width = w; base.height = hh; }
      const b = ctx(base); b.save(); b.translate(w, 0); b.scale(-1, 1); b.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, w, hh); b.restore();
      if (hair && (grid === 'colour' || picks.some(q => q.part === 'colour'))) hairMask();
      // how far the tiles have come apart
      if (gDir) { const p = Math.min(1, (now - gAt) / (reduced ? 1 : GRID_MS)); gt = gDir > 0 ? p : 1 - p; if (p >= 1) { if (gDir < 0) { grid = ''; tiles.replaceChildren(); } gDir = 0; } }
      x.setTransform(1, 0, 0, 1, 0, 0);
      const full = [0, 0, w, hh];
      if (!grid) draw(x, picks, there, full, full, 1, 0);
      else {
        // every style of the part, on you: the picture comes apart into tiles, each close on the part, the one picked on top
        x.fillStyle = '#0d0a09'; x.fillRect(0, 0, w, hh);
        const all = partById(grid)?.styles || [], at = cells(all.length, w, hh), e = ease(gt);
        const order = all.map((_, i) => i).sort((i, j) => Number(all[i].id === lead) - Number(all[j].id === lead));
        for (const i of order) {
          const s = all[i], aspect = at[i][2] / at[i][3], to = there ? partCrop(face, grid, aspect) : fitCrop(w, hh, aspect);
          draw(x, [...picks.filter(q => q.part !== grid), { part: grid, style: s }], there, mix(full, at[i], e), mix(full, to, e), gDir < 0 && s.id !== lead ? e : 1, e * w * .035);
        }
      }
      el.classList.toggle('has-face', there);
      if (sides && there) sideways(now);
      // a head turned to see the look from the side, before every side was asked for: the button that catches them says so, once
      else if (there && !nudged && !grid && Math.abs(yawOf(face)) > .4) { nudged = true; turnsBtn.classList.add('is-nudged'); setTimeout(() => turnsBtn.classList.remove('is-nudged'), 4200); }
    }

    // —— every side of you: turn your head, and the front and each side are caught as you pass them ——
    function turning() {
      if (sides) { sides = null; frame.classList.remove('is-sides'); turnsBtn.setAttribute('aria-pressed', 'false'); return; }
      if (grid) closeGrid();
      sides = { got: {}, front: null, yaw: 0, zone: '', since: 0 };
      level.querySelectorAll('.lv-level__mark').forEach(m => { m.classList.remove('is-caught'); /** @type {HTMLElement} */ (m).style.backgroundImage = ''; });
      frame.classList.add('is-sides'); turnsBtn.setAttribute('aria-pressed', 'true');
      tell('Turn slowly to one side, then the other');
    }
    /** What the level says, coming in when it changes. @param {string} text */
    function tell(text) {
      if (told.textContent === text) return;
      told.textContent = text;
      if (!reduced) told.animate([{ opacity: 0, translate: '0 .8em' }, { opacity: 1, translate: '0 0' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    /** How far the head is turned (the nose between the cheeks, as you see it), shown on the level; held in a side, that side is caught. @param {number} now */
    function sideways(now) {
      const s = /** @type {NonNullable<typeof sides>} */ (sides);
      s.yaw = s.yaw * .55 + yawOf(face) * .45;
      dot.style.left = pc(.5 + Math.max(-.6, Math.min(.6, s.yaw)) / 1.2 * .84);
      const zone = Math.abs(s.yaw) < .09 ? 'front' : s.yaw < -.32 ? 'a' : s.yaw > .32 ? 'b' : '';
      if (zone !== s.zone) { s.zone = zone; s.since = now; }
      if (zone && !s.got[zone] && now - s.since > 160) catchSide(zone);
    }
    /**
     * One side of you, caught: the frame as it is, kept at once (with the hair's new colour, read again in this very
     * frame), a soft flash; then the face in it read whole (the one followed is smoothed over the frames before), the
     * look drawn on that face, and its mark on the level filled with it. The mirror turns each side towards the next by
     * these faces, so they meet with nothing doubled.
     * @param {string} zone
     */
    function catchSide(zone) {
      const s = sides; if (!s) return;
      const w = view.width, hh = view.height, clean = P.make(w, hh); ctx(clean).drawImage(base, 0, 0);
      const colour = picks.find(q => q.part === 'colour'), followed = face, still = zone === 'front' ? stillNow() : null;
      let tint = /** @type {HTMLCanvasElement | null} */ (null);
      if (hair && colour) {
        hairMask(true);
        const t = hairTint(tintOf('colour', colour.style.id, colour.shape?.shade || 0));
        if (t) { tint = P.make(t.width, t.height); ctx(tint).drawImage(t, 0, 0); }
      }
      s.got[zone] = (async () => {
        const f = (await faceOf(clean).catch(() => null)) || followed;
        const shot = P.make(w, hh), x = ctx(shot); x.drawImage(clean, 0, 0);
        if (tint) x.drawImage(tint, 0, 0, w, hh);
        if (f) look(x, f, picks);
        const src = shot.toDataURL('image/jpeg', .86);
        if (still) s.front = { still, face: f };
        const m = /** @type {HTMLElement | null} */ (level.querySelector('.lv-level__mark[data-side="' + zone + '"]'));
        if (m) { m.style.backgroundImage = 'url("' + src + '")'; m.classList.add('is-caught'); }
        return { src, face: f };
      })();
      const fl = h('div.lv-flash.is-soft'); frame.append(fl); setTimeout(() => fl.remove(), 700);
      const n = Object.keys(s.got).length;
      tell(n === 3 ? 'Every side of you' : !s.got.front ? 'Now look straight at the camera' : n === 1 ? 'Now slowly to one side' : 'And the other side');
      if (n === 3) {
        cancelAnimationFrame(raf); follow = null; el.classList.add('is-taking');
        // in the order the mirror turns through them, as with the studio's angles: the nose to the right, straight on, to the left
        Promise.all(['b', 'front', 'a'].map(z => s.got[z])).then(turns => setTimeout(() => { if (s.front) keep(s.front.still, s.front.face, turns); }, reduced ? 0 : 700));
      }
    }
    /**
     * The mirror, or one tile of it: the part of the camera's picture in crop, filling rect, with the looks in ps on the face.
     * @param {CanvasRenderingContext2D} x @param {Pick[]} ps @param {boolean} there @param {number[]} rect @param {number[]} crop @param {number} alpha @param {number} radius
     */
    function draw(x, ps, there, rect, crop, alpha, radius) {
      const [tx, ty, tw, th] = rect, [cx, cy, cw, ch] = crop, k = Math.max(tw / cw, th / ch), ox = tx + (tw - cw * k) / 2 - cx * k, oy = ty + (th - ch * k) / 2 - cy * k;
      x.save(); x.globalAlpha = alpha;
      if (radius > .5) { x.beginPath(); x.roundRect(tx, ty, tw, th, radius); x.clip(); }
      // only the part of the picture that shows in the rectangle is drawn (a tile is a small part of it)
      const sx = Math.max(0, (tx - ox) / k), sy = Math.max(0, (ty - oy) / k), sw = Math.min(base.width, (tx + tw - ox) / k) - sx, sh = Math.min(base.height, (ty + th - oy) / k) - sy;
      if (sw > 0 && sh > 0) {
        x.drawImage(base, sx, sy, sw, sh, sx * k + ox, sy * k + oy, sw * k, sh * k);
        const colour = ps.find(q => q.part === 'colour'), tint = there && colour && mask ? tintOf('colour', colour.style.id, colour.shape?.shade || 0) : '';
        const t = tint ? hairTint(tint) : null, s = t ? t.width / base.width : 1;
        if (t) x.drawImage(t, sx * s, sy * s, sw * s, sh * s, sx * k + ox, sy * k + oy, sw * k, sh * k);
      }
      x.setTransform(k, 0, 0, k, ox, oy);
      if (there) look(x, face, ps, k);
      x.restore();
    }
    /** The looks on a face (the hair, if it is recoloured, is already done): the lips tinted, then the strokes, a little finer up close. @param {CanvasRenderingContext2D} x @param {any} f @param {Pick[]} ps @param {number} [k] */
    function look(x, f, ps, k = 1) {
      for (const q of ps) {
        const tint = q.part === 'lips' && tintOf(q.part, q.style.id, q.shape?.shade || 0);
        if (tint) lips(x, f, tint);
      }
      x.strokeStyle = '#fff4e0'; x.lineCap = 'round'; x.lineJoin = 'round'; x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = Math.max(2, view.width / 320);
      const fine = 1 / Math.sqrt(Math.max(1, k));
      for (const q of ps) for (const s of markup(f, q.part, q.style.id, q.shape)) { x.lineWidth = s.w * fine; x.stroke(new Path2D(s.d)); }
      x.shadowBlur = 0;
    }
    /** The lips tinted, between their outline and the mouth. @param {CanvasRenderingContext2D} x @param {any} f @param {string} tint */
    function lips(x, f, tint) {
      const path = new Path2D();
      for (const ring of [LIPS, MOUTH]) { ring.forEach((i, k) => (k ? path.lineTo(f.pts[i].x, f.pts[i].y) : path.moveTo(f.pts[i].x, f.pts[i].y))); path.closePath(); }
      x.save(); x.clip(path, 'evenodd'); coat(x, tint, 'lips'); x.restore();
    }
    /** The hair, found a few times a second in a small copy of the picture (the last mask kept between). */
    function hairMask(now = false) {
      const sw = small.width, sh = Math.round(sw * base.height / base.width);
      if (small.height !== sh) { small.height = sh; tints.clear(); }
      ctx(small).drawImage(base, 0, 0, sw, sh);
      mask = hair?.(small, now) || mask;
      if (now) tints.clear();
    }
    /** The hair recoloured: the small copy coated and kept only where the hair is, to lay over the picture (made again when a few frames old). @param {string} tint */
    function hairTint(tint) {
      if (!mask) return null;
      let k = tints.get(tint); const now = performance.now();
      if (k && now - k.at < 90) return k.c;
      if (!k) { k = { c: P.make(small.width, small.height), at: 0 }; tints.set(tint, k); }
      const t = ctx(k.c); k.at = now;
      t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1; t.clearRect(0, 0, k.c.width, k.c.height); t.drawImage(small, 0, 0);
      coat(t, tint, 'colour');
      t.globalCompositeOperation = 'destination-in'; t.drawImage(mask, 0, 0, k.c.width, k.c.height);
      // the hair on the head, not a beard or the brows (the segmenter counts them as hair), as in the mirror
      if (face) { t.filter = 'blur(1px)'; clearNotHair(t, face, bearded(small, face), k.c.width / base.width); t.filter = 'none'; }
      t.globalCompositeOperation = 'source-over';
      return k.c;
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
      await keep(stillNow(), held);
    }
    /** The camera's picture as it is now, mirrored as you see yourself, at up to 1600 pixels. */
    function stillNow() {
      const c = crop(), k = Math.min(1, 1600 / Math.max(c.sw, c.sh)), still = P.make(Math.round(c.sw * k), Math.round(c.sh * k)), x = ctx(still);
      x.translate(still.width, 0); x.scale(-1, 1); x.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, still.width, still.height);
      return still;
    }
    /**
     * A still kept as your photo, and the mirror opened on it with the look picked (and every side of you, if caught).
     * @param {HTMLCanvasElement} still @param {any} held the face read in it @param {Side[]} [turns]
     */
    async function keep(still, held, turns) {
      const blob = await P.toBlob(still, 'image/jpeg', .92);
      const p = await addPrint({ blob, w: still.width, h: still.height, origin: 'upload', provenance: { kind: 'photo', label: 'Your picture' } });
      studio.engine.glance?.(p);
      await addItem({ type: 'prints', prints: [p.id], mine: true });
      // the face, as it was read at that moment, goes with the photo: the mirror has it at once, with the look on it
      const known = held ? reframed(held, still.width, still.height) : null;
      setTimeout(() => finish({ print: p, picks, from: frame, face: known, ...(turns ? { turns } : {}) }), reduced ? 0 : 280);
    }
    /** @param {{ print: any, picks: Pick[], from?: Element, face?: any, turns?: Side[] } | null} result @param {boolean} [instead] a photo chosen instead */
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
    paintParts();
    const first = picks.find(q => q.part === part); if (first) say(first.style.name + (part === 'bangs' || part === 'brows' ? ' ' + (partById(part)?.name || '').toLowerCase() : ''));
    start();
  });
}
