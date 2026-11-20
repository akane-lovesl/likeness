/** The portrait studio, as a first-time visitor meets it: the styles first, the app dressed in the one in front, a
portrait painted in three taps, every choice undoable, the phone's back going back, and nothing lost. */
import { test, expect } from '@playwright/test';

/** The plates, moved so the n-th stands in the middle. */
const toPlate = (page, n) => page.locator('.ph-track').evaluate((t, i) => { const p = t.querySelectorAll('.ph-plate')[i]; t.scrollTo({ left: p.offsetLeft + p.offsetWidth / 2 - t.clientWidth / 2 }); }, n);

test('the first screen leads with the styles, and the whole app wears the one in front', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('section.ph')).toBeVisible();
  await expect(page.locator('.ph-plate')).toHaveCount(9);   // eight styles and one of your own
  await expect(page.locator('.ph-name')).toHaveText('Little Princess');
  await expect(page.locator('html')).toHaveAttribute('data-room', 'princess');
  // each plate says where it came from: the photograph beside the portrait
  await expect(page.locator('.ph-plate.is-front .ph-before')).toBeVisible();
  await expect(page.locator('.ph-plate.is-front .ph-art')).toHaveJSProperty('complete', true);
  await toPlate(page, 3);
  await expect(page.locator('.ph-name')).toHaveText('Old Master');
  await expect(page.locator('html')).toHaveAttribute('data-room', 'gilded', { timeout: 5000 });
  await expect(page.locator('.tabs__tab[aria-current="page"]')).toHaveText('Styles');
  // a reload comes back to the same style, in its room
  await page.reload();
  await expect(page.locator('.ph-name')).toHaveText('Old Master');
  await expect(page.locator('html')).toHaveAttribute('data-room', 'gilded');
});

test('a portrait in three taps: a style, a face, paint; honestly a sketch here, and kept in Mine', async ({ page }) => {
  await page.goto('/');
  await page.locator('.ph-go').click();
  await expect(page.locator('section.cr')).toHaveAttribute('data-step', 'photo');
  await page.locator('.cr-face[data-who="kenji"]').click();
  await expect(page.locator('.cr-frame')).toHaveAttribute('data-show', 'photo');
  await page.locator('.cr-go').click();
  await expect(page.locator('section.cr')).toHaveAttribute('data-step', 'paint');
  await expect(page.locator('.cr-stage-words')).not.toBeEmpty();
  await expect(page.locator('section.cr')).toHaveAttribute('data-step', 'result', { timeout: 15000 });
  await expect(page.locator('.cr-stamp')).toContainText('Sketch drawn on this phone');
  await expect(page.locator('.cr-art')).toHaveJSProperty('complete', true);
  await page.locator('.cr-cta .btn').click();
  await expect(page.locator('section.mine')).toBeVisible();
  await expect(page.locator('.mine-tile')).toHaveCount(1);
  await expect(page.locator('.mine-tile__state')).toHaveText('Sketch');
  // nothing is lost: after a reload it is still there, and opens on its result
  await page.reload();
  await expect(page.locator('.mine-tile')).toHaveCount(1);
  await page.locator('.mine-tile').click();
  await expect(page.locator('section.cr')).toHaveAttribute('data-step', 'result');
});

test('every choice can be undone and redone, and the sketch follows', async ({ page }) => {
  await page.goto('/#/create/princess');
  await page.locator('.cr-face[data-who="ama"]').click();
  await page.locator('.cr-link').click();
  await expect(page.locator('section.cr')).toHaveAttribute('data-step', 'tune');
  const lilac = page.locator('.cr-tile[data-key="palette"][data-id="lilac"]'), blush = page.locator('.cr-tile[data-key="palette"][data-id="blush"]');
  await expect(blush).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.cr-undo')).toBeDisabled();
  await lilac.click();
  await expect(lilac).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.cr-chips')).toContainText('Lilac');
  await page.locator('.cr-chip[data-id="pearls"]').click();
  await expect(page.locator('.cr-chip[data-id="pearls"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.cr-undo').click();
  await expect(page.locator('.cr-chip[data-id="pearls"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('.cr-undo').click();
  await expect(blush).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.cr-undo')).toBeDisabled();
  await page.locator('.cr-redo').click();
  await expect(lilac).toHaveAttribute('aria-checked', 'true');
  // a mistap is one touch from undone: the note says what changed and offers to undo it
  await page.locator('.cr-tile[data-key="mood"][data-id="regal"]').click();
  await page.locator('.toast__act').click();
  await expect(page.locator('.cr-tile[data-key="mood"][data-id="serene"]')).toHaveAttribute('aria-checked', 'true');
});

test('the phone\'s back goes back a step, then a screen, and the ← does the same', async ({ page }) => {
  await page.goto('/');
  await page.locator('.ph-go').click();
  await page.locator('.cr-face[data-who="noor"]').click();
  await page.locator('.cr-link').click();
  await expect(page.locator('section.cr')).toHaveAttribute('data-step', 'tune');
  await page.goBack();
  await expect(page.locator('section.cr')).toHaveAttribute('data-step', 'photo');
  await expect(page.locator('.cr-frame')).toHaveAttribute('data-show', 'photo');   // the photo is still chosen
  await page.locator('.cr-back').click();
  await expect(page.locator('section.ph')).toBeVisible();
  await expect(page.locator('section.cr')).toHaveCount(0);
  // the Studio tab, and back from it
  await page.locator('.tabs__tab[data-tab="desk"]').click();
  await expect(page.locator('section.ph')).toHaveCount(0);
  await page.locator('.desk__home').click();
  await expect(page.locator('section.ph')).toBeVisible();
});

test('the keyboard never squashes the page: the stage keeps its height, and notes open at the top', async ({ page }) => {
  await page.goto('/#/create/storybook');
  await page.locator('.cr-face[data-who="mateus"]').click();
  await page.locator('.cr-link').click();
  const before = await page.locator('#stage').boundingBox();
  await page.locator('.cr-note-btn').last().click();
  const field = page.locator('.cr-note__field');
  await expect(field).toBeFocused();
  // a browser that shrinks the page for the keyboard
  await page.setViewportSize({ width: 360, height: 380 });
  await page.waitForTimeout(300);
  const during = await page.locator('#stage').boundingBox();
  expect(Math.round(during.height)).toBe(Math.round(before.height));
  expect(Math.round(during.width)).toBe(Math.round(before.width));
  const card = await page.locator('.cr-note').boundingBox();
  expect(card.y + card.height).toBeLessThan(380);   // what you type is above the keyboard
  await field.fill('holding a cup of tea');
  await page.keyboard.press('Enter');
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(page.locator('.cr-chips')).toContainText('');
  await expect(page.locator('.cr-note-btn q')).toHaveText('holding a cup of tea');
});

test('Mine keeps the conversations too, and your space can be named and backed up', async ({ page }) => {
  await page.goto('/#/mine');
  await expect(page.locator('.mine-empty h2')).toHaveText('Nothing painted yet');
  await page.locator('.mine-seg__opt[data-tab="talks"]').click();
  await expect(page.locator('.mine-empty h2')).toHaveText('No conversations yet');
  await page.locator('.mine-who').click();
  await page.locator('.space__name').fill('Akane');
  await page.locator('.space__name').press('Enter');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.likeness\.json$/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.mine-who b')).toHaveText('Akane');
});
