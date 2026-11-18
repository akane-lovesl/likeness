/**
 * Backdrops: somewhere new for a picture. Ideas are suggested for this picture, this room and what you say; you steer
 * them on a pad (near or far, real or dreamt) instead of scrolling through a hundred presets. Tap your subject once so
 * the device can keep it in front while it sketches each place behind; the studio does the real compositing.
 */
import { h, icon, sheet, toast } from '../core/dom.js';
import { drag } from '../core/motion.js';
import { glyph } from '../room/ornaments.js';
import * as P from '../studio/painter.js';
import { selectAt } from '../studio/segment.js';
import { suggestPlaces } from '../room/maker.js';
import { atmosphere } from '../room/theme.js';
import { studio } from '../studio/studio.js';
import { settings } from '../state.js';
import { sound } from '../core/sound.js';

/** @param {{ print: any, onSend: (t: any) => void, after?: () => void }} o */
export function openBackdrops({ print, onSend, after = null }) {
  sound.play('tap');
  return sheet(close => {
    let base = null, mask = null, chosen = null, near = .5, dream = .4, said = '', places = [], seq = 0;
    const preview = h('canvas.bd__preview'), hint = h('span.bd__hint', null, 'Tap your subject to keep it in front');
    const flats = h('div.bd__flats');
    const go = h('button.btn.btn--accent.btn--wide', { disabled: true }, studio.live ? 'Render it' : 'Sketch it', h('span', { html: icon('arrow') }));
    const input = h('input.maker__input', { type: 'text', placeholder: 'Say where…', enterkeyhint: 'go', 'aria-label': 'Where should it be?' });
    const puck = h('span.pad__puck'), pad = h('div.pad', { role: 'slider', 'aria-label': 'Near or far, real or dreamt' }, h('span.pad__label.pad__label--l', null, 'Near'), h('span.pad__label.pad__label--r', null, 'Far'), h('span.pad__label.pad__label--t', null, 'Dreamt'), h('span.pad__label.pad__label--b', null, 'Real'), puck);

    const placePuck = () => { puck.style.left = near * 100 + '%'; puck.style.top = (1 - dream) * 100 + '%'; };
    async function prepare() {
      base = await P.fromBlob(print.blob, 520); preview.width = base.width; preview.height = base.height;
      preview.getContext('2d').drawImage(base, 0, 0); suggest();
    }
    async function suggest() {
      const my = ++seq;
      let list = suggestPlaces({ text: said, room: atmosphere.room, near, dream, count: 6, seed: my });
      if (studio.live && said) { try { const r = await studio.engine.backdrops({ text: said, near, dream, room: atmosphere.room.name }); if (r?.backdrops?.length) list = r.backdrops.map((b, i) => ({ id: 'st-' + i, name: b.name, words: b.words })); } catch { /* the device's ideas will do */ } }
      if (my !== seq) return;
      places = list;
      flats.replaceChildren(...places.map((pl, i) => {
        const c = h('canvas'), card = h('button.bd__flat', { style: { '--i': i }, 'aria-pressed': 'false', onclick: () => choose(pl, card) }, c, h('span', null, pl.name));
        setTimeout(() => { if (my !== seq) return; const s = P.scene(P.sceneFrom(pl.words, null, i + 3), 150, 200); c.width = 150; c.height = 200; c.getContext('2d').drawImage(s, 0, 0); card.classList.add('is-ready'); }, 30 + i * 60);
        return card;
      }));
    }
    function choose(pl, card) {
      chosen = pl; for (const f of flats.children) f.setAttribute('aria-pressed', String(f === card));
      go.disabled = false; render(); sound.play('tap');
    }
    function render() {
      if (!base || !chosen) return;
      const bd = P.scene(P.sceneFrom(chosen.words, null, 5), base.width, base.height);
      preview.getContext('2d').drawImage(P.composite(base, mask, bd), 0, 0);
    }
    preview.addEventListener('click', async e => {
      if (!base) return;
      const r = preview.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
      hint.textContent = 'Finding the subject…';
      const found = await selectAt(base, nx, ny);
      mask = found.mask; hint.textContent = found.guessed ? 'Kept a rough circle there' : 'Subject kept · tap again to choose another';
      sound.play('pin'); render();
    });
    drag(pad, {
      start: e => { move(e); },
      move: d => move(d.e),
      end: () => suggest(),
    });
    function move(e) { const r = pad.getBoundingClientRect(); near = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); dream = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)); placePuck(); }
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { said = input.value.trim(); suggest(); } });
    go.addEventListener('click', () => {
      if (!chosen) return;
      onSend({ text: `Put @${print.handle} in front of ${chosen.name.toLowerCase()}`, intent: { op: 'backdrop', subject: print.id, refs: [], look: null, n: 1, pins: [] }, pace: settings.get('pace', 'fine'), backdrop: { name: chosen.name, words: chosen.words }, subjectMask: mask });
      close(); after?.();
    });
    placePuck(); prepare();
    return [
      h('div.sheet__head', null, h('h2.t-title', null, 'Backdrops'), h('span.t-mono.t-soft', null, 'for ' + print.handle)),
      h('div.bd__stage', null, preview, hint),
      h('div.maker__row', { style: { marginTop: '3cqw' } }, input, h('button.send', { 'aria-label': 'Suggest', html: icon('arrow'), onclick: () => { said = input.value.trim(); suggest(); } })),
      h('div.bd__steer', null, pad, h('p.bd__steer-note.t-soft', null, 'Drag to steer the ideas: close-up rooms or wide places, real ones or dreamt ones.')),
      flats, go,
    ];
  }, { cls: 'sheet--backdrops', label: 'Backdrops' });
}
