/** The showcase: the whole app with nothing behind it. Everything it makes is a sketch, and says so. */
import { test, expect } from '@playwright/test';
import { made, mirrorOn, open, pinAndSend, samples, say, stubExamples } from '../kit.mjs';

test('the Lookbook is the way in: a ring of looks that turns under a finger, the parts drawn, the desk a tap away', async ({ page }) => {
  await page.goto('/');
  const book = page.locator('section.book');
  await expect(book.locator('.lb-bar__edition')).toHaveText('Showcase');
  // until the studio's people are made, the ring holds drawings, and says so
  await expect(book.locator('.lb-card')).toHaveCount(8);
  await expect(book.locator('.lb-card__tag').first()).toHaveText('Drawn');
  // drawn sitters, each wearing a look, named under the ring
  await expect(book.locator('.lb-card--sitter')).toHaveCount(8);
  await expect(book.locator('.lb-caption__part')).toHaveText('BANGS · LENA');
  await expect(book.locator('.lb-caption__title')).not.toBeEmpty();
  const front = () => page.evaluate(() => [...document.querySelectorAll('.lb-card')].findIndex(c => c.classList.contains('is-front')));
  const was = await front();
  const box = await book.locator('.lb-orbit').boundingBox();
  await page.mouse.move(box.x + box.width * .75, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .25, box.y + box.height * .5, { steps: 8 });
  await page.mouse.up();
  await expect.poll(front).not.toBe(was);
  // a part deals only its own styles, drawn
  await book.locator('.lb-part[data-part="brows"]').click();
  await expect(book.locator('.lb-style')).toHaveCount(6);
  await expect(book.locator('.lb-card')).toHaveCount(6);
  await expect(book.locator('.lb-caption__part')).toHaveText('BROWS · KOFI');
  await book.locator('.lb-style[data-style="arched"]').click();
  await expect(book.locator('.lb-token')).toHaveText(['High arch']);
  await book.locator('.lb-bar__desk').click();
  await expect(book).toHaveClass(/is-away/);
  await expect(page.locator('.desk__bar .edition')).toBeVisible();
  await page.getByRole('button', { name: 'Looks' }).click();
  await expect(book).not.toHaveClass(/is-away/);
});

test('the words are read the way a stylist hears them: what to change, and how, each said in its own way', async ({ page }) => {
  await page.goto('/');
  const heard = await page.evaluate(async () => {
    const { hear } = await import('/js/looks/words.js');
    return ['Curtain bangs, a lot longer, parted left', 'softer brows and a red lip, much deeper', 'a bit shorter', 'A sleek bob, a little longer', 'make me look rested'].map(t => hear(t, 'bangs'));
  });
  expect(heard[0]).toEqual([{ part: 'bangs', style: 'curtain', shape: { length: .9, part: -.55 } }]);
  expect(heard[1]).toEqual([{ part: 'brows', style: '', shape: { arch: -.55 } }, { part: 'lips', style: 'red', shape: { shade: -.9 } }]);
  expect(heard[2]).toEqual([{ part: 'bangs', style: '', shape: { length: -.3 } }]);
  expect(heard[3]).toEqual([{ part: 'cut', style: 'bob', shape: { volume: -.55, length: .3 } }]);
  expect(heard[4]).toEqual([]);
});

test('left alone, the line says what can be asked, and the ring does it: the face it names comes round wearing it as said', async ({ page }) => {
  await page.goto('/');
  const shape = page.locator('.lb-caption__shape');
  await expect(page.locator('.lb-caption__part')).toHaveText('BANGS · LENA');
  await expect(shape).toHaveText('to the jaw', { timeout: 6_000 });
  await expect(page.locator('.lb-caption__part')).toHaveText('BROWS · KOFI', { timeout: 10_000 });
  await expect(shape).toHaveText('much fuller', { timeout: 6_000 });
});

