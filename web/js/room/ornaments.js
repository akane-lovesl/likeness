/**
 * The ornament library: one set of shapes for the page (inline SVG) and for the sky (Path2D), on a 24 × 24 grid.
 * f is filled; s is stroked. Rooms pick from these by name, so a room the studio invents can use them too.
 */
const f2 = n => n.toFixed(2);
/** A wobbly disc: wax seals, blots. */
function blob(cx, cy, r, lobes, amp, seed = 0) {
  let d = '';
  for (let i = 0, n = lobes * 10; i <= n; i++) {
    const a = i / n * Math.PI * 2, rr = r * (1 + amp * Math.sin(a * lobes + seed) + amp * .4 * Math.sin(a * (lobes + 3) + seed * 2));
    d += (i ? 'L' : 'M') + f2(cx + rr * Math.cos(a)) + ' ' + f2(cy + rr * Math.sin(a));
  }
  return d + 'Z';
}
/** n elliptical petals around the centre. */
function flower(n, len, width, inner = 0) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 - Math.PI / 2, cx = 12 + Math.cos(a) * (inner + len / 2), cy = 12 + Math.sin(a) * (inner + len / 2);
    const x1 = cx - Math.cos(a) * len / 2, y1 = cy - Math.sin(a) * len / 2, x2 = cx + Math.cos(a) * len / 2, y2 = cy + Math.sin(a) * len / 2, rot = a * 180 / Math.PI;
    d += `M${f2(x1)} ${f2(y1)}A${f2(len / 2)} ${f2(width)} ${f2(rot)} 1 0 ${f2(x2)} ${f2(y2)}A${f2(len / 2)} ${f2(width)} ${f2(rot)} 1 0 ${f2(x1)} ${f2(y1)}Z`;
  }
  return d;
}
const circle = (cx, cy, r) => `M${cx + r} ${cy}a${r} ${r} 0 1 1 -${r * 2} 0 ${r} ${r} 0 1 1 ${r * 2} 0z`;

