/**
 * Today's sky: how the day feels (a mood sets weather, light and tempo at once), or each part by hand.
 * It lasts until tomorrow; the room's own sky comes back in the morning.
 */
import { h, icon, sheet } from '../core/dom.js';
import { glyph } from '../room/ornaments.js';
import { MOODS, WEATHERS, LIGHTS } from '../room/rooms.js';
import { skySettings, setSky, skyFor } from '../room/atmosphere.js';
import { atmosphere } from '../room/theme.js';
import { sound } from '../core/sound.js';
import { settings } from '../state.js';
import { outside, setOutside, refreshOutside } from '../room/outside.js';
import { applySky } from '../room/atmosphere.js';

const SOUND_NAMES = { musicbox: 'a music box', wood: 'a marimba', glass: 'glass chimes', synth: 'an arcade synth', typewriter: 'a typewriter', none: 'silence' };

export function openSky() {
  sound.play('tap');
  return sheet(() => {
    const moods = h('div.moods'), weathers = h('div.weathers'), lights = h('div.lights');
    const intensity = h('input.range', { type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': 'How much weather' });
    const soundBtn = h('button.switch', { role: 'switch' });
    const outBtn = h('button.switch', { role: 'switch' }), outNote = h('p.t-soft.sky__outnote');
    let looking = false;
    function paint() {
      const s = skySettings(), now = skyFor();
      moods.replaceChildren(...MOODS.map(m => h('button.mood', { 'aria-pressed': String(s.mood === m.id), onclick: () => { setSky({ mood: s.mood === m.id ? null : m.id, weather: null, light: null, intensity: null }); sound.play('tap'); paint(); } }, h('span', { html: glyph(m.glyph) }), m.label)));
      weathers.replaceChildren(...WEATHERS.map(w => h('button.weather', { 'aria-pressed': String(now.weather === w.id), onclick: () => { setSky({ weather: w.id }); paint(); } }, h('span', { html: glyph(w.glyph) }), w.label)));
      lights.replaceChildren(...LIGHTS.map(l => h('button.chip', { 'aria-pressed': String(now.light === l.id), onclick: () => { setSky({ light: l.id }); paint(); } }, l.label)));
      intensity.value = String(now.intensity);
      const pal = atmosphere.room.sound;
      const o = outside(), seen = WEATHERS.find(w => w.id === o.weather);
      outBtn.setAttribute('aria-checked', String(o.on));
      outBtn.replaceChildren(h('span.switch__knob'), h('span', null, !o.on ? 'As it is outside' : looking ? 'Looking outside…' : seen ? `As outside · ${seen.label} · ${o.temp}°` : 'As outside'));
      outNote.textContent = o.on ? 'Your rounded position goes to open-meteo.com for the weather, now and then. A mood or a weather you pick still comes first.' : 'Let the real weather come in. Off until you say so.';
      soundBtn.setAttribute('aria-checked', String(sound.on));
      soundBtn.replaceChildren(h('span.switch__knob'), h('span', null, sound.on ? `On · ${SOUND_NAMES[pal] || pal}` : 'Off'));
    }
    intensity.addEventListener('input', () => setSky({ intensity: Number(intensity.value) }));
    outBtn.addEventListener('click', async () => {
      const on = !outside().on; setOutside(on); sound.play('tap');
      if (!on) { applySky(); paint(); return; }
      looking = true; paint();
      try { await refreshOutside({ force: true }); applySky(); } catch { setOutside(false); outNote.textContent = 'Couldn’t see outside: no location, or no network.'; looking = false; outBtn.setAttribute('aria-checked', 'false'); return; }
      looking = false; paint();
    });
    soundBtn.addEventListener('click', () => { const on = !sound.on; settings.set('sound', on); sound.set(on, atmosphere.room.sound); sound.play('arrive'); paint(); });
    paint();
    return [
      h('div.sheet__head', null, h('h2.t-title', null, 'Today’s sky'), h('button.link.t-mono', { onclick: () => { setSky({ mood: null, weather: null, light: null, intensity: null }); paint(); } }, 'The room’s own')),
      h('p.t-lede', null, 'How’s the day?'), moods,
      h('h3.sheet__sub.t-mono.t-soft', null, 'Weather'), weathers,
      h('div.sky__outside', null, outBtn, outNote),
      h('h3.sheet__sub.t-mono.t-soft', null, 'Light'), lights,
      h('h3.sheet__sub.t-mono.t-soft', null, 'How much'), intensity,
      h('h3.sheet__sub.t-mono.t-soft', null, 'Little sounds'), soundBtn,
      h('p.t-mono.t-soft', { style: { marginTop: '5cqw', textAlign: 'center' } }, 'Until tomorrow morning'),
    ];
  }, { cls: 'sheet--sky', label: 'Today’s sky' });
}