test('words are heard as they are typed: the ring turns to the look they name, its face wears it as said, and it opens in the mirror so', async ({ page }) => {
  await page.goto('/');
  const input = page.locator('.lb-ask__input');
  await input.click();
  await input.pressSequentially('red lips, much deeper', { delay: 15 });
  await expect(page.locator('.lb-caption__part')).toHaveText('LIPS · MEI');
  await expect(page.locator('.lb-caption__shape')).toHaveText('deeper');
  await input.fill('');
  await input.pressSequentially('curtain bangs, a lot longer, parted left', { delay: 15 });
  await expect(page.locator('.lb-caption__part')).toHaveText('BANGS · LENA');
  await expect(page.locator('.lb-caption__shape')).toHaveText('to the jaw · parted left');
  await page.locator('section.book .lb-card.is-front').click({ position: { x: 40, y: 60 } });
  const mirror = page.locator('section.mr');
  await expect(mirror.locator('.mr-token')).toHaveText([/^Curtain.*to the jaw · parted left$/]);
  await expect(mirror.locator('.mr-ask__input')).toHaveValue('curtain bangs, a lot longer, parted left');
});

test('in the mirror, words pick a look and shape it as they are typed, the mirror going to each part they are about', async ({ page }) => {
  await page.goto('/');
  await mirrorOn(page, 'tests/fixtures/sitters/lena.jpg');
  const mirror = page.locator('section.mr'), input = mirror.locator('.mr-ask__input');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  await input.click();
  await input.pressSequentially('curtain bangs, a bit shorter', { delay: 15 });
  await expect(mirror).toHaveClass(/is-close/);
  await expect(mirror.locator('.mr-style[data-style="curtain"]')).toHaveAttribute('aria-selected', 'true');
  await expect(mirror.locator('.mr-handle')).toHaveCount(2);
  await expect(mirror.locator('.mr-token')).toHaveText([/^Curtain.*shorter$/]);
  await input.pressSequentially(' and a red lip', { delay: 15 });
  await expect(mirror.locator('.mr-token')).toHaveText([/^Curtain.*shorter$/, 'Red']);
  await expect(mirror.locator('.mr-style[data-style="red"]')).toHaveAttribute('aria-selected', 'true');
  // what the words stop asking for goes: the lip they added, the shape they gave
  await input.fill('curtain bangs');
  await expect(mirror.locator('.mr-token')).toHaveText(['Curtain']);
});

test('a drawn sitter wears its look in the ring, and opens in the mirror wearing it: its face known, the notes at once, and it says it is drawn', async ({ page }) => {
  await page.goto('/');
  const front = page.locator('section.book .lb-card.is-front');
  await expect(front).toHaveClass(/lb-card--sitter/);
  // the look, drawn on the face with the strokes the mirror draws
  await expect(front.locator('.lb-card__sketch path').first()).toBeAttached();
  await front.click({ position: { x: 40, y: 60 } });
  const mirror = page.locator('section.mr');
  await expect(mirror).toBeVisible();
  await expect(mirror.locator('.mr-stamp')).toHaveText(/^Drawn/);
  await expect(mirror.locator('.mr-token')).toHaveText(['Curtain']);
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 5_000 });
  await expect(mirror.locator('.mr-bar__mine')).toHaveText('On me');
});

test('the mirror reads a face, names its parts in the margin, and sketches a look over it, stamped as a sketch', async ({ page }) => {
  await page.goto('/');
  await mirrorOn(page, 'tests/fixtures/sitters/lena.jpg');
  const mirror = page.locator('section.mr');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  await expect(mirror.locator('.mr-stamp')).toHaveText('Your photo');
  await expect(mirror.locator('.mr-turn')).toBeHidden();
  await mirror.locator('.mr-note[data-part="bangs"]').click();
  await expect(mirror.locator('.mr-style')).toHaveCount(6);
  await mirror.locator('.mr-style[data-style="curtain"]').click();
  await expect(mirror).toHaveClass(/has-sketch/);
  expect(await mirror.locator('.mr-sketch path').count()).toBeGreaterThan(4);
  await mirror.locator('.mr-ask__input').fill('a little longer');
  await mirror.locator('.mr-ask__go').click();
  await expect(mirror.locator('.mr-take:not(.is-origin)')).toHaveCount(1, { timeout: 20_000 });
  await expect(mirror.locator('.mr-stamp')).toHaveText('Sketch');
  await mirror.locator('.mr-bar__back').click();
  await expect(mirror).toHaveCount(0);
  await page.locator('.lb-bar__desk').click();
  await expect(made(page, 'Sketch')).toHaveCount(1);
});

