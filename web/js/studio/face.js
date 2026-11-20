/**
 * A face, read on the device: MediaPipe's face landmarker finds 478 points on it (the outline, the brows, the eyes,
 * the lips), and from them the parts of a portrait a look changes: where bangs fall, the brows, the lashes, the lips,
 * a beard. Each part can be drawn as a mask (white where it may change) for the studio to edit inside, and found
 * under a finger. Nothing is sent anywhere. Where the model cannot load or finds no face, there are no parts.
 */
import { make } from './painter.js';
import { quiet } from './segment.js';
import { assetUrl } from '../core/dom.js';

const VENDOR = assetUrl('vendor/mediapipe/').href;
let loading = /** @type {Promise<any> | null} */ (null);
let visionFiles = /** @type {Promise<{vision: any, files: any}> | null} */ (null);
function visionKit() {
  visionFiles ||= import(VENDOR + 'vision_bundle.mjs').then(async vision => ({ vision, files: await vision.FilesetResolver.forVisionTasks(VENDOR + 'wasm') }));
  visionFiles.catch(() => { visionFiles = null; });
  return visionFiles;
}

/** The outline of the face, in order round it from the top of the forehead. */
export const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const BROWS = [[70, 63, 105, 66, 107, 55, 65, 52, 53, 46], [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]];
const EYES = [[33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7], [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249]];
/** The mouth's opening, inside the lips. */
export const MOUTH = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
export const LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
/** The parts a look can change, in the order they are offered. */
export const PARTS = ['bangs', 'brows', 'lashes', 'lips', 'beard', 'colour'];

/** @typedef {{ x: number, y: number, z?: number }} Pt */
/** @typedef {{ pts: Pt[], w: number, h: number, box: [number, number, number, number] }} Face points in pixels of a w × h picture (z: depth in the same pixels, the head's centre at 0, nearer negative); box the face's outline */

function loader() {
  loading ||= (async () => {
    quiet();
    const { vision, files } = await visionKit();
    return vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: VENDOR + 'face_landmarker.task', delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 1 });
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

let hairLoading = /** @type {Promise<any> | null} */ (null);
let portraitWorker = /** @type {Promise<Worker | null> | null} */ (null);
const portraitReader = () => (portraitWorker ||= faceWorker(true).catch(() => null));
/** MediaPipe's hair segmenter: one small model that finds hair, and only hair. */
function hairModel() {
  hairLoading ||= (async () => {
    quiet();
    const { vision, files } = await visionKit();
    return vision.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: VENDOR + 'hair_segmenter.tflite', delegate: 'CPU' }, runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true });
  })();
  hairLoading.catch(() => { hairLoading = null; });
  return hairLoading;
}
const hairRead = new WeakMap();
/**
 * The hair in a picture, as a mask (white where it is, at the segmenter's own size), or null where there is none.
 * @param {HTMLCanvasElement} c @returns {Promise<HTMLCanvasElement | null>}
 */
export function hairOf(c) {
  if (!hairRead.has(c)) hairRead.set(c, (async () => {
    try {
      const answer = await inspectPortrait(c, 'hair').catch(() => undefined);
      if (answer !== undefined) return answer ? renderHairMask(answer.data, answer.w, answer.h) : null;
      const seg = await hairModel();
      return await new Promise(resolve => seg.segment(c, (/** @type {any} */ res) => {
        const masks = res?.confidenceMasks, m = masks?.[masks.length - 1]; if (!m) { resolve(null); return; }
        resolve(renderHairMask(m.getAsFloat32Array(), m.width, m.height));
      }));
    } catch { return null; }
  })());
  return hairRead.get(c);
}

/** @param {Float32Array} data @param {number} w @param {number} h */
function renderHairMask(data, w, h) {
  const out = make(w, h), x = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d')), img = x.createImageData(w, h);
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(0, Math.min(1, (data[i] - .28) / .3));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = v * 255;
    if (v > .5) count++;
  }
  if (count / data.length <= .004) return null;
  x.putImageData(img, 0, 0);
  const soft = make(w, h), sx = /** @type {CanvasRenderingContext2D} */ (soft.getContext('2d', { willReadFrequently: true }));
  sx.filter = 'blur(' + Math.max(1, w / 160).toFixed(1) + 'px)'; sx.drawImage(out, 0, 0); sx.filter = 'none';
  const clean = sx.getImageData(0, 0, w, h);
  for (let i = 3; i < clean.data.length; i += 4) clean.data[i] = Math.max(0, Math.min(255, (clean.data[i] - 70) * 1.6));
  sx.putImageData(clean, 0, 0);
  return soft;
}

