/**
 * The composer: say what you want, call pictures by their handles (@A) and looks by name (#), and see what the
 * studio will understand, and roughly how long it will take, before you send.
 */
import { h, icon, eta } from '../core/dom.js';
import { glyph } from '../room/ornaments.js';
import { app, threadPrints, printById, handleOf, urlOf, settings } from '../state.js';
import { atmosphere } from '../room/theme.js';
import { readIntent, describeIntent } from '../studio/intent.js';
import { LOOKS } from '../studio/looks.js';
import { estimate } from '../core/estimate.js';
import { studio } from '../studio/studio.js';
import { PACES } from './turn.js';
import { sound } from '../core/sound.js';
import { roomFromWords } from '../room/maker.js';
import { roomCalled } from '../room/atmosphere.js';

const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const ORDER = ['quick', 'fine', 'deep'];

/** @param {{ onSend: (t: any) => void, onAttach: () => void }} o */
export function composer({ onSend, onAttach }) {
  let tray = /** @type {string[]} */ ([]), pace = settings.get('pace', 'fine'), look = null, reading = null, picker = null, ideaList = [];
  const textarea = h('textarea', { rows: 1, 'aria-label': 'What should the studio make?', enterkeyhint: 'send', autocomplete: 'off' });
  const mirror = h('div.mirror', { 'aria-hidden': 'true' });
  const readingEl = h('div.reading', { 'aria-live': 'polite' });
  const trayEl = h('div.tray', { hidden: true });
  const send = h('button.send', { 'aria-label': 'Send', disabled: true });
  const paceBtn = h('button.pace', { 'aria-label': 'Pace' });
  const add = h('button.icon-btn', { 'aria-label': 'Add a picture', html: icon('plus'), onclick: () => { sound.play('tap'); onAttach(); } });
  const ideas = h('div.ideas', { role: 'list' });
  const box = h('div.box', null, trayEl, readingEl, h('div.row', null, add, h('div.field', null, mirror, textarea), paceBtn, send));
  const el = h('footer.composer', null, ideas, box);

  const lastBatch = () => { for (let i = app.thread.items.length - 1; i >= 0; i--) { const it = app.thread.items[i]; if (it.prints?.length) return it.prints; } return []; };
  function paintSend() { const room = atmosphere.room; send.innerHTML = room?.type === 'romance' ? glyph('heart') : icon('send'); send.setAttribute('aria-label', room?.voice?.send || 'Send'); textarea.placeholder = (room?.voice?.placeholder || 'Say what you want') + '…'; }
  function paintPace() { const p = PACES[pace]; paceBtn.innerHTML = icon(p.icon) + `<span>${p.label}</span>`; paceBtn.setAttribute('aria-label', `Pace: ${p.label}. Tap to change.`); }
  function sync() {
    mirror.innerHTML = esc(textarea.value).replace(/@([A-Z]{1,2})\b/g, '<mark>@$1</mark>') + '​';
    textarea.style.height = 'auto'; textarea.style.height = Math.min(textarea.scrollHeight, el.ownerDocument.defaultView.innerHeight * .3) + 'px';
    mirror.scrollTop = textarea.scrollTop;
    read();
  }
  function read() {
    const text = textarea.value, has = text.trim() || tray.length;
    send.disabled = !text.trim();
    ideas.hidden = !!text.trim() || !ideaList.length;
    if (!has) { readingEl.replaceChildren(); reading = null; return; }
    reading = readIntent(text, { prints: threadPrints().map(p => ({ id: p.id, handle: p.handle })), tray, batch: lastBatch(), looks: [...LOOKS, ...app.looks], look });
    if (reading.op === 'room') { readingEl.replaceChildren(...roomReading(reading.vibe)); return; }
    const pills = describeIntent(reading, handleOf), est = estimate(studio.mode, reading.op, reading.pace || pace, reading.n);
    if (settings.get('taste', '').trim()) pills.push({ k: 'taste', text: 'your taste' });
    readingEl.replaceChildren(...pills.map((s, i) => h('span.plan-pill', { data: { k: s.k }, style: { '--i': i } }, s.text)), h('span.reading__eta', null, '≈ ' + eta(est.ms).replace('about ', '')));
  }
  /** "Take me to …": the room you would step into, previewed in its own colours as you describe it. */
  function roomReading(vibe) {
    const known = roomCalled(vibe), room = known || roomFromWords(vibe), c = room.colors;
    return [h('span.plan-pill', { data: { k: 'op' } }, 'Move to'),
      h('span.plan-pill.room-pill', { style: { '--rp-ground': c.ground, '--rp-ink': c.ink, '--rp-a': c.accent, '--rp-b': c.accent2, '--i': 1 } }, h('i'), h('i'), room.name),
      h('span.reading__eta', null, known ? 'a room you know' : studio.mode === 'workstation' ? 'the studio invents it' : 'invented here')];
  }
  function paintTray() {
    trayEl.hidden = !tray.length;
    trayEl.replaceChildren(...tray.map(id => { const p = printById(id); return p ? h('div.tray__chip', null, h('img', { src: urlOf(p), alt: '' }), h('b', null, p.handle), h('button', { 'aria-label': `Take ${p.handle} out`, html: icon('close'), onclick: () => { tray = tray.filter(x => x !== id); paintTray(); read(); } })) : null; }));
  }
  function closePicker() { picker?.remove(); picker = null; }
  function openPicker(kind) {
    closePicker();
    if (kind === '@') {
      const prints = threadPrints().slice().reverse();
      if (!prints.length) return;
      picker = h('div.picker', { role: 'listbox' }, prints.map(p => h('button.picker__item', { onclick: () => insert(p.handle + ' ') }, h('img', { src: urlOf(p), alt: '' }), p.handle)));
    } else {
      const looks = [...app.looks, ...LOOKS];
      picker = h('div.picker', { role: 'listbox' }, looks.map(l => h('button.picker__look', { onclick: () => { look = l; replaceBefore('#', l.name + ' '); } }, h('i', { style: { '--sw': `linear-gradient(135deg, ${(l.ramp || l.halftone?.inks || ['#888', '#ccc']).join(', ')})` } }), l.name)));
    }
    box.append(picker);
  }
  function insert(s) { const at = textarea.selectionStart; textarea.value = textarea.value.slice(0, at) + s + textarea.value.slice(textarea.selectionEnd); textarea.selectionStart = textarea.selectionEnd = at + s.length; closePicker(); textarea.focus(); sync(); }
  function replaceBefore(ch, s) { const at = textarea.selectionStart, i = textarea.value.lastIndexOf(ch, at - 1); if (i < 0) return insert(s); textarea.value = textarea.value.slice(0, i) + s + textarea.value.slice(at); textarea.selectionStart = textarea.selectionEnd = i + s.length; closePicker(); textarea.focus(); sync(); }
  function submit() {
    const text = textarea.value.trim(); if (!text) return;
    read();
    const intent = reading, flight = textarea.closest('.field')?.getBoundingClientRect() || null;
    onSend({ text, intent, pace: intent.pace || pace, n: intent.n, flight });
    textarea.value = ''; tray = []; look = null; closePicker(); paintTray(); sync();
  }

  textarea.addEventListener('input', e => {
    sync();
    const ch = /** @type {InputEvent} */ (e).data;
    if (ch === '@' || ch === '#') openPicker(ch); else if (ch === ' ' || !textarea.value) closePicker();
  });
  textarea.addEventListener('scroll', () => { mirror.scrollTop = textarea.scrollTop; });
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') closePicker();
  });
  send.addEventListener('click', submit);
  paceBtn.addEventListener('click', () => {
    pace = ORDER[(ORDER.indexOf(pace) + 1) % 3]; settings.set('pace', pace);
    paceBtn.classList.add('is-turning'); setTimeout(() => { paintPace(); paceBtn.classList.remove('is-turning'); }, 160);
    sound.play('tap'); read();
  });

  paintSend(); paintPace(); sync();
  return {
    el,
    /** Puts pictures in play, as subjects or references. */
    addToTray(ids) { for (const id of ids) if (!tray.includes(id)) tray.push(id); paintTray(); read(); },
    /** Takes pictures out of play, e.g. once a turn has made something newer from them. */
    dropFromTray(ids) { const before = tray.length; tray = tray.filter(id => !ids.includes(id)); if (tray.length !== before) { paintTray(); read(); } },
    setText(text, { focus = true } = {}) { textarea.value = text; sync(); if (focus) { textarea.focus(); textarea.selectionStart = textarea.selectionEnd = text.length; } },
    mention(handle) { const v = textarea.value; insert((v && !v.endsWith(' ') ? ' ' : '') + '@' + handle + ' '); },
    setLook(l) { look = l; read(); },
    /** Ideas above the composer; each sends at once with the pictures given. */
    setIdeas(list, onPick) {
      ideaList = list;
      ideas.replaceChildren(...list.map((idea, i) => h('button.chip.idea', { role: 'listitem', style: { '--i': i }, onclick: () => onPick(idea) }, h('span', { html: glyph(atmosphere.room.ornament) }), idea.text || idea)));
      ideas.hidden = !list.length || !!textarea.value.trim();
    },
    refresh() { paintSend(); read(); },
    focus() { textarea.focus(); },
    get tray() { return tray; },
  };
}
