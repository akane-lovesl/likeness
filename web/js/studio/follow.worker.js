/**
 * The face, followed in a worker: frames come in as bitmaps and only the face's points go back, so the page goes on
 * drawing the mirror while a face is read (a reading takes a good part of a frame's time on a phone, and most of it on
 * a computer drawing without a graphics chip). A classic worker: the model's own loader needs importScripts.
 */
/* global importScripts */
let marker = /** @type {any} */ (null), ready = /** @type {Promise<void> | null} */ (null);
// the model's own chatter, not a problem: kept out of the console, as on the page
for (const k of /** @type {const} */ (['log', 'info', 'warn', 'error'])) { const was = console[k]; console[k] = (...a) => { if (!/^(INFO|W\d|I\d|Created TensorFlow|Graph|gl_context|OpenGL)/.test(String(a[0] ?? ''))) was.apply(console, a); }; }
self.onmessage = async (/** @type {MessageEvent} */ e) => {
  const m = e.data;
  if (m.type === 'init') {
    ready ||= (async () => {
      const vision = await import(m.vendor + 'vision_bundle.mjs');
      const files = await vision.FilesetResolver.forVisionTasks(m.vendor + 'wasm');
      const make = (/** @type {string} */ delegate) => vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: m.vendor + 'face_landmarker.task', delegate }, runningMode: 'VIDEO', numFaces: 1 });
      if (m.cpu) marker = await make('CPU'); else { try { marker = await make('GPU'); } catch { marker = await make('CPU'); } }
    })();
    try { await ready; self.postMessage({ type: 'ready' }); } catch (err) { ready = null; self.postMessage({ type: 'failed', error: String(err) }); }
    return;
  }
  if (m.type === 'frame') {
    let lm = null;
    try { await ready; lm = marker?.detectForVideo(m.bitmap, m.t)?.faceLandmarks?.[0] || null; } catch { lm = null; }
    m.bitmap.close?.();
    const pts = lm ? Float32Array.from(lm.flatMap((/** @type {any} */ p) => [p.x, p.y, p.z || 0])) : null;
    self.postMessage({ type: 'face', id: m.id, pts }, { transfer: pts ? [pts.buffer] : [] });
  }
};
