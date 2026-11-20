/**
 * Painting a portrait, one clear step at a time: your photo, the style made yours, the painting, the result. Each step
 * is an entry in the history (the phone's back goes back a step), every choice can be undone, and nothing is lost: the
 * portrait is kept the moment it is asked for, painted on if you leave, and found again after a reload.
 *
 * Waiting is shown, never hidden: a sketch of you in the style at once (made on this phone, and labelled so), the
 * studio's own stages in the room's voice, an honest time left, the picture as it develops, and Stop.
 */
import { h, icon, toast, sheet, uid, eta as etaSaid, chooseFiles } from '../core/dom.js';
import { go, step as pushStep, restep, back, here } from '../core/nav.js';
import { settings } from '../core/store.js';
import { reduced } from '../core/motion.js';
import { roomById, changeRoom } from '../room/atmosphere.js';
import { atmosphere } from '../room/theme.js';
import { studio } from '../studio/studio.js';
import { addPrint, addItem } from '../state.js';
import { STYLES, FORMATS, styleById, formatOf, defaultsOf, promptFor, ownPrompt, captionOf } from './styles.js';
import { study, bitmap, blobOf } from './sketch.js';
import { sit, sitting as sittingById, sittings, keep, portrait as portraitById, urlOf } from './keep.js';
import { catalogue, artOf, photoOf, etaLine, SAMPLES } from './common.js';

/** @typedef {import('./styles.js').Style} Style @typedef {import('./styles.js').Picks} Picks @typedef {import('./keep.js').Portrait} Portrait */
/** @typedef {{ picks: Picks, reference: Blob | null }} Choices */

const STEPS = [['photo', 'Photo'], ['tune', 'Style it'], ['paint', 'Painting']];
const KIND_SAID = { render: 'Painted by your studio', simulated: 'Simulated stand-in · not a real painting', sketch: 'Sketch drawn on this phone · your studio paints the real one' };
/** Portraits being painted now, by id: the page may leave the screen that asked, and come back. */
const painting = new Map();

/** A photo brought to a sensible size for the studio, upright. @param {Blob} blob */
async function prepared(blob) {
  const b = await bitmap(blob), s = Math.min(1, 1600 / Math.max(b.width, b.height));
  const c = document.createElement('canvas'); c.width = Math.round(b.width * s); c.height = Math.round(b.height * s);
  /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).drawImage(b, 0, 0, c.width, c.height);
  return { blob: await blobOf(c, 'image/jpeg', .92), bmp: c };
}

