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

test('in the mirror the parts stay put, and a change can be drawn on the picture or borrowed from a reference', async ({ page }) => {
  await page.goto('/');
  await mirrorOn(page, 'tests/fixtures/sitters/kofi.jpg');
  const mirror = page.locator('section.mr'), frame = mirror.locator('.mr-frame');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  // one part, then another: the styles change under the parts, and nothing moves; the part touched again puts it down
  const settled = async () => { await page.waitForTimeout(700); const [p, f] = [await mirror.locator('.mr-parts').boundingBox(), await frame.boundingBox()]; return [p.y, f.y, f.height].map(Math.round); };
  await mirror.locator('.mr-part[data-part="bangs"]').click();
  await expect(mirror.locator('.mr-styles')).toBeVisible();
  const at = await settled();
  for (const part of ['lips', 'beard', 'lips']) {
    await mirror.locator('.mr-part[data-part="' + part + '"]').click();
    await expect(mirror.locator('.mr-part[data-part="' + part + '"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await settled()).toEqual(at);
  }
  await mirror.locator('.mr-part[data-part="lips"]').click();
  await expect(mirror.locator('.mr-styles')).toBeHidden();
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

test('in the mirror a fringe is painted on the photo at once, its pencil kept for shaping', async ({ page }) => {
  await page.goto('/');
  await mirrorOn(page, 'tests/fixtures/sitters/mei.jpg');
  const mirror = page.locator('section.mr');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  await mirror.locator('.mr-part[data-part="bangs"]').click();
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
});
