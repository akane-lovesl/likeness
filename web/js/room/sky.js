/**
 * The sky: weather drawn behind the cards, and a few nearer flakes, petals or notes drifting in front of them.
 * One loop for both canvases; it stops itself when the sky is clear and nothing is bursting.
 */
import { path2d } from './ornaments.js';
import { reduced } from '../core/motion.js';
import { mix, alpha } from '../core/color.js';
import { clockLight } from './rooms.js';

const TAU = Math.PI * 2, R = Math.random, AREA = 360 * 640;

/** A soft round sprite, tinted on demand, for glows and fog. */
const sprites = new Map();
function sprite(col, hard = .0) {
  const key = col + hard;
  if (!sprites.has(key)) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, col); grad.addColorStop(Math.max(.05, hard), col); grad.addColorStop(1, alpha(col.startsWith('#') ? col : '#ffffff', 0));
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64); sprites.set(key, c);
  }
  return sprites.get(key);
}
function shape(c, name, x, y, size, rot = 0, sx = 1) {
  const p = path2d(name);
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(sx * size / 24, size / 24); c.translate(-12, -12);
  if (p.f) c.fill(p.f);
  if (p.s) { c.lineWidth = 1.6; c.lineCap = 'round'; c.stroke(p.s); }
  c.restore();
}

/**
 * Kinds of weather. n is how many at full intensity on a 360 × 640 stage; front is the share that drifts in front of the cards.
 * @type {Record<string, { n: number, front?: number, init: Function, step?: Function, draw?: Function, batch?: Function }>}
 */
