/**
 * Tap-to-select on the device: MediaPipe's interactive segmenter ("magic touch") finds the thing under a finger and
 * returns its outline as a mask. Nothing is sent anywhere. Where the model cannot load, a soft circle stands in.
 */
import { make } from './painter.js';

const VENDOR = new URL('../../vendor/mediapipe/', import.meta.url).href;
let loading = null;

/** MediaPipe writes its start-up notes to stderr, which the browser shows as errors. They are notes. */
function quiet() {
  const error = console.error.bind(console), warn = console.warn.bind(console), note = /^(INFO|WARNING):|^[IWE]\d{4} |XNNPACK|gl_context|Graph successfully|OpenGL error checking|TensorFlow Lite|inference_feedback|Feedback manager/;
  const route = original => (...args) => (typeof args[0] === 'string' && note.test(args[0]) ? console.debug(...args) : original(...args));
  console.error = route(error); console.warn = route(warn);
}

export function loadSegmenter() {
  loading ||= (async () => {
    quiet();
    const vision = await import(VENDOR + 'vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks(VENDOR + 'wasm');
    /* magic_touch.tflite is the single-model segmenter, which this bundle serves as InteractiveSegmenterLegacy. */
    const Segmenter = vision.InteractiveSegmenterLegacy || vision.InteractiveSegmenter;
    return Segmenter.createFromOptions(files, { baseOptions: { modelAssetPath: VENDOR + 'magic_touch.tflite', delegate: 'CPU' }, outputCategoryMask: false, outputConfidenceMasks: true });
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

/** A soft round mask, for when there is no model or nothing was found. */
export function circleMask(w, h, nx, ny, r = .14) {
  const c = make(w, h), x = c.getContext('2d'), R = r * Math.min(w, h), g = x.createRadialGradient(nx * w, ny * h, R * .55, nx * w, ny * h, R);
  g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgb(255 255 255 / 0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  return c;
}

/**
 * The mask of whatever is at (nx, ny), in [0, 1] coordinates of the picture.
 * @param {HTMLCanvasElement} source @returns {Promise<{ mask: HTMLCanvasElement, area: number, guessed: boolean }>}
 */
export async function selectAt(source, nx, ny) {
  try {
    const seg = await loadSegmenter();
    const out = await new Promise((resolve, reject) => {
      seg.segment(source, { keypoint: { x: nx, y: ny } }, result => {
        try {
          const m = result.confidenceMasks?.[0];
          if (!m) return reject(new Error('nothing found'));
          const w = m.width, h = m.height, data = m.getAsFloat32Array(), at = data[Math.min(h - 1, Math.floor(ny * h)) * w + Math.min(w - 1, Math.floor(nx * w))];
          const flip = at < .5, c = make(w, h), x = c.getContext('2d'), img = x.createImageData(w, h);
          let count = 0;
          for (let i = 0; i < data.length; i++) { let v = flip ? 1 - data[i] : data[i]; v = Math.max(0, Math.min(1, (v - .3) / .4)); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = v * 255; if (v > .5) count++; }
          x.putImageData(img, 0, 0);
          resolve({ mask: c, area: count / data.length, guessed: false });
        } catch (e) { reject(e); }
      });
    });
    if (out.area > .002 && out.area < .9) return out;
  } catch (e) { console.debug('segmenter unavailable', e); }
  return { mask: circleMask(source.width, source.height, nx, ny), area: .05, guessed: true };
}

/** Adds a brush stroke to a mask (or rubs it out). */
export function brush(mask, nx, ny, r = .045, erase = false) {
  const x = mask.getContext('2d'), R = r * Math.min(mask.width, mask.height);
  x.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  const g = x.createRadialGradient(nx * mask.width, ny * mask.height, R * .4, nx * mask.width, ny * mask.height, R);
  g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgb(255 255 255 / 0)'); x.fillStyle = g;
  x.beginPath(); x.arc(nx * mask.width, ny * mask.height, R, 0, Math.PI * 2); x.fill();
  x.globalCompositeOperation = 'source-over';
}
