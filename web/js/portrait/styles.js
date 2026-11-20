/**
 * The styles: what a portrait can become. Each is a way of painting a person (its words for the studio), a room the
 * whole app wears while it is chosen, and the choices a person can make inside it (mood, palette, details, backdrop,
 * format). Plain data and pure functions only, so tools/styles.mjs can make the example art from the same words the
 * app sends.
 *
 * Style = { id, name, line, room, hero, sitters[], prompt, tune: { mood[], palette[], details[], backdrop[] }, defaults }
 * Choice = { id, label, words, swatch? }
 */

/** @typedef {{ id: string, label: string, words: string, swatch?: string[] }} Choice */
/** @typedef {{ mood: Choice[], palette: Choice[], details: Choice[], backdrop: Choice[] }} Tune */
/** @typedef {{ id: string, name: string, line: string, room: string, hero: string, sitters: string[], prompt: string, tune: Tune, defaults: Picks }} Style */
/** @typedef {{ mood: string, palette: string, details: string[], backdrop: string, likeness: number, format: string, words: string }} Picks */

const KEEP = 'Keep their exact face, features, skin tone, hair texture and expression clearly recognisable as them.';
const CLEAN = 'No text, no lettering, no frame, no watermark.';

/** @type {Style[]} */
export const STYLES = [
  {
    id: 'princess', name: 'Little Princess', line: 'Ribbons, roses and a pearl tiara.', room: 'princess',
    hero: 'sofia', sitters: ['sofia', 'ama', 'kenji'],
    prompt: 'Repaint this person as a storybook royal portrait in the "Little Princess" style: a soft pastel oil painting with delicate visible brushwork, romantic, sweet and refined.',
    tune: {
      mood: [
        { id: 'serene', label: 'Serene', words: 'a calm, gentle smile' },
        { id: 'joyful', label: 'Joyful', words: 'a bright, delighted smile' },
        { id: 'dreamy', label: 'Dreamy', words: 'a faraway, dreamy gaze' },
        { id: 'regal', label: 'Regal', words: 'a poised, regal expression' },
      ],
      palette: [
        { id: 'blush', label: 'Blush', words: 'a blush-pink and rose-gold palette', swatch: ['#f6c9d4', '#e58fa8', '#c79f58'] },
        { id: 'lilac', label: 'Lilac', words: 'a lilac, lavender and silver palette', swatch: ['#e3d5f2', '#b79ad8', '#c9ccd6'] },
        { id: 'peach', label: 'Peach', words: 'a peach, cream and pale gold palette', swatch: ['#fde1cc', '#f6b391', '#e2c27a'] },
        { id: 'rose', label: 'Deep rose', words: 'a deep rose, claret and antique gold palette', swatch: ['#e7a0b4', '#b33f62', '#b08a3e'] },
      ],
      details: [
        { id: 'tiara', label: 'Tiara', words: 'a slender pearl tiara' },
        { id: 'bows', label: 'Ribbon bows', words: 'satin ribbon bows' },
        { id: 'pearls', label: 'Pearls', words: 'a strand of pearls' },
        { id: 'roses', label: 'Roses', words: 'a few garden roses' },
        { id: 'lace', label: 'Lace collar', words: 'a lace collar' },
        { id: 'sleeves', label: 'Puff sleeves', words: 'a gown with puffed sleeves' },
      ],
      backdrop: [
        { id: 'window', label: 'Arched window', words: 'warm light falling through a tall arched window, a soft bokeh of tiny hearts' },
        { id: 'garden', label: 'Rose garden', words: 'a rose garden in golden afternoon light' },
        { id: 'ballroom', label: 'Ballroom', words: 'a candlelit ballroom with crystal chandeliers' },
        { id: 'tea', label: 'Tea salon', words: 'a tea salon with porcelain cups of Earl Grey and pink macarons' },
      ],
    },
    defaults: { mood: 'serene', palette: 'blush', details: ['tiara', 'bows', 'lace'], backdrop: 'window', likeness: .75, format: 'portrait', words: '' },
  },
  {
    id: 'storybook', name: 'Storybook', line: 'Watercolour washes and a pen that wanders.', room: 'storybook',
    hero: 'ingrid', sitters: ['ingrid', 'ama', 'mateus'],
    prompt: 'Repaint this person as an illustration from a gentle picture book: loose transparent watercolour washes that bloom at the edges, a wandering fine ink line, cold-press paper texture showing through, warm and whimsical.',
    tune: {
      mood: [
        { id: 'gentle', label: 'Gentle', words: 'a gentle, kind expression' },
        { id: 'cheerful', label: 'Cheerful', words: 'a cheerful grin' },
        { id: 'wistful', label: 'Wistful', words: 'a wistful, thoughtful look' },
        { id: 'curious', label: 'Curious', words: 'a curious, wide-eyed look' },
      ],
      palette: [
        { id: 'meadow', label: 'Meadow', words: 'a sage, buttercream and dusty-blue palette', swatch: ['#dfe8d3', '#f3e6b8', '#9db7c9'] },
        { id: 'seaside', label: 'Seaside', words: 'a sea-blue, sand and coral palette', swatch: ['#a9cfe0', '#efe1c4', '#ef9a83'] },
        { id: 'autumn', label: 'Autumn', words: 'a russet, mustard and plum palette', swatch: ['#c8693f', '#e2b043', '#7d4a6b'] },
        { id: 'twilight', label: 'Twilight', words: 'an indigo, lavender and lamplight palette', swatch: ['#3e4a86', '#b5a6dc', '#f5d98b'] },
      ],
      details: [
        { id: 'crown', label: 'Flower crown', words: 'a crown of wildflowers' },
        { id: 'bird', label: 'Songbird', words: 'a little songbird on the shoulder' },
        { id: 'scarf', label: 'Knitted scarf', words: 'a hand-knitted scarf' },
        { id: 'stars', label: 'Paper stars', words: 'tiny hand-drawn stars around them' },
        { id: 'book', label: 'Open book', words: 'an open book held close' },
      ],
      backdrop: [
        { id: 'meadow', label: 'Wildflowers', words: 'a meadow of wildflowers' },
        { id: 'cottage', label: 'Cottage window', words: 'a cottage window with a teapot on the sill' },
        { id: 'woods', label: 'Moonlit woods', words: 'moonlit woods with fireflies' },
        { id: 'paper', label: 'Plain paper', words: 'plain white paper, the washes fading out' },
      ],
    },
    defaults: { mood: 'gentle', palette: 'meadow', details: ['stars'], backdrop: 'meadow', likeness: .7, format: 'portrait', words: '' },
  },
  {
    id: 'anime', name: 'Anime', line: 'Clean lines, bright eyes, a sky that goes on forever.', room: 'anime',
    hero: 'noor', sitters: ['noor', 'ama', 'maeve'],
    prompt: 'Repaint this person as a modern anime key-visual character: clean confident line art, crisp cel shading with soft gradients, luminous detailed eyes, glossy highlights in the hair, cinematic.',
    tune: {
      mood: [
        { id: 'bright', label: 'Bright', words: 'a bright, open smile' },
        { id: 'determined', label: 'Determined', words: 'a determined, heroic look' },
        { id: 'shy', label: 'Shy', words: 'a shy, blushing glance' },
        { id: 'mischief', label: 'Mischief', words: 'a mischievous smirk' },
      ],
      palette: [
        { id: 'summer', label: 'Summer sky', words: 'a vivid summer-blue and white palette', swatch: ['#5cb8ff', '#ffffff', '#ffd25a'] },
        { id: 'sunset', label: 'Sunset', words: 'a tangerine, rose and violet sunset palette', swatch: ['#ff9a5a', '#ff5f8f', '#7a5cff'] },
        { id: 'night', label: 'Night city', words: 'a deep navy and neon-teal night palette', swatch: ['#16244a', '#2fd3c5', '#ff4f9a'] },
        { id: 'blossom', label: 'Blossom', words: 'a cherry-blossom pink and spring-green palette', swatch: ['#ffc2d6', '#ff7aa8', '#9fd98b'] },
      ],
      details: [
        { id: 'wind', label: 'Wind in hair', words: 'hair lifted by the wind' },
        { id: 'sparkles', label: 'Sparkles', words: 'light sparkles in the air' },
        { id: 'headphones', label: 'Headphones', words: 'headphones around the neck' },
        { id: 'jacket', label: 'Varsity jacket', words: 'a varsity jacket' },
        { id: 'clips', label: 'Hair clips', words: 'bright hair clips' },
      ],
      backdrop: [
        { id: 'clouds', label: 'Summer clouds', words: 'a vivid summer sky with towering clouds' },
        { id: 'rooftop', label: 'Rooftop dusk', words: 'a city rooftop at dusk' },
        { id: 'station', label: 'Station', words: 'a quiet countryside train station' },
        { id: 'blossoms', label: 'Blossom avenue', words: 'an avenue of falling cherry blossoms' },
      ],
    },
    defaults: { mood: 'bright', palette: 'summer', details: ['wind', 'sparkles'], backdrop: 'clouds', likeness: .7, format: 'portrait', words: '' },
  },
  {
    id: 'oil', name: 'Old Master', line: 'Candlelight, umber shadow and a gilded frame.', room: 'gilded',
    hero: 'mateus', sitters: ['mateus', 'ama', 'priya'],
    prompt: 'Repaint this person as a seventeenth-century Old Master oil portrait: dramatic chiaroscuro from a single window light, rich translucent glazes, luminous skin, subtle canvas texture and gentle craquelure, three-quarter view, dignified.',
    tune: {
      mood: [
        { id: 'dignified', label: 'Dignified', words: 'a dignified, steady gaze' },
        { id: 'thoughtful', label: 'Thoughtful', words: 'a thoughtful, inward look' },
        { id: 'warm', label: 'Warm', words: 'a warm, knowing half-smile' },
        { id: 'mysterious', label: 'Mysterious', words: 'a mysterious, sidelong glance' },
      ],
      palette: [
        { id: 'umber', label: 'Umber', words: 'deep umber and olive shadows with warm ochre light', swatch: ['#3a2414', '#7a5a2e', '#d4a64a'] },
        { id: 'crimson', label: 'Crimson', words: 'crimson velvet and dark walnut tones', swatch: ['#5a1414', '#a32a2a', '#2a1a10'] },
        { id: 'pearl', label: 'Pearl grey', words: 'cool pearl greys and silver light', swatch: ['#d9d6cf', '#8e8a84', '#3e3b38'] },
        { id: 'forest', label: 'Forest', words: 'forest greens and burnished gold', swatch: ['#2b3a24', '#5b6e3a', '#c89b45'] },
      ],
      details: [
        { id: 'collar', label: 'Lace collar', words: 'a white lace collar' },
        { id: 'earring', label: 'Pearl earring', words: 'a single pearl earring' },
        { id: 'velvet', label: 'Velvet', words: 'dark velvet clothing' },
        { id: 'chain', label: 'Gold chain', words: 'a heavy gold chain' },
        { id: 'hat', label: 'Wide hat', words: 'a wide-brimmed black hat' },
      ],
      backdrop: [
        { id: 'dark', label: 'Dark studio', words: 'a dark, atmospheric background' },
        { id: 'curtain', label: 'Draped curtain', words: 'a heavy draped curtain behind' },
        { id: 'window', label: 'Window light', words: 'a leaded window glowing behind' },
        { id: 'landscape', label: 'Landscape', words: 'a distant pastoral landscape at dusk' },
      ],
    },
    defaults: { mood: 'dignified', palette: 'umber', details: ['velvet'], backdrop: 'dark', likeness: .8, format: 'portrait', words: '' },
  },
  {
    id: 'neon', name: 'Neon City', line: 'Rain, chrome and a sign that never sleeps.', room: 'arcade',
    hero: 'kenji', sitters: ['kenji', 'ama', 'noor'],
    prompt: 'Repaint this person as a cyberpunk neon portrait: strong coloured rim light, rain-slick reflections on the skin, subtle holographic accents, cinematic film grain, high contrast.',
    tune: {
      mood: [
        { id: 'cool', label: 'Cool', words: 'a cool, unbothered look' },
        { id: 'fierce', label: 'Fierce', words: 'a fierce, intense stare' },
        { id: 'dreamy', label: 'Dreamy', words: 'a dreamy, half-lidded look' },
        { id: 'playful', label: 'Playful', words: 'a playful grin' },
      ],
      palette: [
        { id: 'magenta', label: 'Magenta & cyan', words: 'magenta and cyan neon light', swatch: ['#ff3fa4', '#35e8ff', '#1a1335'] },
        { id: 'acid', label: 'Acid', words: 'acid green and violet neon light', swatch: ['#b6ff3a', '#8a3bff', '#0d0a1e'] },
        { id: 'ultraviolet', label: 'Ultraviolet', words: 'ultraviolet and electric blue light', swatch: ['#7a3cff', '#3c7bff', '#120b2e'] },
        { id: 'amber', label: 'Amber', words: 'amber and teal sodium-lamp light', swatch: ['#ffb03a', '#1fb5a8', '#1a120a'] },
      ],
      details: [
        { id: 'visor', label: 'Visor', words: 'a translucent tech visor' },
        { id: 'tattoos', label: 'Glow tattoos', words: 'faint glowing circuit tattoos' },
        { id: 'chrome', label: 'Chrome jewellery', words: 'chrome earrings' },
        { id: 'techwear', label: 'Techwear', words: 'a sleek techwear collar' },
        { id: 'rain', label: 'Raindrops', words: 'raindrops catching the light' },
      ],
      backdrop: [
        { id: 'street', label: 'Night street', words: 'a rain-slick night street full of signs, as bokeh' },
        { id: 'rooftop', label: 'Rooftop', words: 'a rooftop above a glowing megacity' },
        { id: 'subway', label: 'Subway', words: 'a tiled subway platform under flickering light' },
        { id: 'data', label: 'Data storm', words: 'streams of holographic light' },
      ],
    },
    defaults: { mood: 'cool', palette: 'magenta', details: ['techwear', 'rain'], backdrop: 'street', likeness: .75, format: 'portrait', words: '' },
  },
  {
    id: 'pop', name: 'Pop Art', line: 'Halftone dots, primaries and one big feeling.', room: 'pop',
    hero: 'maeve', sitters: ['maeve', 'ama', 'kenji'],
    prompt: 'Repaint this person as a 1960s pop-art screenprint portrait: bold black contour lines, flat saturated colour, Ben-Day halftone dots shading the skin, a solid graphic background, punchy comic-book contrast.',
    tune: {
      mood: [
        { id: 'bold', label: 'Bold', words: 'a bold, confident look' },
        { id: 'cheeky', label: 'Cheeky', words: 'a cheeky wink' },
        { id: 'drama', label: 'Drama', words: 'a dramatic, tearful look' },
        { id: 'dreamy', label: 'Dreamy', words: 'a dreamy, lovestruck look' },
      ],
      palette: [
        { id: 'primary', label: 'Primary', words: 'lemon yellow, fire red and cobalt blue', swatch: ['#ffd84a', '#e8202a', '#1f5fff'] },
        { id: 'bubblegum', label: 'Bubblegum', words: 'bubblegum pink, mint and lemon', swatch: ['#ff8ac0', '#7ee0c3', '#fff066'] },
        { id: 'retro', label: 'Retro', words: 'tangerine, teal and cream', swatch: ['#ff8a2a', '#1aa6a6', '#fff1d6'] },
        { id: 'electric', label: 'Electric', words: 'electric violet, lime and hot red', swatch: ['#8a2bff', '#b8ff2a', '#ff2a4a'] },
      ],
      details: [
        { id: 'earrings', label: 'Big earrings', words: 'big hoop earrings' },
        { id: 'shades', label: 'Sunglasses', words: 'sunglasses pushed up on the head' },
        { id: 'bow', label: 'Polka bow', words: 'a polka-dot hair bow' },
        { id: 'burst', label: 'Star burst', words: 'a comic star burst behind the head' },
        { id: 'lips', label: 'Red lips', words: 'glossy red lips' },
      ],
      backdrop: [
        { id: 'flat', label: 'Flat colour', words: 'a flat solid colour field' },
        { id: 'dots', label: 'Halftone', words: 'a big halftone dot field' },
        { id: 'panel', label: 'Comic panel', words: 'a comic-book panel with speed lines' },
        { id: 'stripes', label: 'Stripes', words: 'bold diagonal stripes' },
      ],
    },
    defaults: { mood: 'bold', palette: 'primary', details: ['earrings'], backdrop: 'dots', likeness: .7, format: 'portrait', words: '' },
  },
  {
    id: 'woodblock', name: 'Woodblock', line: 'Indigo, vermilion and the grain of the wood.', room: 'woodblock',
    hero: 'priya', sitters: ['priya', 'ama', 'ingrid'],
    prompt: 'Repaint this person as a traditional Japanese woodblock print portrait: flat areas of colour, fine carved keyblock lines, gentle bokashi gradients, washi paper grain, an elegant composition.',
    tune: {
      mood: [
        { id: 'calm', label: 'Calm', words: 'a calm, composed expression' },
        { id: 'proud', label: 'Proud', words: 'a proud, upright bearing' },
        { id: 'wistful', label: 'Wistful', words: 'a wistful, downcast glance' },
        { id: 'playful', label: 'Playful', words: 'a playful, sidelong smile' },
      ],
      palette: [
        { id: 'indigo', label: 'Indigo', words: 'indigo, vermilion and soft ochre', swatch: ['#1f2a44', '#d2432f', '#e7c98a'] },
        { id: 'spring', label: 'Spring', words: 'pale pink, pine green and sky blue', swatch: ['#f4c7cf', '#3c6b4a', '#8fb8d6'] },
        { id: 'snow', label: 'Snow', words: 'snow white, slate and plum', swatch: ['#f6f3ec', '#55606e', '#7a3a5c'] },
        { id: 'dusk', label: 'Dusk', words: 'persimmon, deep blue and gold', swatch: ['#e66b2e', '#22305e', '#d9a93a'] },
      ],
      details: [
        { id: 'pins', label: 'Hairpins', words: 'lacquered hairpins' },
        { id: 'fan', label: 'Folding fan', words: 'a painted folding fan' },
        { id: 'blossom', label: 'Blossom', words: 'a branch of blossom across the frame' },
        { id: 'crane', label: 'Cranes', words: 'cranes flying in the distance' },
        { id: 'robe', label: 'Patterned robe', words: 'a robe with a bold woven pattern' },
      ],
      backdrop: [
        { id: 'waves', label: 'Waves', words: 'stylised curling waves' },
        { id: 'mountain', label: 'Mountain dawn', words: 'a distant mountain at dawn' },
        { id: 'moon', label: 'Pine and moon', words: 'a pine branch under a full moon' },
        { id: 'sky', label: 'Plain sky', words: 'a plain graded sky' },
      ],
    },
    defaults: { mood: 'calm', palette: 'indigo', details: ['blossom'], backdrop: 'waves', likeness: .7, format: 'portrait', words: '' },
  },
  {
    id: 'clay', name: 'Clay', line: 'Thumbprints, soft light and a little wobble.', room: 'clay',
    hero: 'ama', sitters: ['ama', 'mateus', 'sofia'],
    prompt: 'Recreate this person as a charming handmade claymation figure: soft plasticine textures with faint fingerprints, rounded friendly features, glossy bead-like eyes, hair sculpted in clay strands, warm stop-motion lighting with soft shadows.',
    tune: {
      mood: [
        { id: 'cheerful', label: 'Cheerful', words: 'a big cheerful smile' },
        { id: 'cheeky', label: 'Cheeky', words: 'a cheeky grin' },
        { id: 'sleepy', label: 'Sleepy', words: 'a sleepy, cosy look' },
        { id: 'surprised', label: 'Surprised', words: 'a delighted, surprised face' },
      ],
      palette: [
        { id: 'pastel', label: 'Pastel', words: 'pastel peach, mint and lilac', swatch: ['#ffd3bd', '#bfe8dc', '#d9c8f0'] },
        { id: 'candy', label: 'Candy', words: 'candy pink, lemon and sky blue', swatch: ['#ff9ec4', '#fff07a', '#8fd3ff'] },
        { id: 'earthy', label: 'Earthy', words: 'terracotta, olive and sand', swatch: ['#cf7650', '#8a8f4a', '#e8d6b4'] },
        { id: 'mint', label: 'Mint', words: 'mint, cream and coral', swatch: ['#a9e8d0', '#fff4de', '#ff8a6a'] },
      ],
      details: [
        { id: 'scarf', label: 'Scarf', words: 'a chunky striped scarf' },
        { id: 'beanie', label: 'Beanie', words: 'a knitted beanie' },
        { id: 'glasses', label: 'Round glasses', words: 'round glasses' },
        { id: 'cheeks', label: 'Rosy cheeks', words: 'rosy cheeks' },
        { id: 'flower', label: 'Flower', words: 'a little clay flower tucked behind the ear' },
      ],
      backdrop: [
        { id: 'studio', label: 'Pastel studio', words: 'a seamless pastel studio backdrop' },
        { id: 'town', label: 'Toy town', words: 'a tiny handmade toy town' },
        { id: 'clouds', label: 'Felt clouds', words: 'felt clouds hanging on threads' },
        { id: 'kitchen', label: 'Kitchen table', words: 'a cosy kitchen table with a clay teapot' },
      ],
    },
    defaults: { mood: 'cheerful', palette: 'pastel', details: ['cheeks'], backdrop: 'studio', likeness: .65, format: 'portrait', words: '' },
  },
];

