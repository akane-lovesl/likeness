/**
 * The tour: Likeness used end to end as someone new to it would, in Chrome at a phone's size, filmed scene by scene into
 * storyboards (a sheet of frames for each scene, and one sheet of them all), with what each moment says it is and how
 * long the waits took. It is how the whole product is judged at a glance: on the workstation, with the studio's own
 * pictures, and anywhere else with whatever edition is running.
 *
 *   npm run tour -- [--url http://127.0.0.1:8787] [--out relay/0004-lookbook/out/tour] [--only ring,words,...]
 *
 * The app must already be running at --url (uv run likeness serve, or npm run serve for the showcase). Scenes, in
 * order: welcome, ring, words, mix, mirror, fit, weeks, tryon, show, marks, you, rooms, live, sides, desk.
 * The sample portrait and Chrome's simulated camera use the catalog's fictional people.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCENES = ['welcome', 'ring', 'words', 'mix', 'mirror', 'fit', 'weeks', 'tryon', 'show', 'marks', 'you', 'rooms', 'live', 'sides', 'desk'];
const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const URL_ = arg('url', 'http://127.0.0.1:8787').replace(/\/$/, '');
const OUT = resolve(ROOT, arg('out', 'relay/0004-lookbook/out/tour'));
const ONLY = arg('only', '').split(',').map(s => s.trim()).filter(Boolean);
const SITTER = join(ROOT, 'web/examples/priya/portrait.webp');
const REFERENCE = join(ROOT, 'web/examples/sofia/bangs-curtain.webp');
const camera = (file) => ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=' + join(OUT, file)];
const PHONE = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['camera'], acceptDownloads: true };
const channel = process.env.LIKENESS_BROWSER_CHANNEL || 'chrome';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const secs = (ms) => (ms / 1000).toFixed(1) + ' s';

mkdirSync(OUT, { recursive: true });

/** Make Chrome's local camera reel from one fictional person in the catalog, in three poses. */
async function cameraReel() {
  const photo = path => 'data:image/webp;base64,' + readFileSync(join(ROOT, 'web/examples/priya', path)).toString('base64');
  const prep = await chromium.launch({ channel });
  try {
    const page = await prep.newPage();
    const [front, right, left] = (await page.evaluate(async sources => {
      const canvas = document.createElement('canvas');
      canvas.width = 384; canvas.height = 512;
      const ctx = canvas.getContext('2d');
      return Promise.all(sources.map(async (src, pose) => {
        const img = new Image(); img.src = src; await img.decode();
        return Array.from({ length: pose ? 1 : 18 }, (_, i) => {
          const dx = 3 * Math.sin(i * Math.PI / 9), dy = 2 * Math.sin(i * Math.PI / 9);
          ctx.drawImage(img, -5 + dx, -6 + dy, 394, 524);
          return canvas.toDataURL('image/jpeg', .82).split(',')[1];
        });
      }));
    }, [photo('bangs-blunt.webp'), photo('bangs-blunt-right.webp'), photo('bangs-blunt-left.webp')])).map(frames => frames.map(f => Buffer.from(f, 'base64')));
    const repeat = (frames, seconds) => Array.from({ length: seconds * 30 }, (_, i) => frames[Math.floor(i / 3) % frames.length]);
    writeFileSync(join(OUT, 'camera.mjpeg'), Buffer.concat(repeat(front, 3)));
    writeFileSync(join(OUT, 'camera-turn.mjpeg'), Buffer.concat([...repeat(front, 4), ...repeat(right, 2), ...repeat(front, 2), ...repeat(left, 2)]));
  } finally { await prep.close(); }
}

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

/** From the Lookbook, the sample portrait into the mirror through the live mirror's picture button. */
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
    const words = await page.locator('.mr-words').evaluateAll(els => els[0]?.textContent || '');
    await shot('waiting ' + secs(Date.now() - t0) + (words ? ' · ' + words.replace(/\s+/g, ' ').trim() : ''));
    await sleep(4500);
  }
  throw new Error('nothing came back in ' + secs(limit));
}

await cameraReel();
const browser = await chromium.launch({ channel, args: camera('camera.mjpeg') });
const version = browser.version();
const ctx = await browser.newContext(PHONE);
const page = await ctx.newPage();
// the first time, as someone new: the welcome is asked for (a browser driven by a script is otherwise spared it)
await page.goto(URL_ + (!ONLY.length || ONLY.includes('welcome') ? '/?welcome' : '/'));
const edition = (await page.locator('.lb-bar__edition').textContent({ timeout: 30000 }).catch(() => '')) || '?';

