/**
 * Places that look like themselves. Named, a famous place is painted with what makes it itself: the tower over the roofs
 * of Paris, a pagoda in the hills of Kyoto, the bridge in San Francisco's fog, three pyramids, Mars and its butterscotch
 * sky. Each is drawn into whatever the words make of the hour, the weather and the colours, and always to one side, so
 * whoever is put in front of it leaves it in view. And each has its own way of being alive while it is looked at: the
 * tower sparkling after dark with its beacon going round, fog coming in under the bridge, maple leaves coming down, the
 * wheel by the river turning, a gondola rocking, dust blowing across Mars.
 */
import { mix } from '../core/color.js';

/**
 * Where and in what light a place is painted, as the painter hands it over: the part of the picture that is outdoors
 * (ox, oy, ow, oh) and its horizon, the hour (L) and its sky, streams of numbers for the composition (q), for lit windows
 * (spark) and for what lives (lr), and where across the main landmark stands (at, on the side -1 or 1).
 * @typedef {{ x: CanvasRenderingContext2D, ox: number, oy: number, ow: number, oh: number, hz: number, w: number, h: number,
 *   L: string, sky: string[], far: string, near: string, pal: any, q: () => number, spark: () => number, lr: () => number,
 *   live: (o: any) => void, fr: (px: number, py: number, pw: number, ph: number) => number[], at: number, side: number,
 *   bare: boolean, holes: number[][], lights: any[], sunX: number, skyOnly: boolean, mark: () => void }} Brush
 */

const T = Math.PI * 2;
const clamp = (/** @type {number} */ v) => Math.max(0, Math.min(1, v));

/**
 * The places, most particular first. land: the kind of place underneath (the painter's own); own: the place paints all
 * of the land itself, rather than standing in the painter's.
 * @type {{ id: string, re: RegExp, land: string, own?: boolean }[]}
 */
const PLACES = [
  { id: 'mars', re: /\bmars\b|martian|red planet/, land: 'mars', own: true },
  { id: 'paris', re: /\bparis\b|parisian|eiffel|montmartre|\bseine\b/, land: 'city', own: true },
  { id: 'fuji', re: /\bfuji\b|fujisan/, land: 'hills', own: true },
  { id: 'kyoto', re: /kyoto|\bnara\b|pagoda|\btorii\b|\bjapan\b|japanese temple|zen garden/, land: 'hills', own: true },
  { id: 'tokyo', re: /tokyo|shibuya|shinjuku|akihabara|harajuku|ginza/, land: 'city' },
  { id: 'newyork', re: /new york|\bnyc\b|manhattan|empire state|times square/, land: 'city', own: true },
  { id: 'london', re: /london|big ben|westminster|thames/, land: 'sea' },
  { id: 'venice', re: /venice|venezia|venetian|gondola|grand canal/, land: 'sea' },
  { id: 'rome', re: /\brome\b|\broma\b|colosseum|coliseum/, land: 'city', own: true },
  { id: 'egypt', re: /egypt|pyramids?\b|giza|cairo|pharaoh|sphinx|\bnile\b/, land: 'desert', own: true },
  { id: 'santorini', re: /santorini|\boia\b|mykonos|cyclad|greek island|\bgreece\b/, land: 'sea' },
  { id: 'sanfrancisco', re: /san francisco|golden gate|\bfrisco\b/, land: 'sea' },
  { id: 'sydney', re: /sydney|opera house|harbou?r bridge/, land: 'sea' },
  { id: 'lisbon', re: /lisbon|lisboa|alfama/, land: 'sea' },
];
/** The place the words name, if the device knows how it looks. @param {string} t the words, lower case */
export const placeIn = t => PLACES.find(p => p.re.test(t)) || null;
/** Whether a place paints all of its own land. @param {string} id */
export const ownLand = id => !!PLACES.find(p => p.id === id)?.own;

/** What the reply says of a place, in this light. @param {string} id @param {string} L */
export function placeSays(id, L) {
  const dark = L === 'night' || L === 'dusk';
  return ({
    paris: L === 'night' ? 'the tower sparkling over the roofs' : 'the tower over the roofs',
    kyoto: 'a pagoda in the hills, maples turning', fuji: 'Fuji, snow on its top',
    tokyo: dark ? 'Tokyo Tower lit, the signs on' : 'Tokyo Tower over the town',
    newyork: dark ? 'Manhattan, lit up' : 'Manhattan',
    london: 'Big Ben and the wheel across the river', venice: 'the canal, the bell tower, a gondola',
    rome: L === 'night' ? 'the Colosseum, lit from inside' : 'the Colosseum and the pines',
    egypt: 'the pyramids', santorini: 'white houses and blue domes, down to the sea',
    mars: L === 'night' ? 'Mars at night, both its moons up' : L === 'day' ? 'red dunes under a butterscotch sky' : 'Mars, where the sunset is blue',
    sanfrancisco: 'the Golden Gate, fog coming in', sydney: 'the Opera House and the bridge', lisbon: 'the hills across the water, the castle on top',
  })[id] || '';
}
/** What the painter says as it lays a place down. @param {string} id @param {string} L */
export function placeNote(id, L) {
  const said = placeSays(id, L);
  return said ? said[0].toUpperCase() + said.slice(1) : '';
}

/** Something far off, in this light: its own colour by day (hazed with the distance), a shape against the sky after dark. @param {Brush} b @param {string} c */
function tone(b, c, k = .3) {
  return b.L === 'night' ? mix(mix(c, b.sky[1], .55), '#000000', .42) : b.L === 'dusk' ? mix(mix(c, b.sky[0], .5), '#000000', .25)
    : b.L === 'dawn' ? mix(c, b.sky[1], Math.min(.85, k + .18)) : mix(c, b.far, k);
}
/** How lit a landmark is: after dark fully, at dusk part way. @param {Brush} b */
const litBy = b => b.L === 'night' ? 1 : b.L === 'dusk' ? .55 : 0;

/**
 * Windows in a facade, as a grid; after dark lit here and there, and some of those going on and off while it is looked at.
 * @param {Brush} b @param {number} px @param {number} py @param {number} pw @param {number} ph @param {number} cols @param {number} rows @param {string} glass
 */
function windows(b, px, py, pw, ph, cols, rows, glass, warm = '#ffd27a', wide = .5) {
  const { x, L } = b, cw = pw / cols, rh = ph / rows, ww = Math.max(1, cw * wide), wh = Math.max(1, rh * .55), dark = L === 'night' || L === 'dusk';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const wx = px + c * cw + (cw - ww) / 2, wy = py + r * rh + (rh - wh) / 2;
    if (dark && b.spark() < (L === 'night' ? .42 : .26)) {
      x.fillStyle = b.spark() < .7 ? warm : '#ffe9bd'; x.fillRect(wx, wy, ww, wh);
      if (b.lr() < .06) b.lights.push([wx / b.w, wy / b.h, ww / b.w, wh / b.h, glass, 0]);
    } else {
      x.fillStyle = glass; x.fillRect(wx, wy, ww, wh);
      if (dark && b.lr() < .04) b.lights.push([wx / b.w, wy / b.h, ww / b.w, wh / b.h, warm, 1]);
    }
  }
}
/** A ridge across the picture: a hill line, smooth, or bumpy with trees. @param {Brush} b @param {number} base @param {number} amp @param {string} col */
function ridge(b, base, amp, col, freq = 2, phase = 0, trees = false) {
  const { x, ox, oy, ow, oh } = b;
  x.fillStyle = col; x.beginPath(); x.moveTo(ox, oy + oh);
  for (let px = 0; px <= ow; px += Math.max(2, ow / 140)) {
    const u = px / ow, bump = trees ? Math.abs(Math.sin(u * 46 + phase * 3)) * amp * .12 : 0;
    x.lineTo(ox + px, base - amp * (.55 + .3 * Math.sin(u * T * freq * .5 + phase) + .15 * Math.sin(u * T * freq * 1.3 + phase * 2)) - bump);
  }
  x.lineTo(ox + ow, oy + oh); x.closePath(); x.fill();
}
/** A shape that lights stars must keep clear of: no star in front of a tower. @param {Brush} b @param {number} px @param {number} py @param {number} pw @param {number} ph */
const hole = (b, px, py, pw, ph) => b.holes.push([px / b.w, py / b.h, pw / b.w, ph / b.h]);