const KINDS = {
  rain: {
    n: 84, front: .06,
    init(p, w, h, s, fill) { p.x = R() * w * 1.3 - w * .15; p.y = fill ? R() * h : -R() * h * .4; p.len = 9 + R() * 17; p.v = 640 + R() * 520; p.a = .16 + R() * .24; p.w = .6 + R() * .8; },
    step(p, dt, w, h, s) { p.y += p.v * dt * s.speed; p.x += s.wind * 120 * dt; if (p.y - p.len > h) { p.y = -p.len - R() * 60; p.x = R() * w * 1.3 - w * .15; } },
    batch(c, list, s, front) {
      c.strokeStyle = s.rain; c.lineCap = 'round';
      for (const a of [.5, 1]) {
        c.globalAlpha = (front ? .55 : .9) * a * .5; c.lineWidth = front ? 1.6 : .9; c.beginPath();
        for (const p of list) { if ((p.a > .3) !== (a === 1)) continue; const k = front ? 1.7 : 1; c.moveTo(p.x, p.y); c.lineTo(p.x - s.wind * 3.5, p.y - p.len * k); }
        c.stroke();
      }
    },
  },
  drizzle: {
    n: 40, front: .05,
    init(p, w, h, s, fill) { KINDS.rain.init(p, w, h, s, fill); p.len *= .5; p.v *= .55; p.a *= .7; },
    step(p, dt, w, h, s) { KINDS.rain.step(p, dt, w, h, s); },
    batch(c, list, s, front) { KINDS.rain.batch(c, list, s, front); },
  },
  snow: {
    n: 72, front: .1,
    init(p, w, h, s, fill) { p.x = R() * w; p.y = fill ? R() * h : -8; p.r = .8 + R() * 2.4; p.v = 14 + p.r * 11 + R() * 10; p.amp = 8 + R() * 22; p.ph = R() * TAU; p.fr = .4 + R() * .8; p.a = .5 + R() * .45; },
    step(p, dt, w, h, s, t) { p.y += p.v * dt * s.speed; p.x += (Math.cos(t * p.fr + p.ph) * p.amp * .7 + s.wind * 30) * dt; if (p.y > h + 8) { p.y = -8; p.x = R() * w; } if (p.x > w + 10) p.x = -10; else if (p.x < -10) p.x = w + 10; },
    batch(c, list, s, front) { c.fillStyle = s.snow; c.globalAlpha = front ? .6 : .85; c.beginPath(); for (const p of list) { const r = p.r * (front ? 2.2 : 1); c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, TAU); } c.fill(); },
  },
  petals: {
    n: 26, front: .14,
    init(p, w, h, s, fill) { p.x = R() * w; p.y = fill ? R() * h : -14; p.size = 7 + R() * 6; p.v = 18 + R() * 26; p.rot = R() * TAU; p.vr = (R() - .5) * 2.4; p.flip = R() * TAU; p.fs = 1.2 + R() * 1.6; p.ph = R() * TAU; p.col = s.pick(s.petalCols); },
    step(p, dt, w, h, s, t) { p.y += p.v * dt * s.speed; p.x += (Math.sin(t * .7 + p.ph) * 24 + s.wind * 40) * dt; p.rot += p.vr * dt; p.flip += p.fs * dt; if (p.y > h + 16) { p.y = -16; p.x = R() * w; } if (p.x > w + 16) p.x = -16; else if (p.x < -16) p.x = w + 16; },
    draw(c, p, s, front) { c.fillStyle = p.col; c.globalAlpha = front ? .7 : .85; shape(c, 'petal', p.x, p.y, p.size * (front ? 1.9 : 1), p.rot, Math.cos(p.flip)); },
  },
  hearts: {
    n: 16, front: .12,
    init(p, w, h, s, fill) { p.x = R() * w; p.y = fill ? R() * h : h + 16; p.size = 7 + R() * 7; p.v = -(12 + R() * 20); p.ph = R() * TAU; p.col = s.pick(s.heartCols); p.glyph = 'heart'; },
    step(p, dt, w, h, s, t) { p.y += p.v * dt * s.speed; p.x += Math.sin(t * .9 + p.ph) * 14 * dt; if (p.y < -20) { p.y = h + 20; p.x = R() * w; } },
    draw(c, p, s, front, h) { c.fillStyle = p.col; c.globalAlpha = Math.min(1, (h - p.y) / 90, (p.y + 20) / 140) * (front ? .5 : .7); shape(c, p.glyph, p.x, p.y, p.size * (front ? 1.8 : 1), Math.sin(p.ph + p.y * .02) * .25); },
  },
  notes: {
    n: 14, front: .12,
    init(p, w, h, s, fill) { KINDS.hearts.init(p, w, h, s, fill); p.glyph = R() < .5 ? 'note' : 'notes'; p.col = s.pick(s.noteCols); p.size += 3; },
    step(...a) { KINDS.hearts.step(...a); },
    draw(...a) { KINDS.hearts.draw(...a); },
  },
  leaves: {
    n: 18, front: .12,
    init(p, w, h, s, fill) { p.x = R() * w; p.y = fill ? R() * h : -16; p.size = 10 + R() * 8; p.v = 26 + R() * 30; p.rot = R() * TAU; p.vr = (R() - .5) * 3.2; p.flip = R() * TAU; p.fs = 1 + R() * 2; p.ph = R() * TAU; p.col = s.pick(s.leafCols); },
    step(p, dt, w, h, s, t) { p.y += p.v * dt * s.speed; p.x += (Math.sin(t * .5 + p.ph) * 30 + s.wind * 70 + Math.sin(t * .23) * 26) * dt; p.rot += p.vr * dt; p.flip += p.fs * dt; if (p.y > h + 20) { p.y = -20; p.x = R() * w; } if (p.x > w + 20) p.x = -20; else if (p.x < -20) p.x = w + 20; },
    draw(c, p, s, front) { c.fillStyle = p.col; c.strokeStyle = alpha('#000000', .15); c.globalAlpha = front ? .6 : .8; shape(c, 'leaf', p.x, p.y, p.size * (front ? 1.8 : 1), p.rot, Math.cos(p.flip)); },
  },
  fireflies: {
    n: 26, front: .1,
    init(p, w, h) { p.x = R() * w; p.y = h * .25 + R() * h * .75; p.fx = .2 + R() * .5; p.fy = .2 + R() * .5; p.ph = R() * TAU; p.ph2 = R() * TAU; p.pf = .6 + R() * 1.2; p.r = 2 + R() * 3; },
    step(p, dt, w, h, s, t) { p.x += (Math.cos(t * p.fx + p.ph) * 16 + s.wind * 6) * dt; p.y += (Math.sin(t * p.fy + p.ph2) * 11 - 2) * dt; if (p.x > w + 10) p.x = -10; else if (p.x < -10) p.x = w + 10; if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10; },
    draw(c, p, s, front, h, t) { const a = Math.max(0, Math.sin(t * p.pf + p.ph)) ** 2; if (a < .02) return; c.globalAlpha = a * (front ? .7 : .95); const r = p.r * (front ? 2 : 1) * 3.2; c.globalCompositeOperation = s.dark ? 'lighter' : 'source-over'; c.drawImage(sprite(s.firefly, .12), p.x - r, p.y - r, r * 2, r * 2); c.globalCompositeOperation = 'source-over'; },
  },
  stars: {
    n: 110, front: 0,
    init(p, w, h) { p.x = R() * w; p.y = R() * h * .92; p.r = .35 + R() ** 3 * 1.7; p.f = .5 + R() * 2; p.ph = R() * TAU; },
    draw(c, p, s, front, h, t) {
      const a = .3 + .7 * (.5 + .5 * Math.sin(t * p.f + p.ph)); c.globalAlpha = a; c.fillStyle = s.star;
      if (p.r > 1.45) shape(c, 'sparkle', p.x, p.y, p.r * 6.5, 0); else { c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); }
    },
  },
  glints: {
    n: 22, front: .1,
    init(p, w, h, s) { p.x = R() * w; p.y = R() * h; p.T = 1.2 + R() * 1.8; p.age = R() * p.T; p.size = 6 + R() * 8; p.col = s.pick(s.glintCols); },
    step(p, dt, w, h) { p.age += dt; if (p.age > p.T) { p.age = 0; p.x = R() * w; p.y = R() * h; } },
    draw(c, p, s, front) { const k = Math.sin(Math.PI * p.age / p.T); c.globalAlpha = k * (front ? .6 : .9); c.fillStyle = p.col; shape(c, 'sparkle', p.x, p.y, p.size * k * (front ? 1.8 : 1), p.age * .6); },
  },
  sparkles: {
    n: 26, front: .12,
    init(p, w, h, s) { KINDS.glints.init(p, w, h, s); p.T *= .55; p.col = s.pick(s.sparkCols); },
    step(...a) { KINDS.glints.step(...a); },
    draw(...a) { KINDS.glints.draw(...a); },
  },
  bubbles: {
    n: 22, front: .12,
    init(p, w, h, s, fill) { p.x = R() * w; p.y = fill ? R() * h : h + 12; p.r = 3 + R() * 7; p.v = -(16 + R() * 26); p.ph = R() * TAU; },
    step(p, dt, w, h, s, t) { p.y += p.v * dt * s.speed; p.x += Math.sin(t * 1.4 + p.ph) * 12 * dt; if (p.y < -16) { p.y = h + 16; p.x = R() * w; } },
    draw(c, p, s, front) { const r = p.r * (front ? 1.8 : 1); c.globalAlpha = front ? .35 : .5; c.strokeStyle = s.bubble; c.lineWidth = 1; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.stroke(); c.fillStyle = s.bubble; c.beginPath(); c.arc(p.x - r * .38, p.y - r * .38, r * .18, 0, TAU); c.fill(); },
  },
  embers: {
    n: 30, front: .1,
    init(p, w, h, s, fill) { p.x = R() * w; p.y = fill ? R() * h : h + 8; p.r = .8 + R() * 1.6; p.v = -(24 + R() * 44); p.ph = R() * TAU; p.col = s.pick(s.emberCols); },
    step(p, dt, w, h, s, t) { p.y += p.v * dt * s.speed; p.x += (Math.sin(t * 2 + p.ph) * 16 + s.wind * 20) * dt; if (p.y < -10) { p.y = h + 10; p.x = R() * w; } },
    draw(c, p, s, front, h, t) { c.globalAlpha = (.5 + .5 * Math.sin(t * 9 + p.ph)) * Math.min(1, p.y / 200) * (front ? .6 : .9); const r = p.r * 4 * (front ? 1.8 : 1); c.globalCompositeOperation = s.dark ? 'lighter' : 'source-over'; c.drawImage(sprite(p.col, .2), p.x - r, p.y - r, r * 2, r * 2); c.globalCompositeOperation = 'source-over'; },
  },
  confetti: {
    n: 46, front: .1,
    init(p, w, h, s, fill) { p.x = R() * w; p.y = fill ? R() * h : -10; p.v = 40 + R() * 50; p.rot = R() * TAU; p.vr = (R() - .5) * 6; p.flip = R() * TAU; p.col = s.pick(s.confettiCols); p.ph = R() * TAU; },
    step(p, dt, w, h, s, t) { p.y += p.v * dt * s.speed; p.x += (Math.sin(t + p.ph) * 18 + s.wind * 40) * dt; p.rot += p.vr * dt; p.flip += 5 * dt; if (p.y > h + 10) { p.y = -10; p.x = R() * w; } },
    draw(c, p, s, front) { const k = front ? 1.8 : 1; c.globalAlpha = .9; c.fillStyle = p.col; c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.scale(1, Math.cos(p.flip)); c.fillRect(-2 * k, -3.5 * k, 4 * k, 7 * k); c.restore(); },
  },
  fog: {
    n: 6, front: 0,
    init(p, w, h) { p.x = R() * w; p.y = h * .3 + R() * h * .75; p.r = 130 + R() * 150; p.v = (6 + R() * 10) * (R() < .5 ? -1 : 1); p.a = .1 + R() * .09; },
    step(p, dt, w) { p.x += p.v * dt; if (p.x - p.r > w) p.x = -p.r; else if (p.x + p.r < 0) p.x = w + p.r; },
    draw(c, p, s) { c.globalAlpha = p.a; c.drawImage(sprite(s.fog), p.x - p.r, p.y - p.r * .6, p.r * 2, p.r * 1.2); },
  },
  motes: {
    n: 46, front: .08,
    init(p, w, h) { p.x = R() * w; p.y = R() * h; p.r = .5 + R() * 1.5; p.vx = (R() - .5) * 7; p.vy = -(1 + R() * 6); p.ph = R() * TAU; p.f = .5 + R(); },
    step(p, dt, w, h, s) { p.x += (p.vx + s.wind * 8) * dt; p.y += p.vy * dt; if (p.y < -4) { p.y = h + 4; p.x = R() * w; } if (p.x > w + 4) p.x = -4; else if (p.x < -4) p.x = w + 4; },
    draw(c, p, s, front, h, t) { const band = Math.max(.15, 1 - Math.abs((p.x / 360) * .9 + (p.y / 640) * .6 - .55) * 1.6); c.globalAlpha = (.3 + .7 * Math.sin(t * p.f + p.ph) ** 2) * band * (front ? .5 : .9); c.fillStyle = s.mote; c.beginPath(); c.arc(p.x, p.y, p.r * (front ? 2 : 1), 0, TAU); c.fill(); },
  },
};

