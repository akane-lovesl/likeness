/**
 * The room maker on the device: a vibe in words (or a picture's palette) becomes a whole room, by reading the words
 * against a small lexicon of moods, places and things. A live studio asks a real model the same question and
 * answers with the same shape (POST /api/rooms), so both kinds of room behave alike.
 */
import { fromHsl, hsl, mix, luminance, ensure, readable } from '../core/color.js';
import { COLOUR_WORDS } from '../studio/painter.js';

const V = (re, o) => [re, o];
const VIBES = [
  V(/princess|fairy ?tale|ballet|ribbon|valentine|romanc|love letter|sweetheart|tea party|rococo|coquette/, { hue: 345, sat: .62, type: 'romance', ornament: 'bow', motifs: ['heart', 'note', 'petal'], weather: 'petals', set: 'boudoir', wipe: 'heart', sound: 'musicbox', frame: 'arch', texture: 'linen', motion: 'float', radius: 5 }),
  V(/neon|arcade|cyber|synth|retro ?wave|vapou?r|80s|eighties|pixel|game/, { dark: true, hue: 320, accent: '#ff3fa4', accent2: '#35e8ff', type: 'pixel', ornament: 'bolt', motifs: ['sparkle', 'bolt'], weather: 'rain', set: 'grid', wipe: 'scan', sound: 'synth', frame: 'glow', texture: 'scanlines', motion: 'crisp', radius: 2 }),
  V(/noir|detective|mystery|crime|1940s|forties|smok|whisk(e)?y/, { dark: true, hue: 0, sat: .05, accent: '#d42b2b', accent2: '#c9b689', type: 'typewriter', ornament: 'drop', motifs: ['drop'], weather: 'rain', set: 'blinds', wipe: 'blinds', sound: 'typewriter', frame: 'square', texture: 'grain-heavy', radius: 0 }),
  V(/garden|green|botanic|plant|forest|moss|fern|cottage|meadow|greenhouse|herb/, { hue: 100, sat: .3, accent: '#c4643c', type: 'modern', ornament: 'leaf', motifs: ['leaf', 'flower'], weather: 'leaves', set: 'glasshouse', wipe: 'leaf', sound: 'wood', frame: 'round', motion: 'float', radius: 4 }),
  V(/sea|beach|ocean|summer|riviera|coast|sail|island|tropic|lemon|amalfi|greek/, { hue: 215, sat: .7, accent: '#ef5a3c', type: 'grotesk', ornament: 'sun', motifs: ['sparkle', 'shell'], weather: 'glints', set: 'awning', wipe: 'wave', sound: 'glass', frame: 'postcard', motion: 'bouncy', radius: 3 }),
  V(/space|galax|cosmic|astro|celestial|night sky|constellation|nebula|planet/, { dark: true, hue: 232, sat: .55, accent: '#e8c26a', accent2: '#8fb3ff', type: 'classical', ornament: 'star', motifs: ['star', 'sparkle'], weather: 'stars', set: 'dome', wipe: 'star', sound: 'glass', frame: 'brass', texture: 'none', radius: 3 }),
  V(/autumn|fall\b|pumpkin|harvest|october|maple|cinnamon/, { hue: 24, sat: .55, type: 'editorial', ornament: 'leaf', motifs: ['leaf'], weather: 'leaves', set: 'window', wipe: 'leaf', sound: 'wood', frame: 'polaroid', radius: 2 }),
  V(/cosy|cozy|cabin|fireplace|hygge|log fire|blanket|hot chocolate/, { dark: true, hue: 22, sat: .45, accent: '#e8893c', type: 'editorial', ornament: 'flame', motifs: ['flame', 'sparkle'], weather: 'embers', set: 'window', wipe: 'ink', sound: 'wood', frame: 'print', radius: 2 }),
  V(/winter|snow|ice|frost|christmas|nordic|alpine|arctic/, { hue: 205, sat: .4, type: 'classical', ornament: 'snowflake', motifs: ['snowflake', 'sparkle'], weather: 'snow', set: 'window', wipe: 'star', sound: 'glass', frame: 'polaroid', radius: 3 }),
  V(/sakura|cherry|japan|kyoto|zen|matcha|tea ceremony|ikebana|wabi/, { hue: 350, sat: .45, accent2: '#6f8f4e', type: 'modern', ornament: 'flower', motifs: ['flower', 'petal'], weather: 'petals', set: 'none', wipe: 'curtain', sound: 'glass', frame: 'square', radius: 1 }),
  V(/goth|vampire|dark academia|candle|raven|victorian|haunted|witch/, { dark: true, hue: 350, sat: .5, accent: '#b3263e', accent2: '#c9a15a', type: 'classical', ornament: 'moon', motifs: ['moon', 'star'], weather: 'fog', set: 'window', wipe: 'curtain', sound: 'glass', frame: 'brass', texture: 'grain-heavy', radius: 1 }),
  V(/candy|pastel|kawaii|cute|bubblegum|sweets|bakery|cake|macaron|sugar/, { hue: 320, sat: .55, accent2: '#5cc8c0', type: 'grotesk', ornament: 'heart', motifs: ['heart', 'sparkle', 'star'], weather: 'confetti', set: 'awning', wipe: 'heart', sound: 'musicbox', frame: 'polaroid', motion: 'bouncy', radius: 5 }),
  V(/desert|sand|dune|terracotta|morocc|sahara|mesa|canyon/, { hue: 22, sat: .5, accent2: '#3f7f8f', type: 'modern', ornament: 'sun', motifs: ['sun', 'sparkle'], weather: 'motes', set: 'window', wipe: 'curtain', sound: 'wood', frame: 'round', radius: 3 }),
  V(/library|book|scholar|study|academi|antique|letter|parchment|ink|poet/, { hue: 34, sat: .35, type: 'typewriter', ornament: 'feather', motifs: ['feather', 'sparkle'], weather: 'motes', set: 'window', wipe: 'ink', sound: 'typewriter', frame: 'print', radius: 1 }),
  V(/fire|ember|volcano|lava|forge|dragon|inferno/, { dark: true, hue: 12, sat: .7, accent: '#ff6a2b', accent2: '#ffc04a', type: 'classical', ornament: 'flame', motifs: ['flame'], weather: 'embers', set: 'none', wipe: 'ink', sound: 'synth', frame: 'glow', radius: 2 }),
  V(/underwater|mermaid|aquarium|coral|deep sea|lagoon|jellyfish/, { dark: true, hue: 190, sat: .6, accent: '#ff8c7a', accent2: '#5fe0d0', type: 'modern', ornament: 'shell', motifs: ['bubble', 'shell'], weather: 'bubbles', set: 'none', wipe: 'wave', sound: 'glass', frame: 'round', motion: 'float', radius: 5 }),
  V(/party|celebrat|birthday|disco|festival|carnival|fiesta/, { hue: 280, sat: .6, accent: '#ff4f8b', accent2: '#ffc93c', type: 'grotesk', ornament: 'sparkle', motifs: ['confetti', 'star', 'sparkle'], weather: 'confetti', set: 'none', wipe: 'star', sound: 'synth', frame: 'polaroid', motion: 'bouncy', radius: 4 }),
  V(/royal|gold|baroque|palace|regal|queen|king|versailles|opera/, { hue: 345, sat: .55, accent: '#8e1f3a', accent2: '#c9a15a', type: 'classical', ornament: 'crown', motifs: ['crown', 'sparkle'], weather: 'glints', set: 'boudoir', wipe: 'curtain', sound: 'musicbox', frame: 'brass', radius: 2 }),
  V(/storm|thunder|lightning|tempest/, { dark: true, hue: 220, sat: .2, accent: '#ffd43b', type: 'grotesk', ornament: 'bolt', motifs: ['bolt', 'drop'], weather: 'rain', set: 'none', wipe: 'blinds', sound: 'synth', frame: 'square', radius: 1 }),
  V(/firefl|summer night|campfire|lantern|midsummer/, { dark: true, hue: 160, sat: .35, accent: '#f2d16b', type: 'modern', ornament: 'sparkle', motifs: ['sparkle', 'leaf'], weather: 'fireflies', set: 'glasshouse', wipe: 'leaf', sound: 'glass', frame: 'round', radius: 4 }),
  V(/rain|melanchol|blue|sad|grey|gray|overcast|drizzle/, { hue: 212, sat: .2, type: 'editorial', ornament: 'drop', motifs: ['drop'], weather: 'drizzle', set: 'window', wipe: 'ink', sound: 'glass', frame: 'print', radius: 2 }),
  V(/coffee|caf[eé]|espresso|bistro|paris|jazz/, { hue: 28, sat: .4, accent: '#b5523b', type: 'editorial', ornament: 'notes', motifs: ['notes', 'note'], weather: 'notes', set: 'awning', wipe: 'curtain', sound: 'wood', frame: 'postcard', radius: 2 }),
  V(/music|piano|melody|song|vinyl|orchestra/, { hue: 260, sat: .35, type: 'editorial', ornament: 'notes', motifs: ['notes', 'note'], weather: 'notes', set: 'none', wipe: 'ink', sound: 'musicbox', frame: 'print', radius: 2 }),
];
/** @type {[RegExp, string][]} */
const WEATHER_WORDS = [[/rain|storm|drizzle/, 'rain'], [/snow|winter|blizzard/, 'snow'], [/petal|blossom|sakura/, 'petals'], [/firefl/, 'fireflies'], [/star|night sky/, 'stars'], [/fog|mist/, 'fog'], [/bubble/, 'bubbles'], [/confetti/, 'confetti'], [/ember|fire/, 'embers'], [/leaf|leaves|autumn/, 'leaves'], [/heart|love/, 'hearts'], [/music|melod|song/, 'notes']];