// ———— Paris: the tower over the zinc roofs ————
/** The tower's half-width at a height (its feet 0, the tip of its mast 100), one curve, the legs sweeping in. @param {number} y */
const eiffelW = y => 18.2 * Math.exp(-y / 27.9) + .8;
/** @param {Brush} b @param {number} cx @param {number} by @param {number} H */
function eiffel(b, cx, by, H) {
  const { x } = b, u = H / 100, X = (/** @type {number} */ v) => cx + v * u, Y = (/** @type {number} */ v) => by - v * u;
  const p = new Path2D(); p.moveTo(X(19), Y(0));
  for (let y = 2; y <= 86; y += 2) p.lineTo(X(eiffelW(y)), Y(y));
  for (const [vx, vy] of [[1.9, 86], [1.9, 90.5], [.45, 90.5], [.45, 100], [-.45, 100], [-.45, 90.5], [-1.9, 90.5], [-1.9, 86]]) p.lineTo(X(vx), Y(vy));
  for (let y = 86; y >= 2; y -= 2) p.lineTo(X(-eiffelW(y)), Y(y));
  p.lineTo(X(-19), Y(0)); p.lineTo(X(-12.4), Y(0)); p.ellipse(cx, by, 12.4 * u, 12.6 * u, 0, Math.PI, 0); p.closePath();
  const lit = litBy(b), body = tone(b, '#5c4a3c', .26);
  x.save();
  if (lit) {
    // after dark it is gold, lit from inside the lattice, in a haze of its own light
    const halo = x.createRadialGradient(cx, Y(42), 0, cx, Y(42), H * .6); halo.addColorStop(0, 'rgb(255 186 90 / ' + (.24 * lit).toFixed(3) + ')'); halo.addColorStop(1, 'rgb(255 186 90 / 0)');
    x.fillStyle = halo; x.fillRect(cx - H * .6, Y(102), H * 1.2, H * 1.2);
    const g = x.createLinearGradient(0, by, 0, Y(100)); g.addColorStop(0, mix(body, '#e2862c', lit)); g.addColorStop(.55, mix(body, '#ffb04a', lit)); g.addColorStop(1, mix(body, '#ffe2a4', lit));
    x.fillStyle = g;
  } else x.fillStyle = body;
  x.fill(p);
  for (const [hw, y0, y1] of [[13.4, 17, 19.9], [7.6, 35, 37.2], [2.5, 85.6, 87.6]]) x.fillRect(X(-hw), Y(y1), hw * 2 * u, (y1 - y0) * u);
  // the lattice: crossing struts, a fine weave, and the line of each floor
  x.clip(p);
  x.strokeStyle = lit ? 'rgb(140 64 8 / ' + (.6 * lit).toFixed(3) + ')' : mix(body, '#000000', .38); x.globalAlpha = lit ? 1 : .5; x.lineWidth = Math.max(.6, u * .3);
  x.beginPath();
  for (let k = -32; k <= 32; k++) { const sx = cx + k * 3.3 * u; x.moveTo(sx, by); x.lineTo(sx + 38 * u, by - 100 * u); x.moveTo(sx, by); x.lineTo(sx - 38 * u, by - 100 * u); }
  for (const yy of [27, 50, 64, 76]) { x.moveTo(X(-20), Y(yy)); x.lineTo(X(20), Y(yy)); }
  x.stroke(); x.restore();
  return { u, X, Y };
}
/** A row of Paris: cream stone, iron balconies, the zinc mansard with its dormers, pots along the chimneys. @param {Brush} b @param {boolean} near */
function haussmann(b, near) {
  const { x, ox, oy, ow, oh, hz, L } = b, dark = L === 'night' || L === 'dusk';
  const stone = tone(b, '#ecdfc6', near ? .1 : .36), zinc = tone(b, '#74859a', near ? .08 : .34), pots = tone(b, '#b65f3e', near ? .1 : .36);
  const glass = dark ? mix(stone, '#000000', .4) : mix(zinc, '#253040', .5);
  // the near row stands across the street, from the bottom of the picture up: six floors, and shops at the bottom
  const shop = oh * .085, base = near ? oy + oh - shop : hz + oh * .035, fh0 = near ? base - (hz - oh * .012) : oh * .075;
  const awnings = ['#b8323c', '#2f5d4a', '#22385e', '#b8323c'];
  let px = ox - ow * (.02 + b.q() * .05);
  while (px < ox + ow) {
    const bw = ow * (near ? .26 + b.q() * .1 : .1 + b.q() * .05), fh = fh0 * (near ? 1 : .92 + b.q() * .16), fy = base - fh, rh = near ? oh * .035 : fh * .22, shade = b.q();
    x.fillStyle = mix(stone, shade < .5 ? '#ffffff' : '#000000', Math.abs(shade - .5) * .12); x.fillRect(px, fy, bw + 1, oy + oh - fy);
    const rows = near ? 6 : 4, cols = Math.max(2, Math.round(bw / (ow * (near ? .06 : .028))));
    windows(b, px + bw * .05, fy + fh * .04, bw * .9, fh * .92, cols, rows, glass, '#ffd27a', near ? .42 : .46);
    // the iron balconies, on the second floor and the fifth
    x.fillStyle = mix(stone, '#1c1c24', .62);
    for (const k of near ? [1, 4] : [1]) x.fillRect(px + bw * .04, fy + fh * .04 + fh * .92 / rows * (k + .82), bw * .92, Math.max(1, fh * (near ? .008 : .014)));
    if (near) {
      // the shops: their windows, lit after dark, and a café's striped awning
      const ay = base + shop * .12, col = awnings[Math.floor(b.q() * awnings.length)];
      x.fillStyle = mix(stone, '#000000', .25); x.fillRect(px, base, bw + 1, shop);
      x.fillStyle = dark ? '#ffcf86' : mix(glass, '#ffffff', .1); x.fillRect(px + bw * .08, base + shop * .4, bw * .62, shop * .5);
      x.fillStyle = mix(glass, '#000000', .3); x.fillRect(px + bw * .76, base + shop * .3, bw * .14, shop * .7);
      const aw = tone(b, col, .05); x.fillStyle = aw; x.beginPath(); x.moveTo(px + bw * .04, ay); x.lineTo(px + bw * .74, ay); x.lineTo(px + bw * .78, ay + shop * .3); x.lineTo(px, ay + shop * .3); x.fill();
      x.fillStyle = mix(aw, '#ffffff', .75); for (let k = 0; k < 7; k++) { const s0 = k / 7, s1 = (k + .5) / 7; x.beginPath(); x.moveTo(px + bw * (.04 + .7 * s0), ay); x.lineTo(px + bw * (.04 + .7 * s1), ay); x.lineTo(px + bw * .78 * s1, ay + shop * .3); x.lineTo(px + bw * .78 * s0, ay + shop * .3); x.fill(); }
    }
    x.fillStyle = mix(stone, '#000000', .2); x.fillRect(px, fy - Math.max(1, oh * .003), bw + 1, Math.max(1.5, oh * .005));
    // the mansard, zinc, sloping back, with its dormers
    x.fillStyle = zinc; x.beginPath(); x.moveTo(px, fy); x.lineTo(px + bw * .06, fy - rh); x.lineTo(px + bw * .94, fy - rh); x.lineTo(px + bw + 1, fy); x.fill();
    const dn = Math.max(1, cols - 1);
    for (let k = 0; k < dn; k++) {
      const dx = px + bw * (.14 + .72 * (k + .5) / dn), dw = bw * .045;
      x.fillStyle = mix(zinc, '#ffffff', .14); x.fillRect(dx - dw, fy - rh * .8, dw * 2, rh * .64);
      x.fillStyle = dark && b.spark() < .35 ? '#ffd27a' : glass; x.fillRect(dx - dw * .55, fy - rh * .66, dw * 1.1, rh * .44);
    }
    for (let k = 0; k < 2; k++) {
      const cxx = px + bw * (.18 + b.q() * .64), cw = bw * .075, ch = rh * (.55 + b.q() * .4);
      x.fillStyle = mix(stone, '#000000', .12); x.fillRect(cxx - cw / 2, fy - rh - ch, cw, ch + 1);
      x.fillStyle = pots; for (let m = 0; m < 3; m++) x.fillRect(cxx - cw / 2 + cw * (.06 + m * .33), fy - rh - ch - ch * .3, cw * .22, ch * .32);
    }
    px += bw;
  }
}
/** @param {Brush} b */
function paris(b) {
  const { ox, ow, oh, hz, L } = b, cx = ox + ow * b.at, H = oh * .56, by = hz - oh * .005;
  haussmann(b, false);
  const t = eiffel(b, cx, by, H);
  hole(b, t.X(-20), t.Y(42), 40 * t.u, 44 * t.u); hole(b, t.X(-7), t.Y(101), 14 * t.u, 60 * t.u);
  if (L === 'night') {
    // on the hour after dark it sparkles, a thousand bulbs going off at random; and its beacon goes round over the city
    const pts = []; for (let i = 0; i < 90; i++) { const y = 2 + b.lr() * 86; pts.push([t.X((b.lr() * 2 - 1) * eiffelW(y) * .9) / b.w, t.Y(y) / b.h]); }
    b.live({ k: 'glitter', pts });
    b.live({ k: 'beacon', at: [cx / b.w, t.Y(91.5) / b.h] });
  }
  haussmann(b, true);
}