/** What each named weather is made of: [kind, share of its usual number]. */
const WEATHER = {
  clear: [], motes: [['motes', 1]], petals: [['petals', 1]], hearts: [['hearts', 1], ['glints', .3]], notes: [['notes', 1], ['glints', .2]],
  rain: [['rain', 1]], drizzle: [['drizzle', 1], ['fog', .7]], snow: [['snow', 1]], leaves: [['leaves', 1]], fireflies: [['fireflies', 1]],
  stars: [['stars', 1]], glints: [['glints', 1]], sparkles: [['sparkles', 1]], bubbles: [['bubbles', 1]], embers: [['embers', 1]],
  confetti: [['confetti', 1]], fog: [['fog', 1], ['motes', .4]],
};

const state = { weather: 'clear', light: 'auto', intensity: .7, wind: .35, tempo: 1 };
let back = /** @type {HTMLCanvasElement|null} */ (null), front = /** @type {HTMLCanvasElement|null} */ (null), bc = null, fc = null, stageEl = null;
let W = 360, H = 640, dpr = 1, raf = 0, last = 0, t = 0, lightTimer = 0;
/** @type {{ kind: string, list: any[] }[]} */ let systems = [];
/** @type {any[]} */ let bursts = [];
let palette = /** @type {any} */ ({});
let shooting = null, nextShoot = 4;

