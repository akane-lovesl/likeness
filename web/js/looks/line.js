/**
 * Faces in a few lines, the way a stylist sketches a client: an outline, the eyes, a nose, the lips, and the hair in
 * long strokes. Each part a look can change (the bangs, the brows, the lashes, the lips, a beard, the colour and the
 * cut) is drawn as strokes of its own, so a chip can draw just that part, and a portrait can draw a change in front
 * of you. These are drawings and say so; the studio's renders are photographs of people who do not exist.
 */

/** @typedef {{ hair?: string, bangs?: string, brows?: string, lashes?: string, lips?: string, beard?: string, colour?: string | null, skin?: string, ink?: string }} Sketch */

const M = (/** @type {string} */ d) => d.replace(/\s+/g, ' ').trim();
/** A mirror image across the middle of the face (x = 150). @param {string} d */
const flip = (d) => d.replace(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g, (_, x, y) => (300 - Number(x)) + ' ' + y);
const both = (/** @type {string} */ d) => [d, flip(d)];

const FACE = {
  oval: 'M103 150 C 101 205, 116 255, 150 283 C 184 255, 199 205, 197 150',
  ears: both('M103 178 C 93 172, 90 192, 98 202 C 101 206, 104 206, 105 203'),
  neck: both('M128 268 C 130 292, 129 310, 124 328'),
  shoulders: [...both('M124 328 C 96 336, 60 348, 38 400'), 'M124 328 C 138 343, 162 343, 176 328'],
  eyes: [...both('M117 197 C 124 189, 135 188, 142 196'), ...both('M120 199 C 127 203, 136 203, 141 198')],
  nose: 'M150 205 C 148 222, 143 233, 147 239 C 150 241, 153 241, 156 238',
  mouth: ['M135 256 C 141 251, 146 250, 150 253 C 154 250, 159 251, 165 256', 'M135 256 C 143 259, 157 259, 165 256', 'M137 258 C 143 266, 157 266, 163 258'],
};
const CROWN = 'M103 150 C 98 96, 122 64, 152 63 C 184 63, 206 94, 197 150';
/** The hair, by cut: its outline (filled when it has a colour) and its strokes. */
const HAIR = /** @type {Record<string, { shape: string, strokes: string[] }>} */ ({
  long: { shape: CROWN + ' C 203 214, 207 290, 220 352 L 190 352 C 192 280, 192 200, 190 150 L 110 150 C 108 200, 108 280, 110 352 L 80 352 C 93 290, 97 214, 103 150 Z',
    strokes: [CROWN, 'M103 150 C 97 214, 93 290, 80 352', 'M197 150 C 203 214, 207 290, 220 352', 'M110 122 C 104 182, 103 262, 97 332', 'M190 122 C 196 182, 197 262, 203 332', 'M152 64 C 150 80, 148 92, 147 104'] },
  bob: { shape: CROWN + ' C 204 196, 202 246, 188 264 C 180 266, 176 262, 176 258 L 124 258 C 124 262, 120 266, 112 264 C 98 246, 96 196, 103 150 Z',
    strokes: [CROWN, 'M103 150 C 96 200, 98 246, 112 264 C 116 266, 122 263, 124 258', 'M197 150 C 204 200, 202 246, 188 264 C 184 266, 178 263, 176 258', 'M152 64 C 148 82, 140 96, 132 104'] },
  curly: { shape: 'M100 160 C 78 150, 82 118, 98 108 C 92 86, 112 66, 130 70 C 140 52, 166 52, 174 70 C 194 66, 212 86, 204 108 C 220 118, 222 150, 200 160 C 216 186, 210 214, 196 222 C 190 196, 196 170, 190 150 L 110 150 C 104 170, 110 196, 104 222 C 90 214, 84 186, 100 160 Z',
    strokes: ['M100 160 C 78 150, 82 118, 98 108 C 92 86, 112 66, 130 70 C 140 52, 166 52, 174 70 C 194 66, 212 86, 204 108 C 220 118, 222 150, 200 160', 'M100 160 C 84 186, 90 214, 104 222', 'M200 160 C 216 186, 210 214, 196 222', 'M118 92 C 124 84, 134 86, 134 94', 'M160 84 C 168 78, 178 84, 176 92', 'M112 128 C 106 120, 112 110, 120 114'] },
  crop: { shape: 'M104 150 C 100 108, 122 80, 152 79 C 182 79, 202 106, 196 150 L 190 140 C 186 116, 172 104, 152 104 C 130 104, 114 116, 110 140 Z',
    strokes: ['M104 150 C 100 108, 122 80, 152 79 C 182 79, 202 106, 196 150', 'M118 104 C 126 96, 136 92, 146 92', 'M160 92 C 172 94, 182 100, 188 110'] },
  bun: { shape: CROWN + ' C 198 128, 190 108, 176 98 L 124 98 C 110 108, 102 128, 103 150 Z M152 62 m -20 0 a 20 18 0 1 0 40 0 a 20 18 0 1 0 -40 0 Z',
    strokes: [CROWN, 'M132 62 C 132 44, 172 44, 172 62 C 172 76, 132 76, 132 62', 'M126 96 C 136 84, 166 84, 178 96'] },
  afro: { shape: 'M150 30 C 100 30, 66 66, 70 120 C 72 168, 92 196, 104 200 L 104 150 C 104 120, 124 100, 150 100 C 176 100, 196 120, 196 150 L 196 200 C 208 196, 228 168, 230 120 C 234 66, 200 30, 150 30 Z',
    strokes: ['M150 30 C 100 30, 66 66, 70 120 C 72 168, 92 196, 104 200', 'M150 30 C 200 30, 234 66, 230 120 C 228 168, 208 196, 196 200', 'M96 80 C 100 74, 108 74, 110 80', 'M190 76 C 194 70, 202 72, 204 78', 'M140 46 C 144 40, 152 40, 154 46', 'M84 130 C 80 124, 84 118, 90 120', 'M214 128 C 220 124, 222 116, 216 112'] },
  pixie: { shape: 'M103 150 C 100 104, 124 76, 154 76 C 184 76, 202 102, 197 150 C 190 132, 184 118, 170 112 C 150 120, 128 126, 112 128 C 108 134, 105 142, 103 150 Z',
    strokes: ['M103 150 C 100 104, 124 76, 154 76 C 184 76, 202 102, 197 150', 'M112 128 C 128 126, 150 120, 170 112', 'M120 104 C 136 98, 160 96, 180 104'] },
  shag: { shape: CROWN + ' C 206 186, 212 230, 222 262 L 196 258 C 200 236, 194 200, 190 160 L 110 160 C 106 200, 100 236, 104 258 L 78 262 C 88 230, 94 186, 103 150 Z',
    strokes: [CROWN, 'M103 150 C 94 186, 88 230, 78 262', 'M197 150 C 206 186, 212 230, 222 262', 'M106 176 C 98 200, 96 222, 88 240', 'M194 176 C 202 200, 204 222, 212 240', 'M110 120 C 116 136, 116 150, 112 162', 'M190 120 C 184 136, 184 150, 188 162'] },
  buzz: { shape: 'M106 150 C 102 112, 124 88, 152 87 C 180 87, 200 110, 194 150 L 188 132 C 182 112, 168 104, 150 104 C 132 104, 118 112, 112 132 Z', strokes: ['M106 150 C 102 112, 124 88, 152 87 C 180 87, 200 110, 194 150'] },
});
/** Bangs, by style: drawn over the forehead. */
const BANGS = /** @type {Record<string, string[]>} */ ({
  none: [],
  curtain: ['M150 90 C 128 91, 111 116, 104 178', 'M150 90 C 172 91, 189 116, 196 178', 'M149 95 C 132 98, 119 120, 113 172', 'M151 95 C 168 98, 181 120, 187 172', 'M148 100 C 136 105, 127 124, 123 158', 'M152 100 C 164 105, 173 124, 177 158'],
  blunt: ['M105 165 C 130 169, 170 169, 195 165', 'M112 112 C 110 134, 110 152, 111 166', 'M124 100 C 123 126, 123 150, 124 167', 'M137 95 C 137 122, 137 148, 137 168', 'M150 93 C 150 120, 150 148, 150 168', 'M163 95 C 163 122, 163 148, 163 168', 'M176 100 C 177 126, 177 150, 176 167', 'M188 112 C 190 134, 190 152, 189 166'],
  wispy: ['M118 104 C 116 130, 116 152, 119 170', 'M131 98 C 130 126, 129 150, 131 176', 'M144 95 C 145 122, 144 148, 146 171', 'M157 95 C 158 122, 159 150, 157 174', 'M170 98 C 172 126, 172 150, 170 168', 'M183 104 C 185 130, 185 150, 182 172'],
  side: ['M176 88 C 162 110, 134 138, 104 158', 'M180 96 C 166 122, 142 146, 110 170', 'M186 106 C 172 130, 152 150, 126 174', 'M190 118 C 182 136, 168 150, 150 160'],
  micro: ['M108 134 C 130 138, 170 138, 192 134', 'M116 104 C 115 116, 115 126, 116 135', 'M130 98 C 130 112, 130 124, 130 137', 'M144 95 C 144 110, 144 124, 144 138', 'M158 95 C 158 110, 158 124, 158 138', 'M172 98 C 172 112, 172 124, 172 137', 'M186 104 C 186 116, 186 126, 185 135'],
  birkin: ['M150 92 C 144 120, 136 152, 128 186', 'M150 92 C 156 120, 164 152, 172 186', 'M137 98 C 130 126, 120 156, 108 184', 'M163 98 C 170 126, 180 156, 192 184', 'M124 106 C 116 132, 108 156, 104 176', 'M176 106 C 184 132, 192 156, 196 176', 'M150 92 C 150 124, 150 156, 150 180'],
});
/** Brows, by shape: a stroke, its weight, and for some a brushed texture. */
const BROWS = /** @type {Record<string, { d: string[], w: number, hairs?: string[] }>} */ ({
  soft: { d: both('M113 182 C 120 175, 132 173, 143 177'), w: 3.2 },
  straight: { d: both('M113 179 C 123 177, 133 176, 143 177'), w: 3.4 },
  arched: { d: both('M113 184 C 119 172, 129 168, 143 176'), w: 3 },
  feathered: { d: both('M113 182 C 120 175, 132 173, 143 177'), w: 2.6, hairs: [...both('M117 180 L 116 174'), ...both('M122 178 L 122 171'), ...both('M127 176 L 128 169'), ...both('M132 175 L 134 168'), ...both('M137 175 L 139 169'), ...both('M141 176 L 144 171')] },
  bold: { d: both('M112 182 C 120 174, 132 172, 144 177'), w: 6 },
  thin: { d: both('M114 181 C 121 176, 132 174, 142 177'), w: 1.4 },
});
const LASHES = /** @type {Record<string, string[]>} */ ({
  none: [],
  natural: [...both('M120 194 L 117 189'), ...both('M125 191 L 123 186'), ...both('M131 190 L 130 185'), ...both('M137 191 L 137 186')],
  bright: [...both('M120 194 L 115 186'), ...both('M125 191 L 121 182'), ...both('M131 190 L 129 180'), ...both('M137 191 L 137 182'), ...both('M141 194 L 143 187')],
  wing: [...both('M117 197 C 124 188, 135 187, 143 195'), ...both('M117 197 L 105 188')],
  smoky: [],
});
const LIP = 'M135 256 C 141 251, 146 250, 150 253 C 154 250, 159 251, 165 256 C 159 266, 141 266, 135 256 Z';
const LIPS = /** @type {Record<string, string | null>} */ ({ none: null, nude: '#c98b7a', red: '#c1272d', berry: '#7b1e3c', gloss: '#e8a9a0' });
const BEARD = /** @type {Record<string, string[]>} */ ({
  clean: [],
  moustache: ['M134 247 C 140 242, 147 243, 150 246 C 153 243, 160 242, 166 247 C 160 250, 154 250, 150 248 C 146 250, 140 250, 134 247'],
  trimmed: ['M104 210 C 106 246, 124 276, 150 286 C 176 276, 194 246, 196 210', 'M134 247 C 140 242, 147 243, 150 246 C 153 243, 160 242, 166 247'],
  full: ['M103 196 C 100 244, 120 300, 150 306 C 180 300, 200 244, 197 196', 'M134 247 C 140 242, 147 243, 150 246 C 153 243, 160 242, 166 247', 'M116 262 C 120 274, 126 284, 134 292', 'M184 262 C 180 274, 174 284, 166 292', 'M150 272 L 150 300'],
  stubble: [],
});

