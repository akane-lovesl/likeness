/**
 * A picture that lives a little while it is looked at. As the device paints a scene it leaves hints of what in it could
 * move (stars, water, rain, a lighthouse's lamp, steam off a cup, a mirror ball) and of what stands in front; here they
 * play on a layer over the picture, behind whoever is standing in it. The picture itself is never changed, and saved it
 * is as still as it was. On the moon and out in space the stars hold still: there is no air there to make them twinkle.
 */
import { reduced } from '../core/motion.js';

/**
 * @typedef {{ hints: any[], front: HTMLCanvasElement | null, bare?: HTMLCanvasElement | null, cut?: HTMLCanvasElement | null,
 *   person?: HTMLCanvasElement | null, picture?: CanvasImageSource | null, depth?: Depth | null }} Life
 * front: what stands in front of the place (painted things, and whoever is in it), a small mask; person: just them. For
 * what moves whole: cut, where each such thing is in the picture; bare, the place without them; picture, the picture.
 */
/**
 * A picture in planes, to be looked into: each plane the picture as it is at one depth and nothing nearer (z 0 the sky,
 * 1 the land or the room, 2 what stands in it, 3 whoever was put there), each whole behind what stands in front of it, so
 * nothing is missing when they slide apart; top, what stays put over all of it (the stamp, an arch's frame).
 * @typedef {{ planes: { c: HTMLCanvasElement, z: number }[], top?: HTMLCanvasElement | null }} Depth
 */
/** @typedef {{ draw: (x: CanvasRenderingContext2D, t: number) => void, front?: boolean, win?: boolean, pane?: any, clip?: number[] | null }} Effect */