function colours(room) {
  const c = room.colors, dark = !!room.dark, white = '#ffffff';
  return {
    dark, pick: list => list[Math.floor(R() * list.length)],
    rain: dark ? mix(c.accent2, white, .45) : mix(c.ink, c.ground, .35), snow: dark ? '#f4f6ff' : mix(white, c.accent2, .12),
    petalCols: [c.accent, mix(c.accent, white, .45), mix(c.accent, c.surface, .25), mix(c.accent, '#ffd1dc', .5)],
    heartCols: [c.accent, mix(c.accent, white, .35), c.accent2], noteCols: [c.accent2, mix(c.ink, c.ground, .45), c.accent],
    leafCols: [c.accent2, mix(c.accent2, '#d6b25e', .45), mix(c.accent2, c.ink, .3), c.accent],
    firefly: dark ? '#f6f7a8' : mix(c.accent2, '#ffcf55', .5), star: dark ? mix(c.ink, white, .5) : c.accent2,
    glintCols: dark ? [white, c.accent2, c.accent] : [white, mix(c.accent2, white, .3), '#ffe39a'],
    sparkCols: [c.accent, c.accent2, white], bubble: dark ? mix(c.accent2, white, .4) : mix(c.accent2, c.ink, .25),
    emberCols: ['#ff9a3c', '#ffcf6b', c.accent], confettiCols: [c.accent, c.accent2, mix(c.accent, '#ffd36e', .5), mix(c.accent2, white, .4), c.ink],
    fog: dark ? mix(c.ground, white, .35) : white, mote: dark ? mix(c.ink, white, .3) : mix(c.accent2, '#a36b00', .25),
    burstCols: [c.accent, c.accent2, mix(c.accent, white, .35)], motifs: room.motifs?.length ? room.motifs : ['sparkle'],
  };
}

