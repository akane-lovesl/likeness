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

test('a sentence becomes a room: the maker reads it, names it, and the room talks like it', async ({ page }) => {
  await open(page);
  await page.locator('button.starter').nth(2).click();
  await page.locator('.maker__input').fill("my grandmother's sunny kitchen in Lisbon");
  await page.keyboard.press('Enter');
  await expect(page.locator('.maker__cue')).toHaveCount(4);
  await expect(page.locator('.maker__out .postcard__name')).toHaveText('Grandmother’s Kitchen, Lisbon');
  await page.getByRole('button', { name: 'Another take' }).click();
  await expect(page.locator('.maker__by')).toContainText('take 2');
  await page.getByRole('button', { name: 'Move in' }).click();
  await expect(page.locator('textarea').first()).toHaveAttribute('placeholder', /love/);
});

test('“take me to …” in the composer moves the whole place there, and it can go back', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => document.documentElement.dataset.room);
  await page.locator('textarea').fill('take me to a rainy Tokyo jazz bar at midnight');
  await expect(page.locator('.room-pill')).toHaveText('Tokyo Jazz Bar at Midnight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('Moved to Tokyo Jazz Bar at Midnight');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.room)).not.toBe(before);
  await expect(page.locator('textarea')).toHaveAttribute('placeholder', /Hum me something/);
  await page.locator('.toast__act').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.room)).toBe(before);
});

test('a painted place can be walked into: “Take me there” makes it the room', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => document.documentElement.dataset.room);
  await say(page, 'Paint a rainy Tokyo jazz bar at midnight');
  await expect(made(page, 'Sketch')).toHaveCount(1, { timeout: 30_000 });
  const there = page.locator('button.idea--room');
  await expect(there).toHaveText('Take me there');
  await there.click();
  await expect(page.locator('.toast')).toContainText('Moved to Tokyo Jazz Bar at Midnight');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.room)).not.toBe(before);
  await expect(page.locator('button.idea--room')).toHaveCount(0);
});

test('the look camera shows the world in a look, and the shutter sends it to be painted', async ({ page }) => {
  await open(page);
  await page.locator('button.starter').first().click();
  await page.getByRole('button', { name: /Through a look/ }).click();
  await expect(page.locator('.camera__view')).toBeVisible();
  await page.locator('.camera__look').nth(2).click();
  await expect(page.locator('.camera__look[aria-selected="true"]')).not.toHaveText('As it is');
  await page.waitForTimeout(800);
  await page.locator('.camera__shutter').click();
  await expect(page.locator('section.camera')).toHaveCount(0);
  await expect(made(page, 'Sketch')).toHaveCount(1, { timeout: 30_000 });
});
