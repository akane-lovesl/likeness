/**
 * The making of a picture, as a short film: what was asked, each step as the card showed it with its note, and then
 * the picture, labelled for what it is. It plays on a canvas while it records, so the film is watched as it is made.
 * Nothing is sent anywhere: the film is saved on the device.
 */

/** @typedef {{ label: string, canvas: CanvasImageSource, reveal?: string | null }} Frame */
/** @typedef {{ asks: string[], day: string, start: CanvasImageSource | null, frames: Frame[], final: CanvasImageSource, end: string }} Story */
/** @typedef {{ ground: string, ink: string, accent: string, display: string, hand: string, mono: string, signal?: AbortSignal }} Look */

const ease = (/** @type {number} */ t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
/** The best kind of film this browser can record, or '' when it cannot: an MP4 first, since it plays on phones and knows its own length. */
function kind() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) if (MediaRecorder.isTypeSupported(t)) return t;
  return '';
}
/** Whether a film can be made here at all. */
export const canFilm = () => !!kind() && typeof HTMLCanvasElement.prototype.captureStream === 'function';

/**
 * Plays the story on the canvas and records it. Resolves the film, or null if it was stopped.
 * @param {Story} story @param {HTMLCanvasElement} view @param {Look} look @returns {Promise<Blob | null>}
 */
