/**
 * Looks: styles you can put on any picture. Each is data: a prompt for the studio's model, and the recipe the
 * device uses to sketch it instantly (a colour ramp from shadow to light, and a few finishing touches).
 */
import { hsl, fromHsl, mix } from '../core/color.js';

/** @typedef {{ id: string, name: string, line: string, prompt: string, ramp?: string[], keep?: number, pre?: string, posterize?: number, grain?: number, bloom?: number, vignette?: number, edges?: number, paper?: string, halftone?: { inks: string[], paper: string, cell: number }, pixel?: number, scan?: number, fade?: number, wash?: boolean, mine?: boolean, from?: string }} Look */

/** @type {Look[]} */
export const LOOKS = [
  { id: 'velvet-hour', name: 'Velvet Hour', line: 'Plum shadows, candlelit gold, a little grain.', ramp: ['#1b0f1f', '#4a1d3f', '#a8475a', '#e3a35c', '#fbe3b8'], keep: .18, grain: .06, bloom: .35, vignette: .4, pre: 'contrast(1.08)', prompt: 'intimate candlelit photograph, deep plum shadows, warm gold highlights, soft film grain, gentle halation' },
  { id: 'watercolour', name: 'Watercolour', line: 'Loose washes on cold-press paper, the white showing through.', wash: true, keep: .5, paper: '#fbf6ec', prompt: 'loose watercolour painting in the picture’s own colours, transparent washes with soft bleeding edges and pigment blooms on cold-press paper, white paper showing through at the margins, a faint pencil underdrawing' },
  { id: 'valentine', name: 'Watercolour Valentine', line: 'Washed pinks bleeding into cold-press paper.', ramp: ['#6b3a4a', '#c76f86', '#f2a7b8', '#fbe0e3', '#fffaf5'], keep: .35, wash: true, paper: '#fff8f3', prompt: 'loose watercolour painting in rose and blush pinks, pigment blooms and soft bleeding edges on cold-press paper, white paper showing through' },
  { id: 'riso', name: 'Riso Garden', line: 'Two inks, cobalt and fluorescent pink, slightly off register.', halftone: { inks: ['#1d3a8a', '#ff5f6d'], paper: '#f6f0e4', cell: 5 }, prompt: 'two-colour risograph print in cobalt blue and fluorescent pink, coarse halftone dots, slight misregistration, uncoated paper' },
  { id: 'film-77', name: 'Film ’77', line: 'Faded teal shadows, warm skin, soft halation.', ramp: ['#12302f', '#3f6a63', '#c98b5b', '#edc79b', '#f7ecd6'], keep: .45, grain: .09, vignette: .3, bloom: .2, fade: .07, prompt: '1970s 35mm film photograph, faded teal shadows, warm skin tones, halation around highlights, visible grain' },
  { id: 'neon-noir', name: 'Neon Noir', line: 'Magenta and cyan on a wet black night.', ramp: ['#07040f', '#2a0b4a', '#c3168e', '#2ee6f5', '#f4f1ff'], keep: .12, bloom: .55, scan: .22, pre: 'contrast(1.2)', prompt: 'neon noir, magenta and cyan rim light on a rain-wet black night, glowing signage reflections, cinematic contrast' },
  { id: 'oil', name: 'Oil Study', line: 'Umber, ochre and the weight of a loaded brush.', ramp: ['#1f140c', '#5a3a22', '#a0683a', '#d8b07a', '#f3e2c0'], keep: .35, pre: 'blur(.9px) contrast(1.1)', posterize: 9, vignette: .45, grain: .04, prompt: 'old-master oil study, umber and ochre palette, visible impasto brushwork, chiaroscuro lighting, varnished canvas' },
  { id: 'ink-wash', name: 'Ink & Wash', line: 'Sumi ink and water on soft paper.', ramp: ['#0e0e0e', '#3b3b3b', '#8a8a85', '#d8d4c8', '#f5f1e6'], keep: 0, edges: .85, paper: '#f5f1e6', pre: 'blur(.6px) contrast(1.25)', prompt: 'sumi ink and wash drawing, confident brush lines, grey washes, generous white paper' },
  { id: 'porcelain', name: 'Porcelain', line: 'Cobalt on white glaze, like a teacup.', ramp: ['#0b2a6f', '#2c5bb5', '#8fb0e6', '#dfe8f7', '#fbfcff'], keep: 0, edges: .45, pre: 'contrast(1.15)', prompt: 'blue-and-white porcelain painting, cobalt brushwork on glossy white glaze, delicate outlines' },
  { id: 'golden-hour', name: 'Golden Hour', line: 'Long amber light and warm haze.', ramp: ['#2a1608', '#7a3b12', '#d77a2b', '#f6c063', '#fff1cc'], keep: .5, bloom: .45, vignette: .25, prompt: 'golden hour photograph, long low amber sunlight, warm haze, soft lens flare' },
  { id: 'pixel-pocket', name: 'Pixel Pocket', line: 'Four greens on a pocket screen.', ramp: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'], keep: 0, pixel: 76, posterize: 4, prompt: '4-colour green handheld-console pixel art, chunky pixels, limited palette, crisp dithering' },
  { id: 'cyanotype', name: 'Cyanotype', line: 'Prussian blue sun-print.', ramp: ['#0b1f4b', '#1b3f8b', '#4f7cc2', '#b8cde9', '#f1f5fb'], keep: 0, paper: '#f1f5fb', grain: .05, prompt: 'cyanotype sun print, prussian blue and white, botanical-print texture, uneven brushed emulsion edges' },
  { id: 'cel-pop', name: 'Cel Pop', line: 'Flat colour, crisp ink, Saturday-morning bright.', keep: 1, posterize: 4, pre: 'saturate(1.55) contrast(1.15)', edges: .75, prompt: 'cel-shaded animation still, flat bright colours, crisp ink outlines, simple two-tone shading' },
  { id: 'moonlit', name: 'Moonlit', line: 'Silver-blue and very quiet.', ramp: ['#05070f', '#18233f', '#4a5f8f', '#a9b8d8', '#eef2fb'], keep: .12, bloom: .3, vignette: .45, prompt: 'moonlit scene, silver-blue night light, deep quiet shadows, soft glow' },
  { id: 'sepia-letter', name: 'Sepia Letter', line: 'An old photograph tucked in a letter.', ramp: ['#2b1d12', '#5e432b', '#9c7b55', '#d6c09a', '#f5ead5'], keep: 0, paper: '#f5ead5', vignette: .5, grain: .08, prompt: 'antique sepia photograph, soft focus, foxed paper edges, gentle vignette' },
  { id: 'pastel-dream', name: 'Pastel Dream', line: 'Lilac, peach and a soft bloom.', ramp: ['#6b6fa8', '#a89ad6', '#f3b6cf', '#ffe1c6', '#fffaf0'], keep: .3, bloom: .4, pre: 'blur(.5px)', prompt: 'dreamy pastel palette of lilac, peach and pink, soft bloom, airy light' },
  { id: 'hoarfrost', name: 'Hoarfrost', line: 'Ice-blue morning, breath in the air.', ramp: ['#14233a', '#3d5f86', '#8fb4d6', '#dceaf6', '#ffffff'], keep: .25, bloom: .3, grain: .04, prompt: 'icy winter morning, hoarfrost, pale blue light, crisp cold air, faint mist' },
];

/**
 * Words that name a look, for reading requests like "in watercolour". Some name a medium (watercolour, film, pixels);
 * the rest a mood (golden, midnight, dreamy), marked so: those restyle a picture you have, but when something new is
 * painted they are part of what to paint, and the painter reads them itself.
 * @type {[RegExp, string, ('mood')?][]}
 */
const WORDS = [
  [/valentine|(?:pink|rose|blush) water ?colou?r/, 'valentine'], [/water ?colou?r|aquarelle/, 'watercolour'], [/\boil\b|old master|impasto|rembrandt/, 'oil'], [/pencil|sketch|drawing|charcoal|\bink\b|sumi/, 'ink-wash'],
  [/anime|cel|cartoon|comic|manga/, 'cel-pop'], [/pixel|8.?bit|retro game|game ?boy/, 'pixel-pocket'], [/neon|cyber|synthwave|vaporwave/, 'neon-noir', 'mood'],
  [/film|analog|polaroid/, 'film-77'], [/70s|seventies|vintage/, 'film-77', 'mood'], [/golden|sunset|warm light/, 'golden-hour', 'mood'], [/winter|frost|icy|snowy|cold/, 'hoarfrost', 'mood'],
  [/dream|pastel|\bsoft (?:focus|light|glow|pink|colou?rs?)\b/, 'pastel-dream', 'mood'], [/riso|risograph|zine|screen ?print/, 'riso'], [/porcelain|delft|china|blue and white/, 'porcelain'],
  [/cyanotype|blueprint/, 'cyanotype'], [/sepia|old photo/, 'sepia-letter'], [/antique|victorian/, 'sepia-letter', 'mood'], [/moon|midnight|night/, 'moonlit', 'mood'], [/velvet|candle|moody|romantic/, 'velvet-hour', 'mood'],
];
/** The look some words name. Pass moods: false when painting something new, so only a medium counts. */
export function lookFromWords(text, looks = LOOKS, { moods = true } = {}) {
  const t = text.toLowerCase();
  for (const l of looks) if (l.mine && t.includes(l.name.toLowerCase())) return l;
  for (const [re, id, kind] of WORDS) if ((moods || kind !== 'mood') && re.test(t)) return looks.find(l => l.id === id) || null;
  return null;
}

/** A look made from a palette (taken from a picture, or from colour words). */
export function lookFromPalette(palette, { name = 'Borrowed light', line = 'The colours of another picture.', from = '' } = {}) {
  return { id: 'look-' + Date.now().toString(36), name, line, ramp: palette, keep: .25, grain: .04, bloom: .15, prompt: `the palette and mood of the reference: ${palette.join(', ')}`, mine: true, from };
}
/** A ramp built around one hue: deep shadow to pale light. */
export function rampAround(hex) {
  const [h, s] = hsl(hex), sat = Math.max(.35, s);
  return [fromHsl(h + 8, sat * .7, .1), fromHsl(h + 4, sat * .8, .28), fromHsl(h, sat, .5), fromHsl(h - 6, sat * .8, .74), fromHsl(h - 10, sat * .5, .93)];
}
/** Two looks, mixed. */
export function blendLooks(a, b, t = .5) {
  const ra = a.ramp || rampAround('#888888'), rb = b.ramp || rampAround('#888888');
  const ramp = ra.map((c, i) => mix(c, rb[Math.min(i, rb.length - 1)], t));
  return { id: 'look-' + Date.now().toString(36), name: `${a.name.split(' ')[0]} ${b.name.split(' ').slice(-1)[0]}`, line: `${a.name} crossed with ${b.name}.`, ramp, keep: ((a.keep ?? .2) + (b.keep ?? .2)) / 2, bloom: ((a.bloom || 0) + (b.bloom || 0)) / 2, grain: ((a.grain || 0) + (b.grain || 0)) / 2, vignette: ((a.vignette || 0) + (b.vignette || 0)) / 2, prompt: `${a.prompt}; blended with ${b.prompt}`, mine: true };
}
