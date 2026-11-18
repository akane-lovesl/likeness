/**
 * The desk: the one screen you live on. A greeting from the room, the thread of what you asked and what came back,
 * and the composer. Pictures arrive by the + button, by pasting, or by dropping them on the stage.
 */
import { h, icon, toast, sheet } from '../core/dom.js';
import { glyph } from '../room/ornaments.js';
import { on } from '../core/bus.js';
import { app, addItem, addPrint, threadPrints, printById, newThread, settings } from '../state.js';
import { atmosphere } from '../room/theme.js';
import { skyFor, skySettings } from '../room/atmosphere.js';
import { outsideWeather } from '../room/outside.js';
import { sparksFor } from '../room/sparks.js';
import { WEATHERS, LIGHTS, partOfDay, clockLight } from '../room/rooms.js';
import { studio } from '../studio/studio.js';
import { readIntent } from '../studio/intent.js';
import { LOOKS } from '../studio/looks.js';
import * as P from '../studio/painter.js';
import { chooseFiles } from '../core/dom.js';
import { sound } from '../core/sound.js';
import { reduced } from '../core/motion.js';
import { youEl, museEl, printsEl } from './cards.js';
import { jobEl, runTurn, resumeTurn } from './turn.js';
import { composer } from './composer.js';
import { openFocus } from './focus.js';
import { openRooms } from './rooms.js';
import { openSky } from './skysheet.js';
import { openAlbum } from './album.js';
import { openCamera, canFilm } from './camera.js';