const read = new WeakMap();
/**
 * The face in a picture, or null.
 * @param {HTMLCanvasElement} c @returns {Promise<Face | null>}
 */
export function faceOf(c) {
  if (!read.has(c)) read.set(c, (async () => {
    const w = c.width, h = c.height;
    if (!w || !h) return null;
    const answer = await inspectPortrait(c, 'face').catch(() => undefined);
    if (answer !== undefined) return answer ? boxed(framePoints(answer.pts, w, h), w, h) : null;
    try {
      const marker = await loader(), res = marker.detect(c), lm = res?.faceLandmarks?.[0];
      if (!lm?.length) return null;
      return boxed(lm.map((/** @type {any} */ p) => ({ x: p.x * w, y: p.y * h, z: (p.z || 0) * w })), w, h);
    } catch { return null; }
  })());
  return read.get(c);
}

/**
 * The same face in the same picture at another size, and turned round if asked (as a front camera's picture is shown,
 * a mirror image): its points move with the picture and keep their names.
 * @param {Face} f @param {number} w @param {number} h @param {boolean} [mirror] @returns {Face}
 */
export function reframed(f, w, h, mirror = false) {
  const kx = w / f.w, ky = h / f.h;
  return boxed(f.pts.map(p => ({ x: (mirror ? f.w - p.x : p.x) * kx, y: p.y * ky, z: (p.z || 0) * kx })), w, h);
}

/** A picture's hair, known already (a drawn sitter's, read when it was made ready): no segmenter is needed for it. @param {HTMLCanvasElement} c @param {HTMLCanvasElement} mask */
export function knowHair(c, mask) { hairRead.set(c, Promise.resolve(mask)); }

/**
 * How far a face is turned, as the picture shows it: the nose from the middle of the cheeks, from -1 (to the left of
 * the picture) to 1 (to its right). A head turned as far as a three-quarter view is at about a half.
 * @param {{ pts: Pt[] }} f
 */
export const yawOf = (f) => { const L = f.pts[234], R = f.pts[454], N = f.pts[1]; return (N.x - (L.x + R.x) / 2) / (Math.abs(R.x - L.x) / 2 || 1); };

/** A face read before (a drawn sitter's, shipped with it): its points as [x, y, z]. @param {number[][]} pts @param {number} w @param {number} h @returns {Face} */
export const faceFrom = (pts, w, h) => boxed(pts.map(([x, y, z]) => ({ x, y, z: z || 0 })), w, h);

/** A face from its points: with the box round its outline. @param {Pt[]} pts @param {number} w @param {number} h @returns {Face} */
function boxed(pts, w, h) {
  const xs = OVAL.map(i => pts[i].x), ys = OVAL.map(i => pts[i].y), x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { pts, w, h, box: [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0] };
}

/** @param {Float32Array} raw @param {number} w @param {number} h @returns {Pt[]} */
function framePoints(raw, w, h) {
  const pts = [];
  for (let i = 0; i < raw.length; i += 3) pts.push({ x: raw[i] * w, y: raw[i + 1] * h, z: raw[i + 2] * w });
  return pts;
}

/** @typedef {{ sx: number, sy: number, sw: number, sh: number }} Crop the part of a video a viewer shows */

/** Whether the graphics here are drawn in software (no chip to speak of), where the CPU reads a face faster. */
function softwareGL() {
  try {
    const gl = document.createElement('canvas').getContext('webgl'), info = gl?.getExtension('WEBGL_debug_renderer_info');
    return !gl || /swiftshader|llvmpipe|software|softpipe/i.test(info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '');
  } catch { return true; }
}

let videoLoading = /** @type {Promise<any> | null} */ (null);
/** The face landmarker for a moving picture, a frame at a time (on the graphics chip where it can, else the CPU). */
function videoModel() {
  videoLoading ||= (async () => {
    quiet();
    const { vision, files } = await visionKit();
    const make = (/** @type {string} */ delegate) => vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: VENDOR + 'face_landmarker.task', delegate }, runningMode: 'VIDEO', numFaces: 1 });
    if (softwareGL()) return make('CPU');
    try { return await make('GPU'); } catch { return make('CPU'); }
  })();
  videoLoading.catch(() => { videoLoading = null; });
  return videoLoading;
}

