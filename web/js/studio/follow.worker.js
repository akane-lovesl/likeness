/**
 * Read portraits or video frames without holding up the controls. Only the face points come back.
 * A classic worker: the model's loader uses importScripts.
 */
/* global importScripts */
let marker = /** @type {any} */ (null), ready = /** @type {Promise<void> | null} */ (null);
let mode = 'VIDEO';
let kit, hair;
// the model's own chatter, not a problem: kept out of the console, as on the page
for (const k of /** @type {const} */ (['log', 'info', 'warn', 'error'])) { const was = console[k]; console[k] = (...a) => { if (!/^(INFO|W\d|I\d|Created TensorFlow|Graph|gl_context|OpenGL)/.test(String(a[0] ?? ''))) was.apply(console, a); }; }
self.onmessage = async (/** @type {MessageEvent} */ e) => {
  const m = e.data;
  if (m.type === 'init') {
    ready ||= (async () => {
      mode = m.still ? 'IMAGE' : 'VIDEO';
      const vision = await import(m.vendor + 'vision_bundle.mjs');
      const files = await vision.FilesetResolver.forVisionTasks(m.vendor + 'wasm');
      kit = { vision, files, vendor: m.vendor };
      const make = (/** @type {string} */ delegate) => vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: m.vendor + 'face_landmarker.task', delegate }, runningMode: mode, numFaces: 1 });
      if (m.cpu) marker = await make('CPU'); else { try { marker = await make('GPU'); } catch { marker = await make('CPU'); } }
    })();
    try { await ready; self.postMessage({ type: 'ready' }); } catch (err) { ready = null; self.postMessage({ type: 'failed', error: String(err) }); }
    return;
  }
  if (m.type === 'hair') {
    try {
      await ready;
      const { vision, files, vendor } = kit;
      hair ||= vision.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: vendor + 'hair_segmenter.tflite', delegate: 'CPU' },
        runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true });
      const model = await hair;
      model.segment(m.bitmap, res => {
        const mask = res.confidenceMasks?.at(-1);
        if (!mask) { self.postMessage({ type: 'hair', id: m.id }); return; }
        const data = Float32Array.from(mask.getAsFloat32Array());
        self.postMessage({ type: 'hair', id: m.id, data, w: mask.width, h: mask.height }, { transfer: [data.buffer] });
      });
    } catch { hair = null; self.postMessage({ type: 'hair', id: m.id, failed: true }); }
    finally { m.bitmap.close(); }
    return;
  }
  if (m.type === 'frame') {
    try {
      await ready;
      const result = mode === 'IMAGE' ? marker?.detect(m.bitmap) : marker?.detectForVideo(m.bitmap, m.t);
      const lm = result?.faceLandmarks?.[0];
      const pts = lm?.length ? Float32Array.from(lm.flatMap((/** @type {any} */ p) => [p.x, p.y, p.z || 0])) : null;
      self.postMessage({ type: 'face', id: m.id, pts }, { transfer: pts ? [pts.buffer] : [] });
    } catch { self.postMessage({ type: 'face', id: m.id, failed: true }); }
    finally { m.bitmap.close(); }
  }
};
