/**
 * The tour: Likeness used end to end as someone new to it would, in Chrome at a phone's size, filmed scene by scene into
 * storyboards (a sheet of frames for each scene, and one sheet of them all), with what each moment says it is and how
 * long the waits took. It is how the whole product is judged at a glance: on the workstation, with the studio's own
 * pictures, and anywhere else with whatever edition is running.
 *
 *   npm run tour -- [--url http://127.0.0.1:8787] [--out relay/0004-lookbook/out/tour] [--only ring,words,...]
 *
 * The app must already be running at --url (uv run likeness serve, or npm run serve for the showcase). Scenes, in
 * order: ring, words, mirror, tryon, show, you, live, sides, desk. Every camera in the tour is Chrome's fake one,
 * playing a drawn sitter, and every photo of "you" is a drawn sitter: the tour never sees a real face, the person
 * running it included.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCENES = ['ring', 'words', 'mirror', 'tryon', 'show', 'you', 'live', 'sides', 'desk'];
const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const URL_ = arg('url', 'http://127.0.0.1:8787').replace(/\/$/, '');
const OUT = resolve(ROOT, arg('out', 'relay/0004-lookbook/out/tour'));
const ONLY = arg('only', '').split(',').map(s => s.trim()).filter(Boolean);
const SITTER = join(ROOT, 'tests/fixtures/sitters/kofi.jpg');
const camera = (file) => ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=' + join(ROOT, 'tests/fixtures/camera', file)];
const PHONE = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['camera'], acceptDownloads: true };
const channel = process.env.LIKENESS_BROWSER_CHANNEL || 'chrome';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const secs = (ms) => (ms / 1000).toFixed(1) + ' s';

mkdirSync(OUT, { recursive: true });
/** @type {{ scene: string, title: string, frames: { jpg: Buffer, caption: string }[], notes: string[], failed?: string }[]} */
const done = [];