/** @param {boolean} still @returns {Promise<Worker | null>} */
async function faceWorker(still) {
  if (typeof Worker !== 'function' || typeof createImageBitmap !== 'function') return null;
  const w = new Worker(assetUrl('js/studio/follow.worker.js'));
  const ok = await new Promise(done => {
    const late = setTimeout(() => done(false), 15000);
    w.onmessage = e => { clearTimeout(late); done(e.data?.type === 'ready'); };
    w.onerror = () => { clearTimeout(late); done(false); };
    w.postMessage({ type: 'init', vendor: VENDOR, still, cpu: still || softwareGL() });
  });
  w.onmessage = w.onerror = null;
  if (!ok) { w.terminate(); return null; }
  return w;
}

let asideMade = /** @type {Promise<Worker | null> | null} */ (null);
function asideWorker() {
  asideMade ||= faceWorker(false);
  asideMade.then(w => { if (!w) asideMade = null; }, () => { asideMade = null; });
  return asideMade;
}
let asked = 0;

/** @param {HTMLCanvasElement} canvas @param {'face' | 'hair'} kind @returns {Promise<any>} */
async function inspectPortrait(canvas, kind) {
  const worker = await portraitReader();
  if (!worker) return undefined;
  const scale = Math.min(1, 720 / Math.max(canvas.width, canvas.height));
  const bitmap = await createImageBitmap(canvas, { resizeWidth: Math.max(1, Math.round(canvas.width * scale)), resizeHeight: Math.max(1, Math.round(canvas.height * scale)) });
  const id = ++asked;
  return new Promise(resolve => {
    const done = value => {
      clearTimeout(timer); worker.removeEventListener('message', answer); resolve(value);
    };
    const answer = (/** @type {MessageEvent} */ e) => {
      if (e.data?.type === kind && e.data.id === id) done(e.data.failed ? undefined : (e.data.pts || e.data.data) ? e.data : null);
    };
    const timer = setTimeout(() => done(undefined), 4500);
    worker.addEventListener('message', answer);
    try { worker.postMessage({ type: kind === 'face' ? 'frame' : 'hair', bitmap, id }, [bitmap]); }
    catch { bitmap.close(); done(undefined); }
  });
}
/**
 * A face followed through a video, read aside from the page (in a worker), so the page goes on drawing while a face is
 * read: the frame showing now is handed over whenever the last reading is back, and the latest face is there to draw
 * with, in the pixels of a crop of the frame at the viewer's size, smoothed as follower's are (at: when it came
 * back; from: when its frame was handed over; took: the time between). Null where no worker can read (follower reads
 * on the page instead).
 * @returns {Promise<null | { ask(video: HTMLVideoElement, crop: Crop, w: number, h: number): void, readonly face: Face | null, readonly at: number, readonly took: number, readonly from: number, stop(): void }>}
 */
