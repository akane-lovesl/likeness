/** The Lookbook's way in: a look mixed from many parts, the rooms a touch away, and a welcome the first time. */
import { test, expect } from '@playwright/test';
import { mirrorOn } from '../kit.mjs';

const room = (page) => page.evaluate(() => document.documentElement.dataset.room);

test('a look mixed from many parts: each pick goes on with the others, on every face in the ring, and opens in the mirror whole', async ({ page }) => {
  await page.goto('/');
  const book = page.locator('section.book'), hint = book.locator('.lb-hint');
  await expect(hint).toHaveText('Mix a look: pick from as many parts as you like');
  await book.locator('.lb-part[data-part="bangs"]').click();
  await expect(hint).toHaveText('Touch a style to put it on');
  await book.locator('.lb-style[data-style="curtain"]').click();
  await expect(hint).toHaveText('Add another part: they all go on together');
  // another part: its styles come up in the same place, at the same height, and the first pick stays
  const settled = async () => { await page.waitForTimeout(800); const b = await book.locator('.lb-styles').boundingBox(); return [Math.round(b.y), Math.round(b.height)]; };
  const styles = await settled();
  await book.locator('.lb-part[data-part="lips"]').click();
  expect(await settled()).toEqual(styles);
  await book.locator('.lb-part[data-part="beard"]').click();
  expect(await settled()).toEqual(styles);
  await book.locator('.lb-part[data-part="lips"]').click();
  await expect(book.locator('.lb-part[data-part="bangs"]')).toHaveClass(/is-picked/);
  await book.locator('.lb-style[data-style="red"]').click();
  await expect(book.locator('.lb-token')).toHaveCount(2);
  await expect(hint).toHaveText('Your look, on every face. Touch one to open it');
  // every face in the ring wears all of it, and is named for all of it
  const title = book.locator('.lb-caption__title');
  await expect(title).toHaveText(/ · /);
  await expect(book.locator('.lb-caption__part')).toHaveText(/^YOUR LOOK · ON /);
  const look = await title.textContent(), named = await book.locator('.lb-card').evaluateAll(cs => cs.map(c => c.getAttribute('aria-label')));
  expect(named.length).toBeGreaterThan(4);
  for (const n of named) expect(n.startsWith(look + ' on ')).toBe(true);
  // a pick taken back: the rest of the look stays on
  await book.locator('.lb-token').first().click();
  await expect(book.locator('.lb-token')).toHaveCount(1);
  await expect(hint).toHaveText('Add another part: they all go on together');
  await book.locator('.lb-part[data-part="brows"]').click();
  await book.locator('.lb-style[data-style="arched"]').click();
  // the face in front opens in the mirror wearing the whole look
  await book.locator('.lb-card.is-front').click();
  const mirror = page.locator('section.mr');
  await expect(mirror.locator('.mr-token')).toHaveCount(2);
});

test('the rooms are a touch away on the Lookbook, and dress all of it', async ({ page }) => {
  await page.goto('/');
  const book = page.locator('section.book');
  await expect.poll(() => room(page)).toBe('salon');
  const ground = () => book.evaluate(el => getComputedStyle(el).backgroundImage);
  const before = await ground();
  await book.locator('.lb-bar__room').click();
  await page.locator('.sheet .postcard[data-room="princess"]').click();
  await expect.poll(() => room(page)).toBe('princess');
  await expect.poll(ground).not.toBe(before);
  // the button wears the room it opens
  const swatch = await book.locator('.lb-bar__swatch i').first().evaluate(i => getComputedStyle(i).backgroundColor);
  expect(swatch).not.toBe('rgba(0, 0, 0, 0)');
});

/** The studio's own people (served, but kept out of the manifest for the other tests). */
const realPeople = (page) => page.route('**/examples/manifest.json', r => r.fulfill({ path: 'web/examples/manifest.json' }));
/** How far across the light stands in the sitting's picture (100: the look whole). */
const light = (page) => page.locator('.wl-sit__hero').getAttribute('aria-valuenow').then(Number);

