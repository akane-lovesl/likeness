/**
 * The mirror: one face, and what it could look like. The face is read where it is, on the device: a line of light
 * passes down it, its points light up, the parts a look can change outline themselves, and each becomes a place to
 * touch. Pick a part on the face or by name, a style for it by its drawing, a few words if you like, and try it on.
 * A live studio sends back four takes to scrub through and keep, and then every angle of the one kept. In the
 * showcase the change is sketched over the face instead, and says so.
 */
import { h, icon, toast, chooseFiles, stage, clamp, fitting } from '../core/dom.js';
import { drag, flip, spring, reduced } from '../core/motion.js';
import { on, emit } from '../core/bus.js';
import { progressAt } from '../core/estimate.js';
import { studio } from '../studio/studio.js';
import * as P from '../studio/painter.js';
import { faceOf, reframed, knowHair, contoursOf, shapesOf, maskOf, partAt, hairOf, yawOf } from '../studio/face.js';
import { activityPill } from '../ui/activity.js';
/** @typedef {import('../studio/face.js').Face} Face */
/**
 * The frame turning through a ring of angles: each picture with its face where it is known; two turners (m) where
 * neighbours both have one, so the head turns between them rather than one picture fading into the next.
 * @typedef {{ ring: { src: string, face?: Face | null, hair?: HTMLCanvasElement | null }[], p: number, at: number, a: HTMLImageElement, b: HTMLImageElement, imgs: (HTMLImageElement | null)[], m: null | { cs: HTMLCanvasElement[], ts: any[], on: number[] } }} Turning
 */
import { addPrint, addItem, setKept, printById, urlOf, settings } from '../state.js';
import { runTurn } from '../ui/turn.js';
import { PARTS, partById, styleOf, wordsFor, titleOf, plateSVG, partsIn, tintOf } from './vocab.js';
import { markup, controlsOf } from './markup.js';
import { paintLook, coloursOf, PAINTED } from './paint.js';
import { hear } from './words.js';
import { turner } from './turn.js';
import { openLive, canLive } from './live.js';
import { coat, dyeHair } from './tint.js';
import { ages, aged, upkeepOf, upkeepSaid, weeksSaid, noteAt, grownWords, rootsOf, markOf, WEEKS, GROW } from './time.js';

const SVG = 'http://www.w3.org/2000/svg';
const INK = '#fff4e0';
/** How far a turner turns (radians) for a head to turn from one yaw (see yawOf) to another: a turn of .32 takes the nose about half-way to the edge of the face. */
const TURN_PER_YAW = .65;
/** What else could be said about each part, shown in the empty line. */
const HINTS = /** @type {Record<string, string>} */ ({ bangs: 'a little longer, parted off-centre', brows: 'a touch fuller at the front', colour: 'with soft lowlights', cut: 'keep the length at the back', lashes: 'subtle, for daytime', lips: 'a little sheer', beard: 'neat along the cheeks' });

/** @typedef {{ part: string, style: import('./vocab.js').Style, shape?: Record<string, number>, said?: string, heard?: Record<string, number> }} Pick a style picked for a part, shaped (see markup.js) and saying so; heard, the part of its shape the words gave it */
/** @typedef {{ part: string, style: string, words?: string, image: string, takes?: string[], angles?: string[] }} Look */
/** @typedef {{ id: string, name?: string, kind?: string, portrait: string, looks: Look[] }} Person */
/** @typedef {{ url: string, label: string, kind: string, print?: any, picks?: Pick[], look?: Look, pending?: boolean, p?: number, preview?: string, weeks?: number }} Take a picture in the frame; weeks, how long after the salon it shows the look */
/** What the mirror says at each stage of a turn while the studio works, until the studio says something itself. */
const STAGE_SAYS = /** @type {Record<string, string>} */ ({ read: 'Looking closely', plan: 'Working out how', draw: 'Making it', finish: 'Nearly there' });
/** How long is left, as a person would say it; once past what was expected, how long it has been. @param {number} left @param {number} gone */
const timeLeft = (left, gone) => (left > 4500 ? 'about ' + Math.ceil(left / 5000) * 5 + ' s' : left > -6000 ? 'any moment' : Math.round(gone / 1000) + ' s so far');

let current = /** @type {{ close: (now?: boolean) => void } | null} */ (null);
/** Whether Grow out has been shown once already (it is lit up the first time). */
let toldWhen = false;

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

/** Words cut to a length at a word, with an ellipsis, never part-way through one. @param {string} s @param {number} n */
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');

/**
 * Marks drawn on a picture: each in its colour, round-ended, with a soft shadow so a white one reads on a pale face.
 * @param {CanvasRenderingContext2D} x @param {number} W @param {number} H @param {{ ink: string, w: number, pts: { x: number, y: number }[] }[]} marks
 */
function drawMarks(x, W, H, marks) {
  x.save(); x.lineCap = 'round'; x.lineJoin = 'round'; x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = Math.max(1, W / 300);
  for (const m of marks) {
    x.strokeStyle = m.ink; x.lineWidth = Math.max(2, m.w * W); x.beginPath();
    m.pts.forEach((p, i) => (i ? x.lineTo(p.x * W, p.y * H) : x.moveTo(p.x * W, p.y * H)));
    if (m.pts.length === 1) x.lineTo(m.pts[0].x * W + .1, m.pts[0].y * H);
    x.stroke();
  }
  x.restore();
}
/** Whether a mark comes back round to where it began: drawn round something, so what is inside it is meant too. @param {{ pts: { x: number, y: number }[] }} m */
function loopOf(m) {
  if (m.pts.length < 8) return false;
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of m.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const a = m.pts[0], b = m.pts[m.pts.length - 1], size = Math.hypot(x1 - x0, y1 - y0);
  return size > .04 && Math.hypot(a.x - b.x, a.y - b.y) < size * .25;
}

/** Each picture's parts as last recoloured (its mask, and the colour put on it): weeks on, only the roots are new. @type {WeakMap<HTMLCanvasElement, Map<string, { tint: string, mask: HTMLCanvasElement, layer: HTMLCanvasElement }>>} */
const dyedAt = new WeakMap();
/**
 * The new colours, painted where they go (the hair, the lips) and nowhere else: the picture itself recoloured inside
 * the part's mask, so the light and the strands stay its own. Weeks on, a colour's roots have come in, along the
 * hairline and up the parting, in the hair's own colour (kept with it as roots, for a painted fringe to take too).
 * Transparent where nothing changes colour.
 * @param {HTMLCanvasElement} pic @param {any} f @param {Pick[]} picks @param {number} [weeks]
 * @returns {Promise<(HTMLCanvasElement & { roots?: HTMLCanvasElement | null }) | null>}
 */
async function washOf(pic, f, picks, weeks = 0) {
  const c = /** @type {HTMLCanvasElement & { roots?: HTMLCanvasElement | null }} */ (P.make(pic.width, pic.height)), x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  let any = false; c.roots = null;
  let kept = dyedAt.get(pic); if (!kept) dyedAt.set(pic, kept = new Map());
  for (const q of picks) {
    const tint = tintOf(q.part, q.style.id, q.shape?.shade || 0); if (!tint || !f) continue;
    let was = kept.get(q.part);
    const m = was?.mask || await maskOf(pic, f, q.part); if (!m) continue;
    if (!was || was.tint !== tint) {
      const layer = P.copy(pic), lx = /** @type {CanvasRenderingContext2D} */ (layer.getContext('2d'));
      if (q.part === 'colour') dyeHair(lx, tint, m); else coat(lx, tint, q.part);
      lx.globalCompositeOperation = 'destination-in'; lx.globalAlpha = 1; lx.drawImage(m, 0, 0);
      kept.set(q.part, was = { tint, mask: m, layer });
    }
    const roots = q.part === 'colour' && weeks > 0 ? rootsOf(f, m, weeks, q.style.id) : null;
    if (roots) {
      const grown = P.copy(was.layer), gx = /** @type {CanvasRenderingContext2D} */ (grown.getContext('2d'));
      gx.globalCompositeOperation = 'destination-out'; gx.drawImage(roots, 0, 0, grown.width, grown.height);
      x.drawImage(grown, 0, 0); c.roots = roots;
    } else x.drawImage(was.layer, 0, 0);
    any = true;
  }
  return any ? c : null;
}
/** A face's forehead, brow to hairline, in its picture's pixels: what the hair grows by is measured in it. @param {Face} f */
const foreheadOf = (f) => { const bh = f.box[3]; return Math.max(bh * .12, Math.min(f.pts[105].y, f.pts[334].y) - (f.pts[10].y - bh * .02)); };

/**
 * Opens the mirror on a photo (a print) or on one of the studio's example people.
 * @param {{ print?: any, person?: Person, look?: Look, picks?: Pick[], words?: string, from?: Element | null, go?: boolean, face?: Face | null, hair?: string | null, turns?: import('./live.js').Side[], after?: any }} o (after: a turn from before, its takes brought back)
 */