export async function followerAside() {
  const worker = await asideWorker(); if (!worker) return null;
  const frame = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : null;
  const draw = frame?.getContext('2d') || null;
  let busy = false, on = true, last = 0, at = 0, took = 0, mine = 0, from = 0;
  let prev = /** @type {Pt[] | null} */ (null), face = /** @type {Face | null} */ (null);
  /** @type {null | { crop: Crop, w: number, h: number, vw: number, vh: number, t0: number }} */ let q = null;
  worker.onmessage = (e) => {
    const m = e.data; if (m?.type !== 'face' || m.id !== mine || !q) return;
    busy = false; took = performance.now() - q.t0; at = performance.now(); from = q.t0;
    if (!on) return;
    if (!m.pts) { prev = null; face = null; return; }
    const { crop, w, h, vw, vh } = q, kx = w / crop.sw, ky = h / crop.sh, raw = /** @type {Float32Array} */ (m.pts);
    /** @type {Pt[]} */ let pts = [];
    for (let i = 0; i < raw.length; i += 3) pts.push({ x: (raw[i] * vw - crop.sx) * kx, y: (raw[i + 1] * vh - crop.sy) * ky, z: raw[i + 2] * vw * kx });
    const was = prev;
    if (was && was.length === pts.length) {
      const a = Math.min(1, .3 + Math.hypot(pts[1].x - was[1].x, pts[1].y - was[1].y) / w * 45);
      pts = pts.map((p, i) => ({ x: was[i].x + (p.x - was[i].x) * a, y: was[i].y + (p.y - was[i].y) * a, z: (was[i].z || 0) + ((p.z || 0) - (was[i].z || 0)) * a }));
    }
    prev = pts; face = boxed(pts, w, h);
  };
  return {
    ask(video, crop, w, h) {
      if (busy || !on || !video.videoWidth) return;
      busy = true; const t = Math.max(last + 1, performance.now()); last = t;
      const id = mine = ++asked;
      q = { crop: { ...crop }, w, h, vw: video.videoWidth, vh: video.videoHeight, t0: performance.now() };
      const send = (/** @type {ImageBitmap} */ bitmap) => {
        if (!on || id !== mine) { bitmap.close(); busy = false; return; }
        worker.postMessage({ type: 'frame', bitmap, t, id }, [bitmap]);
      };
      if (frame && draw) {
        const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
        const width = Math.round(video.videoWidth * scale), height = Math.round(video.videoHeight * scale);
        if (frame.width !== width || frame.height !== height) { frame.width = width; frame.height = height; }
        try { draw.drawImage(video, 0, 0, width, height); send(frame.transferToImageBitmap()); }
        catch { busy = false; }
      } else createImageBitmap(video).then(send, () => { busy = false; });
    },
    get face() { return face; },
    get at() { return at; },
    get took() { return took; },
    get from() { return from; },
    stop() { on = false; busy = false; mine = -1; },
  };
}

/**
 * A face followed through a video. Each call reads the frame showing now and gives its face in the pixels of a crop
 * of it (the part the viewer shows, at the viewer's size), smoothed from one frame to the next: steady when the head
 * is still, quick when it moves. Null where there is no face.
 * @returns {Promise<(video: HTMLVideoElement, crop: Crop, w: number, h: number) => Face | null>}
 */
export async function follower() {
  const marker = await videoModel();
  let last = 0, prev = /** @type {Pt[] | null} */ (null);
  return (video, crop, w, h) => {
    const t = Math.max(last + 1, performance.now()); last = t;
    const lm = marker.detectForVideo(video, t)?.faceLandmarks?.[0];
    if (!lm?.length) { prev = null; return null; }
    const vw = video.videoWidth, vh = video.videoHeight, kx = w / crop.sw, ky = h / crop.sh;
    /** @type {Pt[]} */ let pts = lm.map((/** @type {any} */ p) => ({ x: (p.x * vw - crop.sx) * kx, y: (p.y * vh - crop.sy) * ky, z: (p.z || 0) * vw * kx }));
    const was = prev;
    if (was) {
      const a = Math.min(1, .3 + Math.hypot(pts[1].x - was[1].x, pts[1].y - was[1].y) / w * 45);
      pts = pts.map((p, i) => ({ x: was[i].x + (p.x - was[i].x) * a, y: was[i].y + (p.y - was[i].y) * a, z: (was[i].z || 0) + ((p.z || 0) - (was[i].z || 0)) * a }));
    }
    prev = pts;
    return boxed(pts, w, h);
  };
}

let hairVideoLoading = /** @type {Promise<any> | null} */ (null);
/**
 * The hair in a video, found a few times a second: each call hands the segmenter a small copy of the frame (when it is
 * free) and gives the latest mask, white where there is hair, at that small size. Null until there is one. Asked for
 * now, it reads this very frame, whenever it last read (a picture is being kept, and its hair has to be where it is).
 * @returns {Promise<(frame: HTMLCanvasElement, now?: boolean) => HTMLCanvasElement | null>}
 */
