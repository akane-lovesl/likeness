/**
 * Dressing up on the device: a crown, a cape, a helmet, a halo, wings or a hat, painted onto the person in a picture
 * and placed by the outline the segmenter found (the top of the head, its width, the neck, the shoulders). It is a
 * sketch: the person stays as they are, and the pieces are painted on. The studio on a workstation paints the whole
 * costume.
 */
import { make, copy, cutout, COLOUR_WORDS } from './painter.js';
import { mix, alpha } from '../core/color.js';
import { rng } from '../core/dom.js';

/** @typedef {{ name: string, pieces: string[], colour?: string, place?: string, glow?: string, trim?: boolean, sparkle?: boolean, confetti?: boolean }} Persona */
/** @typedef {{ pieces: string[], persona: Persona | null, colours: Record<string, string>, place: string | null, glow: string | null, trim: boolean, sparkle: boolean, confetti: boolean, off: string[] }} Dress */

/** Who you can be: the pieces each one wears, the place it belongs, and the light along its outline. */
const PERSONAS = /** @type {[RegExp, Persona][]} */ ([
  [/\bsuper ?(?:hero(?:ine)?|man|woman|girl|boy)e?s?\b|caped crusader/, { name: 'a superhero', pieces: ['cape'], colour: '#c8202a', place: 'a city skyline at night', glow: '#ffcf7a' }],
  [/\bastronaut|\bspace ?(?:man|woman|explorer|cadet|traveller|traveler)|cosmonaut|spacesuit|space suit/, { name: 'an astronaut', pieces: ['helmet'], place: 'on the moon' }],
  [/\b(?:king|queen|prince|princess|monarch|emperor|empress|royalty)\b|\broyal\b(?! blue)/, { name: 'royalty', pieces: ['cape', 'crown'], colour: '#5b1f6e', trim: true }],
  [/\bwizard|sorcer(?:er|ess)|\bmage\b|magician|warlock/, { name: 'a wizard', pieces: ['wizard'], glow: '#a9c8ff', sparkle: true }],
  [/\bwitch\b/, { name: 'a witch', pieces: ['witch'], glow: '#c9a2ff', sparkle: true }],
  [/\bangel(?:ic)?\b/, { name: 'an angel', pieces: ['wings', 'halo'], glow: '#fff3cc', place: 'above the clouds' }],
  [/\bdevil(?:ish)?\b|\bdemon\b|\bimp\b/, { name: 'a little devil', pieces: ['horns'], glow: '#ff5236' }],
  [/\bfair(?:y|ies)\b|\bpixie\b|\bfae\b/, { name: 'a fairy', pieces: ['fairy', 'flowers'], sparkle: true }],
  [/\bbirthday\b(?! hat)|\bparty\b(?! hat)|\bcelebrat/, { name: 'the life of the party', pieces: ['party'], confetti: true }],
  [/\bcat ?(?:girl|boy|ears)\b|\b(?:as|into) a cat\b|\bkitty\b/, { name: 'a cat', pieces: ['ears'] }],
]);
/** The pieces by name, the longer names first so a flower crown is not a crown and fairy wings are not a bird's. */
const PIECES = /** @type {[RegExp, string][]} */ ([
  [/flower crown|crown of flowers|garland|wreath|flowers in (?:her|his|their|my|the) hair/, 'flowers'], [/(?:fairy|butterfly|dragonfly) wings/, 'fairy'],
  [/witch(?:['’]s|y)? hat/, 'witch'], [/wizard(?:['’]s)? hat|pointy hat/, 'wizard'], [/party hat|birthday hat/, 'party'],
  [/\bcrown|\btiara|\bdiadem/, 'crown'], [/\b(?:angel )?wings?\b/, 'wings'], [/\bcapes?\b(?! town| cod| verde| horn| may| breton| of good hope)|\bcloaks?\b/, 'cape'], [/\bhelmet|fishbowl/, 'helmet'],
  [/\bhalo/, 'halo'], [/\bhorns?\b/, 'horns'], [/cat ears|kitty ears|animal ears/, 'ears'],
]);
const NOUN = /** @type {Record<string, string[]>} */ ({ cape: ['cape'], cloak: ['cape'], crown: ['crown'], hat: ['wizard', 'witch', 'party'], wings: ['wings', 'fairy'], halo: ['halo'], horns: ['horns'], helmet: ['helmet'] });
/** In plain words, for the reply and the notes. */
export const PIECE_WORDS = /** @type {Record<string, string>} */ ({ cape: 'a cape', crown: 'a crown', helmet: 'a helmet', halo: 'a halo', wings: 'wings', fairy: 'wings like a dragonfly’s', wizard: 'a wizard’s hat', witch: 'a witch’s hat', party: 'a party hat', flowers: 'flowers in the hair', horns: 'horns', ears: 'cat ears' });
const LABELS = /** @type {Record<string, string>} */ ({ cape: 'A cape, round the shoulders', crown: 'A crown', helmet: 'A helmet', halo: 'A halo', wings: 'Wings, behind', fairy: 'Wings like a dragonfly’s', wizard: 'A wizard’s hat', witch: 'A witch’s hat', party: 'A party hat', flowers: 'Flowers in the hair', horns: 'Horns', ears: 'Ears' });
const BEHIND = ['wings', 'fairy', 'cape'], FRONT = ['flowers', 'ears', 'horns', 'crown', 'party', 'wizard', 'witch', 'halo', 'helmet'];

