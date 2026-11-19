/**
 * The first visit: four short steps. The name, over the first picture, painted on the device as you arrive and alive,
 * with its sun to be held; a room (the app changes as you swipe); today's sky; and whether the room may make little
 * sounds. Everything here can be changed later from the header.
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
import * as P from '../studio/painter.js';
import { alive } from './life.js';
import { reduced } from '../core/motion.js';

export function welcome() {
  Promise.all(Object.values(TYPES).flatMap(t => t.faces.map(f => document.fonts.load(f).catch(() => null))));
  let step = 0;
  const body = h('div.welcome__body');
  const dots = h('div.welcome__dots', { 'aria-hidden': 'true' }, [0, 1, 2, 3].map(() => h('i')));
  const scene = h('div.welcome__scene');
  const el = h('section.welcome', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Welcome' }, scene, body, dots);
  let first = /** @type {{ stop: () => void } | null} */ (null);
  stage().append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));

  const next = h('button.btn.btn--accent.welcome__next');
  const steps = [
    () => [
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
    step = i; el.dataset.step = String(i);
    if (i === 0 && !first) requestAnimationFrame(() => { first = firstPicture(scene); });
    else if (i > 0) { first?.stop(); first = null; }
    body.classList.add('is-turning'); await sleep(body.childElementCount ? 180 : 0);
    body.replaceChildren(...steps[i](), next);
    next.replaceChildren(i === 0 ? 'Come in' : i === steps.length - 1 ? 'Begin' : 'Next', h('span', { html: icon('arrow') }));
    [...dots.children].forEach((d, k) => d.classList.toggle('is-on', k === i));
    body.classList.remove('is-turning');
  }
  next.addEventListener('click', () => { sound.play('tap'); if (step < steps.length - 1) show(step + 1); else done(); });
  function done() { first?.stop(); settings.set('welcomed', true); el.classList.remove('is-in'); el.classList.add('is-out'); setTimeout(() => el.remove(), 700); }
  show(0);
}

/**
 * The first picture: painted here on the device as the welcome opens, and alive, the boat rocking and birds going over.
 * Its sun can be held. Drag it and the place is painted again under your finger, through the golden hour into night,
 * when the stars come out and the lighthouse's lamp goes round.
 * @param {HTMLElement} host @returns {{ stop: () => void }}
 */
function firstPicture(host) {
  const desc = P.sceneFrom('lighthouse by the sea at dusk with a boat', null, 11);
  const view = h('canvas.welcome__paint'), say = h('span.sun__say');
  const knob = h('button.sun.welcome__sun', { type: 'button' }, say, h('span.sun__hint', null, 'Drag the sun'));
  host.replaceChildren(view, knob);
  const box = host.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1), W = Math.max(2, Math.round(box.width * d)), H = Math.max(2, Math.round(box.height * d));
  view.width = W; view.height = H;
  const vx = /** @type {CanvasRenderingContext2D} */ (view.getContext('2d'));
  let living = /** @type {{ stop: () => void } | null} */ (null), sun = /** @type {number[] | null} */ (null), frame = 0, ticket = 0, stopped = false;
  const words = () => P.hourWords(sun || desc.sunAt?.sun || [.7, .7]);
  /** Painted at a scale of the full size: half while a finger is moving the sun, whole once it lets go. */
  function paint(/** @type {number} */ scale) {
    const c = P.scene(desc, Math.max(2, Math.round(W * scale)), Math.max(2, Math.round(H * scale))), at = desc.sunAt;
    vx.clearRect(0, 0, W, H); vx.drawImage(c, 0, 0, W, H);
    if (at) {
      knob.style.left = at.x * 100 + '%'; knob.style.top = at.y * 100 + '%'; knob.style.setProperty('--d', Math.max(at.r * 2.2, .12) * 100 + '%');
      knob.classList.toggle('is-down', (sun || at.sun)[1] > 1);
    }
    say.textContent = words(); knob.setAttribute('aria-label', `The sun, ${words()}. Drag it, or use the arrow keys, to change the hour.`);
  }
  function liven(wait = 160) {
    const mine = ++ticket; living?.stop(); living = null;
    if (reduced) return;
    setTimeout(() => { if (!stopped && mine === ticket) living = alive(host, { ...P.lifeIn(desc, W, H), picture: view }, knob, 'welcome__life'); }, wait);
  }
  function move(/** @type {number} */ u, /** @type {number} */ v) {
    // the sun can go under the sea, but not so far that it sinks into the page below the picture
    const was = words(), b = desc.sunAt?.box || [0, 0, 1, .6], low = Math.min(1.85, (.76 - b[1]) / b[3]);
    sun = [Math.min(.96, Math.max(.04, u)), Math.min(low, Math.max(.06, v))];
    P.setSun(desc, sun);
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(.5); });
    if (words() !== was) sound.play('tap');
  }
  const held = () => knob.classList.contains('is-held');
  knob.addEventListener('pointerdown', e => {
    e.preventDefault(); try { knob.setPointerCapture(e.pointerId); } catch { /* fine */ }
    knob.classList.add('is-held'); host.classList.add('is-relighting'); knob.querySelector('.sun__hint')?.remove(); ticket++; living?.stop(); living = null;
  });
  knob.addEventListener('pointermove', e => {
    if (!held()) return;
    const r = host.getBoundingClientRect(), b = desc.sunAt?.box || [0, 0, 1, .6];
    move(((e.clientX - r.left) / r.width - b[0]) / b[2], ((e.clientY - r.top) / r.height - b[1]) / b[3]);
  });
  const letGo = () => { if (!held()) return; knob.classList.remove('is-held'); host.classList.remove('is-relighting'); cancelAnimationFrame(frame); frame = 0; paint(1); liven(); };
  knob.addEventListener('pointerup', letGo); knob.addEventListener('pointercancel', letGo);
  knob.addEventListener('keydown', e => {
    const step = /** @type {Record<string, number[]>} */ ({ ArrowLeft: [-.04, 0], ArrowRight: [.04, 0], ArrowUp: [0, -.06], ArrowDown: [0, .06] })[e.key];
    if (!step) return;
    e.preventDefault(); const s = sun || desc.sunAt?.sun || [.7, .7]; move(s[0] + step[0], s[1] + step[1]); cancelAnimationFrame(frame); frame = 0; paint(1); liven();
  });
  // alive once the name has landed, so its letters never wait on the painter
  paint(1); host.classList.add('is-painted'); liven(1300);
  return { stop() { stopped = true; ticket++; living?.stop(); living = null; } };
}