/** @type {Record<string, { f?: string, s?: string }>} */
export const ORN = {
  heart: { f: 'M12 20.6C6.4 16.7 2.8 13.4 2.8 9.2 2.8 6.5 4.9 4.4 7.6 4.4c1.8 0 3.4 1 4.4 2.5 1-1.5 2.6-2.5 4.4-2.5 2.7 0 4.8 2.1 4.8 4.8 0 4.2-3.6 7.5-9.2 11.4z' },
  note: { f: 'M10.4 17.2c0 1.4-1.4 2.6-3.1 2.6S4.4 19 4.4 17.7s1.4-2.6 3.1-2.6c.5 0 1 .1 1.4.3V3.5h1.5c.3 2.3 1.6 3.4 3.2 4.6 1.7 1.3 3 3 2.5 5.7-.5-1.9-1.6-3-3.1-3.8-.7-.4-1.4-.6-2.1-.7v7.9z' },
  notes: { f: 'M8.4 17.2c0 1.4-1.4 2.6-3.1 2.6S2.4 19 2.4 17.7s1.4-2.6 3.1-2.6c.5 0 1 .1 1.4.3V5.9L19.6 3v12.4c0 1.4-1.4 2.6-3.1 2.6s-2.9-.8-2.9-2.1 1.4-2.6 3.1-2.6c.5 0 1 .1 1.4.3V7.4L8.4 9.6v7.6z' },
  bow: { f: 'M12 10.6C9.7 7.5 6.5 5.7 4.4 6.5 2.6 7.2 2.5 10.5 4 12.4c1.6 2 4.9 1.6 8-1.8zM12 10.6c2.3-3.1 5.5-4.9 7.6-4.1 1.8.7 1.9 4 .4 5.9-1.6 2-4.9 1.6-8-1.8zM10.9 11.6l-4.3 8.3 2.5-.5 1.3 2.1 2-9.1zM13.1 11.6l4.3 8.3-2.5-.5-1.3 2.1-2-9.1zM13.9 11a1.9 1.9 0 1 1-3.8 0 1.9 1.9 0 0 1 3.8 0z' },
  seal: { f: blob(12, 12, 9.4, 9, .045, 1.3), s: circle(12, 12, 6.2) },
  rose: { f: 'M12 3.6c4.6 0 8 3.2 8 7.4 0 4.5-3.5 8-8 8s-8-3.5-8-8c0-4.2 3.4-7.4 8-7.4zM6.6 20.8c-2.4.3-4.1-.7-4.6-2.4 1.9-.6 3.6-.3 4.6 2.4zM17.4 20.8c2.4.3 4.1-.7 4.6-2.4-1.9-.6-3.6-.3-4.6 2.4z', s: 'M12 7.4c2.4 0 4 1.7 4 3.8 0 2.4-1.8 4-4 4-1.9 0-3.3-1.4-3.3-3.1 0-1.6 1.2-2.8 2.7-2.8 1.4 0 2.3.9 2.3 2.1 0 1.1-.8 1.8-1.8 1.8' },
  teacup: { f: 'M3.5 9.5h13v3c0 3.9-2.9 6.6-6.5 6.6s-6.5-2.7-6.5-6.6v-3zM1.8 19.6h16.4c-.6 1.1-1.8 1.7-3.2 1.7H5c-1.4 0-2.6-.6-3.2-1.7z', s: 'M16.4 11.2h1.4c1.4 0 2.4 1 2.4 2.3s-1 2.3-2.4 2.3h-1.9M8 3.2c-1 1.1 1 2.1 0 3.4M11.6 3.2c-1 1.1 1 2.1 0 3.4' },
  star: { f: 'M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.9l-5.8 3.2 1.4-6.4-4.9-4.4 6.5-.7z' },
  sparkle: { f: 'M12 2.5c.6 5.3 2.9 8.6 9.5 9.5-6.6.9-8.9 4.2-9.5 9.5-.6-5.3-2.9-8.6-9.5-9.5 6.6-.9 8.9-4.2 9.5-9.5z' },
  asterisk: { s: 'M12 4v16M5.1 8l13.8 8M5.1 16l13.8-8' },
  leaf: { f: 'M4.5 19.5C4.5 10.6 10.2 4.5 19.5 4.5c0 9.3-6 15-15 15z', s: 'M4.5 19.5L14.5 9.5' },
  petal: { f: 'M12 2.5c3.9 2.9 5.6 7.3 3.7 11.6-1 2.2-2.6 4.3-3.7 6.4-1.1-2.1-2.7-4.2-3.7-6.4C6.4 9.8 8.1 5.4 12 2.5z' },
  flower: { f: flower(5, 8.2, 3.4, 1.4) + circle(12, 12, 1.8) },
  wave: { s: 'M2 10.5c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3M2 16.5c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3' },
  moon: { f: 'M19.8 14.6A8.6 8.6 0 1 1 9.4 4.2a6.7 6.7 0 0 0 10.4 10.4z' },
  sun: { f: circle(12, 12, 4.4), s: 'M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8' },
  snowflake: { s: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.6 4.6L12 7l2.4-2.4M9.6 19.4L12 17l2.4 2.4' },
  bolt: { f: 'M13.2 2.5L4.6 13.6h6.2l-1 7.9 8.6-11.1h-6.2z' },
  crown: { f: 'M3.5 17.5L2.4 7.8l5.2 3.9L12 4.6l4.4 7.1 5.2-3.9-1.1 9.7zM4 18.8h16v2.2H4z' },
  shell: { f: 'M12 3.5c-4.9 0-8.9 3.6-8.9 8 0 2.4 1.1 4.6 2.9 6.1l1.5 2.4h9l1.5-2.4c1.8-1.5 2.9-3.7 2.9-6.1 0-4.4-4-8-8.9-8z', s: 'M12 19.6V6M9.4 19.6L7.8 7.2M14.6 19.6l1.6-12.4' },
  cloud: { f: 'M7.2 18.6h10.4a4.1 4.1 0 0 0 .5-8.2 5.6 5.6 0 0 0-10.8-1.3 4.8 4.8 0 0 0-.1 9.5z' },
  drop: { f: 'M12 2.8s6.3 6.9 6.3 11.6a6.3 6.3 0 0 1-12.6 0C5.7 9.7 12 2.8 12 2.8z' },
  gem: { f: 'M7 3.8h10l4.2 5.4L12 20.8 2.8 9.2z' },
  planet: { f: circle(12, 12, 5), s: 'M3.6 16.4c-1.2-2 2.6-5.3 8.3-7.4 4.2-1.5 7.9-1.8 9.2-.8' },
  flame: { f: 'M12 21.5c-3.6 0-6-2.5-6-5.8 0-3.9 3.4-5.6 3.9-9.7 2.4 1.5 3.4 3.8 3.4 5.5.8-.6 1.4-1.6 1.6-2.7 1.9 1.6 3.1 4 3.1 6.6 0 3.5-2.5 6.1-6 6.1z' },
  bubble: { s: circle(12, 12, 8), f: circle(8.6, 8.6, 1.4) },
  confetti: { f: 'M4 6.2l3-1 1 3-3 1zM15 4l3 .5-.5 3-3-.5zM9 14l3-1.2 1.2 3-3 1.2zM17.6 13l2.6 1.4-1.4 2.6-2.6-1.4z' },
  key: { s: 'M14.5 9.5a4 4 0 1 0-1.2 2.9L20 19M17 16l2-2M15 14l1.5-1.5' },
  feather: { f: 'M20 3.5C12 4 6.5 9 5.5 17.5L4 20.5l1.6-.8c.6-1.6 1.6-2.9 2.9-3.7h4.2l-1.8-1.4 4.3-.6-2.3-1.5 4.8-1.2C19.4 9 20 6.3 20 3.5z' },
  ink: { f: blob(12, 12, 7.5, 7, .14, 2.1) + circle(20.2, 6, 1.3) + circle(4.4, 18.8, 1) },
};

/** Inline SVG for an ornament. */
export function glyph(name, cls = '') {
  const o = ORN[name] || ORN.sparkle;
  return `<svg class="orn ${cls}" viewBox="0 0 24 24" aria-hidden="true">${o.f ? `<path d="${o.f}"/>` : ''}${o.s ? `<path class="s" d="${o.s}"/>` : ''}</svg>`;
}

/** A wax seal: the blob in one colour, a pressed ring and the room's ornament in relief. */
export function seal(inner = 'heart') {
  const o = ORN[inner] || ORN.heart;
  return `<svg class="seal" viewBox="0 0 24 24" aria-hidden="true"><path class="seal__wax" d="${ORN.seal.f}"/><path class="seal__ring" d="${ORN.seal.s}"/><g transform="translate(12 12) scale(.42) translate(-12 -12)">${o.f ? `<path class="seal__mark" d="${o.f}"/>` : ''}${o.s ? `<path class="seal__mark-s" d="${o.s}"/>` : ''}</g></svg>`;
}

const cache = new Map();
/** Path2D pair for the sky's canvas. */
export function path2d(name) {
  if (!cache.has(name)) { const o = ORN[name] || ORN.sparkle; cache.set(name, { f: o.f ? new Path2D(o.f) : null, s: o.s ? new Path2D(o.s) : null }); }
  return cache.get(name);
}
