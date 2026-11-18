/** Small steps the browser tests share. */
import { expect } from '@playwright/test';

/** Opens the desk, past the welcome. */
export async function open(page, path = '/?skipwelcome') {
  await page.goto(path);
  await expect(page.locator('.desk__bar .edition')).toBeVisible();
}

/** Says something to the studio and sends it. */
export async function say(page, text) {
  await page.locator('.composer textarea, textarea').first().fill(text);
  await page.locator('button.send').click();
}

/** Puts the two sample pictures on the desk. */
export async function samples(page) {
  await page.getByRole('button', { name: 'or play with two sample pictures' }).click();
  await expect(page.locator('figure.print')).toHaveCount(2);
}

/** Pictures the studio made, by the label they carry. */
export const made = (page, label) => page.locator('figure.print .print__stamp', { hasText: label });

/** Opens a picture, pins a part of it, says what it should become, and sends. */
export async function pinAndSend(page, note) {
  await page.locator('figure.print').first().click();
  await page.locator('.focus button.tool').first().click();
  const box = await page.locator('.focus__pic').boundingBox();
  await page.mouse.click(box.x + box.width * .3, box.y + box.height * .32);
  await page.locator('.bubble input').fill(note);
  await page.keyboard.press('Enter');
  await page.locator('button.focus__send').click();
}
