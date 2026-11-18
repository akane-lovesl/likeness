/**
 * Entering a room: every colour, face, texture and tempo changes at once, revealed through the room's own shape
 * (a heart, a star, a wave, venetian blinds) growing from the finger that asked for it.
 */
import { TYPES } from './rooms.js';
import { dressSet } from './set.js';
import { mix, alpha, ensure, readable } from '../core/color.js';
import { reduced } from '../core/motion.js';
import { emit } from '../core/bus.js';
import { sleep } from '../core/dom.js';

const TEXTURES = {
  grain: { image: 'var(--grain)', a: [.14, .09], blend: ['multiply', 'screen'], size: '220px' },
  'grain-heavy': { image: 'var(--grain)', a: [.24, .16], blend: ['multiply', 'screen'], size: '180px' },
  linen: { image: 'repeating-linear-gradient(0deg, rgb(0 0 0 / .04) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgb(0 0 0 / .03) 0 1px, transparent 1px 4px), var(--grain)', a: [.28, .2], blend: ['multiply', 'screen'], size: 'auto, auto, 220px' },
  scanlines: { image: 'repeating-linear-gradient(0deg, rgb(255 255 255 / .06) 0 1px, transparent 1px 3px)', a: [.5, .7], blend: ['multiply', 'screen'], size: 'auto' },
  dots: { image: 'radial-gradient(rgb(0 0 0 / .14) 1px, transparent 1.4px)', a: [.5, .3], blend: ['multiply', 'screen'], size: '14px 14px' },
  stripes: { image: 'repeating-linear-gradient(90deg, rgb(0 0 0 / .035) 0 18px, transparent 18px 36px)', a: [1, .5], blend: ['multiply', 'screen'], size: 'auto' },
  none: { image: 'none', a: [0, 0], blend: ['normal', 'normal'], size: 'auto' },
};
const MOTION = {
  calm: { tempo: 1, ease: 'cubic-bezier(.2, .7, .1, 1)', pop: 'cubic-bezier(.3, 1.3, .5, 1)' },
  float: { tempo: 1.2, ease: 'cubic-bezier(.25, .8, .25, 1)', pop: 'cubic-bezier(.34, 1.45, .55, 1)' },
  crisp: { tempo: .8, ease: 'cubic-bezier(.16, 1, .3, 1)', pop: 'cubic-bezier(.2, 1.25, .4, 1)' },
  bouncy: { tempo: .95, ease: 'cubic-bezier(.2, .8, .2, 1)', pop: 'cubic-bezier(.34, 1.8, .5, 1)' },
};

export const atmosphere = { /** @type {any} */ room: null, moodTempo: 1 };

/** The custom properties a room sets on the document. */
export function varsFor(room) {
  const c = room.colors, t = TYPES[room.type] || TYPES.editorial, dark = !!room.dark, tex = TEXTURES[room.texture] || TEXTURES.grain, m = MOTION[room.motion] || MOTION.calm;
  const ink = ensure(c.ink, c.surface, 7), soft = ensure(c.soft, c.surface, 3.4);
  return {
    '--ground': c.ground, '--ground-2': c.ground2, '--surface': c.surface, '--ink': ink, '--soft': soft, '--accent': c.accent, '--accent-2': c.accent2,
    '--on-accent': c.onAccent || readable(c.accent), '--rule': alpha(ink, dark ? .16 : .13), '--veil': alpha(c.ground, .82), '--accent-soft': mix(c.accent, c.surface, dark ? .7 : .84),
    '--shade': dark ? 'rgb(0 0 0 / .55)' : alpha(mix(ink, '#000000', .4), .26),
    '--font-display': t.display, '--font-text': t.text, '--font-mono': t.mono, '--font-hand': t.hand,
    '--d-scale': t.dScale, '--d-weight': t.dWeight, '--d-track': t.dTrack, '--d-case': t.dCase, '--d-style': t.dStyle, '--t-weight': t.tWeight, '--t-scale': t.tScale, '--m-scale': t.mScale, '--t-track': t.tTrack,
    '--radius': (room.radius ?? 2) + 'cqw', '--print-radius': Math.min(room.radius ?? 2, 3) * .6 + 'cqw',
    '--tempo': (m.tempo * atmosphere.moodTempo).toFixed(3), '--ease': m.ease, '--ease-pop': m.pop,
    '--texture': tex.image, '--texture-a': tex.a[dark ? 1 : 0], '--texture-blend': tex.blend[dark ? 1 : 0], '--texture-size': tex.size,
    '--card-shadow': dark ? '0 0 0 1px rgb(255 255 255 / .07), 0 3cqw 8cqw -2cqw rgb(0 0 0 / .7)' : `0 .2cqw .5cqw ${alpha(ink, .07)}, 0 2.6cqw 6cqw -2.2cqw ${alpha(mix(c.accent, ink, .55), .3)}`,
  };
}

