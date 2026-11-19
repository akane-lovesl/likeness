/**
 * Films the device makes: the making of a picture, and a trip. Each plays on a canvas while it records, so a film is
 * watched as it is made; it is saved on the device and nothing is sent anywhere. A picture with life in it is alive in it.
 */
import { lifeFor } from './life.js';

/** @typedef {{ label: string, canvas: CanvasImageSource, reveal?: string | null }} Frame */
/** @typedef {{ asks: string[], day: string, start: CanvasImageSource | null, frames: Frame[], final: CanvasImageSource, end: string, life?: import('./life.js').Life | null }} Story */
/** @typedef {{ back: CanvasImageSource, person: CanvasImageSource | null, life: import('./life.js').Life | null, caption: string }} Stop */
/** @typedef {{ asks: string[], day: string, stops: Stop[], home: CanvasImageSource, me: CanvasImageSource | null, end: string }} Trip */
/** @typedef {{ ground: string, ink: string, accent: string, display: string, hand: string, mono: string, signal?: AbortSignal }} Look */

const ease = (/** @type {number} */ t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const smooth = (/** @type {number} */ t) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };
/** The best kind of film this browser can record, or '' when it cannot: an MP4 first, since it plays on phones and knows its own length. */
function kind() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) if (MediaRecorder.isTypeSupported(t)) return t;
  return '';
}
/** Whether a film can be made here at all. */
export const canFilm = () => !!kind() && typeof HTMLCanvasElement.prototype.captureStream === 'function';

/**
 * What every film draws with: the picture laid over the whole frame, words broken into lines, a caption low on the
 * picture in the room's hand, and the title card.
 * @param {HTMLCanvasElement} view @param {Look} look
 */
function kit(view, look) {
  const W = view.width, H = view.height, x = /** @type {CanvasRenderingContext2D} */ (view.getContext('2d'));
  const cover = (/** @type {CanvasImageSource} */ img, /** @type {CanvasRenderingContext2D} */ c = x) => c.drawImage(img, 0, 0, W, H);
  /** Words over a width, broken into lines. */
  function lines(/** @type {string} */ text, /** @type {number} */ max) {
    const out = /** @type {string[]} */ ([]); let line = '';
    for (const w of text.split(/\s+/)) { const next = line ? line + ' ' + w : w; if (x.measureText(next).width > max && line) { out.push(line); line = w; } else line = next; }
    if (line) out.push(line);
    return out;
  }
  /** The note for a shot, low on the picture, in the room's hand: in as the shot comes, out before the next. */
  function caption(/** @type {string} */ text, /** @type {number} */ p, /** @type {boolean} */ last) {
    const a = Math.min(ease(p / .22), last ? 1 : ease((1 - p) / .14));
    if (a <= 0 || !text) return;
    const g = x.createLinearGradient(0, H * .66, 0, H); g.addColorStop(0, 'rgb(0 0 0 / 0)'); g.addColorStop(1, 'rgb(0 0 0 / ' + (.55 * a).toFixed(3) + ')');
    x.fillStyle = g; x.fillRect(0, H * .66, W, H * .34);
    x.save(); x.globalAlpha = a; x.font = Math.round(W * .062) + 'px ' + look.hand; x.fillStyle = '#fff'; x.textBaseline = 'alphabetic';
    x.shadowColor = 'rgb(0 0 0 / .6)'; x.shadowBlur = W * .02;
    const ls = lines(text, W * .86).slice(0, 3), lh = W * .066, y0 = H * .94 - (ls.length - 1) * lh;
    ls.forEach((l, i) => x.fillText(l, W * .07, y0 + i * lh + (1 - ease(p / .22)) * W * .02));
    x.restore();
  }
  /** The opening: the room's ground and its mark, what was asked (the asks before it fainter), and the day it was made. */
  function title(/** @type {number} */ t, /** @type {number} */ dur, /** @type {string[]} */ asks, /** @type {string} */ day, /** @type {string} */ mark) {
    x.fillStyle = look.ground; x.fillRect(0, 0, W, H);
    x.save(); x.globalAlpha = ease(t / .5); x.font = '500 ' + Math.round(W * .03) + 'px ' + look.mono;
    x.fillStyle = look.accent; x.fillText('✳  LIKENESS  ·  ' + mark, W * .08, H * .1);
    x.fillStyle = look.ink; x.globalAlpha *= .5; x.fillText((day + '  ·  drawn on this device').toUpperCase(), W * .08, H * .93); x.restore();
    x.font = Math.round(W * .068) + 'px ' + look.display;
    const blocks = asks.map(a => lines('“' + a + '”', W * .84)), lh = W * .085, gap = W * .05;
    let y = (H - (blocks.reduce((a, b) => a + b.length * lh, 0) + gap * (blocks.length - 1))) / 2 + lh * .75;
    blocks.forEach((ls, i) => {
      const k = ease((t - .3 - i * .45) / .6);
      x.save(); x.globalAlpha = Math.max(0, k) * (i === blocks.length - 1 ? 1 : .45); x.fillStyle = look.ink;
      for (const l of ls) { if (k > 0) x.fillText(l, W * .08, y + (1 - k) * W * .03); y += lh; }
      x.restore(); y += gap;
    });
    const out = ease((t - (dur - .35)) / .35); if (out > 0) { x.fillStyle = look.ground; x.globalAlpha = out; x.fillRect(0, 0, W, H); x.globalAlpha = 1; }
  }
  const buffer = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return { c, x: /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')) }; };
  return { W, H, x, cover, lines, caption, title, buffer };
}

/**
 * Plays draw(t) on the canvas for total seconds, recording it. Resolves the film, or null if it was stopped.
 * @param {HTMLCanvasElement} view @param {number} total @param {(t: number) => void} draw @param {AbortSignal} [signal]
 * @returns {Promise<Blob | null>}
 */
async function record(view, total, draw, signal) {
  const type = kind(), stream = view.captureStream(30), chunks = /** @type {Blob[]} */ ([]);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 5_000_000 });
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise(r => { rec.onstop = r; });
  draw(0); rec.start(250);
  const t0 = performance.now();
  await new Promise(done => {
    const tick = (/** @type {number} */ now) => {
      if (signal?.aborted) return done(null);
      const t = (now - t0) / 1000; draw(Math.min(t, total));
      if (t < total + .15) requestAnimationFrame(tick); else done(null);
    };
    requestAnimationFrame(tick);
  });
  rec.stop(); await stopped; stream.getTracks().forEach(tr => tr.stop());
  return signal?.aborted ? null : new Blob(chunks, { type: type.split(';')[0] });
}

