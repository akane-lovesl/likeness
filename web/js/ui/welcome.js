/**
 * The first visit: four short steps. The name, a room (the app changes as you swipe), today's sky, and whether the
 * room may make little sounds. Everything here can be changed later from the header.
 */
import { h, icon, stage, sleep } from '../core/dom.js';
import { glyph } from '../room/ornaments.js';
import { ROOMS, MOODS, TYPES } from '../room/rooms.js';
import { atmosphere } from '../room/theme.js';
import { changeRoom, setSky, skySettings } from '../room/atmosphere.js';
import { settings } from '../state.js';
import { sound } from '../core/sound.js';
import { studio } from '../studio/studio.js';
import { postcard } from './rooms.js';

export function welcome() {
  Promise.all(Object.values(TYPES).flatMap(t => t.faces.map(f => document.fonts.load(f).catch(() => null))));
  let step = 0;
  const body = h('div.welcome__body');
  const dots = h('div.welcome__dots', { 'aria-hidden': 'true' }, [0, 1, 2, 3].map(() => h('i')));
  const el = h('section.welcome', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Welcome' }, body, dots);
  stage().append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));

  const next = h('button.btn.btn--accent.welcome__next');
  const steps = [
    () => [
      h('div.welcome__mark', { html: glyph(atmosphere.room.ornament) }),
      h('h1.t-display.welcome__name', null, ...'Likeness'.split('').map((c, i) => h('span', { style: { '--i': i } }, c))),
      h('p.t-lede.welcome__line', null, 'A studio that talks back. Bring pictures and words, say what you want, and watch it paint.'),
      h('p.t-mono.t-soft.welcome__edition', null, { showcase: 'Showcase · pictures are sketched on this device', simulator: 'Live · Simulator · a stand-in for the real model', workstation: 'Live · Workstation · real renders' }[studio.mode]),
    ],
    () => {
      const strip = h('div.welcome__rooms');
      const fill = () => strip.replaceChildren(...ROOMS.map(r => postcard(r, { current: r.id === atmosphere.room.id, onPick: (room, e) => { const left = strip.scrollLeft; changeRoom(room, { x: e.clientX, y: e.clientY }).then(() => { fill(); strip.scrollLeft = left; }); } })));
      fill();
      return [h('h2.t-title', null, 'Pick a room'), h('p.t-lede', null, 'Where you’ll work. Tap one and the whole place changes.'), strip];
    },
    () => {
      const moods = h('div.moods');
      const paint = () => moods.replaceChildren(...MOODS.map(m => h('button.mood', { 'aria-pressed': String(skySettings().mood === m.id), onclick: () => { setSky({ mood: m.id, weather: null, light: null, intensity: null }); sound.play('tap'); paint(); } }, h('span', { html: glyph(m.glyph) }), m.label)));
      paint();
      return [h('h2.t-title', null, 'And today?'), h('p.t-lede', null, 'The sky follows your mood until tomorrow morning.'), moods];
    },
    () => {
      const sw = h('button.switch', { role: 'switch', 'aria-checked': String(sound.on) }, h('span.switch__knob'), h('span', null, 'Little sounds'));
      sw.addEventListener('click', () => { const on = !sound.on; settings.set('sound', on); sound.set(on, atmosphere.room.sound); sw.setAttribute('aria-checked', String(on)); sound.play('arrive'); });
      return [h('h2.t-title', null, 'One last thing'), h('p.t-lede', null, 'Each room has its own small sounds: a music box, glass chimes, a typewriter. Quiet, and only when something happens.'), sw,
        h('p.t-soft', { style: { marginTop: '6cqw', fontSize: '3.5cqw' } }, 'Rooms, sky and sounds live in the header whenever you want to change them.')];
    },
  ];
  async function show(i) {
    step = i;
    body.classList.add('is-turning'); await sleep(body.childElementCount ? 180 : 0);
    body.replaceChildren(...steps[i](), next);
    next.replaceChildren(i === 0 ? 'Come in' : i === steps.length - 1 ? 'Begin' : 'Next', h('span', { html: icon('arrow') }));
    [...dots.children].forEach((d, k) => d.classList.toggle('is-on', k === i));
    body.classList.remove('is-turning');
  }
  next.addEventListener('click', () => { sound.play('tap'); if (step < steps.length - 1) show(step + 1); else done(); });
  function done() { settings.set('welcomed', true); el.classList.remove('is-in'); el.classList.add('is-out'); setTimeout(() => el.remove(), 700); }
  show(0);
}