test('the first time is a sitting: a look touched sweeps in on a real face, the light follows a finger, and the Lookbook opens on that face', async ({ page }) => {
  await realPeople(page);
  await page.goto('/?welcome');
  const wl = page.locator('.wl'), hero = wl.locator('.wl-sit__hero');
  await expect(wl.locator('.wl-title__name')).toHaveText('Likeness');
  await expect(wl.locator('.wl-look')).toHaveCount(3);
  await expect(wl.locator('.wl-sit__ask')).toHaveText(/^Choose a look for /);
  // a look touched: it is the one chosen, its name over the picture, and the light carries it on whole
  const second = wl.locator('.wl-look').nth(1), name = (await second.textContent()).trim();
  await second.click();
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(wl.locator('.wl-hero__say')).toContainText(name);
  await expect.poll(() => light(page), { timeout: 10_000 }).toBe(100);
  // the light under a finger: held part way across, the face as it is shows beyond it; let go, and the look is whole again
  const b = await hero.boundingBox();
  await page.mouse.move(b.x + b.width * .8, b.y + b.height * .4); await page.mouse.down();
  await page.mouse.move(b.x + b.width * .3, b.y + b.height * .4, { steps: 6 });
  await expect.poll(() => light(page)).toBeLessThan(50);
  await page.mouse.up();
  await expect.poll(() => light(page)).toBe(100);
  // and by the keys, as a slider
  await hero.focus(); await page.keyboard.press('Home');
  await expect.poll(() => light(page)).toBe(0);
  await page.keyboard.press('End');
  await expect.poll(() => light(page)).toBe(100);
  // someone else, and their looks
  const asked = await wl.locator('.wl-sit__ask').textContent();
  await wl.locator('.wl-sit__next').click();
  await expect(wl.locator('.wl-sit__ask')).not.toHaveText(asked);
  const who = (await wl.locator('.wl-sit__ask').textContent()).replace('Choose a look for ', '');
  // the Lookbook, with that face in front
  await wl.locator('.wl-sit__around').click();
  await expect(wl).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('likeness.welcomed'))).toBe('true');
  await expect(page.locator('.lb-caption__part')).toContainText(who, { ignoreCase: true, timeout: 10_000 });
  // the name at the top brings it back; Escape lets it go
  await page.locator('.lb-bar__mark').click();
  await expect(page.locator('.wl-sit')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.wl')).toHaveCount(0);
});

test('from the sitting, "Try it on me" takes the look it ended on to your own face', async ({ page }) => {
  await realPeople(page);
  await page.goto('/?welcome');
  const wl = page.locator('.wl');
  await expect(wl.locator('.wl-look')).toHaveCount(3);
  const name = (await wl.locator('.wl-look').nth(2).textContent()).trim();
  await wl.locator('.wl-look').nth(2).click();
  const chooser = page.waitForEvent('filechooser', { timeout: 20_000 }).catch(() => null);
  await wl.locator('.wl-go').click();
  await expect(wl).toHaveCount(0);
  // the look is picked on the Lookbook, and your face is asked for: the live mirror, or a photo
  await expect(page.locator('.lb-token')).toHaveCount(1);
  await expect(page.locator('.lb-token__name')).toHaveText(name.split(' ')[0], { ignoreCase: true });
  const live = page.locator('section.lv');
  expect(await Promise.race([live.waitFor({ timeout: 20_000 }).then(() => 'live', () => ''), chooser.then(c => (c ? 'photo' : ''))])).not.toBe('');
});

test('without the studio\'s people, the welcome says what Likeness is for in a line and three steps', async ({ page }) => {
  await page.goto('/?welcome');
  const wl = page.locator('.wl');
  await expect(wl.locator('.wl-title__name')).toHaveText('Likeness');
  await expect(wl.locator('.wl-title__steps li')).toHaveCount(3);
  await wl.locator('.wl-title .wl-go').click();
  await expect(wl).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('likeness.welcomed'))).toBe('true');
});