/**
 * The making of a picture, as a short film: what was asked, each step as the card showed it with its note, and then
 * the picture, labelled for what it is, and alive at the very end when there is life in it.
 * @param {Story} story @param {HTMLCanvasElement} view @param {Look} look @returns {Promise<Blob | null>}
 */
export async function film(story, view, look) {
  const { W, H, x, cover, caption, title, buffer } = kit(view, look), B = buffer();
  /** @type {{ kind: string, img?: CanvasImageSource, reveal?: string, label?: string, dur: number, last?: boolean }[]} */
  const shots = [{ kind: 'title', dur: 1.2 + story.asks.length * .45 }];
  if (story.start) shots.push({ kind: 'frame', img: story.start, reveal: 'fade', label: 'As it was', dur: 1.1 });
  for (const f of story.frames) shots.push({ kind: 'frame', img: f.canvas, reveal: f.reveal || 'sweep', label: f.label, dur: f.reveal === 'bloom' ? 1.7 : 1.2 });
  const living = story.life ? lifeFor(story.life, W, H) : null;
  shots.push({ kind: 'frame', img: story.final, reveal: 'fade', label: story.end, dur: living ? 4.4 : 2.6, last: true });
  const total = shots.reduce((a, s) => a + s.dur, 0);
  /** A shot coming in over the one before: dissolving, sweeping across, or blooming out from the middle. */
  function reveal(/** @type {any} */ s, /** @type {number} */ k) {
    if (k >= 1) return cover(s.img);
    if (s.reveal === 'fade') { x.globalAlpha = k; cover(s.img); x.globalAlpha = 1; return; }
    B.x.globalCompositeOperation = 'source-over'; B.x.clearRect(0, 0, W, H); cover(s.img, B.x);
    let g;
    if (s.reveal === 'bloom') {
      const r = Math.max(W, H) * 1.5 * k; g = B.x.createRadialGradient(W * .5, H * .42, 0, W * .5, H * .42, Math.max(1, r));
      g.addColorStop(0, '#000'); g.addColorStop(.7, '#000'); g.addColorStop(1, 'rgb(0 0 0 / 0)');
    } else {
      const edge = -W * .3 + k * W * 1.6; g = B.x.createLinearGradient(edge - W * .22, -H * .04, edge + W * .22, H * .04);
      g.addColorStop(0, '#000'); g.addColorStop(1, 'rgb(0 0 0 / 0)');
    }
    B.x.globalCompositeOperation = 'destination-in'; B.x.fillStyle = g; B.x.fillRect(0, 0, W, H);
    x.drawImage(B.c, 0, 0);
  }
  function draw(/** @type {number} */ t) {
    let at = 0, i = 0;
    while (i < shots.length - 1 && t >= at + shots[i].dur) { at += shots[i].dur; i++; }
    const s = shots[i], p = Math.min(1, (t - at) / s.dur), prev = shots[i - 1];
    if (s.kind === 'title') return title(t - at, s.dur, story.asks, story.day, 'THE MAKING OF');
    x.fillStyle = look.ground; x.fillRect(0, 0, W, H);
    if (prev?.img) cover(prev.img);
    reveal(s, ease(s.last ? Math.min(1, (t - at) / 1.3) : p / .5));
    if (s.last && living) living.draw(x, t - at, ease(((t - at) - 1.2) / 1.2));
    caption(s.label || '', p, !!s.last);
  }
  return record(view, total, draw, look.signal);
}