test('a chosen part brings the mirror close, and its look is shaped by hand: the words write themselves', async ({ page }) => {
  await page.goto('/');
  await mirrorOn(page, 'tests/fixtures/sitters/mei.jpg');
  const mirror = page.locator('section.mr');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  await mirror.locator('.mr-note[data-part="bangs"]').click();
  await expect(mirror).toHaveClass(/is-close/);
  await mirror.locator('.mr-style[data-style="blunt"]').click();
  const handle = mirror.locator('.mr-handle[data-control="length"]');
  await expect(handle).toBeVisible();
  const before = await mirror.locator('.mr-sketch path').last().getAttribute('d');
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 8 });
  await expect(mirror.locator('.mr-say')).toHaveClass(/is-on/);
  await page.mouse.up();
  await expect(mirror.locator('.mr-token__shape')).toHaveText(/brows|lashes/);
  expect(await mirror.locator('.mr-sketch path').last().getAttribute('d')).not.toBe(before);
  await mirror.locator('.mr-ask__go').click();
  await expect(mirror.locator('.mr-take:not(.is-origin)')).toHaveCount(1, { timeout: 20_000 });
  await expect(mirror.locator('.mr-stamp')).toHaveText('Sketch');
  // the part's pill, touched again, puts it down: no back button, the parts never leave the dock
  await mirror.locator('.mr-part[aria-pressed="true"]').click();
  await expect(mirror).not.toHaveClass(/is-close/);
  await expect(mirror.locator('.mr-styles')).toBeHidden();
});

test('the face turns under a finger, on the device, and says so while it is turned', async ({ page }) => {
  await page.goto('/');
  await mirrorOn(page, 'tests/fixtures/sitters/kofi.jpg');
  const mirror = page.locator('section.mr'), frame = mirror.locator('.mr-frame');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  await expect(mirror.locator('.mr-parts')).toBeVisible();   // the parts stay in the dock, read face or not
  await expect(mirror.locator('.mr-stamp')).toHaveText('Your photo');
  const box = await frame.boundingBox();
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .85, box.y + box.height * .45, { steps: 10 });
  await expect(frame).toHaveClass(/is-device-turn/);
  await expect(mirror.locator('.mr-stamp')).toHaveText('Turned on this device');
  expect(Number(await frame.getAttribute('data-yaw'))).toBeLessThan(-0.1);
  await page.mouse.up();
  await expect(frame).not.toHaveClass(/is-device-turn/);
  await expect(frame).toHaveAttribute('data-yaw', '0.000');
  await expect(mirror.locator('.mr-stamp')).toHaveText('Your photo');
});

test('once the studio has made its people, the ring is their faces, and a face opens on its looks and every angle', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubExamples(page);
  await page.goto('/');
  const book = page.locator('section.book');
  await expect(book.locator('.lb-card--photo')).toHaveCount(4);
  await expect(book.locator('.lb-card--photo .lb-card__tag').first()).toHaveText('GPT Image');
  await expect(book.locator('.lb-caption__part')).toHaveText('BANGS · LENA');
  await book.locator('.lb-card.is-front').click();
  const mirror = page.locator('section.mr');
  await expect(mirror.locator('.mr-take')).toHaveCount(2);
  await expect(mirror.locator('.mr-stamp')).toHaveText('GPT Image');
  await expect(mirror.locator('.mr-bar__mine')).toBeVisible();
  await mirror.locator('.mr-turn').click();
  await expect(mirror).toHaveClass(/is-turning/);
  await expect(mirror.locator('.mr-angle')).toHaveCount(2);
});