test('on a photograph a look is painted from the picture itself, not drawn over it; only a cut is still a line', async ({ page }) => {
  await realPeople(page);
  await page.goto('/');
  const book = page.locator('section.book');
  await book.locator('.lb-part[data-part="bangs"]').click();
  await book.locator('.lb-style[data-style="curtain"]').click();
  // every face read wears it painted: a canvas of hair over the picture, no pen line over a real face
  await expect.poll(() => book.locator('.lb-card__paint').count(), { timeout: 45_000 }).toBeGreaterThan(3);
  await expect(book.locator('.lb-card.is-front .lb-card__paint')).toHaveCount(1, { timeout: 20_000 });
  expect(await book.locator('.lb-card__sketch').count()).toBe(0);
  const painted = await book.locator('.lb-card.is-front .lb-card__paint').evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n / (d.length / 4); });
  expect(painted).toBeGreaterThan(.02);
  await expect(book.locator('.lb-card.is-front .lb-card__tag')).toHaveText('Sketch');
  // a cut is still a fine line beside the paint
  await book.locator('.lb-part[data-part="cut"]').click();
  await book.locator('.lb-style[data-style="bob"]').click();
  await expect(book.locator('.lb-card.is-front .lb-card__sketch.is-fine')).toHaveCount(1, { timeout: 20_000 });
  await expect(book.locator('.lb-card.is-front .lb-card__paint')).toHaveCount(1);
});

test('a fringe is the person\'s own hair brought forward: its colour and grain are theirs, and a dye takes it with the rest', async ({ page }) => {
  await realPeople(page);
  await page.goto('/');
  const got = await page.evaluate(async () => {
    const { faceOf, hairOf } = await import('/js/studio/face.js');
    const { paintLook, coloursOf } = await import('/js/looks/paint.js');
    const load = async (/** @type {string} */ src) => { const i = new Image(); i.src = src; await i.decode(); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); return c; };
    const mean = (/** @type {HTMLCanvasElement | null} */ l) => { if (!l) return null; const d = l.getContext('2d').getImageData(0, 0, l.width, l.height).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } return n ? [r / n, g / n, b / n, n] : null; };
    /** @type {Record<string, any>} */ const out = {};
    for (const id of ['sofia', 'maeve']) {
      const c = await load('/examples/' + id + '/portrait.webp'), f = await faceOf(c), m = await hairOf(c);
      if (!f) continue;
      const t = coloursOf(c, f, m), [bx, by, bw, bh] = f.box, box = [bx - bw * .3, by - bh * .4, bw * 1.6, bh * 1.4], k = 300 / box[2];
      out[id] = { own: mean(paintLook(c, f, [{ part: 'bangs', style: 'blunt' }], box, k, t)), dyed: mean(paintLook(c, f, [{ part: 'bangs', style: 'blunt' }], box, k, { ...t, dye: '#efe6d6' })), hair: t.hair.mid };
    }
    return out;
  });
  const lum = (/** @type {number[]} */ c) => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  for (const id of ['sofia', 'maeve']) {
    const { own, dyed, hair } = got[id];
    // a fringe of some size, in the colour of the hair it came from (not a fill in a colour of its own)
    expect(own?.[3]).toBeGreaterThan(500);
    expect(Math.hypot(own[0] - hair[0], own[1] - hair[1], own[2] - hair[2])).toBeLessThan(48);
    // dyed, it goes the way the rest of the hair would
    expect(lum(dyed)).toBeGreaterThan(lum(own) + 50);
  }
  // copper stays copper, dark stays dark
  expect(got.maeve.own[0] - got.maeve.own[2]).toBeGreaterThan(25);
  expect(lum(got.sofia.own)).toBeLessThan(95);
});

