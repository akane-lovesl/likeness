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
  await page.goto('/?looks');
  await mirrorOn(page, 'tests/fixtures/sitters/kofi.jpg');
  const mirror = page.locator('section.mr');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  await mirror.locator('.mr-note[data-part="brows"]').click();
  await mirror.locator('.mr-style[data-style="bold"]').click();
  // shaped by its handle (here with the keys): the arch raised, and the words for it go to the studio
  const arch = mirror.locator('.mr-handle[data-control="arch"]');
  await arch.focus();
  for (let k = 0; k < 5; k++) await page.keyboard.press('ArrowUp');
  await expect(mirror.locator('.mr-token__shape')).toHaveText('higher arch');
  await mirror.locator('.mr-ask__go').click();
  await expect(mirror.locator('.mr-take.is-pending')).toHaveCount(4);
  // the wait, where the eyes are: a light over the part, the studio's own words, then its previews developing in place
  await expect(mirror).toHaveClass(/is-working/);
  await expect(mirror.locator('.mr-words__say')).not.toHaveText('Asked', { timeout: 20_000 });
  await expect(mirror).toHaveClass(/has-preview/, { timeout: 40_000 });
  await expect(mirror.locator('.mr-stamp')).toHaveText('Preview');
  // the first picture back is swept in across the face by the Lookbook's line of light, and the wait is over with it
  await page.waitForSelector('section.mr .mr-over.is-sweep', { timeout: 60_000 });
  await expect(mirror).not.toHaveClass(/is-working/);
  await expect(mirror.locator('.mr-stamp')).toHaveText('Simulated');
  await expect(mirror.locator('.mr-take:not(.is-origin):not(.is-pending)')).toHaveCount(4, { timeout: 60_000 });
  await expect(mirror).not.toHaveClass(/is-working/);
  await expect(mirror.locator('.mr-stamp')).toHaveText('Simulated');
  const region = turns.find(t => t.intent.op === 'region');
  expect(region.n).toBe(4);
  expect(region.pins[0].mask).toBeTruthy();
  expect(region.pins[0].note).toContain('bold, fuller, darker brows — with a higher, lifted arch');
  await mirror.locator('.mr-take').nth(3).click();
  await expect(mirror.locator('.mr-take').nth(3)).toHaveAttribute('aria-selected', 'true');
  await mirror.locator('.mr-keep').click();
  await expect(mirror.locator('.mr-keep')).toHaveAttribute('aria-pressed', 'true');
  await mirror.locator('.mr-turn').click();
  await expect(mirror).toHaveClass(/is-turning/, { timeout: 60_000 });
  expect(turns.find(t => t.intent.op === 'angles').n).toBe(3);
});

test('looks asked for one after another are made side by side; the studio list says where each stands, and opens a finished one again', async ({ page }) => {
  test.setTimeout(180_000);
  const turns = [];
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/turns')) turns.push(r.postDataJSON()); });
  await page.goto('/?looks');
  await mirrorOn(page, 'tests/fixtures/sitters/kofi.jpg');
  const mirror = page.locator('section.mr');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  await mirror.locator('.mr-note[data-part="brows"]').click();
  await mirror.locator('.mr-style[data-style="bold"]').click();
  await mirror.locator('.mr-ask__go').click();
  await expect(mirror.locator('.mr-take.is-pending')).toHaveCount(4);
  // while that is being made, another: nothing waits for the first
  await mirror.locator('.mr-part[data-part="lips"]').click();
  await mirror.locator('.mr-style[data-style="red"]').click();
  await mirror.locator('.mr-ask__go').click();
  await expect(mirror.locator('.mr-take.is-pending')).toHaveCount(8);
  await expect(page.locator('.toast')).toContainText('Making both: the studio works on them side by side');
  await expect.poll(() => turns.filter(t => t.intent.op === 'region').length).toBe(2);
  // the pill counts them; the list says what each is and how far it has got, and that leaving loses nothing
  const pill = mirror.locator('.act');
  await expect(pill).toHaveAttribute('data-n', '2');
  await pill.click();
  const rows = page.locator('.acts__row');
  await expect(rows).toHaveCount(2);
  await expect(page.locator('.acts__row[data-state="running"]')).toHaveCount(2);
  await expect(page.locator('.acts__kept')).toContainText('carries on in the studio');
  await expect(page.locator('.acts__row[data-state="done"]')).toHaveCount(2, { timeout: 120_000 });
  await page.keyboard.press('Escape');
  await expect(rows).toHaveCount(0);
  await expect(mirror.locator('.mr-take:not(.is-origin):not(.is-pending)')).toHaveCount(8, { timeout: 30_000 });
  // later, from the Lookbook: the list opens the first of them again in the mirror, its pictures there
  await mirror.locator('.mr-bar__back').click();
  await expect(mirror).toHaveCount(0);
  await page.locator('.lb-bar .act').click();
  await expect(rows).toHaveCount(2);
  await rows.nth(1).click();
  await expect(mirror.locator('.mr-take:not(.is-origin)')).toHaveCount(4);
  await expect(mirror.locator('.mr-stamp')).toHaveText('Simulated');
});