// ———— Japan: a pagoda in the hills, maples; Fuji ————
/** Five storeys, each roof narrower, the eaves turned up at the ends, and the spire with its nine rings. @param {Brush} b @param {number} cx @param {number} by @param {number} H */
function pagoda(b, cx, by, H) {
  const { x } = b, u = H / 100, lit = litBy(b), wood = tone(b, '#b5402c', .22), roof = tone(b, '#2c2828', .2), spire = 20, tierH = (100 - spire) / 5 * u;
  const body = lit ? mix(wood, '#ffb46a', lit * .75) : wood;
  let y = by;
  for (let i = 0; i < 5; i++) {
    const k = i / 4, bw = (12.5 - 4.5 * k) * u, rw = (27 - 9 * k) * u, ry = y - tierH * .58, rt = ry - tierH * .42;
    x.fillStyle = body; x.fillRect(cx - bw, ry, bw * 2, y - ry + 1);
    x.fillStyle = mix(body, '#000000', .3); for (let m = -1; m <= 1; m += 2) x.fillRect(cx + m * bw * .45 - bw * .06, ry + tierH * .12, bw * .12, tierH * .4);
    if (lit) { const g = x.createLinearGradient(0, ry, 0, ry + tierH * .3); g.addColorStop(0, 'rgb(255 190 110 / ' + (.5 * lit).toFixed(3) + ')'); g.addColorStop(1, 'rgb(255 190 110 / 0)'); x.fillStyle = g; x.fillRect(cx - rw * .8, ry, rw * 1.6, tierH * .3); }
    x.fillStyle = roof; x.beginPath();
    x.moveTo(cx - rw, ry - tierH * .2);
    x.quadraticCurveTo(cx - rw * .72, ry + tierH * .04, cx - rw * .45, ry + tierH * .04); x.lineTo(cx + rw * .45, ry + tierH * .04);
    x.quadraticCurveTo(cx + rw * .72, ry + tierH * .04, cx + rw, ry - tierH * .2);
    x.quadraticCurveTo(cx + rw * .5, ry - tierH * .22, cx + bw * .62, rt); x.lineTo(cx - bw * .62, rt);
    x.quadraticCurveTo(cx - rw * .5, ry - tierH * .22, cx - rw, ry - tierH * .2); x.fill();
    y = rt;
  }
  x.fillStyle = roof; x.fillRect(cx - .8 * u, y - spire * u, 1.6 * u, spire * u);
  for (let k = 0; k < 9; k++) x.fillRect(cx - 2.4 * u, y - spire * u * (.12 + k * .075), 4.8 * u, Math.max(1, .8 * u));
  x.beginPath(); x.arc(cx, y - spire * u, 1.6 * u, 0, T); x.fill();
  hole(b, cx - 27 * u, by - H, 54 * u, H);
}
/** Tree crowns, round and dark, in a band. @param {Brush} b @param {number} y @param {number} r @param {string} col */
function crowns(b, y, r, col, from = 0, to = 1) {
  const { x, ox, ow } = b; x.fillStyle = col;
  for (let px = ox + ow * from; px < ox + ow * to + r; px += r * (.7 + b.q() * .6)) { x.beginPath(); x.arc(px, y + (b.q() - .5) * r * .5, r * (.7 + b.q() * .5), 0, T); x.fill(); }
}
/** A maple leaf: five points, the top one longest. @param {CanvasRenderingContext2D} x @param {number} cx @param {number} cy @param {number} r @param {number} rot */
function leaf(x, cx, cy, r, rot) {
  x.save(); x.translate(cx, cy); x.rotate(rot); x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .42 : r * (i === 0 ? 1 : i === 2 || i === 8 ? .9 : .66); x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  x.closePath(); x.fill(); x.restore();
}
const MAPLE = ['#c8321f', '#e05a24', '#f0952e', '#a8261c', '#f4b43c'];
/** A maple branch in from the top corner away from the pagoda, and its leaves coming down while it is looked at. @param {Brush} b */
function maple(b) {
  const { x, ox, oy, ow, oh, L } = b, s = -b.side, x0 = s < 0 ? ox - ow * .02 : ox + ow * 1.02, dir = -s, dark = L === 'night';
  const pts = /** @type {number[][]} */ ([]);
  x.strokeStyle = dark ? '#120c0c' : tone(b, '#3a2620', .1); x.lineCap = 'round';
  x.lineWidth = ow * .013; x.beginPath(); x.moveTo(x0, oy + oh * .05);
  const ex = x0 + dir * ow * .4, ey = oy + oh * .13;
  x.quadraticCurveTo(x0 + dir * ow * .2, oy + oh * .04, ex, ey); x.stroke();
  for (let k = 0; k < 6; k++) {
    const f = .2 + k * .15, bx = x0 + dir * ow * .4 * f, byy = oy + oh * (.05 + .08 * f * f) + (k % 2 ? oh * .03 : -oh * .015);
    x.lineWidth = ow * .005; x.beginPath(); x.moveTo(x0 + dir * ow * .4 * f, oy + oh * (.045 + .085 * f * f)); x.lineTo(bx, byy); x.stroke(); pts.push([bx, byy]);
  }
  x.lineCap = 'butt';
  for (const [bx, byy] of pts) for (let m = 0; m < 9; m++) {
    const c = MAPLE[Math.floor(b.q() * MAPLE.length)];
    x.fillStyle = dark ? mix(c, '#000000', .6) : L === 'dusk' ? mix(c, '#401020', .25) : c;
    leaf(x, bx + (b.q() - .5) * ow * .09, byy + (b.q() - .4) * oh * .06, ow * (.016 + b.q() * .012), (b.q() - .5) * 1.4);
  }
  b.live({ k: 'petals', box: b.fr(ox, oy, ow, oh), c: MAPLE, leaf: true });
}
/** The roofs of the old town: low, tiled, dark, a lantern here and there after dark. @param {Brush} b @param {number} y */
function townRoofs(b, y) {
  const { x, ox, ow, oh, L } = b, tile = tone(b, '#3b3b40', .2), wall = tone(b, '#d9cdb6', .25), lamps = /** @type {number[][]} */ ([]);
  let px = ox - ow * .03;
  while (px < ox + ow) {
    const rw = ow * (.09 + b.q() * .07), rh = oh * (.018 + b.q() * .012), wh = oh * .028;
    x.fillStyle = wall; x.fillRect(px + rw * .06, y - wh, rw * .88, wh + oh * .1);
    x.fillStyle = mix(wall, '#3a2a20', .55); for (let k = 1; k < 4; k++) x.fillRect(px + rw * k / 4, y - wh, Math.max(1, rw * .03), wh);
    x.fillStyle = tile; x.beginPath(); x.moveTo(px - rw * .02, y - wh); x.quadraticCurveTo(px + rw * .2, y - wh - rh * .5, px + rw * .3, y - wh - rh); x.lineTo(px + rw * .7, y - wh - rh); x.quadraticCurveTo(px + rw * .8, y - wh - rh * .5, px + rw * 1.02, y - wh); x.fill();
    if (b.q() < .45) lamps.push([px + rw * .5, y - wh * .55]);
    px += rw * (.92 + b.q() * .15);
  }
  if (L === 'night' || L === 'dusk') {
    // paper lanterns, glowing
    for (const [lx, ly] of lamps) { x.fillStyle = '#ffb35c'; x.beginPath(); x.ellipse(lx, ly, oh * .006, oh * .009, 0, 0, T); x.fill(); }
    if (lamps.length) b.live({ k: 'flames', pts: lamps.map(([lx, ly]) => [lx / b.w, ly / b.h]), z: .022 });
  }
}
/** A stone lantern: its foot, a post, the light-box with a window that glows after dark, a curved roof, a jewel on top. @param {Brush} b @param {number} cx @param {number} by @param {number} H */
function toro(b, cx, by, H) {
  const { x, L } = b, W = H * .5, stone = tone(b, '#8c8a80', .08), dark = mix(stone, '#000000', .3), lit = L === 'night' || L === 'dusk';
  x.fillStyle = stone; x.fillRect(cx - W * .34, by - H * .1, W * .68, H * .1); x.fillRect(cx - W * .11, by - H * .46, W * .22, H * .37);
  x.fillRect(cx - W * .42, by - H * .53, W * .84, H * .07); x.fillRect(cx - W * .28, by - H * .73, W * .56, H * .2);
  x.fillStyle = lit ? '#ffc070' : dark; x.fillRect(cx - W * .13, by - H * .69, W * .26, H * .12);
  x.fillStyle = stone; x.beginPath(); x.moveTo(cx - W * .6, by - H * .7); x.quadraticCurveTo(cx - W * .3, by - H * .76, cx, by - H * .9); x.quadraticCurveTo(cx + W * .3, by - H * .76, cx + W * .6, by - H * .7); x.lineTo(cx + W * .5, by - H * .73); x.lineTo(cx - W * .5, by - H * .73); x.fill();
  x.beginPath(); x.arc(cx, by - H * .93, W * .09, 0, T); x.fill();
  if (lit) b.live({ k: 'flames', pts: [[cx / b.w, (by - H * .63) / b.h]], z: .05 });
}
/** @param {Brush} b */
function kyoto(b) {
  const { x, ox, oy, ow, oh, hz } = b;
  ridge(b, hz - oh * .03, oh * .14, tone(b, '#6f8c82', .5), 2.2, .9);
  ridge(b, hz + oh * .015, oh * .08, tone(b, '#46644d', .28), 4.4, 2.1, true);
  const cx = ox + ow * b.at, by = hz + oh * .03, H = oh * .47;
  pagoda(b, cx, by, H);
  crowns(b, by - oh * .005, oh * .03, tone(b, '#2e4934', .2), b.at - .2, b.at + .2);
  townRoofs(b, hz + oh * .08);
  x.fillStyle = tone(b, '#53604a', .14); x.fillRect(ox, hz + oh * .08, ow, oy + oh - hz - oh * .08);
  // a garden in front: gravel raked in lines, raked in rings round three rocks on their moss, two stone lanterns
  const gy = hz + oh * .1, gravel = tone(b, '#dcd6c6', .1), groove = mix(gravel, '#000000', .13), deep = oy + oh - gy;
  x.fillStyle = gravel; x.fillRect(ox, gy, ow, deep);
  const rocks = [[.3, .45, .07], [.62, .3, .05], [.74, .7, .085]].map(([fx, fy, r]) => ({ x: ox + ow * fx, y: gy + deep * fy, r: ow * r }));
  x.strokeStyle = groove; x.lineWidth = Math.max(1, oh * .0022);
  for (let y = gy + deep * .04; y < oy + oh; y += Math.max(3, deep * .035)) {
    x.beginPath(); let on = false;
    for (let px = ox; px <= ox + ow; px += Math.max(2, ow / 90)) { const clear = rocks.every(k => Math.hypot((px - k.x) / 1.6, y - k.y) > k.r * 1.9); if (clear && !on) { x.moveTo(px, y); on = true; } else if (clear) x.lineTo(px, y); else on = false; }
    x.stroke();
  }
  for (const k of rocks) {
    for (let m = 1; m <= 3; m++) { x.beginPath(); x.ellipse(k.x, k.y, k.r * (1.05 + m * .28) * 1.6 * .62, k.r * (1.05 + m * .28) * .62, 0, 0, T); x.stroke(); }
    x.fillStyle = tone(b, '#4f6a40', .1); x.beginPath(); x.ellipse(k.x, k.y + k.r * .15, k.r * 1.2, k.r * .42, 0, 0, T); x.fill();
    x.fillStyle = tone(b, '#6d6a62', .08); x.beginPath(); x.moveTo(k.x - k.r, k.y + k.r * .2); x.quadraticCurveTo(k.x - k.r * .8, k.y - k.r * .9, k.x - k.r * .1, k.y - k.r * .95); x.quadraticCurveTo(k.x + k.r * .7, k.y - k.r * .6, k.x + k.r * .9, k.y + k.r * .2); x.fill();
    x.fillStyle = mix(tone(b, '#6d6a62', .08), '#ffffff', .15); x.beginPath(); x.moveTo(k.x - k.r * .7, k.y - k.r * .2); x.quadraticCurveTo(k.x - k.r * .6, k.y - k.r * .8, k.x - k.r * .1, k.y - k.r * .9); x.lineTo(k.x - k.r * .2, k.y - k.r * .3); x.fill();
  }
  toro(b, ox + ow * .1, oy + oh * .95, oh * .2); toro(b, ox + ow * .9, oy + oh * .95, oh * .2);
}
/** A cone with hollow flanks and snow down its gullies from the top. @param {Brush} b @param {number} cx @param {number} by @param {number} H @param {number} W */
function fujiCone(b, cx, by, H, W, k = .5) {
  const { x, L } = b, half = W / 2, top = by - H, crater = half * .1;
  const p = new Path2D(); p.moveTo(cx - half, by); p.quadraticCurveTo(cx - half * .3, by - H * .22, cx - crater, top);
  p.lineTo(cx - crater * .35, top + H * .012); p.lineTo(cx + crater * .3, top - H * .006); p.lineTo(cx + crater, top);
  p.quadraticCurveTo(cx + half * .3, by - H * .22, cx + half, by); p.closePath();
  x.fillStyle = tone(b, '#566a90', k); x.fill(p);
  x.save(); x.clip(p);
  x.fillStyle = L === 'night' ? mix('#c9d2ea', b.sky[1], .55) : L === 'dusk' ? mix('#ffd6c2', b.sky[1], .2) : mix('#ffffff', b.far, k * .3);
  x.beginPath(); x.moveTo(cx - half, top - 2); x.lineTo(cx + half, top - 2);
  let n = 0; for (let px = cx + half * .7; px >= cx - half * .7; px -= half * .055, n++) x.lineTo(px, top + H * (.3 + (n % 2 ? .09 : -.015) * (1 - Math.abs(px - cx) / half)));
  x.closePath(); x.fill(); x.restore();
  hole(b, cx - half * .5, top, half, H * .6);
}
/** @param {Brush} b */
function fuji(b) {
  const { x, ox, oy, ow, oh, hz, L } = b;
  fujiCone(b, ox + ow * (1 - b.at * .6 - .2), hz + oh * .02, oh * .3, ow * 1.1, .42);
  ridge(b, hz + oh * .03, oh * .05, tone(b, '#3f5c48', .25), 3, 1.3, true);
  pagoda(b, ox + ow * b.at, hz + oh * .07, oh * .36);
  crowns(b, hz + oh * .065, oh * .028, tone(b, '#2e4934', .18), b.at - .14, b.at + .14);
  x.fillStyle = tone(b, '#52604a', .12); x.fillRect(ox, hz + oh * .075, ow, oy + oh - hz - oh * .075);
  // cherry trees in flower along the front
  for (let i = 0; i < 4; i++) {
    const px = ox + ow * (i < 2 ? (1 - b.at) * .9 + i * .14 - .1 : b.at + (i - 2.5) * .3), py = hz + oh * .08;
    x.fillStyle = tone(b, '#4a3030', .1); x.fillRect(px - ow * .005, py - oh * .04, ow * .01, oh * .05);
    x.fillStyle = tone(b, '#f4b8c8', .1); for (let m = 0; m < 6; m++) { x.beginPath(); x.arc(px + (b.q() - .5) * ow * .08, py - oh * (.045 + b.q() * .03), ow * (.022 + b.q() * .015), 0, T); x.fill(); }
  }
  // the lake in front, the mountain upside down in it
  const lake = hz + oh * .1, depth = oy + oh - lake, from = Math.min(lake - oy, depth * 1.4);
  x.save(); x.beginPath(); x.rect(ox, lake, ow, depth); x.clip();
  x.translate(0, lake * 2); x.scale(1, -1); x.globalAlpha = .6; x.drawImage(x.canvas, ox, lake - from, ow, from, ox, lake - depth, ow, depth); x.restore();
  const wg = x.createLinearGradient(0, lake, 0, oy + oh); wg.addColorStop(0, 'rgb(40 70 110 / .25)'); wg.addColorStop(1, 'rgb(10 24 40 / .55)'); x.fillStyle = wg; x.fillRect(ox, lake, ow, depth);
  x.strokeStyle = 'rgb(255 255 255 / .22)'; x.lineWidth = 1; for (let k = 0; k < 26; k++) { const ly = lake + Math.pow(b.q(), 1.5) * depth, lx = ox + b.q() * ow, lw = ow * (.03 + b.q() * .1); x.beginPath(); x.moveTo(lx, ly); x.lineTo(lx + lw, ly); x.stroke(); }
  b.live({ k: 'water', box: b.fr(ox, lake, ow, depth), path: null, night: L === 'night' });
  b.live({ k: 'petals', box: b.fr(ox, oy, ow, oh) });
}