/**
 * What the words dress someone in, or null. A persona ("make @A a superhero") brings its pieces, its place and its
 * light; pieces can be named one by one ("give her a crown and a red cape"); "without the helmet" takes one off.
 * @param {string} text @returns {Dress | null}
 */
export function dressFrom(text) {
  const t = String(text || '').toLowerCase().replace(/@[a-z]{1,2}\b/g, ' ');
  const persona = PERSONAS.find(([re]) => re.test(t))?.[1] || null, pieces = new Set(persona?.pieces || []);
  let rest = t;
  for (const [re, id] of PIECES) if (re.test(rest)) { pieces.add(id); rest = rest.replace(new RegExp(re.source, 'g'), ' '); }
  // what is taken off: "without the helmet", "no wings"
  const off = /** @type {string[]} */ ([]);
  for (const m of t.matchAll(/\b(?:without|no|minus|lose|take off|leave off)\s+(?:a |an |the |any |his |her |their |its |my )?([a-z’' ]{3,24})/g)) for (const [re, id] of PIECES) if (re.test(m[1])) off.push(id);
  for (const id of off) pieces.delete(id);
  if (!pieces.size) return null;
  // colours said with a piece: "a blue cape", "a silver crown"
  const colours = /** @type {Record<string, string>} */ ({});
  if (persona?.colour) colours.cape = persona.colour;
  for (const m of t.matchAll(/\b([a-z]+)\s+(?:velvet\s+|silk\s+|paper\s+|feathered\s+)?(capes?|cloaks?|crowns?|hats?|wings|halos?|horns|helmets?)\b/g)) {
    const c = COLOUR_WORDS[/** @type {keyof typeof COLOUR_WORDS} */ (m[1])]; if (!c) continue;
    for (const id of NOUN[m[2].replace(/s$/, '')] || NOUN[m[2]] || []) if (pieces.has(id)) colours[id] = c;
  }
  return { pieces: [...pieces], persona, colours, place: persona?.place || null, glow: persona?.glow || null, trim: !!persona?.trim, sparkle: !!persona?.sparkle, confetti: !!persona?.confetti, off };
}
/** The pieces as a phrase: "a cape and a crown". @param {string[]} pieces */
export function pieceList(pieces) {
  const words = pieces.map(p => PIECE_WORDS[p] || p);
  return words.length > 1 ? words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1] : words[0] || '';
}

/**
 * Where someone is in a picture, from their outline: the middle and the top of the head, its width, its height down
 * to the neck, the neck's width, and the shoulders. Without an outline, a guess at a head-and-shoulders picture.
 * @param {HTMLCanvasElement | null} mask @param {number} w @param {number} h
 */
export function figureOf(mask, w, h) {
  const guess = { cx: w * .5, top: h * .12, headW: w * .34, headH: h * .3, neck: h * .42, neckW: w * .14, sy: h * .52, sl: w * .1, sr: w * .9, found: false };
  if (!mask) return guess;
  const mw = 128, mh = Math.max(1, Math.round(mw * h / w)), d = copy(mask, mw, mh).getContext('2d').getImageData(0, 0, mw, mh).data;
  const L = new Int16Array(mh).fill(-1), R = new Int16Array(mh).fill(-1);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (d[(y * mw + x) * 4 + 3] > 128) { if (L[y] < 0) L[y] = x; R[y] = x; }
  let y0 = 0; while (y0 < mh && L[y0] < 0) y0++;
  let y1 = mh - 1; while (y1 > y0 && L[y1] < 0) y1--;
  if (y1 - y0 < 6) return guess;
  const width = (/** @type {number} */ y) => (L[y] < 0 ? 0 : R[y] - L[y] + 1);
  // the head: as wide as it gets, then the neck, the narrowest row before the shoulders spread out
  let widest = 0, neck = -1, narrow = 1e9;
  for (let y = y0; y <= y1; y++) {
    const wy = width(y);
    if (neck < 0 && wy >= widest) widest = wy;
    else if (wy < widest * .85 && wy < narrow) { narrow = wy; neck = y; }
    if (neck >= 0 && wy > widest * 1.2) break;
  }
  // hair down past the shoulders hides the neck: then the head is taken as a little under half the outline
  if (neck < 0 || neck - y0 < (y1 - y0) * .18) neck = Math.round(y0 + Math.min((y1 - y0) * .46, mw * .62));
  const headH = neck - y0;
  let headW = 0, sum = 0, n = 0;
  // its width from the hair down; its middle from the face, which hair blown to one side does not move
  for (let y = y0; y <= y0 + headH * .75; y++) if (L[y] >= 0) headW = Math.max(headW, width(y));
  for (let y = Math.round(y0 + headH * .3); y <= y0 + headH * .85; y++) if (L[y] >= 0) { sum += (L[y] + R[y]) / 2; n++; }
  // the shoulders: where the outline spreads out below the neck
  let sy = -1; for (let y = neck; y <= y1; y++) if (width(y) > Math.max(headW * 1.25, width(neck) * 1.6)) { sy = y; break; }
  if (sy < 0) sy = Math.min(y1, neck + Math.round(headH * .25));
  const below = Math.min(y1, sy + Math.round(headH * .3));
  let sl = mw, sr = 0; for (let y = sy; y <= below; y++) if (L[y] >= 0) { sl = Math.min(sl, L[y]); sr = Math.max(sr, R[y]); }
  const kx = w / mw, ky = h / mh;
  return { cx: (n ? sum / n + .5 : mw / 2) * kx, top: y0 * ky, headW: headW * kx, headH: headH * ky, neck: neck * ky, neckW: Math.max(1, width(neck)) * kx, sy: sy * ky, sl: sl * kx, sr: (sr + 1) * kx, found: true };
}
/** @typedef {ReturnType<typeof figureOf>} Figure */

/**
 * Dresses the person in a picture: the place behind them (or their own), what goes behind (a cape, wings), the person,
 * what goes over the shoulders, then what goes on the head. With frames, a frame after each piece, named.
 * @param {HTMLCanvasElement} src @param {HTMLCanvasElement | null} mask @param {Dress} plan
 * @param {HTMLCanvasElement | null} [backdrop] @param {{ label: string, canvas: HTMLCanvasElement, reveal?: string }[] | null} [frames] @param {number} [seed]
 */
export function dressUp(src, mask, plan, backdrop = null, frames = null, seed = 1) {
  const w = src.width, h = src.height, f = figureOf(mask, w, h), out = make(w, h), x = out.getContext('2d'), r = rng(seed * 31 + 7);
  const step = (/** @type {string} */ label) => { frames?.push({ label, canvas: copy(out, Math.round(w / 2), Math.round(h / 2)) }); };
  const colour = (/** @type {string} */ id, /** @type {string} */ fallback) => plan.colours[id] || fallback;
  x.drawImage(backdrop || src, 0, 0, w, h);
  // behind them: only when there is an outline to put things behind
  const back = mask ? BEHIND.filter(p => plan.pieces.includes(p)) : [];
  for (const p of back) {
    if (p === 'wings') wings(x, f, colour('wings', '#fbf7ef'), w, h);
    if (p === 'fairy') fairyWings(x, f, w, h);
    if (p === 'cape') capeBehind(x, f, colour('cape', '#c8202a'), w, h);
  }
  if (mask && plan.glow) aura(x, mask, w, h, plan.glow);
  if (mask && (backdrop || back.length || plan.glow)) x.drawImage(cutout(src, mask), 0, 0);
  if (mask && plan.pieces.includes('cape')) capeFront(x, f, colour('cape', '#c8202a'), mask, w, h, plan.trim);
  for (const p of back) step(LABELS[p]);
  if (plan.glow && mask && !back.length) step('A light along the outline');
  const hair = hairOf(src, f);
  for (const p of FRONT.filter(q => plan.pieces.includes(q))) {
    if (p === 'crown') crown(x, f, colour('crown', '#e2ad35'));
    if (p === 'halo') halo(x, f, colour('halo', '#ffe7a0'));
    if (p === 'party') partyHat(x, f, colour('party', '#e8456b'));
    if (p === 'wizard') pointyHat(x, f, colour('wizard', '#2c3d96'), '#d9a93a', true, r);
    if (p === 'witch') pointyHat(x, f, colour('witch', '#1f1a2b'), '#7a3ea8', false, r);
    if (p === 'flowers') flowerCrown(x, f, r);
    if (p === 'horns') horns(x, f, colour('horns', '#b3261e'));
    if (p === 'ears') catEars(x, f, hair);
    if (p === 'helmet') helmet(x, f);
    step(LABELS[p]);
  }
  if (plan.sparkle) sparkles(x, f, w, h, r);
  if (plan.confetti) confetti(x, f, w, h, r);
  return { canvas: out, figure: f };
}

/** A soft light around the outline, outside it: the glow of someone lit from behind. */
function aura(/** @type {CanvasRenderingContext2D} */ x, /** @type {HTMLCanvasElement} */ mask, /** @type {number} */ w, /** @type {number} */ h, /** @type {string} */ col) {
  const ring = make(w, h), rc = ring.getContext('2d');
  rc.filter = 'blur(' + Math.max(3, w / 45) + 'px)'; rc.drawImage(mask, 0, 0, w, h); rc.drawImage(mask, 0, 0, w, h); rc.filter = 'none';
  rc.globalCompositeOperation = 'source-in'; rc.fillStyle = col; rc.fillRect(0, 0, w, h);
  x.save(); x.globalCompositeOperation = 'screen'; x.globalAlpha = .7; x.drawImage(ring, 0, 0); x.restore();
}
/** The colour of the hair at the top of the head, for ears that match it. */
function hairOf(/** @type {HTMLCanvasElement} */ src, /** @type {Figure} */ f) {
  const s = Math.max(2, Math.round(f.headW * .12)), px = Math.max(0, Math.round(f.cx - s / 2)), py = Math.max(0, Math.round(f.top + f.headH * .06));
  try {
    const d = src.getContext('2d').getImageData(px, py, s, s).data; let rr = 0, gg = 0, bb = 0;
    for (let i = 0; i < d.length; i += 4) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; }
    const n = d.length / 4, hx = (/** @type {number} */ v) => Math.round(v / n).toString(16).padStart(2, '0');
    return '#' + hx(rr) + hx(gg) + hx(bb);
  } catch { return '#3a2a22'; }
}

function crown(/** @type {CanvasRenderingContext2D} */ x, /** @type {Figure} */ f, /** @type {string} */ col) {
  const cw = f.headW * .6, ch = f.headH * .3, cx = f.cx, base = f.top + f.headH * .17, l = cx - cw / 2, r = cx + cw / 2, dip = ch * .12, tips = 5;
  const light = mix(col, '#fff6d8', .55), dark = mix(col, '#4a2c00', .55), tipY = (/** @type {number} */ k) => base - ch * (k === 2 ? 1.08 : k % 2 ? .8 : .92);
  const p = new Path2D(); p.moveTo(l, base); p.lineTo(l - cw * .02, base - ch * .45);
  for (let k = 0; k < tips; k++) { p.lineTo(l + cw * (k + .5) / tips, tipY(k)); if (k < tips - 1) p.lineTo(l + cw * (k + 1) / tips, base - ch * .42); }
  p.lineTo(r + cw * .02, base - ch * .45); p.lineTo(r, base); p.quadraticCurveTo(cx, base + dip, l, base); p.closePath();
  x.save(); x.shadowColor = 'rgb(0 0 0 / .4)'; x.shadowBlur = f.headW * .05; x.shadowOffsetY = f.headW * .02;
  const g = x.createLinearGradient(l, base - ch, r, base); g.addColorStop(0, light); g.addColorStop(.45, col); g.addColorStop(1, dark); x.fillStyle = g; x.fill(p); x.restore();
  // the band, a little darker, with its stones
  x.save(); x.clip(p); x.fillStyle = alpha(dark, .4); x.beginPath(); x.moveTo(l - 4, base - ch * .3); x.quadraticCurveTo(cx, base - ch * .3 + dip, r + 4, base - ch * .3); x.lineTo(r + 4, base + dip + 4); x.lineTo(l - 4, base + dip + 4); x.fill();
  // a glint down its left side
  const sh = x.createLinearGradient(l, 0, l + cw * .35, 0); sh.addColorStop(0, 'rgb(255 255 255 / .45)'); sh.addColorStop(1, 'rgb(255 255 255 / 0)'); x.fillStyle = sh; x.fillRect(l - 5, base - ch * 1.2, cw * .35, ch * 1.5); x.restore();
  x.lineWidth = Math.max(1, f.headW * .008); x.strokeStyle = dark; x.lineJoin = 'round'; x.stroke(p);
  const stones = ['#c8243a', '#2f5fd0', '#c8243a'];
  for (let k = 0; k < 3; k++) {
    const sx = cx + (k - 1) * cw * .28, sy = base - ch * .14 + dip * (k === 1 ? .9 : .45), sr = cw * .045;
    x.fillStyle = stones[k]; x.beginPath(); x.ellipse(sx, sy, sr, sr * 1.2, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgb(255 255 255 / .75)'; x.beginPath(); x.arc(sx - sr * .3, sy - sr * .4, sr * .3, 0, Math.PI * 2); x.fill();
  }
  for (let k = 0; k < tips; k++) { const pr = cw * .03; x.fillStyle = light; x.beginPath(); x.arc(l + cw * (k + .5) / tips, tipY(k), pr, 0, Math.PI * 2); x.fill(); x.strokeStyle = dark; x.lineWidth = Math.max(1, pr * .3); x.stroke(); }
}

function halo(/** @type {CanvasRenderingContext2D} */ x, /** @type {Figure} */ f, /** @type {string} */ col) {
  const cx = f.cx, cy = f.top - f.headH * .06, rx = f.headW * .36, ry = f.headW * .09;
  x.save(); x.shadowColor = col; x.shadowBlur = f.headW * .2; x.strokeStyle = col; x.lineWidth = f.headW * .05; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.stroke();
  x.shadowBlur = f.headW * .06; x.strokeStyle = mix(col, '#ffffff', .75); x.lineWidth = f.headW * .016; x.stroke(); x.restore();
}

function partyHat(/** @type {CanvasRenderingContext2D} */ x, /** @type {Figure} */ f, /** @type {string} */ col) {
  const bw = f.headW * .4, hh = f.headH * .6;
  x.save(); x.translate(f.cx + f.headW * .12, f.top + f.headH * .12); x.rotate(.22);
  const p = new Path2D(); p.moveTo(-bw / 2, 0); p.lineTo(0, -hh); p.lineTo(bw / 2, 0); p.quadraticCurveTo(0, bw * .16, -bw / 2, 0); p.closePath();
  x.save(); x.shadowColor = 'rgb(0 0 0 / .35)'; x.shadowBlur = bw * .1; x.shadowOffsetY = bw * .03; x.fillStyle = col; x.fill(p); x.restore();
  x.save(); x.clip(p);
  x.strokeStyle = '#ffd166'; x.lineWidth = bw * .11; for (let k = -4; k < 6; k++) { x.beginPath(); x.moveTo(-bw, -hh * .2 * k); x.lineTo(bw, -hh * .2 * k - hh * .3); x.stroke(); }
  const sg = x.createLinearGradient(-bw / 2, 0, bw / 2, 0); sg.addColorStop(0, 'rgb(255 255 255 / .28)'); sg.addColorStop(.5, 'rgb(255 255 255 / 0)'); sg.addColorStop(1, 'rgb(0 0 0 / .28)'); x.fillStyle = sg; x.fillRect(-bw, -hh, bw * 2, hh * 1.3);
  x.restore();
  x.fillStyle = '#fff5cf'; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; x.beginPath(); x.arc(Math.cos(a) * bw * .1, -hh + Math.sin(a) * bw * .1, bw * .065, 0, Math.PI * 2); x.fill(); }
  x.restore();
}

/** A tall pointed hat with a brim: stars and a moon on a wizard's, a buckle on a witch's. */
function pointyHat(/** @type {CanvasRenderingContext2D} */ x, /** @type {Figure} */ f, /** @type {string} */ col, /** @type {string} */ band, /** @type {boolean} */ stars, /** @type {() => number} */ r) {
  const bw = f.headW * 1.3, hh = f.headH * 1.02, cx = f.cx, base = f.top + f.headH * .24, dark = mix(col, '#000000', .45), light = mix(col, '#ffffff', .22);
  const bl = cx - bw * .27, br = cx + bw * .27;
  const p = new Path2D(); p.moveTo(bl, base);
  p.bezierCurveTo(bl + bw * .06, base - hh * .45, cx - bw * .05, base - hh * .8, cx + bw * .1, base - hh);
  p.quadraticCurveTo(cx + bw * .24, base - hh * 1.02, cx + bw * .31, base - hh * .84);
  p.quadraticCurveTo(cx + bw * .16, base - hh * .88, cx + bw * .09, base - hh * .72);
  p.bezierCurveTo(cx + bw * .15, base - hh * .45, br - bw * .02, base - hh * .2, br, base);
  p.quadraticCurveTo(cx, base + bw * .05, bl, base); p.closePath();
  x.save(); x.shadowColor = 'rgb(0 0 0 / .4)'; x.shadowBlur = bw * .04; x.shadowOffsetY = bw * .015;
  x.fillStyle = dark; x.beginPath(); x.ellipse(cx, base, bw / 2, bw * .09, -.04, 0, Math.PI * 2); x.fill(); x.restore();
  const g = x.createLinearGradient(bl, 0, br, 0); g.addColorStop(0, light); g.addColorStop(.6, col); g.addColorStop(1, dark); x.fillStyle = g; x.fill(p);
  x.save(); x.clip(p);
  x.fillStyle = band; x.fillRect(bl - 5, base - hh * .17, bw, hh * .12);
  if (stars) {
    x.fillStyle = '#ffd86b';
    for (let k = 0; k < 8; k++) star(x, bl + bw * .54 * r(), base - hh * (.25 + r() * .6), bw * (.018 + r() * .02));
    x.beginPath(); x.arc(cx - bw * .04, base - hh * .5, bw * .05, 0, Math.PI * 2); x.fill(); x.fillStyle = col; x.beginPath(); x.arc(cx - bw * .01, base - hh * .51, bw * .045, 0, Math.PI * 2); x.fill();
  }
  x.restore();
  if (!stars) { x.strokeStyle = '#e8c35a'; x.lineWidth = Math.max(1.5, bw * .012); x.strokeRect(cx - bw * .05, base - hh * .165, bw * .1, hh * .11); }
  // the front of the brim, over the foot of the cone
  x.fillStyle = mix(dark, col, .3); x.beginPath(); x.ellipse(cx, base, bw / 2, bw * .09, -.04, 0, Math.PI); x.fill();
}
function star(/** @type {CanvasRenderingContext2D} */ x, /** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ s) {
  x.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? s * .45 : s; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill();
}

function flowerCrown(/** @type {CanvasRenderingContext2D} */ x, /** @type {Figure} */ f, /** @type {() => number} */ r) {
  const cx = f.cx, cy = f.top + f.headH * .2, rx = f.headW * .48, ry = f.headH * .1, n = 9, cols = ['#f7a1b5', '#ffffff', '#ffd27a', '#c9a2ff', '#ff8f7a', '#ffffff'];
  const at = (/** @type {number} */ t) => [cx - Math.cos(t * Math.PI) * rx, cy - Math.sin(t * Math.PI) * ry];
  x.fillStyle = '#5f9a4a';
  for (let k = 0; k < n * 2; k++) { const [px, py] = at(k / (n * 2 - 1)); x.beginPath(); x.ellipse(px, py, f.headW * .05, f.headW * .02, (k % 2 ? .6 : -.6) + k * .2, 0, Math.PI * 2); x.fill(); }
  for (let k = 0; k < n; k++) {
    const [px, py] = at(k / (n - 1)), pr = f.headW * (.045 + r() * .02), col = cols[Math.floor(r() * cols.length)];
    x.save(); x.shadowColor = 'rgb(0 0 0 / .25)'; x.shadowBlur = pr * .5; x.fillStyle = col;
    for (let q = 0; q < 5; q++) { const a = q / 5 * Math.PI * 2 + k; x.beginPath(); x.arc(px + Math.cos(a) * pr * .6, py + Math.sin(a) * pr * .6, pr * .55, 0, Math.PI * 2); x.fill(); }
    x.restore(); x.fillStyle = col === '#ffd27a' ? '#c8722a' : '#f3c53a'; x.beginPath(); x.arc(px, py, pr * .35, 0, Math.PI * 2); x.fill();
  }
}

function horns(/** @type {CanvasRenderingContext2D} */ x, /** @type {Figure} */ f, /** @type {string} */ col) {
  for (const s of [-1, 1]) {
    const bx = f.cx + s * f.headW * .25, by = f.top + f.headH * .15, hh = f.headH * .26, bw = f.headW * .07;
    const p = new Path2D(); p.moveTo(bx - bw, by); p.quadraticCurveTo(bx - bw * .4 + s * bw * .6, by - hh * .55, bx + s * bw * 1.4, by - hh);
    p.quadraticCurveTo(bx + bw * .5 + s * bw * .4, by - hh * .45, bx + bw, by); p.closePath();
    const g = x.createLinearGradient(bx, by, bx + s * bw, by - hh); g.addColorStop(0, mix(col, '#000000', .35)); g.addColorStop(1, mix(col, '#ffffff', .25));
    x.save(); x.shadowColor = 'rgb(0 0 0 / .35)'; x.shadowBlur = bw * .6; x.fillStyle = g; x.fill(p); x.restore();
  }
}

function catEars(/** @type {CanvasRenderingContext2D} */ x, /** @type {Figure} */ f, /** @type {string} */ hair) {
  for (const s of [-1, 1]) {
    const bx = f.cx + s * f.headW * .28, by = f.top + f.headH * .17, hh = f.headH * .3, bw = f.headW * .16, tip = [bx + s * bw * .45, by - hh];
    x.save(); x.shadowColor = 'rgb(0 0 0 / .3)'; x.shadowBlur = bw * .3; x.fillStyle = hair;
    x.beginPath(); x.moveTo(bx - bw, by); x.quadraticCurveTo(bx - bw * .7 + s * bw * .3, by - hh * .6, tip[0], tip[1]); x.quadraticCurveTo(bx + bw * .7 + s * bw * .3, by - hh * .5, bx + bw, by); x.closePath(); x.fill(); x.restore();
    x.fillStyle = '#f2a7b6'; x.beginPath(); x.moveTo(bx - bw * .5, by - hh * .08); x.lineTo(bx + s * bw * .38, by - hh * .78); x.lineTo(bx + bw * .5, by - hh * .08); x.closePath(); x.fill();
  }
}

/** A glass bubble around the head, sitting in a collar on the shoulders. */
function helmet(/** @type {CanvasRenderingContext2D} */ x, /** @type {Figure} */ f) {
  const R = Math.max(f.headW * .74, f.headH * .64), cx = f.cx, cy = f.top + f.headH * .5;
  x.save();
  const g = x.createRadialGradient(cx - R * .2, cy - R * .25, R * .1, cx, cy, R); g.addColorStop(0, 'rgb(220 240 255 / 0)'); g.addColorStop(.72, 'rgb(190 220 255 / .07)'); g.addColorStop(1, 'rgb(170 205 255 / .34)');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
  x.lineCap = 'round';
  x.strokeStyle = 'rgb(255 255 255 / .62)'; x.lineWidth = R * .07; x.beginPath(); x.arc(cx, cy, R * .83, Math.PI * 1.08, Math.PI * 1.4); x.stroke();
  x.strokeStyle = 'rgb(255 255 255 / .5)'; x.lineWidth = R * .05; x.beginPath(); x.arc(cx, cy, R * .83, Math.PI * 1.46, Math.PI * 1.52); x.stroke();
  x.strokeStyle = 'rgb(255 255 255 / .22)'; x.lineWidth = R * .04; x.beginPath(); x.arc(cx, cy, R * .87, Math.PI * .06, Math.PI * .3); x.stroke();
  x.strokeStyle = 'rgb(255 255 255 / .75)'; x.lineWidth = Math.max(1.5, R * .022); x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
  // the ring it locks into, round the neck
  const ny = cy + R * .9, cw = R * .8, chh = R * .17, cg = x.createLinearGradient(0, ny - chh, 0, ny + chh); cg.addColorStop(0, '#f6f8fb'); cg.addColorStop(.45, '#cfd5de'); cg.addColorStop(1, '#7e8899');
  x.shadowColor = 'rgb(0 0 0 / .35)'; x.shadowBlur = R * .06; x.fillStyle = cg; x.beginPath(); x.ellipse(cx, ny, cw, chh, 0, 0, Math.PI * 2); x.fill(); x.shadowBlur = 0;
  x.strokeStyle = '#6a7383'; x.lineWidth = Math.max(1, R * .012); x.stroke();
  const ig = x.createLinearGradient(0, ny - chh, 0, ny); ig.addColorStop(0, '#8d97a8'); ig.addColorStop(1, '#c3cad5');
  x.fillStyle = ig; x.beginPath(); x.ellipse(cx, ny - chh * .28, cw * .82, chh * .5, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgb(255 255 255 / .7)'; x.lineWidth = Math.max(1, R * .015); x.beginPath(); x.ellipse(cx, ny + chh * .1, cw * .96, chh * .8, 0, Math.PI * .15, Math.PI * .85); x.stroke();
  x.fillStyle = '#566070'; for (const k of [-.75, -.3, .3, .75]) { x.beginPath(); x.arc(cx + cw * k, ny + chh * .55 * (1 - Math.abs(k) * .6), R * .022, 0, Math.PI * 2); x.fill(); }
  x.restore();
}

/** The back of a cape: falling from the shoulders and flaring out past them, its collar standing up behind the neck. */
function capeBehind(/** @type {CanvasRenderingContext2D} */ x, /** @type {Figure} */ f, /** @type {string} */ col, /** @type {number} */ w, /** @type {number} */ h) {
  const dark = mix(col, '#000000', .5), light = mix(col, '#ffffff', .14), cx = f.cx, sw = Math.max(f.sr - f.sl, f.headW * 1.6), top = f.neck;
  const p = new Path2D(); p.moveTo(cx - sw * .3, top); p.lineTo(cx + sw * .3, top);
  p.bezierCurveTo(cx + sw * .52, top + (h - top) * .2, cx + sw * .7, h * .85, cx + sw * .84, h + 2); p.lineTo(cx - sw * .84, h + 2);
  p.bezierCurveTo(cx - sw * .7, h * .85, cx - sw * .52, top + (h - top) * .2, cx - sw * .3, top); p.closePath();
  const g = x.createLinearGradient(cx - sw * .84, 0, cx + sw * .84, 0); g.addColorStop(0, dark); g.addColorStop(.25, col); g.addColorStop(.5, mix(col, '#000000', .2)); g.addColorStop(.75, light); g.addColorStop(1, dark);
  x.fillStyle = g; x.fill(p);
  x.save(); x.clip(p);
  for (let k = -3; k <= 3; k++) { const fx = cx + k * sw * .24, fg = x.createLinearGradient(fx - sw * .07, 0, fx + sw * .07, 0); fg.addColorStop(0, 'rgb(0 0 0 / 0)'); fg.addColorStop(.5, 'rgb(0 0 0 / .24)'); fg.addColorStop(1, 'rgb(0 0 0 / 0)'); x.fillStyle = fg; x.beginPath(); x.moveTo(cx + k * sw * .05, top); x.lineTo(fx - sw * .06, h); x.lineTo(fx + sw * .08, h); x.closePath(); x.fill(); }
  x.restore();
  // a low collar, folded back behind the neck
  for (const s of [-1, 1]) {
    const c = new Path2D(); c.moveTo(cx + s * f.neckW * .35, top + f.headH * .1);
    c.quadraticCurveTo(cx + s * f.headW * .42, f.neck - f.headH * .08, cx + s * f.headW * .52, f.neck - f.headH * .2);
    c.quadraticCurveTo(cx + s * f.headW * .78, f.neck - f.headH * .02, cx + s * sw * .36, top + f.headH * .16); c.closePath();
    const cg = x.createLinearGradient(cx, 0, cx + s * f.headW * .8, 0); cg.addColorStop(0, dark); cg.addColorStop(1, mix(col, '#000000', .15)); x.fillStyle = cg; x.fill(c);
  }
}
/** The front of the cape: over the shoulders, clasped under the chin; kept to where the person is. */
function capeFront(/** @type {CanvasRenderingContext2D} */ x, /** @type {Figure} */ f, /** @type {string} */ col, /** @type {HTMLCanvasElement} */ mask, /** @type {number} */ w, /** @type {number} */ h, /** @type {boolean} */ trim) {
  const dark = mix(col, '#000000', .45), cx = f.cx, sw = Math.max(f.sr - f.sl, f.headW * 1.4), clasp = f.neck + f.headH * .2, upper = f.neck + f.headH * .03, hem = Math.min(h * .98, f.neck + f.headH * .62, f.sy + f.headH * .5);
  const layer = make(w, h), lx = layer.getContext('2d');
  const p = new Path2D(); p.moveTo(0, upper); p.lineTo(w, upper); p.lineTo(w, hem);
  p.quadraticCurveTo(cx + sw * .3, hem, cx, clasp); p.quadraticCurveTo(cx - sw * .3, hem, 0, hem); p.closePath();
  const g = lx.createLinearGradient(0, upper, 0, hem); g.addColorStop(0, mix(col, '#ffffff', .1)); g.addColorStop(1, dark); lx.fillStyle = g; lx.fill(p);
  // folds falling from the clasp over each shoulder
  lx.save(); lx.clip(p);
  for (let k = 1; k <= 4; k++) for (const s of [-1, 1]) { lx.strokeStyle = 'rgb(0 0 0 / .16)'; lx.lineWidth = sw * .03; lx.beginPath(); lx.moveTo(cx + s * sw * .05 * k, clasp - f.headH * .05); lx.quadraticCurveTo(cx + s * sw * (.1 + k * .09), upper + (hem - upper) * .4, cx + s * sw * (.08 + k * .12), hem + 10); lx.stroke(); }
  lx.restore();
  // the hem: a gold edge, or ermine for a king or a queen
  const edge = new Path2D(); edge.moveTo(w, hem); edge.quadraticCurveTo(cx + sw * .3, hem, cx, clasp); edge.quadraticCurveTo(cx - sw * .3, hem, 0, hem);
  lx.lineWidth = trim ? f.headH * .09 : f.headH * .025; lx.strokeStyle = trim ? '#f6f1e6' : '#e0b23e'; lx.stroke(edge);
  if (trim) { lx.fillStyle = '#1b1b1b'; for (let t = .04; t < 1; t += .09) for (const s of [-1, 1]) { const px = cx + s * (1 - t) * 0 + s * t * (w / 2 + sw * .1), py = clasp + (hem - clasp) * Math.pow(t, .6); lx.beginPath(); lx.ellipse(px, py, f.headH * .012, f.headH * .022, 0, 0, Math.PI * 2); lx.fill(); } }
  lx.globalCompositeOperation = 'destination-in'; lx.drawImage(mask, 0, 0, w, h);
  x.drawImage(layer, 0, 0);
  // the clasp
  const cr = f.headW * .065; x.save(); x.shadowColor = 'rgb(0 0 0 / .4)'; x.shadowBlur = cr * .6;
  const cg = x.createRadialGradient(cx - cr * .3, clasp - cr * .3, cr * .1, cx, clasp, cr); cg.addColorStop(0, '#fff2b8'); cg.addColorStop(1, '#b8841e');
  x.fillStyle = cg; x.beginPath(); x.arc(cx, clasp, cr, 0, Math.PI * 2); x.fill(); x.restore();
  x.fillStyle = trim ? '#2f5fd0' : '#c8243a'; x.beginPath(); x.arc(cx, clasp, cr * .45, 0, Math.PI * 2); x.fill();
}

/** Feathered wings rising from behind the shoulders, up past the head: long flight feathers, then shorter ones, then soft coverts. */
function wings(/** @type {CanvasRenderingContext2D} */ x, /** @type {Figure} */ f, /** @type {string} */ col, /** @type {number} */ w, /** @type {number} */ h) {
  const shade = mix(col, '#8f95a6', .45);
  for (const s of [-1, 1]) {
    const R = [f.cx + s * f.neckW * .9, f.sy + f.headH * .05], E = [f.cx + s * w * .34, f.top + f.headH * .2], T = [f.cx + s * w * .48, f.top - f.headH * .3];
    const at = (/** @type {number} */ t) => [(1 - t) * (1 - t) * R[0] + 2 * (1 - t) * t * E[0] + t * t * T[0], (1 - t) * (1 - t) * R[1] + 2 * (1 - t) * t * E[1] + t * t * T[1]];
    // rows from the back: primaries off the outer half, secondaries along the middle, coverts over the edge
    for (const [from, to, n, len, lean, wid] of /** @type {[number, number, number, number, number, number][]} */ ([[.4, 1, 9, 1.05, .55, .13], [.05, .7, 9, .7, .2, .15], [0, 1, 14, .32, .35, .22]])) {
      for (let k = n - 1; k >= 0; k--) {
        const t = from + (to - from) * k / (n - 1), [px, py] = at(t), L = f.headH * len * (.7 + .5 * t), a = Math.PI / 2 - s * lean * (.3 + t);
        feather(x, px, py, a, L, L * wid, col, shade);
      }
    }
  }
}
/** One feather: a long leaf from its root, pale at the root, greyer at the tip, with its shaft. */
function feather(/** @type {CanvasRenderingContext2D} */ x, /** @type {number} */ px, /** @type {number} */ py, /** @type {number} */ a, /** @type {number} */ L, /** @type {number} */ W, /** @type {string} */ col, /** @type {string} */ shade) {
  x.save(); x.translate(px, py); x.rotate(a);
  const g = x.createLinearGradient(0, 0, L, 0); g.addColorStop(0, col); g.addColorStop(.7, mix(col, shade, .4)); g.addColorStop(1, shade);
  x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(L * .45, -W, L, 0); x.quadraticCurveTo(L * .45, W, 0, 0); x.fill();
  x.strokeStyle = 'rgb(110 115 130 / .35)'; x.lineWidth = Math.max(.8, W * .08); x.stroke();
  x.strokeStyle = 'rgb(255 255 255 / .5)'; x.beginPath(); x.moveTo(L * .05, 0); x.lineTo(L * .9, 0); x.stroke();
  x.restore();
}
/** Wings like a dragonfly's: four clear lobes, faintly coloured, veined. */
function fairyWings(/** @type {CanvasRenderingContext2D} */ x, /** @type {Figure} */ f, /** @type {number} */ w, /** @type {number} */ h) {
  for (const s of [-1, 1]) {
    const ox = f.cx + s * f.neckW * .7, oy = f.sy + f.headH * .05;
    for (const [ang, len, wid] of /** @type {[number, number, number][]} */ ([[-.85, 1.25, .42], [.35, .8, .3]])) {
      const a = s > 0 ? ang : Math.PI - ang, L = f.headH * len, W = f.headH * wid;
      x.save(); x.translate(ox, oy); x.rotate(a);
      const g = x.createLinearGradient(0, 0, L, 0); g.addColorStop(0, 'rgb(255 190 230 / .5)'); g.addColorStop(.5, 'rgb(170 235 255 / .38)'); g.addColorStop(1, 'rgb(210 190 255 / .3)');
      x.fillStyle = g; x.beginPath(); x.ellipse(L / 2, 0, L / 2, W / 2, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgb(255 255 255 / .75)'; x.lineWidth = Math.max(1, f.headH * .008); x.stroke();
      x.strokeStyle = 'rgb(255 255 255 / .4)'; for (const v of [-.25, 0, .25]) { x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(L * .5, W * v, L * .95, W * v * .6); x.stroke(); }
      x.restore();
    }
  }
}

function sparkles(/** @type {CanvasRenderingContext2D} */ x, /** @type {Figure} */ f, /** @type {number} */ w, /** @type {number} */ h, /** @type {() => number} */ r) {
  x.save(); x.fillStyle = '#fff6c8'; x.shadowColor = '#ffe08a'; x.shadowBlur = w * .02;
  for (let k = 0; k < 14; k++) {
    const a = r() * Math.PI * 2, d = f.headW * (.7 + r() * .9), px = f.cx + Math.cos(a) * d, py = f.top + f.headH * .5 + Math.sin(a) * d * .9, s = w * (.008 + r() * .014);
    x.beginPath(); x.moveTo(px, py - s * 2); x.quadraticCurveTo(px, py, px + s * 2, py); x.quadraticCurveTo(px, py, px, py + s * 2); x.quadraticCurveTo(px, py, px - s * 2, py); x.quadraticCurveTo(px, py, px, py - s * 2); x.fill();
  }
  x.restore();
}
function confetti(/** @type {CanvasRenderingContext2D} */ x, /** @type {Figure} */ f, /** @type {number} */ w, /** @type {number} */ h, /** @type {() => number} */ r) {
  const cols = ['#e8456b', '#ffd166', '#3fb8af', '#7a5cff', '#ff8f3a'];
  for (let k = 0; k < 46; k++) {
    const px = r() * w, py = r() * h * .75;
    if (Math.abs(px - f.cx) < f.headW * .55 && py > f.top - f.headH * .1 && py < f.neck + f.headH * .2) continue; // not over the face
    x.save(); x.translate(px, py); x.rotate(r() * Math.PI); x.fillStyle = cols[k % cols.length]; x.fillRect(-w * .008, -w * .004, w * .016, w * .008); x.restore();
  }
}
