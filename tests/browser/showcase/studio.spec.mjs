/** The showcase: the whole app with nothing behind it. Everything it makes is a sketch, and says so. */
import { test, expect } from '@playwright/test';
import { made, open, pinAndSend, samples, say } from '../kit.mjs';

test('the welcome walks you in, and the room you pick is the room you get', async ({ page }) => {
  await page.goto('/');
  const welcome = page.locator('section.welcome');
  await expect(welcome).toContainText('Showcase');
  await page.locator('.welcome__next').click();
  const card = page.locator('.welcome__rooms .postcard').nth(2);
  const id = await card.getAttribute('data-room');
  await card.click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.room)).toBe(id);
  await page.locator('.welcome__next').click();
  await page.locator('button.mood').nth(1).click();
  await page.locator('.welcome__next').click();
  await page.locator('.welcome__next').click();
  await expect(welcome).toHaveCount(0);
  await page.reload();
  await expect(page.locator('section.welcome')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.dataset.room)).toBe(id);
});

test('words become a sketch, and the sketch says what it is', async ({ page }) => {
  await open(page);
  await expect(page.locator('.edition')).toHaveText(/Showcase/);
  await say(page, 'A lighthouse inside a teacup, at dusk');
  await expect(page.locator('.job__stage')).toBeVisible();
  await expect(made(page, 'Sketch')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('button.chip.idea').first()).toBeVisible();
});

test('Stop stops a turn before anything lands', async ({ page }) => {
  await open(page);
  await say(page, 'A greenhouse full of ferns');
  await page.locator('button.job__stop').click();
  await expect(page.locator('.job__stage', { hasText: 'Stopped.' })).toBeVisible();
  await page.waitForTimeout(4000);
  await expect(made(page, 'Sketch')).toHaveCount(0);
});

test('the composer reads what you mean before you send it', async ({ page }) => {
  await open(page);
  await samples(page);
  await page.locator('textarea').fill('@A as a watercolour');
  await expect(page.locator('.reading .plan-pill').first()).toHaveText(/Restyle/);
  await expect(page.locator('.reading')).toContainText('A');
});

test('a pinned part of a picture is what changes', async ({ page }) => {
  await open(page);
  await samples(page);
  await pinAndSend(page, 'make it golden');
  await expect(made(page, 'Sketch')).toHaveCount(1, { timeout: 30_000 });
});

test('changing the room changes the whole place', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ground'));
  await page.locator('button.starter').nth(2).click();
  const card = page.locator('.sheet .postcard:not([aria-current="true"])').nth(1);
  const id = await card.getAttribute('data-room');
  await card.click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.room)).toBe(id);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ground'))).not.toBe(before);
});