test('the studio\'s people are read on the device too: each closes on its face, and words are sketched on it and say so', async ({ page }) => {
  await stubExamples(page);
  await page.goto('/');
  const book = page.locator('section.book');
  await expect(book.locator('.lb-card--photo.has-face')).toHaveCount(4, { timeout: 30_000 });
  const input = book.locator('.lb-ask__input'), front = book.locator('.lb-card.is-front');
  await input.fill('curtain bangs, a lot longer, parted left');
  await expect(book.locator('.lb-caption__part')).toHaveText('BANGS · LENA');
  await expect(front).toHaveClass(/is-sketched/);
  await expect(front.locator('.lb-card__tag')).toHaveText('Sketch');
  await expect(front.locator('.lb-card__sketch path').first()).toBeAttached();
  await expect(book.locator('.lb-caption__shape')).toHaveText('to the jaw · parted left');
  // a colour, washed on the hair the device found
  await input.fill('copper, a shade deeper');
  await expect(book.locator('.lb-caption__part')).toHaveText('COLOUR · INES');
  await expect(front.locator('.lb-card__wash')).toHaveCount(1);
  // the words gone, the render is back, and says so
  await input.fill('');
  await expect(front).not.toHaveClass(/is-sketched/);
  await expect(front.locator('.lb-card__tag')).toHaveText('GPT Image');
  await expect(front.locator('.lb-card__sketch')).toHaveCount(0);
  // chosen while the words are on it, the mirror opens on that person with the words in its line
  await input.fill('curtain bangs, a lot longer, parted left');
  await expect(front).toHaveClass(/is-sketched/);
  await front.click();
  const mirror = page.locator('section.mr');
  await expect(mirror.locator('.mr-ask__input')).toHaveValue('curtain bangs, a lot longer, parted left');
  await expect(mirror.locator('.mr-stamp')).toHaveText('GPT Image');
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

test('one picture as the reference for another: “use @B as a reference and make @A like it”', async ({ page }) => {
  await open(page);
  await samples(page);
  await say(page, 'Use @B as a reference and make @A like it');
  await expect(page.getByText('A in B’s colours.')).toBeVisible({ timeout: 30_000 });
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

test('the proof sketches the words as they are typed, and sends the arrangement it showed', async ({ page }) => {
  await open(page);
  const box = page.locator('.composer textarea');
  await box.fill('Paint a rainy Tokyo jazz bar at midnight');
  const proof = page.locator('.proof.is-in');
  await expect(proof).toBeVisible();
  const shown = () => proof.locator('canvas').last().evaluate(c => /** @type {HTMLCanvasElement} */ (c).toDataURL());
  const first = await shown();
  await proof.click();
  await expect.poll(shown).not.toBe(first);
  await expect(box).toBeFocused();
  await box.press('Enter');
  await expect(page.locator('.proof')).not.toHaveClass(/is-in/);
  await expect(made(page, 'Sketch')).toHaveCount(1, { timeout: 30_000 });
});

test('the sun can be held: drag it under the sea and the sketch is painted again at night', async ({ page }) => {
  await open(page);
  await samples(page);
  await page.locator('figure.print').first().click();
  const sun = page.locator('button.sun');
  await expect(sun).toBeVisible();
  await sun.hover();   // waits for the picture to finish flying in
  const b = await sun.boundingBox();
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 20, b.y + b.height / 2 + 220, { steps: 10 });
  await expect(page.locator('.focus__relit.is-in')).toBeVisible();
  await page.mouse.up();
  const paint = page.locator('.focus__sundock .focus__go');
  await expect(paint).toHaveText(/Paint it at night/);
  await paint.click();
  await expect(page.getByText('A, painted again: at night.')).toBeVisible({ timeout: 30_000 });
  await expect(made(page, 'Sketch')).toHaveCount(1);
});

test('a painted picture lives while it is looked at, the night it is dragged into too, and holds still for anyone who asks for less motion', async ({ page }) => {
  await open(page);
  await samples(page);
  await page.locator('figure.print').first().click();
  const life = page.locator('.focus__life.is-in');
  await expect(life).toHaveCount(1);
  const frame = () => life.evaluate(c => /** @type {HTMLCanvasElement} */ (c).toDataURL());
  const a = await frame();
  await page.waitForTimeout(500);
  expect(await frame()).not.toBe(a);
  // the sun taken down under the sea: once let go, the night lives too
  const sun = page.locator('button.sun');
  await sun.hover();
  const b = await sun.boundingBox();
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 20, b.y + b.height / 2 + 220, { steps: 10 });
  await expect(page.locator('.focus.is-relighting')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('.focus.is-relighting')).toHaveCount(0);
  await expect(life).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.locator('figure.print').first().click();
  await expect(page.locator('button.sun')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('.focus__life')).toHaveCount(0);
});

test('a picture put somewhere gets a new backdrop: “@A on a beach in Lisbon”', async ({ page }) => {
  await open(page);
  await page.locator('button.starter').first().click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('button.bring__opt').first().click()]);
  await chooser.setFiles('tests/fixtures/sitters/ines.jpg');
  await expect(page.locator('figure.print')).toHaveCount(1);
  await page.locator('.composer textarea').fill('@A on a beach in Lisbon');
  await expect(page.locator('.plan-pill[data-k="op"]')).toHaveText('New backdrop for A');
  await page.locator('button.send').click();
  await expect(page.getByText('A, somewhere new: a beach in Lisbon.')).toBeVisible({ timeout: 30_000 });
});