export function openMirror(o) {
  current?.close(true);
  const person = o.person || null, live = studio.live;
  const print = o.print || null;
  /** @type {Pick[]} */ let picks = [...(o.picks || [])];
  // words it came with were heard already: their shapes are the words' to change, and a look only they asked for goes when they stop asking
  const byWords = /** @type {Set<string>} */ (new Set());
  for (const x of o.words ? hear(o.words) : []) picks = picks.map(q => (q.part === x.part ? (byWords.add(q.part), { ...q, heard: x.shape }) : q));
  let part = '', shown = -1, busy = false, spotsUp = false, washing = 0, swap = 0;
  // the weeks after the salon: how many the frame shows the look at, and whether the mirror is looking ahead
  let weeks = 0, timing = false, moved = false, timeWalk = 0, sketchRaf = 0, fadeNext = false, timePainting = false, timeAgain = false;
  /** The fades from one week to the next, while they run. @type {Animation[]} */
  let fading = [];
  /** What was drawn on the picture, each mark in its colour, as shares of the picture's width and height. @type {{ ink: string, w: number, pts: { x: number, y: number }[] }[]} */
  let marks = [];
  let drawingNow = false, ink = '#ff3b5c';
  /** A picture whose look to borrow. @type {{ print: any, url: string } | null} */
  let ref = null;
  /** A reference being read and kept, still: a Try on waits for it. @type {Promise<void> | null} */
  let refLoading = null;
  // how many of the studio's turns are under way here, and which is the latest (the frame shows that one's wait)
  let making = 0, lead = -1;
  /** @type {ReturnType<typeof turner>} */ let turn = null;
  const surfaces = new WeakMap();
  const dealt = new WeakSet(), developed = new WeakSet();
  /** @type {Take[]} */ const takes = [];
  /** @type {import('../studio/face.js').Face | null} */ let face = null;
  /** @type {HTMLCanvasElement | null} */ let base = null;
  /** @type {any} */ let examplePrint = null;
  const made = person?.kind === 'render' ? { label: 'GPT Image', kind: 'render' } : person?.kind === 'drawn' ? { label: 'Drawn', kind: 'sketch' } : { label: 'Simulated', kind: 'simulated' };
  // the picture as it is: an example's own kind; a photo of you; or, opened again from the studio's list, whatever it was
  const own = print?.provenance?.kind && !['photo', 'upload'].includes(print.provenance.kind) ? { label: print.provenance.label || labelOf(print), kind: print.provenance.kind } : { label: 'Your photo', kind: 'photo' };
  const origin = /** @type {Take} */ ({ url: person ? person.portrait : urlOf(print), ...(person ? made : own) });
  const stops = /** @type {(() => void)[]} */ ([]);

  const glow = h('div.mr-glow', { 'aria-hidden': 'true' });
  const pic = h('img.mr-pic', { alt: '', draggable: false }), over = h('img.mr-pic.mr-over', { alt: '', draggable: false });
  // the light a picture arriving from the studio is swept in by, as the Lookbook's looks are
  const glint = h('i.mr-glint', { 'aria-hidden': 'true' });
  // while the studio works: its previews developing in place, a light over what it is changing, its words in the frame
  const preview = /** @type {HTMLImageElement} */ (h('img.mr-pic.mr-preview', { alt: '', draggable: false })), workEl = h('div.mr-work', { 'aria-hidden': 'true' });
  const sayNow = h('span.mr-words__say'), etaEl = h('span.mr-words__eta'), wordsEl = h('p.mr-words', { 'aria-live': 'polite' }, sayNow, etaEl);
  const read = /** @type {HTMLCanvasElement} */ (h('canvas.mr-read', { 'aria-hidden': 'true' }));
  const turnView = /** @type {HTMLCanvasElement} */ (h('canvas.mr-turnview', { 'aria-hidden': 'true' }));
  const wash = /** @type {HTMLCanvasElement} */ (h('canvas.mr-wash', { 'aria-hidden': 'true' }));
  // what is painted rather than drawn: a fringe in the hair's own colour, brows, liner, a beard (the pencil only shows while shaping)
  const paintEl = /** @type {HTMLCanvasElement} */ (h('canvas.mr-paint', { 'aria-hidden': 'true' }));
  // a week as it was, fading as the next comes up through it
  const ghost = /** @type {HTMLCanvasElement} */ (h('canvas.mr-ghost', { 'aria-hidden': 'true' }));
  const sk = document.createElementNS(SVG, 'svg'); sk.setAttribute('class', 'mr-sketch'); sk.setAttribute('aria-hidden', 'true'); sk.setAttribute('preserveAspectRatio', 'none');
  const notes = h('div.mr-notes'), lines = document.createElementNS(SVG, 'svg'); lines.setAttribute('class', 'mr-lines'); lines.setAttribute('aria-hidden', 'true');
  const stampEl = h('span.mr-stamp');
  const keepBtn = h('button.mr-keep', { type: 'button', hidden: true, 'aria-label': 'Keep this one', html: icon('heart'), onclick: () => keep() });
  const turnBtn = h('button.mr-turn', { type: 'button', hidden: true, 'aria-label': 'Every angle', title: 'Every angle', html: icon('orbit'), onclick: () => angles() });
  const dial = h('div.mr-dial', { hidden: true, 'aria-hidden': 'true' }, h('i'));
  const handlesEl = h('div.mr-handles'), sayEl = h('div.mr-say', { 'aria-live': 'polite' });
  // what leans in when a part is chosen: the picture and everything drawn on it, not the notes in its margins
  const marksEl = /** @type {HTMLCanvasElement} */ (h('canvas.mr-marks', { 'aria-hidden': 'true' }));
  const lens = h('div.mr-lens', null, pic, over, glint, preview, turnView, wash, paintEl, ghost, read, workEl, sk, marksEl, handlesEl);
  const INKS = ['#ff3b5c', '#ffd43b', '#ffffff'];
  const drawBar = h('div.mr-drawbar', { role: 'toolbar', 'aria-label': 'Drawing' },
    ...INKS.map((c, i) => h('button.mr-drawbar__ink', { type: 'button', 'aria-label': ['Red', 'Yellow', 'White'][i] + ' pen', 'aria-pressed': String(i === 0), style: { '--pen': c }, onclick: (/** @type {Event} */ e) => { ink = c; drawBar.querySelectorAll('.mr-drawbar__ink').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } })),
    h('button.mr-drawbar__do', { type: 'button', 'aria-label': 'Undo the last mark', html: icon('undo'), onclick: () => { marks.pop(); paintMarks(); paintPicks(); } }),
    h('button.mr-drawbar__do', { type: 'button', 'aria-label': 'Clear the marks', html: icon('trash'), onclick: () => { marks = []; paintMarks(); paintPicks(); } }),
    h('button.mr-drawbar__done', { type: 'button', onclick: () => drawing(false) }, 'Done'));
  // the weeks after the salon, for a look that grows (a fringe, a colour's roots, a cut, brows, a beard): asked for on the
  // frame; then the frame says what the weeks have done, and is dated the day it would be, the way a camera once
  // printed the date in the corner of a picture
  const whenBtn = h('button.mr-when', { type: 'button', hidden: true, 'aria-label': 'Grow it out: the look in the weeks after the salon', onclick: () => timeMode(true) }, h('span', { html: icon('weeks') }), 'Grow out');
  const capSay = h('span.mr-cap__say'), capDate = /** @type {HTMLTimeElement} */ (h('time.mr-cap__date'));
  const capEl = h('p.mr-cap', { 'aria-hidden': 'true' }, capSay, capDate);
  const frame = h('div.mr-frame', null, lens, lines, notes, sayEl, stampEl, keepBtn, turnBtn, whenBtn, dial, capEl, wordsEl, drawBar);
  const takesRow = h('div.mr-takes', { role: 'listbox', 'aria-label': 'Takes' });
  const chips = PARTS.map(p => h('button.mr-part', { type: 'button', 'data-part': p.id, 'aria-pressed': 'false', onclick: () => choose(p.id) },
    h('span.mr-part__glyph', { html: plateSVG(p.id, p.styles[0].id) }), h('span.mr-part__name', null, p.name)));
  const partsRow = h('div.mr-parts', { role: 'toolbar', 'aria-label': 'What to change' }, ...chips);
  const stylesRow = h('div.mr-styles', { role: 'listbox', hidden: true });
  // the weeks, a ruler from today to three months on: a tick each week, taller each month, and a mark where the look
  // will want seeing to (a trim, its roots), lit once the weeks have reached it
  const range = /** @type {HTMLInputElement} */ (h('input.mr-time__range', { type: 'range', min: '0', max: String(WEEKS), step: '1', value: '0', 'aria-label': 'Weeks from today', oninput: () => setWeeks(range.valueAsNumber, true) }));
  const headEl = h('span.mr-time__head', { 'aria-hidden': 'true' }, h('b')), marksRow = h('span.mr-time__marks', { 'aria-hidden': 'true' });
  const ruler = h('div.mr-time__ruler', null,
    h('span.mr-time__ticks', { 'aria-hidden': 'true' }, ...Array.from({ length: WEEKS + 1 }, (_, k) => h('i' + (k % 4 ? '' : '.is-month'), { style: { '--x': String(k / WEEKS) } }))),
    h('i.mr-time__fill', { 'aria-hidden': 'true' }), marksRow, headEl, range);
  const timeBar = h('div.mr-time', { hidden: true, role: 'group', 'aria-label': 'The weeks after the salon' }, ruler, h('button.mr-time__done', { type: 'button', onclick: () => timeMode(false) }, 'Done'));
  const tokens = h('div.mr-ask__tokens');
  // more ways to say it than words: draw on the picture, or bring a picture whose look to borrow
  const trayEl = h('div.mr-tray', { role: 'menu', 'aria-label': 'More ways to ask' },
    h('button.mr-tray__do', { type: 'button', role: 'menuitem', 'data-do': 'draw', onclick: () => { tray(false); drawing(true); } }, h('span.mr-tray__ic', { html: icon('brush') }), h('span.mr-tray__say', null, h('b', null, 'Draw on it'), h('small', null, 'Circle it, cross it out, sketch the shape'))),
    h('button.mr-tray__do', { type: 'button', role: 'menuitem', 'data-do': 'ref', onclick: () => { tray(false); chooseRef(); } }, h('span.mr-tray__ic', { html: icon('image') }), h('span.mr-tray__say', null, h('b', null, 'A reference'), h('small', null, 'A cut, a colour, an outfit to borrow'))));
  const addBtn = h('button.mr-ask__add', { type: 'button', 'aria-label': 'Draw on it, or add a reference picture', 'aria-expanded': 'false', html: icon('plus'), onclick: () => tray(!trayEl.classList.contains('is-open')) });
  const input = /** @type {HTMLInputElement} */ (h('input.mr-ask__input', { type: 'text', 'aria-label': 'Anything else', placeholder: 'Touch a part of the face, or say it', autocomplete: 'off', enterkeyhint: 'go', value: o.words || '', oninput: () => { paintGo(); listen(); }, onfocus: () => hint(), onblur: () => hint() }));
  const goBtn = h('button.mr-ask__go', { type: 'submit' }, h('span', { html: icon('sparkle') }), h('span.mr-ask__label', null, 'Try on'));
  const ask = h('form.mr-ask', { onsubmit: (/** @type {Event} */ e) => { e.preventDefault(); tryOn(); } }, addBtn, h('div.mr-ask__field', null, tokens, input), goBtn);
  const back = h('button.mr-bar__back', { type: 'button', 'aria-label': 'Back', html: icon('back'), onclick: () => (timing ? timeMode(false) : showingNow ? showing(false) : close()) });
  // on a drawn face, the look is tried on you next; on you, it is shown to someone (the one who will cut it)
  const mine = person ? h('button.mr-bar__mine', { type: 'button', onclick: () => onMe() }, h('span', { html: icon('camera') }), 'On me')
    : h('button.mr-bar__mine.mr-bar__show', { type: 'button', hidden: true, 'aria-label': 'Show it: the look, large, to show someone', onclick: () => showing(true) }, h('span', { html: icon('expand') }), 'Show');
  const showWords = h('ol.mr-show__words');
  const showEl = h('div.mr-show', { hidden: true }, showWords,
    h('div.mr-show__row', null,
      h('button.mr-show__save', { type: 'button', onclick: () => saveCard() }, h('span', { html: icon('page') }), 'Save the card'),
      h('button.mr-show__done', { type: 'button', onclick: () => showing(false) }, 'Done')));
  const bar = h('header.mr-bar', null, back, h('span.mr-bar__edition', { 'data-mode': studio.mode }, studio.label), activityPill(), mine);
  // a reference, clipped to the mirror's corner like a photo tucked into its frame
  const refEl = h('button.mr-ref', { type: 'button', hidden: true, 'aria-label': 'The reference: remove it', onclick: () => { ref = null; paintRef(); paintPicks(); hint(); } }, h('img', { alt: '' }), h('span.mr-ref__say', null, 'Reference'), h('i.mr-ref__x', { html: icon('close') }));
  const stageEl = h('div.mr-stage', null, frame, refEl, takesRow);
  const el = h('section.mr', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mirror', 'data-mode': studio.mode }, glow, bar, stageEl, h('div.mr-dock', null, partsRow, stylesRow, timeBar, trayEl, ask), showEl);
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
    for (const c of [read, wash, paintEl, ghost, turnView, marksEl]) { const k = c === turnView ? 1 : sharp, w = Math.round(fw * dpr * k), hgt = Math.round(fh * dpr * k); if (c.width !== w || c.height !== hgt) { c.width = w; c.height = hgt; } }
    turn?.draw();
    if (part) mark(part); paintWash(); focus(part); paintHandles(); paintMarks(); placeRef();
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
    // the names on the left point to the left of the face, those on the right to its right; a mirrored face (the front
    // camera's, as you saw yourself) has the names of its sides the other way round, so the points are found by where they are
    const flip = q[263].x < q[33].x, k = (/** @type {number} */ i, /** @type {number} */ j) => (flip ? j : i);
    const fh = k(109, 338), br = k(70, 300), ey = k(263, 33), li = k(291, 61), ja = k(397, 172);
    const at = /** @type {Record<string, { x: number, y: number, z?: number }>} */ ({ bangs: { x: q[fh].x, y: (q[fh].y + q[k(105, 334)].y) / 2, z: z(fh) }, brows: { ...q[br], z: z(br) }, cut: { x: bx - bw * .1, y: by + bh * .7 }, colour: { x: bx + bw * .78, y: by - bh * .12 }, lashes: { x: q[ey].x + bw * .01, y: q[ey].y, z: z(ey) }, lips: { ...q[li], z: z(li) }, beard: { x: q[ja].x - bw * .02, y: q[ja].y, z: z(ja) } });
    anchors = [];
    const fr = frame.getBoundingClientRect(), W = fr.width, H = fr.height, gap = 30 / H;
    lines.setAttribute('viewBox', '0 0 ' + W.toFixed(1) + ' ' + H.toFixed(1));
    for (const [sideParts, left] of /** @type {[string[], boolean][]} */ ([[['bangs', 'brows', 'cut'], true], [['colour', 'lashes', 'lips', 'beard'], false]])) {
      const list = sideParts.map(id => ({ id, a: { x: clamp(at[id].x / f.w, .02, .98), y: clamp(at[id].y / f.h, .04, .96) }, y: 0 })).sort((m, k) => m.a.y - k.a.y);
      list.forEach((m, k) => { m.y = Math.max(m.a.y + (left ? -.02 : .02), k ? list[k - 1].y + gap : .1); });
      // (on the left, clear of the frame's corner, where Grow out is)
      const over = list[list.length - 1].y - (left ? .82 : .9); if (over > 0) list.forEach(m => { m.y -= over; });
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

  /** A part, chosen: it is outlined on the face and its styles come up under the parts; chosen again, it is put down. @param {string} id */
  function choose(id) {
    const p = partById(id); if (!p) return;
    stopGreeting(); if (timing) timeMode(false);
    if (part === id && !partsRow.hidden) { unchoose(); return; }
    part = id; read.classList.toggle('is-quiet', fresh().some(q => q.part === id));
    chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.part === id))); lit();
    stylesRow.replaceChildren(
      ...p.styles.map((s, i) => h('button.mr-style', { type: 'button', role: 'option', 'data-style': s.id, style: { '--d': (i * 55) + 'ms' }, 'aria-selected': String(picks.some(q => q.part === id && q.style.id === s.id)), onclick: () => pick(id, s.id) },
        h('span.mr-style__plate', { html: plateSVG(id, s.id) }), h('span.mr-style__name', null, s.name))));
    menu();
    if (!reduced) stylesRow.animate([{ opacity: 0, translate: '6% 0' }, { opacity: 1, translate: '0 0' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    mark(id); focus(id); paintHandles();
  }
  /**
   * What the dock offers: the parts always; a part's styles under them once one is chosen. Room is made for the styles
   * by gliding, not jumping: the frame and the parts are moved where they land, then eased there from where they were.
   */
  function menu() {
    const glide = [frame, partsRow, timeBar], was = glide.map(e => e.getBoundingClientRect());
    partsRow.hidden = timing; stylesRow.hidden = timing || !part; timeBar.hidden = !timing; el.classList.toggle('has-menu', !!part && !timing); hint();
    if (reduced || !el.isConnected) return;
    glide.forEach((e, i) => {
      const a = was[i], b = e.getBoundingClientRect(); if (!a.height || !b.height) return;
      const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2), sx = a.width / b.width, sy = a.height / b.height;
      if (Math.abs(dy) < 1 && Math.abs(dx) < 1 && Math.abs(sy - 1) < .01) return;
      e.animate([{ translate: dx.toFixed(1) + 'px ' + dy.toFixed(1) + 'px', scale: sx.toFixed(4) + ' ' + sy.toFixed(4) }, { translate: '0 0', scale: '1 1' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }
  function unchoose() {
    part = ''; menu();
    chips.forEach(c => c.setAttribute('aria-pressed', 'false')); lit();
    ctx(read).clearRect(0, 0, read.width, read.height); focus(''); paintHandles();
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
  function paintPicks(sketch = true) {
    // each pick saying how it was shaped: shortly on the line, fully to the studio
    picks = picks.map(q => { const cs = sayOf(q), said = cs.map(c => c.phrase).filter(Boolean).join(', '); return said === (q.said || '') ? q : { ...q, said }; });
    paintTokens();
    stylesRow.querySelectorAll('.mr-style').forEach(b => b.setAttribute('aria-selected', String(picks.some(q => q.part === part && q.style.id === /** @type {HTMLElement} */ (b).dataset.style))));
    chips.forEach(c => c.classList.toggle('is-picked', picks.some(q => q.part === c.dataset.part)));
    // the weeks ahead, for a look that changes with them (and, looking ahead, its marks as the look now is)
    const grows = !!face && ages(picks);
    if (timing && !grows) timeMode(false);
    if (timing) { paintRuler(); paintTime(weeks); }
    if (whenBtn.hidden === (grows && !timing)) { whenBtn.hidden = !(grows && !timing); if (!whenBtn.hidden && !toldWhen) { toldWhen = true; whenBtn.classList.add('is-new'); setTimeout(() => whenBtn.classList.remove('is-new'), 3200); } }
    paintGo(); if (sketch) drawSketch(); paintWash(); paintHandles();
    if (!person) mine.hidden = !face || !picks.length;
  }
  /**
   * The line's tokens: the weeks on (first, as they are said of all of it), each pick (and, shortly, its shape), the
   * marks, the reference; each touched to take it off. A token stays as it is while it is still there, saying what it
   * now says, so only one new to the line pops in.
   */
  function paintTokens() {
    /** @type {[string, () => HTMLElement, ((b: HTMLElement) => void)?][]} */
    const want = [];
    if (timing && weeks) want.push(['when', () => h('button.mr-token.mr-token--when', { type: 'button', 'aria-label': 'Back to today', onclick: () => setWeeks(0, true) }, h('span.mr-token__plate', { html: icon('weeks') }), h('span.mr-token__name')), b => { /** @type {HTMLElement} */ (b.lastElementChild).textContent = weeksSaid(weeks) + ' on'; }]);
    for (const q of picks) {
      const shorts = sayOf(q).map(c => c.short).filter(Boolean).join(' · ');
      want.push(['pick:' + q.part + ':' + q.style.id, () => h('button.mr-token', { type: 'button', 'data-part': q.part, 'aria-label': 'Remove ' + q.style.name, onclick: () => pick(q.part, q.style.id) }, h('span.mr-token__plate', { html: plateSVG(q.part, q.style.id) }), h('span.mr-token__name', null, q.style.name)),
        b => { let em = b.querySelector('.mr-token__shape'); if (!shorts) { em?.remove(); return; } if (!em) b.append(em = h('em.mr-token__shape')); em.textContent = shorts; }]);
    }
    if (marks.length && !drawingNow) want.push(['marks', () => h('button.mr-token.mr-token--marks', { type: 'button', 'aria-label': 'Remove your marks', onclick: () => { marks = []; paintMarks(); paintPicks(); } }, h('span.mr-token__plate', { html: icon('brush') }), h('span.mr-token__name', null, 'Your marks'))]);
    if (ref) { const url = ref.url; want.push(['ref:' + url, () => h('button.mr-token.mr-token--ref', { type: 'button', 'aria-label': 'Remove the reference', onclick: () => { ref = null; paintRef(); paintPicks(); hint(); } }, h('img.mr-token__plate', { src: url, alt: '' }), h('span.mr-token__name', null, 'Reference'))]); }
    const had = new Map([...tokens.children].map(b => [/** @type {HTMLElement} */ (b).dataset.key, /** @type {HTMLElement} */ (b)]));
    const els = want.map(([key, make, fill]) => { let b = had.get(key); if (!b) { b = make(); b.dataset.key = key; } fill?.(b); return b; });
    for (const c of [...tokens.children]) if (!els.includes(/** @type {HTMLElement} */ (c))) c.remove();
    els.forEach((b, i) => { if (tokens.children[i] !== b) tokens.insertBefore(b, tokens.children[i] || null); });
  }
  function paintGo() { goBtn.toggleAttribute('disabled', !picks.length && !input.value.trim() && !marks.length && !ref); }

  // —— the weeks after the salon: the look as time will have it, and when it will want seeing to ——
  /** The day so many weeks from today, as a camera once printed it in the corner of a picture. @param {number} w */
  const dateAt = (w) => {
    const d = new Date(); d.setDate(d.getDate() + w * 7);
    const s = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
    return d.getFullYear() === new Date().getFullYear() ? s : s + " '" + String(d.getFullYear()).slice(2);
  };
  /**
   * Looking ahead, or back to today. Ahead, the parts make way for the weeks and the look is painted on the face as it
   * is; then the weeks walk on by themselves to the first time the look will want seeing to, showing what they do, and
   * from there they are the finger's. Back, the look is as it is today again. @param {boolean} on
   */
  function timeMode(on) {
    if (on === timing || (on && (!face || !ages(picks) || showingNow))) return;
    stopGreeting(); clearTimeout(timeWalk);
    const focused = timeBar.contains(document.activeElement) || whenBtn === document.activeElement;
    if (on) {
      if (drawingNow) drawing(false);
      tray(false); input.blur();
      if (part) { part = ''; chips.forEach(c => c.setAttribute('aria-pressed', 'false')); lit(); ctx(read).clearRect(0, 0, read.width, read.height); focus(''); }
      if (shown >= 0) show(-1);
    }
    const was = weeks;
    timing = on; weeks = 0; moved = false; range.value = '0';
    el.classList.toggle('is-when', on); whenBtn.hidden = on || !ages(picks); headEl.classList.remove('is-new');
    menu(); paintRuler(); paintTime(was); paintTokens(); paintHandles();
    if (was) { fadeNext = true; growSketch(was, 0); paintWash(); }
    if (!reduced) (on ? timeBar : partsRow).animate([{ opacity: 0, translate: '0 3cqw' }, { opacity: 1, translate: '0 0' }], { duration: 440, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    if (focused) (on ? range : whenBtn).focus({ preventScroll: true });
    if (!on) return;
    // the weeks walk on, a week at a time, to the first time the look will want seeing to
    const to = Math.min(WEEKS, ...upkeepOf(picks).map(u => u.at));
    if (reduced) { setWeeks(to); return; }
    let w = 0;
    const walk = () => { if (!timing || moved) return; setWeeks(++w); if (w < to) timeWalk = setTimeout(walk, 190); else timeWalk = setTimeout(() => { if (timing && !moved) headEl.classList.add('is-new'); }, 700); };
    timeWalk = setTimeout(walk, 650);
  }
  /** The weeks the frame shows: by hand, on the ruler, or walking on by themselves. @param {number} w @param {boolean} [byHand] */
  function setWeeks(w, byHand = false) {
    if (byHand) { moved = true; clearTimeout(timeWalk); headEl.classList.remove('is-new'); }
    const to = clamp(Math.round(w) || 0, 0, WEEKS); if (!timing || to === weeks) return;
    const was = weeks; weeks = to; if (range.valueAsNumber !== to) range.value = String(to);
    paintTime(was, byHand); paintTokens(); growSketch(was, to);
    fadeNext = true; repaintTime();
  }
  /** The look painted again for the weeks now: one painting at a time, and the last asked for painted next, so a moving finger is always followed. */
  async function repaintTime() {
    if (timePainting) { timeAgain = true; return; }
    timePainting = true;
    try { do { timeAgain = false; await paintWash(); } while (timeAgain && timing); }
    finally { timePainting = false; }
  }
  /**
   * What the weeks say: how long it has been, what is due by then (the caption), the day (in the frame's corner), and
   * on the ruler, how far they have come, each mark passed lighting up. @param {number} was @param {boolean} [byHand]
   */
  function paintTime(was, byHand = false) {
    if (!timing) return;
    const say = weeks ? noteAt(picks, weeks) : 'Fresh from the salon';
    /** @type {HTMLElement} */ (headEl.firstElementChild).textContent = weeksSaid(weeks);
    if (capSay.textContent !== say) { capSay.textContent = say; if (!reduced) capSay.animate([{ opacity: 0, translate: '0 .5em', filter: 'blur(2px)' }, { opacity: 1, translate: '0 0', filter: 'blur(0)' }], { duration: 380, easing: 'cubic-bezier(.2, .8, .2, 1)' }); }
    capDate.textContent = dateAt(weeks);
    ruler.style.setProperty('--at', (weeks / WEEKS).toFixed(4));
    range.setAttribute('aria-valuetext', weeksSaid(weeks) + ': ' + say);
    for (const m of /** @type {HTMLElement[]} */ ([...marksRow.children])) {
      const at = Number(m.dataset.at), due = weeks >= at;
      m.classList.toggle('is-due', due);
      // passing a mark, it lights with a little give (and, under a finger, a tick in the hand)
      if (due && was < at && !reduced) { m.animate([{ scale: 1 }, { scale: 1.4 }, { scale: 1 }], { duration: 460, easing: 'cubic-bezier(.3, 1.5, .5, 1)' }); if (byHand) navigator.vibrate?.(8); }
    }
  }
  /** The ruler's marks: when the look will want seeing to, and for what. What falls in the same week shares a mark; words that would touch take the row below. */
  function paintRuler() {
    /** @type {Map<number, string[]>} */ const by = new Map();
    for (const u of upkeepOf(picks)) { if (u.at > WEEKS) continue; const ws = by.get(u.at) || [], w = markOf(u); if (!ws.includes(w)) ws.push(w); by.set(u.at, ws); }
    const ends = [-Infinity, -Infinity];
    marksRow.replaceChildren(...[...by].sort((a, b) => a[0] - b[0]).map(([at, ws]) => {
      const say = ws.length > 2 ? ws.slice(0, 2).join(' · ') + ' +' + (ws.length - 2) : ws.join(' · '), half = say.length * .1 + .2;
      const row = ends[0] <= at - half ? 0 : ends[1] <= at - half ? 1 : ends[0] <= ends[1] ? 0 : 1;
      ends[row] = at + half;
      return h('span.mr-time__mark', { 'data-at': String(at), 'data-row': String(row), style: { '--x': String(at / WEEKS) } }, h('i'), h('b', null, say));
    }));
  }
  /** The pencil's strokes (a cut is drawn, not painted) grown from one week to another, moving where they are. @param {number} a @param {number} b */
  function growSketch(a, b) {
    cancelAnimationFrame(sketchRaf);
    if (reduced || !face) { drawSketch(); return; }
    const f = face, now = fresh().filter(q => aged(q, 1) !== q), t0 = performance.now(), D = 300;
    if (!now.length) return;
    const step = (/** @type {number} */ t) => {
      const u = Math.min(1, (t - t0) / D), e = 1 - (1 - u) ** 3, grow = (a + (b - a) * e) * GROW;
      for (const q of now) {
        const g = sk.querySelector('g[data-part="' + q.part + '"]'), strokes = markup(f, q.part, q.style.id, { ...(q.shape || {}), grow });
        if (!g || g.children.length !== strokes.length) { drawSketch(); return; }
        strokes.forEach((s, k) => { g.children[k].setAttribute('d', s.d); g.children[k].setAttribute('stroke-width', s.w.toFixed(2)); });
      }
      if (u < 1) sketchRaf = requestAnimationFrame(step);
    };
    sketchRaf = requestAnimationFrame(step);
  }

  // —— more ways to ask: drawing on the picture, and a picture whose look to borrow ——
  /** The + tray, open or shut. @param {boolean} on */
  function tray(on) { trayEl.classList.toggle('is-open', on); addBtn.setAttribute('aria-expanded', String(on)); }
  /**
   * Drawing on the picture: a finger draws instead of turning it, the pen's bar comes up in the frame, and the marks stay
   * over the picture until they are cleared, going to the studio with whatever is asked. @param {boolean} on
   */
  function drawing(on) {
    if (on && timing) timeMode(false);
    drawingNow = on; frame.classList.toggle('is-drawing', on); el.classList.toggle('is-drawing', on);
    if (on && !marks.length) toast('Draw on the picture: circle what to change, sketch the shape', 3400);
    paintMarks(); paintPicks(); hint();
  }
  /** A point under the finger, as shares of the picture's width and height. @param {number} x @param {number} y */
  const toShare = (x, y) => { const p = toPicture(x, y); return { x: clamp(p.x / (face?.w || 1)), y: clamp(p.y / (face?.h || 1)) }; };
  function paintMarks() {
    const x = ctx(marksEl); x.clearRect(0, 0, marksEl.width, marksEl.height);
    drawMarks(x, marksEl.width, marksEl.height, marks); frame.classList.toggle('has-marks', marks.length > 0);
  }
  /**
   * The picture with the marks on it, for the studio to read them from: kept on the device with the turn, not shown in
   * the album. @param {any} s the print changed @param {HTMLCanvasElement} pic2 @param {typeof marks} drawn
   */
  async function markedCopy(s, pic2, drawn) {
    const c = P.copy(pic2); drawMarks(ctx(c), c.width, c.height, drawn);
    return addPrint({ blob: await P.toBlob(c, 'image/jpeg', .9), w: c.width, h: c.height, origin: 'made', provenance: { kind: 'marks', label: 'Your marks', detail: 'The picture with your marks drawn on it, for the studio to follow' }, parents: [s.id] });
  }
  /** A reference chosen: a picture whose look (a cut, a colour, an outfit) the studio borrows for this face. */
  async function chooseRef() {
    const [file] = await chooseFiles({ multiple: false }); if (!file) return;
    // read and kept before anything is asked with it: a Try on touched meanwhile waits for it rather than leaving it out
    refLoading = (async () => {
      const c = await P.fromBlob(file, 1600).catch(() => null); if (!c) { toast('That picture could not be read'); return; }
      const p = await addPrint({ blob: await P.toBlob(c, 'image/jpeg', .9), w: c.width, h: c.height, origin: 'upload', provenance: { kind: 'reference', label: 'Reference', detail: 'A picture chosen as a reference: its look, to borrow' } });
      ref = { print: p, url: urlOf(p) }; paintRef(); paintPicks(); hint();
      if (!reduced) refEl.animate([{ opacity: 0, translate: '0 -8cqw', scale: .6 }, { opacity: 1, translate: '0 0', scale: 1 }], { duration: 560, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    })().finally(() => { refLoading = null; });
    await refLoading;
  }
  function paintRef() { refEl.hidden = !ref; if (ref) /** @type {HTMLImageElement} */ (refEl.querySelector('img')).src = ref.url; placeRef(); }
  /** The reference, tucked into the frame's top corner. */
  function placeRef() {
    if (!ref) return;
    const s = stageEl.getBoundingClientRect(), f = frame.getBoundingClientRect();
    refEl.style.left = (f.right - s.left - f.width * .24) + 'px'; refEl.style.top = (f.top - s.top - 8) + 'px';
  }

  /** The picks not yet made on the picture on show: what the sketch draws, and what a try-on asks for anew. */
  const fresh = () => { const made = shown >= 0 ? takes[shown]?.picks || [] : []; return picks.filter(q => !made.some(d => d.part === q.part && d.style.id === q.style.id && shapeKey(d) === shapeKey(q))); };
  /** The look as the frame shows it: those picks, as they will be the weeks on the mirror is looking at. */
  const lookNow = () => (timing && weeks ? fresh().map(q => aged(q, weeks)) : fresh());
  /** A pick's shape, as one comparable string. @param {Pick} q */
  const shapeKey = (q) => Object.entries(q.shape || {}).filter(([, v]) => Math.abs(v) > .02).sort().map(([k, v]) => k + v.toFixed(2)).join(',');
  /** The new picks, drawn over the face the way a stylist marks up a photo: strokes for shapes, washes for colours. */
  /** The parts of the look that could not be painted on the picture on show, which keep their pencil. @type {Set<string>} */
  let bare = new Set();
  function unbare(/** @type {Set<string>} */ now) { bare = now; for (const g of sk.querySelectorAll('g[data-part]')) { const p = /** @type {SVGGElement} */ (g).dataset.part || ''; g.classList.toggle('is-painted', PAINTED.has(p) && !bare.has(p)); } }
  function drawSketch() {
    sk.replaceChildren(); if (!face) return;
    sk.setAttribute('viewBox', '0 0 ' + face.w + ' ' + face.h);
    const now = lookNow(); let k = 0;
    for (const q of now) {
      const strokes = markup(face, q.part, q.style.id, q.shape); if (!strokes.length) continue;
      const g = document.createElementNS(SVG, 'g'); g.dataset.part = q.part; if (PAINTED.has(q.part) && !bare.has(q.part)) g.classList.add('is-painted');
      for (const s of strokes) { const d = document.createElementNS(SVG, 'path'); d.setAttribute('d', s.d); d.setAttribute('stroke-width', s.w.toFixed(2)); d.setAttribute('pathLength', '1'); d.style.setProperty('--k', String(Math.min(30, k++))); g.append(d); }
      sk.append(g);
    }
    el.classList.toggle('has-sketch', now.length > 0);
    // once a style is drawn on the chosen part, its outline steps back
    read.classList.toggle('is-quiet', now.some(q => q.part === part));
  }
  async function paintWash() {
    const n = ++washing, now = lookNow(), wk = timing ? weeks : 0;
    const w = face && base && now.some(q => tintOf(q.part, q.style.id)) ? await washOf(base, face, now, wk) : null;
    if (n !== washing) return;
    // then what is painted from the picture itself, in its own colours (or the colour the look dyes the hair, its roots
    // grown in): made whole before either is shown, so the colour and the fringe change together
    const want = face && base ? now.filter(q => PAINTED.has(q.part)) : [], key = want.map(q => q.part + q.style.id).join();
    /** @type {ReturnType<typeof paintLook>} */ let c = null;
    if (want.length && face && base) {
      const f = face, b = base, src = await onShow(); if (n !== washing) return;
      const tone = await tonesOf(src || b); if (n !== washing) return;
      c = paintLook(src || b, f, want.map(q => ({ part: q.part, style: q.style.id, shape: q.shape })), [0, 0, f.w, f.h], paintEl.width / f.w, { ...tone, dye: dyeOf(now), roots: w?.roots || null });
    }
    // from one week to the next, the last fades as the next comes up through it
    const fade = fadeNext && !reduced; fadeNext = false;
    if (fade) { const gx = ctx(ghost); gx.clearRect(0, 0, ghost.width, ghost.height); gx.globalAlpha = .95; gx.drawImage(wash, 0, 0, ghost.width, ghost.height); gx.globalAlpha = 1; gx.drawImage(paintEl, 0, 0, ghost.width, ghost.height); }
    const x = ctx(wash), px = ctx(paintEl);
    x.clearRect(0, 0, wash.width, wash.height); if (w) x.drawImage(w, 0, 0, wash.width, wash.height);
    px.clearRect(0, 0, paintEl.width, paintEl.height); if (c) px.drawImage(c, 0, 0, paintEl.width, paintEl.height);
    // what could not be painted on this picture (a fringe where no hair was found) keeps its pencil
    unbare(new Set(want.filter(q => !c?.painted.has(q.part)).map(q => q.part)));
    if (fade) crossfade();
    // a new look falls into place; a reshaped one is simply there
    else if (key && key !== paintedKey && !reduced) { paintEl.classList.remove('is-new'); void paintEl.offsetWidth; paintEl.classList.add('is-new'); }
    paintedKey = key;
  }
  /** The week that was (on the ghost) fading as the one now comes up through it. */
  function crossfade() {
    for (const a of fading) a.cancel();
    fading = [ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.45, 0, .7, 1)' }),
      ...[wash, paintEl].map(c => c.animate([{ opacity: 0 }, { opacity: getComputedStyle(c).opacity }], { duration: 340, easing: 'cubic-bezier(.2, .7, .3, 1)' }))];
  }
  let paintedKey = '';
  /** The colours of each picture shown, read once each (a render's hair is not the portrait's). @type {WeakMap<HTMLCanvasElement, Promise<ReturnType<typeof coloursOf>>>} */
  const toned = new WeakMap();
  const tonesOf = (/** @type {HTMLCanvasElement} */ c) => { const f = /** @type {Face} */ (face); if (!toned.has(c)) toned.set(c, hairOf(c).catch(() => null).then(m => coloursOf(c, f, m))); return /** @type {Promise<ReturnType<typeof coloursOf>>} */ (toned.get(c)); };
  /** The picture on show, at the face's size: the photo itself, or the take in the frame. @type {Map<string, Promise<HTMLCanvasElement | null>>} */
  const shownAt = new Map();
  const onShow = () => {
    const t = shown >= 0 ? takes[shown] : null; if (!t || !face || !t.url) return Promise.resolve(base);
    const f = face;
    if (!shownAt.has(t.url)) shownAt.set(t.url, canvasOf(t.print?.blob || t.url).then(raw => { if (raw.width === f.w && raw.height === f.h) return raw; const c = P.make(f.w, f.h); ctx(c).drawImage(raw, 0, 0, f.w, f.h); return c; }).catch(() => null));
    return /** @type {Promise<HTMLCanvasElement | null>} */ (shownAt.get(t.url));
  };
  /** The hair colour a look also asks for, which a painted fringe takes. @param {Pick[]} now */
  const dyeOf = (now) => { const d = now.find(q => q.part === 'colour'); return d ? tintOf('colour', d.style.id, d.shape?.shade || 0) || '' : ''; };

  /**
   * One of the takes (or, at -1, the face as it is) in the frame: at once, or come down over the last, or (the first
   * picture back from the studio) swept in across the face as it was, by the light the Lookbook's looks come in by.
   * @param {number} i @param {boolean} [instant] @param {boolean} [arrived]
   */
  function show(i, instant = false, arrived = false) {
    const t = i < 0 ? origin : takes[i]; if (!t || t.pending) return;
    if (i >= 0 && timing) timeMode(false);
    shown = i;
    over.classList.remove('is-in', 'is-sweep'); glint.classList.remove('is-on'); clearTimeout(swap);
    if (instant || reduced) pic.src = t.url;
    else if (arrived) { over.src = t.url; void over.offsetWidth; over.classList.add('is-sweep'); glint.classList.add('is-on'); swap = setTimeout(() => { pic.src = t.url; over.classList.remove('is-sweep'); glint.classList.remove('is-on'); }, 1300); }
    else { over.src = t.url; void over.offsetWidth; over.classList.add('is-in'); swap = setTimeout(() => { pic.src = t.url; over.classList.remove('is-in'); }, 300); }
    glow.style.backgroundImage = 'url("' + t.url + '")';
    stampEl.textContent = t.label + (t.weeks ? ' · ' + weeksSaid(t.weeks) + ' on' : ''); stampEl.dataset.kind = t.kind;
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
      const i = k - 1, b = h('button.mr-take', { type: 'button', role: 'option', 'data-i': String(i), 'aria-selected': String(i === shown), 'aria-label': (i < 0 ? 'As they are' : t.look ? titleOf(t.picks || []) : 'Take ' + k) + (t.weeks ? ', ' + weeksSaid(t.weeks) + ' on' : ''), 'data-weeks': t.weeks ? String(t.weeks) : null, style: { '--i': k, '--n': all.length }, onclick: (/** @type {MouseEvent} */ e) => { if (e.detail === 0) show(i); } },
        t.pending ? (t.preview ? h('img.mr-take__preview', { src: t.preview, alt: '', draggable: false }) : h('span.mr-take__wait')) : h('img' + (developed.has(t) ? '.is-still' : ''), { src: t.url, alt: '', draggable: false }));
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
  const shapeable = () => { const q = part && !timing ? picks.find(p => p.part === part) : null; return q && face && fresh().includes(q) ? q : null; };
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
    hint();
  }
  /** What the line asks for: how to begin, then a part's marks or words for it; beside the picks there is only room to say that more can be said. */
  function hint() {
    input.placeholder = fitting(input, ref && !picks.length ? ['What to borrow: the fringe, the colour…', 'What to borrow?'] : marks.length && !picks.length ? ['Say what the marks mean', 'What do they mean?'] : picks.length ? ['Say more…', 'More…'] : part ? (handleEls.size ? ['Drag the marks, or say it', 'Drag the marks'] : [HINTS[part] || '']) : face ? ['Touch a part of the face, or say it', 'Touch the face, or say it'] : ['Pick a part, or say it', 'Or say it']);
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

  // —— words: what is typed is heard as it is typed, and drawn ——
  /**
   * The words heard: a style they name is picked (and let go when they stop naming it), the shape they say is drawn,
   * gliding there, and the part they are about comes close, its mark saying what the words did to it.
   */
  function listen() {
    if (!face) return;
    const heard = hear(input.value, part || picks[picks.length - 1]?.part || ''), named = new Set(heard.map(x => x.part));
    const without = (/** @type {Record<string, number> | undefined} */ s, /** @type {Record<string, number> | undefined} */ drop) => Object.fromEntries(Object.entries(s || {}).filter(([k]) => !(drop && k in drop)));
    // what the words no longer say goes: a look only they asked for, and the shape they gave a look picked by hand
    let next = picks.filter(q => !(byWords.has(q.part) && !named.has(q.part))).map(q => (!named.has(q.part) && q.heard ? { ...q, shape: without(q.shape, q.heard), heard: undefined } : q));
    for (const p of [...byWords]) if (!named.has(p)) byWords.delete(p);
    for (const x of heard) {
      const had = next.find(q => q.part === x.part), s = styleOf(x.part, x.style || had?.style.id || partById(x.part)?.styles[0].id || '');
      if (!s) continue;
      if (!had) byWords.add(x.part);
      const nq = { part: x.part, style: s, shape: { ...without(had?.shape, had?.heard), ...x.shape }, heard: x.shape };
      next = had ? next.map(q => (q === had ? nq : q)) : [...next, nq];
    }
    const about = heard[heard.length - 1]?.part || '';
    glide(next, about);
    if (about && about !== part && !timing) choose(about);
  }
  let gliding = 0, quiet = 0;
  /**
   * The picks become these: a new look is drawn at once; a new shape is glided to, the strokes moving where they are (a
   * little past the mark, and back), and the handle the words moved says so. @param {Pick[]} next @param {string} about
   */
  function glide(next, about) {
    const from = picks, same = next.length === from.length && next.every(q => from.some(p => p.part === q.part && p.style.id === q.style.id));
    if (!same || reduced || !face) { gliding++; picks = next; paintPicks(); return; }
    const moved = next.filter(q => shapeKey(q) !== shapeKey(/** @type {Pick} */ (from.find(p => p.part === q.part))));
    if (!moved.length) { picks = next; return; }
    const id = ++gliding, t0 = performance.now(), D = 600, f = face;
    const mix = (/** @type {Pick} */ q, /** @type {number} */ e) => { const p = from.find(k => k.part === q.part), a = p?.shape || {}, b = q.shape || {}; return { ...q, shape: Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map(k => [k, (a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * e])) }; };
    const frame = (/** @type {number} */ now) => {
      if (id !== gliding) return;
      const t = Math.min(1, (now - t0) / D), e = t < 1 ? 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2 : 1;
      picks = next.map(q => mix(q, e));
      // the same strokes, moved: each part's drawing reshaped in place (drawn again only if its strokes changed in number)
      for (const q of lookNow()) {
        const g = sk.querySelector('g[data-part="' + q.part + '"]'), strokes = markup(f, q.part, q.style.id, q.shape);
        if (!g || g.children.length !== strokes.length) { drawSketch(); break; }
        strokes.forEach((s, k) => { g.children[k].setAttribute('d', s.d); g.children[k].setAttribute('stroke-width', s.w.toFixed(2)); });
      }
      paintHandles();
      if (t < 1) { requestAnimationFrame(frame); return; }
      picks = next; paintPicks(false);
      // the handle the words moved, saying what they made of it
      const q = picks.find(k => k.part === about && k.part === part), c = q && q.heard ? sayOf(q).filter(k => k.id in (q.heard || {})).pop() : null;
      if (c) { speak(c); clearTimeout(quiet); quiet = setTimeout(() => { sayEl.classList.remove('is-on'); said0 = ''; }, 1400); }
    };
    requestAnimationFrame(frame);
  }

  // on the frame: a drag turns the face (through its angles when the studio has made them, on the device when not),
  // a tap picks the part under it, and holding shows the face as it was
  let hold = 0, comparing = false, turning = /** @type {null | Turning} */ (null), showingNow = false, sway = 0, p0 = 0, anim = /** @type {{ stop(): void } | null} */ (null);
  let leaning = false, ready = false, pitchNow = 0, stampWas = /** @type {[string, string] | null} */ (null);
  // whether the finger has moved (or lifted) since it went down: a hold is only a hold if not
  let held0 = false;
  let greeting = 0;
  // a turn by hand is steered rather than set: the head goes after the finger with a little weight, so a jittery finger,
  // a picture that is still being made ready, or a lift-off never makes it jump
  const aim = { y: 0, p: 0 }, held = { y: 0, p: 0 };
  let steering = 0, steerAt = 0;
  const steer = (/** @type {number} */ now) => {
    const dt = Math.min(64, now - (steerAt || now)); steerAt = now;
    const k = 1 - Math.exp(-dt / 70);
    // until the picture is ready to turn the head waits where it is, then goes after the finger from there
    if (ready) { held.y += (aim.y - held.y) * k; held.p += (aim.p - held.p) * k; lean(held.y, held.p); }
    steering = leaning || (ready && (Math.abs(aim.y - held.y) > 1e-4 || Math.abs(aim.p - held.p) > 1e-4)) ? requestAnimationFrame(steer) : 0;
  };
  const steerTo = (/** @type {number} */ y, /** @type {number} */ p) => { aim.y = y; aim.p = p; if (!steering) { steerAt = 0; steering = requestAnimationFrame(steer); } };
  drag(frame, {
    start: e => {
      if (/** @type {HTMLElement} */ (e.target).closest('button')) return false;
      stopGreeting();
      if (drawingNow) { const at = toShare(e.clientX, e.clientY); marks.push({ ink, w: .011, pts: [at] }); paintMarks(); return; }
      anim?.stop(); if (turning) { p0 = turning.p; return; }
      if (turn && face) { ready = false; mount().then(ok => { ready = ok; }).catch(() => {}); }
      // (decided a frame later: a finger that moved while the device was busy, painting the face to turn, has its moves
      // heard first, so a drag is never taken for a hold)
      held0 = true;
      hold = setTimeout(() => requestAnimationFrame(() => { if (!held0 || leaning || (shown < 0 && !picks.length)) return; comparing = true; frame.classList.add('is-comparing'); over.src = origin.url; over.classList.add('is-held'); }), 280);
    },
    move: d => {
      if (drawingNow) { marks[marks.length - 1]?.pts.push(toShare(d.x, d.y)); paintMarks(); return; }
      if (Math.abs(d.dx) > 8 || Math.abs(d.dy) > 8) { clearTimeout(hold); held0 = false; }
      if (turning) { turnTo(clamp(p0 - d.dx / (frame.clientWidth * .45), 0, turning.ring.length - 1)); return; }
      if (turn && !comparing && (leaning || Math.abs(d.dx) > 8)) {
        if (!leaning) { leaning = true; held.y = turn.yaw; held.p = pitchNow; }
        // up and down only past a little give, so a sideways drag does not nod
        const dy = Math.sign(d.dy) * Math.max(0, Math.abs(d.dy) - 14);
        steerTo(.3 * Math.tanh(-d.dx / (frame.clientWidth * .5) * 1.25), .08 * Math.tanh(dy / (frame.clientHeight * .5) * 1.2));
      }
    },
    end: d => {
      if (drawingNow) { paintPicks(); return; }
      clearTimeout(hold); held0 = false;
      if (turning) { const to = Math.round(clamp(turning.p - d.vx / (frame.clientWidth * .45) * .25, 0, turning.ring.length - 1)); anim = spring({ from: turning.p, to, velocity: -d.vx / (frame.clientWidth * .45), stiffness: 140, damping: 22, onUpdate: v => turnTo(v) }); return; }
      if (comparing) { comparing = false; frame.classList.remove('is-comparing'); over.classList.remove('is-held'); return; }
      if (leaning) {
        leaning = false; cancelAnimationFrame(steering); steering = 0;
        if (!ready) { held.y = held.p = 0; return; }
        // back to the picture itself, settling without a wobble, carried on a little the way the finger was going
        const y = held.y, p = held.p;
        anim = spring({ from: 1, to: 0, velocity: Math.abs(y) > .01 ? clamp(-.75 * d.vx / frame.clientWidth / y, -2.5, 2.5) : 0, stiffness: 110, damping: 20, onUpdate: s => lean(y * s, p * s), onRest: () => { held.y = held.p = 0; lean(0, 0); } });
        return;
      }
      // (looking ahead, the face is for looking at: a part is chosen once back to today)
      if (Math.abs(d.dx) < 8 && Math.abs(d.dy) < 8 && face && !timing) {
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
    const t = shown >= 0 ? takes[shown] : origin, now = lookNow();
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
      const w = await washOf(pic0, own, now, timing ? weeks : 0); if (w) x.drawImage(w, 0, 0);
      const painted = now.filter(q => PAINTED.has(q.part));
      // painted as the frame paints it: with the picture's own hair (the fringe is combed from it)
      const pc = painted.length ? paintLook(pic0, own, painted.map(q => ({ part: q.part, style: q.style.id, shape: q.shape })), [0, 0, own.w, own.h], c.width / own.w, { ...(await tonesOf(pic0)), dye: dyeOf(now), roots: w?.roots || null }) : null;
      if (pc) x.drawImage(pc, 0, 0, c.width, c.height);
      x.save(); x.strokeStyle = INK; x.lineCap = 'round'; x.lineJoin = 'round'; x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = Math.max(2, c.width / 400);
      for (const q of now) if (!pc?.painted.has(q.part)) for (const s of markup(face, q.part, q.style.id, q.shape)) { x.lineWidth = s.w; x.stroke(new Path2D(s.d)); }
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
    if (!turn || reduced || part) return;
    if (!(await mount()) || current !== self || part || turning || leaning || showingNow || busy) return;
    ready = true;
    // one unbroken movement, never stopping between: out one way, through the middle, a smaller look the other way,
    // and home, slowing into each turn the way a head does; it nods a little as it goes
    const T = 2300, t0 = performance.now();
    const tick = (/** @type {number} */ now) => {
      const u = clamp((now - t0) / T);
      if (u >= 1) { stopGreeting(); return; }
      const s = Math.sin(Math.PI * u), y = .27 * Math.sin(2 * Math.PI * u) * s * (1 - .38 * u);
      lean(y, .045 * s * s * (1 - u) - .02 * Math.sin(2 * Math.PI * u) * s);
      greeting = requestAnimationFrame(tick);
    };
    greeting = requestAnimationFrame(tick);
  }
  function stopGreeting() {
    if (!greeting) return;
    cancelAnimationFrame(greeting);
    greeting = 0;
    lean(0, 0);
  }

  /** Tries the picks (and any words) on: four takes from a live studio, a sketch here. */
  async function tryOn() {
    if (refLoading) await refLoading;
    if (busy) return;
    const own = input.value.trim(), parts = [...new Set([...picks.map(q => q.part), ...partsIn(own)])];
    if (!parts.length && !own && !marks.length && !ref) { ask.classList.remove('is-asking'); void ask.offsetWidth; ask.classList.add('is-asking'); return; }
    if (drawingNow) drawing(false);
    tray(false); input.blur();
    // a sketch is made here, one at a time; the studio is asked for as many as you like, and works on them side by side
    if (!live) { busy = true; try { await sketchIt(); } catch (e) { toast(e instanceof Error ? e.message : 'That did not work'); } finally { busy = false; } return; }
    if (making) toast((making === 1 ? 'Making both' : 'Making ' + (making + 1) + ' at once') + ': the studio works on them side by side', 2600);
    try { await render(parts, own); }
    catch (e) { toast(e instanceof Error ? e.message : 'That did not work'); }
  }
  /** The print a change starts from: the take on show, or the face as it is (an example's portrait is brought in once). */
  async function subject() {
    const t = shown >= 0 ? takes[shown] : null;
    if (t?.print) return t.print;
    if (print) return print;
    if (examplePrint) return examplePrint;
    const blob = await (await fetch(t?.url || origin.url)).blob(), c = await P.fromBlob(blob, 1600);
    examplePrint = await addPrint({ blob: await P.toBlob(c, 'image/jpeg', .92), w: c.width, h: c.height, origin: 'upload', provenance: { kind: made.kind, label: made.label === 'GPT Image' ? 'Render' : made.label, detail: person?.kind === 'drawn' ? 'A drawn sitter: someone who does not exist, drawn' : 'An example portrait of someone who does not exist' } });
    await addItem({ type: 'prints', prints: [examplePrint.id], mine: true });
    return examplePrint;
  }
  /** Four takes from the studio: inside the parts' masks when the face was read, over the whole picture when not. @param {string[]} parts @param {string} own */
  async function render(parts, own) {
    const s = await subject(), pic2 = s === print && base ? base : await canvasOf(s.blob), f = s === print ? face : await faceOf(pic2);
    const masked = f && parts.length && !parts.includes('cut') ? parts : [];
    let mask = null;
    // asked weeks on, the studio is told what the weeks have done, and may change what has grown since
    const wk = timing ? weeks : 0;
    if (masked.length && f) {
      mask = P.make(pic2.width, pic2.height); const mx = ctx(mask);
      for (const p of masked) {
        const m = await maskOf(pic2, f, p); if (!m) continue;
        mx.drawImage(m, 0, 0);
        // (a fringe weeks on has grown down past where it was cut: what it may change goes down with it)
        if (wk && p === 'bangs') { const drop = foreheadOf(f) * wk * GROW; for (const s of [.34, .67, 1]) mx.drawImage(m, 0, drop * s); }
      }
    }
    // what was drawn: where it may change (a loop drawn round something takes in what is inside it), and a copy of the
    // picture with the marks on it, for the studio to read them from
    const drawn = marks.slice(), borrowed = ref, refs = [];
    if (drawn.length) {
      mask ||= P.make(pic2.width, pic2.height);
      const mx = ctx(mask), W = pic2.width, H = pic2.height;
      mx.save(); mx.strokeStyle = mx.fillStyle = '#fff'; mx.lineCap = mx.lineJoin = 'round'; mx.filter = 'blur(' + Math.round(W / 120) + 'px)';
      for (const m of drawn) {
        const path = new Path2D(); m.pts.forEach((p, i) => (i ? path.lineTo(p.x * W, p.y * H) : path.moveTo(p.x * W, p.y * H)));
        mx.lineWidth = W * .07; mx.stroke(path);
        if (loopOf(m)) mx.fill(path);
      }
      mx.restore();
      refs.push({ id: (await markedCopy(s, pic2, drawn)).id, role: 'marks' });
    }
    if (borrowed) refs.push({ id: borrowed.print.id, role: 'look' });
    const extra = [];
    if (borrowed) extra.push(masked.length ? 'Take what they ask for from the reference picture: its look, never its face' : 'Give them the look of the reference picture (its hair, colour, make-up and clothes) as far as the words ask, never its face');
    if (drawn.length) extra.push('Follow the marks drawn on the marked copy, and never draw the marks themselves');
    if (wk) extra.push(grownWords(picks, wk));
    // the studio takes a long note, but not an endless one: cut at a word, never mid-way through one
    const words = clip(wordsFor(picks, own, extra), 1200);
    const said = (titleOf(picks) || own || (drawn.length ? 'As drawn' : borrowed ? 'Like the reference' : '')) + (wk ? ' · ' + weeksSaid(wk) + ' on' : '');
    const intent = mask ? { op: 'region', subject: s.id, refs, look: null, n: 4, pace: null, pins: [{ print: s.id, n: 1, note: words, mask }] } : { op: 'edit', subject: s.id, refs, look: null, n: 4, pace: null, pins: [] };
    const now = picks.slice(), first = takes.length;
    for (let k = 0; k < 4; k++) takes.push({ url: '', label: '', kind: '', pending: true, picks: now, weeks: wk });
    paintTakes();
    await follow(onItem => runTurn({ text: mask ? 'Changes to @' + s.handle : '@' + s.handle + ' ' + words, said, intent, pace: settings.get('pace', 'fine'), n: 4, onItem }), first, 4, (k, p) => { Object.assign(takes[first + k], { url: urlOf(p), label: labelOf(p), kind: p.provenance?.kind || '', print: p, pending: false }); }, mask);
  }
  /**
   * Follows a turn's item as its pictures arrive: each lands in its place (the first is shown as it lands), the
   * places wait with the studio's estimate burning round them, and the ones that never come are taken away.
   * @param {(onItem: (it: any) => void) => Promise<any>} start @param {number} first @param {number} n @param {(k: number, p: any) => void} land
   * @param {HTMLCanvasElement | null} [mask] what the studio may change (the light passes over it; over everything when null)
   * @returns {Promise<any>} the turn's item, when it is over
   */
  async function follow(start, first, n, land, mask = /** @type {HTMLCanvasElement | null} */ (null)) {
    let item = /** @type {any} */ (null), shownOne = false;
    working(mask, first);
    const offEv = on('turn:event', (/** @type {any} */ m) => { if (item && m?.id === item.id) heard(m.ev, first); });
    const tick = setInterval(() => {
      if (!item) return;
      const p = progressAt(Date.now() - item.startedAt, item.eta);
      if (first === lead) etaEl.textContent = timeLeft(item.eta - (Date.now() - item.startedAt), Date.now() - item.startedAt);
      for (let k = 0; k < n; k++) takesRow.querySelector('.mr-take.is-pending[data-i="' + (first + k) + '"]')?.setAttribute('style', '--i:' + (first + k + 1) + ';--n:' + (takes.length + 1) + ';--p:' + p.toFixed(3));
    }, 200);
    const landed = new Set();
    const check = (/** @type {any} */ it) => {
      if (!item || it.id !== item.id) return;
      (it.prints || []).forEach((/** @type {string} */ id, /** @type {number} */ k) => {
        const p = id && printById(id); if (!p || landed.has(k) || k >= n) return;
        landed.add(k); land(k, p); paintTakes();
        // the first back is swept into the frame, and the frame's wait (its light, its words) is over with it
        if (!shownOne) { shownOne = true; show(first + k, false, true); el.classList.remove('has-preview'); if (first === lead) el.classList.remove('is-working'); }
      });
    };
    const off = on('item:patch', check);
    try { const it = await start(it => { item = it; }); item ||= it; check(it); if (it.state === 'failed') toast(it.error || 'That did not work', 3200); return it; }
    finally {
      off(); offEv(); clearInterval(tick);
      for (let k = n - 1; k >= 0; k--) if (takes[first + k]?.pending) takes.splice(first + k, 1);
      paintTakes(); if (shown >= takes.length) show(-1);
      rested(first);
    }
  }
  /**
   * While the studio works: a light passes over what it is changing (all of the picture when no part is), its own words
   * come up in the frame, with how long is left, and its previews develop in place.
   * @param {HTMLCanvasElement | null} mask
   */
  function working(mask, first = -1) {
    making++; lead = first; el.classList.add('is-making');
    const url = mask ? 'url(' + mask.toDataURL('image/png') + ')' : 'none';
    // the light glows a little beyond the part, so a thin one (a brow, a lash line) still reads as lit
    let lit = url;
    if (mask) { const g = P.make(mask.width, mask.height), gx = ctx(g); gx.filter = 'blur(' + Math.max(4, Math.round(mask.width / 45)) + 'px)'; gx.drawImage(mask, 0, 0); gx.drawImage(mask, 0, 0); gx.drawImage(g, 0, 0); lit = 'url(' + g.toDataURL('image/png') + ')'; }
    workEl.style.setProperty('mask-image', lit); workEl.style.setProperty('-webkit-mask-image', lit); workEl.classList.toggle('is-whole', !mask);
    // the preview develops only where the change is: the rest of the face stays as it is meanwhile
    preview.style.setProperty('mask-image', url); preview.style.setProperty('-webkit-mask-image', url);
    sayNow.textContent = 'Asked'; etaEl.textContent = '';
    el.classList.add('is-working');
  }
  /** The work over: the light and the words go, and a preview never followed by its picture is not left saying so. */
  function rested(first = -1) {
    making = Math.max(0, making - 1);
    // another is still being made: the frame goes on showing the latest one's wait
    if (making) { if (first === lead) { el.classList.remove('has-preview'); preview.removeAttribute('src'); } return; }
    el.classList.remove('is-making');
    el.classList.remove('is-working', 'has-preview'); preview.removeAttribute('src');
    for (const e of [workEl, preview]) { e.style.removeProperty('mask-image'); e.style.removeProperty('-webkit-mask-image'); }
    if (stampEl.dataset.kind === 'preview') show(Math.min(shown, takes.length - 1), true);
  }
  /** One of the studio's events, while it works on this. @param {any} ev @param {number} first */
  function heard(ev, first) {
    const words = ev?.type === 'stage' ? STAGE_SAYS[ev.stage] : ev?.type === 'note' ? ev.text : ev?.type === 'plan' ? ev.plan?.summary : '';
    if (words && first === lead) sayIt(words);
    if (ev?.type !== 'partial' || !(ev.blob || ev.canvas)) return;
    // a preview: in its place among the takes, and the first in the frame, where it develops (and says it is one)
    const url = ev.blob ? URL.createObjectURL(ev.blob) : ev.canvas.toDataURL('image/jpeg', .8), t = takes[first + ev.index];
    if (t?.pending) { t.preview = url; paintTakes(); }
    // (only while its picture is still to come: a preview arriving after it is not let over it; every angle has no
    // place among the takes, and its previews always show)
    if (ev.index === 0 && first === lead && (!t || t.pending)) { preview.src = url; el.classList.add('has-preview'); stampEl.textContent = 'Preview'; stampEl.dataset.kind = 'preview'; }
  }
  /** The studio's words, one line at a time, each coming in as the last goes. @param {string} text */
  function sayIt(text) {
    const t = String(text).replace(/\*\*/g, '').trim(); if (!t || sayNow.textContent === t) return;
    sayNow.textContent = t;
    if (!reduced) sayNow.animate([{ opacity: 0, translate: '0 .6em', filter: 'blur(2px)' }, { opacity: 1, translate: '0 0', filter: 'blur(0)' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  /** Here, with no studio: the change sketched over the face, stamped as a sketch, kept on the desk. */
  async function sketchIt() {
    if (!base || !face) { toast('Sketching needs a face to draw on'); return; }
    // (looking ahead, the look as the weeks will have it)
    const wk = timing ? weeks : 0, look = wk ? picks.map(q => aged(q, wk)) : picks;
    const c = P.copy(base), x = ctx(c), w = await washOf(base, face, look, wk), b = base, f = face;
    if (w) x.drawImage(w, 0, 0);
    const painted = look.filter(q => PAINTED.has(q.part));
    const pc = painted.length ? paintLook(b, f, painted.map(q => ({ part: q.part, style: q.style.id, shape: q.shape })), [0, 0, f.w, f.h], c.width / f.w, { ...(await tonesOf(b)), dye: dyeOf(look), roots: w?.roots || null }) : null;
    if (pc) x.drawImage(pc, 0, 0, c.width, c.height);
    x.save(); x.strokeStyle = INK; x.lineCap = 'round'; x.lineJoin = 'round'; x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = Math.max(2, c.width / 400);
    for (const q of look) if (!pc?.painted.has(q.part)) for (const s of markup(face, q.part, q.style.id, q.shape)) { x.lineWidth = s.w; x.stroke(new Path2D(s.d)); }
    x.restore();
    drawMarks(x, c.width, c.height, marks);
    if (ref) { const r = await canvasOf(ref.url).catch(() => null); if (r) { const w = c.width * .26, hh = w * r.height / r.width; x.save(); x.translate(w * .66, c.height - hh - w * .42); x.rotate(-.05); x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = c.width / 60; x.fillStyle = '#fbf8f2'; x.fillRect(-w * .52, 0, w * 1.04, hh + w * .2); x.shadowBlur = 0; x.drawImage(r, -w / 2, w * .02, w, hh); x.restore(); } }
    P.stamp(c);
    const blob = await P.toBlob(c, 'image/jpeg', .9), parent = print || null;
    const p = await addPrint({ blob, w: c.width, h: c.height, origin: 'made', provenance: { kind: 'sketch', label: 'Sketch', detail: 'Drawn on this device · ' + (titleOf(picks) || 'a change') + (wk ? ' · ' + weeksSaid(wk) + ' on' : '') }, parents: parent ? [parent.id] : [], prompt: wordsFor(picks, input.value, wk ? [grownWords(picks, wk)] : []) });
    await addItem({ type: 'prints', prints: [p.id] });
    takes.push({ url: urlOf(p), label: 'Sketch', kind: 'sketch', print: p, picks: picks.slice(), weeks: wk }); paintTakes(); show(takes.length - 1);
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
    // every side of you, caught by the live mirror: yours already, nothing to ask for
    if (shown < 0 && o.turns?.length === 3) { startTurning(o.turns, 1); return; }
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
  /**
   * The frame turning through a ring of angles, from the one at `at` (the picture on show): it leans one way to show it
   * can, and comes back; or, on a tour, it goes all the way round and back, and lets go; or, shown, it goes round and
   * back again, slowly, pausing at each, for as long as it is shown.
   * @param {(string | import('./live.js').Side)[]} ring
   */
  function startTurning(ring, at = 2, /** @type {boolean | 'loop'} */ tour = false) {
    const a = h('img.mr-angle', { alt: '', draggable: false }), b = h('img.mr-angle', { alt: '', draggable: false });
    frame.append(a, b); turning = { ring: ring.map(r => (typeof r === 'string' ? { src: r } : { ...r })), p: at, a, b, at, imgs: [], m: null };
    meet(turning);
    el.classList.add('is-turning'); dial.hidden = false; turnBtn.setAttribute('aria-pressed', 'true');
    turnTo(at);
    if (reduced) return;
    const s = turning, n = ring.length - 1;
    /**
     * Through the stops on the clock, not frame by frame: each leg eased in and out over its time, then held a moment.
     * On a device that draws slowly, frames are dropped and the turn still takes as long as it should.
     * @param {[number, number, number][]} legs [to, ms, held ms] @param {() => void} then
     */
    const glide = (legs, then) => {
      let k = 0, from = s.p, t0 = performance.now(), raf = 0;
      const step = (/** @type {number} */ now) => {
        if (turning !== s) return;
        const [to, ms, held] = legs[k], u = Math.min(1, (now - t0) / ms), e = u * u * u * (u * (u * 6 - 15) + 10);
        turnTo(from + (to - from) * e);
        if (now - t0 >= ms + held) { k++; if (k >= legs.length) { then(); return; } from = to; t0 = now; }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      anim = { stop: () => cancelAnimationFrame(raf) };
    };
    const round = () => glide([[0, 2300, 900], [at, 2300, 900], [n, 2300, 900], [at, 2300, 900]], round);
    if (tour === 'loop') round();
    else if (tour) glide([[0, 1300, 260], [n, 2100, 260], [at, 1300, 0]], () => stopTurning());
    else anim = spring({ from: at, to: at - 1, stiffness: 46, damping: 11, onUpdate: v => turnTo(v), onRest: () => { anim = spring({ from: s.p, to: at, stiffness: 46, damping: 11, onUpdate: v => turnTo(v) }); } });
  }
  function stopTurning() {
    anim?.stop(); if (!turning) return;
    turning.a.remove(); turning.b.remove();
    for (const c of turning.m?.cs || []) { c.remove(); /** @type {WebGLRenderingContext | null} */ (c.getContext('webgl'))?.getExtension('WEBGL_lose_context')?.loseContext(); }
    turning = null; frame.style.transform = '';
    el.classList.remove('is-turning'); dial.hidden = true; turnBtn.setAttribute('aria-pressed', 'false');
  }
  /**
   * Between two angles that both have a face, one head turning: each is turned on the device towards the other, by
   * the share of the way it has come, so half-way they stand the same way and one gives way to the other with nothing
   * doubled. Their faces are read here where they did not come with them (a profile seldom is: there, a dissolve).
   * @param {Turning} s
   */
  async function meet(s) {
    const imgs = await Promise.all(s.ring.map(r => new Promise(done => { const i = new Image(); i.onload = () => done(i); i.onerror = () => done(null); i.src = r.src; })));
    if (turning !== s) return;
    s.imgs = /** @type {(HTMLImageElement | null)[]} */ (imgs);
    for (const [k, r] of s.ring.entries()) {
      const img = s.imgs[k];
      if (r.face !== undefined || !img) continue;
      const c = P.make(img.naturalWidth, img.naturalHeight); ctx(c).drawImage(img, 0, 0);
      r.face = await faceOf(c).catch(() => null); if (turning !== s) return;
    }
    const first = s.ring.find(r => r.face)?.face; if (!first || reduced) return;
    const cs = [0, 1].map(() => /** @type {HTMLCanvasElement} */ (h('canvas.mr-angle.mr-meet', { 'aria-hidden': 'true' })));
    const ts = cs.map(c => { try { return turner(c, first); } catch { return null; } });
    if (ts.some(t => !t)) return;
    frame.append(...cs);
    s.m = { cs, ts: /** @type {any[]} */ (ts), on: [-1, -1] };
    turnTo(s.p);
    // then each one's hair, so the hair comes round with the head and the room behind it stays where it is
    for (const [k, r] of s.ring.entries()) {
      const img = s.imgs[k]; if (!img || !r.face) continue;
      const c = P.make(img.naturalWidth, img.naturalHeight); ctx(c).drawImage(img, 0, 0);
      r.hair = await hairOf(c).catch(() => null); if (turning !== s) return;
      const j = k % 2; if (r.hair && s.m.on[j] === k) s.m.ts[j].hair(r.hair, r.face);
    }
  }
  /** The frame at a point between the angles: one head turning where it can, else the two nearest cross-fade and the frame leans. @param {number} v */
  function turnTo(v) {
    if (!turning) return;
    // past either end (a spring overshoots), the end picture stays
    turning.p = v; const s = turning, n = s.ring.length - 1, w = Math.max(0, Math.min(n, v)), i = Math.max(0, Math.min(n - 1, Math.floor(w))), u = Math.min(1, w - i), A = s.ring[i], B = s.ring[Math.min(n, i + 1)];
    if (s.a.getAttribute('src') !== A.src) s.a.src = A.src; if (s.b.getAttribute('src') !== B.src) s.b.src = B.src;
    const ia = s.imgs[i], ib = s.imgs[i + 1], m = s.m;
    if (m && A.face && B.face && ia && ib) {
      // ring[k] is always on canvas k % 2, so going on to the next pair only one of them takes a new picture
      for (const [k, r, img] of /** @type {[number, any, HTMLImageElement][]} */ ([[i, A, ia], [i + 1, B, ib]])) {
        const j = k % 2; if (m.on[j] === k) continue;
        // drawn at the size it is seen (it covers the frame as a picture would), not the picture's own: far less to draw
        const c = m.cs[j], z = Math.min(1, Math.max(frame.clientWidth / r.face.w, frame.clientHeight / r.face.h) * dpr()), cw = Math.round(r.face.w * z), ch = Math.round(r.face.h * z);
        if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
        m.ts[j].load(r.face); m.ts[j].picture(img); if (r.hair) m.ts[j].hair(r.hair, r.face); m.on[j] = k;
      }
      const gap = (yawOf(B.face) - yawOf(A.face)) * TURN_PER_YAW, ca = m.cs[i % 2], cb = m.cs[(i + 1) % 2];
      // a turner's yaw takes the nose the other way across the picture from its own yaw: hence the minus
      m.ts[i % 2].turn(-gap * u); m.ts[(i + 1) % 2].turn(gap * (1 - u));
      const e = Math.max(0, Math.min(1, (u - .2) / .6));
      ca.style.zIndex = '1'; cb.style.zIndex = '2'; ca.style.opacity = '1'; cb.style.opacity = (e * e * (3 - 2 * e)).toFixed(3);
      s.a.style.opacity = s.b.style.opacity = '0'; frame.style.transform = '';
    } else {
      if (m) for (const c of m.cs) c.style.opacity = '0';
      const d = Math.max(0, Math.min(1, (u - .3) / .4));
      s.a.style.opacity = '1'; s.b.style.opacity = (d * d * (3 - 2 * d)).toFixed(3);
      const lean = Math.sin(u * Math.PI) * (v < s.at ? 7 : -7);
      frame.style.transform = 'perspective(160cqw) rotateY(' + lean.toFixed(2) + 'deg)';
    }
    dial.style.setProperty('--a', ((v - turning.at) * 30).toFixed(1) + 'deg');
  }

  /**
   * Show it: the look, to show someone (the one who will cut it). The mirror's tools fall away and the picture comes
   * forward, alive: turning slowly through every side of you where they were caught, else swaying a little on the
   * device (and saying so); under it, the look in its words. The card keeps all of it as one picture.
   * @param {boolean} on
   */
  async function showing(on) {
    if (on === showingNow || (on && (!face || !picks.length))) return;
    stopGreeting(); if (on && timing) timeMode(false);
    showingNow = on;
    if (on && part) unchoose();
    if (on) showWords.replaceChildren(...picks.map((q, i) => h('li.mr-show__word', { style: { '--d': (140 + i * 90) + 'ms' } },
      h('span.mr-show__part', null, partById(q.part)?.name || q.part), h('em.mr-show__style', null, q.style.name), q.said ? h('span.mr-show__said', null, q.said) : null, upkeepSaid(q) ? h('span.mr-show__keep', null, upkeepSaid(q)) : null)));
    const was = frame.getBoundingClientRect();
    el.classList.toggle('is-showing', on); showEl.hidden = !on;
    fit();
    const now = frame.getBoundingClientRect();
    if (!reduced && was.width && now.width) frame.animate([{ translate: (was.left + was.width / 2 - now.left - now.width / 2).toFixed(1) + 'px ' + (was.top + was.height / 2 - now.top - now.height / 2).toFixed(1) + 'px', scale: (was.width / now.width).toFixed(4) }, { translate: '0 0', scale: '1' }], { duration: 640, easing: 'cubic-bezier(.2,.8,.2,1)' });
    cancelAnimationFrame(sway); stopTurning();
    if (!on) { lean(0, 0); return; }
    if (reduced) return;
    if (o.turns?.length === 3 && shown < 0) { startTurning(o.turns, 1, 'loop'); return; }
    if (turn && (await mount()) && showingNow) {
      const t0 = performance.now();
      const step = (/** @type {number} */ t) => { if (!showingNow || !el.isConnected) return; const s = (t - t0) / 1000; lean(Math.sin(s * .9) * .13 * Math.min(1, s / 1.4), Math.sin(s * .55) * .02); sway = requestAnimationFrame(step); };
      sway = requestAnimationFrame(step);
    }
  }
  /** The card: the look on you (and every side of you, where caught), in its words, as one picture to keep or to send. */
  async function saveCard() {
    const s = await surface(); if (!s) return;
    const both = o.turns?.length === 3 && shown < 0 ? [o.turns[0], o.turns[2]] : [];
    const imgs = await Promise.all(both.map(t => new Promise(done => { const i = new Image(); i.onload = () => done(i); i.onerror = () => done(null); i.src = t.src; })));
    await Promise.all(['italic 400 60px Fraunces', '400 30px Fraunces', '500 20px "IBM Plex Mono"'].map(f => document.fonts.load(f).catch(() => null)));
    const stamp = (stampWas?.[0] || stampEl.textContent || '') + (el.classList.contains('has-sketch') ? ' + sketch' : '');
    const sides = both.map((t, i) => ({ pic: /** @type {HTMLImageElement | null} */ (imgs[i]), face: t.face || null })).filter(x => x.pic);
    const c = card({ front: { pic: s.canvas, face: s.face }, sides: /** @type {any} */ (sides), picks, stamp, date: new Date() });
    const blob = await P.toBlob(c, 'image/png'), name = 'likeness-' + new Date().toISOString().slice(0, 10) + '.png';
    const file = new File([blob], name, { type: 'image/png' });
    const handheld = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (handheld && navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return; } }
    const a = /** @type {HTMLAnchorElement} */ (h('a', { href: URL.createObjectURL(blob), download: name })); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    toast('The card is saved');
  }

  /** The look on your own face: the live mirror where there is a camera, else a photo. */
  async function onMe() {
    const got = /** @type {{ print: any, picks: Pick[], from?: Element, face?: any, turns?: import('./live.js').Side[] } | null} */ ((await canLive()) ? await openLive({ picks, fallback: bringPhoto, from: frame }) : await bringPhoto().then(p => (p ? { print: p, picks } : null)));
    if (got) openMirror({ print: got.print, picks: got.picks, words: input.value, from: got.from || null, face: got.face, turns: got.turns });
  }

  function close(now = false) {
    if (current !== self) return; current = null;
    stops.forEach(f => f()); stopGreeting(); stopTurning(); cancelAnimationFrame(sway); clearTimeout(timeWalk); cancelAnimationFrame(sketchRaf);
    if (now || reduced) { el.remove(); return; }
    el.classList.remove('is-in'); el.classList.add('is-out'); setTimeout(() => el.remove(), 420);
  }
  // all set: the takes: the face as it is first, then each one that comes back (or, for an example, each look they were given)
  if (person) for (const look of person.looks) takes.push({ url: look.image, ...made, look, picks: pickOf(look) });
  // a turn from before (from the studio's list): its takes; one still being made is waited for, below
  const after = o.after || null;
  if (after && after.state !== 'running') for (const id of after.prints || []) { const p = printById(id); if (p) takes.push({ url: urlOf(p), label: labelOf(p), kind: p.provenance?.kind || '', print: p, picks: [] }); }
  show(-1, true); paintTakes(); paintPicks();
  new ResizeObserver(() => fit()).observe(stageEl);
  new ResizeObserver(() => fit(true)).observe(takesRow);
  requestAnimationFrame(() => { el.classList.add('is-in'); fit(); if (from) flip(frame, from, { duration: 620 }); });
  const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') { if (timing) timeMode(false); else if (showingNow) showing(false); else close(); } };
  document.addEventListener('keydown', onKey); stops.push(() => document.removeEventListener('keydown', onKey));

  (async () => {
    // the parts stay in the dock as well as on the face: any of them, any time, as many as you like
    frame.classList.add('is-reading');
    try { base = await canvasOf(person ? person.portrait : print.blob); } catch { base = null; }
    // a drawn sitter's hair comes with it, read when it was made ready
    if (base && o.hair) { try { const img = new Image(); img.src = o.hair; await img.decode(); const m = P.make(base.width, base.height); ctx(m).drawImage(img, 0, 0, m.width, m.height); knowHair(base, m); } catch { /* the segmenter, then */ } }
    fit();
    // a face read as the picture was taken (the live mirror's) is this picture's already: no second reading, no wait
    const known = o.face && base && Math.abs(o.face.w / o.face.h - base.width / base.height) < .01 ? reframed(o.face, base.width, base.height) : null;
    face = base ? known || await faceOf(base) : null;
    frame.classList.remove('is-reading');
    if (!el.isConnected) return;
    if (!face) { el.classList.add('no-face'); toast(base ? 'No face found: a change goes over the whole picture' : 'That picture could not be read', 2800); }
    else {
      try { turn = turner(turnView, face); } catch { turn = null; }
      if (turn && base) { const f = face; hairOf(base).then(m => { if (m) turn?.hair(m, f); }); }
      if (!known) await reading();
    }
    placeNotes(); paintPicks(); menu();
    turnBtn.hidden = !(live || person?.looks.some(l => l.angles?.length) || o.turns?.length === 3);
    const look = o.look && takes.findIndex(t => t.look === o.look);
    if (typeof look === 'number' && look >= 0) show(look);
    else if (picks[0] && !face) choose(picks[0].part);
    // then, unless they came asking for something already, the face looks this way and that as its notes come in
    // every side of you, caught by the live mirror: shown first, the frame turning through them; else the face says hello
    if (after?.state === 'running') {
      const first = takes.length, n = after.n || 4;
      for (let k = 0; k < n; k++) takes.push({ url: '', label: '', kind: '', pending: true, picks: [] });
      paintTakes();
      follow(onItem => new Promise(done => {
        onItem(after); queueMicrotask(() => emit('item:patch', after));
        const off = on('item:patch', (/** @type {any} */ x) => { if (x.id === after.id && x.state !== 'running') { off(); done(x); } });
      }), first, n, (k, p) => { Object.assign(takes[first + k], { url: urlOf(p), label: labelOf(p), kind: p.provenance?.kind || '', print: p, pending: false }); });
      return;
    }
    if (after && takes.length) { show(0); return; }
    if (o.go) tryOn(); else if (o.turns?.length === 3 && shown < 0 && !reduced) setTimeout(() => { if (el.isConnected && !turning) startTurning(/** @type {import('./live.js').Side[]} */ (o.turns), 1, true); }, 500); else if (face && shown < 0) hello();
  })();

  const self = { close };
  current = self;
  return self;
}

/**
 * The card a look is kept on, 1080 by 1350: the look on you, large, with every side of you beside it where they were
 * caught. Each part has its words below the pictures, with the date in the header.
 * @param {{ front: { pic: HTMLCanvasElement, face: Face | null }, sides: { pic: HTMLImageElement, face: Face | null }[], picks: Pick[], stamp: string, date: Date }} o
 */
function card(o) {
  const W = 1080, H = 1350, c = P.make(W, H), x = /** @type {CanvasRenderingContext2D & { letterSpacing: string }} */ (c.getContext('2d'));
  x.fillStyle = '#0e0b09'; x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(W / 2, -80, 0, W / 2, -80, W); g.addColorStop(0, 'rgba(242,197,138,.17)'); g.addColorStop(1, 'rgba(242,197,138,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const mono = (/** @type {number} */ px, /** @type {string} */ colour) => { x.font = '500 ' + px + 'px "IBM Plex Mono", monospace'; x.fillStyle = colour; x.letterSpacing = (px * .16).toFixed(1) + 'px'; };
  const serif = (/** @type {string} */ style, /** @type {number} */ px, /** @type {string} */ colour) => { x.font = style + ' 400 ' + px + 'px Fraunces, Georgia, serif'; x.fillStyle = colour; x.letterSpacing = '0px'; };
  serif('italic', 46, '#f6efe6'); x.fillText('Likeness', 72, 98);
  mono(19, 'rgba(246,239,230,.58)'); x.textAlign = 'right'; x.fillText(o.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase(), W - 72, 94); x.textAlign = 'left';
  // the pictures, each cut round the face: the head and the shoulders
  const top = 136, ph = 870;
  if (o.sides.length === 2) {
    panel(x, o.front.pic, o.front.face, 72, top, 600, ph);
    o.sides.forEach((s, i) => panel(x, s.pic, s.face, 696, top + i * (ph + 24) / 2, 312, (ph - 24) / 2));
  } else panel(x, o.front.pic, o.front.face, (W - 640) / 2, top, 640, ph);
  // the words, a column for each part
  const ws = o.picks.slice(0, 6), cols = Math.min(3, ws.length), rows = Math.ceil(ws.length / cols), k = rows > 1 ? .78 : 1, gap = 40, cw = (W - 144 - (cols - 1) * gap) / cols;
  ws.forEach((q, i) => {
    const cx = 72 + (i % cols) * (cw + gap), cy = top + ph + 76 + Math.floor(i / cols) * 128;
    mono(Math.round(19 * k), '#f2c58a'); x.fillText((partById(q.part)?.name || q.part).toUpperCase(), cx, cy);
    let size = Math.round(54 * k); serif('italic', size, '#f6efe6'); while (size > 26 && x.measureText(q.style.name).width > cw) { size -= 2; serif('italic', size, '#f6efe6'); }
    x.fillText(q.style.name, cx, cy + Math.round(58 * k));
    let below = cy + Math.round(98 * k);
    if (q.said) {
      serif('normal', Math.round(27 * k), 'rgba(246,239,230,.66)');
      const lines = wrap(x, q.said, cw).slice(0, rows > 1 ? 1 : 2);
      lines.forEach((l, j) => x.fillText(l, cx, cy + Math.round((98 + j * 34) * k)));
      below = cy + Math.round((98 + lines.length * 34) * k);
    }
    // and, where there is room, what it will want: "Trim every 3 weeks"
    const keep = rows === 1 ? upkeepSaid(q).toUpperCase() : '';
    if (keep) { let px = 16; mono(px, 'rgba(242,197,138,.72)'); while (px > 11 && x.measureText(keep).width > cw) mono(--px, 'rgba(242,197,138,.72)'); x.fillText(keep, cx, below + (q.said ? 8 : -4)); }
  });
  const stamp = o.stamp.startsWith('GPT Image') ? o.stamp.slice('GPT Image'.length).replace(/^\s*\+\s*/, '') : o.stamp;
  const footer = [stamp.toUpperCase(), o.sides.length ? 'SIDES: LIVE SKETCH ON THIS DEVICE' : ''].filter(Boolean).join('  ·  ');
  if (footer) { mono(16, 'rgba(246,239,230,.42)'); x.fillText(footer, 72, H - 56); }
  return c;
}
/**
 * A picture laid in a rounded panel, cut round its face (the head and the shoulders, the eyes a little above the middle),
 * or round its middle where no face is known.
 * @param {CanvasRenderingContext2D} x @param {HTMLCanvasElement | HTMLImageElement} pic @param {Face | null} f @param {number} px @param {number} py @param {number} pw @param {number} ph
 */
function panel(x, pic, f, px, py, pw, ph) {
  const sw = 'naturalWidth' in pic ? pic.naturalWidth : pic.width, sh = 'naturalHeight' in pic ? pic.naturalHeight : pic.height, ar = pw / ph;
  let ch = sh, cw = ch * ar; if (cw > sw) { cw = sw; ch = cw / ar; }
  const kx = f ? sw / f.w : 1, ky = f ? sh / f.h : 1;
  if (f) { const want = f.box[3] * ky * 2.4; if (want < ch) { ch = want; cw = ch * ar; } if (cw > sw) { cw = sw; ch = cw / ar; } }
  const mx = f ? (f.box[0] + f.box[2] / 2) * kx : sw / 2, my = f ? (f.box[1] + f.box[3] * .5) * ky : sh / 2;
  const sx = Math.max(0, Math.min(sw - cw, mx - cw / 2)), sy = Math.max(0, Math.min(sh - ch, my - ch * .46));
  x.save(); x.beginPath(); x.roundRect(px, py, pw, ph, 26); x.clip(); x.drawImage(pic, sx, sy, cw, ch, px, py, pw, ph); x.restore();
  x.save(); x.strokeStyle = 'rgba(246,239,230,.14)'; x.lineWidth = 2; x.beginPath(); x.roundRect(px + 1, py + 1, pw - 2, ph - 2, 25); x.stroke(); x.restore();
}
/** Words in lines no wider than w, in the context's font. @param {CanvasRenderingContext2D} x @param {string} text @param {number} w */
function wrap(x, text, w) {
  const out = []; let line = '';
  for (const word of text.split(/\s+/)) { const next = line ? line + ' ' + word : word; if (line && x.measureText(next).width > w) { out.push(line); line = word; } else line = next; }
  if (line) out.push(line);
  return out;
}

/** The picks an example's look stands for. @param {Look} look @returns {Pick[]} */
function pickOf(look) {
  const s = styleOf(look.part, look.style);
  return s ? [{ part: look.part, style: s }] : [];
}
