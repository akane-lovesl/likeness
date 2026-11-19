/** Small steps the browser tests share. */
import { expect } from '@playwright/test';

/** Opens the desk, past the Lookbook. */
export async function open(page, path = '/?desk') {
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

/**
 * From the Lookbook, a photo brought in: the mirror opens on it. Where the browser has a camera (the suite's has a
 * fake one), the live mirror opens first and the photo is chosen from there, as a person would.
 */
export async function mirrorOn(page, sitter) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.lb-ask__photo').click();
  const live = page.locator('section.lv');
  if (await Promise.race([chooser.then(() => false), live.waitFor({ timeout: 15_000 }).then(() => true, () => false)])) await live.locator('.lv-gallery').click();
  await (await chooser).setFiles(sitter);
  await expect(page.locator('section.mr')).toBeVisible();
}

/** The studio's example people, stood in for by the drawn sitters (the real ones are rendered on the workstation). */
export async function stubExamples(page, kind = 'render') {
  const people = [['lena', 'bangs', 'curtain', 'mei'], ['kofi', 'beard', 'trimmed', 'tomas'], ['ines', 'colour', 'copper', 'ruth'], ['mei', 'brows', 'feathered', 'lena']]
    .map(([id, part, style, after]) => ({ id, name: id[0].toUpperCase() + id.slice(1), portrait: 'p/' + id + '.jpg', looks: [{ part, style, image: 'p/' + after + '.jpg', angles: ['p/tomas.jpg', 'p/ruth.jpg', 'p/ines.jpg'] }] }));
  await page.route('**/examples/manifest.json', r => r.fulfill({ json: { by: 'test', kind, people } }));
  await page.route('**/examples/p/*.jpg', r => r.fulfill({ path: 'tests/fixtures/sitters/' + r.request().url().split('/').pop() }));
}
