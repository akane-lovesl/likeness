/** The portrait studio against a live studio (the simulator): the same three taps, a portrait that says it is a
stand-in, and a studio that keeps what it made for this device. */
import { test, expect } from '@playwright/test';

test('a portrait painted by the live studio says it is simulated, and the studio keeps it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('section.ph .edition')).toContainText('Live · Simulator');
  await expect(page.locator('.ph-eta')).toContainText('simulated stand-in');
  await page.locator('.ph-go').click();
  await page.locator('.cr-face[data-who="priya"]').click();
  await page.locator('.cr-link').click();
  await page.locator('.cr-seg__opt[data-id="avatar"]').click();
  await page.locator('.cr-go').click();
  await expect(page.locator('.cr-time')).not.toBeEmpty();
  await expect(page.locator('section.cr')).toHaveAttribute('data-step', 'result', { timeout: 30000 });
  await expect(page.locator('.cr-stamp')).toContainText('Simulated stand-in');
  await expect(page.locator('.cr-frame')).toHaveAttribute('data-shape', 'square');   // an avatar comes back square
  const made = await page.evaluate(() => fetch('api/history').then(r => r.json()));
  expect(made.made.length).toBeGreaterThan(0);
  expect(made.made[0].prompt).toContain('square avatar');
});