test('a fringe is only as long as the hair it is combed from, and never made of skin: where no hair is found it is left to the pencil', async ({ page }) => {
  await realPeople(page);
  await page.goto('/');
  const got = await page.evaluate(async () => {
    const { faceOf, hairOf } = await import('/js/studio/face.js');
    const { paintLook, coloursOf } = await import('/js/looks/paint.js');
    const load = async (/** @type {string} */ src) => { const i = new Image(); i.src = src; await i.decode(); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); return c; };
    /** @type {Record<string, any>} */ const out = {};
    for (const id of ['sofia', 'kenji']) {
      const c = await load('/examples/' + id + '/portrait.webp'), f = await faceOf(c), m = await hairOf(c);
      if (!f) continue;
      const [bx, by, bw, bh] = f.box, box = [bx - bw * .3, by - bh * .4, bw * 1.6, bh * 1.4], k = 300 / box[2];
      const hair = f.pts[10].y - bh * .02, F = Math.max(bh * .12, Math.min(f.pts[105].y, f.pts[334].y) - hair);
      // how far below the hairline the curtain reaches, of the forehead's height
      const l = paintLook(c, f, [{ part: 'bangs', style: 'curtain' }], box, k, coloursOf(c, f, m));
      let low = -1; if (l) { const d = l.getContext('2d').getImageData(0, 0, l.width, l.height).data; for (let y = 0; y < l.height; y++) for (let x = 0; x < l.width; x++) if (d[(y * l.width + x) * 4 + 3] > 64) low = y; }
      // and with no hair found in the picture at all
      const bare = coloursOf(c, f, null);
      out[id] = { reach: low < 0 ? -1 : (box[1] + low / k - hair) / F, alone: paintLook(c, f, [{ part: 'bangs', style: 'blunt' }], box, k, bare), withBrows: [...(paintLook(c, f, [{ part: 'bangs', style: 'blunt' }, { part: 'brows', style: 'bold' }], box, k, bare)?.painted || [])], hair: bare.hair.mid, skin: bare.skin.mid };
    }
    return out;
  });
  // long hair falls to the cheekbones; a short crop makes a short fringe
  expect(got.sofia.reach).toBeGreaterThan(1.4);
  expect(got.kenji.reach).toBeGreaterThan(.3);
  expect(got.kenji.reach).toBeLessThan(got.sofia.reach - .6);
  for (const id of ['sofia', 'kenji']) {
    const { alone, withBrows, hair, skin } = got[id];
    // no hair to comb it from: no fringe painted (the pencil draws it), though brows still are
    expect(alone).toBeNull();
    expect(withBrows).toEqual(['brows']);
    // and the hair's colour, read without it, is not the forehead's
    expect(Math.hypot(hair[0] - skin[0], hair[1] - skin[1], hair[2] - skin[2])).toBeGreaterThan(60);
  }
});

test('the line takes anything: words that are no look say they will be painted, and the desk paints them', async ({ page }) => {
  await page.goto('/');
  const book = page.locator('section.book'), ask = book.locator('.lb-ask'), input = ask.locator('.lb-ask__input');
  await input.fill('a lighthouse inside a teacup, at dusk');
  await expect(ask).toHaveClass(/is-picture/);
  await expect(ask.locator('.lb-ask__go')).toHaveAttribute('aria-label', 'Paint it');
  await expect(ask.locator('.lb-ask__paint')).toBeVisible();
  // words for a look are a look again
  await input.fill('curtain bangs, a little longer');
  await expect(ask).not.toHaveClass(/is-picture/);
  await expect(ask.locator('.lb-ask__go')).toHaveAttribute('aria-label', 'Try it on');
  // sent: the Lookbook steps aside, the words are on the desk, and the picture is painted (here, a sketch)
  await input.fill('a lighthouse inside a teacup, at dusk');
  await ask.locator('.lb-ask__go').click();
  await expect(book).toHaveClass(/is-away/);
  await expect(page.locator('section.desk .thread')).toContainText('a lighthouse inside a teacup', { timeout: 10_000 });
  await expect(page.locator('figure.print .print__stamp', { hasText: 'Sketch' })).toHaveCount(1, { timeout: 30_000 });
  // and back on the Lookbook, the line is clear for the next thing
  await page.locator('.desk__bar button[aria-label="Looks"]').click();
  await expect(book).not.toHaveClass(/is-away/);
  await expect(input).toHaveValue('');
  await expect(ask).not.toHaveClass(/is-picture/);
});

