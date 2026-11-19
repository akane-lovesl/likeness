/** The live mirror, with a camera that sees a face: the browser's fake camera plays a drawn sitter. */
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=' + resolve('tests/fixtures/camera/kofi.mjpeg')] } });

test('the camera is a mirror: the look sketched live on the face, and the shutter takes that moment to the mirror', async ({ page }) => {
  await page.goto('/');
  await page.locator('.lb-part[data-part="brows"]').click();
  await page.locator('.lb-style[data-style="arched"]').click();
  await page.locator('.lb-ask__photo').click();
  const live = page.locator('section.lv');
  await expect(live).toHaveClass(/has-face/, { timeout: 40_000 });
  await expect(live.locator('.mr-stamp')).toHaveText('Live sketch · on this device');
  await expect(live.locator('.lv-parts .mr-part[data-part="brows"]')).toHaveAttribute('data-style', 'arched');
  // brows are painted on the face as it moves (as on a photograph), painted again as often as the device keeps up with
  await expect(live).toHaveAttribute('data-paint', /^\d+$/, { timeout: 20_000 });
  // a part touched: every style of it on you at once, a tile each, the one to keep touched
  await live.locator('.lv-parts .mr-part[data-part="lips"]').click();
  await expect(live.locator('.lv-frame')).toHaveClass(/is-grid/);
  await expect(live.locator('.lv-tile')).toHaveCount(4);
  await live.locator('.lv-tile[data-style="red"]').click();
  await expect(live.locator('.lv-frame')).not.toHaveClass(/is-grid/);
  await expect(live.locator('.lv-tile')).toHaveCount(0);
  await expect(live.locator('.lv-parts .mr-part.is-picked')).toHaveCount(2);
  await expect(live.locator('.lv-parts .mr-part[data-part="lips"]')).toHaveAttribute('data-style', 'red');
  await live.locator('.lv-shutter').click();
  const mirror = page.locator('section.mr');
  await expect(mirror).toBeVisible();
  await expect(live).toHaveCount(0);
  await expect(mirror.locator('.mr-token')).toHaveText(['High arch', 'Red']);
  // the face read in the camera comes with the photo, so the mirror has it at once: no second reading
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 6_000 });
  await expect(mirror).not.toHaveClass(/is-close/);
  // the look on you, shown: the picture comes forward and sways a little on the device (and says so), the look in words
  await mirror.locator('.mr-bar__show').click();
  await expect(mirror).toHaveClass(/is-showing/);
  await expect(mirror.locator('.mr-show__style')).toHaveText(['High arch', 'Red']);
  // and what it will want, for the one who keeps it up (lipstick is put on each morning: nothing)
  await expect(mirror.locator('.mr-show__keep')).toHaveText(['Shape every 3 weeks']);
  await expect(mirror.locator('.mr-stamp')).toHaveText(/Turned on this device/);
  await page.keyboard.press('Escape');
  await expect(mirror).not.toHaveClass(/is-showing/);
  await expect(mirror).toBeVisible();
});

test('words typed first: the camera opens straight away with the look as it was said, and the shutter keeps it', async ({ page }) => {
  await page.goto('/');
  await page.locator('.lb-ask__input').click();
  await page.locator('.lb-ask__input').pressSequentially('feathered brows, much fuller', { delay: 15 });
  await page.locator('.lb-ask__go').click();
  const live = page.locator('section.lv');
  await expect(live).toHaveClass(/has-face/, { timeout: 40_000 });
  await expect(live.locator('.lv-parts .mr-part[data-part="brows"]')).toHaveAttribute('data-style', 'feathered');
  await live.locator('.lv-shutter').click();
  const mirror = page.locator('section.mr');
  await expect(mirror.locator('.mr-token')).toHaveText([/^Feathered.*much fuller$/]);
});

test('the ring becomes you: a photo of you kept, every look in the ring is on you, and next time you are offered', async ({ page }) => {
  await page.goto('/');
  await page.locator('.lb-ask__photo').click();
  const live = page.locator('section.lv');
  await expect(live).toHaveClass(/has-face/, { timeout: 40_000 });
  await live.locator('.lv-shutter').click();
  const mirror = page.locator('section.mr');
  await expect(mirror).toBeVisible();
  await mirror.locator('.mr-bar__back').click();
  await expect(mirror).toHaveCount(0);
  // back at the ring, it is yours: each look a sketch on your photo, the switch saying whose faces they are on
  const book = page.locator('section.book');
  const you = book.locator('.lb-whose button[data-who="you"]'), them = book.locator('.lb-whose button[data-who="them"]');
  await expect(you).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
  await expect(book.locator('.lb-card--you')).toHaveCount(8);
  await expect(book.locator('.lb-caption__part')).toContainText('· YOU');
  await expect(book.locator('.lb-card.is-front .lb-card__tag')).toHaveText('Sketch');
  await them.click();
  await expect(book.locator('.lb-card--you')).toHaveCount(0);
  await you.click();
  await expect(book.locator('.lb-card--you')).toHaveCount(8);
  // a look on you, chosen (from the keyboard: the ring turns by itself, and a pointer can meet a card on its way): your photo in the mirror, wearing it
  await book.locator('.lb-card.is-front').press('Enter');
  await expect(mirror).toBeVisible();
  await expect(mirror.locator('.mr-stamp')).toHaveText('Your photo');
  await expect(mirror.locator('.mr-token')).toHaveCount(1);
  // another day: you are offered, not shown
  await page.reload();
  await expect(you).toBeVisible({ timeout: 20_000 });
  await expect(them).toHaveAttribute('aria-pressed', 'true');
  await expect(book.locator('.lb-card--you')).toHaveCount(0);
});

test('On me, on a face in the ring: the camera opens with that look on', async ({ page }) => {
  await page.goto('/');
  const front = page.locator('section.book .lb-card.is-front');
  await expect(front).toHaveClass(/lb-card--sitter/);
  await front.locator('.lb-card__me').click();
  const live = page.locator('section.lv');
  await expect(live).toBeVisible();
  await expect(live.locator('.lv-parts .mr-part[data-part="bangs"]')).toHaveAttribute('data-style', 'curtain');
  await expect(live).toHaveClass(/has-face/, { timeout: 40_000 });
});

test('with a core to spare, the face is read aside (in a worker), and the mirror follows it and keeps it as before', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 }));
  await page.goto('/');
  await page.locator('.lb-ask__photo').click();
  const live = page.locator('section.lv');
  await expect(live).toHaveClass(/has-face/, { timeout: 40_000 });
  await expect(live).toHaveAttribute('data-reader', 'aside');
  await expect(live).toHaveAttribute('data-read', /^\d+$/);
  await live.locator('.lv-shutter').click();
  const mirror = page.locator('section.mr');
  await expect(mirror).toBeVisible();
  await expect(mirror.locator('.mr-note').first()).toBeVisible({ timeout: 6_000 });
});