const hash = s => [...s].reduce((a, c) => (Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
const title = s => s.replace(/[^\p{L}\p{N}\s'’-]/gu, ' ').trim().split(/\s+/).slice(0, 3).map(w => w[0].toUpperCase() + w.slice(1)).join(' ') || 'Untitled Room';

/** A full set of room colours around a hue. */
export function coloursFor({ hue, sat = .45, dark = false, accent = null, accent2 = null }) {
  const s = Math.max(.04, Math.min(1, sat));
  const c = dark
    ? { ground: fromHsl(hue, s * .55, .07), ground2: fromHsl(hue + 18, s * .6, .15), surface: fromHsl(hue, s * .45, .12), ink: fromHsl(hue, .25, .93), soft: fromHsl(hue, .18, .68), accent: accent || fromHsl(hue + 8, Math.max(.6, s), .62), accent2: accent2 || fromHsl(hue + 150, .6, .7) }
    : { ground: fromHsl(hue, s * .55, .94), ground2: fromHsl(hue + 10, s * .6, .86), surface: fromHsl(hue, s * .5, .985), ink: fromHsl(hue, Math.min(.5, s), .2), soft: fromHsl(hue, s * .35, .45), accent: accent || fromHsl(hue + 4, Math.max(.55, s), .55), accent2: accent2 || fromHsl(hue + 40, .5, .5) };
  c.ink = ensure(c.ink, c.surface, 7); c.soft = ensure(c.soft, c.surface, 3.4); c.onAccent = readable(c.accent, '#16110e', '#fffaf5');
  return c;
}

const VOICE = name => ({
  hello: { morning: `Morning. Welcome to ${name}.`, afternoon: `Afternoon in ${name}. What shall we make?`, evening: `Evening in ${name}.`, night: `${name}, after dark.` },
  placeholder: 'Ask for anything', send: 'Send',
  stages: { read: 'Looking closely', plan: 'Thinking it through', draw: 'Painting', finish: 'Finishing' },
  done: ['Here it is.', 'Fresh.', 'What do you think?'],
});

/** A room from words. */
export function roomFromWords(text) {
  const low = text.toLowerCase(), hits = VIBES.filter(([re]) => re.test(low)).map(([, o]) => o);
  const base = { hue: hash(low) % 360, sat: .45, type: 'editorial', ornament: 'sparkle', motifs: ['sparkle'], weather: 'motes', set: 'none', wipe: 'ink', sound: 'wood', frame: 'print', texture: 'grain', motion: 'calm', radius: 2 };
  const o = Object.assign(base, ...hits.slice().reverse());
  const named = Object.entries(COLOUR_WORDS).find(([w]) => new RegExp('\\b' + w + '\\b').test(low));
  if (named) { const [h, s] = hsl(named[1]); o.hue = h; o.sat = Math.max(.25, s); if (!hits.length || /black|navy|midnight/.test(named[0])) o.dark = o.dark ?? luminance(named[1]) < .08; }
  if (/\b(dark|night|midnight|moody)\b/.test(low)) o.dark = true;
  if (/\b(light|bright|airy|sunny|white)\b/.test(low)) o.dark = false;
  const w = WEATHER_WORDS.find(([re]) => re.test(low)); if (w) o.weather = w[1];
  const name = title(text);
  return { id: 'room-' + Date.now().toString(36), name, line: `A room made from “${text.trim().slice(0, 80)}”.`, dark: !!o.dark, colors: coloursFor(o), type: o.type, frame: o.frame, ornament: o.ornament, motifs: o.motifs, set: o.set, texture: o.texture || 'grain', sky: { weather: o.weather, light: o.dark ? 'night' : 'auto' }, wipe: o.wipe, sound: o.sound, motion: o.motion || 'calm', radius: o.radius ?? 2, voice: VOICE(name), mine: true, made: 'device' };
}

/** A room from a picture's palette (darkest first). */
export function roomFromPalette(palette, name = 'From a picture') {
  const lum = palette.map(luminance), mid = lum[Math.floor(lum.length / 2)], dark = mid < .18;
  const bySat = [...palette].sort((a, b) => hsl(b)[1] - hsl(a)[1]), [hue, sat] = hsl(bySat[0]);
  const vibe = hue > 300 || hue < 20 ? VIBES[0][1] : hue < 70 ? VIBES[6][1] : hue < 170 ? VIBES[3][1] : hue < 260 ? VIBES[4][1] : VIBES[5][1];
  const colors = coloursFor({ hue, sat, dark, accent: bySat[0], accent2: bySat[1] });
  colors.ground = dark ? mix(palette[0], '#000000', .35) : mix(palette[palette.length - 1], '#ffffff', .55);
  colors.ground2 = dark ? palette[1] : mix(palette[palette.length - 2], '#ffffff', .5);
  return { ...roomFromWords(''), id: 'room-' + Date.now().toString(36), name, line: 'A room in the colours of a picture.', dark, colors, type: vibe.type, frame: vibe.frame, ornament: vibe.ornament, motifs: vibe.motifs, set: vibe.set, sky: { weather: vibe.weather, light: dark ? 'night' : 'auto' }, wipe: vibe.wipe, sound: vibe.sound, voice: VOICE(name), mine: true, made: 'device' };
}

/** Backdrop ideas, for the backdrop studio: places, each with words the painter (or the model) can use. */
const PLACES = [
  { name: 'Rain on the tram window', words: 'city street at night in the rain, seen through a window', near: .7, dream: .2, rooms: ['noir', 'arcade'] },
  { name: 'Rose garden, late light', words: 'rose garden with flowers at sunset', near: .5, dream: .4, rooms: ['princess', 'greenhouse'] },
  { name: 'Lantern night market', words: 'night city street market with lanterns', near: .6, dream: .3, rooms: ['arcade'] },
  { name: 'Seaside promenade', words: 'sea and beach on a bright morning with a boat', near: .3, dream: .1, rooms: ['riviera'] },
  { name: 'Alpine morning', words: 'mountains at dawn', near: .1, dream: .2, rooms: ['atelier'] },
  { name: 'Library window seat', words: 'library room interior by the window in the afternoon', near: .9, dream: .2, rooms: ['atelier', 'noir'] },
  { name: 'Moonlit lake', words: 'lake under the moon at night with stars', near: .2, dream: .6, rooms: ['observatory'] },
  { name: 'Glasshouse in the mist', words: 'forest garden at dawn', near: .6, dream: .4, rooms: ['greenhouse'] },
  { name: 'Snowy village', words: 'village house in the snow at dusk', near: .4, dream: .4, rooms: ['atelier'] },
  { name: 'Castle on the hill', words: 'castle on a hill at sunset with flowers', near: .2, dream: .9, rooms: ['princess', 'observatory'] },
  { name: 'Cherry blossom avenue', words: 'trees with cherry blossom petals on a spring day', near: .4, dream: .5, rooms: ['princess', 'greenhouse'] },
  { name: 'Tea room', words: 'tea room interior with a teacup, golden light', near: .95, dream: .3, rooms: ['princess', 'atelier'] },
  { name: 'Lighthouse at dusk', words: 'lighthouse by the sea at dusk', near: .2, dream: .5, rooms: ['riviera', 'observatory'] },
  { name: 'Balloon morning', words: 'hot air balloons over hills at dawn', near: .15, dream: .8, rooms: ['riviera', 'princess'] },
  { name: 'Neon alley', words: 'neon city alley at night in the rain', near: .7, dream: .4, rooms: ['arcade', 'noir'] },
  { name: 'Painted studio backdrop', words: 'old master painted canvas backdrop', near: 1, dream: .3, rooms: ['atelier'], studio: true },
];
/** @returns {{ id: string, name: string, words: string, studio?: boolean }[]} */
export function suggestPlaces({ text = '', room = null, near = .5, dream = .4, count = 6, seed = 1 }) {
  const out = [];
  if (text.trim()) { out.push({ id: 'say-0', name: title(text), words: text }); for (const t of ['at dawn', 'at dusk', 'at night']) out.push({ id: 'say-' + t, name: title(text) + ' ' + t.replace('at ', '· '), words: text + ' ' + t }); }
  const score = p => Math.abs(p.near - near) * 1.2 + Math.abs(p.dream - dream) - (room && p.rooms.includes(room.id) ? .45 : 0) + ((hash(p.name) + seed) % 7) / 40;
  for (const p of [...PLACES].sort((a, b) => score(a) - score(b))) { if (out.length >= count) break; out.push({ id: 'pl-' + hash(p.name).toString(36), name: p.name, words: p.words, studio: p.studio }); }
  return out.slice(0, count);
}