test('in the mirror the parts stay put, and a change can be drawn on the picture or borrowed from a reference', async ({ page }) => {
  await page.goto('/');
  await mirrorOn(page, 'tests/fixtures/sitters/kofi.jpg');
  const mirror = page.locator('section.mr'), frame = mirror.locator('.mr-frame');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  // one way to pick a part at a time: on the face as it is, its notes (the dock is only the line); a part chosen, the
  // mirror leans in and the parts come up in the dock as pills, the notes out of reach
  await expect(mirror.locator('.mr-parts')).toBeHidden();
  const settled = async () => { await page.waitForTimeout(700); const [p, f] = [await mirror.locator('.mr-parts').boundingBox(), await frame.boundingBox()]; return [p.y, f.y, f.height].map(Math.round); };
  await mirror.locator('.mr-note[data-part="bangs"]').click();
  await expect(mirror.locator('.mr-styles')).toBeVisible();
  await expect(mirror.locator('.mr-part[data-part="bangs"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(mirror.locator('.mr-note[data-part="lips"]')).toHaveCSS('pointer-events', 'none');
  // one part, then another: the styles change under the parts, and nothing moves; the part touched again puts it down
  const at = await settled();
  for (const part of ['lips', 'beard', 'lips']) {
    await mirror.locator('.mr-part[data-part="' + part + '"]').click();
    await expect(mirror.locator('.mr-part[data-part="' + part + '"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await settled()).toEqual(at);
  }
  await mirror.locator('.mr-part[data-part="lips"]').click();
  await expect(mirror.locator('.mr-styles')).toBeHidden();
  await expect(mirror.locator('.mr-parts')).toBeHidden();
  await expect(mirror.locator('.mr-note[data-part="lips"]')).toHaveCSS('pointer-events', 'auto');
  // drawn on: a ring round the jaw, and the finger draws rather than turns the face
  await mirror.locator('.mr-ask__add').click();
  await mirror.locator('.mr-tray__do[data-do="draw"]').click();
  await expect(mirror.locator('.mr-drawbar')).toBeVisible();
  const box = await frame.boundingBox();
  const cx = box.x + box.width * .5, cy = box.y + box.height * .62, r = box.width * .16;
  await page.mouse.move(cx + r, cy);
  await page.mouse.down();
  for (let k = 1; k <= 18; k++) await page.mouse.move(cx + r * Math.cos(k / 18 * 2 * Math.PI), cy + r * .8 * Math.sin(k / 18 * 2 * Math.PI));
  await page.mouse.up();
  await expect(frame).toHaveClass(/has-marks/);
  await expect(frame).not.toHaveClass(/is-device-turn/);
  await mirror.locator('.mr-drawbar__done').click();
  await expect(mirror.locator('.mr-drawbar')).toBeHidden();
  // the marks stay on the picture, and go with whatever is asked
  await expect(frame).toHaveClass(/has-marks/);
  await expect(mirror.locator('.mr-token--marks')).toBeVisible();
  // a reference: a picture whose look is borrowed, pinned to the frame's corner
  const chooser = page.waitForEvent('filechooser');
  await mirror.locator('.mr-ask__add').click();
  await mirror.locator('.mr-tray__do[data-do="ref"]').click();
  await (await chooser).setFiles('tests/fixtures/sitters/lena.jpg');
  await expect(mirror.locator('.mr-ref')).toBeVisible();
  await expect(mirror.locator('.mr-token--ref')).toBeVisible();
  // asked for with both, and sketched here, saying so
  await mirror.locator('.mr-ask__input').fill('her fringe, about here');
  await mirror.locator('.mr-ask__go').click();
  await expect(mirror.locator('.mr-take:not(.is-origin)')).toHaveCount(1, { timeout: 20_000 });
  await expect(mirror.locator('.mr-stamp')).toHaveText('Sketch');
});

test('in the mirror a fringe is painted on the photo at once, its pencil kept for shaping; where no hair is found, the pencil stays', async ({ page }) => {
  await page.goto('/');
  await mirrorOn(page, 'tests/fixtures/sitters/ines.jpg');
  const mirror = page.locator('section.mr');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  await mirror.locator('.mr-note[data-part="bangs"]').click();
  await mirror.locator('.mr-style[data-style="blunt"]').click();
  const paint = mirror.locator('.mr-paint');
  await expect.poll(() => paint.evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 64) if (d[i] > 40) n++; return n; }), { timeout: 20_000 }).toBeGreaterThan(50);
  // the strokes are there to be shaped, out of sight until a handle is held
  const strokes = mirror.locator('.mr-sketch g.is-painted[data-part="bangs"]');
  await expect(strokes).toHaveCount(1);
  expect(await strokes.evaluate(g => getComputedStyle(g).opacity)).toBe('0');
  // a cut is still drawn
  await mirror.locator('.mr-part[data-part="cut"]').click();
  await mirror.locator('.mr-style[data-style="bob"]').click();
  await expect(mirror.locator('.mr-sketch g[data-part="cut"]:not(.is-painted)')).toHaveCount(1);
  // a photo whose hair cannot be found (this drawing's): there is nothing to comb a fringe from, so it stays a pencil
  // line, in sight, rather than being made up
  await page.goto('/');
  await mirrorOn(page, 'tests/fixtures/sitters/mei.jpg');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  await mirror.locator('.mr-note[data-part="bangs"]').click();
  await mirror.locator('.mr-style[data-style="blunt"]').click();
  const pencil = mirror.locator('.mr-sketch g[data-part="bangs"]');
  await expect(pencil).not.toHaveClass(/is-painted/, { timeout: 20_000 });
  await expect.poll(() => pencil.evaluate(g => getComputedStyle(g).opacity)).toBe('1');
});

test('a look weeks on: Grow out walks the weeks to its first trim, the fringe falls and the roots come in, the frame dated; asked for, it is sketched so', async ({ page }) => {
  await page.goto('/');
  await mirrorOn(page, 'tests/fixtures/sitters/ines.jpg');
  const mirror = page.locator('section.mr'), when = mirror.locator('.mr-when');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  // make-up is put on each morning: nothing to grow out
  await mirror.locator('.mr-note[data-part="lips"]').click();
  await mirror.locator('.mr-style[data-style="red"]').click();
  await expect(when).toBeHidden();
  // a fringe and a colour grow
  await mirror.locator('.mr-part[data-part="bangs"]').click();
  await mirror.locator('.mr-style[data-style="blunt"]').click();
  await mirror.locator('.mr-part[data-part="colour"]').click();
  await mirror.locator('.mr-style[data-style="platinum"]').click();
  await expect(when).toBeVisible();
  const paint = mirror.locator('.mr-paint'), wash = mirror.locator('.mr-wash');
  // the fringe's foot down the middle of the face, and how much of the hair is dyed
  const foot = () => paint.evaluate(c => { const w = Math.round(c.width * .1), d = c.getContext('2d').getImageData(Math.round(c.width * .45), 0, w, c.height).data; let y = -1; for (let i = 0; i < c.height; i++) for (let j = 0; j < w; j++) if (d[(i * w + j) * 4 + 3] > 90) { y = i; break; } return y / c.height; });
  const dyed = () => wash.evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) n += d[i]; return n; });
  await expect.poll(foot, { timeout: 20_000 }).toBeGreaterThan(.05);
  await page.waitForTimeout(600);
  const [foot0, dyed0] = [await foot(), await dyed()];
  // looking ahead: the parts and the takes make way, and the weeks walk on by themselves to the first trim
  await when.click();
  await expect(mirror).toHaveClass(/is-when/);
  await expect(mirror.locator('.mr-parts')).toBeHidden();
  await expect(mirror.locator('.mr-time')).toBeVisible();
  await expect(mirror.locator('.mr-time__head b')).toHaveText('3 weeks', { timeout: 10_000 });
  await expect(mirror.locator('.mr-cap__say')).toHaveText('The fringe in the eyes');
  await expect(mirror.locator('.mr-time__mark.is-due')).toHaveText('trim');
  await expect(mirror.locator('.mr-time__mark:not(.is-due)')).toHaveText('roots');
  await expect.poll(foot, { timeout: 20_000 }).toBeGreaterThan(foot0 + .002);
  const foot3 = await foot(), date3 = await mirror.locator('.mr-cap__date').textContent();
  expect(date3).toMatch(/^\d{1,2} [A-Z]{3}( '\d\d)?$/);
  // by hand, six weeks: the roots are in, and the line says the weeks go with what is asked
  await mirror.locator('.mr-time__range').fill('6');
  await expect(mirror.locator('.mr-time__head b')).toHaveText('6 weeks');
  await expect(mirror.locator('.mr-cap__say')).toHaveText('The fringe in the eyes · roots showing');
  await expect(mirror.locator('.mr-time__range')).toHaveAttribute('aria-valuetext', '6 weeks: The fringe in the eyes · roots showing');
  await expect(mirror.locator('.mr-cap__date')).not.toHaveText(date3);
  await expect(mirror.locator('.mr-token').first()).toHaveText('6 weeks on');
  await expect.poll(dyed, { timeout: 20_000 }).toBeLessThan(dyed0 * .995);
  expect(await foot()).toBeGreaterThan(foot3 + .002);
  // Done: today again, as it was
  await mirror.locator('.mr-time__done').click();
  await expect(mirror).not.toHaveClass(/is-when/);
  await expect(mirror.locator('.mr-note[data-part="bangs"]')).toHaveCSS('pointer-events', 'auto');
  await expect(mirror.locator('.mr-token--when')).toHaveCount(0);
  await expect.poll(foot, { timeout: 20_000 }).toBeLessThan(foot0 + .004);
  // asked for weeks on, it is sketched weeks on, and says so
  await when.click();
  await expect(mirror.locator('.mr-time__head b')).toHaveText('3 weeks', { timeout: 10_000 });
  await mirror.locator('.mr-time__range').fill('6');
  await mirror.locator('.mr-ask__go').click();
  await expect(mirror.locator('.mr-take[data-weeks="6"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(mirror.locator('.mr-stamp')).toHaveText('Sketch · 6 weeks on');
  await expect(mirror).not.toHaveClass(/is-when/);
  // and Escape, looking ahead, comes back to today rather than closing the mirror
  await when.click();
  await expect(mirror).toHaveClass(/is-when/);
  await page.keyboard.press('Escape');
  await expect(mirror).not.toHaveClass(/is-when/);
  await expect(mirror).toBeVisible();
});

test('a look fitted one or two at a time: two versions in turn, the chosen kept, either the easier to live with, the look as fitted after', async ({ page }) => {
  await page.goto('/');
  await mirrorOn(page, 'tests/fixtures/sitters/ines.jpg');
  const mirror = page.locator('section.mr'), fit = mirror.locator('.mr-fit');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  // nothing to fit until there is a look
  await expect(fit).toBeHidden();
  await mirror.locator('.mr-note[data-part="bangs"]').click();
  await mirror.locator('.mr-style[data-style="blunt"]').click();
  await mirror.locator('.mr-part[data-part="colour"]').click();
  await mirror.locator('.mr-style[data-style="platinum"]').click();
  await expect(fit).toBeVisible();
  await fit.click();
  // the dock is a pair of lenses; the parts, the line and the takes make way
  await expect(mirror).toHaveClass(/is-trial/);
  await expect(mirror.locator('.mr-parts')).toBeHidden();
  await expect(mirror.locator('.mr-ask')).toBeHidden();
  const what = mirror.locator('.mr-trial__what'), cap = mirror.locator('.mr-trialcap');
  const one = mirror.locator('.mr-trial__lens[data-k="0"]'), two = mirror.locator('.mr-trial__lens[data-k="1"]');
  // the fringe first: as it is, or the one a stylist would suggest beside it, shown one and then the other
  await expect(one).toHaveAttribute('aria-label', '1: Blunt, as it is', { timeout: 20_000 });
  await expect(two).toHaveAttribute('aria-label', '2: Wispy');
  await expect(what).toHaveText('The fringe · which is more you?');
  await expect(one).toHaveClass(/is-lit/);
  await expect(cap).toHaveText('One…');
  await expect(two).toHaveClass(/is-lit/, { timeout: 4_000 });
  await expect(cap).toHaveText('…or two?');
  // the two are different looks on the face
  const differ = () => mirror.evaluate(el => { const [a, b] = [...el.querySelectorAll('.mr-opt')].map(c => /** @type {HTMLCanvasElement} */ (c).getContext('2d').getImageData(0, 0, c.width, c.height).data); let n = 0; for (let i = 0; i < a.length; i += 16) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 3] - b[i + 3]) > 24) n++; return n / (a.length / 16); });
  // (the mirror asks only where its own zoomed measure sees them apart; here, at the canvas's full size, a fringe's
  // locks change a few tenths of a percent of the frame plainly, never nothing)
  expect(await differ()).toBeGreaterThan(.003);
  // a touch on the face turns them by hand, and then they stay
  const lit = async () => ((await one.getAttribute('class')) || '').includes('is-lit') ? 0 : 1;
  const was = await lit();
  await mirror.locator('.mr-frame').click({ position: { x: 90, y: 160 } });
  await expect.poll(lit).toBe(1 - was);
  await page.waitForTimeout(1900);
  expect(await lit()).toBe(1 - was);
  // two: said back on the frame
  await two.click();
  await expect(cap).toHaveText('Two: Wispy.');
  // then its length, both ways from where it is, then a half step
  await expect(what).toHaveText('The fringe · length', { timeout: 10_000 });
  await expect(one).toHaveAttribute('aria-label', '1: longer');
  await expect(two).toHaveAttribute('aria-label', '2: shorter');
  await one.click();
  await expect(cap).toHaveText('One: longer.');
  await expect(one).toHaveAttribute('aria-label', '1: a little shorter', { timeout: 10_000 });
  await mirror.locator('.mr-trial__either').click();
  await expect(cap).toHaveText('Either: as it is, then.');
  // the colour: either is the one that keeps longer before it wants seeing to
  await expect(what).toHaveText('The colour', { timeout: 10_000 });
  await expect(one).toHaveAttribute('aria-label', '1: Honey');
  await expect(two).toHaveAttribute('aria-label', '2: Platinum, as it is');
  await page.keyboard.press('e');
  await expect(cap).toHaveText('Either: Honey, as it keeps 2 months longer.');
  // by the keys
  await expect(what).toHaveText('The colour · shade', { timeout: 10_000 });
  await expect(one).toHaveAttribute('aria-label', '1: deeper');
  await page.keyboard.press('ArrowRight');
  await expect(two).toHaveClass(/is-lit/);
  await page.keyboard.press('1');
  await expect(cap).toHaveText('One: deeper.');
  await expect(two).toHaveAttribute('aria-label', '2: a little deeper', { timeout: 10_000 });
  await page.keyboard.press('2');
  // all asked: fitted, and the mirror is back with the look as fitted
  await expect(cap).toHaveText('Fitted to you.', { timeout: 10_000 });
  await expect(mirror).not.toHaveClass(/is-trial/, { timeout: 10_000 });
  await expect(mirror.locator('.mr-note[data-part="bangs"]')).toHaveCSS('pointer-events', 'auto');
  await expect(fit).toBeVisible();
  await expect(mirror.locator('.mr-token')).toHaveText([/^Wispy/, /^Honey.*much deeper/]);
  // again, and away part way: what was chosen stays
  await fit.click();
  await expect(one).toHaveAttribute('aria-label', /^1: /, { timeout: 20_000 });
  await page.keyboard.press('Escape');
  await expect(mirror).not.toHaveClass(/is-trial/);
  await expect(mirror.locator('.mr-token')).toHaveText([/^Wispy/, /^Honey.*much deeper/]);
  await expect(mirror).toBeVisible();
});