// ———— Tokyo: the tower, red and white ————
/** @param {Brush} b @param {number} cx @param {number} by @param {number} H */
function tokyoTower(b, cx, by, H) {
  const { x } = b, u = H / 100, X = (/** @type {number} */ v) => cx + v * u, Y = (/** @type {number} */ v) => by - v * u;
  const hw = (/** @type {number} */ y) => 12.4 * Math.exp(-y / 36) + .7;
  const p = new Path2D(); p.moveTo(X(12.4), Y(0));
  for (let y = 2; y <= 84; y += 2) p.lineTo(X(hw(y)), Y(y));
  for (const [vx, vy] of [[1.1, 84], [1.1, 91], [.4, 91], [.4, 100], [-.4, 100], [-.4, 91], [-1.1, 91], [-1.1, 84]]) p.lineTo(X(vx), Y(vy));
  for (let y = 84; y >= 2; y -= 2) p.lineTo(X(-hw(y)), Y(y));
  p.lineTo(X(-12.4), Y(0)); p.lineTo(X(-7.5), Y(0)); p.ellipse(cx, by, 7.5 * u, 9.5 * u, 0, Math.PI, 0); p.closePath();
  const lit = litBy(b), red = tone(b, '#e4472d', .2), white = tone(b, '#f3efe6', .2);
  x.save();
  if (lit) { const halo = x.createRadialGradient(cx, Y(45), 0, cx, Y(45), H * .5); halo.addColorStop(0, 'rgb(255 140 60 / ' + (.22 * lit).toFixed(3) + ')'); halo.addColorStop(1, 'rgb(255 140 60 / 0)'); x.fillStyle = halo; x.fillRect(cx - H * .5, Y(100), H, H); }
  x.fillStyle = lit ? mix(red, '#ff8a3a', lit) : red; x.fill(p);
  x.clip(p);
  x.fillStyle = lit ? mix(white, '#ffd9a0', lit) : white;
  for (const [y0, y1] of [[13, 18], [27, 32], [53, 58], [64, 68], [78, 82]]) x.fillRect(X(-14), Y(y1), 28 * u, (y1 - y0) * u);
  x.strokeStyle = mix(red, '#000000', .35); x.globalAlpha = .4; x.lineWidth = Math.max(.5, u * .28); x.beginPath();
  for (let k = -24; k <= 24; k++) { const sx = cx + k * 3 * u; x.moveTo(sx, by); x.lineTo(sx + 30 * u, by - 100 * u); x.moveTo(sx, by); x.lineTo(sx - 30 * u, by - 100 * u); }
  x.stroke(); x.restore();
  x.fillStyle = lit ? '#fff2d0' : white;
  for (const [h2, y0, y1] of [[6.8, 42, 48], [3.3, 73, 76.6]]) { x.fillRect(X(-h2), Y(y1), h2 * 2 * u, (y1 - y0) * u); }
  x.fillStyle = lit ? '#ffcf7a' : mix(white, '#5a6b80', .5);
  for (const [h2, y0, y1] of [[6.8, 43.5, 46.5], [3.3, 74, 75.6]]) x.fillRect(X(-h2 * .9), Y(y1), h2 * 1.8 * u, (y1 - y0) * u);
  hole(b, X(-13), Y(100), 26 * u, 100 * u);
  return { X, Y, u };
}
/** @param {Brush} b */
function tokyo(b) {
  const { ox, ow, oh, hz, L } = b;
  if (L !== 'night') fujiCone(b, ox + ow * (1 - b.at), hz + oh * .02, oh * .13, ow * .5, .62);
  const t = tokyoTower(b, ox + ow * b.at, hz + oh * .04, oh * .6);
  if (L === 'night' || L === 'dusk') b.live({ k: 'blink', pts: [[t.X(0) / b.w, t.Y(100) / b.h], [t.X(-3.3) / b.w, t.Y(76.6) / b.h], [t.X(3.3) / b.w, t.Y(76.6) / b.h]] });
}

// ———— New York: two towers out of a wall of them, water tanks on the roofs ————
/** A tower in steps, each [height reached, half-width] as fractions of its full height. @param {Brush} b @param {number} cx @param {number} by @param {number} H @param {number[][]} steps @param {string} col */
function stepped(b, cx, by, H, steps, col) {
  const { x } = b; let y0 = 0; x.fillStyle = col;
  for (const [y1, hw] of steps) { x.fillRect(cx - hw * H, by - y1 * H, hw * H * 2, (y1 - y0) * H + 1); y0 = y1; }
}
/** @param {Brush} b */
function newyork(b) {
  const { x, ox, oy, ow, oh, hz, L } = b, dark = L === 'night' || L === 'dusk', lit = litBy(b);
  const far = tone(b, '#959ba6', .45), mid = tone(b, '#757c88', .22), glass = dark ? mix(mid, '#000000', .35) : mix(far, '#3a4656', .35);
  // the far wall of towers
  for (let px = ox - ow * .02; px < ox + ow;) {
    const bw = ow * (.05 + b.q() * .05), bh = oh * (.1 + b.q() * .16); x.fillStyle = mix(far, b.q() < .5 ? '#ffffff' : '#000000', .05);
    x.fillRect(px, hz - bh, bw, bh + oh); if (b.q() < .3) x.fillRect(px + bw * .2, hz - bh - oh * .02, bw * .6, oh * .02);
    windows(b, px + bw * .1, hz - bh + oh * .01, bw * .8, bh, Math.max(2, Math.round(bw / (ow * .014))), Math.round(bh / (oh * .014)), glass, '#ffd98a', .5);
    px += bw + ow * .004;
  }
  // the Empire State, stepping up to its mast; the Chrysler's crown on the other side
  const ex = ox + ow * b.at, cxr = ox + ow * (1 - b.at), H1 = oh * .52, H2 = oh * .44, by = hz + oh * .04;
  const es = tone(b, '#b4ad9f', .25), ch = tone(b, '#a9adb3', .25);
  stepped(b, ex, by, H1, [[.14, .15], [.72, .1], [.76, .08], [.8, .062], [.84, .046], [.9, .03], [.93, .018], [1, .004]], es);
  windows(b, ex - H1 * .09, by - H1 * .7, H1 * .18, H1 * .54, 6, 26, dark ? mix(es, '#000000', .4) : mix(es, '#3a4252', .45), '#ffd98a', .42);
  if (lit) { x.save(); x.globalCompositeOperation = 'lighter'; const g = x.createRadialGradient(ex, by - H1 * .82, 0, ex, by - H1 * .82, H1 * .16); g.addColorStop(0, 'rgb(255 240 200 / ' + (.55 * lit).toFixed(3) + ')'); g.addColorStop(1, 'rgb(255 240 200 / 0)'); x.fillStyle = g; x.fillRect(ex - H1 * .16, by - H1, H1 * .32, H1 * .4); x.restore(); stepped(b, ex, by - H1 * .72, H1, [[.12, .06], [.18, .03]], mix(es, '#fff2c8', lit * .8)); }
  stepped(b, cxr, by, H2, [[.7, .085]], ch);
  windows(b, cxr - H2 * .075, by - H2 * .68, H2 * .15, H2 * .6, 5, 24, dark ? mix(ch, '#000000', .4) : mix(ch, '#3a4252', .45), '#ffd98a', .42);
  // the crown: arches stacked and narrowing, triangular windows in them, then the needle
  const steel = lit ? mix(tone(b, '#d5d8dc', .15), '#fff4d6', lit) : tone(b, '#d5d8dc', .15);
  for (let k = 0; k < 6; k++) {
    const hw = H2 * (.085 - k * .013), yb = by - H2 * (.7 + k * .036);
    x.fillStyle = steel; x.beginPath(); x.ellipse(cxr, yb, hw, H2 * .05, 0, Math.PI, 0); x.fill();
    x.fillStyle = lit ? '#ffe7a8' : mix(steel, '#2a3040', .55);
    for (let m = -2; m <= 2; m++) { const tx = cxr + m * hw * .36, ty = yb - H2 * .012; x.beginPath(); x.moveTo(tx - hw * .07, ty + H2 * .01); x.lineTo(tx, ty - H2 * .016); x.lineTo(tx + hw * .07, ty + H2 * .01); x.fill(); }
  }
  x.fillStyle = steel; x.fillRect(cxr - H2 * .005, by - H2, H2 * .01, H2 * .12);
  hole(b, ex - H1 * .15, by - H1, H1 * .3, H1); hole(b, cxr - H2 * .09, by - H2, H2 * .18, H2);
  if (dark) b.live({ k: 'blink', pts: [[ex / b.w, (by - H1) / b.h], [cxr / b.w, (by - H2) / b.h]] });
  // the near roofs: walk-ups, and the wooden water tanks on their legs
  const brick = tone(b, '#8a4a3a', .12), wood = tone(b, '#5a4030', .1);
  for (let px = ox - ow * .03; px < ox + ow;) {
    const bw = ow * (.12 + b.q() * .08), bh = oh * (.04 + b.q() * .05), top = hz + oh * .12 - bh;
    x.fillStyle = mix(brick, b.q() < .5 ? '#ffffff' : '#000000', .08); x.fillRect(px, top, bw, oy + oh - top);
    windows(b, px + bw * .08, top + oh * .012, bw * .84, oy + oh - top, Math.max(2, Math.round(bw / (ow * .035))), 8, dark ? mix(brick, '#000000', .45) : mix(brick, '#2a2a30', .5), '#ffd98a', .45);
    if (b.q() < .55) {
      const tx = px + bw * (.25 + b.q() * .4), tw = ow * .028, th = oh * .03, legs = oh * .015;
      x.fillStyle = wood; x.fillRect(tx - tw / 2, top - legs - th, tw, th);
      x.beginPath(); x.moveTo(tx - tw * .58, top - legs - th); x.lineTo(tx, top - legs - th - oh * .014); x.lineTo(tx + tw * .58, top - legs - th); x.fill();
      x.fillRect(tx - tw * .45, top - legs, tw * .08, legs); x.fillRect(tx + tw * .37, top - legs, tw * .08, legs);
      x.fillStyle = mix(wood, '#000000', .3); for (const yy of [.3, .7]) x.fillRect(tx - tw / 2, top - legs - th * yy, tw, Math.max(1, oh * .002));
    }
    px += bw;
  }
}

// ———— London: across the river, Big Ben and the Houses; the wheel on the other bank ————
/** @param {Brush} b @param {number} cx @param {number} by @param {number} H @param {string} stone */
function bigBen(b, cx, by, H, stone) {
  const { x } = b, W = H * .14, lit = litBy(b), body = lit ? mix(stone, '#e2b25a', lit * .85) : stone, Y = (/** @type {number} */ v) => by - v * H;
  x.fillStyle = body;
  x.fillRect(cx - W / 2, Y(.66), W, H * .66 + 1);
  x.fillRect(cx - W * .6, Y(.8), W * 1.2, H * .14);
  x.fillRect(cx - W * .5, Y(.865), W, H * .07);
  x.beginPath(); x.moveTo(cx - W * .52, Y(.865)); x.lineTo(cx, Y(.985)); x.lineTo(cx + W * .52, Y(.865)); x.fill();
  x.fillRect(cx - W * .035, Y(1), W * .07, H * .04);
  for (const k of [-1, 1]) { x.beginPath(); x.moveTo(cx + k * W * .6, Y(.8)); x.lineTo(cx + k * W * .52, Y(.89)); x.lineTo(cx + k * W * .44, Y(.8)); x.fill(); }
  x.fillStyle = mix(body, '#000000', .24); for (let k = 1; k < 4; k++) x.fillRect(cx - W / 2 + W * k / 4 - W * .025, Y(.64), W * .05, H * .6);
  x.fillStyle = mix(body, '#000000', .5); for (let k = 0; k < 3; k++) x.fillRect(cx - W * .4 + k * W * .3, Y(.855), W * .18, H * .045);
  const r = W * .4, fy = Y(.73);
  if (lit) { const g = x.createRadialGradient(cx, fy, r * .5, cx, fy, r * 2.6); g.addColorStop(0, 'rgb(255 236 170 / ' + (.45 * lit).toFixed(3) + ')'); g.addColorStop(1, 'rgb(255 236 170 / 0)'); x.fillStyle = g; x.fillRect(cx - r * 2.6, fy - r * 2.6, r * 5.2, r * 5.2); }
  x.fillStyle = lit ? '#fff2c4' : mix('#f2ead2', stone, .2); x.beginPath(); x.arc(cx, fy, r, 0, T); x.fill();
  x.strokeStyle = '#2a2420'; x.lineWidth = Math.max(1, r * .13); x.beginPath(); x.arc(cx, fy, r, 0, T); x.stroke();
  x.lineWidth = Math.max(1, r * .1); x.beginPath(); x.moveTo(cx, fy); x.lineTo(cx + r * .45, fy - r * .35); x.moveTo(cx, fy); x.lineTo(cx - r * .08, fy - r * .78); x.stroke();
  hole(b, cx - W * .6, Y(1.05), W * 1.2, H * 1.05);
}
/** The wheel by the river: a rim on its spokes, the capsules round it, turning slowly. @param {Brush} b @param {number} ex @param {number} ey @param {number} R */
function wheel(b, ex, ey, R) {
  const { x, hz, L } = b, lit = litBy(b), steel = lit ? mix(tone(b, '#e8ecf0', .2), '#9fd8ff', lit) : tone(b, '#e8ecf0', .2), s = b.side;
  // the legs it hangs from, leaning out over the water
  x.strokeStyle = tone(b, '#c9ced6', .3); x.lineWidth = R * .045; x.lineCap = 'round';
  x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex + s * R * .55, hz + R * .02); x.moveTo(ex, ey); x.lineTo(ex + s * R * .2, hz + R * .02); x.stroke(); x.lineCap = 'butt';
  if (b.bare) return;
  x.strokeStyle = steel; x.lineWidth = Math.max(1, R * .022); x.beginPath(); x.arc(ex, ey, R, 0, T); x.stroke();
  x.lineWidth = Math.max(.6, R * .01); x.beginPath(); x.arc(ex, ey, R * .9, 0, T); x.stroke();
  x.beginPath(); for (let k = 0; k < 32; k++) { const a = k * T / 32; x.moveTo(ex, ey); x.lineTo(ex + Math.cos(a) * R * .9, ey + Math.sin(a) * R * .9); } x.lineWidth = Math.max(.5, R * .005); x.stroke();
  x.fillStyle = lit ? '#fff0c8' : tone(b, '#f4f6f8', .15);
  for (let k = 0; k < 32; k++) { const a = k * T / 32; x.beginPath(); x.ellipse(ex + Math.cos(a) * R * 1.035, ey + Math.sin(a) * R * 1.035, R * .034, R * .022, a, 0, T); x.fill(); }
  x.fillStyle = steel; x.beginPath(); x.arc(ex, ey, R * .07, 0, T); x.fill();
  b.live({ k: 'spin', box: b.fr(ex - R * 1.08, ey - R * 1.08, R * 2.16, R * 2.16), pivot: [ex / b.w, ey / b.h], v: .05 });
  hole(b, ex - R * 1.08, ey - R * 1.08, R * 2.16, R * 2.16);
}
/** @param {Brush} b */
function london(b) {
  const { x, ox, ow, oh, hz, L } = b, stone = tone(b, '#c8a66a', .3), cx = ox + ow * b.at, s = b.side;
  // the Houses: a long gothic front along the far bank, little spires all along its top, the tall tower at its end
  const x0 = cx, x1 = s < 0 ? ox - ow * .02 : ox + ow * 1.02, a = Math.min(x0, x1), wd = Math.abs(x1 - x0), top = hz - oh * .055;
  const body = L === 'night' || L === 'dusk' ? mix(stone, '#e0b060', litBy(b) * .6) : stone;
  x.fillStyle = body; x.fillRect(a, top, wd, hz - top + 2);
  for (let px = a + ow * .006; px < a + wd; px += ow * .016) { x.beginPath(); x.moveTo(px - ow * .004, top); x.lineTo(px, top - oh * .018); x.lineTo(px + ow * .004, top); x.fill(); }
  const vt = x1 - s * ow * .1, vw = ow * .07; x.fillRect(vt - vw / 2, hz - oh * .17, vw, oh * .17);
  for (const k of [-.5, -.17, .17, .5]) { x.beginPath(); x.moveTo(vt + k * vw - ow * .006, hz - oh * .17); x.lineTo(vt + k * vw, hz - oh * .2); x.lineTo(vt + k * vw + ow * .006, hz - oh * .17); x.fill(); }
  windows(b, a, top + oh * .012, wd, oh * .04, Math.round(wd / (ow * .016)), 2, mix(body, '#000000', .4), '#ffd98a', .4);
  bigBen(b, cx, hz + oh * .005, oh * .44, stone);
  wheel(b, ox + ow * (1 - b.at * .7 - .15), hz - oh * .2, oh * .2);
  if (L === 'night' || L === 'dusk') {
    // lamps along the embankment, their light down the water
    x.fillStyle = '#ffd98a'; for (let px = ox + ow * .02; px < ox + ow; px += ow * .05) { x.fillRect(px, hz - oh * .006, Math.max(1, ow * .004), Math.max(1, oh * .005)); }
  }
}

