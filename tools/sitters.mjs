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
      const { faceOf, hairOf, OVAL } = await import('/js/studio/face.js');
      const img = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + jpeg)).blob());
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
      const [face, read] = await Promise.all([faceOf(c), hairOf(c)]);
      // the hair: where the segmenter is sure of it, grown into touching pixels of its own colour (it can miss a bun, or a
      // whole drawn bob it does not know as hair, when it starts from just above the forehead), above the chin, never the
      // skin, never the face below the brows (glasses, eyes)
      let hair = null;
      if (face) {
        // colours are read through a slight blur: a drawing's grain would otherwise break the hair's shadows into lace
        const w = c.width, h = c.height, soft = document.createElement('canvas'); soft.width = w; soft.height = h;
        const sx = /** @type {CanvasRenderingContext2D} */ (soft.getContext('2d')); sx.filter = 'blur(2px)'; sx.drawImage(c, 0, 0);
        const px = sx.getImageData(0, 0, w, h).data, a = new Uint8Array(w * h), P = i => face.pts[i];
        if (read) { const mk = document.createElement('canvas'); mk.width = w; mk.height = h; const mx = mk.getContext('2d'); mx.drawImage(read, 0, 0, w, h); const d = mx.getImageData(0, 0, w, h).data; for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3]; }
        let seeds = 0; for (let i = 0; i < w * h; i++) if (a[i] > 200) seeds++;
        // where the segmenter is sure, it is hair even when it is the colour of skin (grey hair over a pale forehead)
        const sure = new Uint8Array(w * h);
        const xs = face.pts.map(p => p.x), ys = face.pts.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), bw = x1 - x0, bh = y1 - y0;
        const cheek = k => { const p = P(k), i = (Math.round(p.y) * w + Math.round(p.x)) * 4; return [px[i], px[i + 1], px[i + 2]]; };
        // a square worn away (the least around each pixel) or grown (the most)
        const pass = (/** @type {Uint8Array} */ src, keepMin, horizontal, rad) => { const out = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = keepMin ? 255 : 0; for (let d = -rad; d <= rad; d++) { const xx = horizontal ? x + d : x, yy = horizontal ? y : y + d; const s = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : src[yy * w + xx]; v = keepMin ? Math.min(v, s) : Math.max(v, s); } out[y * w + x] = v; } return out; };
        const erode = (/** @type {Uint8Array} */ m, rad) => pass(pass(m, true, true, rad), true, false, rad), dilate = (/** @type {Uint8Array} */ m, rad) => pass(pass(m, false, true, rad), false, false, rad);
        // only the pieces that reach the head: the hair, not a patch of its colour across the room
        const home = (/** @type {Uint8Array} */ m) => {
          const lab = new Int32Array(w * h), st = new Int32Array(w * h), keep = [false];
          const hx0 = x0 - bw * .35, hx1 = x1 + bw * .35, hy0 = y0 - bh * .6, hy1 = P(152).y;
          for (let s = 0; s < w * h; s++) {
            if (!m[s] || lab[s]) continue;
            const id = keep.length; let top = 0, at = false; st[top++] = s; lab[s] = id;
            while (top) {
              const i = st[--top], x = i % w, y = (i / w) | 0;
              if (x >= hx0 && x <= hx1 && y >= hy0 && y <= hy1) at = true;
              for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < w * h && m[j] && !lab[j]) { lab[j] = id; st[top++] = j; }
            }
            keep.push(at);
          }
          for (let i = 0; i < w * h; i++) if (lab[i] && !keep[lab[i]]) m[i] = 0;
          return m;
        };
        const [c1, c2] = [cheek(50), cheek(280)], skin = [0, 1, 2].map(k => (c1[k] + c2[k]) / 2), off = i => Math.hypot(px[i * 4] - skin[0], px[i * 4 + 1] - skin[1], px[i * 4 + 2] - skin[2]);
        let reach = 240, near = 36;
        if (seeds >= w * h * .004) for (let i = 0; i < w * h; i++) sure[i] = a[i] > 100 ? 1 : 0;
        if (seeds < w * h * .004) {
          // up from the top of the face to the first thing that is not skin: the hairline, and the hair just past it
          reach = 700; near = 50; a.fill(0);   // a drawn head of hair, lit on one side: its shades further apart
          for (const along of [0, -.2, .2]) {
            const col = Math.round(P(10).x + along * bw);
            for (let y = Math.round(P(10).y); y > Math.max(5, P(10).y - bh * .4); y--) if (off(y * w + col) > 60) { for (let dy = -9; dy <= -1; dy++) for (let dx = -3; dx <= 3; dx++) a[(y + dy) * w + col + dx] = 255; break; }
          }
        }
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < w * h; i++) if (a[i] > 200) { r += px[i * 4]; g += px[i * 4 + 1]; b += px[i * 4 + 2]; n++; }
        r /= n; g /= n; b /= n;
        // hanging hair darkens into its own shadow beside the jaw: the same colour, less light, still the hair (only where the
        // segmenter gave the colour, and only below the nose, outside the face)
        const sum0 = r + g + b, cr = r / sum0, cg = g / sum0, nose = P(1).y;
        const shade = (/** @type {number} */ j) => { const s = px[j * 4] + px[j * 4 + 1] + px[j * 4 + 2]; return s > 90 && s / sum0 > .35 && s / sum0 < 1.15 && Math.hypot(px[j * 4] / s - cr, px[j * 4 + 1] / s - cg) < .045; };
        // hair grows down to the chin, and past it only at the sides (long hair over the shoulders, never the neck)
        const chin = P(152).y, brow = Math.min(P(105).y, P(334).y), oval = OVAL.map(P), sideL = Math.min(P(234).x, P(454).x), sideR = Math.max(P(234).x, P(454).x);
        const inOval = (x, y) => { let on = false; for (let i = 0, j = oval.length - 1; i < oval.length; j = i++) { const p = oval[i], q = oval[j]; if ((p.y > y) !== (q.y > y) && x < (q.x - p.x) * (y - p.y) / (q.y - p.y) + p.x) on = !on; } return on; };
        // the face itself (eyes, glasses, brows): a little inside its outline, so hair falling over the cheeks' edge stays hair
        const fx = oval.reduce((s, p) => s + p.x, 0) / oval.length, fy = oval.reduce((s, p) => s + p.y, 0) / oval.length;
        const inFace = (/** @type {number} */ x, /** @type {number} */ y, k = .9) => inOval(fx + (x - fx) / k, fy + (y - fy) / k);
        const dist = new Int16Array(w * h).fill(-1), q = new Int32Array(w * h); let head = 0, tail = 0;
        for (let i = 0; i < w * h; i++) if (a[i] > 200) { dist[i] = 0; q[tail++] = i; }
        while (head < tail) {
          const i = q[head++], x = i % w, y = (i / w) | 0; if (dist[i] >= reach) continue;
          for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
            if (j < 0 || dist[j] >= 0) continue;
            const jy = (j / w) | 0, jx = j % w; if (jy > chin && (jy > chin + bh || (jx > sideL && jx < sideR))) continue;
            if (Math.hypot(px[j * 4] - r, px[j * 4 + 1] - g, px[j * 4 + 2] - b) > near && !(reach === 240 && jy > nose && !inFace(jx, jy, .78) && shade(j))) continue;
            dist[j] = dist[i] + 1; a[j] = 255; q[tail++] = j;
          }
        }
        // growth can run along a thin line of the hair's colour (a shelf, the edge of a hedge): what is left once every part
        // thinner than 20 px is worn away is the hair's body, and only what lies near it stays
        // (first closed: hair in shadow grows in lace, and the lace is filled so the wearing away keeps it)
        { const solid = erode(dilate(a.map(v => (v > 64 ? 255 : 0)), 6), 6), body = dilate(home(erode(solid, 10)), 20); for (let i = 0; i < w * h; i++) a[i] = body[i] ? Math.max(a[i], solid[i]) : 0; }
        // skin is cleared, and what is nearly skin: less nearly when the hair itself is nearly the skin's colour (pale grey on pale)
        const skinNear = Math.min(42, Math.hypot(r - skin[0], g - skin[1], b - skin[2]) * .6);
        for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, x1); x++) {
          const i = y * w + x;
          if ((off(i) < skinNear && !sure[i]) || (y > brow && inFace(x, y, y > nose ? .78 : .9))) a[i] = 0;
        }
        // a beard (the chin far darker than the cheeks, not just shaded) is a part of its own, never the hair's colour: the jaw is
        // cleared, a little past its edge
        const lum = (/** @type {number[]} */ c) => .3 * c[0] + .59 * c[1] + .11 * c[2], mid = Math.round((P(17).y + P(152).y) / 2) * w + Math.round(P(152).x), chinC = [0, 0, 0];
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) for (let k = 0; k < 3; k++) chinC[k] += px[(mid + dy * w + dx) * 4 + k] / 81;
        if (lum(chinC) < lum(skin) * .55 && Math.hypot(chinC[0] - skin[0], chinC[1] - skin[1], chinC[2] - skin[2]) > 60) {
          for (let y = Math.max(0, Math.floor(nose)); y < Math.min(h, y1 + bh * .25); y++) for (let x = Math.max(0, Math.floor(x0 - bw * .2)); x < Math.min(w, x1 + bw * .2); x++) if (inFace(x, y, 1.3)) a[y * w + x] = 0;
        }
        let kept = 0; for (let i = 0; i < w * h; i++) if (a[i] > 200) kept++;
        if (kept > w * h * .004 && kept < w * h * .3) {
          const mk = document.createElement('canvas'); mk.width = w; mk.height = h; const mx = mk.getContext('2d'), img = mx.createImageData(w, h);
          for (let i = 0; i < w * h; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = a[i]; }
          mx.putImageData(img, 0, 0); hair = mk;
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
