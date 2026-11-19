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

test('the first time, a welcome says what Likeness is for, then shows it on the Lookbook itself and puts it back', async ({ page }) => {
  await page.goto('/?welcome');
  const wl = page.locator('.wl');
  await expect(wl.locator('.wl-title__name')).toHaveText('Likeness');
  await expect(wl.locator('.wl-title__steps li')).toHaveCount(3);
  await wl.locator('.wl-title .wl-go').click();
  const card = wl.locator('.wl-card');
  await expect(card.locator('.wl-card__n')).toHaveText('1 of 4');
  await expect(card.locator('.wl-card__title')).toHaveText('Looks, on faces');
  await card.locator('.wl-go').click();
  await expect(card.locator('.wl-card__title')).toHaveText('Mix your own');
  // it does what it says, for real: two styles picked, and every face wears both
  await expect(card.locator('.wl-chip')).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator('.lb-token')).toHaveCount(2);
  await card.locator('.wl-go').click();
  // and puts the ring back as it was
  await expect(page.locator('.lb-token')).toHaveCount(0);
  await expect(page.locator('.lb-part[aria-pressed="true"]')).toHaveCount(0);
  await expect(card.locator('.wl-card__title')).toHaveText('Then, on you');
  await card.locator('.wl-go').click();
  await expect(card.locator('.wl-card__title')).toHaveText('Make it yours');
  await expect(card.locator('.wl-go')).toHaveText('Start');
  await card.locator('.wl-go').click();
  await expect(wl).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('likeness.welcomed'))).toBe('true');
  // the name at the top brings it back
  await page.locator('.lb-bar__mark').click();
  await expect(page.locator('.wl-title')).toBeVisible();
  await page.locator('.wl-title .wl-skip').click();
  await expect(page.locator('.wl')).toHaveCount(0);
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