export async function hairFollower() {
  hairVideoLoading ||= (async () => {
    quiet();
    const { vision, files } = await visionKit();
    return vision.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: VENDOR + 'hair_segmenter.tflite', delegate: 'CPU' }, runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true });
  })();
  hairVideoLoading.catch(() => { hairVideoLoading = null; });
  const seg = await hairVideoLoading;
  // read a few times a second, less often where a reading is slow, so it never takes much of the device's time
  let mask = /** @type {HTMLCanvasElement | null} */ (null), at = 0, last = 0, gap = 180;
  return (frame, right = false) => {
    const now = performance.now(); if (!right && now - at < gap) return mask;
    at = now;
    const t = Math.max(last + 1, now); last = t;
    seg.segmentForVideo(frame, t, (/** @type {any} */ res) => {
      const masks = res?.confidenceMasks, m = masks?.[masks.length - 1]; if (!m) return;
      const w = m.width, h = m.height, data = m.getAsFloat32Array(), out = mask && mask.width === w && mask.height === h ? mask : make(w, h), x = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d')), img = x.createImageData(w, h);
      for (let i = 0; i < data.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = Math.max(0, Math.min(1, (data[i] - .45) / .22)) * 255; }
      x.putImageData(img, 0, 0); mask = out;
      // when it was read, so it can be moved with the face until the next reading
      /** @type {any} */ (out).readAt = performance.now();
    });
    gap = Math.max(180, (performance.now() - now) * 4);
    return mask;
  };
}

const at = (/** @type {Face} */ f, /** @type {number[]} */ ids) => ids.map(i => f.pts[i]);
/** The face's own outlines, in pixels: round the face, the brows, the eyes and the lips. @param {Face} f */
export const contoursOf = (f) => ({ face: at(f, OVAL), brows: BROWS.map(b => at(f, b)), eyes: EYES.map(e => at(f, e)), lips: [at(f, LIPS)] });

/** A shape pushed out from its middle by k of its own size. @param {Pt[]} s @param {number} k */
function grow(s, k, ky = k) {
  const cx = s.reduce((a, p) => a + p.x, 0) / s.length, cy = s.reduce((a, p) => a + p.y, 0) / s.length;
  return s.map(p => ({ x: cx + (p.x - cx) * (1 + k), y: cy + (p.y - cy) * (1 + ky) }));
}

/**
 * The shapes of each part of a face, in pixels: where it may change for that part.
 * @param {Face} f @returns {Record<string, Pt[][]>}
 */
export function shapesOf(f) {
  const [bx, by, bw, bh] = f.box, oval = at(f, OVAL), up = bh * .3;
  const brows = BROWS.map(b => at(f, b)), eyes = EYES.map(e => at(f, e));
  // where bangs fall: the top of the head down over the forehead to just below the brows, and down the temples to the cheekbones
  const top = at(f, [162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389]).map(p => ({ x: p.x + (p.x - (bx + bw / 2)) * .12, y: p.y - up }));
  const browLow = (/** @type {Pt[]} */ b) => b.slice(5).map(p => ({ x: p.x, y: p.y + bh * .025 }));
  const right = at(f, [389, 356, 454]).map(p => ({ x: p.x + bw * .06, y: p.y })), left = at(f, [234, 127, 162]).map(p => ({ x: p.x - bw * .06, y: p.y }));
  // round from the top-left: over the head, down the right temple, back along the brows (outer to inner on the right, inner to outer on the left), up the left temple
  const bangs = [...top, ...right, { x: f.pts[263].x + bw * .04, y: f.pts[263].y }, ...browLow(brows[1]).reverse(), ...browLow(brows[0]), { x: f.pts[33].x - bw * .04, y: f.pts[33].y }, ...left];
  // a beard: the face below the nose, and the neck under the chin
  const jaw = at(f, [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454]);
  const beard = [...jaw.slice(0, 10), ...jaw.slice(10, 11).map(p => ({ x: p.x, y: p.y + bh * .22 })), ...jaw.slice(11), ...at(f, [322, 2, 92]).map(p => ({ x: p.x, y: p.y - bh * .01 }))];
  return {
    bangs: [bangs], brows: brows.map(b => grow(b, .45, 1.1)), lashes: eyes.map(e => grow(e, .55, 1.4)), lips: [grow(at(f, LIPS), .18, .3)], beard: [beard],
    face: [oval],
  };
}

/**
 * Clears from a hair mask what the hair segmenter counts as hair but a new colour never goes on: the brows, and the
 * lower face. Where there is a beard, that far all round and more (a full beard reaches past the jaw and up the
 * sideburns); where there is none, only the jaw and chin from the mouth down, so hair that falls beside the face keeps
 * its colour.
 * @param {CanvasRenderingContext2D} x the mask, at k times the size of the face's own picture @param {Face} f @param {boolean} beard @param {number} [k]
 */