export function deskScreen() {
  const el = h('section.screen.desk', { 'aria-label': 'Desk' });
  const orn = h('span', { html: glyph(atmosphere.room.ornament) });
  const mark = h('button.desk__mark', { 'aria-label': 'Rooms', onclick: e => openRooms(e) }, orn, h('span.wordmark', null, 'Likeness'));
  const edition = h('span.edition', { data: { mode: studio.mode }, title: `This studio makes ${studio.makes}` }, h('i'), studio.label);
  const skyBtn = h('button.icon-btn.sky-btn', { 'aria-label': 'Sky and mood', onclick: () => openSky() });
  const albumBtn = h('button.icon-btn', { 'aria-label': 'Album', html: icon('album'), onclick: () => openAlbum({ onUse: ids => { comp.addToTray(ids); }, onSend: t => send(t) }) });
  const thread = h('div.thread');
  const scroll = h('div.desk__scroll', null, thread);
  const comp = composer({ onSend: t => send(t), onAttach: () => attach() });
  el.append(h('header.desk__bar', null, mark, edition, h('div.desk__tools', null, skyBtn, albumBtn)), scroll, comp.el);

  const open = (p, from) => openFocus(p, from, { onSend: t => send(t), onUse: id => { comp.addToTray([id]); comp.mention(printById(id).handle); } });
  const handlers = { onOpen: open, onIdea: (text, item) => sendIdea(text, item.prints), onRetry: item => send({ text: item.retry?.text || '', intent: readIntent(item.retry?.text || '', ctx()), pace: item.retry?.pace || 'fine' }) };
  const ctx = () => ({ prints: threadPrints().map(p => ({ id: p.id, handle: p.handle })), tray: [], looks: [...LOOKS, ...app.looks] });

  let flight = null;
  async function send(t) {
    if (!t.text && !t.intent?.pins?.length) return;
    nearEnd = true; flight = t.flight || null;
    const item = await runTurn(t);
    if (item.state === 'done' && item.prints.length) comp.dropFromTray(item.parents || []);   // "it" now means what was just made
    ideas();
  }
  /** The words you sent rise from the composer into the thread. */
  function fly(node) {
    const from = flight; flight = null;
    if (!from || reduced) return;
    requestAnimationFrame(() => {
      const r = node.getBoundingClientRect();
      node.animate([
        { transform: `translate(${from.right - r.right}px, ${from.top - r.top}px) scale(.94)`, opacity: .35, transformOrigin: '100% 0' },
        { transform: 'none', opacity: 1, transformOrigin: '100% 0' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }
  function sendIdea(text, prints = []) {
    const latest = prints?.length ? prints : [];
    const intent = readIntent(text, { ...ctx(), tray: latest.slice(0, 1) });
    if (!intent.subject && latest[0] && !/^(paint|draw|a |an )/i.test(text)) { intent.subject = latest[0]; if (intent.op === 'create') intent.op = intent.look ? 'restyle' : 'edit'; }
    send({ text, intent, pace: intent.pace || 'fine', n: intent.n });
  }

  function hello() {
    const room = atmosphere.room, s = skyFor(), weather = WEATHERS.find(w => w.id === s.weather), light = s.light === 'auto' ? clockLight() : s.light;
    const day = new Date().toLocaleDateString('en-GB', { weekday: 'long' }), empty = !app.thread.items.length;
    const box = h('div.hello', null,
      h('p.hello__line.t-title', null, room.voice.hello[partOfDay()]),
      h('p.hello__sky.t-mono.t-soft', null, h('span', { html: glyph(weather?.glyph || 'sun') }), [day, LIGHTS.find(l => l.id === light)?.label, weather?.label, outsideNow(s), s.mood ? s.mood.label + ' day' : null].filter(Boolean).join(' · ')));
    if (empty) box.append(h('div.starters', null,
      starter(0, 'image', 'Bring a picture', 'A photo, a screenshot, a drawing', () => attach()),
      starter(1, 'sparkle', 'Start from words', 'Describe it and watch it appear', () => comp.setText('Paint ')),
      starter(2, 'room', 'Change the room', 'Seven rooms, or invent your own', e => openRooms(e)),
      h('button.link.t-mono.t-soft', { style: { justifySelf: 'center', marginTop: '1cqw', padding: '2cqw' }, onclick: () => samples() }, 'or play with two sample pictures')));
    else box.querySelector('.hello__sky').append(h('button.hello__new', { onclick: async () => { await newThread(); toast('A fresh page'); } }, 'New page'));
    return box;
  }
  /** "9° outside" when the weather in here is the weather out there. */
  function outsideNow(s) { const o = outsideWeather(); return o && !skySettings().weather && !s.mood && o.weather === s.weather && Number.isFinite(o.temp) ? `${o.temp}° outside` : null; }
  function starter(i, ic, title, line, fn) { return h('button.starter', { style: { '--i': i }, onclick: fn }, h('span.starter__icon', { html: icon(ic) }), h('span.starter__text', null, h('b', null, title), h('span', null, line)), h('span', { html: icon('arrow') })); }

  function itemEl(item) {
    if (item.type === 'you') return youEl(item);
    if (item.type === 'muse') return museEl(item.text);
    if (item.type === 'prints') return printsEl(item.prints, { mine: item.mine, onOpen: open });
    if (item.type === 'job') { const c = jobEl(item, handlers); return c; }
    if (item.type === 'line') return h('p.t-mono.t-soft', { style: { alignSelf: 'center' } }, item.text);
    return null;
  }
  function render() {
    thread.replaceChildren(hello(), ...app.thread.items.map(itemEl).filter(Boolean));
    if (app.thread.items.length) thread.removeAttribute('data-empty'); else thread.dataset.empty = '';
    toEnd(false); ideas();
  }
  let nearEnd = true;
  scroll.addEventListener('scroll', () => { nearEnd = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120; });
  const toEnd = (smooth = true) => requestAnimationFrame(() => scroll.scrollTo({ top: scroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }));

  function ideas() {
    const items = app.thread.items, last = [...items].reverse().find(i => i.type === 'job' && i.state === 'done');
    const lastPrints = [...items].reverse().find(i => i.prints?.length);
    if (!items.length) comp.setIdeas(sparksFor(atmosphere.room), t => { comp.setText(t); });
    else if (lastPrints && lastPrints.type === 'prints') comp.setIdeas(['Make it a watercolour', 'Give it a new backdrop', 'Three variations', 'Golden hour light'], t => sendIdea(t, lastPrints.prints));
    else if (last?.suggestions?.length) comp.setIdeas(last.suggestions, t => sendIdea(t, last.prints));
    else comp.setIdeas([], () => {});
  }

  async function addFiles(files) {
    const ids = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      try { const c = await P.fromBlob(f, 1600), blob = await P.toBlob(c, 'image/jpeg', .92); ids.push((await addPrint({ blob, w: c.width, h: c.height, origin: 'upload', provenance: { kind: 'photo', label: 'Your picture' } })).id); }
      catch { toast('That file could not be opened'); }
    }
    if (!ids.length) return;
    nearEnd = true;
    await addItem({ type: 'prints', prints: ids, mine: true });
    comp.addToTray(ids); sound.play('pin');
  }
  /** Bring a picture: from your photos, or through the look camera when there is a camera. */
  async function attach() {
    if (!canFilm()) { addFiles(await chooseFiles()); return; }
    await sheet(close => [
      h('div.sheet__head', null, h('h2.t-title', null, 'Bring a picture')),
      h('div.bring', null,
        h('button.bring__opt', { onclick: () => { const files = chooseFiles(); close(); files.then(addFiles); } }, h('span', { html: icon('image') }), h('b', null, 'From your photos'), h('span.t-soft', null, 'Or paste one, or drop it anywhere')),
        h('button.bring__opt', { onclick: () => { close(); openCamera({ onTake: took, onFallback: async () => addFiles(await chooseFiles()) }); } }, h('span', { html: icon('camera') }), h('b', null, 'Through a look'), h('span.t-soft', null, 'The camera, live, in any look you like'))),
    ], { label: 'Bring a picture' });
  }
  /** A photograph from the look camera; with a look on, the studio is asked to paint it in that look at once. */
  async function took(blob, w, hh, look) {
    const p = await addPrint({ blob, w, h: hh, origin: 'camera', provenance: { kind: 'photo', label: 'Your picture' } });
    nearEnd = true;
    await addItem({ type: 'prints', prints: [p.id], mine: true });
    sound.play('pin');
    if (look) send({ text: `@${p.handle} in ${look.name}`, intent: { op: 'restyle', subject: p.id, refs: [], look: { ...look, strength: .9 }, pins: [] }, pace: settings.get('pace', 'fine') });
    else comp.addToTray([p.id]);
  }
  async function samples() {
    const scenes = [['lighthouse by the sea at dusk with a boat', 'Sample · lighthouse'], ['tea room interior with a teacup by the window, golden', 'Sample · tea room']];
    const ids = [];
    for (const [words, label] of scenes) { const c = P.scene(P.sceneFrom(words, null, 11), 768, 1024), blob = await P.toBlob(c); ids.push((await addPrint({ blob, w: c.width, h: c.height, origin: 'sample', provenance: { kind: 'sample', label: 'Sample' }, prompt: label })).id); }
    await addItem({ type: 'prints', prints: ids, mine: true });
    comp.addToTray([ids[0]]);
  }

  document.addEventListener('paste', e => { const files = [...(e.clipboardData?.files || [])]; if (files.length) { e.preventDefault(); addFiles(files); } });
  let zone = null;
  el.addEventListener('dragover', e => { e.preventDefault(); if (!zone) el.append(zone = h('div.dropzone', null, 'Drop to add')); });
  el.addEventListener('dragleave', e => { if (e.target === zone || !el.contains(/** @type {Node} */ (e.relatedTarget))) { zone?.remove(); zone = null; } });
  el.addEventListener('drop', e => { e.preventDefault(); zone?.remove(); zone = null; addFiles([...(e.dataTransfer?.files || [])]); });

  on('item', item => { const node = itemEl(item); if (node) { thread.removeAttribute('data-empty'); thread.firstElementChild?.replaceWith(hello()); thread.append(node); if (item.type === 'you') fly(node); } if (nearEnd) toEnd(); ideas(); });
  on('item:patch', item => {
    if (item.type !== 'job' || item.state === 'running') return;
    const old = thread.querySelector(`.job[data-id="${item.id}"]`), fresh = itemEl(item);
    if (old && fresh) { fresh.classList.add('is-settled'); old.replaceWith(fresh); }
    if (nearEnd) toEnd(); ideas();
  });
  on('thread', render);
  on('room', room => { orn.innerHTML = glyph(room.ornament); comp.refresh(); ideas(); thread.querySelector('.hello')?.replaceWith(hello()); for (const m of thread.querySelectorAll('.say--muse .muse, .job .muse')) m.innerHTML = glyph(room.ornament); });
  on('sky', () => { thread.querySelector('.hello')?.replaceWith(hello()); skyBtn.innerHTML = glyph(WEATHERS.find(w => w.id === skyFor().weather)?.glyph || 'sun'); });
  on('print', () => {});
  skyBtn.innerHTML = glyph(WEATHERS.find(w => w.id === skyFor().weather)?.glyph || 'sun');
  render();
  for (const item of app.thread.items) if (item.type === 'job' && item.state === 'running') resumeTurn(item);
  return el;
}
