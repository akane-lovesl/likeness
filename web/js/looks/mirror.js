/**
 * The mirror: one face, and what it could look like. The face is read where it is, on the device: a line of light
 * passes down it, its points light up, the parts a look can change outline themselves, and each becomes a place to
 * touch. Pick a part on the face or by name, a style for it by its drawing, a few words if you like, and try it on.
 * A live studio sends back four takes to scrub through and keep, and then every angle of the one kept. In the
 * showcase the change is sketched over the face instead, and says so.
 */
import { h, icon, toast, chooseFiles, stage, clamp } from '../core/dom.js';
import { drag, flip, spring, reduced } from '../core/motion.js';
import { on } from '../core/bus.js';
import { progressAt } from '../core/estimate.js';
import { studio } from '../studio/studio.js';
import * as P from '../studio/painter.js';
import { faceOf, contoursOf, shapesOf, maskOf, partAt, hairOf } from '../studio/face.js';
import { addPrint, addItem, setKept, printById, urlOf, settings } from '../state.js';
import { runTurn } from '../ui/turn.js';
import { PARTS, partById, styleOf, wordsFor, titleOf, plateSVG, partsIn, tintOf } from './vocab.js';
import { markup, controlsOf } from './markup.js';
import { turner } from './turn.js';

const SVG = 'http://www.w3.org/2000/svg';
const INK = '#fff4e0';
/** What else could be said about each part, shown in the empty line. */
const HINTS = /** @type {Record<string, string>} */ ({ bangs: 'a little longer, parted off-centre', brows: 'a touch fuller at the front', colour: 'with soft lowlights', cut: 'keep the length at the back', lashes: 'subtle, for daytime', lips: 'a little sheer', beard: 'neat along the cheeks' });

/** @typedef {{ part: string, style: import('./vocab.js').Style, shape?: Record<string, number>, said?: string }} Pick a style picked for a part, shaped (see markup.js) and saying so */
/** @typedef {{ part: string, style: string, words?: string, image: string, takes?: string[], angles?: string[] }} Look */
/** @typedef {{ id: string, name?: string, kind?: string, portrait: string, looks: Look[] }} Person */
/** @typedef {{ url: string, label: string, kind: string, print?: any, picks?: Pick[], look?: Look, pending?: boolean, p?: number }} Take */

let current = /** @type {{ close: (now?: boolean) => void } | null} */ (null);

/** A photo chosen from the device, kept as a print on the desk. @returns {Promise<any | null>} */
export async function bringPhoto() {
  const [f] = await chooseFiles({ multiple: false }); if (!f) return null;
  try {
    const c = await P.fromBlob(f, 1600), blob = await P.toBlob(c, 'image/jpeg', .92);
    const p = await addPrint({ blob, w: c.width, h: c.height, origin: 'upload', provenance: { kind: 'photo', label: 'Your picture' } });
    studio.engine.glance?.(p);
    await addItem({ type: 'prints', prints: [p.id], mine: true });
    return p;
  } catch { toast('That photo could not be opened'); return null; }
}

/** A picture as a canvas to read, from a print's blob or an example's address. @param {Blob | string} src */
async function canvasOf(src) {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
  return P.fromBlob(blob, 1024);
}
/** What a picture is, in a word, for its stamp. @param {any} p */
const labelOf = (p) => ({ simulated: 'Simulated', render: 'GPT Image', sketch: 'Sketch', photo: 'Your photo' })[p?.provenance?.kind] || 'Picture';

/** How light a colour is, 0 to 1. @param {string} hex */
const lightness = (hex) => { const v = parseInt(hex.slice(1), 16); return (.3 * (v >> 16) + .59 * ((v >> 8) & 255) + .11 * (v & 255)) / 255; };
/**
 * The new colours, painted where they go (the hair, the lips) and nowhere else: the picture itself recoloured inside
 * the part's mask, so the light and the strands stay its own. Transparent where nothing changes colour.
 * @param {HTMLCanvasElement} pic @param {any} f @param {Pick[]} picks
 */
async function washOf(pic, f, picks) {
  const c = P.make(pic.width, pic.height), x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  let any = false;
  for (const q of picks) {
    const tint = tintOf(q.part, q.style.id, q.shape?.shade || 0); if (!tint || !f) continue;
    const m = await maskOf(pic, f, q.part); if (!m) continue;
    const layer = P.copy(pic), lx = /** @type {CanvasRenderingContext2D} */ (layer.getContext('2d')), light = lightness(tint);
    const coat = (/** @type {GlobalCompositeOperation} */ op, /** @type {number} */ a) => { lx.globalCompositeOperation = op; lx.globalAlpha = a; lx.fillStyle = tint; lx.fillRect(0, 0, c.width, c.height); };
    coat('color', q.part === 'lips' ? .75 : .9);
    if (light > .62) coat('screen', .38); else if (light < .2) coat('multiply', .55); else if (q.part === 'lips') coat('multiply', .3);
    lx.globalCompositeOperation = 'destination-in'; lx.globalAlpha = 1; lx.drawImage(m, 0, 0);
    x.drawImage(layer, 0, 0); any = true;
  }
  return any ? c : null;
}

/**
 * Opens the mirror on a photo (a print) or on one of the studio's example people.
 * @param {{ print?: any, person?: Person, look?: Look, picks?: Pick[], words?: string, from?: Element | null, go?: boolean }} o
 */