const TAU = Math.PI * 2;
/** A small seeded stream of numbers in [0, 1). @param {number} s */
function rng(s) {
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A sine's top, sharpened: most of the time nothing, now and then a glint. @param {number} v @param {number} p */
const peak = (v, p) => Math.pow(Math.max(0, Math.sin(v)), p);
const ease = (/** @type {number} */ t) => t * t * (3 - 2 * t);
const clamp = (/** @type {number} */ v) => Math.max(0, Math.min(1, v));
/** A colour from '#rrggbb', at an opacity. @param {string} c @param {number} a */
function rgba(c, a) {
  const n = parseInt(String(c).replace('#', '').slice(0, 6), 16);
  return Number.isNaN(n) ? `rgb(255 255 255 / ${a.toFixed(3)})` : `rgb(${n >> 16 & 255} ${n >> 8 & 255} ${n & 255} / ${clamp(a).toFixed(3)})`;
}
/** In front of whoever stands in the picture: weather, light thrown about, dust in a sunbeam. Everything else is behind. */
const FRONT = new Set(['rain', 'snow', 'petals', 'fireflies', 'motes', 'specks', 'sparkle', 'confetti']);

/**
 * One hint, made ready to play in a picture W × H: what it draws at a time t (in seconds). Sizes are for a picture 360
 * wide, scaled by S; a hint from a picture that is only part of this one (a frame on a contact sheet) says how much of
 * it its own picture is (s across, sy down), and is sized for that.
 * @param {any} o @param {number} W0 @param {number} H0 @param {number} seed @returns {Effect | null}
 */
function effect(o, W0, H0, seed) {
  const W = W0, H = H0, VW = W0 * (o.s || 1), VH = H0 * (o.sy || 1), S = VW / 360, r = rng(seed), box = () => [o.box[0] * W, o.box[1] * H, o.box[2] * W, o.box[3] * H];
  switch (o.k) {
    case 'stars': {
      // a few stars, each brightening now and then into a little cross of light
      const [bx, by, bw, bh] = box(), s = Array.from({ length: o.n || 24 }, () => ({ x: bx + r() * bw, y: by + Math.pow(r(), 1.3) * bh, p: 2.4 + r() * 4, f: r() * TAU, z: (.7 + r() * .9) * S }))
        .filter(q => (!o.avoid || Math.hypot(q.x - o.avoid[0] * W, q.y - o.avoid[1] * H) > o.avoid[2] * W)
          && !(o.holes || []).some((/** @type {number[]} */ h) => q.x >= h[0] * W && q.x <= (h[0] + h[2]) * W && q.y >= h[1] * H && q.y <= (h[1] + h[3]) * H));
      return { draw(x, t) {
        x.fillStyle = '#fff';
        for (const q of s) {
          const a = peak(t * TAU / q.p + q.f, 5); if (a < .02) continue;
          x.globalAlpha = a * .95; x.beginPath(); x.arc(q.x, q.y, q.z * (.7 + a * .5), 0, TAU); x.fill();
          if (a > .55) { x.globalAlpha = (a - .55) * 1.6; const l = q.z * 5 * a; x.fillRect(q.x - l, q.y - .35 * S, l * 2, .7 * S); x.fillRect(q.x - .35 * S, q.y - l, .7 * S, l * 2); }
        }
        x.globalAlpha = 1;
      } };
    }
    case 'meteor': {
      // a shooting star, every ten seconds or so, somewhere new each time
      const [bx, by, bw, bh] = box(), every = 9 + r() * 6, off = r() * every;
      return { draw(x, t) {
        const k = Math.floor((t + off) / every), p = ((t + off) % every) / .9; if (p > 1) return;
        const q = rng(seed * 31 + k), sx = bx + bw * (.15 + q() * .7), sy = by + bh * q() * .5, dir = q() < .5 ? -1 : 1, ang = .35 + q() * .3, len = bw * (.22 + q() * .12);
        const hx = sx + Math.cos(ang) * dir * len * ease(p), hy = sy + Math.sin(ang) * len * ease(p), tl = len * .45 * Math.sin(Math.PI * Math.min(1, p * 1.2));
        const tx = hx - Math.cos(ang) * dir * tl, ty = hy - Math.sin(ang) * tl, g = x.createLinearGradient(tx, ty, hx, hy);
        g.addColorStop(0, 'rgb(255 255 255 / 0)'); g.addColorStop(1, `rgb(255 255 255 / ${(.9 * Math.sin(Math.PI * p)).toFixed(3)})`);
        x.strokeStyle = g; x.lineWidth = 1.3 * S; x.lineCap = 'round'; x.beginPath(); x.moveTo(tx, ty); x.lineTo(hx, hy); x.stroke(); x.lineCap = 'butt';
      } };
    }
    case 'glide': {
      // something in orbit going over: a steady point crossing the black, taking its time
      const [bx, by, bw, bh] = box(), every = 30, cross = 20, off = r() * every;
      return { draw(x, t) {
        const k = Math.floor((t + off) / every), p = ((t + off) % every) / cross; if (p > 1) return;
        const q = rng(seed * 17 + k), y0 = by + bh * (.1 + q() * .6), y1 = by + bh * (.1 + q() * .6), ltr = q() < .5, a = Math.min(1, p * 8, (1 - p) * 8) * .85;
        x.fillStyle = `rgb(255 255 255 / ${a.toFixed(3)})`; x.beginPath(); x.arc(bx + bw * (ltr ? p : 1 - p), y0 + (y1 - y0) * p, .9 * S, 0, TAU); x.fill();
      } };
    }
    case 'earth': {
      // the Earth turning: its weather drifting across, lit on the side the sun is on
      const cx = o.at[0] * W, cy = o.at[1] * H, R = o.r * W, sx = o.sun[0] * W - cx, sy = o.sun[1] * H - cy, sl = Math.hypot(sx, sy) || 1;
      const bands = Array.from({ length: 6 }, () => ({ y: (r() - .5) * 1.6, w: .25 + r() * .35, h: .04 + r() * .05, o: r(), v: .7 + r() * .6, tilt: (r() - .5) * .5 }));
      return { draw(x, t) {
        x.save(); x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.clip();
        for (const b of bands) {
          const u = ((b.o + t * b.v / 50) % 1) * 2.6 - 1.3, px = cx + u * R, py = cy + b.y * R, lit = clamp(.45 + ((px - cx) * sx + (py - cy) * sy) / sl / R * 1.2);
          x.fillStyle = `rgb(255 255 255 / ${(.45 * lit * lit).toFixed(3)})`; x.beginPath(); x.ellipse(px, py, b.w * R, b.h * R, b.tilt, 0, TAU); x.fill();
        }
        x.restore();
      } };
    }
    case 'aurora': {
      // the curtains rippling: one band of light, drawn in slices that sway, breathing brighter and dimmer
      const [bx, by, bw, bh] = box(), tall = bh * .55, tex = document.createElement('canvas'); tex.width = Math.max(1, Math.round(bw)); tex.height = Math.max(1, Math.round(tall));
      const tx = /** @type {CanvasRenderingContext2D} */ (tex.getContext('2d')), g = tx.createLinearGradient(0, 0, 0, tall);
      g.addColorStop(0, rgba(o.c[1], 0)); g.addColorStop(.6, rgba(o.c[1], .12)); g.addColorStop(1, rgba(o.c[0], .34)); tx.fillStyle = g; tx.fillRect(0, 0, tex.width, tex.height);
      const step = Math.max(3, Math.round(6 * S));
      return { draw(x, t) {
        x.save(); x.globalCompositeOperation = 'lighter';
        for (let px = 0; px < tex.width; px += step) {
          const u = px / bw, y = by + bh * .62 - tall + Math.sin(u * 5 + t * .35) * bh * .08 + Math.sin(u * 13 - t * .6) * bh * .025;
          x.globalAlpha = .35 + .3 * (.5 + .5 * Math.sin(t * .5 + u * 4)); x.drawImage(tex, px, 0, step, tex.height, bx + px, y, step, tall);
        }
        x.restore();
      } };
    }
    case 'birds': {
      // now and then a few birds cross, far off, wings going
      const [bx, by, bw, bh] = box(), every = 22, cross = 14, off = r() * every, ink = o.dusk ? 'rgb(34 22 34 / .78)' : 'rgb(40 44 56 / .62)';
      return { draw(x, t) {
        const k = Math.floor((t + off) / every), p = ((t + off) % every) / cross; if (p > 1) return;
        const q = rng(seed * 13 + k), n = 2 + Math.floor(q() * 3), ltr = q() < .5, y0 = by + bh * (.15 + q() * .6), rise = (q() - .5) * bh * .3, size = (4 + q() * 3) * S;
        x.strokeStyle = ink; x.lineWidth = 1.1 * S; x.lineCap = 'round'; x.lineJoin = 'round';
        for (let i = 0; i < n; i++) {
          const pi = p - i * .035, px = bx - bw * .1 + bw * 1.2 * (ltr ? pi : 1 - pi), py = y0 + rise * pi + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * size * 1.1 + Math.sin(t * 2 + i) * size * .3;
          const s = size * (1 - i * .08), up = s * (.15 + .45 * Math.sin(t * 8 + i * 1.7));
          x.beginPath(); x.moveTo(px - s, py - up); x.quadraticCurveTo(px - s * .4, py - up * .2 - s * .15, px, py); x.quadraticCurveTo(px + s * .4, py - up * .2 - s * .15, px + s, py - up); x.stroke();
        }
        x.lineCap = 'butt'; x.lineJoin = 'miter';
      } };
    }
    case 'windows': {
      // a town at night: a light comes on here, another goes off there
      const ws = o.rects.map((/** @type {any[]} */ q) => ({ x: q[0] * W, y: q[1] * H, w: Math.max(1, q[2] * W), h: Math.max(1, q[3] * H), c: q[4], p: 7 + r() * 16, d: .25 + r() * .4, f: r() }));
      return { draw(x, t) {
        for (const q of ws) {
          const ph = (t / q.p + q.f) % 1; if (ph >= q.d) continue;
          x.globalAlpha = clamp(Math.min(ph, q.d - ph) * q.p / .5); x.fillStyle = q.c; x.fillRect(q.x, q.y, q.w, q.h);
        }
        x.globalAlpha = 1;
      } };
    }
    case 'neon': {
      // a sign humming, and now and then the stutter a tube gives
      const [bx, by, bw, bh] = box(), cx = bx + bw / 2, cy = by + bh / 2, R = Math.max(bw, bh) * .9, every = 6 + r() * 7, off = r() * every;
      return { draw(x, t) {
        const ph = (t + off) % every, a = ph < .5 ? (Math.floor(ph * 22) % 3 === 0 ? .02 : .36) : .17 + .05 * Math.sin(t * 23 + off) * Math.sin(t * 7.1);
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, rgba(o.c, a)); g.addColorStop(1, rgba(o.c, 0));
        x.save(); x.globalCompositeOperation = 'lighter'; x.fillStyle = g; x.fillRect(cx - R, cy - R, R * 2, R * 2); x.restore();
      } };
    }
    case 'water': {
      // light glinting on the water, thickest on the path under the sun or the moon
      const [bx, by, bw, bh] = box(), path = o.path ? { x: o.path[0] * W, r: o.path[1] * W } : null, n = 44, warm = o.night ? '244 240 220' : '255 236 180';
      const gl = Array.from({ length: n }, (_, i) => {
        const d = Math.pow(r(), 1.5), on = !!path && i < n * .55;
        return { x: on && path ? path.x + (r() - .5) * path.r * (1.2 + d * 2.4) : bx + r() * bw, y: by + d * bh, l: (3 + r() * 10) * S * (.5 + d * 1.4), p: 1.6 + r() * 2.6, f: r() * TAU, on, dx: (r() - .5) * 6 * S };
      });
      return { draw(x, t) {
        for (const q of gl) {
          const a = peak(t * TAU / q.p + q.f, 3); if (a < .03) continue;
          x.fillStyle = `rgb(${q.on ? warm : '255 255 255'} / ${(a * (q.on ? .85 : .45)).toFixed(3)})`;
          x.fillRect(q.x + Math.sin(t * .7 + q.f) * q.dx - q.l / 2, q.y, q.l, Math.max(1, 1.1 * S));
        }
      } };
    }
    case 'lamp': {
      // the light going round: dim, then full in your face, then dim
      const cx = o.at[0] * W, cy = o.at[1] * H, per = 5.5;
      return { draw(x, t) {
        const v = Math.cos(t * TAU / per), i = Math.pow(Math.max(0, v), 10), dim = .16 + .1 * Math.max(0, v), R = VW * (.035 + .13 * i);
        x.save(); x.globalCompositeOperation = 'lighter';
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, `rgb(255 244 200 / ${clamp(dim + i * .7).toFixed(3)})`); g.addColorStop(1, 'rgb(255 236 170 / 0)');
        x.fillStyle = g; x.fillRect(cx - R, cy - R, R * 2, R * 2);
        if (i > .02) {
          const L = VW * .3 * i, s = x.createLinearGradient(cx - L, cy, cx + L, cy); s.addColorStop(0, 'rgb(255 240 190 / 0)'); s.addColorStop(.5, `rgb(255 244 210 / ${(i * .55).toFixed(3)})`); s.addColorStop(1, 'rgb(255 240 190 / 0)');
          x.fillStyle = s; x.fillRect(cx - L, cy - VW * .006, L * 2, VW * .012);
        }
        x.restore();
      } };
    }
    case 'under': {
      // under the water: the light swaying down in shafts, bubbles going up
      const [bx, by, bw, bh] = box(), bub = Array.from({ length: 16 }, () => ({ x: bx + r() * bw, p: 5 + r() * 5, f: r(), z: (1.2 + Math.pow(r(), 2) * 4) * S, w: r() * TAU }));
      const shafts = Array.from({ length: 3 }, () => ({ x: bx + r() * bw * .9, sp: bw * (.05 + r() * .06), lean: bw * (.1 + r() * .15), f: r() * TAU }));
      return { draw(x, t) {
        x.save(); x.globalCompositeOperation = 'lighter';
        for (const s of shafts) {
          const a = .04 + .04 * Math.sin(t * .5 + s.f), sw = Math.sin(t * .3 + s.f) * bw * .03, g = x.createLinearGradient(0, by, 0, by + bh * .85);
          g.addColorStop(0, `rgb(230 251 255 / ${a.toFixed(3)})`); g.addColorStop(1, 'rgb(230 251 255 / 0)'); x.fillStyle = g;
          x.beginPath(); x.moveTo(s.x, by); x.lineTo(s.x + s.sp, by); x.lineTo(s.x + s.sp * 3 + s.lean + sw, by + bh * .85); x.lineTo(s.x + s.lean + sw, by + bh * .85); x.fill();
        }
        x.restore(); x.lineWidth = Math.max(1, .9 * S);
        for (const b of bub) {
          const p = (t / b.p + b.f) % 1, a = Math.min(1, p * 6, (1 - p) * 4) * .55;
          x.strokeStyle = `rgb(255 255 255 / ${a.toFixed(3)})`; x.beginPath(); x.arc(b.x + Math.sin(t * 2.2 + b.w) * 3 * S, by + bh * (1 - p), b.z * (.8 + p * .4), 0, TAU); x.stroke();
        }
      } };
    }
    case 'fireflies': {
      const [bx, by, bw, bh] = box(), fl = Array.from({ length: 14 }, () => ({ cx: bx + r() * bw, cy: by + r() * bh, ax: (8 + r() * 22) * S, ay: (4 + r() * 12) * S, fx: .15 + r() * .3, fy: .2 + r() * .35, fb: .6 + r() * 1.1, f: r() * TAU }));
      return { draw(x, t) {
        x.save(); x.globalCompositeOperation = 'lighter';
        for (const q of fl) {
          const a = peak(t * q.fb + q.f, 2); if (a < .03) continue;
          const px = q.cx + Math.sin(t * q.fx + q.f) * q.ax, py = q.cy + Math.sin(t * q.fy + q.f * 2) * q.ay, R = 7 * S, g = x.createRadialGradient(px, py, 0, px, py, R);
          g.addColorStop(0, `rgb(236 255 150 / ${(a * .95).toFixed(3)})`); g.addColorStop(.25, `rgb(200 255 110 / ${(a * .35).toFixed(3)})`); g.addColorStop(1, 'rgb(200 255 110 / 0)');
          x.fillStyle = g; x.fillRect(px - R, py - R, R * 2, R * 2);
        }
        x.restore();
      } };
    }
    case 'rain': {
      // rain falling; on a window, drops running down the glass as well
      const [bx, by, bw, bh] = box(), col = o.night ? '220 230 255' : '70 82 108';
      const st = Array.from({ length: Math.round(70 * Math.max(.4, o.box[2] * o.box[3])) + 10 }, () => ({ x: r(), y: r(), v: .9 + r() * .6, l: (10 + r() * 14) * S, a: .2 + r() * .25 }));
      const drops = o.win ? Array.from({ length: 7 }, () => ({ x: bx + r() * bw, y: r(), v: .04 + r() * .07, z: (1.6 + r() * 2.2) * S, f: r() * TAU })) : [];
      return { draw(x, t) {
        x.lineWidth = Math.max(1, S);
        for (const q of st) {
          const y = by + ((q.y + t * q.v * 1.6) % 1) * (bh + q.l) - q.l, px = bx + ((q.x + t * q.v * .05) % 1) * bw;
          x.strokeStyle = `rgb(${col} / ${q.a.toFixed(3)})`; x.beginPath(); x.moveTo(px, y); x.lineTo(px - q.l * .18, y + q.l); x.stroke();
        }
        for (const d of drops) {
          const y = by + ((d.y + t * d.v + .015 * Math.sin(t * 1.3 + d.f)) % 1) * bh;
          x.strokeStyle = 'rgb(255 255 255 / .12)'; x.lineWidth = d.z * .5; x.beginPath(); x.moveTo(d.x, y - d.z * 7); x.lineTo(d.x, y); x.stroke();
          x.fillStyle = 'rgb(255 255 255 / .24)'; x.beginPath(); x.arc(d.x, y, d.z, 0, TAU); x.fill();
          x.fillStyle = 'rgb(255 255 255 / .6)'; x.beginPath(); x.arc(d.x - d.z * .3, y - d.z * .3, d.z * .3, 0, TAU); x.fill();
        }
      } };
    }
    case 'snow': {
      const [bx, by, bw, bh] = box(), fl = Array.from({ length: 56 }, () => ({ x: r(), y: r(), v: 1 / (7 + r() * 6), sw: (5 + r() * 12) * S, f: r() * TAU, fs: .4 + r() * .7, z: (.8 + r() * 1.8) * S }));
      return { draw(x, t) {
        x.fillStyle = 'rgb(255 255 255 / .85)';
        for (const q of fl) { x.beginPath(); x.arc(bx + q.x * bw + Math.sin(t * q.fs + q.f) * q.sw, by + ((q.y + t * q.v) % 1) * bh, q.z, 0, TAU); x.fill(); }
      } };
    }
    case 'petals': {
      // petals, or (with a leaf's colours) maple leaves, tumbling as they come down
      const [bx, by, bw, bh] = box(), cs = o.c || ['#f6b6c8', '#fbd7e1'];
      const ps = Array.from({ length: o.leaf ? 12 : 16 }, (_, i) => ({ x: r(), y: r(), v: 1 / (8 + r() * 6), sw: (10 + r() * 16) * S, f: r() * TAU, rs: .8 + r() * 1.6, z: (o.leaf ? 5 + r() * 3 : 3.5 + r() * 3) * S, c: cs[i % cs.length] }));
      return { draw(x, t) {
        for (const q of ps) {
          x.save(); x.translate(bx + q.x * bw + Math.sin(t * .6 + q.f) * q.sw, by + ((q.y + t * q.v) % 1) * (bh + 20 * S) - 10 * S); x.rotate(t * q.rs + q.f); x.scale(Math.cos(t * q.rs * 1.3 + q.f), 1);
          x.fillStyle = q.c; x.beginPath();
          if (o.leaf) for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? q.z * .42 : q.z * (k === 0 ? 1 : k === 2 || k === 8 ? .9 : .66); x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
          else { x.moveTo(0, -q.z); x.quadraticCurveTo(q.z * .8, 0, 0, q.z); x.quadraticCurveTo(-q.z * .8, 0, 0, -q.z); }
          x.fill(); x.restore();
        }
      } };
    }
    case 'motes': {
      // dust turning in the sunlight
      const [bx, by, bw, bh] = box(), ms = Array.from({ length: 28 }, () => ({ x: bx + r() * bw, y: by + r() * bh, a1: (6 + r() * 14) * S, a2: (4 + r() * 10) * S, f1: .08 + r() * .2, f2: .1 + r() * .25, p: r() * TAU, tw: .5 + r() * 1.2, z: (.5 + r() * .9) * S }));
      return { draw(x, t) {
        x.save(); x.globalCompositeOperation = 'lighter';
        for (const q of ms) {
          x.fillStyle = `rgb(255 244 214 / ${(.12 + .5 * peak(t * q.tw + q.p, 2)).toFixed(3)})`;
          x.beginPath(); x.arc(q.x + Math.sin(t * q.f1 + q.p) * q.a1, q.y + Math.sin(t * q.f2 + q.p * 1.7) * q.a2, q.z, 0, TAU); x.fill();
        }
        x.restore();
      } };
    }
    case 'steam': {
      // three wisps off the cup, curling as they rise and thin out
      const cx = o.at[0] * W, cy = o.at[1] * H, rise = VH * .13, wide = o.r * W * .2;
      return { draw(x, t) {
        x.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const per = 3.6, p = ((t + i * per / 3) % per) / per, top = rise * (.35 + p * .65), x0 = cx + (i - 1) * wide * .5;
          x.strokeStyle = `rgb(255 255 255 / ${(Math.sin(Math.PI * p) * .32).toFixed(3)})`; x.lineWidth = (2.6 - p) * S; x.beginPath();
          for (let k = 0; k <= 12; k++) { const u = k / 12, px = x0 + Math.sin(u * 5 + t * 1.4 + i * 2) * wide * u, py = cy - u * top; if (k) x.lineTo(px, py); else x.moveTo(px, py); }
          x.stroke();
        }
        x.lineCap = 'butt';
      } };
    }
    case 'flames': {
      const pts = o.pts.map((/** @type {number[]} */ p) => [p[0] * W, p[1] * H]);
      return { draw(x, t) {
        x.save(); x.globalCompositeOperation = 'lighter';
        pts.forEach((/** @type {number[]} */ [px, py], /** @type {number} */ i) => {
          const a = .22 + .1 * Math.sin(t * 13 + i * 2.1) + .08 * Math.sin(t * 7.7 + i), R = VW * (o.z || .05) * (1 + .12 * Math.sin(t * 9 + i)), g = x.createRadialGradient(px, py, 0, px, py, R);
          g.addColorStop(0, `rgb(255 220 150 / ${a.toFixed(3)})`); g.addColorStop(1, 'rgb(255 214 140 / 0)'); x.fillStyle = g; x.fillRect(px - R, py - R, R * 2, R * 2);
        });
        x.restore();
      } };
    }
    case 'specks': {
      // the mirror ball turning: its light sliding round the room, and over whoever is in it
      const cx = o.at[0] * W, cy = o.at[1] * H, sp = Array.from({ length: 36 }, (_, i) => ({ th: r() * TAU, y: -.35 + r() * 1.4, d: .2 + r() * .75, c: o.c[i % o.c.length] }));
      return { draw(x, t) {
        x.save(); x.globalCompositeOperation = 'lighter';
        for (const q of sp) {
          const ang = q.th + t * .32, face = Math.cos(ang); if (face <= 0) continue;
          x.fillStyle = rgba(q.c, face * .42); x.beginPath(); x.ellipse(cx + Math.sin(ang) * q.d * VW * .62, cy + q.y * q.d * VH * .75, VW * .011 * (.5 + face * .5), VW * .007, 0, 0, TAU); x.fill();
        }
        x.restore();
      } };
    }
    case 'sparkle': {
      const [bx, by, bw, bh] = box(), sp = Array.from({ length: 12 }, () => ({ x: bx + r() * bw, y: by + r() * bh, p: 1.6 + r() * 2.2, f: r() * TAU, z: (3 + r() * 4) * S }));
      return { draw(x, t) {
        for (const q of sp) {
          const a = peak(t * TAU / q.p + q.f, 4); if (a < .04) continue; const l = q.z * (.4 + a * .8);
          x.fillStyle = `rgb(255 248 220 / ${(a * .95).toFixed(3)})`; x.beginPath(); x.moveTo(q.x, q.y - l);
          x.quadraticCurveTo(q.x, q.y, q.x + l, q.y); x.quadraticCurveTo(q.x, q.y, q.x, q.y + l); x.quadraticCurveTo(q.x, q.y, q.x - l, q.y); x.quadraticCurveTo(q.x, q.y, q.x, q.y - l); x.fill();
        }
      } };
    }
    case 'confetti': {
      const [bx, by, bw, bh] = box(), cols = ['#e0607e', '#ffd36e', '#5aa0e8', '#7fd1c7', '#b48cf0'];
      const cs = Array.from({ length: 26 }, (_, i) => ({ x: r(), y: r(), v: 1 / (6 + r() * 5), sw: (6 + r() * 12) * S, f: r() * TAU, rs: 1 + r() * 3, w: (2.5 + r() * 2.5) * S, c: cols[i % cols.length] }));
      return { draw(x, t) {
        for (const q of cs) {
          x.save(); x.translate(bx + q.x * bw + Math.sin(t * .9 + q.f) * q.sw, by + ((q.y + t * q.v) % 1) * (bh + 16 * S) - 8 * S); x.rotate(t * q.rs + q.f); x.scale(1, Math.cos(t * q.rs * 1.7 + q.f));
          x.fillStyle = q.c; x.fillRect(-q.w / 2, -q.w * .3, q.w, q.w * .6); x.restore();
        }
      } };
    }
    case 'glitter': {
      // the Paris tower on the hour after dark: a thousand bulbs going off at random all over it. Here a burst comes
      // soon after it is looked at, and again every so often
      const pts = o.pts.map((/** @type {number[]} */ p) => ({ x: p[0] * W, y: p[1] * H, v: 5 + r() * 9, f: r() * TAU })), every = 13, on = 6;
      return { draw(x, t) {
        const c = (t + every - 1.4) % every; if (c > on) return;
        const env = Math.min(1, c / .7, (on - c) / .9);
        x.save(); x.globalCompositeOperation = 'lighter';
        for (const q of pts) {
          const a = peak(t * q.v + q.f, 14) * env; if (a < .05) continue;
          const l = (2.2 + 3.4 * a) * S; x.fillStyle = 'rgb(255 255 248 / ' + a.toFixed(3) + ')';
          x.fillRect(q.x - l, q.y - .35 * S, l * 2, .7 * S); x.fillRect(q.x - .35 * S, q.y - l, .7 * S, l * 2);
          x.beginPath(); x.arc(q.x, q.y, 1.2 * S * a, 0, TAU); x.fill();
        }
        x.restore();
      } };
    }
    case 'beacon': {
      // the searchlight on top going round over the city: two beams swinging out and back, flaring as one faces you
      const cx = o.at[0] * W, cy = o.at[1] * H, per = 10, L = VW * 1.25;
      return { draw(x, t) {
        x.save(); x.globalCompositeOperation = 'lighter';
        for (const off of [0, Math.PI]) {
          const th = t * TAU / per + off, across = Math.sin(th), toward = Math.cos(th), len = L * Math.abs(across);
          if (len > VW * .03) {
            const ex = cx + across * L, ey = cy - VH * .03 * Math.abs(across), spread = VW * .06 * Math.abs(across), a = .16 + .14 * Math.max(0, toward);
            const g = x.createLinearGradient(cx, cy, ex, ey); g.addColorStop(0, 'rgb(255 248 220 / ' + (a * 1.6).toFixed(3) + ')'); g.addColorStop(1, 'rgb(255 248 220 / 0)');
            x.fillStyle = g; x.beginPath(); x.moveTo(cx, cy - .6 * S); x.lineTo(ex, ey - spread); x.lineTo(ex, ey + spread); x.lineTo(cx, cy + .6 * S); x.closePath(); x.fill();
          }
          const f = Math.pow(Math.max(0, toward), 12);
          if (f > .02) { const R = VW * (.02 + .07 * f), g = x.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, 'rgb(255 250 230 / ' + (.85 * f).toFixed(3) + ')'); g.addColorStop(1, 'rgb(255 250 230 / 0)'); x.fillStyle = g; x.fillRect(cx - R, cy - R, R * 2, R * 2); }
        }
        x.restore();
      } };
    }
    case 'blink': {
      // red lights on the tops of the tall things, for the planes
      const pts = o.pts.map((/** @type {number[]} */ p, /** @type {number} */ i) => ({ x: p[0] * W, y: p[1] * H, f: i * .37 + r() * .2 }));
      return { draw(x, t) {
        x.save(); x.globalCompositeOperation = 'lighter';
        for (const q of pts) {
          const ph = ((t + q.f) % 1.7) / 1.7, a = ph < .3 ? Math.sin(ph / .3 * Math.PI) : 0; if (a < .03) continue;
          const R = 5 * S, g = x.createRadialGradient(q.x, q.y, 0, q.x, q.y, R); g.addColorStop(0, 'rgb(255 70 50 / ' + (.95 * a).toFixed(3) + ')'); g.addColorStop(.3, 'rgb(255 40 30 / ' + (.4 * a).toFixed(3) + ')'); g.addColorStop(1, 'rgb(255 40 30 / 0)');
          x.fillStyle = g; x.fillRect(q.x - R, q.y - R, R * 2, R * 2);
        }
        x.restore();
      } };
    }
    case 'fog': {
      // fog coming in off the sea, banks of it drifting across, slowly
      const [bx, by, bw, bh] = box(), tex = document.createElement('canvas'); tex.width = Math.max(2, Math.round(bw)); tex.height = Math.max(2, Math.round(bh));
      const tx = /** @type {CanvasRenderingContext2D} */ (tex.getContext('2d'));
      for (let i = 0; i < 16; i++) {
        const ex = r() * bw, ey = bh * (.35 + r() * .45), rx = bw * (.08 + r() * .1), ry = bh * (.12 + r() * .14);
        for (const dx of [-bw, 0, bw]) { const g = tx.createRadialGradient(ex + dx, ey, 0, ex + dx, ey, rx); g.addColorStop(0, 'rgb(' + (o.c || '255 255 255') + ' / .5)'); g.addColorStop(1, 'rgb(' + (o.c || '255 255 255') + ' / 0)'); tx.save(); tx.translate(ex + dx, ey); tx.scale(1, ry / rx); tx.translate(-(ex + dx), -ey); tx.fillStyle = g; tx.fillRect(ex + dx - rx, ey - rx, rx * 2, rx * 2); tx.restore(); }
      }
      return { draw(x, t) {
        const off = (t * VW * .012) % tex.width; x.globalAlpha = (o.a || .5) * (.8 + .2 * Math.sin(t * .2));
        x.drawImage(tex, bx - off, by); x.drawImage(tex, bx - off + tex.width, by); x.globalAlpha = 1;
      } };
    }
    case 'dust': {
      // dust on the wind, streaming low over the ground; and now and then a dust devil wandering across the plain far off
      const [bx, by, bw, bh] = box(), gr = Array.from({ length: 70 }, () => ({ y: by + Math.pow(r(), .6) * bh, v: .04 + r() * .1, x: r(), z: (.5 + r() * 1.3) * S, a: .15 + r() * .35, w: r() * TAU }));
      const dv = o.devil ? { x: o.devil[0] * W, y: o.devil[1] * H, h: o.devil[2] * H, f: r() } : null;
      return { draw(x, t) {
        for (const q of gr) {
          const px = bx + ((q.x + t * q.v) % 1) * bw, py = q.y + Math.sin(t * 1.3 + q.w) * 2 * S;
          x.fillStyle = 'rgb(240 196 150 / ' + q.a.toFixed(3) + ')'; x.fillRect(px, py, q.z * 2.4, q.z * .7);
        }
        if (dv) {
          const drift = ((t * .006 + dv.f) % 1) - .5, cx = dv.x + drift * bw * .5;
          for (let k = 0; k < 14; k++) {
            const u = k / 13, y = dv.y - dv.h * u, wob = Math.sin(t * 3 + u * 7) * dv.h * .05 * u, rx = dv.h * (.03 + u * .13);
            x.fillStyle = 'rgb(226 170 126 / ' + (.3 * (1 - u * .6)).toFixed(3) + ')'; x.beginPath(); x.ellipse(cx + wob, y, rx, rx * .4, 0, 0, TAU); x.fill();
          }
        }
      } };
    }
    case 'rush': {
      // from a train: the country going by, the near of it faster
      const [bx, by, bw, bh] = box(), ls = Array.from({ length: 14 }, () => ({ y: by + Math.pow(r(), .8) * bh, v: .3 + r() * .4, l: bw * (.08 + r() * .2), f: r() }));
      return { draw(x, t) {
        x.lineWidth = Math.max(1, S); x.strokeStyle = 'rgb(255 255 255 / .2)';
        for (const q of ls) { const p = (q.f + t * q.v * (.5 + (q.y - by) / bh)) % 1, px = bx + bw * 1.2 * (1 - p) - bw * .2; x.beginPath(); x.moveTo(px, q.y); x.lineTo(px + q.l, q.y); x.stroke(); }
      } };
    }
    default: return null;
  }
}