/** The style a sketch is in, part by part, with what is left unsaid filled in. @param {Sketch} s */
const fill = (s) => ({ hair: 'long', bangs: 'none', brows: 'soft', lashes: 'natural', lips: 'none', beard: 'clean', colour: null, skin: '#f0cfb2', ink: '#2a211b', ...s });

/** Seeded dots, for stubble. */
function stubble(seed = 3) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647), dots = [];
  for (let i = 0; i < 70; i++) { const a = r() * Math.PI, rr = 30 + r() * 14, x = 150 + Math.cos(a) * rr * 1.25, y = 232 + Math.sin(a) * rr * 1.1; if (y > 236) dots.push('M' + x.toFixed(1) + ' ' + y.toFixed(1) + 'h.1'); }
  return dots;
}

/** One part's strokes, as paths (each drawn on in turn when the part is drawn). @param {string} part @param {string} style @returns {{ d: string, w?: number }[]} */
function strokes(part, style) {
  if (part === 'bangs') return (BANGS[style] || []).map(d => ({ d }));
  if (part === 'brows') { const b = BROWS[style] || BROWS.soft; return [...b.d.map(d => ({ d, w: b.w })), ...(b.hairs || []).map(d => ({ d, w: 1 }))]; }
  if (part === 'lashes') return (LASHES[style] || []).map(d => ({ d, w: style === 'wing' ? 2.4 : 1.2 }));
  if (part === 'beard') return style === 'stubble' ? stubble().map(d => ({ d, w: 2.2 })) : (BEARD[style] || []).map(d => ({ d }));
  if (part === 'cut' || part === 'hair') return (HAIR[style] || HAIR.long).strokes.map(d => ({ d }));
  return [];
}

