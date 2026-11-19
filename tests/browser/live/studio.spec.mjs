/** The live studio on the simulator engine: the same app, talking to likeness serve. Its pictures are stand-ins
and say so, in the app and on the picture itself. */
import { test, expect } from '@playwright/test';
import { made, mirrorOn, open, pinAndSend, samples, say } from '../kit.mjs';

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

test('a trip is drawn on the device even here, and its sheet says it is a sketch', async ({ page }) => {
  await open(page);
  await page.locator('button.starter').first().click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('button.bring__opt').first().click()]);
  await chooser.setFiles('tests/fixtures/sitters/ruth.jpg');
  await expect(page.locator('figure.print')).toHaveCount(1);
  await say(page, 'take @A on a trip');
  await expect(page.getByText(/A, on a trip: Lisbon at dawn/)).toBeVisible({ timeout: 40_000 });
  await expect(made(page, 'Sketch')).toHaveCount(1);
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

test('the mirror tries a look on: four takes inside the part\'s mask, one kept, then every angle of it', async ({ page }) => {
  const turns = [];
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/turns')) turns.push(r.postDataJSON()); });
  await page.goto('/');
  await mirrorOn(page, 'tests/fixtures/sitters/kofi.jpg');
  const mirror = page.locator('section.mr');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  await mirror.locator('.mr-note[data-part="brows"]').click();
  await mirror.locator('.mr-style[data-style="bold"]').click();
  await mirror.locator('.mr-ask__go').click();
  await expect(mirror.locator('.mr-take.is-pending')).toHaveCount(4);
  await expect(mirror.locator('.mr-take:not(.is-origin):not(.is-pending)')).toHaveCount(4, { timeout: 60_000 });
  await expect(mirror.locator('.mr-stamp')).toHaveText('Simulated');
  const region = turns.find(t => t.intent.op === 'region');
  expect(region.n).toBe(4);
  expect(region.pins[0].mask).toBeTruthy();
  expect(region.pins[0].note).toContain('bold, fuller, darker brows');
  await mirror.locator('.mr-take').nth(3).click();
  await expect(mirror.locator('.mr-take').nth(3)).toHaveAttribute('aria-selected', 'true');
  await mirror.locator('.mr-keep').click();
  await expect(mirror.locator('.mr-keep')).toHaveAttribute('aria-pressed', 'true');
  await mirror.locator('.mr-turn').click();
  await expect(mirror).toHaveClass(/is-turning/, { timeout: 60_000 });
  expect(turns.find(t => t.intent.op === 'angles').n).toBe(3);
});
