// The styles' example art: each style's sitters (the invented people in web/examples/) painted in it by GPT Image,
// from the very words the app sends (promptFor in web/js/portrait/styles.js), with each style's own defaults.
//
//   OPENAI_API_KEY=... node tools/styles.mjs [--only princess,clay] [--force] [--model gpt-image-2.6-sunburst] [--quality high]
//
// Writes web/styles/<style>/<sitter>.webp and web/styles/manifest.json (what made them, and when). The key is read
// from the environment only and is never written anywhere.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { STYLES, promptFor, defaultsOf } from '../web/js/portrait/styles.js';

const args = process.argv.slice(2), flag = n => args.includes('--' + n), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const key = process.env.OPENAI_API_KEY;
if (!key) { console.error('Set OPENAI_API_KEY to make the styles\' example art.'); process.exit(2); }
const model = opt('model', 'gpt-image-2.6-sunburst'), quality = opt('quality', 'high'), only = opt('only', '')?.split(',').filter(Boolean);
const lanes = Number(opt('concurrency', 4));
const root = new URL('../web/', import.meta.url), out = new URL('styles/', root), manifestUrl = new URL('manifest.json', out);
const manifest = await readFile(manifestUrl, 'utf8').then(JSON.parse).catch(() => ({ by: 'GPT Image', kind: 'render', styles: {} }));
const exists = u => stat(u).then(() => true, () => false);

const work = [];
for (const s of STYLES) if (!only?.length || only.includes(s.id)) for (const sitter of s.sitters) work.push({ s, sitter });

async function paint({ s, sitter }) {
  const file = new URL(s.id + '/' + sitter + '.webp', out);
  if (!flag('force') && await exists(file)) return 'kept';
  const prompt = promptFor(s, defaultsOf(s));
  const photo = await readFile(new URL('examples/' + sitter + '/portrait.webp', root));
  for (let attempt = 0; ; attempt++) {
    const form = new FormData();
    form.append('model', model); form.append('prompt', prompt); form.append('size', '1024x1536'); form.append('quality', quality);
    form.append('output_format', 'webp'); form.append('output_compression', '82');
    form.append('image[]', new Blob([photo], { type: 'image/webp' }), sitter + '.webp');
    const started = Date.now();
    const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.data?.[0]?.b64_json) {
      await mkdir(new URL(s.id + '/', out), { recursive: true });
      await writeFile(file, Buffer.from(body.data[0].b64_json, 'base64'));
      (manifest.styles[s.id] ||= {})[sitter] = { image: s.id + '/' + sitter + '.webp', model, quality, made: new Date().toISOString().slice(0, 10), prompt };
      await writeFile(manifestUrl, JSON.stringify(manifest, null, 1) + '\n');
      return 'made in ' + Math.round((Date.now() - started) / 1000) + ' s';
    }
    const why = body.error?.message || res.status;
    if (attempt >= 3 || (res.status < 500 && res.status !== 429)) return 'failed: ' + why;
    await new Promise(r => setTimeout(r, 4000 * (attempt + 1)));
  }
}

let next = 0;
await Promise.all(Array.from({ length: lanes }, async () => {
  while (next < work.length) { const w = work[next++]; console.log(w.s.id + '/' + w.sitter + ': ' + await paint(w).catch(e => 'failed: ' + e.message)); }
}));
console.log('done');