/** The formats a portrait can be painted in. */
export const FORMATS = [
  { id: 'portrait', label: 'Portrait', words: 'Head and shoulders, centred, looking at the viewer, a tall 2:3 portrait.', aspect: 'portrait' },
  { id: 'avatar', label: 'Avatar', words: 'A square avatar: the face large and centred with room around the head, a simple backdrop that reads well in a circle.', aspect: 'square' },
  { id: 'poster', label: 'Wallpaper', words: 'A tall phone-wallpaper composition, half-length, with the backdrop given room.', aspect: 'tall' },
];

export const styleById = (/** @type {string} */ id) => STYLES.find(s => s.id === id) || null;
/** @param {Style} style @returns {Picks} */
export const defaultsOf = style => ({ ...style.defaults, details: [...style.defaults.details] });
const choice = (/** @type {Choice[]} */ list, /** @type {string} */ id) => list.find(c => c.id === id) || null;

/** How like the photograph to keep them, said in words the model follows. @param {number} v 0 (free) to 1 (faithful) */
function likenessWords(v) {
  if (v >= .85) return 'Stay very faithful to the photograph: the same face, proportions and expression, only the painting style changes.';
  if (v >= .6) return KEEP;
  if (v >= .35) return 'Keep them recognisable, but let the style reshape the features freely.';
  return 'Treat the photograph as loose inspiration: a free, stylised interpretation of this person.';
}