/**
 * A trip, as a film: what was asked; them at home; then each place wiped in behind them while they stand quite still
 * (the world changes, not them, though a helmet comes on where there is no air), alive a moment with its name written
 * under it; then home again, and the label.
 * @param {Trip} trip @param {HTMLCanvasElement} view @param {Look} look @returns {Promise<Blob | null>}
 */
export async function travel(trip, view, look) {
  const { W, H, x, cover, caption, title, buffer } = kit(view, look), B = buffer();
  const lives = trip.stops.map(s => (s.life ? lifeFor(s.life, W, H) : null));
  /** @type {{ kind: string, dur: number, at?: number, from?: number, to?: number, label?: string, last?: boolean }[]} */
  const parts = [{ kind: 'title', dur: 1.2 + trip.asks.length * .45 }, { kind: 'stay', at: -1, dur: 1.4, label: 'Setting off' }];
  trip.stops.forEach((s, i) => parts.push({ kind: 'wipe', from: i - 1, to: i, dur: .62 }, { kind: 'stay', at: i, dur: 1.9, label: s.caption }));
  parts.push({ kind: 'wipe', from: trip.stops.length - 1, to: -1, dur: .62 }, { kind: 'stay', at: -1, dur: 1.5, label: 'And home.' }, { kind: 'stay', at: -1, dur: 1.6, label: trip.end, last: true });
  const total = parts.reduce((a, s) => a + s.dur, 0);
  // where they are (-1 is home, the photo itself); and them, on nothing, as they are dressed there
  const backOf = (/** @type {number} */ i) => (i < 0 ? trip.home : trip.stops[i].back);
  const themAt = (/** @type {number} */ i) => (i < 0 ? trip.me : trip.stops[i].person);
  function place(/** @type {number} */ i, /** @type {number} */ tl, /** @type {number} */ alive) {
    cover(backOf(i));
    const them = themAt(i); if (them && i >= 0) cover(them);
    if (i >= 0 && alive > 0) lives[i]?.draw(x, tl, alive);
  }
  /** The next place coming in behind them on a soft edge, from the left one time and the right the next. */
  function wipe(/** @type {any} */ s, /** @type {number} */ p, /** @type {number} */ n) {
    const k = smooth(p), dir = n % 2 ? -1 : 1, edge = dir > 0 ? -W * .35 + k * W * 1.7 : W * 1.35 - k * W * 1.7;
    cover(backOf(s.from));
    B.x.globalCompositeOperation = 'source-over'; B.x.clearRect(0, 0, W, H);
    // the place coming in drifts the last little way as it arrives; home does not, so they never stand beside themselves
    const push = s.to >= 0 ? (1 - k) * W * .06 * dir : 0;
    B.x.drawImage(backOf(s.to), push, 0, W, H);
    const g = B.x.createLinearGradient(edge - W * .18 * dir, 0, edge + W * .18 * dir, 0); g.addColorStop(0, '#000'); g.addColorStop(1, 'rgb(0 0 0 / 0)');
    B.x.globalCompositeOperation = 'destination-in'; B.x.fillStyle = g; B.x.fillRect(0, 0, W, H);
    x.drawImage(B.c, 0, 0);
    // they stay where they are: as they were, giving way to how they are here
    // (the bare person underneath, so only what they wear comes and goes, never they themselves)
    const a = themAt(s.from), b = themAt(s.to);
    if (a === b) { if (b) cover(b); return; }
    if (trip.me) cover(trip.me);
    if (a) { x.globalAlpha = 1 - k; cover(a); }
    if (b) { x.globalAlpha = k; cover(b); }
    x.globalAlpha = 1;
  }
  function draw(/** @type {number} */ t) {
    let at = 0, i = 0;
    while (i < parts.length - 1 && t >= at + parts[i].dur) { at += parts[i].dur; i++; }
    const s = parts[i], tl = t - at, p = Math.min(1, tl / s.dur);
    if (s.kind === 'title') return title(tl, s.dur, trip.asks, trip.day, 'A TRIP');
    x.fillStyle = look.ground; x.fillRect(0, 0, W, H);
    if (s.kind === 'wipe') return wipe(s, p, parts.slice(0, i).filter(q => q.kind === 'wipe').length);
    const first = parts[i - 1]?.kind === 'title';
    if (first) { x.globalAlpha = ease(tl / .6); }
    place(/** @type {number} */ (s.at), tl, Math.min(ease((tl - .15) / .5), ease((s.dur - tl) / .3)));
    x.globalAlpha = 1;
    caption(s.label || '', p, !!s.last);
  }
  return record(view, total, draw, look.signal);
}