export function createScreen(/** @type {Record<string, any>} */ params = {}) {
  /** @type {Style | null} */ let style = styleById(params.id) || (params.id === 'own' ? null : STYLES[0]);
  /** @type {Picks} */ let picks = loadPicks();
  /** @type {{ blob: Blob, bmp: any, id: string, sample?: string } | null} */ let photo = null;
  /** @type {Blob | null} */ let reference = null;
  /** @type {Portrait | null} */ let shown = null;
  /** @type {Choices[]} */ const past = [], future = [];
  let stepNow = 'photo';
  let submitting = false;

  // ---- the frame: the photo, the sketch, the painting, one over the other ----
  const photoImg = h('img.cr-photo', { alt: 'Your photo' });
  const studyBox = h('div.cr-study');
  const artImg = h('img.cr-art', { alt: '' });
  const partial = h('img.cr-partial', { alt: '' });
  const guide = h('div.cr-guide', null, h('span.cr-guide__oval'), h('span.cr-guide__words', null, 'Your photo goes here'));
  const meter = h('div.cr-meter', { role: 'progressbar', 'aria-label': 'Painting', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i'));
  const frame = h('div.cr-frame', { data: { frame: roomOf().frame } }, guide, photoImg, studyBox, partial, artImg, h('div.cr-shine', { 'aria-hidden': 'true' }), meter);
  const stamp = h('p.cr-stamp');
  const chips = h('p.cr-chips');
  holdToCompare(frame);

  // ---- the bar: back, where you are, undo and redo, close ----
  const undoBtn = h('button.icon-btn.cr-undo', { type: 'button', 'aria-label': 'Undo', title: 'Undo', html: icon('undo'), onclick: () => undo() });
  const redoBtn = h('button.icon-btn.cr-redo', { type: 'button', 'aria-label': 'Redo', title: 'Redo', html: icon('undo', 'is-flipped'), onclick: () => redo() });
  const stepsEl = h('ol.cr-steps', { 'aria-label': 'Steps' }, ...STEPS.map(([id, label], i) => h('li', { data: { step: id } }, h('b', null, String(i + 1)), h('span', null, label))));
  const bar = h('header.cr-bar', null,
    h('button.icon-btn.cr-back', { type: 'button', 'aria-label': 'Back', html: icon('back'), onclick: () => back() }),
    stepsEl, h('div.cr-tools', null, undoBtn, redoBtn),
    h('button.icon-btn.cr-close', { type: 'button', 'aria-label': 'Close', html: icon('close'), onclick: () => go('home') }));

  const panel = h('div.cr-panel');
  const cta = h('div.cr-cta');
  const el = h('section.screen.cr', { 'aria-label': 'Paint a portrait', data: { step: 'photo', style: style?.id || 'own' } },
    bar, h('div.cr-stage', null, frame, stamp, chips), panel, cta);

  function roomOf() { return roomById(style?.room || 'atelier'); }
  function loadPicks() { return style ? { ...defaultsOf(style), ...settings.get('picks.' + style.id, {}) } : { ...defaultsOf(STYLES[0]), format: 'portrait', words: settings.get('own.words', '') }; }
  const savePicks = () => { if (style) settings.set('picks.' + style.id, picks); else settings.set('own.words', picks.words); };
  const snapshot = () => ({ picks: { ...picks }, reference });

  // ---- steps ----
  function render(stepName) {
    stepNow = stepName;
    el.dataset.step = stepName; el.dataset.style = style?.id || 'own';
    frame.dataset.frame = roomOf().frame;
    frame.classList.toggle('is-painting', stepName === 'paint' && shown?.state === 'painting');
    stepsEl.querySelectorAll('li').forEach((li, i) => { const k = STEPS.findIndex(s => s[0] === (stepName === 'result' ? 'paint' : stepName)); li.classList.toggle('is-done', i < k || stepName === 'result'); li.classList.toggle('is-on', i === k && stepName !== 'result'); });
    bar.querySelector('.cr-tools').hidden = stepName !== 'tune';
    if (stepName === 'photo') photoStep();
    else if (stepName === 'tune') tuneStep();
    else if (stepName === 'paint') paintStep();
    else if (stepName === 'result') resultStep();
  }
  function to(/** @type {string} */ name) { if (!photo && name !== 'photo') name = 'photo'; pushStep(name); render(name); }

  /** Step one: a face to paint, from the camera, the photos, a photo used before, or one of the studio's people. */
  function photoStep() {
    showFrame(photo ? 'photo' : 'guide');
    stamp.textContent = ''; chips.textContent = '';
    const take = h('button.cr-big', { type: 'button', onclick: () => choose(true) }, h('span', { html: icon('camera') }), h('b', null, 'Take a selfie'));
    const pickBtn = h('button.cr-big', { type: 'button', onclick: () => choose(false) }, h('span', { html: icon('image') }), h('b', null, 'Choose a photo'));
    const faces = h('div.cr-faces', { role: 'list' });
    const lede = photo ? 'Looks good. A clear face, in soft light, paints best.' : 'One clear photo of a face. Soft light, looking at the camera.';
    panel.replaceChildren(
      h('h2.cr-title', null, photo ? 'Your photo' : 'Add your photo'),
      h('p.cr-lede', null, lede),
      h('div.cr-bigs', null, take, pickBtn),
      h('p.cr-label', null, 'Or try a face'), faces);
    sittings().then(list => {
      const mine = list.filter(s => !s.sample).slice(0, 4);
      faces.replaceChildren(...mine.map(s => faceBtn(urlOf(s), 'A photo you used before', () => usePhoto(s.blob, s.id))),
        ...SAMPLES.map(who => faceBtn(photoOf(who), 'Sample face: ' + who[0].toUpperCase() + who.slice(1), async () => usePhoto(await (await fetch(photoOf(who))).blob(), '', who), who)));
    });
    cta.replaceChildren(...(photo
      ? [h('button.btn.btn--accent.btn--wide.cr-go', { type: 'button', onclick: () => paint() }, h('span', { html: icon('sparkle') }), 'Paint my portrait'),
        h('button.cr-link', { type: 'button', onclick: () => to('tune') }, style ? 'Style it first: palette, details, backdrop' : 'Describe your style first', h('span', { html: icon('arrow') }))]
      : [h('p.cr-hint', null, style ? 'Next, you can style it: palette, mood, details and backdrop.' : 'Next, describe your style or show a picture of it.')]));
  }
  const faceBtn = (src, label, run, who = '') => h('button.cr-face', { type: 'button', role: 'listitem', 'aria-label': label, data: { who }, 'aria-pressed': String(!!who && photo?.sample === who), onclick: run }, h('img', { alt: '', src, loading: 'lazy' }));
  async function choose(selfie) {
    const [f] = await chooseFiles({ multiple: false, capture: selfie ? 'user' : false });
    if (f) usePhoto(f);
  }
  /** @param {Blob} blob @param {string} [known] a sitting already kept @param {string} [sample] */
  async function usePhoto(blob, known = '', sample = '') {
    try {
      const { blob: b, bmp } = await prepared(blob);
      const id = known || (await sit(b, sample)).id;
      photo = { blob: b, bmp, id, sample };
      photoImg.src = URL.createObjectURL(b);
      drawStudy();
      render(stepNow === 'photo' ? 'photo' : stepNow);
      if (!reduced) frame.animate([{ transform: 'scale(.96)', opacity: .6 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    } catch { toast('That photo could not be opened. Try another.'); }
  }

  /** Step two: the style made yours. Every tap shows at once, and can be undone. */
  function tuneStep() {
    showFrame('study'); drawStudy();
    stamp.textContent = 'Preview sketch · the painting will be far richer';
    syncChips();
    const sections = style ? tuneSections(style) : ownSections();
    panel.replaceChildren(h('div.cr-tune', null, ...sections));
    syncUndo();
    cta.replaceChildren(h('button.btn.btn--accent.btn--wide.cr-go', { type: 'button', onclick: () => paint() }, h('span', { html: icon('sparkle') }), 'Paint my portrait'), h('p.cr-eta', null, etaLine()));
  }
  /** @param {Style} s */
  function tuneSections(s) {
    const t = s.tune;
    const one = (/** @type {keyof Picks} */ key, /** @type {any[]} */ list, /** @type {string} */ title, cls = '') => section(title, h('div.cr-tiles' + cls, { role: 'radiogroup', 'aria-label': title },
      ...list.map(c => h('button.cr-tile', { type: 'button', role: 'radio', data: { key, id: c.id }, 'aria-checked': String(picks[key] === c.id), onclick: () => change(() => { picks[key] = /** @type {never} */ (c.id); }, title + ': ' + c.label) },
        c.swatch ? h('span.cr-swatch', null, ...c.swatch.map(col => h('i', { style: { background: col } }))) : null, h('span', null, c.label)))));
    const details = section('Details', h('div.cr-chiprow', { role: 'group', 'aria-label': 'Details' },
      ...t.details.map(c => h('button.cr-chip', { type: 'button', data: { key: 'details', id: c.id }, 'aria-pressed': String(picks.details.includes(c.id)), onclick: () => change(() => { picks.details = picks.details.includes(c.id) ? picks.details.filter(x => x !== c.id) : [...picks.details, c.id]; }, (picks.details.includes(c.id) ? 'Without ' : 'With ') + c.label.toLowerCase()) }, c.label))),
      'As many as you like');
    return [one('palette', t.palette, 'Palette', '.cr-tiles--swatch'), one('mood', t.mood, 'Mood'), details, one('backdrop', t.backdrop, 'Backdrop'), formatSection(), likenessSection(), wordsSection()];
  }
  function ownSections() {
    const refBtn = h('button.cr-big.cr-big--wide', { type: 'button', onclick: async () => {
      const [file] = await chooseFiles({ multiple: false });
      if (!file) return;
      try {
        const { blob } = await prepared(file);
        change(() => { reference = blob; }, 'Reference added');
        tuneStep();
      } catch { toast('That picture could not be opened. Try another.'); }
    } }, reference ? h('img.cr-refimg', { alt: '', src: URL.createObjectURL(reference) }) : h('span', { html: icon('image') }), h('b', null, reference ? 'Change the style reference' : 'Show a picture of the style'));
    return [section('Your style in words', noteButton(picks.words, 'Watercolour on brown paper, gold leaf, autumn light…', w => change(() => { picks.words = w; }, w ? 'Note added' : 'Note removed'))),
      section('Or show it', refBtn, 'A painting, a poster, a screenshot: its look, not its subject'), formatSection(), likenessSection()];
  }
  function formatSection() {
    return section('Format', h('div.cr-seg', { role: 'radiogroup', 'aria-label': 'Format' }, ...FORMATS.map(f => h('button.cr-seg__opt', { type: 'button', role: 'radio', data: { key: 'format', id: f.id }, 'aria-checked': String(picks.format === f.id), onclick: () => change(() => { picks.format = f.id; }, 'Format: ' + f.label) }, h('i.cr-shape', { data: { shape: f.aspect } }), f.label))));
  }
  function likenessSection() {
    const range = /** @type {HTMLInputElement} */ (h('input.cr-range', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(picks.likeness * 100)), 'aria-label': 'How closely it keeps your face' }));
    /** @type {Choices | null} */ let before = null;
    range.addEventListener('input', () => {
      before ||= snapshot();
      picks.likeness = Number(range.value) / 100;
    });
    range.addEventListener('change', () => {
      if (before && before.picks.likeness !== picks.likeness) { past.push(before); future.length = 0; }
      before = null; savePicks(); syncUndo();
    });
    return section('Likeness', h('div.cr-rangebox', null, h('span', null, 'Free'), range, h('span', null, 'Faithful')), 'How closely the painting keeps your face');
  }
  function wordsSection() { return section('Anything else?', noteButton(picks.words, 'Holding a teacup, golden earrings…', w => change(() => { picks.words = w; }, w ? 'Note added' : 'Note removed'))); }
  /** A button that opens a note card at the top of the screen (so the keyboard never covers what you type). */
  function noteButton(/** @type {string} */ value, /** @type {string} */ hint, /** @type {(w: string) => void} */ set) {
    return h('button.cr-note-btn', { type: 'button', onclick: () => note(value, hint, w => { set(w); render(stepNow); }) }, value ? h('q', null, value) : h('span.t-soft', null, hint), h('span', { html: icon('feather') }));
  }
  function note(value, hint, done) {
    const field = /** @type {HTMLTextAreaElement} */ (h('textarea.cr-note__field', { rows: 3, maxlength: 400, placeholder: hint, 'aria-label': 'Your words' }));
    field.value = value;
    const shut = (/** @type {boolean} */ keepIt) => { card.classList.remove('is-in'); scrim.classList.remove('is-in'); setTimeout(() => { card.remove(); scrim.remove(); }, 200); if (keepIt) done(field.value.trim()); };
    const scrim = h('div.cr-note__scrim', { onclick: () => shut(true) });
    const card = h('div.cr-note', { role: 'dialog', 'aria-label': 'Your words' }, field, h('div.cr-note__acts', null, h('button.cr-link', { type: 'button', onclick: () => shut(false) }, 'Cancel'), h('button.btn.btn--accent', { type: 'button', onclick: () => shut(true) }, 'Done')));
    field.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); shut(true); } if (e.key === 'Escape') shut(false); });
    el.append(scrim, card);
    field.focus({ preventScroll: true });
    requestAnimationFrame(() => { scrim.classList.add('is-in'); card.classList.add('is-in'); });
  }
  const section = (/** @type {string} */ title, /** @type {any} */ body, sub = '') => h('section.cr-sec', null, h('h3.cr-sec__title', null, title, sub ? h('span', null, sub) : null), body);

  /** A choice, kept so it can be undone; the tiles and the sketch follow at once. @param {() => void} fn @param {string} said */
  function change(fn, said) {
    past.push(snapshot()); future.length = 0;
    fn(); savePicks(); syncTiles(); syncChips(); syncUndo(); drawStudy();
    toast(said, 1800, { label: 'Undo', run: () => undo() });
  }
  function undo() { if (!past.length) return; future.push(snapshot()); ({ picks, reference } = /** @type {Choices} */ (past.pop())); afterHistory('Undone'); }
  function redo() { if (!future.length) return; past.push(snapshot()); ({ picks, reference } = /** @type {Choices} */ (future.pop())); afterHistory('Redone'); }
  function afterHistory(/** @type {string} */ said) { savePicks(); if (stepNow === 'tune') tuneStep(); syncChips(); drawStudy(); syncUndo(); toast(said, 1200); }
  function syncUndo() { undoBtn.disabled = !past.length; redoBtn.disabled = !future.length; }
  function syncTiles() {
    panel.querySelectorAll('[data-key]').forEach(b => {
      const key = /** @type {HTMLElement} */ (b).dataset.key, id = /** @type {HTMLElement} */ (b).dataset.id;
      const on = key === 'details' ? picks.details.includes(id) : picks[key] === id;
      b.setAttribute(b.hasAttribute('aria-pressed') ? 'aria-pressed' : 'aria-checked', String(on));
    });
  }
  function syncChips() { chips.textContent = style ? captionOf(style, picks) : (picks.words || (reference ? 'In the style of your picture' : '')); }

  let studyRaf = 0;
  function drawStudy() {
    if (!photo) return;
    cancelAnimationFrame(studyRaf);
    studyRaf = requestAnimationFrame(() => {
      const c = study(photo.bmp, style, picks, { width: 360, aspect: formatOf(picks.format).aspect });
      studyBox.replaceChildren(c);
    });
  }
  /** Which layer of the frame is in front. @param {'guide' | 'photo' | 'study' | 'paint' | 'art'} what */
  function showFrame(what) { frame.dataset.show = what; frame.dataset.shape = formatOf(picks.format).aspect; }
  function holdToCompare(/** @type {HTMLElement} */ f) {
    let t = 0;
    f.addEventListener('pointerdown', () => { if (!photo || frame.dataset.show === 'photo' || frame.dataset.show === 'guide') return; t = setTimeout(() => f.classList.add('is-compare'), 160); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) f.addEventListener(ev, () => { clearTimeout(t); f.classList.remove('is-compare'); });
    f.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ---- painting ----
  const stageWords = h('p.cr-stage-words', { 'aria-live': 'polite' });
  const timeWords = h('p.cr-time');
  const notes = h('ul.cr-notes');
  const stopBtn = h('button.btn.btn--quiet.cr-stop', { type: 'button', onclick: () => stop() }, h('span', { html: icon('stop') }), 'Stop');
  function paintStep() {
    showFrame(shown?.state === 'painting' ? 'paint' : 'study');
    stamp.textContent = studio.live ? 'Sketch while it paints · the painting replaces it' : 'Sketching on this phone';
    panel.replaceChildren(h('div.cr-wait', null, stageWords, timeWords, notes));
    cta.replaceChildren(stopBtn);
  }
  async function paint() {
    if (submitting || stepNow === 'paint') return;
    if (!photo) { to('photo'); return; }
    if (!style && !picks.words && !reference) { to('tune'); toast('Describe your style, or show a picture of it'); return; }
    submitting = true;
    const room = roomOf(), source = photo, styleReference = reference;
    const prompt = style ? promptFor(style, picks) : ownPrompt(picks.words, !!styleReference, picks);
    /** @type {Portrait} */
    const p = { id: uid('pt-'), style: style?.id || 'own', styleName: style?.name || 'Your own style', room: room.id, picks: { ...picks }, prompt, sitting: photo.id, reference: styleReference || undefined, kind: studio.live ? (studio.mode === 'simulator' ? 'simulated' : 'render') : 'sketch', state: 'painting', createdAt: Date.now() };
    await keep(p);
    shown = p; artImg.removeAttribute('src'); partial.removeAttribute('src'); partial.classList.remove('is-in'); artImg.classList.remove('is-in');
    notes.replaceChildren(); stageWords.textContent = room.voice?.stages?.read || 'Looking closely'; timeWords.textContent = studio.live ? 'Sending your photo' : '';
    drawStudy();
    if (el.isConnected && !el.inert) to('paint');
    submitting = false;
    const run = { p, stopped: false, job: '', started: performance.now(), workingSince: 0, eta: 0, value: 0 };
    painting.set(p.id, run);
    const tick = setInterval(() => progress(run), 250);
    try {
      if (studio.live) await live(run, room, source.blob, styleReference);
      else await sketchOnly(run, room, source.bmp);
      p.state = 'done';
    } catch (e) {
      p.state = run.stopped || e?.cancelled ? 'stopped' : 'failed';
      p.error = p.state === 'stopped' ? 'Stopped.' : (e?.message || 'The studio could not finish this.') + (e?.hint ? ' ' + e.hint : '');
    } finally {
      clearInterval(tick);
      painting.delete(p.id);
      if (shown === p) frame.classList.remove('is-painting');
    }
    p.ms = Math.round(performance.now() - run.started);
    await keep(p);
    const stillHere = el.isConnected && !el.inert && shown === p && here() === 'create' && stepNow === 'paint';
    if (stillHere) { restep('result'); render('result'); }
    else if (p.state === 'done') toast('Your ' + p.styleName + ' portrait is ready', 6000, { label: 'See it', run: () => go('create', { id: p.style, p: p.id }) });
  }
  /** The showcase: the stages said, and a sketch made here (labelled as one). */
  async function sketchOnly(run, room, source) {
    const st = room.voice?.stages || {};
    for (const [k, ms] of /** @type {[string, number][]} */ ([['read', 380], ['plan', 420], ['draw', 640], ['finish', 380]])) { if (run.stopped) throw { cancelled: true }; if (shown === run.p) stageWords.textContent = st[k] || k; run.value += .25; await new Promise(r => setTimeout(r, reduced ? 40 : ms)); }
    if (run.stopped) throw { cancelled: true };
    const c = study(source, styleById(run.p.style), run.p.picks, { width: 768, aspect: formatOf(run.p.picks.format).aspect });
    run.p.blob = await blobOf(c, 'image/jpeg', .9); run.p.w = c.width; run.p.h = c.height; run.p.kind = 'sketch';
  }
  /** A live studio: the turn protocol, followed event by event. */
  async function live(run, room, source, reference) {
    const p = run.p, st = room.voice?.stages || {};
    const spec = {
      id: p.id, text: p.prompt, pace: settings.get('pace', 'fine'), n: 1, aspect: formatOf(p.picks.format).aspect,
      intent: { op: 'restyle', subject: 'photo', refs: reference ? [{ id: 'ref', role: 'style' }] : [], pins: [], look: null },
      room: { id: room.id, name: room.name, line: room.line, colors: room.colors, voice: room.voice }, taste: settings.get('taste', ''),
    };
    const inputs = { photo: { handle: 'A', blob: source }, ...(reference ? { ref: { handle: 'B', blob: reference } } : {}) };
    for await (const ev of studio.engine.turn(spec, inputs)) {
      if (run.stopped) { studio.engine.cancel(p.id, run.job); throw { cancelled: true }; }
      if (ev.type === 'accepted') { run.eta = ev.eta || 0; run.job = ev.job; p.job = ev.job; keep(p); }
      else if (ev.type === 'result') { p.blob = ev.blob; p.w = ev.w; p.h = ev.h; p.asset = ev.url || ''; p.kind = ev.provenance?.kind === 'simulated' ? 'simulated' : studio.mode === 'simulator' ? 'simulated' : 'render'; }
      else if (ev.type === 'stage') {
        run.workingSince ||= performance.now();
        if (shown === p) stageWords.textContent = st[ev.stage] || ev.stage;
      }
      else if (shown !== p) continue;
      else if (ev.type === 'note') notes.prepend(h('li', null, ev.text));
      else if (ev.type === 'plan') notes.prepend(h('li', null, ev.plan?.summary || ''));
      else if (ev.type === 'progress') run.value = ev.value;
      else if (ev.type === 'partial') { partial.src = URL.createObjectURL(ev.blob); partial.classList.add('is-in'); stamp.textContent = 'Still painting · this is how far it has got'; }
      else if (ev.type === 'reply' && ev.text) notes.prepend(h('li.cr-reply', null, ev.text));
    }
    if (!p.blob) throw new Error('The studio finished without a picture.');
  }
  /** The meter and the time left, from the studio's own estimate (or its progress, where it gives one). */
  function progress(run) {
    if (shown !== run.p || stepNow !== 'paint') return;
    if (studio.live && !run.workingSince) {
      timeWords.textContent = run.job ? 'Waiting for the studio' : 'Sending your photo';
      return;
    }
    const t = performance.now() - (run.workingSince || run.started), expect = run.eta || 1800;
    const guess = 1 - Math.exp(-t / expect * 1.6), v = Math.max(run.value, Math.min(.97, guess));
    meter.style.setProperty('--v', v.toFixed(3)); meter.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    const left = expect - t;
    timeWords.textContent = !studio.live ? '' : run.eta && left > 1500 ? etaSaid(left) + ' left' : 'Still painting';
  }
  function stop() { const run = shown && painting.get(shown.id); if (!run) return; run.stopped = true; studio.engine.cancel?.(run.p.id, run.job); stageWords.textContent = 'Stopping…'; }

  // ---- the result ----
  function resultStep() {
    const p = shown; if (!p) { render('photo'); return; }
    cta.replaceChildren();
    if (p.state !== 'done' || !p.blob) {
      showFrame('study');
      stamp.textContent = '';
      panel.replaceChildren(h('div.cr-fail', null, h('h2.cr-title', null, p.state === 'stopped' ? 'Stopped' : 'That one didn’t finish'), h('p.cr-lede', null, p.error || ''), h('p.cr-lede', null, 'Your photo and choices are kept.')));
      cta.append(h('button.btn.btn--accent.btn--wide', { type: 'button', onclick: () => paint() }, h('span', { html: icon('retry') }), 'Try again'), h('button.cr-link', { type: 'button', onclick: () => to('tune') }, 'Change the style first'));
      return;
    }
    artImg.src = urlOf(p);
    showFrame('art');
    frame.dataset.shape = p.w && p.h ? (Math.abs(p.w - p.h) < 8 ? 'square' : p.h / p.w > 1.7 ? 'tall' : 'portrait') : frame.dataset.shape;
    if (!reduced) { artImg.classList.remove('is-in'); void artImg.offsetWidth; } artImg.classList.add('is-in');
    stamp.textContent = KIND_SAID[p.kind] + (p.ms && p.kind !== 'sketch' ? ' · ' + Math.round(p.ms / 1000) + ' s' : '');
    const room = roomById(p.room), done = room.voice?.done || ['There you are.'];
    const act = (/** @type {string} */ ic, /** @type {string} */ label, /** @type {() => void} */ run, cls = '') => h('button.cr-act' + cls, { type: 'button', onclick: run }, h('span', { html: icon(ic) }), h('b', null, label));
    panel.replaceChildren(
      h('h2.cr-title.cr-title--done', null, done[p.createdAt % done.length]),
      h('p.cr-lede', null, (style ? style.name : 'Your own style') + ' · kept in Mine. Hold the picture to see your photo.'),
      h('div.cr-acts', null,
        act('palette', 'Another style', () => restyle()),
        act('dial', 'Tweak', () => to('tune')),
        act('vary', 'Again', () => paint()),
        act('save', 'Save', () => saveIt(p)),
        act('share', 'Share', () => shareIt(p)),
        act('feather', 'Talk about it', () => talk(p))));
    cta.append(h('button.btn.btn--ink.btn--wide', { type: 'button', onclick: () => go('mine') }, 'See all of mine'));
  }
  /** The same photo in another style: chosen from the plates, painted at once. */
  function restyle() {
    const cat = catalogue();
    sheet(close => [
      h('div.sheet__head', null, h('h3.t-title', null, 'Another style'), h('button.icon-btn', { 'aria-label': 'Close', html: icon('close'), onclick: () => close() })),
      h('div.cr-styles', null, ...STYLES.map(s => h('button.cr-stylepick', { type: 'button', 'aria-pressed': String(s.id === style?.id), onclick: () => { close(); switchTo(s); } },
        h('img', { alt: '', src: artOf(cat, s, s.hero).thumb, loading: 'lazy' }), h('b', null, s.name)))),
    ], { cls: 'sheet--styles', label: 'Another style' });
  }
  /** @param {Style} s */
  function switchTo(s) {
    style = s; picks = loadPicks(); reference = null; past.length = 0; future.length = 0;
    el.dataset.style = s.id; frame.dataset.frame = roomOf().frame;
    changeRoom(roomOf());
    paint();
  }
  function fileName(/** @type {Portrait} */ p) { return 'likeness-' + p.style + '-' + new Date(p.createdAt).toISOString().slice(0, 10) + (p.blob?.type === 'image/png' ? '.png' : '.jpg'); }
  function saveIt(/** @type {Portrait} */ p) { const a = h('a', { href: urlOf(p), download: fileName(p) }); document.body.append(a); a.click(); a.remove(); toast('Saved to your downloads'); }
  async function shareIt(/** @type {Portrait} */ p) {
    const file = new File([/** @type {Blob} */ (p.blob)], fileName(p), { type: p.blob?.type || 'image/jpeg' });
    if (!navigator.canShare?.({ files: [file] })) { saveIt(p); return; }
    try { await navigator.share({ files: [file], title: p.styleName + ' portrait' }); }
    catch (e) { if (e?.name !== 'AbortError') saveIt(p); }
  }
  /** Into the studio's conversation, as a picture to talk about ("make the bow red"). */
  async function talk(/** @type {Portrait} */ p) {
    const print = await addPrint({ blob: p.blob, w: p.w, h: p.h, origin: 'portrait', prompt: p.prompt, provenance: { kind: p.kind === 'render' ? 'render' : p.kind === 'simulated' ? 'simulated' : 'sketch', label: p.styleName } });
    await addItem({ type: 'prints', prints: [print.id], mine: true });
    go('desk');
    toast('Say what to change about @' + print.handle, 5000);
  }

  // ---- opened on a portrait already made (from Mine), or fresh ----
  (async () => {
    if (params.p) {
      const p = await portraitById(params.p);
      if (p) {
        shown = p; style = styleById(p.style); picks = { ...(style ? defaultsOf(style) : picks), ...p.picks };
        reference = p.reference || null;
        const s = await sittingById(p.sitting);
        if (s) { const { blob, bmp } = await prepared(s.blob); photo = { blob, bmp, id: s.id, sample: s.sample }; photoImg.src = URL.createObjectURL(blob); }
        if (style && style.room !== atmosphere.room?.id) changeRoom(roomOf());
        restep(p.state === 'painting' && painting.has(p.id) ? 'paint' : 'result');
        render(p.state === 'painting' && painting.has(p.id) ? 'paint' : 'result');
        return;
      }
    }
    if (style && style.room !== atmosphere.room?.id) changeRoom(roomOf());
    render('photo');
  })();

  return {
    el,
    step(/** @type {string} */ name) { render(name === 'paint' && !(shown && painting.has(shown.id)) ? (shown ? 'result' : 'tune') : name || 'photo'); },
  };
}

/** Portraits left painting when the page closed: a live studio is asked how they ended; elsewhere they are stopped. */
export async function resumePortraits(/** @type {import('./keep.js').Portrait[]} */ list) {
  for (const p of list) {
    if (p.state !== 'painting' || painting.has(p.id)) continue;
    if (!studio.live || !p.job || !studio.engine.resume) { p.state = 'stopped'; p.error = 'Interrupted when the page was closed.'; await keep(p); continue; }
    (async () => {
      try {
        for await (const ev of studio.engine.resume(p.job)) {
          if (ev.type === 'result') { p.blob = ev.blob; p.w = ev.w; p.h = ev.h; p.asset = ev.url || ''; p.kind = ev.provenance?.kind === 'simulated' ? 'simulated' : 'render'; }
          if (ev.type === 'done') p.ms = ev.ms;
        }
        p.state = p.blob ? 'done' : 'failed';
      } catch (e) { p.state = e?.cancelled ? 'stopped' : 'failed'; p.error = e?.message || 'The studio lost this one.'; }
      await keep(p);
    })();
  }
}