// ———— Venice: the palaces on the water, the bell tower, a dome, a gondola ————
/** @param {Brush} b @param {number} cx @param {number} by @param {number} H */
function campanile(b, cx, by, H) {
  const { x } = b, W = H * .11, lit = litBy(b), brick = tone(b, '#a5523a', .25), white = tone(b, '#efe6d6', .2), green = tone(b, '#6b9a84', .25), Y = (/** @type {number} */ v) => by - v * H;
  x.fillStyle = lit ? mix(brick, '#e08a50', lit * .6) : brick; x.fillRect(cx - W / 2, Y(.62), W, H * .62 + 1);
  x.fillStyle = mix(brick, '#000000', .25); for (let k = 1; k < 5; k++) x.fillRect(cx - W / 2 + W * k / 5 - W * .02, Y(.6), W * .04, H * .56);
  x.fillStyle = white; x.fillRect(cx - W * .56, Y(.73), W * 1.12, H * .11);
  x.fillStyle = lit ? '#ffcf86' : mix(white, '#2a2a30', .6); for (let k = 0; k < 4; k++) { const ax = cx - W * .42 + k * W * .28; x.fillRect(ax, Y(.715), W * .14, H * .06); x.beginPath(); x.arc(ax + W * .07, Y(.715), W * .07, Math.PI, 0); x.fill(); }
  x.fillStyle = brick; x.fillRect(cx - W * .5, Y(.8), W, H * .07);
  x.fillStyle = green; x.beginPath(); x.moveTo(cx - W * .52, Y(.8)); x.lineTo(cx, Y(.97)); x.lineTo(cx + W * .52, Y(.8)); x.fill();
  x.fillStyle = tone(b, '#e8c24a', .1); x.beginPath(); x.arc(cx, Y(.985), W * .09, 0, T); x.fill();
  hole(b, cx - W * .6, Y(1), W * 1.2, H);
}
/** A dome on its drum, a lantern on top. @param {Brush} b @param {number} cx @param {number} by @param {number} R @param {string} col */
function dome(b, cx, by, R, col) {
  const { x } = b;
  x.fillStyle = mix(col, '#000000', .08); x.fillRect(cx - R * .9, by - R * .7, R * 1.8, R * .7 + 1);
  x.fillStyle = col; x.beginPath(); x.ellipse(cx, by - R * .7, R * .95, R * 1.05, 0, Math.PI, 0); x.fill();
  x.fillRect(cx - R * .14, by - R * 2, R * .28, R * .3); x.beginPath(); x.ellipse(cx, by - R * 2, R * .16, R * .2, 0, Math.PI, 0); x.fill();
  x.fillStyle = mix(col, '#000000', .3); for (let k = -2; k <= 2; k++) x.fillRect(cx + k * R * .36 - R * .05, by - R * .55, R * .1, R * .35);
  hole(b, cx - R, by - R * 2.2, R * 2, R * 2.2);
}
/** The palaces along the water: faded colours, rows of pointed windows, the waterline dark on them. @param {Brush} b */
function palazzi(b) {
  const { x, ox, oh, ow, hz, L } = b, dark = L === 'night' || L === 'dusk', cols = ['#d9a05b', '#c4683f', '#d98c86', '#efe3cf', '#b0503e', '#e8c27a'];
  for (let px = ox - ow * .02; px < ox + ow;) {
    const bw = ow * (.1 + b.q() * .09), bh = oh * (.07 + b.q() * .07), face = tone(b, cols[Math.floor(b.q() * cols.length)], .2), top = hz - bh;
    x.fillStyle = face; x.fillRect(px, top, bw + 1, bh + 2);
    const glass = dark ? mix(face, '#000000', .45) : mix(face, '#2a2a34', .55), rows = Math.max(2, Math.round(bh / (oh * .028))), n = Math.max(2, Math.round(bw / (ow * .026)));
    for (let r = 0; r < rows; r++) for (let c = 0; c < n; c++) {
      const wx = px + bw * (.1 + .8 * (c + .5) / n) - ow * .005, wy = top + bh * (.12 + .7 * r / rows), ww = ow * .01, wh = bh * .7 / rows * .55, on = dark && b.spark() < .35;
      x.fillStyle = on ? '#ffd27a' : glass; x.fillRect(wx, wy + ww * .5, ww, wh - ww * .5); x.beginPath(); x.moveTo(wx, wy + ww * .5); x.lineTo(wx + ww / 2, wy - ww * .3); x.lineTo(wx + ww, wy + ww * .5); x.fill();
    }
    x.fillStyle = mix(face, '#2f4a3a', .5); x.fillRect(px, hz - oh * .008, bw + 1, oh * .008 + 2);
    x.fillStyle = mix(face, '#000000', .25); x.fillRect(px, top, bw + 1, Math.max(1, oh * .004));
    if (b.q() < .5) { const cx = px + bw * (.2 + b.q() * .6), cw = ow * .012; x.fillRect(cx - cw * .25, top - oh * .02, cw * .5, oh * .02); x.beginPath(); x.moveTo(cx - cw * .8, top - oh * .03); x.lineTo(cx + cw * .8, top - oh * .03); x.lineTo(cx + cw * .25, top - oh * .018); x.lineTo(cx - cw * .25, top - oh * .018); x.fill(); }
    px += bw;
  }
}
/** A gondola: the black hull curving up at both ends, the iron at its prow, the gondolier at the back with his oar. @param {Brush} b @param {number} gx @param {number} gy @param {number} len */
function gondola(b, gx, gy, len, dir) {
  const { x, L } = b, hh = len * .055, ink = L === 'night' ? '#05060a' : '#15141a';
  x.save(); x.translate(gx + len / 2, gy); x.scale(dir, 1); x.translate(-len / 2, 0);
  x.fillStyle = 'rgb(0 0 0 / .22)'; x.beginPath(); x.ellipse(len * .5, hh * 1.2, len * .46, hh * .5, 0, 0, T); x.fill();
  x.fillStyle = ink; x.beginPath(); x.moveTo(0, -hh * 1.6); x.quadraticCurveTo(len * .45, hh * 1.6, len, -hh * 2.8);
  x.lineTo(len * .975, -hh * 2.5); x.quadraticCurveTo(len * .5, -hh * .1, len * .03, -hh * 1.3); x.closePath(); x.fill();
  x.fillStyle = L === 'night' ? '#8a8f9a' : '#dcdcd6'; x.fillRect(len * .975, -hh * 3.9, len * .012, hh * 1.4);
  for (let k = 0; k < 5; k++) x.fillRect(len * .962, -hh * (3.7 - k * .26), len * .016, hh * .1);
  x.fillStyle = '#9a2a2a'; x.fillRect(len * .45, -hh * 1.05, len * .1, hh * .5);
  // the gondolier, striped, in his straw hat, leaning on the oar
  const px = len * .14, base = -hh * 1.25, fh = len * .2;
  x.strokeStyle = ink; x.lineWidth = len * .009; x.beginPath(); x.moveTo(px + len * .02, base - fh * .62); x.lineTo(px - len * .1, hh * 2.2); x.stroke();
  x.fillStyle = ink; x.fillRect(px - len * .012, base - fh * .45, len * .024, fh * .45);
  x.fillStyle = '#f4f2ec'; x.fillRect(px - len * .016, base - fh * .8, len * .032, fh * .36);
  x.fillStyle = '#1d2a4a'; for (let k = 0; k < 3; k++) x.fillRect(px - len * .016, base - fh * (.76 - k * .11), len * .032, fh * .045);
  x.fillStyle = '#c99a7a'; x.beginPath(); x.arc(px, base - fh * .88, len * .015, 0, T); x.fill();
  x.fillStyle = '#e6c770'; x.fillRect(px - len * .026, base - fh * .93, len * .052, fh * .025); x.fillRect(px - len * .015, base - fh * .99, len * .03, fh * .06);
  x.restore();
}
/** @param {Brush} b */
function venice(b) {
  const { ox, ow, oh, hz } = b;
  dome(b, ox + ow * (1 - b.at * .8 - .12), hz - oh * .07, oh * .07, tone(b, '#ece6da', .3));
  campanile(b, ox + ow * b.at, hz - oh * .04, oh * .46);
  palazzi(b);
}
/** @param {Brush} b */
function veniceWater(b) {
  if (b.bare) return;
  const { ox, ow, oh, hz } = b, len = ow * .3, gx = ox + ow * (b.side < 0 ? .66 : .04), gy = hz + oh * .06;
  gondola(b, gx, gy, len, b.side < 0 ? -1 : 1);
  b.live({ k: 'bob', box: b.fr(gx - len * .02, gy - len * .3, len * 1.04, len * .36) });
}