test('dressing up, and a picture that remembers: on the moon in a helmet, then a superhero, then without the helmet, and the sun still moves', async ({ page }) => {
  await open(page);
  await page.locator('button.starter').first().click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('button.bring__opt').first().click()]);
  await chooser.setFiles('tests/fixtures/sitters/kofi.jpg');
  await expect(page.locator('figure.print')).toHaveCount(1);
  await page.locator('.composer textarea').fill('put @A on the moon');
  await expect(page.locator('.plan-pill[data-k="op"]')).toHaveText('New backdrop for A');
  await page.locator('button.send').click();
  await expect(page.getByText('A, on the moon, in a helmet: there’s no air up there.')).toBeVisible({ timeout: 30_000 });
  // made again from the photo, not cut out of the cut-out: still on the moon, still in the helmet
  await page.locator('.composer textarea').fill('make @B a superhero');
  await expect(page.locator('.plan-pill[data-k="op"]')).toHaveText('Dress up B');
  await expect(page.locator('.reading')).toContainText('as a superhero');
  await page.locator('button.send').click();
  await expect(page.getByText('B, as a superhero: a cape, on the moon, in a helmet: there’s no air up there.')).toBeVisible({ timeout: 30_000 });
  await page.locator('.composer textarea').fill('@C without the helmet');
  await page.locator('button.send').click();
  await expect(page.getByText('C, on the moon, without a helmet.')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('figure.print')).toHaveCount(4);
  await page.locator('figure.print').last().click();
  await expect(page.locator('.focus')).toContainText('made again from A’s photo');
  await expect(page.locator('button.sun')).toBeVisible();
});

