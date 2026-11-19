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
  await expect(live.locator('.lv-styles .mr-style[aria-selected="true"]')).toHaveAttribute('data-style', 'arched');
  await live.locator('.lv-parts .mr-part[data-part="lips"]').click();
  await live.locator('.lv-styles .mr-style[data-style="red"]').click();
  await expect(live.locator('.lv-parts .mr-part.is-picked')).toHaveCount(2);
  await live.locator('.lv-shutter').click();
  const mirror = page.locator('section.mr');
  await expect(mirror).toBeVisible();
  await expect(live).toHaveCount(0);
  await expect(mirror.locator('.mr-token')).toHaveText(['High arch', 'Red']);
  // the face read in the camera comes with the photo, so the mirror has it at once: no second reading
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 6_000 });
  await expect(mirror).not.toHaveClass(/is-close/);
});

test('On me, on a face in the ring: the camera opens with that look on', async ({ page }) => {
  await page.goto('/');
  const front = page.locator('section.book .lb-card.is-front');
  await expect(front).toHaveClass(/lb-card--sitter/);
  await front.locator('.lb-card__me').click();
  const live = page.locator('section.lv');
  await expect(live).toBeVisible();
  await expect(live.locator('.lv-styles .mr-style[aria-selected="true"]')).toHaveAttribute('data-style', 'curtain');
  await expect(live).toHaveClass(/has-face/, { timeout: 40_000 });
});