export function openMirror(o) {
  current?.close(true);
  const person = o.person || null, live = studio.live;
  const print = o.print || null;
  /** @type {Pick[]} */ let picks = [...(o.picks || [])];
  let part = '', shown = -1, busy = false, spotsUp = false, washing = 0, swap = 0;
  /** @type {ReturnType<typeof turner>} */ let turn = null;
  const surfaces = new WeakMap();
  const dealt = new WeakSet(), developed = new WeakSet();
  /** @type {Take[]} */ const takes = [];
  /** @type {import('../studio/face.js').Face | null} */ let face = null;
  /** @type {HTMLCanvasElement | null} */ let base = null;
  /** @type {any} */ let examplePrint = null;
  const made = person?.kind === 'render' ? { label: 'GPT Image', kind: 'render' } : { label: 'Simulated', kind: 'simulated' };
  const origin = /** @type {Take} */ ({ url: person ? person.portrait : urlOf(print), ...(person ? made : { label: 'Your photo', kind: 'photo' }) });
  const stops = /** @type {(() => void)[]} */ ([]);

  const glow = h('div.mr-glow', { 'aria-hidden': 'true' });
  const pic = h('img.mr-pic', { alt: '', draggable: false }), over = h('img.mr-pic.mr-over', { alt: '', draggable: false });
  const read = /** @type {HTMLCanvasElement} */ (h('canvas.mr-read', { 'aria-hidden': 'true' }));
  const turnView = /** @type {HTMLCanvasElement} */ (h('canvas.mr-turnview', { 'aria-hidden': 'true' }));
  const wash = /** @type {HTMLCanvasElement} */ (h('canvas.mr-wash', { 'aria-hidden': 'true' }));
  const sk = document.createElementNS(SVG, 'svg'); sk.setAttribute('class', 'mr-sketch'); sk.setAttribute('aria-hidden', 'true'); sk.setAttribute('preserveAspectRatio', 'none');
  const notes = h('div.mr-notes'), lines = document.createElementNS(SVG, 'svg'); lines.setAttribute('class', 'mr-lines'); lines.setAttribute('aria-hidden', 'true');
  const stampEl = h('span.mr-stamp');
  const keepBtn = h('button.mr-keep', { type: 'button', hidden: true, 'aria-label': 'Keep this one', html: icon('heart'), onclick: () => keep() });
  const turnBtn = h('button.mr-turn', { type: 'button', hidden: true, 'aria-label': 'Every angle', title: 'Every angle', html: icon('orbit'), onclick: () => angles() });
  const dial = h('div.mr-dial', { hidden: true, 'aria-hidden': 'true' }, h('i'));
  const handlesEl = h('div.mr-handles'), sayEl = h('div.mr-say', { 'aria-live': 'polite' });
  // what leans in when a part is chosen: the picture and everything drawn on it, not the notes in its margins
  const lens = h('div.mr-lens', null, pic, over, turnView, wash, read, sk, handlesEl);
  const frame = h('div.mr-frame', null, lens, lines, notes, sayEl, stampEl, keepBtn, turnBtn, dial);
  const takesRow = h('div.mr-takes', { role: 'listbox', 'aria-label': 'Takes' });
  const chips = PARTS.map(p => h('button.mr-part', { type: 'button', 'data-part': p.id, 'aria-pressed': 'false', onclick: () => choose(p.id) },
    h('span.mr-part__glyph', { html: plateSVG(p.id, p.styles[0].id) }), h('span.mr-part__name', null, p.name)));
  const partsRow = h('div.mr-parts', { role: 'toolbar', 'aria-label': 'What to change' }, ...chips);
  const stylesRow = h('div.mr-styles', { role: 'listbox', hidden: true });
  const tokens = h('div.mr-ask__tokens');
  const input = /** @type {HTMLInputElement} */ (h('input.mr-ask__input', { type: 'text', 'aria-label': 'Anything else', placeholder: 'Touch a part of the face, or say it', autocomplete: 'off', enterkeyhint: 'go', value: o.words || '', oninput: () => paintGo() }));
  const goBtn = h('button.mr-ask__go', { type: 'submit' }, h('span', { html: icon('sparkle') }), h('span.mr-ask__label', null, 'Try on'));
  const ask = h('form.mr-ask', { onsubmit: (/** @type {Event} */ e) => { e.preventDefault(); tryOn(); } }, h('div.mr-ask__field', null, tokens, input), goBtn);
  const back = h('button.mr-bar__back', { type: 'button', 'aria-label': 'Back', html: icon('back'), onclick: () => close() });
  const mine = person ? h('button.mr-bar__mine', { type: 'button', onclick: () => onMe() }, h('span', { html: icon('camera') }), 'On me') : h('span');
  const bar = h('header.mr-bar', null, back, h('span.mr-bar__edition', { 'data-mode': studio.mode }, studio.label), mine);
  const stageEl = h('div.mr-stage', null, frame, takesRow);
  const el = h('section.mr', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mirror', 'data-mode': studio.mode }, glow, bar, stageEl, h('div.mr-dock', null, partsRow, stylesRow, ask));
  stage().append(el);
  const from = o.from?.getBoundingClientRect() || null;


  /**
   * The frame as large as the space allows, in the picture's own shape. Soon: the frame now (the takes' row is opening
   * or closing under it), its canvases once that has settled.
   */
  let sizing = 0;
  function fit(soon = false) {
    const r = stageEl.getBoundingClientRect(), ar = base ? base.width / base.height : 3 / 4;
    const row = takesRow.getBoundingClientRect().height, hh = Math.max(80, r.height - row - r.width * .04);
    let fw = Math.min(r.width * .84, hh * ar), fh = fw / ar; if (fh > hh) { fh = hh; fw = fh * ar; }
    frame.style.width = fw.toFixed(1) + 'px'; frame.style.height = fh.toFixed(1) + 'px';
    clearTimeout(sizing); if (soon) { sizing = setTimeout(() => fit(), 140); focus(part); return; }
    const dpr = Math.min(2, devicePixelRatio || 1), sharp = Math.max(1, (base?.width || 0) / (fw * dpr));
    // the outline and the wash as sharp as the picture itself, for when the mirror leans in close
    for (const c of [read, wash, turnView]) { const k = c === turnView ? 1 : sharp, w = Math.round(fw * dpr * k), hgt = Math.round(fh * dpr * k); if (c.width !== w || c.height !== hgt) { c.width = w; c.height = hgt; } }
    turn?.draw();
    if (part) mark(part); paintWash(); focus(part); paintHandles();
  }
  const dpr = () => Math.min(2, devicePixelRatio || 1);
  const ctx = (/** @type {HTMLCanvasElement} */ c) => /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));

  /** The reading: a line of light passes down the face, its points light up, its outlines draw round, and they fade. */
  function reading() {
    return new Promise(done => {
      if (!face || reduced) { done(undefined); return; }
      const f = face, x = ctx(read), k = read.width / f.w, ct = contoursOf(f), [, by, , bh] = f.box, r = dpr();
      const lines = [ct.face, ...ct.brows, ...ct.eyes, ...ct.lips], t0 = performance.now();
      const tick = (/** @type {number} */ now) => {
        if (!el.isConnected) { done(undefined); return; }
        const t = now - t0, scan = by - bh * .12 + (t - 80) / 760 * bh * 1.3;
        x.clearRect(0, 0, read.width, read.height);
        if (t < 1150) {
          const g = x.createLinearGradient(0, (scan - bh * .1) * k, 0, scan * k);
          g.addColorStop(0, 'rgba(255,244,224,0)'); g.addColorStop(1, 'rgba(255,244,224,' + (.32 * clamp((1150 - t) / 300)).toFixed(3) + ')');
          x.fillStyle = g; x.fillRect(0, (scan - bh * .1) * k, read.width, bh * .1 * k);
        }
        x.fillStyle = INK;
        const dim = .3 + .6 * (1 - clamp((t - 1350) / 650)), gone = clamp(1 - (t - 2250) / 450);
        for (const p of f.pts) {
          const a = clamp((scan - p.y) / (bh * .06)) * dim * gone; if (a < .01) continue;
          x.globalAlpha = a; x.beginPath(); x.arc(p.x * k, p.y * k, (a > .7 && t < 1300 ? 1.5 : 1.05) * r, 0, 6.2832); x.fill();
        }
        x.strokeStyle = INK; x.lineWidth = 1.3 * r; x.lineJoin = 'round'; x.lineCap = 'round';
        lines.forEach((ln, i) => { const p = clamp((t - 900 - i * 55) / 520), out = clamp(1 - (t - 2050) / 480); if (p > 0 && out > 0) { x.globalAlpha = .85 * out; along(x, ln, p, k); } });
        x.globalAlpha = 1;
        if (t < 2560) requestAnimationFrame(tick); else { x.clearRect(0, 0, read.width, read.height); done(undefined); }
      };
      requestAnimationFrame(tick);
    });
  }
  /** A closed outline drawn round as far as p of its length. @param {CanvasRenderingContext2D} x @param {{ x: number, y: number }[]} pts @param {number} p @param {number} k */
  function along(x, pts, p, k) {
    const ring = [...pts, pts[0]], lens = ring.slice(1).map((q, i) => Math.hypot(q.x - ring[i].x, q.y - ring[i].y)), total = lens.reduce((a, b) => a + b, 0);
    let left = total * p; x.beginPath(); x.moveTo(ring[0].x * k, ring[0].y * k);
    for (let i = 1; i < ring.length && left > 0; i++) {
      const l = lens[i - 1], u = Math.min(1, left / Math.max(1e-6, l)), a = ring[i - 1], b = ring[i];
      x.lineTo((a.x + (b.x - a.x) * u) * k, (a.y + (b.y - a.y) * u) * k); left -= l;
    }
    x.stroke();
  }

  /**
   * The parts, annotated the way a lookbook does it: a hairline from each part of the face out to its name in the
   * margin, the names on each side spaced so they never touch. A name, or the part itself, is touched to choose it.
   */
  function placeNotes() {
    spotsUp = true; notes.replaceChildren(); lines.replaceChildren(); if (!face) return;
    const f = face, q = f.pts, [bx, by, bw, bh] = f.box, mid = (/** @type {number} */ a, /** @type {number} */ b) => ({ x: (q[a].x + q[b].x) / 2, y: (q[a].y + q[b].y) / 2 });
    const z = (/** @type {number} */ i) => turn ? turn.depth(i) : 0;
    const at = /** @type {Record<string, { x: number, y: number, z?: number }>} */ ({ bangs: { x: q[109].x, y: (q[109].y + q[105].y) / 2, z: z(109) }, brows: { ...q[70], z: z(70) }, cut: { x: bx - bw * .1, y: by + bh * .7 }, colour: { x: bx + bw * .78, y: by - bh * .12 }, lashes: { x: q[263].x + bw * .01, y: q[263].y, z: z(263) }, lips: { ...q[291], z: z(291) }, beard: { x: q[397].x - bw * .02, y: q[397].y, z: z(397) } });
    anchors = [];
    const fr = frame.getBoundingClientRect(), W = fr.width, H = fr.height, gap = 30 / H;
    lines.setAttribute('viewBox', '0 0 ' + W.toFixed(1) + ' ' + H.toFixed(1));
    for (const [sideParts, left] of /** @type {[string[], boolean][]} */ ([[['bangs', 'brows', 'cut'], true], [['colour', 'lashes', 'lips', 'beard'], false]])) {
      const list = sideParts.map(id => ({ id, a: { x: clamp(at[id].x / f.w, .02, .98), y: clamp(at[id].y / f.h, .04, .96) }, y: 0 })).sort((m, k) => m.a.y - k.a.y);
      list.forEach((m, k) => { m.y = Math.max(m.a.y + (left ? -.02 : .02), k ? list[k - 1].y + gap : .1); });
      const over = list[list.length - 1].y - .9; if (over > 0) list.forEach(m => { m.y -= over; });
      const edge = left ? Math.min(.24, Math.min(...list.map(m => m.a.x)) - .07) : Math.max(.76, Math.max(...list.map(m => m.a.x)) + .07);
      for (const m of list) {
        const i = PARTS.findIndex(p => p.id === m.id), name = partById(m.id)?.name || m.id;
        const ln = document.createElementNS(SVG, 'path');
        ln.setAttribute('pathLength', '1'); ln.dataset.part = m.id; ln.style.setProperty('--i', String(i));
        const dot = document.createElementNS(SVG, 'circle'); dot.setAttribute('r', '2.6'); dot.dataset.part = m.id; dot.style.setProperty('--i', String(i));
        anchors.push({ ln, dot, a: at[m.id], knee: (edge + (left ? .015 : -.015)) * W, edge: edge * W, y: m.y * H, W, H });
        lines.append(ln, dot);
        notes.append(h('button.mr-note' + (left ? '.is-left' : ''), { type: 'button', 'data-part': m.id, style: { top: (m.y * 100).toFixed(2) + '%', [left ? 'right' : 'left']: ((left ? 1 - edge : edge) * 100 + 1.2).toFixed(2) + '%', '--i': i }, onclick: (/** @type {Event} */ e) => { e.stopPropagation(); choose(m.id); } }, name));
      }
    }
    lit(); follow3d();
  }
  /** @type {{ ln: SVGPathElement, dot: SVGCircleElement, a: { x: number, y: number, z?: number }, knee: number, edge: number, y: number, W: number, H: number }[]} */
  let anchors = [];
  /** Each note's line from where its part is now: on the face as it is turned, or as it is at rest. */
  function follow3d() {
    if (!face) return;
    const f = face;
    for (const n of anchors) {
      const p = turn ? turn.project(n.a.x, n.a.y, n.a.z) : n.a, x = clamp(p.x / f.w, .02, .98) * n.W, y = clamp(p.y / f.h, .04, .96) * n.H;
      n.ln.setAttribute('d', 'M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' L' + n.knee.toFixed(1) + ' ' + n.y.toFixed(1) + ' L' + n.edge.toFixed(1) + ' ' + n.y.toFixed(1));
      n.dot.setAttribute('cx', x.toFixed(1)); n.dot.setAttribute('cy', y.toFixed(1));
    }
  }
  /** The chosen part's note lit, the others quieter. */
  const lit = () => { for (const n of [...notes.children, ...lines.children]) n.classList.toggle('is-on', /** @type {HTMLElement} */ (n).dataset.part === part); el.classList.toggle('has-part', !!part); };

  /** A part, chosen: it is outlined on the face, and its styles come up in place of the parts. @param {string} id */
  function choose(id) {
    const p = partById(id); if (!p) return;
    part = id; read.classList.toggle('is-quiet', fresh().some(q => q.part === id));
    chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.part === id))); lit();
    stylesRow.replaceChildren(h('button.mr-styles__back', { type: 'button', 'aria-label': 'Every part', html: icon('back'), onclick: () => unchoose() }),
      ...p.styles.map((s, i) => h('button.mr-style', { type: 'button', role: 'option', 'data-style': s.id, style: { '--d': (i * 55) + 'ms' }, 'aria-selected': String(picks.some(q => q.part === id && q.style.id === s.id)), onclick: () => pick(id, s.id) },
        h('span.mr-style__plate', { html: plateSVG(id, s.id) }), h('span.mr-style__name', null, s.name))));
    menu();
    if (!reduced) stylesRow.animate([{ opacity: 0, translate: '6% 0' }, { opacity: 1, translate: '0 0' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    input.placeholder = HINTS[id] || '';
    mark(id); focus(id); paintHandles();
  }
  /** What the dock offers: a part's styles once one is chosen; the parts themselves only where no face was read. */
  function menu() { partsRow.hidden = !!part || !!face; stylesRow.hidden = !part; el.classList.toggle('has-menu', !!part || !face); }
  function unchoose() {
    part = ''; menu(); input.placeholder = face ? 'Touch a part of the face, or say it' : 'Pick a part, or say it';
    chips.forEach(c => c.setAttribute('aria-pressed', 'false')); lit();
    ctx(read).clearRect(0, 0, read.width, read.height); focus(''); paintHandles();
    if (!reduced) partsRow.animate([{ opacity: 0, translate: '-6% 0' }, { opacity: 1, translate: '0 0' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  /** The chosen part, outlined where it is on the face. @param {string} id */
  async function mark(id) {
    const x = ctx(read); x.clearRect(0, 0, read.width, read.height);
    if (!face || !base) return;
    const k = read.width / face.w, r = dpr();
    if (id === 'colour' || id === 'cut') {
      const m = await maskOf(base, face, 'colour'); if (!m || part !== id) return;
      x.drawImage(m, 0, 0, read.width, read.height); x.globalCompositeOperation = 'source-in'; x.fillStyle = 'rgba(255,244,224,.12)'; x.fillRect(0, 0, read.width, read.height); x.globalCompositeOperation = 'source-over';
    } else for (const s of shapesOf(face)[id] || []) {
      x.beginPath(); s.forEach((p, i) => (i ? x.lineTo(p.x * k, p.y * k) : x.moveTo(p.x * k, p.y * k))); x.closePath();
      x.fillStyle = 'rgba(255,244,224,.12)'; x.fill(); x.setLineDash([3 * r, 4 * r]); x.lineWidth = 1.2 * r; x.strokeStyle = 'rgba(255,244,224,.85)'; x.stroke(); x.setLineDash([]);
    }
    read.classList.remove('is-marking'); void read.offsetWidth; read.classList.add('is-marking');
  }

  /** A style picked, one for each part: a token on the line, and its drawing laid over the face. @param {string} p @param {string} id */
  function pick(p, id) {
    const s = styleOf(p, id); if (!s) return;
    const had = picks.find(q => q.part === p);
    picks = had && had.style.id === id ? picks.filter(q => q !== had) : [...picks.filter(q => q.part !== p), { part: p, style: s }];
    paintPicks();
  }
  function paintPicks() {
    // each pick saying how it was shaped: shortly on the line, fully to the studio
    picks = picks.map(q => { const cs = sayOf(q), said = cs.map(c => c.phrase).filter(Boolean).join(', '); return said === (q.said || '') ? q : { ...q, said }; });
    tokens.replaceChildren(...picks.map(q => { const shorts = sayOf(q).map(c => c.short).filter(Boolean).join(' · '); return h('button.mr-token', { type: 'button', 'data-part': q.part, 'aria-label': 'Remove ' + q.style.name, onclick: () => pick(q.part, q.style.id) }, h('span.mr-token__plate', { html: plateSVG(q.part, q.style.id) }), q.style.name, shorts ? h('em.mr-token__shape', null, shorts) : null); }));
    stylesRow.querySelectorAll('.mr-style').forEach(b => b.setAttribute('aria-selected', String(picks.some(q => q.part === part && q.style.id === /** @type {HTMLElement} */ (b).dataset.style))));
    chips.forEach(c => c.classList.toggle('is-picked', picks.some(q => q.part === c.dataset.part)));
    paintGo(); drawSketch(); paintWash(); paintHandles();
  }
  function paintGo() { goBtn.toggleAttribute('disabled', !picks.length && !input.value.trim()); }

  /** The picks not yet made on the picture on show: what the sketch draws, and what a try-on asks for anew. */
  const fresh = () => { const made = shown >= 0 ? takes[shown]?.picks || [] : []; return picks.filter(q => !made.some(d => d.part === q.part && d.style.id === q.style.id && shapeKey(d) === shapeKey(q))); };
  /** A pick's shape, as one comparable string. @param {Pick} q */
  const shapeKey = (q) => Object.entries(q.shape || {}).filter(([, v]) => Math.abs(v) > .02).sort().map(([k, v]) => k + v.toFixed(2)).join(',');
  /** The new picks, drawn over the face the way a stylist marks up a photo: strokes for shapes, washes for colours. */
  function drawSketch() {
    sk.replaceChildren(); if (!face) return;
    sk.setAttribute('viewBox', '0 0 ' + face.w + ' ' + face.h);
    const now = fresh(); let k = 0;
    for (const q of now) {
      const strokes = markup(face, q.part, q.style.id, q.shape); if (!strokes.length) continue;
      const g = document.createElementNS(SVG, 'g'); g.dataset.part = q.part;
      for (const s of strokes) { const d = document.createElementNS(SVG, 'path'); d.setAttribute('d', s.d); d.setAttribute('stroke-width', s.w.toFixed(2)); d.setAttribute('pathLength', '1'); d.style.setProperty('--k', String(Math.min(30, k++))); g.append(d); }
      sk.append(g);
    }
    el.classList.toggle('has-sketch', now.length > 0);
    // once a style is drawn on the chosen part, its outline steps back
    read.classList.toggle('is-quiet', now.some(q => q.part === part));
  }
  async function paintWash() {
    const n = ++washing, x = ctx(wash);
    const now = fresh(), w = face && base && now.some(q => tintOf(q.part, q.style.id)) ? await washOf(base, face, now) : null;
    if (n !== washing) return;
    x.clearRect(0, 0, wash.width, wash.height); if (w) x.drawImage(w, 0, 0, wash.width, wash.height);
  }

  /** One of the takes (or, at -1, the face as it is) in the frame. @param {number} i @param {boolean} [instant] */
  function show(i, instant = false) {
    const t = i < 0 ? origin : takes[i]; if (!t || t.pending) return;
    shown = i;
    if (instant || reduced) { pic.src = t.url; over.classList.remove('is-in'); }
    else { over.src = t.url; over.classList.remove('is-in'); void over.offsetWidth; over.classList.add('is-in'); clearTimeout(swap); swap = setTimeout(() => { pic.src = t.url; over.classList.remove('is-in'); }, 300); }
    glow.style.backgroundImage = 'url("' + t.url + '")';
    stampEl.textContent = t.label; stampEl.dataset.kind = t.kind;
    keepBtn.hidden = !t.print; keepBtn.setAttribute('aria-pressed', String(!!t.print?.kept));
    takesRow.querySelectorAll('.mr-take').forEach(b => b.setAttribute('aria-selected', String(Number(/** @type {HTMLElement} */ (b).dataset.i) === i)));
    el.classList.toggle('is-take', i >= 0);
    if (t.look && t.picks) picks = t.picks.slice();
    paintPicks();
  }
  function paintTakes() {
    const all = [origin, ...takes];
    // only a take that is new is dealt in; the rest stay where they are
    takesRow.replaceChildren(...all.map((t, k) => {
      const i = k - 1, b = h('button.mr-take', { type: 'button', role: 'option', 'data-i': String(i), 'aria-selected': String(i === shown), 'aria-label': i < 0 ? 'As they are' : t.look ? titleOf(t.picks || []) : 'Take ' + k, style: { '--i': k, '--n': all.length }, onclick: (/** @type {MouseEvent} */ e) => { if (e.detail === 0) show(i); } },
        t.pending ? h('span.mr-take__wait') : h('img' + (developed.has(t) ? '.is-still' : ''), { src: t.url, alt: '', draggable: false }));
      b.classList.toggle('is-pending', !!t.pending); b.classList.toggle('is-origin', i < 0);
      if (dealt.has(t)) b.classList.add('is-dealt');
      dealt.add(t); if (!t.pending) developed.add(t);
      return b;
    }));
    takesRow.classList.toggle('is-empty', takes.length === 0);
  }
  // a finger run along the takes shows each one it passes over; a tap shows the one under it
  const takeAt = (/** @type {number} */ x, /** @type {number} */ y) => { const b = /** @type {HTMLElement | null} */ (document.elementFromPoint(x, y)?.closest('.mr-take') || null), i = b ? Number(b.dataset.i) : NaN; return Number.isFinite(i) && (i < 0 || (takes[i] && !takes[i].pending)) ? i : null; };
  drag(takesRow, {
    start: () => { takesRow.classList.add('is-scrubbing'); },
    move: d => { if (Math.abs(d.dx) < 6) return; const i = takeAt(d.x, d.y); if (i !== null && i !== shown) show(i, true); },
    end: d => { takesRow.classList.remove('is-scrubbing'); if (Math.abs(d.dx) < 6) { const i = takeAt(d.x, d.y); if (i !== null && i !== shown) show(i); } },
  });

  // —— leaning in: a part chosen brings the mirror close to it, where its handles have room ——
  let zoom = { z: 1, tx: 0, ty: 0 };
  /** The mirror brought close to a part (or, with none, back out). @param {string} id */
  function focus(id) {
    const fr = frame.getBoundingClientRect(), fw = fr.width, fh = fr.height, box = id && face ? partBox(id) : null;
    let z = 1, tx = 0, ty = 0;
    if (box && face && fw) {
      const k = fw / face.w, [x0, y0, x1, y1] = box;
      z = clamp(Math.min(fw / Math.max(1, (x1 - x0) * k * 1.5), fh / Math.max(1, (y1 - y0) * k * 2.1)), 1, 2.6);
      tx = clamp(fw / 2 - (x0 + x1) / 2 * k * z, fw - fw * z, 0); ty = clamp(fh / 2 - (y0 + y1) / 2 * k * z, fh - fh * z, 0);
    }
    zoom = { z, tx, ty };
    lens.style.transform = z > 1.01 ? 'translate(' + tx.toFixed(1) + 'px, ' + ty.toFixed(1) + 'px) scale(' + z.toFixed(3) + ')' : '';
    lens.style.setProperty('--z', z.toFixed(3));
    el.classList.toggle('is-close', z > 1.01);
  }
  /** Where a part is, as a box in the picture's pixels; none for the whole head (a cut, a colour). @param {string} id */
  function partBox(id) {
    if (!face || id === 'cut' || id === 'colour') return null;
    const pts = (shapesOf(face)[id] || []).flat(); if (!pts.length) return null;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  /** A point on the screen, in the picture's pixels (through the lens, when it is close). @param {number} x @param {number} y */
  function toPicture(x, y) {
    const r = frame.getBoundingClientRect(), z = frame.classList.contains('is-device-turn') ? { z: 1, tx: 0, ty: 0 } : zoom;
    return { x: (x - r.left - z.tx) / z.z / r.width * (face?.w || 1), y: (y - r.top - z.ty) / z.z / r.height * (face?.h || 1) };
  }

  // —— shaping: handles on the markup, dragged to shape it, the words written as it goes ——
  const handleEls = /** @type {Map<string, HTMLButtonElement>} */ (new Map());
  const NAMES = /** @type {Record<string, string>} */ ({ arch: 'arch', full: 'fullness', tail: 'tails', length: 'length', part: 'parting', long: 'length', volume: 'volume', shade: 'shade' });
  let taught = false;
  /** The chosen part's pick, if it is drawn over the picture on show (so it can be shaped). */
  const shapeable = () => { const q = part ? picks.find(p => p.part === part) : null; return q && face && fresh().includes(q) ? q : null; };
  /** The handles for the chosen part's style, where its strokes now are. @param {import('./markup.js').Control[]} [known] */
  function paintHandles(known) {
    const q = shapeable(), cs = known || (q && face ? controlsOf(face, q.part, q.style.id, q.shape) : []), f = face;
    const seen = new Set();
    if (f) cs.forEach((c, i) => {
      seen.add(c.id);
      let b = handleEls.get(c.id);
      if (!b) {
        b = /** @type {HTMLButtonElement} */ (h('button.mr-handle' + (taught ? '' : '.is-new'), { type: 'button', 'data-control': c.id, 'aria-label': 'Shape the ' + (NAMES[c.id] || c.id), style: { '--i': i } }));
        grab(b, c.id); handlesEl.append(b); handleEls.set(c.id, b);
      }
      b.dataset.axis = c.axis;
      b.style.left = (c.x / f.w * 100).toFixed(3) + '%'; b.style.top = (c.y / f.h * 100).toFixed(3) + '%';
      b.classList.toggle('is-set', Math.abs(c.v) > .15);
    });
    for (const [id, b] of handleEls) if (!seen.has(id)) { b.remove(); handleEls.delete(id); }
    el.classList.toggle('has-handles', cs.length > 0);
    if (cs.length && !taught) { taught = true; setTimeout(() => handleEls.forEach(b => b.classList.remove('is-new')), 3600); }
    if (part) input.placeholder = cs.length ? 'Drag the marks, or say it' : HINTS[part] || '';
  }
  /** A handle, dragged along its way (or moved by the arrow keys; a double tap puts it back). @param {HTMLButtonElement} b @param {string} id */
  function grab(b, id) {
    const now = () => { const q = shapeable(); return q && face ? { q, c: controlsOf(face, q.part, q.style.id, q.shape).find(k => k.id === id) } : null; };
    b.addEventListener('pointerdown', e => {
      const n = now(); if (!n?.c || !face) return;
      e.preventDefault(); e.stopPropagation(); b.setPointerCapture(e.pointerId); b.classList.add('is-held');
      const c = n.c, r = frame.getBoundingClientRect(), per = face.w / r.width / zoom.z, x0 = e.clientX, y0 = e.clientY, v0 = c.v;
      const move = (/** @type {PointerEvent} */ ev) => { reshape(id, clamp(v0 + (c.axis === 'x' ? ev.clientX - x0 : ev.clientY - y0) * per * c.dir / c.span, -1, 1)); };
      const up = () => { b.removeEventListener('pointermove', move); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up); b.classList.remove('is-held'); settle(); };
      b.addEventListener('pointermove', move); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      reshape(id, v0);
    });
    b.addEventListener('keydown', e => {
      const n = now(); if (!n?.c) return;
      const step = /** @type {Record<string, number>} */ ({ ArrowUp: n.c.axis === 'y' ? -1 : 0, ArrowDown: n.c.axis === 'y' ? 1 : 0, ArrowLeft: n.c.axis === 'x' ? -1 : 0, ArrowRight: n.c.axis === 'x' ? 1 : 0 })[e.key];
      if (!step) return;
      e.preventDefault(); reshape(id, clamp(n.c.v + step * n.c.dir * .1, -1, 1)); settle();
    });
    b.addEventListener('dblclick', () => { reshape(id, 0); settle(); });
  }
  let washSoon = 0;
  /** A shape changed: the pick takes it, the sketch and its handles follow, and the words say it. @param {string} id @param {number} v */
  function reshape(id, v) {
    const q = shapeable(); if (!q || !face) return;
    const shape = { ...(q.shape || {}), [id]: Math.round(v * 100) / 100 }, cs = controlsOf(face, q.part, q.style.id, shape);
    const nq = { ...q, shape, said: cs.map(c => c.phrase).filter(Boolean).join(', ') };
    picks = picks.map(p => (p === q ? nq : p));
    el.classList.add('is-shaping');
    drawSketch(); paintHandles(cs);
    if (tintOf(nq.part, nq.style.id)) { cancelAnimationFrame(washSoon); washSoon = requestAnimationFrame(() => paintWash()); }
    const c = cs.find(k => k.id === id); if (c) speak(c);
  }
  /** The shaping done: its words go to the line. */
  function settle() { el.classList.remove('is-shaping'); sayEl.classList.remove('is-on'); said0 = ''; paintPicks(); }
  let said0 = '';
  /** What a handle's value says, shown over it as it is dragged. @param {import('./markup.js').Control} c */
  function speak(c) {
    if (!face) return;
    const r = frame.getBoundingClientRect(), x = c.x / face.w * r.width * zoom.z + zoom.tx, y = c.y / face.h * r.height * zoom.z + zoom.ty, text = c.short || NAMES[c.id] || c.id;
    sayEl.style.left = clamp(x, r.width * .2, r.width * .8).toFixed(1) + 'px'; sayEl.style.top = Math.max(r.height * .1, y - r.width * .07).toFixed(1) + 'px';
    if (text !== said0) { sayEl.textContent = text; said0 = text; if (!reduced) sayEl.animate([{ scale: .86 }, { scale: 1.07 }, { scale: 1 }], { duration: 260, easing: 'cubic-bezier(.3,1.5,.5,1)' }); }
    sayEl.classList.add('is-on');
  }
  /** What a pick's shape says, for the studio (and, shortly, for the line). @param {Pick} q */
  const sayOf = (q) => (face && q.shape ? controlsOf(face, q.part, q.style.id, q.shape) : []);

  // on the frame: a drag turns the face (through its angles when the studio has made them, on the device when not),
  // a tap picks the part under it, and holding shows the face as it was
  let hold = 0, comparing = false, turning = /** @type {null | { ring: string[], p: number, a: HTMLImageElement, b: HTMLImageElement }} */ (null), p0 = 0, anim = /** @type {{ stop(): void } | null} */ (null);
  let leaning = false, ready = false, pitchNow = 0, stampWas = /** @type {[string, string] | null} */ (null);
  drag(frame, {
    start: e => {
      if (/** @type {HTMLElement} */ (e.target).closest('button')) return false;
      anim?.stop(); if (turning) { p0 = turning.p; return; }
      if (turn && face) { ready = false; mount().then(ok => { ready = ok; }).catch(() => {}); }
      hold = setTimeout(() => { if (leaning || (shown < 0 && !picks.length)) return; comparing = true; frame.classList.add('is-comparing'); over.src = origin.url; over.classList.add('is-held'); }, 280);
    },
    move: d => {
      if (Math.abs(d.dx) > 8 || Math.abs(d.dy) > 8) clearTimeout(hold);
      if (turning) { turnTo(clamp(p0 - d.dx / (frame.clientWidth * .45), 0, turning.ring.length - 1)); return; }
      if (turn && ready && !comparing && (leaning || Math.abs(d.dx) > 8)) { leaning = true; lean(.3 * Math.tanh(-d.dx / (frame.clientWidth * .5) * 1.25), .1 * Math.tanh(d.dy / (frame.clientHeight * .5) * 1.2)); }
    },
    end: d => {
      clearTimeout(hold);
      if (turning) { const to = Math.round(clamp(turning.p - d.vx / (frame.clientWidth * .45) * .25, 0, turning.ring.length - 1)); anim = spring({ from: turning.p, to, velocity: -d.vx / (frame.clientWidth * .45), stiffness: 140, damping: 22, onUpdate: v => turnTo(v) }); return; }
      if (comparing) { comparing = false; frame.classList.remove('is-comparing'); over.classList.remove('is-held'); return; }
      if (leaning) { leaning = false; const y = turn?.yaw || 0, p = pitchNow; anim = spring({ from: 1, to: 0, stiffness: 120, damping: 14, onUpdate: s => lean(y * s, p * s), onRest: () => lean(0, 0) }); return; }
      if (Math.abs(d.dx) < 8 && Math.abs(d.dy) < 8 && face) {
        const at = toPicture(d.x, d.y), hit = partAt(face, at.x, at.y);
        if (hit) choose(hit); else if (part) unchoose();
      }
    },
  });
  /**
   * The face turned on the device: the mesh drawn in place of the picture while it is off true, and the stamp saying
   * so; back at rest, the picture itself again. @param {number} y @param {number} p
   */
  function lean(y, p) {
    if (!turn) return;
    pitchNow = p; turn.turn(y, p); follow3d();
    const off = Math.abs(y) > .002 || Math.abs(p) > .002;
    frame.classList.toggle('is-device-turn', off); frame.dataset.yaw = y.toFixed(3);
    if (off && !stampWas) { stampWas = [stampEl.textContent || '', stampEl.dataset.kind || '']; stampEl.textContent = 'Turned on this device'; stampEl.dataset.kind = 'sketch'; }
    if (!off && stampWas) { [stampEl.textContent, stampEl.dataset.kind] = stampWas; stampWas = null; }
  }
  /**
   * What the face is turned with: the picture on show (washed and marked up as the frame shows it) and the face read in
   * that picture itself, or null where it has none to turn.
   */
  async function surface() {
    if (!face) return null;
    const t = shown >= 0 ? takes[shown] : origin, now = fresh();
    // the picture at the face's own size, kept, so its face and its hair are read once however often it is turned
    let pic0 = surfaces.get(t);
    if (!pic0) {
      const raw = shown < 0 && base ? base : await canvasOf(t.print?.blob || t.url);
      if (raw.width === face.w && raw.height === face.h) pic0 = raw; else { pic0 = P.make(face.w, face.h); ctx(pic0).drawImage(raw, 0, 0, face.w, face.h); }
      surfaces.set(t, pic0);
    }
    const own = pic0 === base ? face : await faceOf(pic0); if (!own) return null;
    const c = P.make(face.w, face.h), x = ctx(c); x.drawImage(pic0, 0, 0);
    if (now.length) {
      const w = await washOf(pic0, own, now); if (w) x.drawImage(w, 0, 0);
      x.save(); x.strokeStyle = INK; x.lineCap = 'round'; x.lineJoin = 'round'; x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = Math.max(2, c.width / 400);
      for (const q of now) for (const s of markup(face, q.part, q.style.id, q.shape)) { x.lineWidth = s.w; x.stroke(new Path2D(s.d)); }
      x.restore();
    }
    return { canvas: c, face: own, pic: pic0 };
  }
  /** The picture on show put on the turner, with its own face (and, when it is found, its hair). False where it cannot turn. */
  async function mount() {
    const s = await surface(); if (!s || !turn) return false;
    if (turn.face !== s.face) { turn.load(s.face); const f = s.face; hairOf(s.pic).then(m => { if (m) turn?.hair(m, f); }); }
    turn.picture(s.canvas); return true;
  }
  /** The mirror, once it has read you: the face turns a little one way, then the other, and comes back to you. */
  async function hello() {
    if (!turn || reduced || !(await mount())) return;
    ready = true;
    const keys = [[0, 0, 0], [640, .22, .03], [1400, -.16, -.015], [1950, 0, 0]], t0 = performance.now();
    const ease = (/** @type {number} */ u) => u * u * (3 - 2 * u);
    await new Promise(done => {
      const tick = (/** @type {number} */ now) => {
        const t = now - t0; if (!el.isConnected || leaning) { done(undefined); return; }
        let k = 1; while (k < keys.length - 1 && t > keys[k][0]) k++;
        const [ta, ya, pa] = keys[k - 1], [tb, yb, pb] = keys[k], u = ease(clamp((t - ta) / (tb - ta)));
        lean(ya + (yb - ya) * u, pa + (pb - pa) * u);
        if (t < keys[keys.length - 1][0]) requestAnimationFrame(tick); else { lean(0, 0); done(undefined); }
      };
      requestAnimationFrame(tick);
    });
  }

  /** Tries the picks (and any words) on: four takes from a live studio, a sketch here. */
  async function tryOn() {
    if (busy) return;
    const own = input.value.trim(), parts = [...new Set([...picks.map(q => q.part), ...partsIn(own)])];
    if (!parts.length && !own) { ask.classList.remove('is-asking'); void ask.offsetWidth; ask.classList.add('is-asking'); return; }
    busy = true; el.classList.add('is-making'); input.blur();
    try { if (live) await render(parts, own); else await sketchIt(); }
    catch (e) { toast(e instanceof Error ? e.message : 'That did not work'); }
    finally { busy = false; el.classList.remove('is-making'); }
  }
  /** The print a change starts from: the take on show, or the face as it is (an example's portrait is brought in once). */
  async function subject() {
    const t = shown >= 0 ? takes[shown] : null;
    if (t?.print) return t.print;
    if (print) return print;
    if (examplePrint) return examplePrint;
    const blob = await (await fetch(t?.url || origin.url)).blob(), c = await P.fromBlob(blob, 1600);
    examplePrint = await addPrint({ blob: await P.toBlob(c, 'image/jpeg', .92), w: c.width, h: c.height, origin: 'upload', provenance: { kind: made.kind, label: made.label === 'GPT Image' ? 'Render' : 'Simulated', detail: 'An example portrait of someone who does not exist' } });
    await addItem({ type: 'prints', prints: [examplePrint.id], mine: true });
    return examplePrint;
  }
  /** Four takes from the studio: inside the parts' masks when the face was read, over the whole picture when not. @param {string[]} parts @param {string} own */
  async function render(parts, own) {
    const s = await subject(), pic2 = s === print && base ? base : await canvasOf(s.blob), f = s === print ? face : await faceOf(pic2);
    const masked = f && parts.length && !parts.includes('cut') ? parts : [];
    let mask = null;
    if (masked.length && f) {
      mask = P.make(pic2.width, pic2.height); const mx = ctx(mask);
      for (const p of masked) { const m = await maskOf(pic2, f, p); if (m) mx.drawImage(m, 0, 0); }
    }
    const words = wordsFor(picks, own), said = titleOf(picks) || own;
    const intent = mask ? { op: 'region', subject: s.id, refs: [], look: null, n: 4, pace: null, pins: [{ print: s.id, n: 1, note: words, mask }] } : { op: 'edit', subject: s.id, refs: [], look: null, n: 4, pace: null, pins: [] };
    const now = picks.slice(), first = takes.length;
    for (let k = 0; k < 4; k++) takes.push({ url: '', label: '', kind: '', pending: true, picks: now });
    paintTakes();
    await follow(onItem => runTurn({ text: mask ? 'Changes to @' + s.handle : '@' + s.handle + ' ' + words, said, intent, pace: settings.get('pace', 'fine'), n: 4, onItem }), first, 4, (k, p) => { Object.assign(takes[first + k], { url: urlOf(p), label: labelOf(p), kind: p.provenance?.kind || '', print: p, pending: false }); });
  }
  /**
   * Follows a turn's item as its pictures arrive: each lands in its place (the first is shown as it lands), the
   * places wait with the studio's estimate burning round them, and the ones that never come are taken away.
   * @param {(onItem: (it: any) => void) => Promise<any>} start @param {number} first @param {number} n @param {(k: number, p: any) => void} land
   * @returns {Promise<any>} the turn's item, when it is over
   */
  async function follow(start, first, n, land) {
    let item = /** @type {any} */ (null), shownOne = false;
    const tick = setInterval(() => { if (!item) return; const p = progressAt(Date.now() - item.startedAt, item.eta); takesRow.querySelectorAll('.mr-take.is-pending').forEach(b => /** @type {HTMLElement} */ (b).style.setProperty('--p', p.toFixed(3))); }, 200);
    const landed = new Set();
    const check = (/** @type {any} */ it) => {
      if (!item || it.id !== item.id) return;
      (it.prints || []).forEach((/** @type {string} */ id, /** @type {number} */ k) => {
        const p = id && printById(id); if (!p || landed.has(k) || k >= n) return;
        landed.add(k); land(k, p); paintTakes();
        if (!shownOne) { shownOne = true; show(first + k); }
      });
    };
    const off = on('item:patch', check);
    try { const it = await start(it => { item = it; }); item ||= it; check(it); if (it.state === 'failed') toast(it.error || 'That did not work', 3200); return it; }
    finally {
      off(); clearInterval(tick);
      for (let k = n - 1; k >= 0; k--) if (takes[first + k]?.pending) takes.splice(first + k, 1);
      paintTakes(); if (shown >= takes.length) show(-1);
    }
  }
  /** Here, with no studio: the change sketched over the face, stamped as a sketch, kept on the desk. */
  async function sketchIt() {
    if (!base || !face) { toast('Sketching needs a face to draw on'); return; }
    const c = P.copy(base), x = ctx(c), w = await washOf(base, face, picks);
    if (w) x.drawImage(w, 0, 0);
    x.save(); x.strokeStyle = INK; x.lineCap = 'round'; x.lineJoin = 'round'; x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = Math.max(2, c.width / 400);
    for (const q of picks) for (const s of markup(face, q.part, q.style.id, q.shape)) { x.lineWidth = s.w; x.stroke(new Path2D(s.d)); }
    x.restore();
    P.stamp(c);
    const blob = await P.toBlob(c, 'image/jpeg', .9), parent = print || null;
    const p = await addPrint({ blob, w: c.width, h: c.height, origin: 'made', provenance: { kind: 'sketch', label: 'Sketch', detail: 'Drawn on this device · ' + (titleOf(picks) || 'a change') }, parents: parent ? [parent.id] : [], prompt: wordsFor(picks, input.value) });
    await addItem({ type: 'prints', prints: [p.id] });
    takes.push({ url: urlOf(p), label: 'Sketch', kind: 'sketch', print: p, picks: picks.slice() }); paintTakes(); show(takes.length - 1);
  }

  async function keep() {
    const t = takes[shown]; if (!t?.print) return;
    const kept = !t.print.kept; await setKept(t.print.id, kept);
    keepBtn.setAttribute('aria-pressed', String(kept)); toast(kept ? 'Kept in the album' : 'Taken out of the album');
  }

  /**
   * Every angle: three more pictures of the face on show (from their right, in profile, from their left), and the
   * frame turns between them under a finger. An example has its angles already; a live studio is asked for them.
   */
  async function angles() {
    if (turning) { stopTurning(); return; }
    const t = shown >= 0 ? takes[shown] : null, look = t?.look || null;
    /** @type {string[] | null} */ let three = look?.angles?.length === 3 ? look.angles : null;
    if (!three && live && !busy) {
      busy = true; el.classList.add('is-orbiting'); turnBtn.classList.add('is-busy');
      try {
        const s = await subject();
        const item = await follow(onItem => runTurn({ text: '@' + s.handle + ' from every angle', said: 'Every angle', intent: { op: 'angles', subject: s.id, refs: [], look: null, n: 3, pace: null, pins: [] }, pace: settings.get('pace', 'fine'), n: 3, onItem }), takes.length, 0, () => {});
        const got = (item?.prints || []).map((/** @type {string} */ id) => printById(id)).filter(Boolean).map(urlOf);
        if (got.length === 3) three = got;
      } finally { busy = false; el.classList.remove('is-orbiting'); turnBtn.classList.remove('is-busy'); }
    }
    if (!three) { toast(live ? 'The angles did not come back' : 'Every angle needs the studio', 2600); return; }
    startTurning([three[1], three[0], (t || origin).url, three[2]]);
  }
  function startTurning(/** @type {string[]} */ ring) {
    const a = h('img.mr-angle', { alt: '', draggable: false }), b = h('img.mr-angle', { alt: '', draggable: false });
    frame.append(a, b); turning = { ring, p: 2, a, b };
    el.classList.add('is-turning'); dial.hidden = false; turnBtn.setAttribute('aria-pressed', 'true');
    turnTo(2);
    if (!reduced) { anim = spring({ from: 2, to: 1, stiffness: 40, damping: 9, onUpdate: v => turnTo(v), onRest: () => { anim = spring({ from: turning?.p ?? 1, to: 2, stiffness: 60, damping: 12, onUpdate: v => turnTo(v) }); } }); }
  }
  function stopTurning() {
    anim?.stop(); if (!turning) return;
    turning.a.remove(); turning.b.remove(); turning = null; frame.style.transform = '';
    el.classList.remove('is-turning'); dial.hidden = true; turnBtn.setAttribute('aria-pressed', 'false');
  }
  /** The frame at a point between the angles: the two nearest cross-fade, and the frame leans as it turns. @param {number} v */
  function turnTo(v) {
    if (!turning) return;
    turning.p = v; const i = Math.floor(v), u = v - i, A = turning.ring[i], B = turning.ring[Math.min(turning.ring.length - 1, i + 1)];
    if (turning.a.getAttribute('src') !== A) turning.a.src = A; if (turning.b.getAttribute('src') !== B) turning.b.src = B;
    turning.b.style.opacity = u.toFixed(3);
    const lean = Math.sin(u * Math.PI) * (v < 2 ? 7 : -7);
    frame.style.transform = 'perspective(160cqw) rotateY(' + lean.toFixed(2) + 'deg)';
    dial.style.setProperty('--a', ((v - 2) * 30).toFixed(1) + 'deg');
  }

  async function onMe() { const p = await bringPhoto(); if (p) openMirror({ print: p, picks, words: input.value }); }

  function close(now = false) {
    if (current !== self) return; current = null;
    stops.forEach(f => f()); stopTurning();
    if (now || reduced) { el.remove(); return; }
    el.classList.remove('is-in'); el.classList.add('is-out'); setTimeout(() => el.remove(), 420);
  }
  // all set: the takes: the face as it is first, then each one that comes back (or, for an example, each look they were given)
  if (person) for (const look of person.looks) takes.push({ url: look.image, ...made, look, picks: pickOf(look) });
  show(-1, true); paintTakes(); paintPicks();
  new ResizeObserver(() => fit()).observe(stageEl);
  new ResizeObserver(() => fit(true)).observe(takesRow);
  requestAnimationFrame(() => { el.classList.add('is-in'); fit(); if (from) flip(frame, from, { duration: 620 }); });
  const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey); stops.push(() => document.removeEventListener('keydown', onKey));

  (async () => {
    partsRow.hidden = true;   // the face is the menu once it is read: the chips come back only where no face is found
    frame.classList.add('is-reading');
    try { base = await canvasOf(person ? person.portrait : print.blob); } catch { base = null; }
    fit();
    face = base ? await faceOf(base) : null;
    frame.classList.remove('is-reading');
    if (!el.isConnected) return;
    if (!face) { el.classList.add('no-face'); toast(base ? 'No face found: a change goes over the whole picture' : 'That picture could not be read', 2800); }
    else {
      try { turn = turner(turnView, face); } catch { turn = null; }
      if (turn && base) { const f = face; hairOf(base).then(m => { if (m) turn?.hair(m, f); }); }
      await reading();
    }
    placeNotes(); drawSketch(); menu();
    turnBtn.hidden = !(live || person?.looks.some(l => l.angles?.length));
    const look = o.look && takes.findIndex(t => t.look === o.look);
    if (typeof look === 'number' && look >= 0) show(look);
    else if (picks[0]) choose(picks[0].part);
    // then, unless they came asking for something already, the face looks this way and that as its notes come in
    if (o.go) tryOn(); else if (face && shown < 0) hello();
  })();

  const self = { close };
  current = self;
  return self;
}

/** The picks an example's look stands for. @param {Look} look @returns {Pick[]} */
function pickOf(look) {
  const s = styleOf(look.part, look.style);
  return s ? [{ part: look.part, style: s }] : [];
}