test('someone put somewhere can be picked up and walked back into the place', async ({ page }) => {
  await open(page);
  await page.locator('button.starter').first().click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('button.bring__opt').first().click()]);
  await chooser.setFiles('tests/fixtures/sitters/kofi.jpg');
  await expect(page.locator('figure.print')).toHaveCount(1);
  await page.locator('button.chip.idea', { hasText: 'Put them on the moon' }).click();
  await expect(page.getByText('A, on the moon, in a helmet: there’s no air up there.')).toBeVisible({ timeout: 30_000 });
  await page.locator('figure.print').last().click();
  const pic = page.locator('.focus__pic');
  await expect(page.locator('button.walk')).toBeAttached();
  await pic.hover();   // waits for the picture to finish flying in
  const b = await pic.boundingBox();
  await page.mouse.move(b.x + b.width * .5, b.y + b.height * .8);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * .2, b.y + b.height * .5, { steps: 12 });
  await expect(page.locator('.focus__walk.is-in')).toBeVisible();
  await page.mouse.up();
  await page.locator('.focus__walkdock .focus__go').click();
  await expect(page.getByText(/B, (?:far |further )back and to the left\./)).toBeVisible({ timeout: 30_000 });
  // and its making can be kept as a short film, watched as it saves
  await page.locator('figure.print').last().click();
  await page.locator('.tool', { hasText: 'Save' }).click();
  const [film] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.locator('.bring__opt', { hasText: 'How it was made' }).click()]);
  expect(film.suggestedFilename()).toMatch(/^likeness-c-making\.(webm|mp4)$/);
});

test('a famous place looks like itself and lives its own way: Paris at night, the tower sparkling over the roofs', async ({ page }) => {
  await open(page);
  await say(page, 'Paris at night');
  await expect(page.getByText(/A first sketch of Paris at night: the tower sparkling over the roofs/)).toBeVisible({ timeout: 30_000 });
  await page.locator('figure.print').last().click();
  await expect(page.locator('.focus__life.is-in')).toHaveCount(1);
});

test('a picture you can look into: Paris behind them in planes, the sun waiting at the horizon, and holding it shows what it was made from', async ({ page }) => {
  await open(page);
  await page.locator('button.starter').first().click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('button.bring__opt').first().click()]);
  await chooser.setFiles('tests/fixtures/sitters/kofi.jpg');
  await expect(page.locator('figure.print')).toHaveCount(1);
  await say(page, '@A in Paris at night');
  await expect(made(page, 'Sketch')).toHaveCount(1, { timeout: 40_000 });
  await page.locator('figure.print').last().click();
  // the sky, the town, the things in it and them in front, each moving its own way
  await expect(page.locator('.focus__life.is-in[data-depth]')).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator('.focus__detail')).toHaveText('Drawn on this device');
  // after dark the sun waits just under the horizon, not down over them
  const pic = await page.locator('.focus__pic').boundingBox();
  const sun = await page.locator('button.sun').boundingBox();
  expect((sun.y + sun.height / 2 - pic.y) / pic.height).toBeLessThan(.7);
  // hold the sky: the picture it was made from, said on it
  await page.mouse.move(pic.x + pic.width * .9, pic.y + pic.height * .08);
  await page.mouse.down();
  await expect(page.locator('.focus__pic[data-was="A"]')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('.focus__pic[data-was]')).toHaveCount(0);
  // done once, it is not explained again
  await page.locator('.focus__close').click();
  await expect(page.locator('section.focus')).toHaveCount(0);
  await page.locator('figure.print').last().click();
  await expect(page.locator('.focus__hint--lineage .lineage')).toBeVisible();
  await expect(page.locator('.lineage__tip')).toHaveCount(0);
});

test('the place lights them: under the sea its light nets over them as it moves', async ({ page }) => {
  await open(page);
  await page.locator('button.starter').first().click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('button.bring__opt').first().click()]);
  await chooser.setFiles('tests/fixtures/sitters/ruth.jpg');
  await expect(page.locator('figure.print')).toHaveCount(1);
  await say(page, '@A under the sea');
  await expect(made(page, 'Sketch')).toHaveCount(1, { timeout: 40_000 });
  await page.locator('figure.print').last().click();
  await expect(page.locator('.focus__life.is-in[data-lights~="caustic"]')).toHaveCount(1, { timeout: 20_000 });
});