/** A scene: its frames and what was noticed, kept whatever happens in it. */
async function scene(id, title, page, run) {
  if (ONLY.length && !ONLY.includes(id)) return;
  const s = { scene: id, title, frames: [], notes: [] };
  done.push(s);
  const t0 = Date.now();
  const shot = async (caption) => {
    // what the picture in front says it is: the mirror's or the live mirror's stamp, else the ring's front card
    const said = await page.evaluate(() => {
      const seen = (/** @type {Element} */ el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      for (const sel of ['section.mr .mr-stamp', 'section.lv .mr-stamp', 'section.book:not(.is-away) .lb-card.is-front .lb-card__tag']) {
        const el = [...document.querySelectorAll(sel)].reverse().find(seen);
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      return '';
    }).catch(() => '');
    s.frames.push({ jpg: await page.screenshot({ type: 'jpeg', quality: 82 }), caption: secs(Date.now() - t0) + ' · ' + caption + (said ? '\n[' + said + ']' : '') });
  };
  try { await run({ page, shot, note: (t) => s.notes.push(t) }); }
  catch (e) { s.failed = String(e?.message || e).split('\n')[0]; await shot('stopped here: ' + s.failed).catch(() => {}); }
  console.log((s.failed ? '✗ ' : '✓ ') + id + ' · ' + s.frames.length + ' frames' + (s.failed ? ' · ' + s.failed : ''));
}

/** From the Lookbook, a photo of "you" (a drawn sitter) into the mirror, through the live mirror's picture button. */
async function bring(page) {
  const chooser = page.waitForEvent('filechooser', { timeout: 30000 });
  await page.locator('.lb-ask__photo').click();
  const live = page.locator('section.lv');
  if (await Promise.race([chooser.then(() => false), live.waitFor({ timeout: 15000 }).then(() => true, () => false)])) await live.locator('.lv-gallery').click();
  await (await chooser).setFiles(SITTER);
  await page.locator('section.mr').waitFor({ timeout: 30000 });
}
/** Waits for a turn in the mirror, a frame every few seconds with what the frame says meanwhile. */
async function waitTurn(page, shot, landed, limit = 240000) {
  const t0 = Date.now();
  while (Date.now() - t0 < limit) {
    if (await landed()) return Date.now() - t0;
    const words = await page.locator('.mr-words').innerText().catch(() => '');
    await shot('waiting ' + secs(Date.now() - t0) + (words ? ' · ' + words.replace(/\s+/g, ' ').trim() : ''));
    await sleep(3000);
  }
  throw new Error('nothing came back in ' + secs(limit));
}

const browser = await chromium.launch({ channel, args: camera('kofi.mjpeg') });
const version = browser.version();
const ctx = await browser.newContext(PHONE);
const page = await ctx.newPage();
await page.goto(URL_ + '/');
const edition = (await page.locator('.lb-bar__edition').textContent({ timeout: 30000 }).catch(() => '')) || '?';

await scene('ring', 'First sight: the Lookbook', page, async ({ shot, note }) => {
  await shot('it opens');
  for (const ms of [1800, 2400, 3000]) { await sleep(ms); await shot('left alone'); }
  note(await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.lb-card')];
    return cards.length + ' cards: ' + [...new Set(cards.map(c => [...c.classList].find(k => k.startsWith('lb-card--'))?.slice(9)))].join(', ') + '; ' + document.querySelectorAll('.lb-card.has-face').length + ' framed on a face read here';
  }));
});
await scene('words', 'Words: a look described, drawn as it is said', page, async ({ shot }) => {
  const input = page.locator('.lb-ask__input');
  await input.fill('curtain bangs, a lot longer, parted left'); await sleep(900); await shot('typed: curtain bangs, a lot longer, parted left');
  await sleep(2000); await shot('drawn as said: ' + (await page.locator('.lb-caption__shape').textContent().catch(() => '') || ''));
  await input.fill('copper, a shade deeper'); await sleep(2600); await shot('typed: copper, a shade deeper');
  await input.fill(''); await page.locator('.lb-orbit').click({ position: { x: 4, y: 4 } }).catch(() => {}); await sleep(1400); await shot('the words gone');
});
await scene('mirror', 'The mirror, on a face from the ring', page, async ({ shot }) => {
  await page.locator('.lb-card.is-front').click();
  await page.locator('section.mr').waitFor({ timeout: 20000 });
  await sleep(1500); await shot('it opens'); await sleep(2200); await shot('a moment later');
  const box = await page.locator('section.mr .mr-frame').boundingBox();
  if (box) {
    const y = box.y + box.height * .45; await page.mouse.move(box.x + box.width * .4, y); await page.mouse.down();
    for (let k = 1; k <= 10; k++) { await page.mouse.move(box.x + box.width * (.4 + k * .035), y); await sleep(45); }
    await shot('dragged sideways: it turns'); await page.mouse.up(); await sleep(1000); await shot('let go');
  }
  await page.locator('section.mr .mr-bar__back').click(); await sleep(900);
});
let tookTry = 0, tookAngles = 0;
await scene('tryon', 'On me: a photo, a look shaped, Try on, the wait, the takes, every angle', page, async ({ shot, note }) => {
  await bring(page);
  const mirror = page.locator('section.mr');
  await mirror.locator('.mr-note').nth(6).waitFor({ timeout: 40000 }); await sleep(800); await shot('the face read on the device');
  await mirror.locator('.mr-note[data-part="brows"]').click(); await mirror.locator('.mr-style[data-style="bold"]').click(); await sleep(1400); await shot('bold brows, sketched');
  await mirror.locator('.mr-ask__go').click();
  const landed = () => mirror.locator('.mr-take:not(.is-origin):not(.is-pending)').count().then(n => n >= 4);
  tookTry = await waitTurn(page, shot, landed);
  note('Try on (4 takes): ' + secs(tookTry));
  await sleep(1200); await shot('four takes');
  for (const k of [2, 3]) { await mirror.locator('.mr-take').nth(k).click(); await sleep(900); await shot('take ' + k); }
  await mirror.locator('.mr-keep').click(); await sleep(500);
  await mirror.locator('.mr-turn').click();
  tookAngles = await waitTurn(page, shot, () => mirror.evaluate(el => el.classList.contains('is-turning')));
  note('Every angle (3 more): ' + secs(tookAngles));
  for (let k = 0; k < 3; k++) { await sleep(900); await shot('every angle, turning'); }
});
await scene('show', 'Show it, and the card', page, async ({ shot, note }) => {
  const mirror = page.locator('section.mr');
  await mirror.locator('.mr-bar__show').click(); await sleep(1600); await shot('shown');
  const download = page.waitForEvent('download', { timeout: 30000 });
  await mirror.locator('.mr-show__save').click();
  const card = join(OUT, 'card.png'); await (await download).saveAs(card); note('the card: card.png');
  await sleep(800); await shot('the card saved'); await page.keyboard.press('Escape'); await sleep(700);
});
await scene('you', 'The ring becomes you', page, async ({ shot }) => {
  await page.locator('section.mr .mr-bar__back').click(); await sleep(3200); await shot('back at the ring');
  const them = page.locator('.lb-whose button[data-who="them"]'), you = page.locator('.lb-whose button[data-who="you"]');
  if (await you.isVisible().catch(() => false)) { await you.click(); await sleep(2600); await shot('You'); await them.click(); await sleep(2200); await shot('Them'); }
});
await scene('live', 'The live mirror (the camera plays a drawn sitter)', page, async ({ shot, note }) => {
  await page.goto(URL_ + '/'); await sleep(800);
  await page.locator('.lb-ask__photo').click();
  const live = page.locator('section.lv');
  await live.waitFor({ timeout: 20000 });
  await page.waitForSelector('section.lv.has-face', { timeout: 40000 }); await sleep(1200); await shot('the look on the face, live');
  note('live mirror: reader ' + (await live.getAttribute('data-reader')) + ', a face read in ' + (await live.getAttribute('data-read')) + ' ms');
  await live.locator('.lv-parts .mr-part[data-part="lips"]').click(); await sleep(1600); await shot('every style of the lips, at once');
  await live.locator('.lv-tile').nth(1).click(); await sleep(1300); await shot('one worn');
  await live.locator('.lv-shutter').click(); await page.locator('section.mr').waitFor({ timeout: 20000 }); await sleep(1500); await shot('the shutter: into the mirror');
});
await browser.close();