// ———— Rome: the Colosseum, the pines, a dome far off ————
/** Three tiers of arches and the attic over them, the outer ring broken away at one end as it is. @param {Brush} b @param {number} cx @param {number} by @param {number} Wd @param {number} H */
function colosseum(b, cx, by, Wd, H) {
  const { x, L } = b, lit = L === 'night' ? 1 : L === 'dusk' ? .45 : 0, s = b.side, stone = tone(b, '#d9bd90', .22), wall = lit ? mix(stone, '#5a3a24', lit * .5) : stone;
  const x0 = cx - Wd / 2, n = 15, tiers = [[0, .27], [.27, .52], [.52, .77]];
  /** how high the wall stands at a fraction across, broken down toward the outer end */
  const up = (/** @type {number} */ f) => { const r = s < 0 ? f : 1 - f; return r < .14 ? .5 : r < .3 ? .76 : 1 - .05 * (2 * f - 1) ** 2; };
  x.fillStyle = wall; x.beginPath(); x.moveTo(x0, by);
  for (let k = 0; k <= 60; k++) { const f = k / 60; x.lineTo(x0 + Wd * f, by - H * up(f)); }
  x.lineTo(x0 + Wd, by); x.closePath(); x.fill();
  const arch = lit ? '#ffb257' : mix(stone, '#5e4632', .55), col = mix(wall, '#ffffff', .12);
  for (let i = 0; i < n; i++) {
    const th0 = -Math.PI / 2 + Math.PI * i / n, th1 = -Math.PI / 2 + Math.PI * (i + 1) / n, f0 = (Math.sin(th0) + 1) / 2, f1 = (Math.sin(th1) + 1) / 2, aw = (f1 - f0) * Wd, ax = x0 + f0 * Wd;
    for (const [t0, t1] of tiers) {
      if (up((f0 + f1) / 2) < t1 + .02) continue;
      const ty = by - H * t1, th = H * (t1 - t0);
      if (lit) { const g = x.createLinearGradient(0, ty + th, 0, ty); g.addColorStop(0, '#ffcf80'); g.addColorStop(1, '#e8802e'); x.fillStyle = g; } else x.fillStyle = arch;
      x.fillRect(ax + aw * .22, ty + th * .38, aw * .56, th * .5); x.beginPath(); x.ellipse(ax + aw / 2, ty + th * .38, aw * .28, th * .2, 0, Math.PI, 0); x.fill();
      x.fillStyle = col; x.fillRect(ax - aw * .05, ty + th * .2, aw * .1, th * .74);
    }
    if (up((f0 + f1) / 2) > .9) { x.fillStyle = lit ? '#ffcf80' : arch; x.fillRect(ax + aw * .38, by - H * .9, aw * .24, H * .06); }
  }
  x.fillStyle = mix(wall, '#000000', .2); for (const [, t1] of tiers) x.fillRect(x0, by - H * t1 - H * .012, Wd, H * .024);
  hole(b, x0, by - H, Wd, H);
}
/** A stone pine: a bare trunk leaning a little, and the flat crown on top like a cloud. @param {Brush} b @param {number} px @param {number} by @param {number} hgt @param {number} wd */
function pine(b, px, by, hgt, wd) {
  const { x } = b, lean = (b.q() - .5) * wd * .3;
  x.strokeStyle = tone(b, '#4a3428', .2); x.lineWidth = wd * .05; x.lineCap = 'round'; x.beginPath(); x.moveTo(px, by); x.quadraticCurveTo(px + lean, by - hgt * .5, px + lean * .5, by - hgt * .82); x.stroke(); x.lineCap = 'butt';
  x.fillStyle = tone(b, '#2f4630', .22); const cy = by - hgt * .9;
  for (let k = 0; k < 7; k++) { x.beginPath(); x.ellipse(px + lean * .5 + (k / 6 - .5) * wd * .8, cy - Math.sin(k / 6 * Math.PI) * hgt * .06, wd * .22, hgt * .09, 0, 0, T); x.fill(); }
  x.fillRect(px + lean * .5 - wd * .45, cy - hgt * .02, wd * .9, hgt * .06);
  hole(b, px - wd * .5, cy - hgt * .2, wd, hgt * .3);
}
/** @param {Brush} b */
function rome(b) {
  const { x, ox, oy, ow, oh, hz } = b, o = ox + ow * (1 - b.at);
  // far off: roofs, and the great dome over them
  dome(b, o + (b.side < 0 ? 1 : -1) * ow * .12, hz + oh * .005, oh * .05, tone(b, '#cfc6b8', .45));
  const roof = tone(b, '#c0603c', .35), ochre = tone(b, '#e2b06a', .35);
  for (let px = ox - ow * .02; px < ox + ow;) { const bw = ow * (.05 + b.q() * .06), bh = oh * (.02 + b.q() * .03); x.fillStyle = ochre; x.fillRect(px, hz - bh, bw, bh + oh); x.fillStyle = roof; x.fillRect(px - 1, hz - bh - oh * .006, bw + 2, oh * .008); px += bw; }
  for (let i = 0; i < 3; i++) pine(b, o + (i - 1) * ow * .13 + (b.q() - .5) * ow * .03, hz + oh * .07, oh * (.24 + b.q() * .08), ow * (.17 + b.q() * .06));
  colosseum(b, ox + ow * b.at, hz + oh * .07, ow * .62, oh * .24);
  const cob = tone(b, '#a89878', .1), gy = hz + oh * .07;
  x.fillStyle = mix(cob, '#000000', .25); x.fillRect(ox, gy, ow, oy + oh - gy);
  // the piazza: cobbles in rows, bigger toward you
  for (let y = gy, k = 0; y < oy + oh; k++) {
    const sz = oh * (.006 + (y - gy) / oh * .06); let px = ox - (k % 2) * sz * .6;
    while (px < ox + ow) { x.fillStyle = mix(cob, b.q() < .5 ? '#ffffff' : '#000000', b.q() * .12); x.beginPath(); x.roundRect(px + sz * .06, y + sz * .06, sz * 1.1, sz * .8, sz * .3); x.fill(); px += sz * 1.22; }
    y += sz * .92;
  }
}

// ———— Egypt: the pyramids, and palms ————
/** Two faces of a pyramid: the one to the sun pale, the other in shade. @param {Brush} b @param {number} px @param {number} by @param {number} hgt @param {number} sun -1 when the sun is on the left */
function pyramid(b, px, by, hgt, sun, cap = false) {
  const { x, L } = b, half = hgt * 1.2, split = px + half * .28, sand = tone(b, '#d9b47a', .3);
  const litFace = L === 'night' ? mix(sand, '#a0b4e0', .2) : L === 'dusk' ? mix(sand, '#ff9a5a', .45) : mix(sand, '#fff2d6', .3);
  const shade = L === 'night' ? mix(sand, '#000000', .45) : mix(sand, '#5a3a3a', L === 'dusk' ? .55 : .35);
  const left = sun < 0 ? litFace : shade, right = sun < 0 ? shade : litFace;
  x.fillStyle = left; x.beginPath(); x.moveTo(px - half, by); x.lineTo(px, by - hgt); x.lineTo(split, by); x.fill();
  x.fillStyle = right; x.beginPath(); x.moveTo(split, by); x.lineTo(px, by - hgt); x.lineTo(px + half * 1.05, by); x.fill();
  x.strokeStyle = 'rgb(0 0 0 / .08)'; x.lineWidth = 1; x.beginPath(); for (let k = 1; k < 9; k++) { const yy = by - hgt * k / 9, f = 1 - k / 9; x.moveTo(px - half * f, yy); x.lineTo(px + half * 1.05 * f, yy); } x.stroke();
  if (cap) { x.fillStyle = mix(left, '#ffffff', .25); x.beginPath(); x.moveTo(px - half * .12, by - hgt * .9); x.lineTo(px, by - hgt); x.lineTo(px + half * .03, by - hgt * .9); x.fill(); x.fillStyle = mix(right, '#ffffff', .2); x.beginPath(); x.moveTo(px + half * .03, by - hgt * .9); x.lineTo(px, by - hgt); x.lineTo(px + half * .126, by - hgt * .9); x.fill(); }
  hole(b, px - half, by - hgt, half * 2.05, hgt);
}
/** A date palm: a curved trunk in rings, fronds falling from the top. @param {Brush} b @param {number} px @param {number} by @param {number} hgt */
function palm(b, px, by, hgt, lean) {
  const { x } = b, tx = px + lean * hgt * .25, ty = by - hgt;
  x.strokeStyle = tone(b, '#6a4a30', .15); x.lineWidth = hgt * .045; x.lineCap = 'round';
  x.beginPath(); x.moveTo(px, by); x.quadraticCurveTo(px + lean * hgt * .02, by - hgt * .6, tx, ty); x.stroke();
  x.strokeStyle = tone(b, '#2f5a32', .15); x.lineWidth = hgt * .022;
  for (let k = 0; k < 9; k++) { const a = -Math.PI + k * Math.PI / 8, len = hgt * (.32 + b.q() * .1); x.beginPath(); x.moveTo(tx, ty); x.quadraticCurveTo(tx + Math.cos(a) * len * .6, ty + Math.sin(a) * len * .5 - hgt * .06, tx + Math.cos(a) * len, ty + Math.abs(Math.cos(a)) * len * .45 + hgt * .04); x.stroke(); }
  x.lineCap = 'butt'; x.fillStyle = tone(b, '#c8762a', .15); for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(tx + (b.q() - .5) * hgt * .06, ty + hgt * .05 + b.q() * hgt * .03, hgt * .012, 0, T); x.fill(); }
}
/** @param {Brush} b */
function egypt(b) {
  const { x, ox, oy, ow, oh, hz, L } = b, sun = b.sunX < .5 ? -1 : 1, sand = tone(b, '#e3bd84', .2);
  ridge(b, hz + oh * .01, oh * .02, tone(b, '#d8b07a', .4), 2, .4);
  const px = ox + ow * b.at, s = b.side;
  pyramid(b, px - s * ow * .02, hz + oh * .03, oh * .2, sun);
  pyramid(b, px - s * ow * .17, hz + oh * .035, oh * .16, sun, true);
  pyramid(b, px - s * ow * .28, hz + oh * .045, oh * .08, sun);
  for (let k = 0; k < 3; k++) { x.fillStyle = mix(sand, b.near, L === 'night' ? .4 + k * .12 : k * .09); x.beginPath(); x.moveTo(ox, oy + oh); for (let q = 0; q <= ow; q += 8) x.lineTo(ox + q, hz + oh * (.05 + k * .06) - Math.sin(q / ow * Math.PI * (1 + k * .7) + k * 1.7 + 1) * oh * .025); x.lineTo(ox + ow, oy + oh); x.fill(); }
  const pp = ox + ow * (1 - b.at);
  palm(b, pp, hz + oh * .13, oh * .26, -s); palm(b, pp + s * ow * .08, hz + oh * .12, oh * .19, s * .6);
}

