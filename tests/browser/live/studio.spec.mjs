/** The live studio on the simulator engine: the same app, talking to likeness serve. Its pictures are stand-ins
and say so, in the app and on the picture itself. */
import { test, expect } from '@playwright/test';
import { made, open, pinAndSend, samples, say } from '../kit.mjs';

test('the live studio says it is a simulator, and so do its pictures', async ({ page }) => {
  await open(page);
  await expect(page.locator('.edition')).toHaveText(/Live · Simulator/);
  await say(page, 'Snow falling on a red roof at night');
  await expect(page.locator('.job__notes')).not.toBeEmpty();
  await expect(made(page, 'Simulated')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('button.chip.idea').first()).toBeVisible();
});

test('Stop reaches the studio', async ({ page }) => {
  await open(page);
  await say(page, 'A very slow picture, please');
  await expect(page.locator('.job__stage')).toBeVisible();
  await page.waitForTimeout(600);
  await page.locator('button.job__stop').click();
  await expect(page.locator('.job__stage', { hasText: 'Stopped.' })).toBeVisible();
  await page.waitForTimeout(4000);
  await expect(made(page, 'Simulated')).toHaveCount(0);
});

test('a pinned change goes up with its mask and comes back simulated', async ({ page }) => {
  await open(page);
  await samples(page);
  await pinAndSend(page, 'make it golden');
  await expect(made(page, 'Simulated')).toHaveCount(1, { timeout: 30_000 });
});

test('a turn still developing when the page reloads is picked up again, and lands once', async ({ page }) => {
  await open(page);
  await say(page, 'A harbour in the morning, three boats');
  await expect(page.locator('.job__stage')).toBeVisible();
  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.locator('.desk__bar .edition')).toBeVisible();
  await expect(made(page, 'Simulated')).toHaveCount(1, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await expect(made(page, 'Simulated')).toHaveCount(1);
  await expect(page.locator('.job__stage', { hasText: 'Stopped.' })).toHaveCount(0);
});
