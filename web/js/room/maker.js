/**
 * The room maker on the device. A sentence such as "my grandmother's sunny kitchen in Lisbon" becomes a whole room.
 * The words are read against a lexicon of places, settings, styles, things, people, seasons, weathers, times of day and
 * moods. Each cue found brings colours, a few words for the room's line, and votes for type, frame, ornaments, set,
 * texture, sky, sound, motion and the voice the room talks in. The votes are counted, the colours composed so that ink
 * always reads, and the name is taken from the sentence itself. A take number settles the close calls another way, so
 * "Another take" is a new room from the same words. A workstation studio answers the same question with a real model
 * (POST /api/rooms), in the same shape.
 */
import { fromHsl, hsl, mix, luminance, ensure, readable } from '../core/color.js';

const hash = (/** @type {string} */ s) => [...s].reduce((a, c) => (Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
/** @param {number} seed */
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Lower case without accents, one character for each character, so positions still point into the words as typed. */
const fold = (/** @type {string} */ s) => s.split('').map(ch => { const f = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); return f.length === 1 ? f : ' '; }).join('').replace(/[’‘]/g, "'");

/**
 * @typedef {{ kind: string, re: RegExp, c: string[], id?: string, dark?: number, muted?: number, vivid?: number,
 *   type?: string, frame?: string, orn?: string[], set?: string, tex?: string, sky?: string, light?: string,
 *   sound?: string, motion?: string, wipe?: string, radius?: number, bits?: string[], voice?: string, vp?: number, soft?: boolean }} Cue
 * @typedef {{ cue: Cue, at: number, end: number, word: string, w: number }} Hit
 * @typedef {{ hex: string, w: number, firm?: boolean }} Anchor
 */
/** @param {string} kind @param {string} words @param {string[]} c @param {Partial<Cue>} [o] @returns {Cue} */
const cue = (kind, words, c, o = {}) => ({ ...o, kind, re: new RegExp('\\b(?:' + words + ')', 'g'), c });

/** How much each kind of cue weighs in the colours and the votes, and how strongly it claims the room's voice. */
/** @type {Record<string, { w: number, voice: number }>} */
const KIND = {
  colour: { w: 2.2, voice: 0 }, venue: { w: 1.4, voice: 4 }, place: { w: 1.3, voice: 2 }, era: { w: 1.4, voice: 3 }, who: { w: 1.1, voice: 5 },
  thing: { w: 1, voice: 1.5 }, season: { w: .9, voice: 1 }, weather: { w: .7, voice: .3 }, time: { w: .6, voice: 0 }, mood: { w: .6, voice: .5 },
};

const CUES = [
  // Somewhere in the world
  cue('place', 'lisbon|lisboa|porto\\b|portug|alfama|fado\\b', ['#2b5fa6', '#f2c14e', '#efe6d6', '#c8553d'], { type: 'editorial', frame: 'postcard', orn: ['sun', 'wave'], sound: 'glass', bits: ['blue tiles', 'a yellow tram on the hill', 'washing strung across the alley'], voice: 'city' }),
  cue('place', 'paris|parisian|montmartre|seine\\b|france\\b', ['#2d3a5c', '#e8d9c0', '#c2364b', '#7a8f6a'], { type: 'editorial', set: 'awning', frame: 'postcard', orn: ['sparkle', 'notes'], sound: 'wood', bits: ['zinc rooftops', 'a striped café awning', 'an accordion two streets away'], voice: 'city' }),
  cue('place', 'tokyo|shibuya|shinjuku|akihabara|harajuku|osaka', ['#ff3f8e', '#3ff0ff', '#14121a', '#ffd23f'], { dark: 1, type: 'grotesk', frame: 'glow', orn: ['bolt', 'sparkle'], sound: 'synth', motion: 'crisp', bits: ['signs stacked six storeys high', 'a vending machine glowing in the rain', 'the last train home'], voice: 'neon' }),
  cue('place', 'kyoto|nara\\b|japan|ryokan|torii|shoji', ['#d0402b', '#6f8f4e', '#f2ead8', '#2b2b2b'], { type: 'modern', frame: 'square', set: 'none', wipe: 'curtain', sound: 'glass', orn: ['flower', 'petal'], radius: 1, bits: ['paper screens', 'moss on old stone', 'a temple bell, far off'], voice: 'zen' }),
  cue('place', 'seoul|korea|hanok|busan', ['#e84a5f', '#2a3f6b', '#f7f3ea', '#3fb8af'], { type: 'grotesk', orn: ['sparkle', 'heart'], bits: ['a corner shop lit at 2 a.m.', 'hanok roof tiles', 'a karaoke sign blinking'], voice: 'city' }),
  cue('place', 'hong kong|kowloon|shanghai|taipei|macau|chinatown', ['#e63946', '#f1c453', '#1d3557', '#0e1116'], { dark: 1, type: 'grotesk', frame: 'glow', orn: ['sparkle', 'star'], bits: ['neon over the harbour', 'steam from the dumpling baskets', 'trams in the rain'], voice: 'neon' }),
  cue('place', 'new york|nyc\\b|manhattan|brooklyn|harlem', ['#f6c90e', '#2e2e2e', '#b5523b', '#e8e1d5'], { type: 'grotesk', set: 'window', orn: ['star', 'sparkle'], bits: ['fire escapes', 'a yellow cab', 'steam rising from the street'], voice: 'city' }),
  cue('place', 'london|soho\\b|camden|thames|england', ['#c8102e', '#1f2a44', '#8a8f98', '#e9e4da'], { type: 'editorial', sky: 'drizzle', orn: ['teacup', 'drop'], bits: ['a red bus in the drizzle', 'chimney pots', 'a kettle on somewhere'], voice: 'city' }),
  cue('place', 'venice|venetian|gondola|murano', ['#2f7e79', '#d9a05b', '#8e2c3a', '#efe3cf'], { type: 'classical', frame: 'arch', sky: 'glints', orn: ['wave', 'gem'], bits: ['green water lapping at the steps', 'a gondolier singing', 'peeling ochre walls'], voice: 'city' }),
  cue('place', 'rome\\b|roman\\b|florence|italy|italian|napoli|naples|milan', ['#c8693b', '#2a6f97', '#f3e3c3', '#6b8e23'], { type: 'editorial', set: 'awning', frame: 'postcard', orn: ['sun', 'flower'], bits: ['ochre walls', 'a scooter in the alley', 'a fountain on the corner'], voice: 'city' }),
  cue('place', 'tuscan|chianti|cypress', ['#c58b4c', '#6b7f3a', '#a44a3f', '#f1e4c8'], { light: 'golden', orn: ['sun', 'leaf'], bits: ['cypress rows', 'a stone farmhouse', 'long gold afternoons'], voice: 'kitchen' }),
  cue('place', 'amalfi|positano|capri\\b|sorrento|limoncello|sicil', ['#1e6fb8', '#f3d23a', '#f8f1e2', '#3a8d5c'], { type: 'grotesk', set: 'awning', frame: 'postcard', sky: 'glints', orn: ['sun', 'shell'], motion: 'bouncy', bits: ['lemons as big as fists', 'majolica tiles', 'a cobalt sea below'], voice: 'sea' }),
  cue('place', 'greece|greek|santorini|mykonos|aegean|cyclad|athens', ['#1d4fa0', '#f7f7f2', '#3d8fd1', '#e2725b'], { type: 'grotesk', set: 'awning', frame: 'postcard', sky: 'glints', orn: ['sun', 'wave'], bits: ['whitewash and blue domes', 'bougainvillea over the wall', 'an old olive tree'], voice: 'sea' }),
  cue('place', 'morocc|marrakech|marrakesh|fez\\b|fes\\b|souk|medina|riad\\b|casablanca|tangier', ['#c4572e', '#e8a33d', '#3550d8', '#2f6b4f'], { frame: 'arch', orn: ['star', 'gem'], sky: 'motes', sound: 'wood', bits: ['brass lanterns', 'saffron and indigo', 'a tiled courtyard fountain'], voice: 'city' }),
  cue('place', 'day of the dead|dia de (?:los )?muertos|mexic|oaxaca|cdmx|cantina', ['#e4007c', '#ff8c00', '#00a19a', '#f5e050'], { orn: ['flower', 'sun'], sky: 'confetti', sound: 'wood', motion: 'bouncy', bits: ['papel picado', 'marigolds', 'a pink wall in hard sun'], voice: 'party' }),
  cue('place', 'puerto rico|havana|cuba|caribbean|jamaica|barbados|trinidad', ['#3fb8af', '#f28c8c', '#f7d154', '#2a4d69'], { sound: 'wood', orn: ['sun', 'notes'], motion: 'bouncy', bits: ['pastel cars', 'a band through an open window', 'salt air'], voice: 'tropical' }),
  cue('place', 'india\\b|indian\\b|jaipur|mumbai|delhi|rajasthan|kerala|goa\\b|varanasi', ['#e85d75', '#f4a300', '#1b6ca8', '#2e8b57'], { frame: 'arch', orn: ['flower', 'sun'], sky: 'petals', bits: ['marigold garlands', 'a pink sandstone arch', 'chai on the step'], voice: 'city' }),
  cue('place', 'istanbul|turkish|ottoman|bosphorus|anatolia|cappadocia', ['#1f5fa0', '#c0392b', '#f2e6c8', '#2a9d8f'], { frame: 'arch', orn: ['gem', 'star'], bits: ['Iznik tiles', 'tea in tulip glasses', 'gulls over the water'], voice: 'city' }),
  cue('place', 'egypt|cairo|nile\\b|pharaoh|pyramid|luxor', ['#d9a441', '#26619c', '#e9d7b5', '#b5523b'], { type: 'classical', frame: 'arch', sky: 'motes', orn: ['sun', 'gem'], bits: ['sandstone and lapis', 'the river at evening', 'hieroglyphs in warm stone'], voice: 'desert' }),
  cue('place', 'iceland|reykjav|norw|swed|finland|finnish|denmark|danish|scandinav|nordic|fjord|lapland|copenhagen|stockholm|oslo\\b|helsinki', ['#2f4858', '#e8eef0', '#86a5b5', '#d1495b'], { type: 'modern', frame: 'square', radius: 1.5, orn: ['snowflake', 'star'], bits: ['black sand', 'a red cabin by the water', 'the long blue hour'], voice: 'winter' }),
  cue('place', 'scotland|scottish|highland|ireland|irish|wales\\b|welsh|moorland|moors?\\b|loch\\b|heather|edinburgh|dublin', ['#5b6b3a', '#7a5c8a', '#3e4a59', '#d8cdb8'], { type: 'editorial', sky: 'fog', orn: ['leaf', 'feather'], bits: ['heather on the moor', 'a peat fire', 'mist on the loch'], voice: 'cabin' }),
  cue('place', 'provence|provencal|lavender', ['#8e7cc3', '#f4e1a1', '#6b8e5a', '#f7f2e8'], { light: 'golden', sky: 'motes', orn: ['flower', 'sun'], bits: ['lavender to the horizon', 'cicadas', 'a blue shutter'], voice: 'garden' }),
  cue('place', 'palm trees?|bali\\b|thai|vietnam|tropic|jungle|rainforest', ['#1f7a4d', '#f2b134', '#e85d3f', '#0b3d2e'], { set: 'glasshouse', orn: ['leaf', 'flower'], sky: 'leaves', bits: ['banana leaves', 'frangipani on the step', 'warm rain'], voice: 'tropical' }),
  cue('place', 'hawaii|tiki|aloha|surf\\b|surfing|surfer|luau|polynesia', ['#ff6f59', '#2ec4b6', '#ffd166', '#2b2d42'], { frame: 'postcard', sky: 'glints', orn: ['flower', 'wave'], motion: 'bouncy', bits: ['hibiscus print', 'a surf shack', 'trade winds'], voice: 'tropical' }),
  cue('place', 'los angeles|palm springs|san francisco|venice beach|california|hollywood|malibu', ['#f7a072', '#5bc0be', '#fef6e4', '#e07a5f'], { frame: 'polaroid', sky: 'glints', orn: ['sun', 'star'], bits: ['a pool you could dive into', 'palm shadows on pink stucco', 'the freeway hum'], voice: 'city' }),
  cue('place', 'wild west|new mexico|texas|western|cowboy|cowgirl|ranch|rodeo|saloon|prairie|frontier|arizona|nevada', ['#b5651d', '#e3c08d', '#6b3e26', '#2e5266'], { type: 'typewriter', frame: 'print', tex: 'grain-heavy', sky: 'motes', orn: ['star', 'sun'], sound: 'wood', bits: ['dust and denim', 'a screen door banging', 'the big sky'], voice: 'western' }),
  cue('place', 'swiss|switzerland|alps\\b|alpine|tyrol|austria\\b|bavaria', ['#d7263d', '#f5f5f0', '#2f5d50', '#87a8c4'], { type: 'modern', frame: 'polaroid', orn: ['snowflake', 'star'], bits: ['a chalet balcony', 'cowbells on the slope', 'snow on the peaks'], voice: 'mountain' }),
  cue('place', 'brazil|rio\\b|copacabana|samba|bossa', ['#009c3b', '#ffdf00', '#002776', '#f07b3f'], { sound: 'wood', motion: 'bouncy', sky: 'glints', orn: ['sun', 'notes'], bits: ['a wave-patterned promenade', 'bossa nova on a radio', 'a green hill over the bay'], voice: 'party' }),
  cue('place', 'warehouse party|berlin|techno|raves?\\b', ['#0b0b0b', '#e5e5e5', '#ff2e63', '#08d9d6'], { dark: 2, type: 'grotesk', frame: 'square', radius: 0, tex: 'grain-heavy', sound: 'synth', motion: 'crisp', sky: 'sparkles', wipe: 'scan', orn: ['bolt', 'asterisk'], bits: ['concrete and strobe', 'a queue round the block', 'bass through the floor'], voice: 'party' }),
  cue('place', 'vienna|viennese|prague|budapest|habsburg|salzburg', ['#8b1e3f', '#d4af37', '#f3e9dc', '#2f4f4f'], { type: 'classical', frame: 'brass', sound: 'musicbox', orn: ['notes', 'crown'], bits: ['marble café tables', 'a waltz upstairs', 'gilt on everything'], voice: 'cafe' }),
  cue('place', 'outback|australia|sydney|melbourne', ['#c1440e', '#e9b872', '#3d5a80', '#f2efe6'], { orn: ['sun', 'star'], bits: ['red earth', 'a tin roof ticking in the heat', 'a sky too big for one day'], voice: 'desert' }),
  cue('place', 'safari|savann|serengeti|kenya|acacia|baobab', ['#d4a24c', '#7a5230', '#5b7f3a', '#f2e3c6'], { light: 'golden', sky: 'motes', orn: ['sun', 'leaf'], bits: ['acacia shade', 'a canvas tent', 'heat shimmer on the plain'], voice: 'desert' }),
  cue('place', 'new orleans|mardi gras|bayou|louisiana', ['#5b2a86', '#f1c40f', '#1e8449', '#f6e7d7'], { dark: 1, sound: 'wood', sky: 'confetti', orn: ['notes', 'gem'], bits: ['iron balconies', 'a brass band on the corner', 'moss hanging from the oaks'], voice: 'jazz' }),
  cue('place', 'key west|palm beach|miami', ['#f7a8b8', '#55c1c4', '#fff4e0', '#ffcf56'], { type: 'grotesk', frame: 'postcard', sky: 'glints', orn: ['sun', 'wave'], motion: 'bouncy', bits: ['pastel hotels', 'neon at the beach', 'a convertible with the top down'], voice: 'tropical' }),
  cue('place', 'mediterran|riviera|cote d.azur|monaco|cannes', ['#2f6fdc', '#f8f3e7', '#ef5a3c', '#f2c14e'], { type: 'grotesk', set: 'awning', frame: 'postcard', sky: 'glints', orn: ['sun', 'shell'], motion: 'bouncy', bits: ['striped awnings', 'lemon ice', 'a cobalt sea'], voice: 'sea' }),

  // Settings: what kind of place it is
  cue('venue', 'kitchen|cook|stove|recipe|pantry|larder|scullery', ['#f4e3c3', '#c8553d', '#e9b44c', '#5a7d5a'], { set: 'window', tex: 'linen', frame: 'scallop', orn: ['teacup', 'heart'], sound: 'wood', radius: 3, bits: ['something on the stove', 'flour on the counter', 'a radio in the corner'], voice: 'kitchen' }),
  cue('venue', 'baker|patisserie|boulangerie|croissant|pastr|bread\\b|loaf|cinnamon|buns?\\b', ['#f6e0c4', '#d98e73', '#8a5a44', '#f2c6c2'], { tex: 'linen', frame: 'scallop', orn: ['heart', 'sparkle'], sound: 'musicbox', radius: 4, bits: ['bread still warm', 'sugar in the air', 'a bell over the door'], voice: 'bakery' }),
  cue('venue', 'cafe|coffee|espresso|latte|cappuccino|barista|bistro|brasserie', ['#6f4e37', '#e8d5b7', '#c9a227', '#2f3e46'], { type: 'editorial', set: 'awning', frame: 'postcard', orn: ['teacup', 'notes'], sound: 'wood', bits: ['a hissing espresso machine', 'a chalkboard menu', 'steam on the window'], voice: 'cafe' }),
  cue('venue', 'afternoon tea|tea room|tea house|tea party|high tea|earl grey|teapot|teacup|tearoom|teahouse|teas?\\b|chai\\b', ['#c9a0a0', '#f4ece1', '#7d9d7a', '#b58b4c'], { tex: 'linen', frame: 'scallop', orn: ['teacup', 'flower'], sound: 'musicbox', bits: ['bone china', 'a tiered cake stand', 'steam from the spout'], voice: 'tearoom' }),
  cue('venue', 'green tea|tea ceremony|matcha|sencha|hojicha', ['#7aa95c', '#e9f0d8', '#4b5d3a', '#c2a878'], { type: 'modern', frame: 'square', orn: ['leaf', 'teacup'], radius: 1, bits: ['a bamboo whisk', 'a green so bright it hums', 'a low table'], voice: 'zen' }),
  cue('venue', 'bars?\\b|pubs?\\b|tavern|speakeasy|cocktail|martini|lounge|inn\\b', ['#7b2d26', '#d4a373', '#1a1414', '#2a9d8f'], { dark: 2, frame: 'brass', orn: ['gem', 'sparkle'], sound: 'glass', bits: ['amber glasses', 'a low lamp on every table', 'ice in a shaker'], voice: 'bar' }),
  cue('venue', 'supper club|jazz|blues\\b|saxophon|sax\\b|trumpet|swing\\b|bebop|nightclub|club\\b|crooner', ['#1b2a4a', '#d4a017', '#8c1c13', '#f0e6d2'], { dark: 2, type: 'modern', frame: 'print', sky: 'notes', orn: ['notes', 'note'], sound: 'wood', bits: ['a saxophone in the smoke', 'brushes on a snare', 'a red-shaded lamp'], voice: 'jazz', vp: 4.5 }),
  cue('venue', 'soda fountain|drive-in|diners?\\b|milkshake|burger|luncheonette', ['#d62828', '#f1faee', '#48cae4', '#f4a261'], { type: 'grotesk', frame: 'polaroid', tex: 'stripes', orn: ['star', 'sparkle'], motion: 'bouncy', bits: ['a chrome counter', 'pie under a glass dome', 'a jukebox in the corner'], voice: 'diner' }),
  cue('venue', 'reading room|librar|bookshop|bookstore|bookshel|bookcase|books?\\b|archive|manuscript|scriptori', ['#4a3728', '#e9dcc3', '#2f4f3f', '#a9744f'], { type: 'editorial', set: 'window', frame: 'print', sound: 'typewriter', sky: 'motes', orn: ['feather', 'star'], bits: ['spines in the lamplight', 'a ladder on rails', 'dust turning in the light'], voice: 'library' }),
  cue('venue', 'attic|garret|loft\\b', ['#c2a27c', '#5a4636', '#efe4cf', '#8aa1b1'], { set: 'window', tex: 'grain-heavy', sky: 'motes', orn: ['key', 'feather'], bits: ['trunks of old letters', 'a round window', 'dust in the light'], voice: 'library' }),
  cue('venue', 'log fire|wood ?stove|cabin|lodge|fireplace|hearth|hut\\b|bothy|chalet', ['#6b3e26', '#e3b04b', '#2f4f3f', '#f2e8d5'], { dark: 2, set: 'window', tex: 'linen', frame: 'print', sky: 'embers', orn: ['flame', 'leaf'], sound: 'wood', bits: ['a crackling stove', 'wool socks drying', 'pines outside'], voice: 'cabin' }),
  cue('venue', 'garden|greenhouse|glasshouse|conservatory|botanic|orchard|grove\\b|allotment|herbs?\\b|potting|plants?\\b|houseplant', ['#6f8f4e', '#eef1e5', '#c4643c', '#f2c6d6'], { id: 'garden', set: 'glasshouse', frame: 'round', sky: 'leaves', orn: ['leaf', 'flower'], sound: 'wood', motion: 'float', radius: 4, bits: ['things quietly growing', 'terracotta pots', 'a hose left running'], voice: 'garden' }),
  cue('venue', 'sand ?castle|beach|seaside|shore\\b|coast|pier\\b|boardwalk|lido\\b', ['#3d8fd1', '#f4e3c1', '#ef5a3c', '#fffaf0'], { type: 'grotesk', set: 'awning', frame: 'postcard', sky: 'glints', orn: ['shell', 'sun'], sound: 'glass', motion: 'bouncy', radius: 3, bits: ['striped towels', 'salt on your lips', 'gulls arguing'], voice: 'sea' }),
  cue('venue', 'seas?\\b|ocean|sail|harbou?r|marina|lighthouse|nautical|boat|ships?\\b|yacht|port\\b|docks?\\b|fisherm|tides?\\b', ['#16324f', '#f2efe9', '#c0392b', '#3d8fd1'], { id: 'sea', type: 'grotesk', frame: 'postcard', sky: 'glints', orn: ['wave', 'star'], sound: 'glass', bits: ['rope and brass', 'a lighthouse blinking', 'tar and salt'], voice: 'sea' }),
  cue('venue', 'pirate|treasure|shipwreck|buccaneer|galleon', ['#2b2118', '#c9a15a', '#7a1f2b', '#e8dcc2'], { dark: 1, type: 'classical', frame: 'brass', tex: 'grain-heavy', orn: ['key', 'star'], bits: ['a treasure map', 'a creaking deck', 'gold in the hold'], voice: 'pirate' }),
  cue('venue', 'under the sea|deep[ -]sea|underwater|undersea|aquarium|jellyfish|submarine|atlantis|seabed|kelp|abyss', ['#0a3d62', '#38ada9', '#ff8c7a', '#5fe0d0'], { dark: 2, frame: 'round', sky: 'bubbles', orn: ['shell', 'bubble'], sound: 'glass', motion: 'float', radius: 5, bits: ['light coming down in ribbons', 'a coral castle', 'bubbles going up'], voice: 'underwater' }),
  cue('venue', 'coral reef|lagoon|mermaid|siren\\b|reef|atoll', ['#2ec4b6', '#ff8c7a', '#e8fbf8', '#ffd166'], { frame: 'round', sky: 'bubbles', orn: ['shell', 'bubble'], sound: 'glass', motion: 'float', radius: 5, bits: ['water clear as glass', 'a coral garden', 'a shell to listen to'], voice: 'lagoon' }),
  cue('venue', 'forest|woods\\b|woodland|pines?\\b|firs?\\b|redwood|glade|clearing', ['#2d4a32', '#8a9a5b', '#d9cba3', '#b5651d'], { type: 'editorial', sky: 'leaves', orn: ['leaf', 'star'], sound: 'wood', bits: ['moss underfoot', 'light through the pines', 'a woodpecker somewhere'], voice: 'forest' }),
  cue('venue', 'meadow|fields?\\b|countryside|pasture|hayfield|wildflower|haystack', ['#a3b86c', '#f4e6b5', '#e07a5f', '#6b8f71'], { light: 'golden', sky: 'petals', orn: ['flower', 'leaf'], motion: 'float', bits: ['long grass', 'a bee asleep in a foxglove', 'a stile in the hedge'], voice: 'garden' }),
  cue('venue', 'lily ?pads?|water lil|lakes?\\b|lakeside|ponds?\\b|river|stream\\b|canal|lotus|jetty|creek|waterfall', ['#4a7c8c', '#cfe3e8', '#2e5a46', '#e9c46a'], { sky: 'glints', orn: ['wave', 'flower'], sound: 'glass', bits: ['rings on the water', 'reeds and a jetty', 'lilies closing for the night'] }),
  cue('venue', 'mountain|peaks?\\b|summit|valley|cliff|hik(?:e|ing)\\b|ridge\\b', ['#3e5c76', '#eef3f6', '#748cab', '#d7263d'], { type: 'modern', frame: 'polaroid', orn: ['star', 'snowflake'], bits: ['thin bright air', 'a cairn at the summit', 'the valley far below'], voice: 'mountain' }),
  cue('venue', 'desert|dunes?\\b|sands?\\b|canyon|mesa\\b|oasis|cact(?:us|i)\\b|sahara|mojave', ['#d9925b', '#f2d6a2', '#3f7f8f', '#8c3b2f'], { id: 'desert', type: 'modern', sky: 'motes', orn: ['sun', 'star'], sound: 'wood', bits: ['heat on the dunes', 'a lone cactus', 'stars like spilt salt'], voice: 'desert' }),
  cue('venue', 'city|cities|streets?\\b|downtown|metropol|urban|skyscraper|avenue|boulevard|alley|crosswalk', ['#2b2d42', '#8d99ae', '#ef233c', '#edf2f4'], { type: 'grotesk', frame: 'square', orn: ['star', 'bolt'], bits: ['crosswalk stripes', 'a siren far off', 'windows lit one by one'], voice: 'city' }),
  cue('venue', 'subway|metro\\b|underground\\b|tube\\b|station\\b|platform', ['#f2c14e', '#2b2d42', '#e5e5e5', '#d7263d'], { type: 'grotesk', frame: 'square', radius: 1, orn: ['bolt', 'star'], bits: ['tiled tunnels', 'mind the gap', 'the doors closing'], voice: 'travel' }),
  cue('venue', 'sleeper car|steam engine|trains?\\b|railway|railroad|express\\b|carriage|locomotive', ['#7b2d26', '#d4a373', '#2f3e46', '#f2e8d5'], { type: 'classical', frame: 'brass', orn: ['star', 'key'], bits: ['a sleeper car', 'fields going by', 'a ticket punched twice'], voice: 'travel' }),
  cue('venue', 'airport|airplane|aeroplane|planes?\\b|flight|jet\\b|runway|pilot\\b|cockpit', ['#1d3557', '#f1faee', '#e63946', '#a8dadc'], { type: 'grotesk', frame: 'postcard', sky: 'clear', orn: ['star', 'cloud'], bits: ['clouds below', 'a departures board flipping', 'a window seat'], voice: 'travel' }),
  cue('venue', 'road ?trip|route 66|gas station|petrol station|motel|roadside|highway|camper', ['#e76f51', '#2a9d8f', '#f4a261', '#264653'], { frame: 'polaroid', orn: ['star', 'sun'], bits: ['a buzzing vacancy sign', 'the open road', 'a map on the dashboard'], voice: 'travel' }),
  cue('venue', 'roof terrace|rooftop|skyline|penthouse|balcony', ['#22223b', '#f2e9e4', '#c9ada7', '#f4a261'], { dark: 1, light: 'dusk', sky: 'fireflies', orn: ['sparkle', 'star'], bits: ['string lights', 'the skyline coming on', 'a warm breeze'], voice: 'city' }),
  cue('venue', 'laundromat|launderette|laundry', ['#a8dadc', '#f1faee', '#e76f51', '#457b9d'], { type: 'grotesk', frame: 'round', sky: 'bubbles', orn: ['bubble', 'sparkle'], bits: ['the hum of the dryers', 'a coin slot', 'warm towels'], voice: 'city' }),
  cue('venue', 'hotel|lobby|concierge|bellboy|bellhop|suite\\b', ['#7a1f2b', '#d4af37', '#f3e9dc', '#1f3a3d'], { type: 'classical', frame: 'brass', set: 'boudoir', orn: ['key', 'crown'], bits: ['a bell on the desk', 'velvet ropes', 'a lift with a brass arrow'], voice: 'hotel' }),
  cue('venue', 'picture house|cinema|movie|films?\\b|projector|popcorn|matinee|premiere', ['#8b0000', '#f5c518', '#111111', '#f2e8d5'], { dark: 2, set: 'boudoir', wipe: 'curtain', frame: 'print', tex: 'grain-heavy', orn: ['star', 'sparkle'], bits: ['velvet seats', 'popcorn', 'the projector beam through the dark'], voice: 'theatre' }),
  cue('venue', 'curtain call|theat|stage\\b|operas?\\b|cabaret|vaudeville|musical\\b|broadway|playhouse', ['#8e1f3a', '#c9a15a', '#1a1012', '#f4e6d4'], { dark: 1, type: 'classical', set: 'boudoir', wipe: 'curtain', frame: 'arch', sound: 'musicbox', orn: ['star', 'crown'], bits: ['the curtain about to rise', 'gilded boxes', 'an orchestra tuning'], voice: 'theatre' }),
  cue('venue', 'art studio|museum|galler(?:y|ies)|exhibit|atelier|studio\\b|painter|canvas|easel|sculpt', ['#f4f1ea', '#1d1d1d', '#c0392b', '#b8b0a2'], { type: 'modern', frame: 'print', radius: 1, orn: ['asterisk', 'sparkle'], bits: ['white walls', 'a bench before a big canvas', 'turpentine and light'], voice: 'gallery' }),
  cue('venue', 'stained glass|church|cathedral|chapel|abbey|monaster|cloister|nave\\b|basilica', ['#2a3d66', '#c9a15a', '#7a1f2b', '#e8e1d0'], { type: 'classical', frame: 'arch', light: 'golden', sky: 'motes', sound: 'glass', orn: ['star', 'gem'], bits: ['stained glass on the floor', 'candle smoke', 'cool stone underfoot'], voice: 'zen' }),
  cue('venue', 'temple|shrine|pagoda|monks?\\b|buddha|incense', ['#c0392b', '#e9c46a', '#2f4f3f', '#f2ead8'], { type: 'modern', frame: 'square', sky: 'motes', sound: 'glass', orn: ['flower', 'sun'], bits: ['incense curling', 'a bell rope', 'paper charms in the wind'], voice: 'zen' }),
  cue('venue', 'flea market|market|bazaar|stalls?\\b', ['#e85d3f', '#f2b134', '#2a9d8f', '#3d2c2e'], { set: 'awning', orn: ['star', 'sparkle'], bits: ['stalls under lanterns', 'heaps of spice', 'someone haggling'], voice: 'city' }),
  cue('venue', 'big top|merry-go-round|circus|carnival|fun ?fair|fairground|carousel|ferris|clown|acrobat|ringmaster|trapeze', ['#d62828', '#fcbf49', '#f7f3e3', '#1d3557'], { type: 'editorial', set: 'awning', tex: 'stripes', frame: 'scallop', wipe: 'curtain', sky: 'confetti', orn: ['star', 'confetti'], sound: 'musicbox', motion: 'bouncy', bits: ['striped canvas', 'candyfloss', 'a carousel organ'], voice: 'circus' }),
  cue('venue', 'video ?games?|(?:8|16)[ -]bit|arcade|gamer|gaming|pixel|pinball|joystick', ['#ff3fa4', '#35e8ff', '#0d0a1e', '#ffe74c'], { dark: 2, type: 'pixel', tex: 'scanlines', set: 'grid', wipe: 'scan', sound: 'synth', frame: 'glow', motion: 'crisp', orn: ['bolt', 'star'], bits: ['a high-score table', 'coins in a cup', 'buttons worn smooth'], voice: 'arcade' }),
  cue('venue', 'casino|vegas|poker|roulette|blackjack', ['#0b6e4f', '#d4af37', '#9b111e', '#0a0a0a'], { dark: 2, frame: 'brass', sky: 'glints', orn: ['gem', 'star'], bits: ['green felt', 'chips clacking', 'a lucky streak'], voice: 'bar' }),
  cue('venue', 'castle|palace|ballroom|manor|chateau|mansion|throne|tower\\b|courtly', ['#8e1f3a', '#c9a15a', '#f4e6d4', '#2f3e5c'], { type: 'classical', frame: 'brass', set: 'boudoir', sky: 'glints', orn: ['crown', 'star'], sound: 'musicbox', bits: ['a chandelier', 'portraits down a long gallery', 'a sweeping staircase'], voice: 'castle' }),
  cue('venue', 'caves?\\b|cavern|grotto|crypt|catacomb|dungeon', ['#2b2b2b', '#5c5346', '#8fbc8f', '#d4a017'], { dark: 2, frame: 'round', sky: 'fireflies', orn: ['gem', 'drop'], bits: ['dripping stone', 'a lantern ahead', 'glow-worms on the ceiling'], voice: 'gothic' }),
  cue('venue', 'ruin|ancient|acropolis|colosseum|archaeolog|antiquit|amphitheat', ['#e9dcc3', '#a68a64', '#6b8e5a', '#3e5c76'], { type: 'classical', frame: 'arch', light: 'golden', sky: 'motes', orn: ['sun', 'leaf'], bits: ['broken columns', 'lizards on warm stone', 'old olive trees'], voice: 'gallery' }),
  cue('venue', 'wine cellar|vineyard|winery|vintner|cellar|grapes?\\b', ['#6d1a36', '#b5a642', '#f3e9dc', '#4a5d23'], { light: 'golden', orn: ['leaf', 'gem'], bits: ['rows of vines', 'a cool cellar door', 'a long lunch outside'], voice: 'kitchen' }),
  cue('venue', 'hot springs?|steam room|bubble bath|bath ?house|spas?\\b|onsen|hammam|sauna|bathtub', ['#a3c4bc', '#f4f1de', '#e07a5f', '#3d5a80'], { sky: 'fog', motion: 'float', frame: 'round', sound: 'glass', orn: ['drop', 'leaf'], bits: ['steam', 'cedar and eucalyptus', 'a stone basin'], voice: 'zen' }),
  cue('venue', 'flower shop|florist|flowers?\\b|flowery|bouquet|bloom|petals?\\b|peon(?:y|ies)|tulips?\\b|dais(?:y|ies)', ['#e75a7c', '#f9dbbd', '#7aa95c', '#fffaf5'], { sky: 'petals', motion: 'float', orn: ['flower', 'petal'], bits: ['buckets of stems', 'a bell on the door', 'petals on the counter'], voice: 'garden' }),
  cue('venue', 'record (?:shop|store)|records\\b|vinyl|turntable|cassette|mixtape|jukebox|radio\\b|dj\\b|hi-?fi', ['#e76f51', '#264653', '#e9c46a', '#f4f1de'], { frame: 'round', sky: 'notes', sound: 'wood', orn: ['notes', 'note'], bits: ['crates of vinyl', 'a needle drop', 'sleeve notes'], voice: 'music' }),
  cue('venue', 'music|piano|orchestra|violin|cello|symphony|melod|songs?\\b|choir|concert|guitar|band\\b|gig\\b|harp\\b|accordion', ['#2b2d42', '#c9a15a', '#f2e9e4', '#a4161a'], { type: 'editorial', sky: 'notes', sound: 'musicbox', orn: ['notes', 'note'], bits: ['a piano with the lid up', 'a melody through the wall', 'sheet music on the floor'], voice: 'music' }),
  cue('venue', 'classroom|school|chalkboard|blackboard|homework|campus|dorm(?:itory)?\\b', ['#2f4f3f', '#f2e8cf', '#d62828', '#e9c46a'], { type: 'editorial', orn: ['star', 'asterisk'], bits: ['chalk dust', 'a globe on the shelf', 'a bell about to ring'], voice: 'library' }),
  cue('venue', 'diving board|pools?\\b|swimming|poolside', ['#5bc0eb', '#fef9ef', '#fa7921', '#9bc53d'], { type: 'grotesk', frame: 'postcard', sky: 'glints', orn: ['wave', 'sun'], motion: 'bouncy', bits: ['a diving board', 'chlorine and sun cream', 'ripples on the tiles'], voice: 'tropical' }),
  cue('venue', 'roller\\b|rink\\b|skat(?:e|es|ing)\\b|bowling', ['#ff5d8f', '#7b2cbf', '#ffd60a', '#14213d'], { dark: 1, frame: 'glow', sky: 'sparkles', orn: ['star', 'sparkle'], motion: 'bouncy', bits: ['rental skates', 'a slow song for couples', 'wheels on a wooden floor'], voice: 'party' }),
  cue('venue', 'observator|planetarium|telescope|astronom|constellation|zodiac|horoscope|astrolog', ['#0b1030', '#e8c26a', '#8fb3ff', '#21184f'], { id: 'observatory', dark: 3, type: 'classical', set: 'dome', frame: 'brass', sky: 'stars', sound: 'glass', orn: ['star', 'moon'], bits: ['a brass telescope', 'star charts', 'the dome sliding open'], voice: 'space' }),
  cue('venue', 'space station|outer space|spaceship|space\\b|rocket|astronaut|cosmo|galax|nebula|planet|mars\\b|martian|lunar|orbit|alien|ufo\\b|sci-?fi|starship|interstellar', ['#0b0d24', '#7b5cff', '#ff6ad5', '#5ce1e6'], { dark: 3, type: 'grotesk', frame: 'glow', sky: 'stars', sound: 'synth', motion: 'float', orn: ['planet', 'star'], bits: ['Earth in the porthole', 'crumbs floating past', 'a nebula like spilt ink'], voice: 'space' }),
  cue('venue', 'tree ?house|rope swing|tree fort', ['#6b8e23', '#c19a6b', '#f2e8cf', '#e76f51'], { frame: 'polaroid', sky: 'leaves', motion: 'bouncy', orn: ['leaf', 'star'], bits: ['a rope ladder', 'leaves at the window', 'a secret password'], voice: 'toybox' }),
  cue('venue', 'antarctic|arctic|polar\\b|igloo|tundra|penguin|glacier|iceberg', ['#dff3fa', '#7fb8d6', '#2a4d69', '#f2f7f9'], { type: 'modern', sky: 'snow', sound: 'glass', orn: ['snowflake', 'star'], bits: ['blue ice', 'a sky that goes on', 'your breath in the air'], voice: 'winter' }),
  cue('venue', 'cottagecore|cottage|farm|barns?\\b|hayloft|homestead|village', ['#f4e9d8', '#a3b18a', '#e5989b', '#6b705c'], { type: 'editorial', tex: 'linen', frame: 'scallop', set: 'window', sky: 'motes', motion: 'float', orn: ['flower', 'heart'], bits: ['gingham curtains', 'jam cooling on the sill', 'hens in the yard'], voice: 'kitchen' }),
  cue('venue', 'building blocks|nursery|playroom|playground|toys?\\b|kindergarten|crayon|childhood|child\\b|children|kids?\\b', ['#ffadad', '#ffd6a5', '#caffbf', '#9bf6ff'], { type: 'grotesk', frame: 'polaroid', radius: 6, motion: 'bouncy', sky: 'confetti', sound: 'musicbox', orn: ['star', 'heart'], bits: ['crayons everywhere', 'a fort made of cushions', 'glow stars on the ceiling'], voice: 'toybox' }),
  cue('venue', 'slumber party|bedroom|beds?\\b|pillow|duvet|sleepover|pyjama|pajama', ['#e8e1f2', '#7d6b91', '#f4c7c3', '#2e2a3f'], { tex: 'linen', motion: 'float', orn: ['moon', 'star'], bits: ['fairy lights', 'too many pillows', 'a book face down'], voice: 'cabin' }),

  // Eras and styles
  cue('era', 'art deco|jazz age|deco\\b|192\\d|twenties|roaring|gatsby|flapper|charleston', ['#0f0f0f', '#d4af37', '#1f4e5f', '#f2e6d0'], { dark: 1, type: 'classical', frame: 'brass', tex: 'stripes', sky: 'glints', orn: ['gem', 'sun'], sound: 'wood', bits: ['gold fans on black lacquer', 'champagne coupes', 'a mirrored ballroom'], voice: 'jazz' }),
  cue('era', 'mid-?century|mid century|195\\d|fifties|50s\\b|rockabilly|atomic', ['#f28482', '#84a59d', '#f6bd60', '#f7ede2'], { type: 'grotesk', frame: 'polaroid', motion: 'bouncy', orn: ['sparkle', 'star'], bits: ['boomerang tables', 'a pastel fridge', 'a starburst clock'], voice: 'diner' }),
  cue('era', 'space age|flower power|op[ -]art|196\\d|sixties|60s\\b|mod\\b|psychedel|groovy', ['#ff6b35', '#f7c59f', '#2ec4b6', '#ff006e'], { type: 'grotesk', tex: 'dots', motion: 'bouncy', orn: ['flower', 'sun'], bits: ['op-art swirls', 'a flower-power van', 'a lava lamp'], voice: 'party' }),
  cue('era', 'shag (?:rug|carpet)|wood panell?ing|197\\d|seventies|70s\\b', ['#d9822b', '#8b4513', '#e9c46a', '#6b4226'], { type: 'editorial', tex: 'stripes', light: 'golden', orn: ['sun', 'flower'], bits: ['shag rugs and amber glass', 'a sunken lounge', 'orange everything'], voice: 'music' }),
  cue('era', 'mirror ?ball|dance ?floor|disco|glitter|funky?\\b|boogie', ['#c77dff', '#ffd60a', '#1a1a2e', '#ff4f8b'], { dark: 2, type: 'grotesk', frame: 'glow', sky: 'sparkles', sound: 'synth', motion: 'bouncy', orn: ['sparkle', 'star'], bits: ['a mirror ball turning', 'a floor that lights up', 'platform shoes'], voice: 'party' }),
  cue('era', 'new wave|198\\d|eighties|80s\\b|synthwave|retrowave|outrun', ['#ff3fa4', '#35e8ff', '#1a0b2e', '#ffb000'], { dark: 2, type: 'pixel', set: 'grid', tex: 'scanlines', sound: 'synth', wipe: 'scan', frame: 'glow', motion: 'crisp', orn: ['bolt', 'sun'], bits: ['a chrome sunset', 'a grid to the horizon', 'a cassette on rewind'], voice: 'neon' }),
  cue('era', '199\\d|200\\d|nineties|90s\\b|y2k|2000s|frutiger|chrome\\b|holographic|iridescent', ['#c0c0c0', '#ff4ecd', '#7df9ff', '#e8e8f0'], { type: 'grotesk', frame: 'glow', sky: 'glints', motion: 'bouncy', radius: 5, orn: ['sparkle', 'star'], bits: ['chrome and frosted plastic', 'a flip phone', 'butterfly clips'], voice: 'candy' }),
  cue('era', 'riot grrrl|garage band|grunge|punk|zines?\\b|flannel|mosh', ['#151515', '#f72585', '#f5f5f5', '#ffd60a'], { dark: 1, type: 'typewriter', tex: 'grain-heavy', frame: 'square', radius: 0, motion: 'crisp', orn: ['bolt', 'asterisk'], bits: ['safety pins', 'a photocopied zine', 'amp hum'], voice: 'music' }),
  cue('era', 'vapou?rwave|lo-?fi|chillwave|seapunk', ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff'], { type: 'pixel', set: 'grid', tex: 'scanlines', motion: 'float', orn: ['sparkle', 'sun'], bits: ['palm trees on a pastel grid', 'a sunset that loops', 'songs slowed right down'], voice: 'neon' }),
  cue('era', 'cyberpunk|cyber|hologra|dystop|android|mecha\\b|hacker|glitch', ['#ff2a6d', '#05d9e8', '#01012b', '#d1f7ff'], { dark: 3, type: 'grotesk', frame: 'glow', tex: 'scanlines', sky: 'rain', sound: 'synth', set: 'grid', wipe: 'scan', motion: 'crisp', orn: ['bolt', 'sparkle'], bits: ['holograms in the rain', 'wet neon', 'a noodle bar under the overpass'], voice: 'neon' }),
  cue('era', 'command line|server room|terminal|computer|coding|programmer|robot|ai\\b', ['#0b0f0c', '#39ff14', '#c8ffc8', '#1f3d2b'], { dark: 3, type: 'pixel', tex: 'scanlines', frame: 'square', radius: 0, sound: 'typewriter', wipe: 'scan', motion: 'crisp', orn: ['asterisk', 'bolt'], bits: ['a blinking cursor', 'fans humming', 'green on black'], voice: 'terminal' }),
  cue('era', 'steampunk|clockwork|cogs\\b|gears\\b|airship|zeppelin|automaton', ['#b87333', '#5c4033', '#d4af37', '#2f3e46'], { dark: 1, type: 'classical', frame: 'brass', tex: 'grain-heavy', sound: 'typewriter', orn: ['key', 'star'], bits: ['brass gears', 'a pressure gauge ticking', 'an airship at the window'], voice: 'travel' }),
  cue('era', 'vertical garden|living wall|solarpunk|eco[ -]city|green city', ['#7cb518', '#f9c74f', '#43aa8b', '#fdfcdc'], { set: 'glasshouse', sky: 'leaves', motion: 'float', orn: ['leaf', 'sun'], bits: ['gardens on every roof', 'solar glass', 'bikes and birdsong'], voice: 'garden' }),
  cue('era', 'gothic|goths?\\b|vampire|haunted|ghost|spooky|graveyard|cemetery|raven|skull|victorian|dracula|macabre|bats?\\b|cobweb|spider', ['#3c1518', '#8e1f3a', '#c9a15a', '#0d0d0d'], { dark: 3, type: 'classical', frame: 'arch', tex: 'grain-heavy', set: 'window', sky: 'fog', sound: 'glass', wipe: 'curtain', orn: ['moon', 'rose'], bits: ['a candelabra', 'a raven on the sill', 'cobwebs like lace'], voice: 'gothic' }),
  cue('era', 'trick or treat|halloween|pumpkin|jack-o|samhain', ['#ff7518', '#1b1b1b', '#6a0dad', '#e9e4d4'], { dark: 2, sky: 'leaves', orn: ['moon', 'star'], bits: ['a grinning pumpkin', 'sweets in a bowl', 'leaves skittering'], voice: 'witch' }),
  cue('era', 'great hall|feast hall|medieval|knights?\\b|kingdom|jousting|tapestr|banquet|camelot|chainmail', ['#6b2737', '#c9a15a', '#3e5641', '#e8dcc2'], { type: 'classical', frame: 'arch', tex: 'linen', sound: 'wood', orn: ['crown', 'star'], bits: ['banners in the hall', 'a tankard on the table', 'a long oak table'], voice: 'castle' }),
  cue('era', 'baroque|rococo|renaissance|versailles|regal|royal|queen|kings?\\b|aristocra|duchess|empress|emperor', ['#8e1f3a', '#c9a15a', '#f4e6d4', '#6b8fb3'], { type: 'classical', frame: 'brass', set: 'boudoir', sky: 'glints', sound: 'musicbox', orn: ['crown', 'sparkle'], bits: ['gilt and cherubs', 'a painted ceiling', 'silk on the walls'], voice: 'castle' }),
  cue('era', 'clean lines|white cube|minimal|bauhaus|modernis|scandi\\b|japandi', ['#f2f0eb', '#1d1d1d', '#d63230', '#2d5ea6'], { type: 'modern', frame: 'square', tex: 'none', radius: 0, set: 'none', motion: 'crisp', orn: ['asterisk', 'sparkle'], bits: ['nothing extra', 'one good chair', 'a primary red'], voice: 'gallery' }),
  cue('era', 'brutalis|concrete|industrial|factory|warehouse', ['#8d8d8d', '#3a3a3a', '#e8e4dc', '#ff5f1f'], { type: 'grotesk', frame: 'square', radius: 0, tex: 'grain-heavy', motion: 'crisp', orn: ['asterisk', 'bolt'], bits: ['raw concrete', 'one orange door', 'pigeons on the ledge'], voice: 'city' }),
  cue('era', 'memphis|squiggle|terrazzo|postmodern', ['#ff6f91', '#ffc75f', '#00c2a8', '#2c2c54'], { type: 'grotesk', tex: 'dots', motion: 'bouncy', radius: 4, orn: ['confetti', 'star'], bits: ['squiggles and terrazzo', 'a pastel triangle', 'confetti on the walls'], voice: 'party' }),
  cue('era', 'boho|bohemian|hippie|macrame|pampas|festival', ['#c97c5d', '#e9c46a', '#f4e3d7', '#6b705c'], { tex: 'linen', light: 'golden', sky: 'motes', orn: ['sun', 'feather'], bits: ['macramé and pampas grass', 'a rug from somewhere far', 'incense'], voice: 'zen' }),
  cue('era', 'film noir|murder mystery|private eye|noir|detective|mystery|crime\\b|gumshoe|whodunit|194\\d|forties|40s\\b', ['#131313', '#d42b2b', '#c9b689', '#ece7dc'], { dark: 3, type: 'typewriter', set: 'blinds', wipe: 'blinds', sound: 'typewriter', frame: 'square', tex: 'grain-heavy', radius: 0, sky: 'rain', orn: ['drop', 'star'], bits: ['venetian-blind shadows', 'a phone ringing', 'rain on the glass'], voice: 'noir' }),
  cue('era', 'fairy ?tale|castle in the clouds|once upon|storybook|fair(?:y|ies)|enchant|princess|unicorn|wonderland|pixie|elf\\b|elves|gnome', ['#f7c6d9', '#c3b1e1', '#ffd6a5', '#7a5195'], { type: 'romance', frame: 'arch', set: 'boudoir', sky: 'fireflies', sound: 'musicbox', motion: 'float', radius: 5, orn: ['sparkle', 'star', 'crown'], bits: ['a spiral staircase', 'a ring of toadstools', 'a door too small for anyone'], voice: 'fairytale' }),
  cue('era', 'crystal ball|witch|wizard|magic\\b|magick|spells?\\b|potion|alchem|occult|tarot|cauldron|apothecar|mystic|sorcer|grimoire|coven', ['#3a0f4d', '#7b2cbf', '#d4af37', '#0c0a14'], { dark: 3, type: 'classical', frame: 'arch', sky: 'stars', sound: 'glass', orn: ['moon', 'star'], bits: ['a cauldron, simmering', 'herbs drying from the beams', 'tarot cards face down'], voice: 'witch' }),
  cue('era', 'kawaii|cute\\b|pastel|bubblegum|plush(?:ie|ies)?\\b|stickers?\\b', ['#ffafcc', '#bde0fe', '#ffc8dd', '#cdb4db'], { type: 'grotesk', frame: 'polaroid', sky: 'hearts', motion: 'bouncy', radius: 6, sound: 'musicbox', orn: ['heart', 'star'], bits: ['sticker sheets', 'strawberry milk', 'a plush on every shelf'], voice: 'candy' }),
  cue('era', 'ice cream|cotton candy|sweet shop|candy|sweets\\b|lollipop|macaron|cupcake|donut|doughnut|gelato|sorbet|sprinkles|marshmallow|candyfloss|bonbon|dessert|cakes?\\b', ['#ff8fab', '#a0e7e5', '#fbf8cc', '#b28dff'], { type: 'grotesk', frame: 'scallop', sky: 'confetti', motion: 'bouncy', radius: 6, sound: 'musicbox', orn: ['heart', 'sparkle'], bits: ['jars of sweets', 'sprinkles everywhere', 'a cherry on top'], voice: 'candy' }),
  cue('era', 'date night|candlelit dinner|romanc|love\\b|lovers?\\b|valentine|wedding|honeymoon|kiss', ['#b5179e', '#f7cad0', '#7a1f2b', '#ffe5ec'], { id: 'romance', type: 'romance', frame: 'arch', sky: 'hearts', sound: 'musicbox', motion: 'float', orn: ['heart', 'rose'], bits: ['roses in a jar', 'a love letter', 'two glasses'], voice: 'romance' }),
  cue('era', 'coquette|ballerina|ballet|ribbons?|bows?\\b|lace\\b|lacy|pearls?\\b|tutu|satin|silk\\b|silky|tulle', ['#f7d1dc', '#fff5f7', '#c9a0a8', '#8a5a6b'], { type: 'romance', frame: 'arch', tex: 'linen', set: 'boudoir', sky: 'petals', motion: 'float', radius: 5, orn: ['bow', 'heart'], bits: ['satin ribbons', 'pearls in a dish', 'a music box ballerina'], voice: 'romance' }),
  cue('era', 'dark academia|study hall|common room|academia|scholar|oxford|cambridge|university|professor|latin\\b|tweed', ['#3b2f2f', '#7b5e3b', '#c9b79c', '#2f3e46'], { dark: 2, type: 'classical', frame: 'print', tex: 'grain-heavy', sky: 'motes', sound: 'typewriter', orn: ['feather', 'key'], bits: ['tweed and candle wax', 'Latin in the margins', 'a fire in the common room'], voice: 'library' }),
  cue('era', 'rock garden|zen garden|zen\\b|wabi|sabi\\b|meditat|mindful|bonsai|ikebana|bamboo|tatami', ['#e8e2d5', '#6f7d5c', '#2f2f2f', '#c2a878'], { type: 'modern', frame: 'square', set: 'none', motion: 'calm', radius: 1, orn: ['leaf', 'drop'], bits: ['raked gravel', 'one branch in a vase', 'the sound of water'], voice: 'zen' }),

  // Things, materials and food
  cue('thing', 'velvet|velour', ['#6a0d2b', '#3a0f4d'], { dark: 1, tex: 'linen', bits: ['crushed velvet'] }),
  cue('thing', 'marble', ['#f2efe9', '#8a8a8a', '#c9b79c'], { type: 'classical', bits: ['cool marble'] }),
  cue('thing', 'gold\\b|golden|gilded|gilt\\b|brass', ['#c9a15a', '#d4af37'], { frame: 'brass', sky: 'glints', orn: ['crown', 'sparkle'], bits: ['everything edged in gold'] }),
  cue('thing', 'copper|bronze|rusty|patina', ['#b87333', '#8c4a2f'], { bits: ['copper pans on hooks'] }),
  cue('thing', 'terra ?cotta|clay\\b|adobe|pottery|ceramic', ['#c4643c', '#e3b58b', '#f2e3d0'], { radius: 3, bits: ['terracotta warm from the sun'] }),
  cue('thing', 'tiles?\\b|tiled|mosaic|majolica|azulejo', ['#2b5fa6', '#f2ead8', '#3f8f8f'], { tex: 'dots', bits: ['patterned tiles'] }),
  cue('thing', 'neon', ['#ff3fa4', '#35e8ff', '#120a24'], { dark: 2, frame: 'glow', sound: 'synth', orn: ['bolt', 'sparkle'], bits: ['a neon sign buzzing'] }),
  cue('thing', 'paper|origami|stationery|letters?\\b|ink\\b|inky|calligraph|typewriter|notebook|journal|diary|postcard|poe(?:m|ms|try|t|ts)\\b|writer|novels?\\b', ['#f4ecd8', '#2b2b2b', '#a63d40'], { type: 'typewriter', sound: 'typewriter', frame: 'print', orn: ['feather', 'asterisk'], bits: ['ink on good paper', 'a letter half-written'], voice: 'library' }),
  cue('thing', 'candlelit|candle|lamplight|lamps?\\b|firelight|torchlight', ['#f2a541', '#3d2b1f', '#ffd27f'], { dark: 2, sky: 'motes', orn: ['flame', 'sparkle'], bits: ['candlelight'] }),
  cue('thing', 'lantern festival|paper lanterns?|lanterns?', ['#e63946', '#f4a261', '#1d1d2c'], { dark: 2, sky: 'fireflies', orn: ['sparkle', 'star'], bits: ['paper lanterns overhead'] }),
  cue('thing', 'film grain|super ?8|35 ?mm|polaroid|analog(?:ue)?|darkroom|photograph|cameras?\\b', ['#d9a441', '#2f3e46', '#efe6d6'], { tex: 'grain-heavy', frame: 'polaroid', bits: ['a faded photograph', 'grain like weather'], voice: 'gallery' }),
  cue('thing', 'denim|jeans', ['#3b5b92', '#f2efe9', '#b5651d'], { bits: ['worn denim'] }),
  cue('thing', 'wood\\b|wooden|oak\\b|walnut|timber|cedar|driftwood', ['#8b5a2b', '#d9b38c'], { sound: 'wood', bits: ['old wood, warm to the touch'] }),
  cue('thing', 'moss|ferns?\\b|ivy\\b|lichen', ['#4f6d3a', '#8a9a5b', '#d8e2c2'], { sky: 'leaves', orn: ['leaf'], bits: ['moss on everything'] }),
  cue('thing', 'stones?\\b|granite|slate|cobble|pebble', ['#6c757d', '#adb5bd', '#e9ecef'], { bits: ['cool stone'] }),
  cue('thing', 'mother of pearl|glass\\b|crystal|prism|opal|pearlescent', ['#b8e0f6', '#e8d1f2', '#c7f9cc'], { sky: 'glints', sound: 'glass', orn: ['gem', 'sparkle'], bits: ['light through glass'] }),
  cue('thing', 'smoke|smoky|smokey|haze\\b|hazy|ash(?:es)?\\b', ['#4a4e69', '#9a8c98'], { sky: 'fog', bits: ['smoke curling'] }),
  cue('thing', 'ice\\b|icy|frozen|frost|icicle', ['#bde0fe', '#e0fbfc', '#5e81ac'], { sky: 'snow', sound: 'glass', orn: ['snowflake'], bits: ['frost on the glass'] }),
  cue('thing', 'fires?\\b|flame|ember|volcan|lava|magma|forge|dragon|inferno|blaze|bonfire|campfire', ['#ff6a2b', '#ffc04a', '#2b0e0a'], { dark: 2, sky: 'embers', orn: ['flame', 'star'], sound: 'wood', bits: ['embers going up', 'heat on your face'] }),
  cue('thing', 'koi\\b|carp\\b|goldfish', ['#ff7f11', '#f2f2f2', '#d62828', '#0b3954'], { sky: 'bubbles', orn: ['drop', 'flower'], bits: ['koi turning under the lilies'] }),
  cue('thing', 'cherry blossom|plum blossom|sakura|hanami', ['#f6c1cc', '#f9e1e5', '#6f8f4e', '#8c5e58'], { sky: 'petals', motion: 'float', orn: ['flower', 'petal'], bits: ['blossom coming down like snow'], voice: 'zen' }),
  cue('thing', 'roses?\\b|rosebush', ['#c9184a', '#ffb3c1', '#386641', '#fff0f3'], { type: 'romance', sky: 'petals', orn: ['rose', 'petal'], bits: ['roses past their best, still lovely'] }),
  cue('thing', 'sunflower', ['#f9c80e', '#7b4b2a', '#4c956c'], { orn: ['sun', 'flower'], bits: ['sunflowers taller than you'] }),
  cue('thing', 'orange grove|lemon|citrus|limes?\\b|grapefruit|tangerine|clementine', ['#f7e05a', '#2f8f4e', '#fff8e1', '#f28c28'], { sky: 'glints', motion: 'bouncy', orn: ['sun'], bits: ['the sharp smell of citrus', 'lemons in a bowl'] }),
  cue('thing', 'cherr(?!y blossom)|strawberr|raspberr|berry|berries', ['#d00000', '#ffb3c6', '#3a5a40', '#fff0f3'], { orn: ['heart'], bits: ['berries in a colander'] }),
  cue('thing', 'peach|apricot|nectarine', ['#ffb38a', '#ffe5d4', '#e2725b'], { bits: ['a bowl of peaches'] }),
  cue('thing', 'mint\\b|minty|pistachio', ['#a8e6cf', '#dcedc1', '#3d8361'], { bits: ['something cool and green'] }),
  cue('thing', 'hot chocolate|chocolate|cocoa|caramel|toffee|fudge|truffle', ['#5a3218', '#c68b59', '#f3e1c7'], { dark: 1, orn: ['heart', 'sparkle'], bits: ['hot chocolate with too much cream'] }),
  cue('thing', 'honey|bees?\\b|beehive|marmalade|butterscotch', ['#e9a23b', '#f6d36b', '#6b4423'], { sky: 'motes', orn: ['sun', 'flower'], bits: ['honey in the light'] }),
  cue('thing', 'red wine|wines?\\b|merlot|claret|sangria', ['#6d1a36', '#b5838d', '#f3e9dc'], { dark: 1, orn: ['gem'], bits: ['a glass of red'] }),
  cue('thing', 'whiske?y|bourbon|scotch\\b|cigar|rum\\b|leather', ['#b5651d', '#2b1d14', '#d4a373'], { dark: 2, frame: 'brass', bits: ['leather chairs', 'a heavy glass'], voice: 'bar' }),
  cue('thing', 'champagne|prosecco|bubbly|fizz\\b|coupe\\b', ['#f3e5ab', '#d4af37', '#f7cac9'], { sky: 'glints', orn: ['sparkle', 'star'], bits: ['bubbles in a coupe'], voice: 'party' }),
  cue('thing', 'dim sum|sushi|ramen|noodle|izakaya|dumpling|bento|udon|noren', ['#d62828', '#f1e3c8', '#1d1d1d', '#2a9d8f'], { dark: 1, bits: ['a steaming bowl', 'a noren curtain'], voice: 'kitchen' }),
  cue('thing', 'pizza|pasta|trattoria|osteria|spaghetti', ['#c0392b', '#f4e3c3', '#2e7d32'], { tex: 'linen', bits: ['checked tablecloths'], voice: 'kitchen' }),
  cue('thing', 'cats?\\b|kitten|kitty', ['#f4a261', '#2a2a2a', '#f1e3d3'], { orn: ['heart', 'sparkle'], bits: ['a cat asleep in the sun'] }),
  cue('thing', 'dogs?\\b|pupp(?:y|ies)', ['#c68b59', '#f2e8cf'], { bits: ['a dog asleep by the door'] }),
  cue('thing', 'birds?\\b|birdsong|aviary|sparrow|robin\\b|swallows?\\b|parrot|owls?\\b|songbird', ['#6b8f71', '#f2e8cf', '#e76f51'], { sky: 'leaves', orn: ['feather', 'leaf'], bits: ['birdsong'] }),
  cue('thing', 'butterfl|moths?\\b|dragonfl', ['#f4a261', '#9b5de5', '#f15bb5'], { sky: 'petals', motion: 'float', orn: ['petal', 'sparkle'], bits: ['butterflies'] }),
  cue('thing', 'mushroom|toadstool|fung(?:i|us)', ['#c1121f', '#fdf0d5', '#6b705c'], { orn: ['star', 'leaf'], bits: ['a ring of toadstools'] }),
  cue('thing', 'treasure chest|gems?\\b|gemstone|jewel|diamond', ['#9966cc', '#0f52ba', '#e8f4f8'], { sky: 'glints', orn: ['gem', 'sparkle'], bits: ['jewels catching the light'] }),
  cue('thing', 'clouds?\\b|heaven|cumulus|sky\\b|skies', ['#c2e9fb', '#fefefe', '#a1c4fd'], { motion: 'float', orn: ['cloud', 'star'], bits: ['clouds you could lie on'] }),
  cue('thing', 'rainbow', ['#ef476f', '#ffd166', '#06d6a0', '#118ab2'], { sky: 'confetti', motion: 'bouncy', orn: ['star', 'heart'], bits: ['every colour at once'], voice: 'candy' }),
  cue('thing', 'hot air|balloon', ['#ef476f', '#ffd166', '#118ab2', '#f7f3e3'], { motion: 'float', orn: ['sun', 'cloud'], bits: ['balloons going up'] }),
  cue('thing', 'explor|expedition|adventur|maps?\\b|compass|voyage|globe\\b|atlas', ['#c2a878', '#2f4f4f', '#a63d40', '#efe6d6'], { type: 'classical', frame: 'brass', tex: 'grain-heavy', orn: ['star', 'key'], bits: ['a map with coffee rings', 'a brass compass'], voice: 'travel' }),
  cue('thing', 'pocket watch|time travel|clock|hourglass', ['#c9a15a', '#2f3e46', '#efe6d6'], { frame: 'brass', orn: ['star', 'key'], bits: ['clocks ticking slightly apart'] }),
  cue('thing', 'new year|firework|sparkler|nye\\b', ['#ffd166', '#ef476f', '#7b2cbf', '#1a1a2e'], { dark: 2, sky: 'sparkles', orn: ['sparkle', 'star'], bits: ['fireworks over the water'], voice: 'party' }),
  cue('thing', 'part(?:y|ies)\\b|celebrat|birthday|fiesta|confetti|prom\\b|gala\\b', ['#ff4f8b', '#ffc93c', '#7b2cbf', '#fff4f8'], { sky: 'confetti', motion: 'bouncy', sound: 'synth', orn: ['confetti', 'star'], bits: ['confetti in your hair', 'a cake with too many candles'], voice: 'party' }),
  cue('thing', 'christmas|xmas|yule|festive|advent|gingerbread|mistletoe|santa\\b|reindeer|nutcracker', ['#a4161a', '#1b4332', '#d4af37', '#f8f3e6'], { sky: 'snow', sound: 'musicbox', orn: ['star', 'snowflake'], bits: ['a tree in the window', 'gingerbread cooling', 'paper chains'], voice: 'winter' }),
  cue('thing', 'dinosaur|jurassic|prehistoric|t-?rex', ['#4f7942', '#c2b280', '#8b4513', '#2e3b2a'], { sky: 'leaves', motion: 'bouncy', orn: ['leaf', 'star'], bits: ['ferns as tall as houses', 'a footprint you could sit in'], voice: 'toybox' }),

  // People
  cue('who', 'grandmother|grandmama|grandma|granny|gran\\b|nana\\b|abuela|nonna|oma\\b|babushka|avo\\b|vovo\\b', ['#d8c3a5', '#e98074', '#8e8d8a'], { tex: 'linen', frame: 'scallop', orn: ['heart', 'flower'], bits: ['her radio in the corner', 'biscuits in a tin', 'a crocheted blanket'], voice: 'grandma' }),
  cue('who', 'grandfather|grandpa|grandad|granddad|gramps|abuelo|nonno|opa\\b', ['#8b6f47', '#3e4a59', '#d8cdb8'], { tex: 'grain-heavy', orn: ['key', 'leaf'], bits: ['his tools on the wall', 'a crossword half done', 'a radio murmuring'], voice: 'grandpa' }),

  // Times of day
  cue('time', 'early morning|first light|dawn|sunrise|daybreak', ['#f6bd9c', '#c3b1e1'], { light: 'dawn', dark: -1, bits: ['first light'] }),
  cue('time', 'morning|breakfast|brunch', [], { light: 'day', dark: -2, bits: ['morning light'] }),
  cue('time', 'high noon|noon\\b|midday|lunchtime', [], { light: 'day', dark: -2, bits: ['hard noon sun'] }),
  cue('time', 'afternoon|teatime|siesta', [], { light: 'day', dark: -1, bits: ['a long afternoon'] }),
  cue('time', 'golden hour|magic hour|late light|sunset|sundown', ['#f4a259', '#e76f51'], { light: 'golden', dark: -1, bits: ['late gold light'] }),
  cue('time', 'blue hour|dusk|twilight|gloaming|nightfall', ['#5e548e', '#e0b1cb'], { light: 'dusk', dark: 1, bits: ['the blue hour'] }),
  cue('time', 'evening|supper', [], { light: 'dusk', dark: 1, bits: ['the lamps coming on'] }),
  cue('time', 'witching hour|small hours|late night|after dark|midnight|nocturn|3 ?am\\b|night', ['#0f1a2e'], { light: 'night', dark: 3, bits: ['past midnight'] }),

  // Seasons
  cue('season', 'springtime|spring\\b|april\\b|easter|blossom', ['#f7c6d0', '#b5d99c', '#fdf6e3'], { dark: -1, sky: 'petals', orn: ['flower', 'petal'], bits: ['blossom everywhere'] }),
  cue('season', 'heat ?wave|midsummer|summer|july\\b|august\\b|solstice', ['#ffd166', '#ef476f', '#06d6a0'], { dark: -1, sky: 'motes', bits: ['long light', 'ice clinking in glasses'] }),
  cue('season', 'pumpkin spice|autumn|fall\\b|october|november|harvest|maple|acorn|conker|equinox', ['#d1622b', '#a63d40', '#e9b44c', '#5c4b3b'], { id: 'autumn', sky: 'leaves', orn: ['leaf'], bits: ['leaves in drifts', 'woodsmoke'] }),
  cue('season', 'first snow|winter|december|january|february|snowfall|frosty', ['#d9e6ef', '#2a4d69', '#a63446', '#f7f7f2'], { sky: 'snow', sound: 'glass', orn: ['snowflake'], bits: ['everything hushed'], voice: 'winter' }),

  // Weather
  cue('weather', 'rain(?!bow)|downpour|monsoon|wet\\b|puddle|umbrella|showers', ['#5b6c7d'], { dark: 1, sky: 'rain', bits: ['rain on the glass'] }),
  cue('weather', 'grey day|gray day|drizzl|overcast|cloudy|damp\\b', ['#9aa5b1'], { sky: 'drizzle', bits: ['a soft grey day'] }),
  cue('weather', 'snow(?! ?globe)|blizzard|flurr|sleet', ['#eef3f7'], { sky: 'snow', orn: ['snowflake'], bits: ['snow settling'] }),
  cue('weather', 'storm|thunder|lightning|tempest|gale\\b|hurricane', ['#2b2d42', '#ffd43b'], { dark: 2, sky: 'rain', orn: ['bolt'], bits: ['thunder rolling in'] }),
  cue('weather', 'fog|mist\\b|misty|mists\\b|murk', ['#c9cfd3'], { sky: 'fog', muted: .5, bits: ['mist on everything'] }),
  cue('weather', 'sun-?(?:drenched|soaked|lit)|bright day|hot day|sunny|sunshine|sunlit|sunlight|sunbeam|sun\\b|heat\\b', ['#ffd166'], { dark: -2, sky: 'motes', orn: ['sun'], bits: ['sun on everything'] }),
  cue('weather', 'windy|wind\\b|breezy|breeze|gusts?\\b', [], { sky: 'leaves', motion: 'bouncy', bits: ['wind in the washing'] }),
  cue('weather', 'night sky|shooting stars?|starry|starlit|starlight|stars?\\b', ['#0b1030'], { dark: 2, sky: 'stars', orn: ['star'], bits: ['more stars than dark'] }),
  cue('weather', 'full moon|moonlit|moonlight|moons?\\b|crescent', ['#e8e6d9', '#1f2a44'], { dark: 2, sky: 'stars', orn: ['moon'], bits: ['moonlight on the floor'] }),
  cue('weather', 'fairy lights|string lights|glow-?worms?|firefl', ['#f2d16b'], { dark: 1, sky: 'fireflies', orn: ['sparkle'], bits: ['fireflies'] }),
  cue('weather', 'northern lights|aurora', ['#3ddc97', '#8a5cf6', '#0b132b'], { dark: 3, sky: 'stars', orn: ['star', 'sparkle'], bits: ['the sky turning green'] }),

  // Moods
  cue('mood', 'cosy|cozy|snug|hygge|comfort|blanket|knit|warm\\b', ['#c8553d', '#f2e8d5', '#e9b44c'], { tex: 'linen', motion: 'calm', bits: ['a blanket and nowhere to be'], voice: 'cabin' }),
  cue('mood', 'calm\\b|quiet|peaceful|serene|still\\b|tranquil|gentle|slow\\b|soothing', [], { muted: .4, motion: 'calm', voice: 'zen' }),
  cue('mood', 'blue mood|melanchol|sad\\b|lonely|wistful|gloomy|bittersweet|longing', ['#5b6c7d', '#a3b1c2'], { muted: .6, sky: 'drizzle', bits: ['a long sigh of a day'] }),
  cue('mood', 'dreamy|dreamlike|dreams?\\b|ethereal|surreal|otherworldly|whimsical|magical|floaty', ['#e0c3fc', '#c2e9fb', '#fbc2eb'], { motion: 'float', sky: 'petals', orn: ['cloud', 'sparkle'], bits: ['clouds you could lie on'], voice: 'fairytale' }),
  cue('mood', 'playful|fun\\b|silly|joyful|happy|cheerful|zany|quirky|jolly', [], { vivid: .5, motion: 'bouncy', radius: 5, orn: ['star', 'heart'], bits: ['nothing too serious'] }),
  cue('mood', 'mysteri|eerie|uncanny|liminal|haunting|cryptic|secret', [], { dark: 1, muted: .3, sky: 'fog', bits: ['a corridor that goes on'], voice: 'gothic' }),
  cue('mood', 'old-fashioned|nostalg|vintage|retro\\b|faded|antique|heirloom|memories|bygone', ['#d8c3a5', '#8e8d8a', '#e98074', '#eae7dc'], { muted: .5, tex: 'grain-heavy', frame: 'polaroid', bits: ['a faded photograph', 'lace doilies'], voice: 'grandma' }),
  cue('mood', 'electric|energetic|loud\\b|wild\\b|hyper\\b|frenetic|buzzing|intense', [], { vivid: .7, motion: 'crisp', sky: 'sparkles', orn: ['bolt'], bits: ['a hum in the air'] }),
  cue('mood', 'lazy|sleepy|sunday|drowsy|languid|idle\\b|unhurried', [], { muted: .2, motion: 'float', bits: ['a slow Sunday'] }),
  cue('mood', 'elegant|refined|classy|chic\\b|sophisticat|timeless|understated|graceful', [], { muted: .3, type: 'classical', tex: 'none', frame: 'print', bits: ['nothing out of place'] }),
  cue('mood', 'vivid|vibrant|bold\\b|colou?rful|saturated|maximal|technicolou?r', [], { vivid: .8, bits: ['colour turned all the way up'] }),
  cue('mood', 'earth tones?|muted|pale\\b|washed|dusty|soft\\b|subdued|desaturated|neutral|earthy', [], { muted: .7 }),
  cue('mood', 'black room|dark\\b|moody|shadowy|gloom\\b', [], { dark: 3 }),
  cue('mood', 'white room|(?<!(?:first|late|candle|lamp|fire|moon|star|neon|fairy|string|northern|street|morning|evening|golden|blue|soft|low|warm|day|sun|green|red|traffic) )light\\b|bright\\b|airy|clean\\b|fresh\\b', [], { dark: -3 }),
  cue('mood', 'five-star|luxur|luxe\\b|opulent|glamou?r|lavish|decadent|grand\\b', ['#4a0e2e', '#d4af37', '#1a1a1a'], { dark: 1, type: 'classical', frame: 'brass', orn: ['gem', 'crown'], bits: ['velvet and gold'], voice: 'hotel' }),
  cue('mood', 'cold\\b|cool\\b|chilly|crisp\\b', ['#a8c5da'], { bits: ['cool, clean air'] }),
  cue('mood', 'hot\\b|balmy|sultry|humid|sweltering', ['#f28c28'], { bits: ['heat coming off the walls'] }),
];

/** Colour words said outright: they outweigh everything else, the first said most. */
/** @type {Record<string, string>} */
const COLOURS = { 'hot pink': '#ff3fa4', red: '#c8322d', crimson: '#a5122a', scarlet: '#e0301e', pink: '#ec7fa0', rose: '#d9667f', blush: '#f2b8c6', orange: '#ec7a2c', peach: '#f6b08a', coral: '#f07560', gold: '#d6a540', yellow: '#f0c93a', mustard: '#d4a017', ochre: '#cc7722', butter: '#f8e7a1', lemon: '#f3e05a', green: '#3f8f4f', emerald: '#1f8a5c', mint: '#93d8b8', sage: '#8fa883', olive: '#7d7a32', jade: '#00a86b', teal: '#1f8a8a', turquoise: '#33c3c0', aqua: '#3fd0d4', seafoam: '#9fe2bf', cyan: '#35d2e8', blue: '#2f6fdc', navy: '#1a2e6b', cobalt: '#2148b8', indigo: '#33368a', sapphire: '#0f52ba', periwinkle: '#8c9eff', lavender: '#9d8ac7', lilac: '#c8a2d8', mauve: '#b784a7', purple: '#7a3ea8', violet: '#6a3fd0', plum: '#6b2a5a', amethyst: '#9966cc', magenta: '#d5248f', fuchsia: '#e3239f', brown: '#7a4a2a', chocolate: '#5a3218', tan: '#d2b48c', beige: '#e8dcc4', khaki: '#c3b091', silver: '#b8c0cc', white: '#f4f2ee', black: '#141414', onyx: '#121212', charcoal: '#36454f', grey: '#8a8a8a', gray: '#8a8a8a', cream: '#f4ead2', ivory: '#f6f0dc', burgundy: '#6e1a2c', maroon: '#6b1e2e', ruby: '#9b111e', amber: '#e09a2a', copper: '#b8673a', rust: '#b7410e', terracotta: '#c4643c' };
/** Colour words that are also things ("lemon grove", "rose garden"): they count, but they do not insist. */
const ALSO_THINGS = ['lemon', 'peach', 'mint', 'chocolate', 'rose', 'coral', 'olive', 'amber', 'copper', 'rust', 'terracotta', 'lavender', 'plum', 'sage', 'butter'];
const PAINT = Object.entries(COLOURS).map(([w, hex]) => { const L = luminance(hex); return cue('colour', w.replace(' ', '\\s+') + '\\b', [hex], { dark: L < .04 ? 2 : L > .75 ? -1 : 0, soft: ALSO_THINGS.includes(w) }); });
const ALL = [...CUES, ...PAINT];

/**
 * How a room talks. {place} is where it is (or its name), {name} is its name.
 * @typedef {{ hello: Record<string, string>, placeholder: string, send: string, stages: Record<string, string>, done: string[] }} Voice
 */
/** @type {Record<string, Voice>} */
const VOICES = {
  generic: { hello: { morning: 'Morning. Welcome to {name}.', afternoon: 'Afternoon in {name}. What shall we make?', evening: 'Evening in {name}.', night: '{name}, after dark.' }, placeholder: 'Ask for anything', send: 'Send', stages: { read: 'Looking closely', plan: 'Thinking it through', draw: 'Making it', finish: 'Finishing' }, done: ['Here it is.', 'Fresh.', 'What do you think?'] },
  kitchen: { hello: { morning: 'Morning. The kettle’s on.', afternoon: 'Afternoon. Something smells good.', evening: 'Evening. Pull up a chair.', night: 'Midnight snack? Same.' }, placeholder: 'What are we cooking?', send: 'Serve', stages: { read: 'Reading the recipe', plan: 'Gathering the ingredients', draw: 'Stirring', finish: 'Plating up' }, done: ['Fresh off the stove.', 'Careful, it’s hot.', 'Seconds?'] },
  bakery: { hello: { morning: 'Morning. The first batch is out.', afternoon: 'Afternoon. There’s still some warm.', evening: 'Evening. Flour on everything.', night: 'The ovens are on for tomorrow.' }, placeholder: 'What shall we bake?', send: 'Bake', stages: { read: 'Weighing it out', plan: 'Proving the dough', draw: 'In the oven', finish: 'Dusting with sugar' }, done: ['Golden on top.', 'Still warm.', 'Mind the crumbs.'] },
  cafe: { hello: { morning: 'Morning. Your usual?', afternoon: 'Afternoon. The window seat’s free.', evening: 'Evening. Last orders soon.', night: 'We’re closed, but stay.' }, placeholder: 'What can I get you?', send: 'Order', stages: { read: 'Taking your order', plan: 'Grinding the beans', draw: 'Pulling the shot', finish: 'A little latte art' }, done: ['One for you.', 'Here, while it’s hot.', 'On the house.'] },
  tearoom: { hello: { morning: 'Morning. The pot is warming.', afternoon: 'Four o’clock. Of course you came.', evening: 'Evening. One more pot?', night: 'Chamomile, then. It’s late.' }, placeholder: 'One lump or two?', send: 'Pour', stages: { read: 'Reading the leaves', plan: 'Letting it steep', draw: 'Pouring', finish: 'Laying out the saucers' }, done: ['Just as you like it.', 'Mind, it’s hot.', 'More cake?'] },
  bar: { hello: { morning: 'We’re not open. Come in anyway.', afternoon: 'Early one? I won’t tell.', evening: 'Evening. What’ll it be?', night: 'Last call is only a suggestion.' }, placeholder: 'What’ll it be?', send: 'Pour', stages: { read: 'Listening', plan: 'Choosing the glass', draw: 'Shaking it up', finish: 'A twist of peel' }, done: ['On the house.', 'Neat.', 'Another?'] },
  jazz: { hello: { morning: 'Morning. The band’s still asleep.', afternoon: 'Soundcheck. Hum me something.', evening: 'Evening. The first set’s about to start.', night: 'Late set. Everybody’s listening.' }, placeholder: 'Hum me something', send: 'Count it in', stages: { read: 'Catching the key', plan: 'Finding the groove', draw: 'Taking the solo', finish: 'Holding the last note' }, done: ['Take a bow.', 'That one swung.', 'Encore?'] },
  diner: { hello: { morning: 'Morning, hon. Coffee’s fresh.', afternoon: 'Lunch rush is over. Sit anywhere.', evening: 'Evening. The pie’s still good.', night: 'Open all night, hon.' }, placeholder: 'What’ll you have?', send: 'Order up', stages: { read: 'Writing it down', plan: 'Calling it back', draw: 'On the griddle', finish: 'Plating it' }, done: ['Order up!', 'Here you go, hon.', 'Refill?'] },
  library: { hello: { morning: 'Morning. Quietly, now.', afternoon: 'Afternoon. Your table is free.', evening: 'Evening. One more chapter.', night: 'After hours. The best hours.' }, placeholder: 'Whisper a request', send: 'Request', stages: { read: 'Checking the catalogue', plan: 'Finding the shelf', draw: 'Copying it out', finish: 'Stamping the card' }, done: ['Due back never.', 'Found it.', 'A first edition.'] },
  cabin: { hello: { morning: 'Morning. Frost on the window.', afternoon: 'Afternoon. More wood on the fire?', evening: 'Evening. The blankets are on the chair.', night: 'Night. Just the fire and us.' }, placeholder: 'Tell me by the fire', send: 'Go', stages: { read: 'Warming up', plan: 'Thinking it over', draw: 'Whittling it', finish: 'Brushing off the shavings' }, done: ['Made by the fire.', 'Warm, isn’t it?', 'Stay a while.'] },
  garden: { hello: { morning: 'Morning. Dew on everything.', afternoon: 'Afternoon. The bees are busy.', evening: 'Evening. The watering can’s full.', night: 'Night. The moths are out.' }, placeholder: 'What shall we grow?', send: 'Sow', stages: { read: 'Checking the soil', plan: 'Choosing a sunny spot', draw: 'Coaxing it up', finish: 'Tying it to a cane' }, done: ['In bloom.', 'Picked this morning.', 'It came up lovely.'] },
  sea: { hello: { morning: 'Morning. The tide’s out.', afternoon: 'Afternoon. Salt on everything.', evening: 'Evening. The boats are coming in.', night: 'Night. Just the lighthouse and us.' }, placeholder: 'What’s on the horizon?', send: 'Sail', stages: { read: 'Reading the water', plan: 'Setting a course', draw: 'Under sail', finish: 'Coiling the ropes' }, done: ['Washed ashore.', 'Fresh catch.', 'Land ho.'] },
  pirate: { hello: { morning: 'Ahoy. Fair winds this morning.', afternoon: 'Afternoon, matey. Any treasure?', evening: 'Evening. Lanterns on deck.', night: 'Night watch. Eyes on the horizon.' }, placeholder: 'Name yer treasure', send: 'Set sail', stages: { read: 'Reading the map', plan: 'Plotting a course', draw: 'Digging', finish: 'X marks the spot' }, done: ['Treasure!', 'Arr.', 'Buried, then found.'] },
  underwater: { hello: { morning: 'Morning, from down here.', afternoon: 'The light comes down green today.', evening: 'Evening. The reef is glowing.', night: 'Deep night. Things glow here.' }, placeholder: 'Blow a bubble', send: 'Dive', stages: { read: 'Listening to the current', plan: 'Following the light', draw: 'Shaping the coral', finish: 'Polishing a pearl' }, done: ['Brought up from the deep.', 'A pearl, for you.', 'Glub.'] },
  lagoon: { hello: { morning: 'Morning. The water’s warm.', afternoon: 'Afternoon. Float a while.', evening: 'Evening. The lagoon is turning gold.', night: 'Night. The water glows.' }, placeholder: 'Wish on a shell', send: 'Splash', stages: { read: 'Listening to the shell', plan: 'Following the current', draw: 'Shaping the coral', finish: 'Polishing a pearl' }, done: ['Washed up, just for you.', 'A pearl, for you.', 'Splash!'] },
  forest: { hello: { morning: 'Morning. Mist between the trees.', afternoon: 'Afternoon. Light through the pines.', evening: 'Evening. The owls are waking.', night: 'Night in the woods. Stay close.' }, placeholder: 'Follow a path', send: 'Go', stages: { read: 'Listening to the trees', plan: 'Finding the path', draw: 'Gathering it', finish: 'Brushing off the moss' }, done: ['Found in a clearing.', 'The woods made this.', 'Mind the roots.'] },
  desert: { hello: { morning: 'Morning. Cool, for now.', afternoon: 'Afternoon. Find some shade.', evening: 'Evening. The sand is turning pink.', night: 'Night. More stars than dark.' }, placeholder: 'Draw it in the sand', send: 'Go', stages: { read: 'Reading the dunes', plan: 'Following the stars', draw: 'Shaping the sand', finish: 'Letting it settle' }, done: ['A mirage? No, it’s real.', 'Sun-baked.', 'Found it in the dunes.'] },
  western: { hello: { morning: 'Mornin’. Coffee’s on the fire.', afternoon: 'Afternoon, partner.', evening: 'Sun’s going down over the ridge.', night: 'Night. Coyotes singing.' }, placeholder: 'Talk to me, partner', send: 'Giddy up', stages: { read: 'Sizing it up', plan: 'Saddling up', draw: 'Riding out', finish: 'Tipping the hat' }, done: ['Much obliged.', 'Fastest draw in the west.', 'Yeehaw.'] },
  mountain: { hello: { morning: 'Morning. Clear all the way to the peaks.', afternoon: 'Afternoon. The air is thin and bright.', evening: 'Evening. Alpenglow.', night: 'Night. Cold and clear.' }, placeholder: 'What’s at the summit?', send: 'Climb', stages: { read: 'Reading the map', plan: 'Choosing a route', draw: 'Climbing', finish: 'Planting the flag' }, done: ['Summit.', 'Worth the climb.', 'Look at that view.'] },
  city: { hello: { morning: 'Morning, {place}.', afternoon: 'Afternoon in {place}. Busy out there.', evening: 'Evening. {place} is lighting up.', night: '{place} after dark. Still awake?' }, placeholder: 'What’s the plan?', send: 'Go', stages: { read: 'Taking it in', plan: 'Crossing town', draw: 'Making it', finish: 'Final touches' }, done: ['Fresh from the street.', 'Hot off the press.', 'Made in {place}.'] },
  neon: { hello: { morning: 'Morning. The neon never went off.', afternoon: 'Afternoon. Signal’s strong.', evening: 'Evening. The signs are waking up.', night: 'Night. This is when it’s alive.' }, placeholder: 'Jack in a wish', send: 'Run', stages: { read: 'Parsing', plan: 'Routing', draw: 'Rendering', finish: 'Compiling' }, done: ['Uploaded.', 'Signal clean.', 'Glitch-free. Mostly.'] },
  space: { hello: { morning: 'Morning, by ship’s clock.', afternoon: 'Afternoon. Earth is in the window.', evening: 'Evening. Systems dimming.', night: 'Night. Every star is out.' }, placeholder: 'Transmit a wish', send: 'Launch', stages: { read: 'Receiving', plan: 'Plotting a trajectory', draw: 'In orbit', finish: 'Docking' }, done: ['Touchdown.', 'Mission complete.', 'Signal received.'] },
  winter: { hello: { morning: 'Morning. Fresh snow.', afternoon: 'Afternoon. The light is short today.', evening: 'Evening. Lamps on early.', night: 'Night. Snow falling on snow.' }, placeholder: 'Write it in the frost', send: 'Go', stages: { read: 'Brushing off the snow', plan: 'Thinking, slowly', draw: 'Making it', finish: 'Wrapping it up warm' }, done: ['Frosted.', 'Warm, despite everything.', 'Fresh snow.'] },
  castle: { hello: { morning: 'Good morrow. The court awaits.', afternoon: 'Good day. What is your bidding?', evening: 'The torches are lit.', night: 'The castle sleeps. We do not.' }, placeholder: 'State your request', send: 'Decree', stages: { read: 'Hearing the petition', plan: 'Consulting the council', draw: 'Summoning the court painter', finish: 'Applying the seal' }, done: ['By royal decree.', 'Sealed and delivered.', 'As you command.'] },
  hotel: { hello: { morning: 'Good morning. Breakfast is served until ten.', afternoon: 'Good afternoon. Your room is ready.', evening: 'Good evening. Shall I call a car?', night: 'The night desk is always open.' }, placeholder: 'How may I help?', send: 'Ring', stages: { read: 'Noting your request', plan: 'Making arrangements', draw: 'Seeing to it personally', finish: 'A mint on the pillow' }, done: ['Delivered to your room.', 'With our compliments.', 'Anything else?'] },
  gothic: { hello: { morning: 'Morning. Draw the curtains.', afternoon: 'Afternoon. It’s dark enough.', evening: 'Evening. The candles are lit.', night: 'Midnight. Finally.' }, placeholder: 'Whisper it', send: 'Summon', stages: { read: 'Reading by candlelight', plan: 'Consulting the old books', draw: 'Conjuring', finish: 'Snuffing the candle' }, done: ['Risen.', 'It is done.', 'Beautifully grim.'] },
  witch: { hello: { morning: 'Morning. The cauldron’s warm.', afternoon: 'Afternoon. A good hour for charms.', evening: 'Evening. The moon is up.', night: 'The witching hour. Perfect.' }, placeholder: 'Name your spell', send: 'Cast', stages: { read: 'Reading the cards', plan: 'Gathering herbs', draw: 'Stirring the cauldron', finish: 'Speaking the last word' }, done: ['So mote it be.', 'The spell took.', 'Mind, it’s still smoking.'] },
  theatre: { hello: { morning: 'Morning. Rehearsal at ten.', afternoon: 'The matinée crowd is coming in.', evening: 'Evening. Places, please.', night: 'After the show. The stage is ours.' }, placeholder: 'Pitch me a scene', send: 'Curtain up', stages: { read: 'Reading the script', plan: 'Blocking the scene', draw: 'Performing', finish: 'Taking the bow' }, done: ['Bravo.', 'A standing ovation.', 'Curtain.'] },
  circus: { hello: { morning: 'Morning! The tent is up.', afternoon: 'Roll up, roll up.', evening: 'Evening. The big top is lit.', night: 'The crowd’s gone. Let’s play.' }, placeholder: 'Name the act', send: 'Showtime', stages: { read: 'Warming up', plan: 'Rigging the trapeze', draw: 'Juggling', finish: 'Ta-da' }, done: ['Ta-da!', 'For my next trick…', 'Tremendous!'] },
  zen: { hello: { morning: 'Morning. Breathe.', afternoon: 'Afternoon. There’s time.', evening: 'Evening. Let the day settle.', night: 'Night. Stillness.' }, placeholder: 'Say it simply', send: 'Begin', stages: { read: 'Noticing', plan: 'Letting go of the rest', draw: 'Making it, slowly', finish: 'Leaving it be' }, done: ['Enough.', 'Just this.', 'Simple.'] },
  travel: { hello: { morning: 'Morning. Next stop, anywhere.', afternoon: 'Afternoon. Window seat?', evening: 'Evening. Lights going past.', night: 'Night train. Nobody’s asleep.' }, placeholder: 'Where to?', send: 'Depart', stages: { read: 'Checking the timetable', plan: 'Changing at the junction', draw: 'On our way', finish: 'Arriving' }, done: ['Arrived.', 'Wish you were here.', 'Next stop?'] },
  tropical: { hello: { morning: 'Morning. Mangoes for breakfast.', afternoon: 'Afternoon. The hammock’s free.', evening: 'Evening. Torches on the sand.', night: 'Warm night. Crickets.' }, placeholder: 'What’s the plan?', send: 'Go', stages: { read: 'Taking it slow', plan: 'Thinking it over in the hammock', draw: 'Making it', finish: 'Adding a flower' }, done: ['Paradise.', 'Sun-kissed.', 'No rush.'] },
  party: { hello: { morning: 'Morning. Still dancing?', afternoon: 'Afternoon. Doors open soon.', evening: 'Evening! The music’s on.', night: 'Night. The party’s just started.' }, placeholder: 'Make a request', send: 'Drop it', stages: { read: 'Reading the room', plan: 'Cueing it up', draw: 'Dropping the beat', finish: 'Confetti cannon' }, done: ['What a night.', 'Encore!', 'Play it again.'] },
  candy: { hello: { morning: 'Morning! Sprinkles?', afternoon: 'Afternoon. Sugar-rush o’clock.', evening: 'Evening. One more treat.', night: 'Midnight sweets. Shh.' }, placeholder: 'Make a wish', send: 'Yay', stages: { read: 'Picking flavours', plan: 'Mixing the colours', draw: 'Swirling it', finish: 'Adding sprinkles' }, done: ['Too cute.', 'Sweet!', 'Extra sprinkles.'] },
  grandma: { hello: { morning: 'Morning, love. Have you eaten?', afternoon: 'There you are. Sit, sit.', evening: 'Evening, love. Soup’s on.', night: 'Still up? I’ll put the kettle on.' }, placeholder: 'Tell me, love', send: 'Go on', stages: { read: 'Putting my glasses on', plan: 'Having a think', draw: 'Doing it properly', finish: 'Nearly there' }, done: ['There. Isn’t that nice?', 'Made with love, as always.', 'Now, have you eaten?'] },
  grandpa: { hello: { morning: 'Morning, kiddo.', afternoon: 'Afternoon. Sit, I’ll tell you a story.', evening: 'Evening. Fetch the cards.', night: 'Can’t sleep either?' }, placeholder: 'Tell me, kiddo', send: 'Righto', stages: { read: 'Finding my glasses', plan: 'Thinking it over', draw: 'Doing it the old way', finish: 'There we go' }, done: ['Built to last.', 'Not bad, eh?', 'Back in my day this took weeks.'] },
  toybox: { hello: { morning: 'Morning! Let’s play.', afternoon: 'Afternoon! A fort, or a tea party?', evening: 'Five more minutes.', night: 'Shh. Under the covers.' }, placeholder: 'What shall we play?', send: 'Play', stages: { read: 'Opening the toy box', plan: 'Making up the rules', draw: 'Colouring it in', finish: 'Staying inside the lines' }, done: ['Ta-da!', 'One for the fridge.', 'Again!'] },
  fairytale: { hello: { morning: 'Once upon a morning…', afternoon: 'Once upon an afternoon…', evening: 'Once upon an evening…', night: 'Once upon a midnight…' }, placeholder: 'Make a wish', send: 'Wish', stages: { read: 'Opening the book', plan: 'Turning the page', draw: 'Weaving the spell', finish: 'Happily ever after' }, done: ['And so it was.', 'The end. Or is it?', 'Happily ever after.'] },
  noir: { hello: { morning: 'Morning. The coffee’s bitter.', afternoon: 'Afternoon. The phone’s been quiet.', evening: 'Evening. The streetlights are on.', night: 'Night. Somebody always knocks.' }, placeholder: 'Give me the facts', send: 'Take the case', stages: { read: 'Reading the file', plan: 'Following a hunch', draw: 'In the darkroom', finish: 'Turning up the collar' }, done: ['Case closed.', 'Nobody saw a thing.', 'It’s yours. Keep it quiet.'] },
  music: { hello: { morning: 'Morning. Needle’s down.', afternoon: 'Afternoon. Side B.', evening: 'Evening. Something slow?', night: 'Night. The deep cuts.' }, placeholder: 'Name a tune', send: 'Play', stages: { read: 'Flipping through the crates', plan: 'Finding the groove', draw: 'Pressing it', finish: 'Dropping the needle' }, done: ['A hit.', 'On repeat.', 'B-side gold.'] },
  gallery: { hello: { morning: 'Morning. The doors open at ten.', afternoon: 'Afternoon. Take your time.', evening: 'Private view tonight.', night: 'After hours. The paintings talk.' }, placeholder: 'Describe the piece', send: 'Hang it', stages: { read: 'Studying it', plan: 'Choosing the wall', draw: 'Making the piece', finish: 'Writing the label' }, done: ['Untitled, for now.', 'Hung at eye level.', 'Sold.'] },
  arcade: { hello: { morning: 'Press start.', afternoon: 'Insert coin.', evening: 'Player two has entered.', night: 'Final level. Ready?' }, placeholder: 'Enter your wish', send: 'Start', stages: { read: 'Loading', plan: 'Choosing a character', draw: 'Playing', finish: 'Entering initials' }, done: ['Level up.', 'Bonus round!', '1UP.'] },
  terminal: { hello: { morning: '> good morning', afternoon: '> ready', evening: '> still here', night: '> night mode' }, placeholder: '> type a command', send: 'Run', stages: { read: 'Parsing input', plan: 'Compiling', draw: 'Executing', finish: 'Exit 0' }, done: ['> done', '> success', '> 0 errors'] },
  romance: { hello: { morning: 'Morning, darling.', afternoon: 'Afternoon, darling. Missed you.', evening: 'Evening. The candles are lit.', night: 'Stay a little longer.' }, placeholder: 'Whisper it', send: 'With love', stages: { read: 'Reading your note', plan: 'Choosing the flowers', draw: 'Painting it with love', finish: 'Sealing it with a kiss' }, done: ['For you, darling.', 'With love.', 'Swoon.'] },
};

const WORD = /[\p{L}\p{N}'’-]/u;

/**
 * What the maker hears in some words: each cue, where it was said, and how much it weighs. A longer phrase wins over
 * the words inside it ("ice cream" is not ice, "golden hour" is not gold), and the colour said first counts most.
 * @param {string} text
 * @returns {Hit[]}
 */
export function readVibe(text) {
  const said = String(text || ''), low = fold(said);
  /** @type {Hit[]} */ const found = [];
  for (const c of ALL) {
    const m = low.matchAll(c.re).next().value;
    if (!m || m.index == null) continue;
    let end = m.index + m[0].length;
    while (end < low.length && WORD.test(low[end])) end++;
    found.push({ cue: c, at: m.index, end, word: said.slice(m.index, end), w: KIND[c.kind].w });
  }
  const hits = found.filter(x => !found.some(o => o !== x && o.at <= x.at && o.end >= x.end && o.end - o.at > x.end - x.at)).sort((a, b) => a.at - b.at);
  let n = 0;
  hits.forEach((x, i) => { x.w *= [1.15, 1.08, 1][i] ?? .95; if (x.cue.kind === 'colour') x.w *= Math.max(.7, 1.1 - .12 * n++) * (x.cue.soft ? .75 : 1); });
  return hits;
}

const LEAD = /^(?:(?:a|an|the|my|our|your|his|her|their|some|this|that|one|something|somewhere|someplace|like|just)\s+)+/i;
const JOIN = /\s*[,;:–—]\s*|\s+(?:in|at|on|by|under|beneath|near|with|from|during|after|before|over|across|inside|outside|beside|along|where|when|while|that|which|full of|made of|for)\s+/gi;
const SOFT = /^(?:sunny|rainy|snowy|foggy|misty|stormy|windy|cosy|cozy|dreamy|moody|quiet|cold|warm|old|lovely|beautiful|cute|pretty|nice|tiny|big|very|really|super|little)$/i;
const SMALL = /^(?:a|an|the|of|and|or|in|on|at|by|for|to|with|from|under|near|de|du|la|le|del|di|da|y|e)$/i;
const TAILS = ['place', 'time', 'season', 'weather'];

/** Title case that leaves small words, initials and names alone, with a typographer's apostrophe. */
export const titleCase = (/** @type {string} */ s) => s.split(/\s+/).filter(Boolean).map((w, i) => i && SMALL.test(w) ? w.toLowerCase() : /\p{Lu}/u.test(w.slice(1)) ? w : w.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-')).join(' ').replace(/'/g, '’');

/**
 * A name taken from the sentence: its head, and where or when it is.
 * "my grandmother's sunny kitchen in Lisbon" → "Grandmother’s Kitchen, Lisbon"; "a rainy Tokyo jazz bar at midnight"
 * → "Tokyo Jazz Bar at Midnight"; "pink and green" → "The Pink and Green Room".
 * @param {string} text
 */
export function nameParts(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ').replace(/^["“‘']+|["”’'.!?…]+$/g, '');
  if (!t) return { name: 'Untitled Room', head: 'Untitled Room', place: '' };
  /** @type {{ s: string, conn: string }[]} */ const segs = [];
  let from = 0, conn = '';
  for (const m of t.matchAll(JOIN)) { if (m.index == null) continue; segs.push({ s: t.slice(from, m.index), conn }); conn = m[0].trim().toLowerCase(); from = m.index + m[0].length; }
  segs.push({ s: t.slice(from), conn });
  const strip = (/** @type {string} */ s) => s.replace(LEAD, '').trim();
  let i = 0;
  while (i < segs.length - 1 && !strip(segs[i].s)) i++;
  let words = strip(segs[i].s).split(' ').filter(Boolean);
  if (!words.length) words = t.split(' ');
  if (words.length > 4) words = words.slice(-4);
  let tail = '', tailKind = '', joined = '';
  for (const g of segs.slice(i + 1)) {
    const s = strip(g.s);
    if (!s || s.split(' ').length > 3) continue;
    const heard = readVibe(s).map(x => x.cue.kind).find(k => TAILS.includes(k)), named = /^\p{Lu}/u.test(s) || /^\d{2,4}s?$/.test(s);
    if (!heard && !named) continue;
    tailKind = heard || 'named';
    // a known place takes a comma ("Kitchen, Lisbon"); a time, a weather or an unknown name keeps its word ("Bar at Midnight", "Shop on Mars")
    joined = heard !== 'place' && /^[a-z]/.test(g.conn) ? g.conn : '';
    tail = joined ? g.s.trim() : s;
    break;
  }
  const join = (/** @type {string[]} */ w, /** @type {string} */ tl) => {
    const head = titleCase(w.join(' '));
    if (!tl) return head;
    return joined ? head + ' ' + joined + ' ' + titleCase('x ' + tl).slice(2) : head + ', ' + titleCase(tl);
  };
  let name = join(words, tail);
  if (name.length > 30) { const w = words.filter((x, j) => j === words.length - 1 || !SOFT.test(x)); if (w.length) words = w; name = join(words, tail); }
  if (name.length > 30) { tail = ''; name = join(words, ''); }
  if (name.length > 30) { words = words.slice(-3); name = join(words, ''); }
  const head = titleCase(words.join(' '));
  // Only colours and moods, no thing to name ("pink and green", "dark and moody"): call it a room.
  const hw = words.join(' ');
  let rest = fold(hw);
  for (const c of ALL) if (['colour', 'mood', 'weather', 'time', 'season'].includes(c.kind)) rest = rest.replace(c.re, m => ' '.repeat(m.length));
  if (!tail && !rest.replace(/\b(?:and|but|very|so)\b|&/g, '').trim()) name = 'The ' + head + ' Room';
  else if (!tail && words.length === 1 && /^the\s/i.test(segs[i].s.trim())) name = 'The ' + head;
  return { name, head, place: tail && (tailKind === 'place' || tailKind === 'named') ? titleCase(tail) : '' };
}
export const nameFor = (/** @type {string} */ text) => nameParts(text).name;

/**
 * Where each cue was heard, every time it was said ("mermaid" and "lagoon" are one cue, both words light up), for
 * showing the reading. Spans never overlap; the first cue to claim a word keeps it.
 * @param {string} text
 * @returns {{ at: number, end: number, cue: Cue }[]}
 */
export function heardSpans(text) {
  const said = String(text || ''), low = fold(said);
  /** @type {{ at: number, end: number, cue: Cue }[]} */ const spans = [];
  for (const x of readVibe(said)) for (const m of low.matchAll(x.cue.re)) {
    if (m.index == null) continue;
    let end = m.index + m[0].length;
    while (end < low.length && WORD.test(low[end])) end++;
    const at = m.index;
    if (!spans.some(s => at < s.end && end > s.at)) spans.push({ at, end, cue: x.cue });
  }
  return spans.sort((a, b) => a.at - b.at);
}

/** @type {Record<string, number>} */
const ORDER = { place: 0, era: 1, venue: 2, thing: 3, who: 4, season: 5, weather: 6, time: 7, mood: 8, colour: 9 };
/** The room's line: three things it is made of, setting first, the air last. A later take tells it differently. */
function lineFor(/** @type {Hit[]} */ hits, /** @type {number} */ take) {
  const told = hits.filter(x => x.cue.bits?.length).sort((a, b) => ORDER[a.cue.kind] - ORDER[b.cue.kind] || a.at - b.at);
  if (!told.length) return '';
  const firsts = told.filter((x, i) => told.findIndex(y => y.cue.kind === x.cue.kind) === i);
  let pool = [...firsts, ...told.filter(x => !firsts.includes(x))];
  if (take && pool.length > 3) { const k = take % (pool.length - 2); pool = [...pool.slice(k), ...pool.slice(0, k)]; }
  const chosen = pool.slice(0, 3).sort((a, b) => ORDER[a.cue.kind] - ORDER[b.cue.kind] || a.at - b.at);
  /** @type {string[]} */ const parts = [];
  for (let round = 0; round < 3 && parts.length < 3; round++) for (const x of chosen) {
    const b = /** @type {string[]} */ (x.cue.bits), s = b[(take + round) % b.length];
    if (round < b.length && parts.length < 3 && !parts.includes(s)) parts.push(s);
  }
  const line = parts.join(', ');
  return line.charAt(0).toUpperCase() + line.slice(1) + '.';
}

const gap = (/** @type {number} */ a, /** @type {number} */ b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

/**
 * Room colours from weighted anchors. The heaviest colourful anchor that can carry a button leads as the accent, and
 * one far enough round the wheel follows it; the ground comes from the lightest anchor (the darkest, after dark);
 * ink and soft ink always read on the surface.
 * @param {Anchor[]} anchors
 * @param {{ dark: boolean, muted?: number, vivid?: number, take?: number }} o
 */
export function paletteFrom(anchors, { dark, muted = 0, vivid = 0, take = 0 }) {
  const A = anchors.map(a => { const [h, s, l] = hsl(a.hex); return { ...a, h, s, l, chroma: s * (1 - Math.abs(2 * l - 1)) }; });
  /** @typedef {typeof A[number]} Tone */
  const fade = (/** @type {number} */ s) => Math.max(.04, Math.min(1, s * (1 - .4 * muted + .3 * vivid)));
  const tone = (/** @type {Tone} */ a, /** @type {number} */ lo, /** @type {number} */ hi) => fromHsl(a.h, fade(a.s), Math.min(hi, Math.max(lo, a.l)));
  const lift = (/** @type {Tone} */ a) => dark ? tone(a, .58, .72) : tone(a, .4, .58);
  // A yellow darkened enough to hold a button stops being yellow, so it decorates instead, unless it was asked for by
  // name; a colour too dark cannot glow after dark.
  const yellow = (/** @type {Tone} */ a) => !dark && a.h > 40 && a.h < 80 && a.l > .45;
  const carries = (/** @type {Tone} */ a) => a.firm || (dark ? luminance(lift(a)) > .12 : !yellow(a));
  const acc = A.filter(a => a.chroma > .16 && a.l > .18 && a.l < .88).map(a => ({ a, score: a.w * (.5 + a.chroma) * (carries(a) ? 1 : .3) })).sort((x, y) => y.score - x.score).map(x => x.a);
  const heaviest = [...A].sort((x, y) => y.w - x.w)[0];
  const lead = acc.length ? acc[take % Math.min(3, acc.length)] : heaviest;
  const second = acc.filter(a => a !== lead).find(a => gap(a.h, lead.h) > 35);
  const accent = lift(lead);
  const accent2 = second ? (dark ? tone(second, .6, .78) : tone(second, .36, .62)) : fromHsl(lead.h + (dark ? 160 : 35), dark ? .55 : .5, dark ? .7 : .48);
  const grounds = A.filter(a => dark ? a.l < .32 : a.l > .78).sort((x, y) => y.w - x.w);
  // a colour asked for by name tints a light room's ground too ("lemon yellow nursery" sits on butter, not on pink)
  const g = grounds.length && !(lead.firm && !dark) ? grounds[take % Math.min(2, grounds.length)] : null;
  const gh = g ? g.h : lead.h, gs = g ? Math.min(g.s, dark ? .5 : .45) : (dark ? .35 : .3);
  const ground = dark ? fromHsl(gh, gs, g ? Math.min(.11, Math.max(.05, g.l * .6)) : .08) : fromHsl(gh, gs, g ? Math.max(.91, Math.min(.965, g.l)) : .94);
  const side = A.filter(a => a !== g && a !== lead && a.chroma > .08).sort((x, y) => y.w - x.w)[0];
  const ground2 = dark ? mix(ground, side ? fromHsl(side.h, Math.min(.6, side.s), .3) : accent2, .3) : mix(ground, side ? fromHsl(side.h, Math.min(.5, side.s), .8) : accent2, .38);
  const surface = dark ? mix(ground, fromHsl(gh, gs, .2), .55) : mix(ground, '#ffffff', .7);
  const inky = A.filter(a => dark ? a.l > .8 : a.l < .3).sort((x, y) => y.w - x.w)[0];
  const kin = inky && (inky.s < .15 || gap(inky.h, gh) < 60);
  const ink = ensure(dark ? (kin && inky ? fromHsl(inky.h, Math.min(.35, inky.s), .92) : fromHsl(gh, .22, .92)) : fromHsl(inky ? inky.h : lead.h, inky ? Math.min(.55, Math.max(.2, inky.s)) : .4, .17), surface, 7);
  const soft = ensure(mix(ink, ground, .45), surface, 3.4);
  const fit = ensure(accent, ground, yellow(lead) ? 1.5 : 3);
  return { ground, ground2, surface, ink, soft, accent: fit, accent2, onAccent: readable(fit, '#16110e', '#fffaf5') };
}

/** @param {Hit[]} hits @param {keyof Cue} key @param {Record<string, number>} [boost] @returns {[string, number][]} */
function tally(hits, key, boost = {}) {
  /** @type {Map<string, number>} */ const votes = new Map();
  for (const x of hits) { const v = /** @type {any} */ (x.cue)[key]; if (typeof v === 'string') votes.set(v, (votes.get(v) || 0) + x.w * (boost[x.cue.kind] ?? 1)); }
  return [...votes].sort((a, b) => b[1] - a[1]);
}
/** @param {Hit[]} hits @returns {[string, number][]} */
function glyphs(hits) {
  /** @type {Map<string, number>} */ const votes = new Map();
  for (const x of hits) (x.cue.orn || []).forEach((g, i) => votes.set(g, (votes.get(g) || 0) + x.w * ([1, .6, .35][i] ?? .2)));
  return [...votes].sort((a, b) => b[1] - a[1]);
}
/** The winner, or on a later take any close runner-up. @param {[string, number][]} list @param {() => number} rnd @param {number} take @param {string} fallback */
function choose(list, rnd, take, fallback) {
  if (!list.length) return fallback;
  if (!take) return list[0][0];
  const near = list.filter(([, s]) => s >= list[0][1] * .6);
  return near[Math.floor(rnd() * near.length)][0];
}
/** @param {string | undefined} key @param {{ name: string, place: string }} at @returns {Voice} */
function voiceFor(key, { name, place }) {
  const pack = (key && VOICES[key]) || VOICES.generic;
  const fill = (/** @type {string} */ s) => s.split('{place}').join(place).split('{name}').join(name);
  return { hello: Object.fromEntries(Object.entries(pack.hello).map(([k, v]) => [k, fill(v)])), placeholder: fill(pack.placeholder), send: pack.send, stages: { ...pack.stages }, done: pack.done.map(fill) };
}

/** @type {Record<string, string>} */
const WIPE_FOR = { heart: 'heart', bow: 'heart', rose: 'heart', star: 'star', sparkle: 'star', moon: 'star', planet: 'star', confetti: 'star', sun: 'star', snowflake: 'star', leaf: 'leaf', flower: 'leaf', petal: 'leaf', feather: 'leaf', wave: 'wave', shell: 'wave', drop: 'wave', bubble: 'wave', cloud: 'wave', notes: 'wave', note: 'wave', bolt: 'scan', crown: 'curtain', gem: 'curtain', key: 'curtain' };

/**
 * @param {{ said: string, hits: Hit[], name: string, head?: string, place?: string, take?: number, anchors?: Anchor[] | null, dark?: boolean | null, line?: string }} o
 */
function compose({ said, hits, name, head = name, place = '', take = 0, anchors = null, dark = null, line = '' }) {
  const rnd = seeded(hash(fold(said) + '|' + take));
  const sum = (/** @type {'dark' | 'muted' | 'vivid'} */ k) => hits.reduce((n, x) => n + (x.cue[k] || 0), 0);
  const night = dark ?? sum('dark') >= 2;
  /** @type {Anchor[]} */
  let A = anchors || hits.flatMap(x => x.cue.c.map((hex, i) => ({ hex, w: x.w * ([1, .8, .6, .45][i] ?? .35), firm: x.cue.kind === 'colour' && !x.cue.soft })));
  if (!A.length) { const hue = hash(fold(said) || 'room') % 360; A = [{ hex: fromHsl(hue, .6, .5), w: 1 }, { hex: fromHsl(hue + 150, .5, .55), w: .7 }, { hex: fromHsl(hue, .25, night ? .12 : .9), w: .5 }]; }
  const colors = paletteFrom(A, { dark: night, muted: Math.min(1, sum('muted')), vivid: Math.min(1, sum('vivid')), take });
  const pick = (/** @type {keyof Cue} */ key, /** @type {string} */ fallback) => choose(tally(hits, key), rnd, take, fallback);
  const said_weather = hits.some(x => (x.cue.kind === 'weather' || x.cue.kind === 'season') && x.cue.sky);
  const weather = choose(tally(hits, 'sky', { weather: 3, season: 2 }), rnd, said_weather ? 0 : take, 'motes');
  const timed = hits.find(x => x.cue.kind === 'time' && x.cue.light), lights = tally(hits, 'light');
  const marks = glyphs(hits);
  const ornament = choose(marks, rnd, take, night ? 'star' : 'sparkle');
  const motifs = [ornament, ...marks.map(([g]) => g).filter(g => g !== ornament)].slice(0, 3);
  if (motifs.length < 2) motifs.push(ornament === 'sparkle' ? 'star' : 'sparkle');
  const motion = pick('motion', 'calm');
  const rounded = hits.filter(x => x.cue.radius != null);
  const radius = rounded.length ? Math.round(rounded.reduce((n, x) => n + x.w * (x.cue.radius ?? 0), 0) / rounded.reduce((n, x) => n + x.w, 0) * 2) / 2 : motion === 'bouncy' || motion === 'float' ? 4 : motion === 'crisp' ? 1.5 : 2.5;
  // what it heard becomes today's sparks in this room: each thing it pictured is something to make
  const sparks = [...new Set(hits.flatMap(x => x.cue.bits || []))].map(s => s.charAt(0).toUpperCase() + s.slice(1));
  for (const more of ['A postcard from ' + name, name + ', painted from memory', name + ' at first light']) if (sparks.length < 3) sparks.push(more);
  const speaker = hits.filter(x => x.cue.voice).sort((a, b) => (b.cue.vp ?? KIND[b.cue.kind].voice) - (a.cue.vp ?? KIND[a.cue.kind].voice) || b.w - a.w)[0];
  return {
    id: 'room-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name, line: line || lineFor(hits, take) || 'A room made from “' + said.slice(0, 60) + '”.',
    dark: night, colors,
    type: pick('type', 'editorial'), frame: pick('frame', 'print'), ornament, motifs,
    set: pick('set', night ? 'none' : 'window'), texture: pick('tex', 'grain'),
    sky: { weather, light: timed?.cue.light || (lights.length ? lights[0][0] : night ? 'night' : 'auto') },
    wipe: pick('wipe', WIPE_FOR[ornament] || 'ink'), sound: pick('sound', night ? 'glass' : 'wood'), motion, radius,
    voice: voiceFor(speaker?.cue.voice, { name, place: place || head }),
    sparks, said, take, mine: true, made: 'device',
  };
}

/**
 * A room from words. Take 0 is the maker's first reading of them; every later take settles the close calls another
 * way: another accent, another ornament or frame, the line told differently.
 * @param {string} text
 * @param {number} [take]
 */
export function roomFromWords(text, take = 0) {
  const said = String(text || '').trim().slice(0, 160);
  const { name, head, place } = nameParts(said);
  return compose({ said, hits: readVibe(said), name, head, place, take });
}

/**
 * A room in the colours of a picture (its palette, darkest first), dressed in the style its strongest colour suggests.
 * @param {string[]} palette
 * @param {string} [name]
 * @param {number} [take]
 */
export function roomFromPalette(palette, name = 'From a picture', take = 0) {
  const lum = palette.map(luminance), dark = lum[Math.floor(lum.length / 2)] < .18;
  const [hue] = hsl([...palette].sort((a, b) => hsl(b)[1] - hsl(a)[1])[0]);
  const id = hue > 300 || hue < 20 ? 'romance' : hue < 70 ? 'autumn' : hue < 170 ? 'garden' : hue < 260 ? 'sea' : 'observatory';
  const style = CUES.find(c => c.id === id);
  const hits = style ? [{ cue: { ...style, c: [], dark: 0 }, at: 0, end: 0, word: '', w: 1 }] : [];
  return compose({ said: name, hits, name, take, anchors: palette.map(hex => ({ hex, w: 1 + hsl(hex)[1] })), dark, line: 'Every colour borrowed from one picture.' });
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
export function suggestPlaces({ text = '', room = /** @type {any} */ (null), near = .5, dream = .4, count = 6, seed = 1 }) {
  const out = [];
  if (text.trim()) { const said = nameFor(text); out.push({ id: 'say-0', name: said, words: text }); for (const t of ['at dawn', 'at dusk', 'at night']) out.push({ id: 'say-' + t, name: said + ' · ' + t.replace('at ', ''), words: text + ' ' + t }); }
  const score = (/** @type {typeof PLACES[number]} */ p) => Math.abs(p.near - near) * 1.2 + Math.abs(p.dream - dream) - (room && p.rooms.includes(room.id) ? .45 : 0) + ((hash(p.name) + seed) % 7) / 40;
  for (const p of [...PLACES].sort((a, b) => score(a) - score(b))) { if (out.length >= count) break; out.push({ id: 'pl-' + hash(p.name).toString(36), name: p.name, words: p.words, studio: p.studio }); }
  return out.slice(0, count);
}