export async function film(story, view, look) {
  const W = view.width, H = view.height, x = /** @type {CanvasRenderingContext2D} */ (view.getContext('2d'));
  const buf = document.createElement('canvas'); buf.width = W; buf.height = H;
  const bx = /** @type {CanvasRenderingContext2D} */ (buf.getContext('2d'));
  /** @type {{ kind: string, img?: CanvasImageSource, reveal?: string, label?: string, dur: number, last?: boolean }[]} */
  const shots = [{ kind: 'title', dur: 1.2 + story.asks.length * .45 }];
  if (story.start) shots.push({ kind: 'frame', img: story.start, reveal: 'fade', label: 'As it was', dur: 1.1 });
  for (const f of story.frames) shots.push({ kind: 'frame', img: f.canvas, reveal: f.reveal || 'sweep', label: f.label, dur: f.reveal === 'bloom' ? 1.7 : 1.2 });
  shots.push({ kind: 'frame', img: story.final, reveal: 'fade', label: story.end, dur: 2.6, last: true });
  const total = shots.reduce((a, s) => a + s.dur, 0);

  const cover = (/** @type {CanvasImageSource} */ img, /** @type {CanvasRenderingContext2D} */ c = x) => c.drawImage(img, 0, 0, W, H);
  /** A shot coming in over the one before: dissolving, sweeping across, or blooming out from the middle. */
  function reveal(/** @type {any} */ s, /** @type {number} */ k) {
    if (k >= 1) return cover(s.img);
    if (s.reveal === 'fade') { x.globalAlpha = k; cover(s.img); x.globalAlpha = 1; return; }
    bx.globalCompositeOperation = 'source-over'; bx.clearRect(0, 0, W, H); cover(s.img, bx);
    let g;
    if (s.reveal === 'bloom') {
      const r = Math.max(W, H) * 1.5 * k; g = bx.createRadialGradient(W * .5, H * .42, 0, W * .5, H * .42, Math.max(1, r));
      g.addColorStop(0, '#000'); g.addColorStop(.7, '#000'); g.addColorStop(1, 'rgb(0 0 0 / 0)');
    } else {
      const edge = -W * .3 + k * W * 1.6; g = bx.createLinearGradient(edge - W * .22, -H * .04, edge + W * .22, H * .04);
      g.addColorStop(0, '#000'); g.addColorStop(1, 'rgb(0 0 0 / 0)');
    }
    bx.globalCompositeOperation = 'destination-in'; bx.fillStyle = g; bx.fillRect(0, 0, W, H);
    x.drawImage(buf, 0, 0);
  }
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
    const g = x.createLinearGradient(0, H * .66, 0, H); g.addColorStop(0, 'rgb(0 0 0 / 0)'); g.addColorStop(1, `rgb(0 0 0 / ${(.55 * a).toFixed(3)})`);
    x.fillStyle = g; x.fillRect(0, H * .66, W, H * .34);
    x.save(); x.globalAlpha = a; x.font = `${Math.round(W * .062)}px ${look.hand}`; x.fillStyle = '#fff'; x.textBaseline = 'alphabetic';
    x.shadowColor = 'rgb(0 0 0 / .6)'; x.shadowBlur = W * .02;
    const ls = lines(text, W * .86).slice(0, 3), lh = W * .066, y0 = H * .94 - (ls.length - 1) * lh;
    ls.forEach((l, i) => x.fillText(l, W * .07, y0 + i * lh + (1 - ease(p / .22)) * W * .02));
    x.restore();
  }
  /** The opening: the room's ground and mark, what was asked (the asks before it fainter), and the day it was made. */
  function title(/** @type {number} */ t, /** @type {number} */ dur) {
    x.fillStyle = look.ground; x.fillRect(0, 0, W, H);
    x.save(); x.globalAlpha = ease(t / .5); x.font = `500 ${Math.round(W * .03)}px ${look.mono}`;
    x.fillStyle = look.accent; x.fillText('✳  LIKENESS  ·  THE MAKING OF', W * .08, H * .1);
    x.fillStyle = look.ink; x.globalAlpha *= .5; x.fillText((story.day + '  ·  drawn on this device').toUpperCase(), W * .08, H * .93); x.restore();
    x.font = `${Math.round(W * .068)}px ${look.display}`;
    const blocks = story.asks.map(a => lines('“' + a + '”', W * .84)), lh = W * .085, gap = W * .05;
    let y = (H - (blocks.reduce((a, b) => a + b.length * lh, 0) + gap * (blocks.length - 1))) / 2 + lh * .75;
    blocks.forEach((ls, i) => {
      const k = ease((t - .3 - i * .45) / .6);
      x.save(); x.globalAlpha = Math.max(0, k) * (i === blocks.length - 1 ? 1 : .45); x.fillStyle = look.ink;
      for (const l of ls) { if (k > 0) x.fillText(l, W * .08, y + (1 - k) * W * .03); y += lh; }
      x.restore(); y += gap;
    });
    const out = ease((t - (dur - .35)) / .35); if (out > 0) { x.fillStyle = look.ground; x.globalAlpha = out; x.fillRect(0, 0, W, H); x.globalAlpha = 1; }
  }
  function draw(/** @type {number} */ t) {
    let at = 0, i = 0;
    while (i < shots.length - 1 && t >= at + shots[i].dur) { at += shots[i].dur; i++; }
    const s = shots[i], p = Math.min(1, (t - at) / s.dur), prev = shots[i - 1];
    if (s.kind === 'title') return title(t - at, s.dur);
    x.fillStyle = look.ground; x.fillRect(0, 0, W, H);
    if (prev?.img) cover(prev.img);
    reveal(s, ease(p / .5));
    caption(s.label || '', p, !!s.last);
  }

  const type = kind(), stream = view.captureStream(30), chunks = /** @type {Blob[]} */ ([]);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 5_000_000 });
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise(r => { rec.onstop = r; });
  draw(0); rec.start(250);
  const t0 = performance.now();
  await new Promise(done => {
    const tick = (/** @type {number} */ now) => {
      if (look.signal?.aborted) return done(null);
      const t = (now - t0) / 1000; draw(Math.min(t, total));
      if (t < total + .15) requestAnimationFrame(tick); else done(null);
    };
    requestAnimationFrame(tick);
  });
  rec.stop(); await stopped; stream.getTracks().forEach(tr => tr.stop());
  return look.signal?.aborted ? null : new Blob(chunks, { type: type.split(';')[0] });
}