// ———— Santorini: white houses down the cliff, blue domes, a windmill ————
/** @param {Brush} b */
function santorini(b) {
  const { x, ox, ow, oh, hz, L } = b, s = b.side, edge = s < 0 ? ox - ow * .01 : ox + ow * 1.01, inn = -s, dark = L === 'night' || L === 'dusk';
  ridge(b, hz + oh * .004, oh * .018, tone(b, '#7a6a64', .5), 1.4, 2.2);
  const top = hz - oh * .25, at = (/** @type {number} */ f) => edge + inn * ow * f;
  const rock = tone(b, '#8b5846', .2);
  x.fillStyle = rock; x.beginPath(); x.moveTo(edge, hz + 2); x.lineTo(edge, top); x.quadraticCurveTo(at(.3), top - oh * .01, at(.42), top + oh * .05); x.quadraticCurveTo(at(.5), hz - oh * .08, at(.6), hz + 2); x.closePath(); x.fill();
  x.strokeStyle = mix(rock, '#ffffff', .15); x.lineWidth = Math.max(1, oh * .003); for (let k = 1; k < 5; k++) { const yy = top + (hz - top) * k / 5; x.beginPath(); x.moveTo(edge, yy); x.lineTo(at(.42 + k * .035), yy + oh * .01); x.stroke(); }
  // the houses, stacked down the top of the cliff: whitewash, a shadow side, blue doors, here a dome
  const white = L === 'night' ? mix('#dfe4f0', b.sky[1], .45) : L === 'dusk' ? mix('#fff1e4', b.sky[2], .3) : '#f8f6f0', side = mix(white, '#8a9ab8', .3), blue = tone(b, '#2558b0', .1);
  for (let row = 0; row < 6; row++) {
    const ry = top + oh * (.008 + row * .028), span = .44 - row * .045;
    for (let f = .02; f < span; f += .045 + b.q() * .03) {
      const hx = at(f), hw = ow * (.035 + b.q() * .025), hh = oh * (.022 + b.q() * .016), hxl = inn > 0 ? hx : hx - hw;
      x.fillStyle = white; x.fillRect(hxl, ry - hh, hw, hh + oh * .02);
      x.fillStyle = side; x.fillRect(inn > 0 ? hxl + hw * .78 : hxl, ry - hh, hw * .22, hh + oh * .02);
      if (b.q() < .3) { x.fillStyle = white; x.beginPath(); x.ellipse(hxl + hw / 2, ry - hh, hw / 2, hh * .5, 0, Math.PI, 0); x.fill(); }
      x.fillStyle = dark && b.spark() < .4 ? '#ffd27a' : blue; x.fillRect(hxl + hw * .35, ry - hh * .55, hw * .16, hh * .55);
      if (b.q() < .16) { x.fillStyle = blue; x.beginPath(); x.ellipse(hxl + hw / 2, ry - hh, hw * .34, hh * .8, 0, Math.PI, 0); x.fill(); }
      if (b.q() < .12) { x.fillStyle = tone(b, '#e0408a', .1); x.beginPath(); x.arc(hxl + hw * .8, ry - hh * .3, hw * .22, 0, T); x.fill(); }
    }
  }
  // the windmill on the top
  const mx = at(.13), my = top - oh * .005, mh = oh * .07, mw = ow * .04;
  x.fillStyle = white; x.beginPath(); x.moveTo(mx - mw * .55, my); x.lineTo(mx - mw * .42, my - mh); x.lineTo(mx + mw * .42, my - mh); x.lineTo(mx + mw * .55, my); x.fill();
  x.fillStyle = tone(b, '#a8865a', .15); x.beginPath(); x.moveTo(mx - mw * .5, my - mh); x.lineTo(mx, my - mh - oh * .03); x.lineTo(mx + mw * .5, my - mh); x.fill();
  if (!b.bare) {
    const hx = mx + inn * mw * .3, hy = my - mh * .82, R = oh * .07;
    x.strokeStyle = tone(b, '#5a4030', .15); x.lineWidth = Math.max(1, R * .03); x.fillStyle = white;
    for (let k = 0; k < 6; k++) { const a = k * T / 6; x.beginPath(); x.moveTo(hx, hy); x.lineTo(hx + Math.cos(a) * R, hy + Math.sin(a) * R); x.stroke(); x.beginPath(); x.moveTo(hx + Math.cos(a) * R * .25, hy + Math.sin(a) * R * .25); x.lineTo(hx + Math.cos(a) * R * .95, hy + Math.sin(a) * R * .95); x.lineTo(hx + Math.cos(a + .32) * R * .8, hy + Math.sin(a + .32) * R * .8); x.closePath(); x.fill(); }
    b.live({ k: 'spin', box: b.fr(hx - R * 1.05, hy - R * 1.05, R * 2.1, R * 2.1), pivot: [hx / b.w, hy / b.h], v: .45 });
  }
}

// ———— San Francisco: the bridge across the strait, the headlands, fog coming in ————
/** @param {Brush} b */
function sanfrancisco(b) {
  const { x, ox, oy, ow, oh, hz, L } = b, lit = litBy(b);
  ridge(b, hz + oh * .005, oh * .1, tone(b, '#7a8458', .45), 1.6, 3.6);
  // the fog lying in over the headlands, lit by the hour
  const fogC = L === 'night' ? '150 160 190' : L === 'dusk' ? '255 214 196' : '255 255 255';
  x.save(); x.filter = 'blur(' + Math.max(2, Math.round(oh * .012)) + 'px)';
  for (let k = 0; k < 14; k++) { x.fillStyle = 'rgb(' + fogC + ' / ' + (L === 'night' ? .28 : .5).toFixed(2) + ')'; x.beginPath(); x.ellipse(ox + ow * (k / 13), hz - oh * (.03 + b.q() * .05), ow * (.1 + b.q() * .08), oh * (.025 + b.q() * .02), 0, 0, T); x.fill(); }
  x.restore();
  const red = tone(b, '#c03a2b', .12), steel = lit ? mix(red, '#ff9a5a', lit * .55) : red, deck = hz - oh * .07, topY = hz - oh * .38;
  const t1 = ox + ow * b.at, t2 = ox + ow * (1 - b.at), lw = ow * .016, gap = ow * .03;
  // the main cable, hung from the towers; the hangers down to the road
  const cable = (/** @type {number} */ px) => {
    if (px <= Math.min(t1, t2)) { const f = (Math.min(t1, t2) - px) / ow; return topY + (deck - topY) * Math.min(1, f * 3.5) ** .8; }
    if (px >= Math.max(t1, t2)) { const f = (px - Math.max(t1, t2)) / ow; return topY + (deck - topY) * Math.min(1, f * 3.5) ** .8; }
    const m = (t1 + t2) / 2, f = (px - m) / ((Math.max(t1, t2) - Math.min(t1, t2)) / 2); return deck - oh * .012 - (deck - oh * .012 - topY) * f * f;
  };
  x.strokeStyle = steel; x.lineWidth = Math.max(.5, ow * .0016); x.beginPath();
  for (let px = ox; px <= ox + ow; px += ow * .016) { x.moveTo(px, cable(px)); x.lineTo(px, deck); } x.stroke();
  x.lineWidth = Math.max(1.2, ow * .005); x.beginPath(); for (let px = ox - 2; px <= ox + ow + 2; px += 3) { const y = cable(px); if (px <= ox) x.moveTo(px, y); else x.lineTo(px, y); } x.stroke();
  // the towers: two legs, art deco struts between
  for (const tx of [t1, t2]) {
    x.fillStyle = steel;
    for (const k of [-1, 1]) x.fillRect(tx + k * gap / 2 - (k < 0 ? lw : 0), topY - oh * .01, lw, hz - topY + oh * .02);
    for (const f of [.04, .3, .55, .8]) x.fillRect(tx - gap / 2 - lw, topY + (deck - topY) * f, gap + lw * 2, oh * .012);
    x.fillRect(tx - gap / 2 - lw, deck + oh * .03, gap + lw * 2, oh * .01);
    hole(b, tx - gap - lw, topY - oh * .02, gap * 2 + lw * 2, hz - topY);
  }
  x.fillStyle = mix(steel, '#000000', .2); x.fillRect(ox, deck, ow, oh * .014);
  x.fillStyle = mix(steel, '#000000', .35); x.fillRect(ox, deck + oh * .014, ow, oh * .006);
  if (lit) { x.fillStyle = '#ffd98a'; for (let px = ox + ow * .01; px < ox + ow; px += ow * .03) x.fillRect(px, deck - oh * .004, Math.max(1, ow * .004), Math.max(1, oh * .004)); }
  if (lit) b.live({ k: 'blink', pts: [[t1 / b.w, (topY - oh * .01) / b.h], [t2 / b.w, (topY - oh * .01) / b.h]] });
  b.live({ k: 'fog', box: b.fr(ox, hz - oh * .15, ow, oh * .16), c: fogC, a: L === 'night' ? .35 : .55 });
}

// ———— Sydney: the Opera House's shells on the point, the bridge's arch ————
/** @param {Brush} b */
function sydney(b) {
  const { x, ox, ow, oh, hz, L } = b, lit = litBy(b), s = b.side;
  // the bridge, its arch across the harbour on the other side, a pylon at the end of it
  const bc = ox + ow * (1 - b.at) - s * ow * .12, span = ow * .7, deck = hz - oh * .05, steel = tone(b, '#757b86', .3), stone = tone(b, '#c2ab8c', .3);
  const arch = (/** @type {number} */ f, /** @type {number} */ hgt) => deck + oh * .02 - hgt * (1 - (2 * f - 1) ** 2);
  x.strokeStyle = steel; x.lineWidth = Math.max(1.2, oh * .006);
  for (const hgt of [oh * .2, oh * .15]) { x.beginPath(); for (let k = 0; k <= 50; k++) { const f = k / 50, px = bc - span / 2 + span * f, y = arch(f, hgt); if (k) x.lineTo(px, y); else x.moveTo(px, y); } x.stroke(); }
  x.lineWidth = Math.max(.6, oh * .0025); x.beginPath();
  for (let k = 0; k <= 24; k++) { const f = k / 24, px = bc - span / 2 + span * f; x.moveTo(px, arch(f, oh * .2)); x.lineTo(px + span / 48 * (k % 2 ? 1 : -1), arch(f, oh * .15)); if (arch(f, oh * .15) < deck) { x.moveTo(px, arch(f, oh * .15)); x.lineTo(px, deck); } }
  x.stroke();
  x.fillStyle = mix(steel, '#000000', .2); x.fillRect(ox, deck, ow, oh * .01);
  for (const px of [bc - span / 2, bc + span / 2]) { x.fillStyle = stone; x.fillRect(px - ow * .025, deck - oh * .09, ow * .05, oh * .09 + (hz - deck) + 2); x.fillStyle = mix(stone, '#000000', .25); x.fillRect(px - ow * .015, deck - oh * .07, ow * .03, oh * .03); }
  hole(b, bc - span / 2, deck - oh * .22, span, oh * .22);
  if (lit) { x.fillStyle = '#fff0c0'; for (let k = 0; k <= 30; k++) { const f = k / 30; x.fillRect(bc - span / 2 + span * f, arch(f, oh * .2) - 1, 2, 2); } b.live({ k: 'blink', pts: [[bc / b.w, arch(.5, oh * .2) / b.h]] }); }
  // the Opera House: a granite podium, and the shells, white tiles catching the light
  const cx = ox + ow * b.at, wd = ow * .42, py = hz - oh * .028;
  x.fillStyle = tone(b, '#c99c7a', .25); x.fillRect(cx - wd / 2, py, wd, hz - py + 2);
  const shell = lit ? mix(tone(b, '#f6f3ec', .1), '#fff1d8', lit) : tone(b, '#f6f3ec', .1), shadow = mix(shell, '#8a93a6', .3);
  x.save(); x.translate(cx, 0); x.scale(-s, 1); x.translate(-cx, 0);
  const shells = [[-.5, .27, .2, .13], [-.3, .3, .23, .17], [-.08, .26, .2, .13], [.12, .2, .16, .1], [.26, .16, .12, .075], [.38, .14, .1, .055]];
  for (const [f, sw, , sh] of shells) {
    const x0 = cx + wd * f * .9, w = wd * sw, hgt = oh * sh;
    if (lit) { const g = x.createRadialGradient(x0 + w * .6, py - hgt * .5, 0, x0 + w * .6, py - hgt * .5, w); g.addColorStop(0, 'rgb(255 236 200 / ' + (.3 * lit).toFixed(3) + ')'); g.addColorStop(1, 'rgb(255 236 200 / 0)'); x.fillStyle = g; x.fillRect(x0 - w * .4, py - hgt * 1.5, w * 2, hgt * 2); }
    x.fillStyle = shadow; x.beginPath(); x.moveTo(x0, py); x.quadraticCurveTo(x0 + w * .12, py - hgt * .9, x0 + w * .8, py - hgt); x.quadraticCurveTo(x0 + w * .88, py - hgt * .5, x0 + w, py); x.closePath(); x.fill();
    x.fillStyle = shell; x.beginPath(); x.moveTo(x0, py); x.quadraticCurveTo(x0 + w * .12, py - hgt * .9, x0 + w * .8, py - hgt); x.quadraticCurveTo(x0 + w * .62, py - hgt * .45, x0 + w * .72, py); x.closePath(); x.fill();
  }
  x.restore();
  hole(b, cx - wd / 2, py - oh * .18, wd, oh * .18);
}