export function clearNotHair(x, f, beard, k = 1) {
  const s = shapesOf(f), path = (/** @type {Pt[]} */ pts) => { x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p.x * k, p.y * k) : x.moveTo(p.x * k, p.y * k))); x.closePath(); };
  x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = x.strokeStyle = '#fff'; x.lineJoin = 'round';
  // without a beard, only the jaw and the chin (from the mouth's level down): hair that falls beside the cheeks is hair
  for (const b of s.beard) { path(beard ? b : [...b.slice(2, 19), ...b.slice(21)]); x.fill(); if (beard) { x.lineWidth = f.box[2] * k * .36; x.stroke(); } }
  // the brows themselves, not the hair round their ends at the temples
  for (const b of BROWS.map(i => grow(at(f, i), .12, .55))) { path(b); x.fill(); }
  x.restore();
}

/**
 * Whether a face wears a beard: the chin, between the lip and the point of it, far darker than the cheekbones. A full
 * beard reaches past the jaw and up the sideburns, and is kept from a new hair colour that far; without one, hair that
 * falls beside the jaw keeps its colour.
 * @param {HTMLCanvasElement} pic the picture the face is in, at any size @param {Face} f
 */
export function bearded(pic, f) {
  const x = /** @type {CanvasRenderingContext2D} */ (pic.getContext('2d')), kx = pic.width / f.w, ky = pic.height / f.h, r = Math.max(1, Math.round(f.box[2] * kx * .025));
  const lum = (/** @type {Pt} */ p) => {
    const d = x.getImageData(Math.round(p.x * kx) - r, Math.round(p.y * ky) - r, 2 * r + 1, 2 * r + 1).data; let s = 0;
    for (let k = 0; k < d.length; k += 4) s += .2126 * d[k] + .7152 * d[k + 1] + .0722 * d[k + 2];
    return s / (d.length / 4);
  };
  const mid = (/** @type {number} */ a, /** @type {number} */ b) => ({ x: (f.pts[a].x + f.pts[b].x) / 2, y: (f.pts[a].y + f.pts[b].y) / 2 });
  try { return lum(mid(17, 152)) < (lum(f.pts[50]) + lum(f.pts[280])) / 2 * .6; } catch { return false; }
}

/**
 * A part's mask: white where it may change, the edge softened. For the hair's colour, the hair itself, found by the
 * hair segmenter.
 * @param {HTMLCanvasElement} picture @param {Face} f @param {string} part @returns {Promise<HTMLCanvasElement | null>}
 */
export async function maskOf(picture, f, part) {
  const w = picture.width, h = picture.height, c = make(w, h), x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  if (part === 'colour') {
    const hair = await hairOf(picture); if (!hair) return null;
    x.drawImage(hair, 0, 0, w, h);
    // the hair on the head, not a beard: the segmenter counts both as hair
    x.globalCompositeOperation = 'destination-out'; x.filter = 'blur(' + Math.max(1.5, w / 200).toFixed(1) + 'px)'; x.fillStyle = '#fff';
    clearNotHair(x, f, bearded(picture, f));
    x.globalCompositeOperation = 'source-over'; x.filter = 'none';
    return c;
  }
  const shapes = shapesOf(f)[part]; if (!shapes) return null;
  x.filter = 'blur(' + Math.max(1.5, w / 260).toFixed(1) + 'px)'; x.fillStyle = '#fff';
  for (const s of shapes) { x.beginPath(); s.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.closePath(); x.fill(); }
  return c;
}

/** Whether a point is inside a shape. @param {Pt[]} s @param {number} px @param {number} py */
function inside(s, px, py) {
  let on = false;
  for (let i = 0, j = s.length - 1; i < s.length; j = i++) { const a = s[i], b = s[j]; if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) on = !on; }
  return on;
}
/**
 * The part of a face under a point (pixels of the picture it was read from): the smallest that holds it first, so a
 * brow wins over the forehead. Above the face is the hair.
 * @param {Face} f @param {number} px @param {number} py @returns {string | null}
 */
export function partAt(f, px, py) {
  const s = shapesOf(f);
  for (const part of ['lashes', 'brows', 'lips', 'bangs', 'beard']) if (s[part].some(sh => inside(sh, px, py))) return part;
  const [bx, by, bw, bh] = f.box;
  if (py < by + bh * .15 && px > bx - bw * .35 && px < bx + bw * 1.35) return 'colour';
  return null;
}