if (!ONLY.length || ONLY.includes('sides')) {
  const b2 = await chromium.launch({ channel, args: camera('kofi-turn.mjpeg') });
  const p2 = await (await b2.newContext(PHONE)).newPage();
  await p2.goto(URL_ + '/');
  await scene('sides', 'Every side of you (the camera plays a drawn sitter turning their head)', p2, async ({ shot }) => {
    await p2.locator('.lb-ask__photo').click();
    await p2.waitForSelector('section.lv.has-face', { timeout: 40000 }); await sleep(800);
    await p2.locator('section.lv .lv-turns').click();
    const t0 = Date.now();
    while (Date.now() - t0 < 40000 && !(await p2.locator('section.mr').isVisible().catch(() => false))) { await shot('turning: ' + (await p2.locator('.lv-level__mark.is-caught').count()) + ' of 3 caught'); await sleep(900); }
    for (let k = 0; k < 4; k++) { await sleep(800); await shot('the mirror turns through them'); }
  });
  await b2.close();
}

if (!ONLY.length || ONLY.includes('desk')) {
  const b3 = await chromium.launch({ channel, args: camera('kofi.mjpeg') });
  const p3 = await (await b3.newContext(PHONE)).newPage();
  await scene('desk', 'The desk: a picture from words', p3, async ({ shot, note }) => {
    await p3.goto(URL_ + '/?desk'); await p3.locator('.desk__bar .edition').waitFor({ timeout: 30000 }); await sleep(800); await shot('the desk');
    const before = await p3.locator('figure.print').count();
    await p3.locator('.composer textarea, textarea').first().fill('A lighthouse inside a teacup, at dusk'); await p3.locator('button.send').click();
    const t0 = Date.now();
    while (Date.now() - t0 < 240000 && (await p3.locator('figure.print .print__stamp').count()) <= before) { await shot('working ' + secs(Date.now() - t0)); await sleep(3000); }
    note('a picture from words: ' + secs(Date.now() - t0));
    await sleep(2500); await shot('it arrives');
  });
  await b3.close();
}

// —— the storyboards: a sheet for each scene, one of them all, and an index ——
const b4 = await chromium.launch({ channel });
const sheet = await (await b4.newContext({ viewport: { width: 2300, height: 900 } })).newPage();
const css = '<style>body{margin:0;padding:28px;background:#141110;color:#f3e9dc;font:13px/1.35 system-ui,sans-serif}h1{font:600 24px Georgia,serif;margin:0 0 4px}p.s{margin:0 0 18px;opacity:.7}.g{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;width:360px}img{width:360px;height:640px;display:block;border-radius:12px}figcaption{margin-top:6px;white-space:pre-wrap;opacity:.88}</style>';
const fig = (f) => '<figure><img src="data:image/jpeg;base64,' + f.jpg.toString('base64') + '"><figcaption>' + f.caption.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</figcaption></figure>';
const rows = [];
for (const [i, s] of done.entries()) {
  const name = String(i + 1).padStart(2, '0') + '-' + s.scene + '.jpg';
  await sheet.setContent(css + '<h1>' + s.title + '</h1><p class="s">' + [edition, ...s.notes, s.failed ? 'STOPPED: ' + s.failed : ''].filter(Boolean).join(' · ') + '</p><div class="g">' + s.frames.map(fig).join('') + '</div>');
  await sheet.screenshot({ path: join(OUT, name), fullPage: true, type: 'jpeg', quality: 84 });
  rows.push('| ' + s.title + ' | ' + name + ' | ' + s.frames.length + ' | ' + ([...s.notes, s.failed ? '**stopped:** ' + s.failed : ''].filter(Boolean).join('; ') || ' ') + ' |');
}
const pick = done.flatMap(s => (s.frames.length > 2 ? [s.frames[1], s.frames[s.frames.length - 1]] : s.frames).map(f => ({ ...f, caption: s.scene + ' · ' + f.caption })));
await sheet.setContent(css + '<h1>Likeness, end to end</h1><p class="s">' + edition + ' · ' + URL_ + ' · Chrome ' + version + '</p><div class="g">' + pick.map(fig).join('') + '</div>');
await sheet.screenshot({ path: join(OUT, '00-tour.jpg'), fullPage: true, type: 'jpeg', quality: 84 });
await b4.close();
writeFileSync(join(OUT, 'tour.md'), ['# The tour', '', 'Edition: **' + edition + '** at ' + URL_ + ', Chrome ' + version + ', ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + '.', '',
  'The whole of it on one sheet: 00-tour.jpg. Every camera was the fake one playing a drawn sitter, and every photo of "you" a drawn sitter.', '',
  '| Scene | Sheet | Frames | Noticed |', '|---|---|---|---|', ...rows, ''].join('\n'));
console.log('The tour: ' + join(OUT, '00-tour.jpg') + ' (and a sheet per scene, tour.md)');