function build(fill = true) {
  const scale = (W * H) / AREA, k = .25 + state.intensity * 1.15;
  systems = (WEATHER[state.weather] || []).map(([kind, share]) => {
    const def = KINDS[kind], count = Math.round(def.n * share * k * Math.min(1.6, scale)), list = [];
    for (let i = 0; i < count; i++) { const p = { front: R() < (def.front || 0) }; def.init(p, W, H, palette, fill); list.push(p); }
    return { kind, list };
  });
  wake();
}

function resize() {
  if (!stageEl || !back || !front) return;
  const r = stageEl.getBoundingClientRect();
  W = Math.max(1, r.width); H = Math.max(1, r.height); dpr = Math.min(devicePixelRatio || 1, 1.75);
  for (const cv of [back, front]) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  bc.setTransform(dpr, 0, 0, dpr, 0, 0); fc.setTransform(dpr, 0, 0, dpr, 0, 0);
  build(true);
  if (reduced) draw(0);
}

function draw(dt) {
  bc.clearRect(0, 0, W, H); fc.clearRect(0, 0, W, H);
  const s = { ...palette, wind: state.wind * (1 + .4 * Math.sin(t * .21)), speed: 1 / Math.max(.6, state.tempo) };
  for (const { kind, list } of systems) {
    const def = KINDS[kind];
    if (dt) for (const p of list) { def.step?.(p, dt, W, H, s, t); if (p.ix || p.iy) { p.x += p.ix * dt; p.y += p.iy * dt; const damp = Math.pow(.04, dt); p.ix *= damp; p.iy *= damp; if (Math.abs(p.ix) + Math.abs(p.iy) < 1) p.ix = p.iy = 0; } }
    if (def.batch) { def.batch(bc, list.filter(p => !p.front), s, false); def.batch(fc, list.filter(p => p.front), s, true); }
    else for (const p of list) def.draw(p.front ? fc : bc, p, s, p.front, H, t);
  }
  if (state.weather === 'stars' && palette.dark) shootingStar(dt);
  if (bursts.length) drawBursts(dt);
  bc.globalAlpha = fc.globalAlpha = 1;
}