test('light multiplies what it falls on: night darkens and cools them, the side toward a light is brighter, dark hair stays dark', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const L = await import('/js/studio/light.js');
    // someone, as a disc: a pale shirt colour, with a dark band for hair across the top
    const c = document.createElement('canvas'); c.width = 200; c.height = 200; const x = c.getContext('2d');
    x.fillStyle = '#e8e4dc'; x.beginPath(); x.arc(100, 110, 80, 0, Math.PI * 2); x.fill(); x.fillStyle = '#141210'; x.fillRect(40, 40, 120, 26);
    const at = (cv, px, py) => Array.from(cv.getContext('2d').getImageData(px, py, 1, 1).data);
    const night = { amb: '#20305e', ak: .36, exp: .8, keys: [{ x: 1.2, y: .4, c: '#bcd0ff', k: .18 }], rim: 0, rc: '#ffffff', wrap: 0, haze: null, hk: 0, moves: [] };
    const side = { amb: '#ffffff', ak: 0, exp: 1, keys: [{ x: -.3, y: .5, c: '#ffffff', k: .4 }], rim: 0, rc: '#ffffff', wrap: 0, haze: null, hk: 0, moves: [] };
    const n = L.relight(c, night), s = L.relight(c, side);
    return { before: at(c, 100, 130), night: at(n, 100, 130), left: at(s, 45, 130), right: at(s, 155, 130), hair: at(s, 60, 50) };
  });
  const lum = (p) => p[0] * .3 + p[1] * .59 + p[2] * .11;
  expect(lum(r.night)).toBeLessThan(lum(r.before) * .9);
  expect(r.night[2] - r.night[0]).toBeGreaterThan(r.before[2] - r.before[0]);
  expect(lum(r.left)).toBeGreaterThan(lum(r.right) + 20);
  expect(lum(r.hair)).toBeLessThan(40);
});

test('a trip: someone taken to four places at once, a sheet that lives, and a film where the world changes behind them', async ({ page }) => {
  await open(page);
  await page.locator('button.starter').first().click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('button.bring__opt').first().click()]);
  await chooser.setFiles('tests/fixtures/sitters/tomas.jpg');
  await expect(page.locator('figure.print')).toHaveCount(1);
  await page.locator('.composer textarea').fill('take @A to Lisbon, Kyoto and the moon');
  await expect(page.locator('.plan-pill[data-k="op"]')).toHaveText('A trip for A');
  await page.locator('.composer textarea').fill('take @A on a trip');
  await page.locator('button.send').click();
  await expect(page.getByText('A, on a trip: Lisbon at dawn, Tokyo at night, the moon in a helmet, and under the sea in a helmet.')).toBeVisible({ timeout: 40_000 });
  await expect(made(page, 'Sketch')).toHaveCount(1);
  await page.locator('figure.print').last().click();
  await expect(page.locator('.focus__life.is-in')).toHaveCount(1);
  await page.locator('.tool', { hasText: 'Save' }).click();
  const [film] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.locator('.bring__opt', { hasText: 'The trip' }).click()]);
  expect(film.suggestedFilename()).toMatch(/^likeness-b-trip\.(mp4|webm)$/);
});

test('the device does what it honestly can to a photo, and says plainly when it cannot', async ({ page }) => {
  await open(page);
  await page.locator('button.starter').first().click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('button.bring__opt').first().click()]);
  await chooser.setFiles('tests/fixtures/sitters/mei.jpg');
  await expect(page.locator('figure.print')).toHaveCount(1);
  await say(page, 'remove the background from @A');
  await expect(page.getByText('A, cut out: the background is gone.')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('figure.print[data-alpha]')).toHaveCount(1);
  await say(page, 'make @A smile');
  await expect(page.getByText(/A sketch can’t do “make A smile”/)).toBeVisible({ timeout: 30_000 });
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