test('a look mixed from four parts, drawn on and with a reference, goes to the studio whole and comes back', async ({ page }) => {
  test.setTimeout(150_000);
  const turns = [];
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/turns')) turns.push(r.postDataJSON()); });
  await page.goto('/?looks');
  await mirrorOn(page, 'tests/fixtures/sitters/kofi.jpg');
  const mirror = page.locator('section.mr');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  // the first from the face's notes; the rest from the pills, in the dock once a part is chosen
  for (const [part, style] of [['bangs', 'curtain'], ['brows', 'bold'], ['lips', 'red'], ['colour', 'copper']]) {
    await mirror.locator((part === 'bangs' ? '.mr-note' : '.mr-part') + '[data-part="' + part + '"]').click();
    await mirror.locator('.mr-style[data-style="' + style + '"]').click();
  }
  await expect(mirror.locator('.mr-token:not(.mr-token--marks):not(.mr-token--ref)')).toHaveCount(4);
  // a ring drawn round the jaw
  await mirror.locator('.mr-ask__add').click();
  await mirror.locator('.mr-tray__do[data-do="draw"]').click();
  const box = await mirror.locator('.mr-frame').boundingBox();
  const cx = box.x + box.width * .5, cy = box.y + box.height * .62, r = box.width * .16;
  await page.mouse.move(cx + r, cy);
  await page.mouse.down();
  for (let k = 1; k <= 18; k++) await page.mouse.move(cx + r * Math.cos(k / 18 * 2 * Math.PI), cy + r * .8 * Math.sin(k / 18 * 2 * Math.PI));
  await page.mouse.up();
  await mirror.locator('.mr-drawbar__done').click();
  // and a reference
  const chooser = page.waitForEvent('filechooser');
  await mirror.locator('.mr-ask__add').click();
  await mirror.locator('.mr-tray__do[data-do="ref"]').click();
  await (await chooser).setFiles('tests/fixtures/sitters/lena.jpg');
  await mirror.locator('.mr-ask__input').fill('her fringe, and softer where it is circled');
  await mirror.locator('.mr-ask__go').click();
  await expect(mirror.locator('.mr-take.is-pending')).toHaveCount(4);
  await expect.poll(() => turns.length).toBe(1);
  // all of it, each picture by what it is, in sentences: a long note, and the studio takes it
  const [t] = turns;
  expect(t.intent.refs.map(x => x.role).sort()).toEqual(['look', 'marks']);
  expect(t.pins[0].note.length).toBeGreaterThan(300);
  expect(t.pins[0].note).toContain('Her fringe, and softer where it is circled.');
  expect(t.pins[0].note).toContain('Follow the marks');
  expect(t.pins[0].note).toMatch(/Keep everything else exactly as it is: .*background\.$/);
  await expect(mirror.locator('.mr-take:not(.is-origin):not(.is-pending)')).toHaveCount(4, { timeout: 90_000 });
  await expect(mirror.locator('.mr-stamp')).toHaveText('Simulated');
});

test('a look asked for weeks on: the studio is told what the weeks have done, and may change the fringe as far as it has grown', async ({ page }) => {
  const turns = [];
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/turns')) turns.push(r.postDataJSON()); });
  await page.goto('/?looks');
  await mirrorOn(page, 'tests/fixtures/sitters/kofi.jpg');
  const mirror = page.locator('section.mr');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  await mirror.locator('.mr-note[data-part="bangs"]').click();
  await mirror.locator('.mr-style[data-style="blunt"]').click();
  await mirror.locator('.mr-when').click();
  await expect(mirror.locator('.mr-time__head b')).toHaveText('3 weeks', { timeout: 10_000 });
  await mirror.locator('.mr-time__range').fill('6');
  await mirror.locator('.mr-ask__go').click();
  await expect(mirror.locator('.mr-take.is-pending[data-weeks="6"]')).toHaveCount(4);
  await expect.poll(() => turns.length, { timeout: 20_000 }).toBe(1);
  const [t] = turns;
  expect(t.intent.op).toBe('region');
  expect(t.pins[0].note).toContain('Show it 6 weeks after the salon: the fringe grown out about 1.7 cm since it was cut');
  await expect(mirror.locator('.mr-take:not(.is-origin):not(.is-pending)')).toHaveCount(4, { timeout: 90_000 });
  await expect(mirror.locator('.mr-stamp')).toHaveText('Simulated · 6 weeks on');
});

test('a look fitted by eye, one or two at a time, is asked for as it was fitted', async ({ page }) => {
  const turns = [];
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/turns')) turns.push(r.postDataJSON()); });
  await page.goto('/?looks');
  await mirrorOn(page, 'tests/fixtures/sitters/kofi.jpg');
  const mirror = page.locator('section.mr'), one = mirror.locator('.mr-trial__lens[data-k="0"]');
  await expect(mirror.locator('.mr-note')).toHaveCount(7, { timeout: 30_000 });
  await mirror.locator('.mr-note[data-part="bangs"]').click();
  await mirror.locator('.mr-style[data-style="curtain"]').click();
  await mirror.locator('.mr-fit').click();
  await expect(one).toHaveAttribute('aria-label', '1: Curtain, as it is', { timeout: 20_000 });
  await one.click();
  await expect(one).toHaveAttribute('aria-label', '1: longer', { timeout: 10_000 });
  await one.click();
  await expect(mirror.locator('.mr-trialcap')).toHaveText('One: longer.');
  // that is enough: Done keeps what was chosen, and it is what the studio is asked for
  await mirror.locator('.mr-trial__done').click();
  await expect(mirror).not.toHaveClass(/is-trial/);
  await expect(mirror.locator('.mr-token')).toHaveText([/^Curtain.*longer/]);
  await mirror.locator('.mr-ask__go').click();
  await expect.poll(() => turns.length, { timeout: 20_000 }).toBe(1);
  expect(turns[0].pins[0].note).toContain('longer, falling past the cheekbones');
  await expect(mirror.locator('.mr-take:not(.is-origin):not(.is-pending)')).toHaveCount(4, { timeout: 90_000 });
  await expect(mirror.locator('.mr-stamp')).toHaveText('Simulated');
});
