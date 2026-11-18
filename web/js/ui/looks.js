/**
 * Looks: every look tried on your picture at once, sketched on the device in a few milliseconds each, so you choose
 * by seeing. Pick one, set how strongly, and send it to the studio. You can also make looks: from words, from
 * another picture's colours, or by crossing two looks.
 */
import { h, icon, sheet, toast } from '../core/dom.js';
import { glyph } from '../room/ornaments.js';
import { LOOKS, lookFromWords, lookFromPalette, rampAround, blendLooks } from '../studio/looks.js';
import { COLOUR_WORDS } from '../studio/painter.js';
import * as P from '../studio/painter.js';
import { app, saveLook, threadPrints, urlOf, settings } from '../state.js';
import { studio } from '../studio/studio.js';
import { sound } from '../core/sound.js';

/** @param {{ print?: any, onSend?: (t: any) => void, after?: () => void, onPick?: (look: any) => void }} o */
export function openLooks({ print = null, onSend = null, after = null, onPick = null } = {}) {
  sound.play('tap');
  return sheet(close => {
    let chosen = null, previous = null, base = null, small = null, strength = .9, token = 0;
    const preview = h('canvas.looks__preview'), label = h('span.looks__label', null, 'Preview · sketched on this device');
    const strengthEl = h('input.range', { type: 'range', min: '0.2', max: '1', step: '0.05', value: '0.9', 'aria-label': 'Strength' });
    const go = h('button.btn.btn--accent.btn--wide', { disabled: true }, studio.live ? 'Render it' : 'Sketch it', h('span', { html: icon('arrow') }));
    const grid = h('div.looks__grid');
    const nameEl = h('p.looks__name');
    const all = () => [...app.looks, ...LOOKS];

    async function prepare() {
      const src = print ? print.blob : await P.toBlob(P.scene(P.sceneFrom('tea room interior with a teacup by the window, golden', null, 3), 480, 640));
      base = await P.fromBlob(src, 560); small = P.copy(base, 150, Math.round(150 * base.height / base.width));
      preview.width = base.width; preview.height = base.height; preview.getContext('2d').drawImage(base, 0, 0);
      paintGrid();
    }
    function paintGrid() {
      const my = ++token;
      grid.replaceChildren(...all().map((look, i) => {
        const c = h('canvas.looks__swatch'), tile = h('button.looks__tile', { 'aria-pressed': String(chosen?.id === look.id), style: { '--i': i }, onclick: () => choose(look) }, c, h('span', null, look.name), look.mine ? h('i.looks__mine', null, 'yours') : null);
        setTimeout(() => { if (my !== token) return; const g = P.grade(small, look, .95, 3); c.width = g.width; c.height = g.height; c.getContext('2d').drawImage(g, 0, 0); tile.classList.add('is-ready'); }, 40 + i * 45);
        return tile;
      }));
    }
    function choose(look) {
      previous = chosen && chosen.id !== look.id ? chosen : previous; chosen = look;
      for (const t of grid.children) t.setAttribute('aria-pressed', String(t.querySelector('span')?.textContent === look.name));
      nameEl.replaceChildren(h('b', null, look.name), ' ', h('span.t-soft', null, look.line || ''));
      go.disabled = !print && !onPick; render(); sound.play('tap');
      blend.hidden = !previous;
      if (previous) blend.lastChild.textContent = `Cross with ${previous.name}`;
    }
    function render() { if (!base || !chosen) return; const g = P.grade(base, chosen, strength, 5); preview.getContext('2d').drawImage(g, 0, 0); }
    strengthEl.addEventListener('input', () => { strength = Number(strengthEl.value); render(); });
    go.addEventListener('click', () => {
      if (!chosen) return;
      if (onPick) { onPick(chosen); close(); return; }
      const pct = Math.round(strength * 100);
      onSend?.({ text: `@${print.handle} in ${chosen.name}${pct < 80 ? `, gently (about ${pct}%)` : ''}`, intent: { op: 'restyle', subject: print.id, refs: [], look: { ...chosen, strength }, n: 1, pins: [] }, pace: settings.get('pace', 'fine') });
      close(); after?.();
    });

    const input = h('input.maker__input', { type: 'text', placeholder: 'Describe a look…', enterkeyhint: 'go', 'aria-label': 'Describe a look' });
    async function makeFromWords(text) {
      let look = null;
      if (studio.live) { try { look = { ...(await studio.engine.look(text)), mine: true }; } catch { toast('The studio could not; sketching it here'); } }
      if (!look) {
        const known = lookFromWords(text), colour = Object.entries(COLOUR_WORDS).find(([w]) => new RegExp('\\b' + w + '\\b').test(text.toLowerCase()))?.[1];
        look = { ...(known || {}), id: 'look-' + Date.now().toString(36), name: text.slice(0, 28), line: 'Made from your words.', prompt: text + (known ? ', ' + known.prompt : ''), mine: true };
        if (colour) { look.ramp = rampAround(colour); look.keep = .25; delete look.halftone; delete look.pixel; }
        if (!look.ramp && !look.halftone && !look.pixel && look.keep !== 1) look.ramp = rampAround(P.COLOUR_WORDS.rose);
      }
      await saveLook(look); paintGrid(); choose(look); toast('Look saved');
    }
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && input.value.trim()) { makeFromWords(input.value.trim()); input.value = ''; } });
    const blend = h('button.chip', { hidden: true, onclick: async () => { if (!chosen || !previous) return; const look = blendLooks(previous, chosen); await saveLook(look); paintGrid(); choose(look); toast('Crossed and saved'); } }, h('span', { html: glyph('sparkle') }), 'Cross');
    const others = threadPrints().filter(p => p.id !== print?.id).slice(-6).reverse();
    prepare();
    return [
      h('div.sheet__head', null, h('h2.t-title', null, 'Looks'), h('span.t-mono.t-soft', null, print ? 'on ' + print.handle : `${all().length} looks`)),
      h('div.looks__stage', null, preview, label), nameEl,
      print ? h('div.looks__controls', null, h('span.t-mono.t-soft', null, 'Gently'), strengthEl, h('span.t-mono.t-soft', null, 'Fully')) : null,
      (print || onPick) ? go : null,
      grid,
      h('section.maker', null,
        h('h3.maker__title', null, h('span', { html: glyph('sparkle') }), 'Make a look'),
        h('div.maker__row', null, input, h('button.send', { 'aria-label': 'Make it', html: icon('arrow'), onclick: () => { if (input.value.trim()) { makeFromWords(input.value.trim()); input.value = ''; } } })),
        h('div.maker__vibes', null, blend, ...['Faded summer polaroid', 'Gold leaf and ink', 'Mint and coral riso'].map(v => h('button.chip', { onclick: () => makeFromWords(v) }, v))),
        others.length ? h('div.maker__from', null, h('span.t-mono.t-soft', null, 'Or borrow another picture’s colours'), h('div.maker__prints', null, others.map(p => h('button.maker__print', { 'aria-label': `Colours of ${p.handle}`, onclick: async () => { const look = lookFromPalette(P.paletteOf(await P.fromBlob(p.blob, 200)), { name: p.handle + '’s colours', from: p.id }); await saveLook(look); paintGrid(); choose(look); } }, h('img', { src: urlOf(p), alt: '' }), h('b', null, p.handle))))) : null),
    ];
  }, { cls: 'sheet--looks', label: 'Looks' });
}