/**
 * The words the studio is given for a portrait: the style, then each choice, in plain sentences. The same function
 * makes the example art (tools/styles.mjs), so what the app shows is what it asks for.
 * @param {Style} style @param {Picks} picks
 */
export function promptFor(style, picks) {
  const t = style.tune, out = [style.prompt, likenessWords(picks.likeness ?? .7)];
  const mood = choice(t.mood, picks.mood), palette = choice(t.palette, picks.palette), backdrop = choice(t.backdrop, picks.backdrop);
  const details = (picks.details || []).map(id => choice(t.details, id)).filter(Boolean);
  if (mood) out.push('Expression: ' + mood.words + '.');
  if (palette) out.push('Colour: ' + palette.words + '.');
  if (details.length) out.push('With ' + list(details.map(d => /** @type {Choice} */ (d).words)) + '.');
  if (backdrop) out.push('Behind them: ' + backdrop.words + '.');
  const words = String(picks.words || '').trim();
  if (words) out.push('Also: ' + words.replace(/[.\s]+$/, '') + '.');
  out.push((FORMATS.find(f => f.id === picks.format) || FORMATS[0]).words, CLEAN);
  return out.join(' ');
}
/** A style of one's own: words, a reference picture, or both. @param {string} words @param {boolean} hasRef */
export function ownPrompt(words, hasRef) {
  const said = String(words || '').trim().replace(/[.\s]+$/, '');
  return [
    'Repaint this person as a portrait' + (said ? ' in this style: ' + said + '.' : '.'),
    hasRef ? 'Borrow the painting style, palette, texture and mood of the reference picture, not its subject.' : '',
    KEEP, FORMATS[0].words, CLEAN,
  ].filter(Boolean).join(' ');
}
const list = (/** @type {string[]} */ xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
/** A short caption for what was chosen: "Blush · Tiara, Ribbon bows · Arched window". @param {Style} style @param {Picks} picks */
export function captionOf(style, picks) {
  const t = style.tune;
  return [choice(t.palette, picks.palette)?.label, (picks.details || []).map(id => choice(t.details, id)?.label).filter(Boolean).join(', '), choice(t.backdrop, picks.backdrop)?.label].filter(Boolean).join(' · ');
}