function shootingStar(dt) {
  nextShoot -= dt;
  if (!shooting && nextShoot <= 0) { shooting = { x: W * (.2 + R() * .7), y: H * R() * .35, vx: -(380 + R() * 260), vy: 200 + R() * 120, life: 0 }; nextShoot = 5 + R() * 9; }
  if (!shooting) return;
  const s = shooting; s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt;
  const a = Math.sin(Math.PI * Math.min(1, s.life / .9)), g = bc.createLinearGradient(s.x, s.y, s.x - s.vx * .18, s.y - s.vy * .18);
  g.addColorStop(0, alpha('#ffffff', .9 * a)); g.addColorStop(1, alpha('#ffffff', 0));
  bc.strokeStyle = g; bc.lineWidth = 1.4; bc.globalAlpha = 1; bc.beginPath(); bc.moveTo(s.x, s.y); bc.lineTo(s.x - s.vx * .18, s.y - s.vy * .18); bc.stroke();
  if (s.life > .9) shooting = null;
}

function drawBursts(dt) {
  for (const b of bursts) {
    b.life += dt; b.vy += 420 * dt; b.vx *= Math.pow(.5, dt); b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt;
    const k = 1 - b.life / b.ttl;
    fc.globalAlpha = Math.max(0, Math.min(1, k * 1.6)); fc.fillStyle = b.col; fc.strokeStyle = b.col;
    shape(fc, b.glyph, b.x, b.y, b.size * (.6 + .4 * Math.min(1, b.life * 6)), b.rot);
  }
  bursts = bursts.filter(b => b.life < b.ttl);
}

function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000 || 0); last = now; t += dt;
  if (!document.hidden) draw(dt);
  raf = systems.length || bursts.length ? requestAnimationFrame(loop) : 0;
  if (!raf) { bc.clearRect(0, 0, W, H); fc.clearRect(0, 0, W, H); }
}
function wake() { if (!raf && !reduced && bc) { last = performance.now(); raf = requestAnimationFrame(loop); } else if (reduced && bc) draw(0); }

function applyLight() {
  const light = state.light === 'auto' ? clockLight() : state.light;
  if (stageEl) stageEl.dataset.light = light;
  document.documentElement.dataset.light = light;
}

export const sky = {
  /** @param {HTMLElement} stage */
  mount(stage) {
    stageEl = stage; back = stage.querySelector('.sky--back'); front = stage.querySelector('.sky--front');
    bc = back.getContext('2d'); fc = front.getContext('2d');
    new ResizeObserver(resize).observe(stage);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
    clearInterval(lightTimer); lightTimer = setInterval(applyLight, 5 * 60 * 1000);
  },
  setRoom(room) { palette = colours(room); build(false); },
  /** @param {{ weather?: string, light?: string, intensity?: number, wind?: number, tempo?: number }} o */
  set(o) {
    const rebuild = (o.weather && o.weather !== state.weather) || (o.intensity != null && Math.abs(o.intensity - state.intensity) > .04);
    Object.assign(state, Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)));
    applyLight();
    if (rebuild) build(true);
  },
  get state() { return { ...state }; },
  /** A handful of the room's motifs thrown up from a point (client coordinates). */
  burst(x, y, { n = 14, glyph = null, spread = 1 } = {}) {
    if (reduced || !stageEl) return;
    const r = stageEl.getBoundingClientRect(), ox = x - r.left, oy = y - r.top;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (R() - .5) * Math.PI * 1.3 * spread, v = 180 + R() * 260;
      bursts.push({ x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: R() * TAU, vr: (R() - .5) * 8, life: 0, ttl: 1.1 + R() * .7, size: 9 + R() * 8, glyph: glyph || palette.pick(palette.motifs), col: palette.pick(palette.burstCols) });
    }
    wake();
  },
  /** Pushes the weather away from a touch. */
  poke(x, y) {
    if (reduced || !stageEl) return;
    const r = stageEl.getBoundingClientRect(), ox = x - r.left, oy = y - r.top;
    for (const { list } of systems) for (const p of list) {
      const dx = p.x - ox, dy = p.y - oy, d = Math.hypot(dx, dy);
      if (d < 120 && d > 0) { const f = (1 - d / 120) * 340; p.ix = (p.ix || 0) + dx / d * f; p.iy = (p.iy || 0) + dy / d * f; }
    }
  },
};
