/**
 * A face, read on the device: MediaPipe's face landmarker finds 478 points on it (the outline, the brows, the eyes,
 * the lips), and from them the parts of a portrait a look changes: where bangs fall, the brows, the lashes, the lips,
 * a beard. Each part can be drawn as a mask (white where it may change) for the studio to edit inside, and found
 * under a finger. Nothing is sent anywhere. Where the model cannot load or finds no face, there are no parts.
 */
import { make } from './painter.js';
import { quiet } from './segment.js';

const VENDOR = new URL('../../vendor/mediapipe/', import.meta.url).href;
let loading = /** @type {Promise<any> | null} */ (null);

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
    const vision = await import(VENDOR + 'vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks(VENDOR + 'wasm');
    return vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: VENDOR + 'face_landmarker.task', delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 1 });
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

let hairLoading = /** @type {Promise<any> | null} */ (null);
/** MediaPipe's hair segmenter: one small model that finds hair, and only hair. */
function hairModel() {
  hairLoading ||= (async () => {
    quiet();
    const vision = await import(VENDOR + 'vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks(VENDOR + 'wasm');
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
      const seg = await hairModel();
      return await new Promise(resolve => seg.segment(c, (/** @type {any} */ res) => {
        const masks = res?.confidenceMasks, m = masks?.[masks.length - 1]; if (!m) { resolve(null); return; }
        const w = m.width, h = m.height, data = m.getAsFloat32Array(), out = make(w, h), x = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d')), img = x.createImageData(w, h);
        let count = 0;
        for (let i = 0; i < data.length; i++) { const v = Math.max(0, Math.min(1, (data[i] - .28) / .3)); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = v * 255; if (v > .5) count++; }
        x.putImageData(img, 0, 0);
        // close the small holes: blur it, then firm the edge back up
        const soft = make(w, h), sx = /** @type {CanvasRenderingContext2D} */ (soft.getContext('2d'));
        sx.filter = 'blur(' + Math.max(1, w / 160).toFixed(1) + 'px)'; sx.drawImage(out, 0, 0); sx.filter = 'none';
        const s = sx.getImageData(0, 0, w, h);
        for (let i = 3; i < s.data.length; i += 4) s.data[i] = Math.max(0, Math.min(255, (s.data[i] - 70) * 1.6));
        sx.putImageData(s, 0, 0);
        resolve(count / data.length > .004 ? soft : null);
      }));
    } catch { return null; }
  })());
  return hairRead.get(c);
}

const read = new WeakMap();
/**
 * The face in a picture, or null.
 * @param {HTMLCanvasElement} c @returns {Promise<Face | null>}
 */
export function faceOf(c) {
  if (!read.has(c)) read.set(c, (async () => {
    try {
      const marker = await loader(), res = marker.detect(c), lm = res?.faceLandmarks?.[0];
      if (!lm?.length) return null;
      const w = c.width, h = c.height;
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

/** A face from its points: with the box round its outline. @param {Pt[]} pts @param {number} w @param {number} h @returns {Face} */
function boxed(pts, w, h) {
  const xs = OVAL.map(i => pts[i].x), ys = OVAL.map(i => pts[i].y), x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { pts, w, h, box: [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0] };
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
    const vision = await import(VENDOR + 'vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks(VENDOR + 'wasm');
    const make = (/** @type {string} */ delegate) => vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: VENDOR + 'face_landmarker.task', delegate }, runningMode: 'VIDEO', numFaces: 1 });
    if (softwareGL()) return make('CPU');
    try { return await make('GPU'); } catch { return make('CPU'); }
  })();
  videoLoading.catch(() => { videoLoading = null; });
  return videoLoading;
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
 * free) and gives the latest mask, white where there is hair, at that small size. Null until there is one.
 * @returns {Promise<(frame: HTMLCanvasElement) => HTMLCanvasElement | null>}
 */
export async function hairFollower() {
  hairVideoLoading ||= (async () => {
    quiet();
    const vision = await import(VENDOR + 'vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks(VENDOR + 'wasm');
    return vision.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: VENDOR + 'hair_segmenter.tflite', delegate: 'CPU' }, runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true });
  })();
  hairVideoLoading.catch(() => { hairVideoLoading = null; });
  const seg = await hairVideoLoading;
  let mask = /** @type {HTMLCanvasElement | null} */ (null), at = 0, last = 0;
  return (frame) => {
    const now = performance.now(); if (now - at < 180) return mask;
    at = now;
    const t = Math.max(last + 1, now); last = t;
    seg.segmentForVideo(frame, t, (/** @type {any} */ res) => {
      const masks = res?.confidenceMasks, m = masks?.[masks.length - 1]; if (!m) return;
      const w = m.width, h = m.height, data = m.getAsFloat32Array(), out = mask && mask.width === w && mask.height === h ? mask : make(w, h), x = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d')), img = x.createImageData(w, h);
      for (let i = 0; i < data.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = Math.max(0, Math.min(1, (data[i] - .45) / .22)) * 255; }
      x.putImageData(img, 0, 0); mask = out;
    });
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
    for (const s of [...shapesOf(f).beard, ...shapesOf(f).brows]) { x.beginPath(); s.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.closePath(); x.fill(); }
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