/**
 * A portrait in lines, as SVG markup. Each part is a group (data-part) of paths with a length of 1, so CSS can draw
 * it on (stroke-dashoffset from 1 to 0).
 * @param {Sketch} sk @param {{ id?: string, view?: string, only?: string | null }} [o] only: draw just one part (for a chip)
 */
export function sketchSVG(sk, { id = 'f' + Math.random().toString(36).slice(2, 7), view = '0 0 300 400', only = null } = {}) {
  const s = fill(sk), hair = HAIR[s.hair] || HAIR.long, path = (/** @type {{ d: string, w?: number }} */ p, i = 0) => '<path pathLength="1" style="--k:' + i + '" d="' + M(p.d) + '"' + (p.w ? ' stroke-width="' + p.w + '"' : '') + '/>';
  const group = (/** @type {string} */ part, /** @type {string} */ style, /** @type {{ d: string, w?: number }[]} */ list) => '<g class="ln" data-part="' + part + '" data-style="' + style + '">' + list.map(path).join('') + '</g>';
  const wash = (/** @type {string} */ d, /** @type {string} */ c, a = .5) => '<path class="wash" d="' + M(d) + '" fill="' + c + '" fill-opacity="' + a + '" filter="url(#' + id + 'w)"/>';
  const want = (/** @type {string} */ part) => !only || only === part || (only === 'colour' && part === 'hair') || (only === 'cut' && part === 'hair');
  let out = '<svg viewBox="' + view + '" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="' + s.ink + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  out += '<defs><filter id="' + id + 'w" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="9"/><feGaussianBlur stdDeviation="1.1"/></filter></defs>';
  if (!only) out += wash(FACE.oval + ' C 199 120, 101 120, 103 150 Z', s.skin, .42);
  if (s.colour && want('hair')) out += '<g class="colour" data-part="colour">' + wash(hair.shape, s.colour, .62) + '</g>';
  if (want('hair')) out += group('hair', s.hair, strokes('hair', s.hair));
  if (!only) {
    out += '<g class="ln base">' + [FACE.oval, ...FACE.ears, ...FACE.neck, ...FACE.shoulders, ...FACE.eyes, FACE.nose, ...FACE.mouth].map(d => path({ d })).join('') + '</g>';
    out += '<circle cx="130" cy="195.5" r="4.6" fill="' + s.ink + '" stroke="none"/><circle cx="170" cy="195.5" r="4.6" fill="' + s.ink + '" stroke="none"/>';
  }
  if (only === 'brows' || only === 'lashes') out += '<g class="ln base">' + FACE.eyes.map(d => path({ d })).join('') + '</g><circle cx="130" cy="195.5" r="4.6" fill="' + s.ink + '" stroke="none"/><circle cx="170" cy="195.5" r="4.6" fill="' + s.ink + '" stroke="none"/>';
  if (only === 'lips') out += '<g class="ln base">' + FACE.mouth.map(d => path({ d })).join('') + '</g>';
  if (only === 'beard' || only === 'bangs') out += '<g class="ln base faint">' + [FACE.oval, ...(only === 'bangs' ? [CROWN] : [FACE.nose, ...FACE.mouth])].map(d => path({ d })).join('') + '</g>';
  if (want('lashes') && s.lashes === 'smoky') out += '<g data-part="lashes" data-style="smoky">' + both('M114 194 C 122 180, 138 180, 146 194 C 136 190, 124 190, 114 194 Z').map(d => wash(d, '#4a3a44', .55)).join('') + '</g>';
  if (want('lips') && LIPS[s.lips]) out += '<g data-part="lips" data-style="' + s.lips + '">' + wash(LIP, /** @type {string} */ (LIPS[s.lips]), s.lips === 'gloss' ? .5 : .78) + (s.lips === 'gloss' ? '<path d="M142 260 C 146 262, 150 262, 154 260" stroke="#fff" stroke-width="1.6"/>' : '') + '</g>';
  if (want('brows')) out += group('brows', s.brows, strokes('brows', s.brows));
  if (want('lashes') && s.lashes !== 'smoky') out += group('lashes', s.lashes, strokes('lashes', s.lashes));
  if (want('beard')) out += group('beard', s.beard, strokes('beard', s.beard));
  if (want('bangs')) out += group('bangs', s.bangs, strokes('bangs', s.bangs));
  return out + '</svg>';
}

/** Where to look at each part, for a chip that shows only it (a viewBox). */
export const VIEWS = /** @type {Record<string, string>} */ ({
  bangs: '70 55 160 150', brows: '100 158 100 48', lashes: '102 176 96 34', lips: '122 236 56 38', beard: '84 196 132 120', colour: '50 30 200 220', cut: '20 20 260 360',
});

/** The strokes of one part in one style, for drawing a change over a portrait: [{ d, w }]. @param {string} part @param {string} style */
export const partStrokes = strokes;
