/** Every side of you: the browser's fake camera plays a drawn sitter turning their head, straight on, to one side, to the other. */
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=' + resolve('tests/fixtures/camera/kofi-turn.mjpeg')] } });

test('every side of you: a turn of the head catches the front and each side, and the mirror turns through them', async ({ page }) => {
  await page.goto('/');
  // left alone, the line says things by itself and the ring wears them: what it said is no one's look, and is not taken along
  await expect(page.locator('.lb-caption__shape')).toHaveText('to the jaw', { timeout: 8_000 });
  await page.locator('.lb-part[data-part="brows"]').click();
  await page.locator('.lb-style[data-style="arched"]').click();
  await page.locator('.lb-ask__photo').click();
  const live = page.locator('section.lv');
  await expect(live).toHaveClass(/has-face/, { timeout: 40_000 });
  await expect(live.locator('.lv-parts .mr-part.is-picked')).toHaveCount(1);
  // a head turned before every side was asked for: the button beside the shutter says what it does
  await expect(live.locator('.lv-turns')).toHaveClass(/is-nudged/, { timeout: 15_000 });
  await live.locator('.lv-turns').click();
  await expect(live.locator('.lv-frame')).toHaveClass(/is-sides/);
  await expect(live.locator('.lv-turns')).toHaveAttribute('aria-pressed', 'true');
  // straight on, one side, the other: each caught as the head passes it, its mark on the level filled with it
  await expect.poll(() => live.locator('.lv-level__mark.is-caught').count(), { intervals: [50], timeout: 40_000 }).toBe(3);
  const mirror = page.locator('section.mr');
  await expect(mirror).toBeVisible();
  await expect(live).toHaveCount(0);
  // the mirror opens on the front, with the look, and turns through every side of you, each with the look on it
  await expect(mirror).toHaveClass(/is-turning/, { timeout: 5_000 });
  await expect(mirror.locator('.mr-angle').first()).toHaveAttribute('src', /^data:image\/jpeg/);
  await expect(mirror).not.toHaveClass(/is-turning/, { timeout: 15_000 });
  await expect(mirror.locator('.mr-token')).toHaveText(['High arch']);
  // and they stay with the photo: the turn button goes round them again, to be dragged through
  const turn = mirror.locator('.mr-turn');
  await expect(turn).toBeVisible();
  await turn.click();
  await expect(mirror).toHaveClass(/is-turning/);
  await expect(mirror.locator('.mr-angle')).toHaveCount(2);
  await turn.click();
  await expect(mirror).not.toHaveClass(/is-turning/);
});
