// The Lookbook's drawn sitters, made ready for the web: each picture as WebP, with its face (MediaPipe's 478 points and
// their depth) and its hair (a small mask), read once here so the first screen needs no model to sketch on them.
//   node tools/sitters.mjs        (system Chrome; reads tests/fixtures/sitters/*.jpg, writes web/sitters/)
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const here = resolve(import.meta.dirname, '..'), from = resolve(here, 'tests/fixtures/sitters'), to = resolve(here, 'web/sitters');
const NAMES = { ines: 'Inês', kofi: 'Kofi', lena: 'Lena', mei: 'Mei', ruth: 'Ruth', tomas: 'Tomás' };
const port = 4190 + Math.floor(Math.random() * 9);
const server = spawn(process.execPath, [resolve(here, 'tools/serve.mjs'), String(port)], { stdio: 'ignore' });
try {
  await new Promise(r => setTimeout(r, 600));
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  await mkdir(to, { recursive: true });
  const sitters = [];
  for (const file of (await readdir(from)).filter(f => f.endsWith('.jpg')).sort()) {
    const id = file.replace(/\.jpg$/, ''), jpeg = (await readFile(resolve(from, file))).toString('base64');
    const got = await page.evaluate(async ({ jpeg }) => {
      const { faceOf, hairOf } = await import('/js/studio/face.js');
      const img = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + jpeg)).blob());
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
      const [face, read] = await Promise.all([faceOf(c), hairOf(c)]);
      // the segmenter can miss a bun or a curl drawn apart from the rest: the hair is grown into touching pixels of its own
      // colour (above the chin, so never into the clothes), a short way
      let hair = read;
      if (read && face) {
        const w = c.width, h = c.height, px = c.getContext('2d').getImageData(0, 0, w, h).data;
        const mk = document.createElement('canvas'); mk.width = w; mk.height = h; const mx = mk.getContext('2d'); mx.drawImage(read, 0, 0, w, h);
        const m = mx.getImageData(0, 0, w, h), a = m.data, chin = face.pts[152].y;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < w * h; i++) if (a[i * 4 + 3] > 200) { r += px[i * 4]; g += px[i * 4 + 1]; b += px[i * 4 + 2]; n++; }
        if (n) {
          r /= n; g /= n; b /= n;
          const dist = new Int16Array(w * h).fill(-1), q = new Int32Array(w * h); let head = 0, tail = 0;
          for (let i = 0; i < w * h; i++) if (a[i * 4 + 3] > 200) { dist[i] = 0; q[tail++] = i; }
          while (head < tail) {
            const i = q[head++], x = i % w, y = (i / w) | 0; if (dist[i] >= 240) continue;
            for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
              if (j < 0 || dist[j] >= 0 || (j / w | 0) > chin) continue;
              if (Math.hypot(px[j * 4] - r, px[j * 4 + 1] - g, px[j * 4 + 2] - b) > 30) continue;
              dist[j] = dist[i] + 1; a[j * 4 + 3] = 255; q[tail++] = j;
            }
          }
          // and never the skin: inside the face, whatever is the colour of the cheeks is not hair
          const cheek = (k) => { const p = face.pts[k], i = (Math.round(p.y) * w + Math.round(p.x)) * 4; return [px[i], px[i + 1], px[i + 2]]; };
          const [c1, c2] = [cheek(50), cheek(280)], skin = [0, 1, 2].map(k => (c1[k] + c2[k]) / 2);
          const xs = face.pts.map(p => p.x), ys = face.pts.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
          for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, x1); x++) {
            const i = y * w + x; if (Math.hypot(px[i * 4] - skin[0], px[i * 4 + 1] - skin[1], px[i * 4 + 2] - skin[2]) < 42) a[i * 4 + 3] = 0;
          }
          mx.putImageData(m, 0, 0); hair = mk;
        }
      }
      const webp = await new Promise(r => c.toBlob(r, 'image/webp', .84));
      // the hair is only ever a soft mask for a colour: a small one is plenty
      let mask = null;
      if (hair) { mask = document.createElement('canvas'); mask.width = 150; mask.height = Math.round(150 * c.height / c.width); mask.getContext('2d').drawImage(hair, 0, 0, mask.width, mask.height); }
      const bytes = new Uint8Array(await webp.arrayBuffer()); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
      return { w: c.width, h: c.height, webp: btoa(bin), pts: face ? face.pts.map(p => [+p.x.toFixed(1), +p.y.toFixed(1), Math.round(p.z || 0)]) : null, hair: mask ? mask.toDataURL('image/png') : null };
    }, { jpeg });
    if (!got.pts) throw new Error('no face found in ' + file);
    await writeFile(resolve(to, id + '.webp'), Buffer.from(got.webp, 'base64'));
    sitters.push({ id, name: NAMES[id] || id, portrait: id + '.webp', w: got.w, h: got.h, pts: got.pts, hair: got.hair });
    console.log(id, got.w + '×' + got.h, Math.round(got.webp.length * .75 / 1024) + ' KB', got.hair ? 'hair' : 'no hair');
  }
  await writeFile(resolve(to, 'sitters.json'), JSON.stringify({ about: 'Drawn sitters: invented people, drawn. Faces and hair read by tools/sitters.mjs.', sitters }) + '\n');
  await browser.close();
} finally { server.kill(); }