// ———— Lisbon: the hills across the river, houses all the way up, the castle on top ————
/** @param {Brush} b */
function lisbon(b) {
  const { x, ox, ow, oh, hz, L } = b, dark = L === 'night' || L === 'dusk', s = b.side;
  const hill = (/** @type {number} */ f) => { const c1 = b.at, c2 = 1 - b.at * .7 - .15; return oh * (.15 * Math.exp(-(((f - c1) / .2) ** 2)) + .09 * Math.exp(-(((f - c2) / .18) ** 2)) + .02); };
  x.fillStyle = tone(b, '#7f8a5a', .4); x.beginPath(); x.moveTo(ox, hz + 1); for (let k = 0; k <= 80; k++) { const f = k / 80; x.lineTo(ox + ow * f, hz - hill(f)); } x.lineTo(ox + ow, hz + 1); x.fill();
  const walls = ['#f2c14e', '#efe6d6', '#e9a7a0', '#9fc2e0', '#f6efe4', '#e8d0a0'], roof = tone(b, '#c0563a', .3);
  for (let row = 0; row < 7; row++) for (let f = -.02; f < 1; f += .045 + b.q() * .03) {
    const ground = hz - hill(f) + oh * (.02 + row * .024); if (ground > hz + oh * .01 || ground < hz - hill(f) + oh * .012) continue;
    const hw = ow * (.036 + b.q() * .022), hh = oh * (.026 + b.q() * .012), px = ox + ow * f, face = tone(b, walls[Math.floor(b.q() * walls.length)], .32);
    x.fillStyle = face; x.fillRect(px, ground - hh, hw, hh + 2); x.fillStyle = roof; x.fillRect(px - 1, ground - hh - oh * .004, hw + 2, oh * .005);
    x.fillStyle = dark && b.spark() < .4 ? '#ffd27a' : mix(face, '#2a2a34', .5); x.fillRect(px + hw * .3, ground - hh * .7, hw * .14, hh * .35); x.fillRect(px + hw * .6, ground - hh * .7, hw * .14, hh * .35);
  }
  // the castle walls along the top of the higher hill, square towers in them, pines about it
  const cx = ox + ow * b.at, cy = hz - hill(b.at), stone = tone(b, '#b8a888', .3), cw = ow * .2;
  x.fillStyle = tone(b, '#3f5a3a', .3); for (let k = 0; k < 6; k++) { x.beginPath(); x.ellipse(cx + (k / 5 - .5) * cw * 1.3, cy + oh * .006, ow * .028, oh * .012, 0, 0, T); x.fill(); }
  x.fillStyle = stone; x.fillRect(cx - cw / 2, cy - oh * .03, cw, oh * .03 + 2);
  for (let px = cx - cw / 2; px < cx + cw / 2; px += ow * .012) x.fillRect(px, cy - oh * .036, ow * .006, oh * .007);
  for (const f of [-.45, -.12, .2, .45]) { const tx = cx + f * cw, tw = ow * .026; x.fillRect(tx - tw / 2, cy - oh * .052, tw, oh * .05); for (let k = 0; k < 3; k++) x.fillRect(tx - tw / 2 + k * tw * .4, cy - oh * .058, tw * .22, oh * .007); }
  hole(b, cx - cw / 2, cy - oh * .06, cw, oh * .06);
  const dx = ox + ow * (1 - b.at * .7 - .15), dy = hz - hill(1 - b.at * .7 - .15) + oh * .01;
  dome(b, dx - s * ow * .02, dy, oh * .03, tone(b, '#f2eee6', .3));
}

// ———— Mars ————
/**
 * Mars, sky and ground: butterscotch by day, the dust lit through; at sunset the sky going brown, and blue around the
 * sun, because the fine dust sends the blue light on near it; at night both its small moons. The ground rust, rocks
 * strewn, a mountain worn into layers far off, and a rover. Returns the horizon.
 * @param {Brush} b @param {{ sx: number, sy: number, sr: number, sun: number[] }} s
 */
export function mars(b, s) {
  const { x, ox, oy, ow, oh, hz, L } = b, up = s.sun[1] < 1.02;
  const S = L === 'night' ? ['#06050a', '#100b12', '#22161b'] : L === 'day' ? ['#b4744c', '#d29a6a', '#e8c294'] : ['#2e1c1e', '#5e3a32', '#a06c4e'];
  const g = x.createLinearGradient(0, oy, 0, hz); g.addColorStop(0, S[0]); g.addColorStop(.62, S[1]); g.addColorStop(1, S[2]); x.fillStyle = g; x.fillRect(ox, oy, ow, oh);
  if (L === 'night') {
    for (let i = 0; i < 220 * ow / b.w; i++) { x.globalAlpha = .25 + b.spark() * .7; x.fillStyle = '#ffffff'; x.fillRect(ox + b.spark() * ow, oy + b.spark() * (hz - oy) * .95, 1, 1); }
    x.globalAlpha = 1;
    // Phobos, lumpy and dark; Deimos, hardly more than a star; and the Earth, a blue evening star
    const px = ox + ow * (.3 + b.q() * .2), py = oy + (hz - oy) * .3, pr = ow * .028;
    x.fillStyle = '#8a7a6e'; x.beginPath(); x.ellipse(px, py, pr * 1.25, pr * .9, .4, 0, T); x.fill();
    x.fillStyle = '#5a4c44'; x.beginPath(); x.ellipse(px + pr * .35, py + pr * .1, pr * .75, pr * .7, .4, 0, T); x.fill(); x.beginPath(); x.arc(px - pr * .4, py - pr * .2, pr * .22, 0, T); x.fill();
    x.fillStyle = '#c8bcae'; x.beginPath(); x.arc(ox + ow * (.72 + b.q() * .1), oy + (hz - oy) * .2, ow * .006, 0, T); x.fill();
    const ex = ox + ow * (.12 + b.q() * .1), ey = oy + (hz - oy) * .62, eg = x.createRadialGradient(ex, ey, 0, ex, ey, ow * .02); eg.addColorStop(0, 'rgb(170 210 255 / .9)'); eg.addColorStop(1, 'rgb(170 210 255 / 0)');
    x.fillStyle = eg; x.fillRect(ex - ow * .02, ey - ow * .02, ow * .04, ow * .04); x.fillStyle = '#e8f2ff'; x.beginPath(); x.arc(ex, ey, Math.max(1, ow * .003), 0, T); x.fill();
  } else b.q(), b.q(), b.q();
  if (up) {
    const blue = L !== 'day', R = ow * (blue ? .4 : .3), gl = x.createRadialGradient(s.sx, s.sy, s.sr * .3, s.sx, s.sy, R);
    gl.addColorStop(0, blue ? 'rgb(176 214 245 / .8)' : 'rgb(255 244 222 / .55)'); gl.addColorStop(.35, blue ? 'rgb(120 168 220 / .35)' : 'rgb(255 236 200 / .2)'); gl.addColorStop(1, 'rgb(120 168 220 / 0)');
    x.fillStyle = gl; x.fillRect(ox, oy, ow, hz - oy);
    x.fillStyle = blue ? '#eef6ff' : '#fffaf0'; x.beginPath(); x.arc(s.sx, s.sy, s.sr * .62, 0, T); x.fill();
  }
  b.mark();
  if (b.skyOnly) return oy + oh;
  // far off, a mountain worn into layers
  const haze = S[2], rust = L === 'night' ? '#2a1714' : L === 'day' ? '#b4532c' : '#6e3322';
  const mt = mix(rust, haze, .5), mx = ox + ow * (1 - b.at);
  x.fillStyle = mt; x.beginPath(); x.moveTo(ox, hz + 1); for (let k = 0; k <= 60; k++) { const f = k / 60, px = ox + ow * f; x.lineTo(px, hz - oh * (.012 + .1 * Math.exp(-(((px - mx) / (ow * .26)) ** 2)))); } x.lineTo(ox + ow, hz + 1); x.fill();
  x.strokeStyle = mix(mt, haze, .3); x.lineWidth = Math.max(1, oh * .002); for (let k = 1; k < 5; k++) { x.beginPath(); x.moveTo(mx - ow * (.22 - k * .03), hz - oh * .1 * k / 5); x.lineTo(mx + ow * (.22 - k * .03), hz - oh * .1 * k / 5); x.stroke(); }
  for (let k = 0; k < 3; k++) {
    x.fillStyle = mix(rust, '#000000', k * .14 + (L === 'night' ? .1 : 0)); x.beginPath(); x.moveTo(ox, oy + oh);
    for (let q = 0; q <= ow; q += 6) x.lineTo(ox + q, hz + oh * (.01 + k * .055) - Math.abs(Math.sin(q / ow * Math.PI * (1.6 + k) + k * 2.3)) * oh * .022);
    x.lineTo(ox + ow, oy + oh); x.fill();
  }
  // rocks, the side toward the sun lit
  const toSun = b.sunX < .5 ? -1 : 1;
  for (let i = 0; i < 18; i++) {
    const t = Math.pow(b.q(), .8), cy = hz + oh * .02 + (oy + oh - hz) * t, r = ow * (.006 + t * .03) * (.6 + b.q() * .6), cx = ox + b.q() * ow;
    x.fillStyle = 'rgb(0 0 0 / .25)'; x.beginPath(); x.ellipse(cx - toSun * r * .9, cy + r * .1, r * 1.3, r * .3, 0, 0, T); x.fill();
    x.fillStyle = mix(rust, '#2a120a', .45); x.beginPath(); x.moveTo(cx - r, cy); x.lineTo(cx - r * .6, cy - r * .7); x.lineTo(cx + r * .3, cy - r * .85); x.lineTo(cx + r, cy); x.closePath(); x.fill();
    if (L !== 'night') { x.fillStyle = mix(rust, '#f0c090', .3); x.beginPath(); x.moveTo(cx + toSun * r * .2, cy - r * .82); x.lineTo(cx + toSun * r, cy); x.lineTo(cx + toSun * r * .4, cy); x.closePath(); x.fill(); }
  }
  // a rover, far off, its mast up
  const rx = ox + ow * b.at, ry = hz + oh * .045, rw = ow * .06, body = L === 'night' ? '#4a4448' : '#e8e2d8';
  x.fillStyle = body; x.fillRect(rx - rw / 2, ry - rw * .32, rw, rw * .18); x.fillRect(rx + rw * .25, ry - rw * .75, rw * .05, rw * .45); x.fillRect(rx + rw * .18, ry - rw * .8, rw * .2, rw * .09);
  x.fillStyle = '#2a2420'; for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(rx - rw * .38 + k * rw * .38, ry - rw * .08, rw * .085, 0, T); x.fill(); }
  // what moves: dust on the wind, a dust devil wandering far off, and at night something going over
  if (L !== 'night') b.live({ k: 'dust', box: b.fr(ox, hz - oh * .02, ow, oy + oh - hz + oh * .02), devil: L === 'day' ? [mx / b.w, hz / b.h, oh * .14 / b.h] : null });
  else b.live({ k: 'glide', box: b.fr(ox, oy, ow, (hz - oy) * .7) });
  return hz;
}

/** The parts of each place: behind (the far shore, the skyline, the landmark), after (what sits on the water or in front). */
const PAINT = /** @type {Record<string, { behind?: (b: Brush) => void, after?: (b: Brush) => void }>} */ ({
  paris: { behind: paris }, kyoto: { behind: kyoto, after: maple }, fuji: { behind: fuji }, tokyo: { behind: tokyo }, newyork: { behind: newyork },
  london: { behind: london }, venice: { behind: venice, after: veniceWater }, rome: { behind: rome }, egypt: { behind: egypt }, santorini: { behind: santorini },
  sanfrancisco: { behind: sanfrancisco }, sydney: { behind: sydney }, lisbon: { behind: lisbon },
});
/** Paints a place's landmarks, before its land (behind) or after it. @param {Brush} b @param {string} id @param {'behind' | 'after'} part */
export function paintPlace(b, id, part) { PAINT[id]?.[part]?.(b); }