/** Paints a room at once, with no transition. */
export function paint(room) {
  const html = document.documentElement, vars = varsFor(room);
  for (const [k, v] of Object.entries(vars)) html.style.setProperty(k, String(v));
  const data = { room: room.id, frame: room.frame || 'print', set: room.set || 'none', type: room.type };
  Object.assign(html.dataset, data);
  const stage = document.getElementById('stage');
  for (const el of [html, stage]) { if (!el) continue; if (room.dark) el.dataset.dark = ''; else delete el.dataset.dark; }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', room.colors.ground);
  dressSet(room);
  atmosphere.room = room;
  try { localStorage.setItem('likeness.paint', JSON.stringify({ vars, data })); } catch { /* private mode */ }
}

/** Sets how fast everything moves, from the mood of the day. */
export function setTempo(moodTempo = 1) {
  atmosphere.moodTempo = moodTempo;
  if (atmosphere.room) document.documentElement.style.setProperty('--tempo', ((MOTION[atmosphere.room.motion] || MOTION.calm).tempo * moodTempo).toFixed(3));
}

const fontsFor = room => Promise.race([Promise.all((TYPES[room.type] || TYPES.editorial).faces.map(f => document.fonts.load(f).catch(() => null))), sleep(700)]);

let busy = Promise.resolve();
/**
 * Enters a room. With an origin (client coordinates), the new room grows from there in its own shape.
 * @param {any} room @param {{ origin?: { x: number, y: number } | null, instant?: boolean }} [o]
 */
export function enterRoom(room, { origin = null, instant = false } = {}) {
  busy = busy.then(async () => {
    await fontsFor(room);
    const d = /** @type {any} */ (document), html = document.documentElement;
    const apply = () => { paint(room); emit('room', room); };
    if (instant || reduced || !d.startViewTransition) { if (!d.startViewTransition) html.classList.add('no-vt'); apply(); return; }
    html.dataset.wipe = room.wipe || 'ink';
    const vt = d.startViewTransition(apply);
    try { await vt.ready; wipe(room.wipe, origin || { x: innerWidth / 2, y: innerHeight * .3 }); await vt.finished; } catch { /* skipped */ }
    delete html.dataset.wipe;
  });
  return busy;
}

/** The reveal itself, on the new snapshot of the page. */
function wipe(kind, { x, y }) {
  const W = innerWidth, H = innerHeight, R = Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) * 1.04;
  const el = document.documentElement, pseudoElement = '::view-transition-new(root)';
  const tempo = Number(getComputedStyle(el).getPropertyValue('--tempo')) || 1, duration = 980 * tempo, easing = 'cubic-bezier(.62, 0, .3, 1)';
  const opts = { duration, easing, pseudoElement, fill: /** @type {FillMode} */ ('both') };
  if (kind === 'heart' || kind === 'star' || kind === 'leaf') {
    const S = R * { heart: 3.3, star: 5.2, leaf: 2.9 }[kind], cy = kind === 'heart' ? .56 : .5;
    return el.animate({ maskSize: ['0px 0px', `${S}px ${S}px`], maskPosition: [`${x}px ${y}px`, `${x - S / 2}px ${y - S * cy}px`] }, opts);
  }
  if (kind === 'blinds') return el.animate({ '--slat': ['0px', '46px'] }, { ...opts, duration: duration * 1.1 });
  if (kind === 'scan') return el.animate({ '--slat': ['0px', '12px'] }, { ...opts, duration: duration * .8, easing: 'steps(12, end)' });
  if (kind === 'curtain') return el.animate({ clipPath: ['inset(0 50% 0 50%)', 'inset(0 0% 0 0%)'] }, opts);
  if (kind === 'wave') {
    const frames = [], N = 24, steps = 14;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, level = H * (1.06 - t * 1.22), amp = 30 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 3, pts = [];
      for (let i = 0; i <= N; i++) pts.push(`${(i / N * W).toFixed(1)}px ${(level + Math.sin(i / N * Math.PI * 3.2 + t * 7) * amp).toFixed(1)}px`);
      pts.push(`${W}px ${H}px`, `0px ${H}px`);
      frames.push({ clipPath: `polygon(${pts.join(',')})` });
    }
    return el.animate(frames, { ...opts, easing: 'cubic-bezier(.45, .05, .4, 1)' });
  }
  return el.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${R}px at ${x}px ${y}px)`] }, opts);
}