/**
 * A scene's life, made ready to play over a picture W × H: what is behind whoever stands in it is drawn on a layer of its
 * own and cut away where they are; what is in front is drawn over all of it. Null when nothing in it moves.
 * @param {Life} life @param {number} W @param {number} H
 * @returns {{ draw: (x: CanvasRenderingContext2D, t: number, alpha?: number, cam?: number[]) => void } | null}
 */
export function lifeFor(life, W, H) {
  if (life?.depth?.planes?.length) return deepFor(life, W, H);
  if (!life?.hints?.length) return null;
  const win = life.hints.find(o => o.k === 'window'), arch = life.hints.find(o => o.k === 'arch');
  const effects = /** @type {Effect[]} */ ([]);
  if (!life.hints.some(o => o.k !== 'window' && o.k !== 'arch')) return null;
  life.hints.forEach((o, i) => { const e = effect(o, W, H, 101 + i * 7919); if (e) effects.push({ ...e, front: FRONT.has(o.k), win: !!o.win, pane: o.win ? o.pane || win : null, clip: o.clip || null }); });
  const back = effects.filter(e => !e.front), front = effects.filter(e => e.front), sprites = spritesOf(life, W, H);
  const layer = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return { c, x: /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')) }; };
  const B = back.length ? layer() : null, F = front.length ? layer() : null, M = sprites.length ? layer() : null;
  // the masks, scaled to the picture once rather than every frame
  const scaled = (/** @type {HTMLCanvasElement | null | undefined} */ m) => { if (!m) return null; const s = layer(); s.x.drawImage(m, 0, 0, W, H); return s.c; };
  const frontMask = B ? scaled(life.front) : null, personMask = M ? scaled(life.person) : null;
  /** Indoors, what is outside shows only through the glass: four panes, the bars between, the curtains either side. */
  const panes = (/** @type {CanvasRenderingContext2D} */ x, /** @type {any} */ pane) => {
    if (!pane) return;
    const [wx, wy, ww, wh] = [pane.box[0] * W, pane.box[1] * H, pane.box[2] * W, pane.box[3] * H], f = pane.bars[0] * W * (pane.s || 1) / 2, b = pane.bars[1] * W * (pane.s || 1) / 2;
    const l = pane.inner ? wx + ww * pane.inner[0] : wx + f, rr = pane.inner ? wx + ww * pane.inner[1] : wx + ww - f, mx = wx + ww / 2, my = wy + wh / 2, t0 = wy + f, b0 = wy + wh - f;
    x.beginPath(); x.rect(l, t0, mx - b - l, my - b - t0); x.rect(mx + b, t0, rr - mx - b, my - b - t0); x.rect(l, my + b, mx - b - l, b0 - my - b); x.rect(mx + b, my + b, rr - mx - b, b0 - my - b); x.clip();
  };
  const arched = (/** @type {CanvasRenderingContext2D} */ x) => {
    if (!arch) return;
    x.save(); if (arch.zoom) { const [z, k] = arch.zoom; x.setTransform(z, 0, 0, z, -k * W * z, -k * H * z); }
    x.beginPath(); x.moveTo(W * .1, H); x.lineTo(W * .1, H * .4); x.arc(W / 2, H * .4, W * .4, Math.PI, 0); x.lineTo(W * .9, H); x.closePath(); x.restore(); x.clip();
  };
  const play = (/** @type {CanvasRenderingContext2D} */ x, /** @type {Effect[]} */ list, /** @type {number} */ t) => {
    for (const e of list) {
      x.save();
      if (e.clip) { x.beginPath(); x.rect(e.clip[0] * W, e.clip[1] * H, e.clip[2] * W, e.clip[3] * H); x.clip(); }
      if (e.win) panes(x, e.pane);
      e.draw(x, t); x.restore();
    }
  };
  return { draw(x, t, alpha = 1) {
    if (alpha <= 0) return;
    if (M) {
      M.x.clearRect(0, 0, W, H);
      for (const s of sprites) { M.x.drawImage(s.patch, s.x, s.y); M.x.save(); s.move(M.x, t); M.x.drawImage(s.img, s.x, s.y); M.x.restore(); }
      if (personMask) { M.x.globalCompositeOperation = 'destination-out'; M.x.drawImage(personMask, 0, 0); M.x.globalCompositeOperation = 'source-over'; }
    }
    if (B) {
      B.x.clearRect(0, 0, W, H); play(B.x, back, t);
      if (frontMask) { B.x.globalCompositeOperation = 'destination-out'; B.x.drawImage(frontMask, 0, 0); B.x.globalCompositeOperation = 'source-over'; }
    }
    if (F) { F.x.clearRect(0, 0, W, H); play(F.x, front, t); }
    x.save(); arched(x); x.globalAlpha = alpha; if (M) x.drawImage(M.c, 0, 0); if (B) x.drawImage(B.c, 0, 0); if (F) x.drawImage(F.c, 0, 0); x.restore();
  } };
}

/**
 * What moves whole, cut out of the picture: a boat rocking on the water, balloons swaying on their strings, a heart
 * beating. Each is drawn over the place as it is without it (so nothing is left behind as it moves), and moved.
 * @param {Life} life @param {number} W @param {number} H
 * @returns {{ img: HTMLCanvasElement, patch: HTMLCanvasElement, x: number, y: number, move: (x: CanvasRenderingContext2D, t: number) => void }[]}
 */
function spritesOf(life, W, H) {
  const { bare, cut, picture } = life;
  if (!bare || !cut || !picture) return [];
  const S = W / 360, out = /** @type {ReturnType<typeof spritesOf>} */ ([]), kx = cut.width / W, ky = cut.height / H;
  life.hints.forEach((o, i) => {
    if (!['bob', 'sway', 'beat', 'spin'].includes(o.k)) return;
    const pad = 6 * S, x0 = Math.max(0, Math.floor(o.box[0] * W - pad)), y0 = Math.max(0, Math.floor(o.box[1] * H - pad)), x1 = Math.min(W, Math.ceil((o.box[0] + o.box[2]) * W + pad)), y1 = Math.min(H, Math.ceil((o.box[1] + o.box[3]) * H + pad));
    const cw = x1 - x0, ch = y1 - y0; if (cw < 2 || ch < 2) return;
    const make = () => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return { c, x: /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')) }; };
    const img = make(), patch = make(), grown = make(), src = /** @type {[number, number, number, number]} */ ([x0 * kx, y0 * ky, cw * kx, ch * ky]);
    img.x.drawImage(/** @type {CanvasImageSource} */ (picture), ...src, 0, 0, cw, ch); img.x.globalCompositeOperation = 'destination-in'; img.x.drawImage(cut, ...src, 0, 0, cw, ch);
    // the place without it, a little wider than the thing, so its edges never show twice
    const d = Math.max(1, Math.round(2 * S)); for (let dx = -d; dx <= d; dx += d) for (let dy = -d; dy <= d; dy += d) grown.x.drawImage(cut, ...src, dx, dy, cw, ch);
    patch.x.drawImage(bare, ...src, 0, 0, cw, ch); patch.x.globalCompositeOperation = 'destination-in'; patch.x.drawImage(grown.c, 0, 0);
    out.push({ img: img.c, patch: patch.c, x: x0, y: y0, move: moveOf(o, i, W, H) });
  });
  return out;
}
/** How a thing that moves whole moves. @param {any} o @param {number} i @param {number} W @param {number} H */
function moveOf(o, i, W, H) {
    const S = W / 360, f = i * 1.7, cx = (o.box[0] + o.box[2] / 2) * W, cy = (o.box[1] + o.box[3] / 2) * H;
    return o.k === 'bob'
      // riding the swell: up and down, and rocking a little after it
      ? (/** @type {CanvasRenderingContext2D} */ x, /** @type {number} */ t) => { const py = (o.box[1] + o.box[3] * .85) * H; x.translate(cx, py + Math.sin(t * 1.25 + f) * 2.2 * S); x.rotate(Math.sin(t * 1.25 + f - .9) * .035); x.translate(-cx, -py); }
      : o.k === 'spin'
        // a wheel, a windmill's sails: going round, from where they were painted
        ? (/** @type {CanvasRenderingContext2D} */ x, /** @type {number} */ t) => { const px = o.pivot[0] * W, py = o.pivot[1] * H; x.translate(px, py); x.rotate(t * (o.v || .2)); x.translate(-px, -py); }
      : o.k === 'sway'
        // on its string, in the air moving
        ? (/** @type {CanvasRenderingContext2D} */ x, /** @type {number} */ t) => { const px = o.pivot[0] * W, py = o.pivot[1] * H; x.translate(px, py + Math.sin(t * .7 + f) * 1.6 * S); x.rotate(Math.sin(t * .9 + f) * .055); x.translate(-px, -py); }
        // a heartbeat, twice and a rest
        : (/** @type {CanvasRenderingContext2D} */ x, /** @type {number} */ t) => { const ph = (t % 1.25) / 1.25, k = 1 + .05 * (Math.exp(-(((ph - .08) / .05) ** 2)) + .65 * Math.exp(-(((ph - .27) / .05) ** 2))); x.translate(cx, cy); x.scale(k, k); x.translate(-cx, -cy); };
}

/**
 * A picture looked into: its planes drawn each a little apart as the eye moves (the far ones least, whoever stands in
 * front most), what lives in each plane moving with it, the weather in front moving most of all, and the stamp over all
 * of it, still. cam is where the eye is, -1 to 1 across and down; at 0 it is the picture exactly.
 * @param {Life} life @param {number} W @param {number} H
 */
function deepFor(life, W, H) {
  const K = [.06, .34, .66, 1, 1.22], A = W * .024;
  const layer = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return { c, x: /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')) }; };
  const planes = (life.depth?.planes || []).map(p => { const s = layer(); s.x.drawImage(p.c, 0, 0, W, H); return { ...s, z: p.z }; });
  const top = life.depth?.top ? layer() : null; if (top && life.depth?.top) top.x.drawImage(life.depth.top, 0, 0, W, H);
  // what moves whole (a boat, balloons, the wheel by the river) lifted out of its plane, to be moved there
  const near = planes.find(p => p.z === 2), sprites = /** @type {{ img: HTMLCanvasElement, x: number, y: number, move: (x: CanvasRenderingContext2D, t: number) => void }[]} */ ([]);
  if (near && life.cut) {
    const cut = layer(); cut.x.drawImage(life.cut, 0, 0, W, H);
    life.hints.forEach((o, i) => {
      if (!['bob', 'sway', 'beat', 'spin'].includes(o.k)) return;
      const pad = 6 * W / 360, x0 = Math.max(0, Math.floor(o.box[0] * W - pad)), y0 = Math.max(0, Math.floor(o.box[1] * H - pad)), x1 = Math.min(W, Math.ceil((o.box[0] + o.box[2]) * W + pad)), y1 = Math.min(H, Math.ceil((o.box[1] + o.box[3]) * H + pad));
      if (x1 - x0 < 2 || y1 - y0 < 2) return;
      const img = document.createElement('canvas'); img.width = x1 - x0; img.height = y1 - y0; const ix = /** @type {CanvasRenderingContext2D} */ (img.getContext('2d'));
      ix.drawImage(near.c, x0, y0, img.width, img.height, 0, 0, img.width, img.height); ix.globalCompositeOperation = 'destination-in'; ix.drawImage(cut.c, x0, y0, img.width, img.height, 0, 0, img.width, img.height);
      near.x.save(); near.x.beginPath(); near.x.rect(x0, y0, img.width, img.height); near.x.clip(); near.x.globalCompositeOperation = 'destination-out'; near.x.drawImage(cut.c, 0, 0); near.x.restore();
      sprites.push({ img, x: x0, y: y0, move: moveOf(o, i, W, H) });
    });
  }
  const fx = /** @type {(Effect & { z: number })[]} */ ([]);
  life.hints.forEach((o, i) => { const e = effect(o, W, H, 101 + i * 7919); if (e) fx.push({ ...e, z: FRONT.has(o.k) && !o.win ? 4 : Math.max(0, Math.min(3, o.z ?? 1)) }); });
  const S = layer();
  return { draw(/** @type {CanvasRenderingContext2D} */ x, /** @type {number} */ t, alpha = 1, cam = [0, 0]) {
    if (alpha <= 0) return;
    const s = S.x; s.clearRect(0, 0, W, H);
    for (let z = 0; z <= 4; z++) {
      const dx = -cam[0] * A * K[z], dy = -cam[1] * A * K[z] * .55;
      for (const p of planes) if (p.z === z) slab(s, p.c, dx, dy, W, H);
      if (z === 2) for (const sp of sprites) { s.save(); s.translate(dx, dy); sp.move(s, t); s.drawImage(sp.img, sp.x, sp.y); s.restore(); }
      for (const e of fx) if (e.z === z) { s.save(); s.translate(dx, dy); e.draw(s, t); s.restore(); }
    }
    if (top) s.drawImage(top.c, 0, 0);
    x.save(); x.globalAlpha = alpha; x.drawImage(S.c, 0, 0); x.restore();
  } };
}
/** A plane drawn moved a little, the gap it leaves at the edge filled with its edge stretched. @param {CanvasRenderingContext2D} x @param {HTMLCanvasElement} c @param {number} dx @param {number} dy @param {number} W @param {number} H */
function slab(x, c, dx, dy, W, H) {
  x.drawImage(c, dx, dy);
  if (dx > .01) x.drawImage(c, 0, 0, 1, H, 0, dy, dx + .5, H); else if (dx < -.01) x.drawImage(c, W - 1, 0, 1, H, W + dx - .5, dy, -dx + .5, H);
  if (dy > .01) x.drawImage(c, 0, 0, W, 1, dx, 0, W, dy + .5); else if (dy < -.01) x.drawImage(c, 0, H - 1, W, 1, dx, H + dy - .5, W, -dy + .5);
}

/**
 * Brings a picture to life on the page: a layer laid over it (in host, before the given element), playing until stopped.
 * Nothing when motion is reduced.
 * @param {HTMLElement} host @param {Life} life @param {Element | null} [before] @param {string} [cls] the layer's class
 * @returns {{ stop: () => void } | null}
 */
export function alive(host, life, before = null, cls = 'focus__life') {
  if (reduced) return null;
  const cv = document.createElement('canvas'); cv.className = cls; cv.setAttribute('aria-hidden', 'true');
  const x = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  let play = /** @type {ReturnType<typeof lifeFor>} */ (null), raf = 0, last = -1;
  const size = () => {
    const box = host.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1), W = Math.max(1, Math.round(box.width * d)), H = Math.max(1, Math.round(box.height * d));
    if (W !== cv.width || H !== cv.height || !play) { cv.width = W; cv.height = H; play = lifeFor(life, W, H); }
  };
  size();
  if (!play) return null;
  if (life.depth?.planes?.length) cv.dataset.depth = String(life.depth.planes.length);
  host.insertBefore(cv, before);
  const ro = new ResizeObserver(size); ro.observe(host);
  const t0 = performance.now();
  // a picture in planes is looked into: the phone tilted, or the mouse over it; left alone, the eye drifts a little,
  // slowly, so it can be seen to have depth. Held still while the picture is being worked on, and at rest it is exact
  const deep = !!life.depth?.planes?.length, one = (/** @type {number} */ v) => Math.max(-1, Math.min(1, v));
  let cam = [0, 0], aim = [0, 0], touched = -1e9, tilt0 = /** @type {number[] | null} */ (null);
  const onMove = (/** @type {PointerEvent} */ e) => { if (e.pointerType !== 'mouse') return; const r = host.getBoundingClientRect(); aim = [one(((e.clientX - r.left) / r.width) * 2 - 1), one(((e.clientY - r.top) / r.height) * 2 - 1)]; touched = performance.now(); };
  const onLeave = () => { touched = -1e9; };
  const onTilt = (/** @type {DeviceOrientationEvent} */ e) => { if (e.gamma == null || e.beta == null) return; tilt0 ??= [e.gamma, e.beta]; aim = [one((e.gamma - tilt0[0]) / 14), one((e.beta - tilt0[1]) / 14)]; touched = performance.now(); };
  if (deep) { host.addEventListener('pointermove', onMove); host.addEventListener('pointerleave', onLeave); addEventListener('deviceorientation', onTilt); }
  const tick = (/** @type {number} */ now) => {
    raf = requestAnimationFrame(tick);
    if (now - last < 32) return; // thirty times a second is plenty
    last = now; x.clearRect(0, 0, cv.width, cv.height);
    const t = (now - t0) / 1000;
    if (deep) {
      if (cv.matches(CALM)) cam = [0, 0];
      else {
        const idle = now - touched > 2500, k = Math.min(1, Math.max(0, (t - 1.2) / 4));
        const goal = idle ? [Math.sin(t * TAU / 14) * .75 * k, Math.sin(t * TAU / 21 + 1.3) * .5 * k] : aim;
        cam = [cam[0] + (goal[0] - cam[0]) * .08, cam[1] + (goal[1] - cam[1]) * .08];
      }
    }
    play?.draw(x, t, 1, cam);
  };
  raf = requestAnimationFrame(tick);
  requestAnimationFrame(() => requestAnimationFrame(() => cv.classList.add('is-in')));
  return { stop() {
    cancelAnimationFrame(raf); ro.disconnect(); cv.classList.remove('is-in'); setTimeout(() => cv.remove(), 450);
    if (deep) { host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave); removeEventListener('deviceorientation', onTilt); }
  } };
}
/** While a picture is being worked on (pinned, relit, walked in, compared, filmed) its planes rest, exactly in place. */
const CALM = ".focus[data-mode='pin'] .focus__life, .focus.is-walking .focus__life, .focus.is-relighting .focus__life, .focus.is-filming .focus__life, .focus__before.is-in ~ .focus__life";