await scene('welcome', 'The first time: a sitting on a fictional portrait, the light under a finger, then the Lookbook', page, async ({ shot }) => {
  const sit = page.locator('.wl-sit');
  if (!(await sit.waitFor({ timeout: 15000 }).then(() => true, () => false))) {
    // without the studio's people: a line and three steps
    await page.locator('.wl-title').waitFor({ timeout: 5000 }); await sleep(1200); await shot('the welcome, without the studio\'s people');
    await page.locator('.wl-title .wl-go').click(); await sleep(900); return;
  }
  await sleep(700); await shot('a face, as they are');
  await sleep(2700); await shot('a look sweeping in');
  await page.locator('.wl-look').nth(1).click(); await sleep(800); await shot('another look, touched: it sweeps in');
  await sleep(1400); await shot('there, whole');
  const hb = await page.locator('.wl-sit__hero').boundingBox();
  if (hb) {
    await page.mouse.move(hb.x + hb.width * .85, hb.y + hb.height * .4); await page.mouse.down();
    await page.mouse.move(hb.x + hb.width * .45, hb.y + hb.height * .42, { steps: 8 }); await sleep(250); await shot('the light under a finger: after, before');
    await page.mouse.up(); await sleep(1000);
  }
  await page.locator('.wl-sit__next').click(); await sleep(3600); await shot('someone else');
  await page.locator('.wl-sit__around').click(); await sleep(2400); await shot('Look around: the Lookbook, that face in front');
});
await page.evaluate(() => document.querySelector('.wl')?.remove()).catch(() => {});

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
await scene('mix', 'A look mixed from several parts, worn by every face at once (painted on the portraits)', page, async ({ shot }) => {
  const book = page.locator('section.book');
  await book.locator('.lb-part[data-part="bangs"]').click(); await sleep(700);
  await book.locator('.lb-style[data-style="curtain"]').click(); await sleep(1800); await shot('curtain bangs, on every face');
  await book.locator('.lb-part[data-part="lips"]').click(); await sleep(700);
  await book.locator('.lb-style[data-style="red"]').click(); await sleep(2200); await shot('and a red lip: both, on every face');
  const ring = await book.locator('.lb-orbit').boundingBox();
  if (ring) { await page.mouse.move(ring.x + ring.width * .75, ring.y + ring.height * .5); await page.mouse.down(); await page.mouse.move(ring.x + ring.width * .3, ring.y + ring.height * .5, { steps: 8 }); await page.mouse.up(); await sleep(1600); await shot('turned: the next face wears it too'); }
  await book.locator('.lb-card.is-front').click(); await page.locator('section.mr').waitFor({ timeout: 20000 }); await sleep(2400); await shot('opened: the mirror wears the whole look');
  await page.locator('section.mr .mr-bar__back').click(); await sleep(900);
  // put back as it was, for the scenes after
  while (await book.locator('.lb-token').count()) { await book.locator('.lb-token').first().click(); await sleep(300); }
  const open = book.locator('.lb-part[aria-pressed="true"]'); if (await open.count()) await open.click();
  await sleep(800);
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
await scene('fit', 'Fit it: one, or two? The look fitted to the face by eye, the way lenses are', page, async ({ shot, note }) => {
  const book = page.locator('section.book'), mirror = page.locator('section.mr');
  for (const [part, style] of [['bangs', 'curtain'], ['colour', 'copper']]) { await book.locator('.lb-part[data-part="' + part + '"]').click(); await sleep(600); await book.locator('.lb-style[data-style="' + style + '"]').click(); await sleep(700); }
  await book.locator('.lb-card.is-front').click(); await mirror.waitFor({ timeout: 20000 });
  await mirror.locator('.mr-fit').waitFor({ timeout: 40000 }); await sleep(1500); await shot('the look, and Fit it');
  await mirror.locator('.mr-fit').click();
  const cap = () => mirror.locator('.mr-trialcap').textContent().catch(() => '');
  // where the fitting is: a question ready (its two made, one lit), fitted, or over
  const state = () => page.waitForFunction(() => {
    const m = document.querySelector('section.mr'); if (!m?.classList.contains('is-trial')) return 'out';
    if (/^(Fitted|It fitted)/.test(document.querySelector('.mr-trialcap')?.textContent || '')) return 'fitted';
    return !m.classList.contains('is-trial-making') && document.querySelector('.mr-trial__lens.is-lit') && !document.querySelector('.is-chosen') ? 'ready' : false;
  }, null, { timeout: 30000 }).then(h => h.jsonValue());
  const asked = [];
  for (const [k, a] of ['2', '1', 'e', '1', '2', '1', '2', '1', '2', '1'].entries()) {
    const now = await state(); if (now !== 'ready') break;
    const q = await mirror.locator('.mr-trial__what').textContent(), labels = await mirror.locator('.mr-trial__lens').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')));
    if (k < 2) { await sleep(250); await shot(q + ', ' + labels[0]); await sleep(1500); await shot(q + ', ' + labels[1]); }
    if (a === 'e') await mirror.locator('.mr-trial__either').click(); else await mirror.locator('.mr-trial__lens[data-k="' + (Number(a) - 1) + '"]').click();
    await sleep(450); const said = await cap(); asked.push(q + ': ' + said);
    if (k < 3) await shot(said);
  }
  note('asked: ' + asked.join(' / '));
  if ((await state()) === 'fitted') { await sleep(500); await shot(await cap()); }
  await page.waitForFunction(() => !document.querySelector('section.mr')?.classList.contains('is-trial'), null, { timeout: 20000 });
  await sleep(1000); await shot('fitted: ' + (await mirror.locator('.mr-token').allTextContents()).join(', '));
  await mirror.locator('.mr-bar__back').click(); await sleep(900);
  // put back as it was, for the scenes after
  while (await book.locator('.lb-token').count()) { await book.locator('.lb-token').first().click(); await sleep(300); }
  const open = book.locator('.lb-part[aria-pressed="true"]'); if (await open.count()) await open.click();
  await sleep(800);
});
await scene('weeks', 'Weeks on: the look in the weeks after the salon, its upkeep marked', page, async ({ shot, note }) => {
  const book = page.locator('section.book'), mirror = page.locator('section.mr');
  for (const [part, style] of [['bangs', 'blunt'], ['colour', 'platinum']]) { await book.locator('.lb-part[data-part="' + part + '"]').click(); await sleep(600); await book.locator('.lb-style[data-style="' + style + '"]').click(); await sleep(700); }
  await book.locator('.lb-card.is-front').click(); await mirror.waitFor({ timeout: 20000 });
  await mirror.locator('.mr-when').waitFor({ timeout: 40000 }); await sleep(1500); await shot('the look today, and Grow out');
  await mirror.locator('.mr-when').click(); await sleep(700); await shot('looking ahead');
  const said = () => mirror.locator('.mr-cap__say').textContent().catch(() => '');
  await sleep(2200); await shot('the weeks walk on to the first trim: ' + await said());
  for (const w of [6, 12]) { await mirror.locator('.mr-time__range').fill(String(w)); await sleep(1800); await shot(w + ' weeks: ' + await said()); }
  note('upkeep marked: ' + (await mirror.locator('.mr-time__mark').allTextContents()).join(', '));
  if (edition.includes('Workstation')) {
    await mirror.locator('.mr-time__range').fill('6'); await sleep(1000);
    await shot('six weeks, painted on this device');
    await mirror.locator('.mr-ask__go').click();
    const aged = mirror.locator('.mr-take[data-weeks="6"]');
    await aged.first().waitFor({ timeout: 20000 });
    const elapsed = await waitTurn(page, shot, () => mirror.locator('.mr-take.is-pending').count().then(n => n === 0), 615000);
    note('six weeks: ' + await aged.count() + ' studio takes in ' + secs(elapsed));
    await sleep(1500); await shot('six weeks, back from the studio');
  } else {
    await mirror.locator('.mr-time__done').click(); await sleep(1000); await shot('Done: today again');
  }
  await mirror.locator('.mr-bar__back').click(); await sleep(900);
  // put back as it was, for the scenes after
  while (await book.locator('.lb-token').count()) { await book.locator('.lb-token').first().click(); await sleep(300); }
  const open = book.locator('.lb-part[aria-pressed="true"]'); if (await open.count()) await open.click();
  await sleep(800);
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
await scene('marks', 'Drawn on, a reference, and two looks at once', page, async ({ shot, note }) => {
  const mirror = page.locator('section.mr');
  if (await mirror.isVisible()) await mirror.locator('.mr-bar__back').click();
  await bring(page);
  await mirror.locator('.mr-note').first().waitFor({ timeout: 40000 });
  await mirror.locator('.mr-ask__add').click(); await sleep(700); await shot('+ : draw on it, or a reference');
  await mirror.locator('.mr-tray__do[data-do="draw"]').click(); await sleep(600);
  const box = await mirror.locator('.mr-frame').boundingBox();
  const jaw = await mirror.locator('.mr-lines circle[data-part="beard"]').boundingBox();
  if (box) {
    const cx = box.x + box.width * .5, cy = jaw ? jaw.y + jaw.height / 2 + 4 : box.y + box.height * .53, r = box.width * .14;
    await page.mouse.move(cx + r, cy); await page.mouse.down();
    for (let k = 1; k <= 22; k++) { await page.mouse.move(cx + r * Math.cos(k / 20 * 2 * Math.PI), cy + r * .75 * Math.sin(k / 20 * 2 * Math.PI)); await sleep(16); }
    await page.mouse.up(); await sleep(500); await shot('a ring drawn round the jaw');
  }
  await mirror.locator('.mr-drawbar__done').click(); await sleep(500);
  const chooser = page.waitForEvent('filechooser', { timeout: 15000 });
  await mirror.locator('.mr-ask__add').click(); await sleep(300); await mirror.locator('.mr-tray__do[data-do="ref"]').click();
  await (await chooser).setFiles(REFERENCE);
  await mirror.locator('.mr-token--ref').waitFor({ timeout: 15000 });
  await mirror.locator('.mr-ask__input').fill('Her curtain fringe, and soften the jaw only inside the circle'); await sleep(700); await shot('marks, a reference, and words');
  const before = await mirror.locator('.mr-take:not(.is-origin):not(.is-pending)').count();
  const started = Date.now();
  await mirror.locator('.mr-ask__go').click(); await sleep(1500);
  // a second look, asked while the first is being made
  await mirror.locator('.mr-token--marks').click();
  await mirror.locator('.mr-token--ref').click();
  await mirror.locator('.mr-ask__input').fill('');
  await mirror.locator('.mr-part[data-part="lips"]').click(); await sleep(400); await mirror.locator('.mr-style[data-style="red"]').click(); await sleep(400);
  await mirror.locator('.mr-ask__go').click(); await sleep(1600); await shot('a second look, asked while the first is made');
  const pill = mirror.locator('.act');
  if (await pill.isVisible().catch(() => false)) { await pill.click(); await sleep(1100); await shot('In the studio: each, and how far it has got'); await page.keyboard.press('Escape'); await sleep(600); }
  await waitTurn(page, shot, () => mirror.locator('.mr-take.is-pending').count().then(n => n === 0), 615000);
  const arrived = await mirror.locator('.mr-take:not(.is-origin):not(.is-pending)').count() - before;
  note('two looks at once: ' + secs(Date.now() - started) + ' for ' + arrived + ' takes');
  await sleep(1200); await shot(arrived + ' takes in the mirror');
  if (arrived) {
    await mirror.locator('.mr-take:not(.is-origin)').first().click(); await sleep(1200); await shot('the reference take');
    await mirror.locator('.mr-take.is-origin').click(); await sleep(1100); await shot('back to the source portrait');
  }
});
await scene('you', 'The ring becomes you', page, async ({ shot }) => {
  await page.locator('section.mr .mr-bar__back').click(); await sleep(3200); await shot('back at the ring');
  const them = page.locator('.lb-whose button[data-who="them"]'), you = page.locator('.lb-whose button[data-who="you"]');
  if (await you.isVisible().catch(() => false)) { await you.click(); await sleep(2600); await shot('You'); await them.click(); await sleep(2200); await shot('Them'); }
});
await scene('rooms', 'Rooms: the whole app dressed, the Lookbook and the mirror too', page, async ({ shot }) => {
  const to = async (id) => { await page.locator('.lb-bar__room').click(); await sleep(900); await page.locator('.sheet .postcard[data-room="' + id + '"]').click(); await sleep(1900); };
  await page.locator('.lb-bar__room').click(); await sleep(1000); await shot('the rooms, from the Lookbook'); await page.keyboard.press('Escape'); await sleep(500);
  await to('princess'); await shot('Little Princess');
  await page.locator('.lb-card.is-front').click(); await page.locator('section.mr').waitFor({ timeout: 20000 }); await sleep(2400); await shot('the mirror, in the room');
  await page.locator('section.mr .mr-bar__back').click(); await sleep(900);
  await to('arcade'); await shot('Night Arcade');
  await to('salon'); await shot('back in the Salon');
});
await scene('live', 'The live mirror, painted as the sample portrait moves', page, async ({ shot, note }) => {
  await page.goto(URL_ + '/'); await sleep(800);
  await page.locator('.lb-ask__photo').click();
  const live = page.locator('section.lv');
  await live.waitFor({ timeout: 20000 });
  await page.waitForSelector('section.lv.has-face', { timeout: 40000 }); await sleep(1200); await shot('the look on the face, live');
  note('live mirror: reader ' + (await live.getAttribute('data-reader')) + ', a face read in ' + (await live.getAttribute('data-read')) + ' ms');
  await live.locator('.lv-parts .mr-part[data-part="bangs"]').click();
  await live.locator('.lv-tile[data-style="curtain"]').click(); await sleep(1100); await shot('a curtain fringe on the moving face');
  note('live painting: ' + ((await live.getAttribute('data-paint')) || 'no sample') + ' ms');
  await live.locator('.lv-parts .mr-part[data-part="lips"]').click(); await sleep(1600); await shot('every style of the lips, at once');
  await live.locator('.lv-tile').nth(1).click(); await sleep(1300); await shot('one worn');
  await live.locator('.lv-shutter').click(); await page.locator('section.mr').waitFor({ timeout: 20000 }); await sleep(1500); await shot('the shutter: into the mirror');
});
await browser.close();

if (!ONLY.length || ONLY.includes('sides')) {
  const b2 = await chromium.launch({ channel, args: camera('camera-turn.mjpeg') });
  const p2 = await (await b2.newContext(PHONE)).newPage();
  await p2.goto(URL_ + '/');
  await scene('sides', 'Every side of you, with the sample portrait in three poses', p2, async ({ shot }) => {
    await p2.locator('.lb-ask__photo').click();
    await p2.waitForSelector('section.lv.has-face', { timeout: 40000 }); await sleep(800);
    await p2.locator('section.lv .lv-turns').click();
    const t0 = Date.now();
    while (Date.now() - t0 < 40000 && !(await p2.locator('section.mr').isVisible().catch(() => false))) { await shot('turning: ' + (await p2.locator('.lv-level__mark.is-caught').count()) + ' of 3 caught'); await sleep(900); }
    await p2.locator('section.mr').waitFor({ state: 'visible', timeout: 2000 });
    for (let k = 0; k < 4; k++) { await sleep(800); await shot('the mirror turns through them'); }
  });
  await b2.close();
}

if (!ONLY.length || ONLY.includes('desk')) {
  const b3 = await chromium.launch({ channel });
  const p3 = await (await b3.newContext(PHONE)).newPage();
  await scene('desk', 'A picture from words: the same line, the desk paints it', p3, async ({ shot, note }) => {
    // the Lookbook's line takes anything: words that are no look say they will be painted, and go to the desk
    await p3.goto(URL_ + '/'); await p3.locator('section.book .lb-ask__input').waitFor({ timeout: 30000 }); await sleep(800);
    const wl = p3.locator('.wl'); if (await wl.count()) { await p3.keyboard.press('Escape'); await sleep(700); }
    const before = await p3.locator('figure.print').count();
    await p3.locator('section.book .lb-ask__input').fill('A lighthouse inside a teacup, at dusk'); await sleep(700); await shot('words that are no look: "Paint it"');
    await p3.locator('section.book .lb-ask__go').click();
    const elapsed = await waitTurn(p3, shot, () => p3.locator('figure.print .print__stamp').count().then(n => n > before));
    note('a picture from words: ' + secs(elapsed));
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
  'The whole of it on one sheet: 00-tour.jpg. The portraits and the simulated camera are from the fictional catalog.', '',
  '| Scene | Sheet | Frames | Noticed |', '|---|---|---|---|', ...rows, ''].join('\n'));
console.log('The tour: ' + join(OUT, '00-tour.jpg') + ' (and a sheet per scene, tour.md)');
if (done.some(s => s.failed)) process.exitCode = 1;
