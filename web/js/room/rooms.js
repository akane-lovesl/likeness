/**
 * Rooms are the app's themes: what the place looks, sounds and talks like. A room is plain data, so the studio can
 * invent new ones (js/room/maker.js locally, POST /api/rooms on a live studio) and they behave like the built-in seven.
 *
 * Room = { id, name, line, dark?, colors: { ground, ground2, surface, ink, soft, accent, accent2, onAccent? },
 *          type, frame, ornament, motifs[], set, texture, sky: { weather, light }, wipe, sound, motion, radius, voice }
 */

/** Type pairings, all bundled in web/fonts, so a room can change faces with no network and no wait. */
export const TYPES = {
  editorial: { label: 'Editorial', display: "'Fraunces', Georgia, serif", text: "'Fraunces', Georgia, serif", mono: "'IBM Plex Mono', ui-monospace, monospace", hand: "'Caveat', cursive", dScale: 1, dWeight: 340, dTrack: '-.03em', dCase: 'none', dStyle: 'normal', tWeight: 380, tScale: 1, mScale: 1, tTrack: '0', faces: ['340 1em Fraunces', 'italic 340 1em Fraunces', '400 1em "IBM Plex Mono"', '500 1em Caveat'] },
  romance: { label: 'Romance', display: "'Pinyon Script', 'Fraunces', serif", text: "'Fraunces', Georgia, serif", mono: "'IBM Plex Mono', ui-monospace, monospace", hand: "'Caveat', cursive", dScale: 1.18, dWeight: 400, dTrack: '0', dCase: 'none', dStyle: 'normal', tWeight: 360, tScale: 1, mScale: 1, tTrack: '0', faces: ['1em "Pinyon Script"', '360 1em Fraunces', 'italic 360 1em Fraunces', '400 1em "IBM Plex Mono"', '500 1em Caveat'] },
  grotesk: { label: 'Grotesk', display: "'Space Grotesk', system-ui, sans-serif", text: "'Space Grotesk', system-ui, sans-serif", mono: "'IBM Plex Mono', ui-monospace, monospace", hand: "'Caveat', cursive", dScale: .92, dWeight: 600, dTrack: '-.045em', dCase: 'none', dStyle: 'normal', tWeight: 400, tScale: .96, mScale: 1, tTrack: '-.01em', faces: ['600 1em "Space Grotesk"', '400 1em "Space Grotesk"', '400 1em "IBM Plex Mono"', '500 1em Caveat'] },
  typewriter: { label: 'Typewriter', display: "'Courier Prime', 'Courier New', monospace", text: "'Courier Prime', 'Courier New', monospace", mono: "'Courier Prime', 'Courier New', monospace", hand: "'Caveat', cursive", dScale: .84, dWeight: 700, dTrack: '-.04em', dCase: 'none', dStyle: 'normal', tWeight: 400, tScale: .94, mScale: 1.1, tTrack: '0', faces: ['400 1em "Courier Prime"', '700 1em "Courier Prime"', '500 1em Caveat'] },
  classical: { label: 'Classical', display: "'Cinzel', 'Fraunces', serif", text: "'Fraunces', Georgia, serif", mono: "'IBM Plex Mono', ui-monospace, monospace", hand: "'Caveat', cursive", dScale: .74, dWeight: 500, dTrack: '.02em', dCase: 'none', dStyle: 'normal', tWeight: 360, tScale: 1, mScale: 1, tTrack: '0', faces: ['500 1em Cinzel', '360 1em Fraunces', 'italic 360 1em Fraunces', '400 1em "IBM Plex Mono"', '500 1em Caveat'] },
  modern: { label: 'Modern', display: "'Instrument Serif', 'Fraunces', serif", text: "'Space Grotesk', system-ui, sans-serif", mono: "'IBM Plex Mono', ui-monospace, monospace", hand: "'Caveat', cursive", dScale: 1.08, dWeight: 400, dTrack: '-.025em', dCase: 'none', dStyle: 'normal', tWeight: 400, tScale: .95, mScale: 1, tTrack: '-.005em', faces: ['1em "Instrument Serif"', 'italic 1em "Instrument Serif"', '400 1em "Space Grotesk"', '400 1em "IBM Plex Mono"', '500 1em Caveat'] },
  pixel: { label: 'Pixel', display: "'VT323', monospace", text: "'Space Grotesk', system-ui, sans-serif", mono: "'VT323', monospace", hand: "'VT323', monospace", dScale: 1.3, dWeight: 400, dTrack: '0', dCase: 'uppercase', dStyle: 'normal', tWeight: 400, tScale: .95, mScale: 1.55, tTrack: '0', faces: ['1em VT323', '400 1em "Space Grotesk"'] },
};

export const ROOMS = [
  {
    id: 'salon', name: 'Salon', line: 'Low lamps, warm brass, a mirror ringed with light.', dark: true,
    colors: { ground: '#130f0d', ground2: '#2d231c', surface: '#1f1915', ink: '#f6efe6', soft: '#b3a596', accent: '#f2c58a', accent2: '#c98d63', onAccent: '#1d140c' },
    type: 'editorial', frame: 'print', ornament: 'sparkle', motifs: ['sparkle', 'star'], set: 'none', texture: 'grain',
    sky: { weather: 'motes', light: 'night' }, wipe: 'ink', sound: 'glass', motion: 'calm', radius: 2,
    voice: {
      hello: { morning: 'Morning. The lamps are warming up.', afternoon: 'Afternoon. Who are we today?', evening: 'Evening. The mirror is lit.', night: 'Late. Good light for a change.' },
      placeholder: 'Ask for anything', send: 'Send',
      stages: { read: 'Looking closely', plan: 'Working out how', draw: 'Making it', finish: 'Nearly there' },
      done: ['There you are.', 'Have a look.', 'One to keep?'],
    },
  },
  {
    id: 'atelier', name: 'Atelier', line: 'Paper, ink, and a window full of afternoon.',
    colors: { ground: '#f3eee4', ground2: '#e4d7c2', surface: '#fbf8f2', ink: '#1d1915', soft: '#776c60', accent: '#d8432b', accent2: '#c4932f', onAccent: '#fff8ee' },
    type: 'editorial', frame: 'print', ornament: 'asterisk', motifs: ['sparkle', 'asterisk'], set: 'window', texture: 'grain',
    sky: { weather: 'motes', light: 'auto' }, wipe: 'ink', sound: 'wood', motion: 'calm', radius: 1.4,
    voice: {
      hello: { morning: 'Morning. The light is good today.', afternoon: 'Afternoon. What shall we make?', evening: 'Evening. The lamps are on.', night: 'Late again. Me too.' },
      placeholder: 'Ask for anything', send: 'Send',
      stages: { read: 'Looking closely', plan: 'Thinking it through', draw: 'Painting', finish: 'Varnishing' },
      done: ['Here it is.', 'Still wet. Careful.', 'One for the wall?'],
    },
  },
  {
    id: 'princess', name: 'Little Princess', line: 'Ribbons, roses, and Earl Grey at four.',
    colors: { ground: '#fcedf0', ground2: '#f5d3dc', surface: '#fffafb', ink: '#5b2a3c', soft: '#9b6b7d', accent: '#de6a8a', accent2: '#c79f58', onAccent: '#fffafb' },
    type: 'romance', frame: 'arch', ornament: 'bow', motifs: ['heart', 'note', 'petal', 'sparkle'], set: 'boudoir', texture: 'linen',
    sky: { weather: 'petals', light: 'golden' }, wipe: 'heart', sound: 'musicbox', motion: 'float', radius: 5,
    voice: {
      hello: { morning: 'Good morning, dearest. The tea is poured.', afternoon: 'Good afternoon, dearest. Shall we make something lovely?', evening: 'Good evening, dearest. The candles are lit.', night: 'Still awake, dearest? Then let us make something dreamy.' },
      placeholder: 'Write me a little note', send: 'Seal',
      stages: { read: 'Reading your letter', plan: 'Choosing the ribbons', draw: 'Painting with the windows open', finish: 'Tying the bow' },
      done: ['Here you are, dearest.', 'Fresh from the easel, with love.', 'Isn’t it sweet?'],
    },
  },
  {
    id: 'arcade', name: 'Night Arcade', line: 'Neon rain, a synth hum, one more go.', dark: true,
    colors: { ground: '#0d0a1e', ground2: '#2b0f40', surface: '#1a1335', ink: '#f3edff', soft: '#a99bd8', accent: '#ff3fa4', accent2: '#35e8ff', onAccent: '#16041f' },
    type: 'pixel', frame: 'glow', ornament: 'bolt', motifs: ['sparkle', 'bolt', 'star'], set: 'grid', texture: 'scanlines',
    sky: { weather: 'rain', light: 'night' }, wipe: 'scan', sound: 'synth', motion: 'crisp', radius: 2,
    voice: {
      hello: { morning: 'Player one, good morning.', afternoon: 'Insert an idea to continue.', evening: 'The city is lit. Your move.', night: 'High-score hours. Ready?' },
      placeholder: 'Type a wish', send: 'Go',
      stages: { read: 'Scanning input', plan: 'Plotting a route', draw: 'Rendering', finish: 'Polishing pixels' },
      done: ['Stage clear.', 'New high score.', 'Combo ×2.'],
    },
  },
  {
    id: 'noir', name: 'Noir', line: 'Rain on the glass and a case of the blues.', dark: true,
    colors: { ground: '#131313', ground2: '#262422', surface: '#1c1c1b', ink: '#ece7dc', soft: '#9a948a', accent: '#d42b2b', accent2: '#c9b689', onAccent: '#fff' },
    type: 'typewriter', frame: 'square', ornament: 'drop', motifs: ['drop'], set: 'blinds', texture: 'grain-heavy',
    sky: { weather: 'rain', light: 'night' }, wipe: 'blinds', sound: 'typewriter', motion: 'calm', radius: 0,
    voice: {
      hello: { morning: 'Morning. Coffee’s black. The case is open.', afternoon: 'Afternoon. Somebody wants a picture made.', evening: 'Evening. The city never sleeps. Neither do I.', night: 'Night. The rain does the talking.' },
      placeholder: 'Spill it', send: 'File it',
      stages: { read: 'Casing the evidence', plan: 'Working the angles', draw: 'In the darkroom', finish: 'Fixing the print' },
      done: ['Here’s your picture. Don’t ask how.', 'Case closed.', 'It’s yours. Keep it quiet.'],
    },
  },
  {
    id: 'greenhouse', name: 'Greenhouse', line: 'Morning mist, terracotta, things quietly growing.',
    colors: { ground: '#eef1e5', ground2: '#d6e1c8', surface: '#f8faf2', ink: '#1f3324', soft: '#5f745c', accent: '#c4643c', accent2: '#6f8f4e', onAccent: '#fffaf2' },
    type: 'modern', frame: 'round', ornament: 'leaf', motifs: ['leaf', 'flower'], set: 'glasshouse', texture: 'grain',
    sky: { weather: 'leaves', light: 'dawn' }, wipe: 'leaf', sound: 'wood', motion: 'float', radius: 4,
    voice: {
      hello: { morning: 'Morning. Everything has been watered.', afternoon: 'Afternoon. Something wants to grow.', evening: 'Evening. The glass is still warm.', night: 'Night in the greenhouse. Moths at the glass.' },
      placeholder: 'Plant an idea', send: 'Plant',
      stages: { read: 'Looking at the roots', plan: 'Choosing the light', draw: 'Growing it', finish: 'Pruning' },
      done: ['It took.', 'Fresh from the bed.', 'Look at it go.'],
    },
  },
  {
    id: 'riviera', name: 'Riviera', line: 'Striped awnings, lemon ice, a cobalt sea.',
    colors: { ground: '#f8f3e7', ground2: '#e3ebf6', surface: '#fffdf8', ink: '#13285a', soft: '#5a6c93', accent: '#ef5a3c', accent2: '#2f6fdc', onAccent: '#fffdf8' },
    type: 'grotesk', frame: 'postcard', ornament: 'sun', motifs: ['sparkle', 'shell'], set: 'awning', texture: 'grain',
    sky: { weather: 'glints', light: 'day' }, wipe: 'wave', sound: 'glass', motion: 'bouncy', radius: 3,
    voice: {
      hello: { morning: 'Buongiorno! The sea is flat as glass.', afternoon: 'Too hot to think. Perfect for making.', evening: 'Golden hour on the promenade.', night: 'The lights are on along the bay.' },
      placeholder: 'What are we making?', send: 'Go',
      stages: { read: 'Taking a look', plan: 'Sketching it out', draw: 'Painting in the sun', finish: 'Adding the sparkle' },
      done: ['Bellissimo.', 'Wish you were here.', 'Postcard ready!'],
    },
  },
  {
    id: 'observatory', name: 'Observatory', line: 'Brass, ink-blue night, a sky full of stories.', dark: true,
    colors: { ground: '#0b1030', ground2: '#21184f', surface: '#141a3e', ink: '#f2ead4', soft: '#a7a5c6', accent: '#e8c26a', accent2: '#8fb3ff', onAccent: '#1a1530' },
    type: 'classical', frame: 'brass', ornament: 'star', motifs: ['star', 'sparkle'], set: 'dome', texture: 'none',
    sky: { weather: 'stars', light: 'night' }, wipe: 'star', sound: 'glass', motion: 'calm', radius: 3,
    voice: {
      hello: { morning: 'Morning. The last stars are going out.', afternoon: 'Afternoon. The telescope is cooling.', evening: 'Evening. The first star is up.', night: 'A clear night. Everything is visible.' },
      placeholder: 'Name a wonder', send: 'Launch',
      stages: { read: 'Taking a reading', plan: 'Charting a course', draw: 'Gathering starlight', finish: 'Polishing the lens' },
      done: ['A new star, catalogued.', 'Seen for the first time.', 'Brighter than forecast.'],
    },
  },
  {
    id: 'storybook', name: 'Storybook', line: 'Watercolour washes, a wandering pen, wildflowers.',
    colors: { ground: '#f7f2e4', ground2: '#dfe8d3', surface: '#fffcf3', ink: '#2e3a2c', soft: '#6e7a64', accent: '#d9734e', accent2: '#6f9bb5', onAccent: '#fffcf3' },
    type: 'editorial', frame: 'scallop', ornament: 'flower', motifs: ['flower', 'leaf', 'star'], set: 'window', texture: 'linen',
    sky: { weather: 'petals', light: 'day' }, wipe: 'leaf', sound: 'wood', motion: 'float', radius: 4,
    voice: {
      hello: { morning: 'Once upon a morning…', afternoon: 'Turn the page. What happens next?', evening: 'A chapter before bed?', night: 'The house is asleep. The pen is not.' },
      placeholder: 'Tell me a little story', send: 'Ink it',
      stages: { read: 'Reading your page', plan: 'Sketching in pencil', draw: 'Laying the washes', finish: 'Inking the lines' },
      done: ['And there you are.', 'The ink is still wet.', 'A page to keep.'],
    },
  },
  {
    id: 'anime', name: 'Anime', line: 'A summer sky, clean lines, a wind that lifts your hair.',
    colors: { ground: '#eaf5ff', ground2: '#ffe3f0', surface: '#ffffff', ink: '#16244a', soft: '#5a6a92', accent: '#ff4f9a', accent2: '#2fa8ff', onAccent: '#ffffff' },
    type: 'grotesk', frame: 'round', ornament: 'sparkle', motifs: ['sparkle', 'star', 'heart'], set: 'none', texture: 'none',
    sky: { weather: 'glints', light: 'day' }, wipe: 'star', sound: 'glass', motion: 'bouncy', radius: 5,
    voice: {
      hello: { morning: 'Episode one: a bright new morning!', afternoon: 'The afternoon arc begins.', evening: 'Golden hour. Cue the theme song.', night: 'Late-night special. Let’s go!' },
      placeholder: 'What’s the scene?', send: 'Action',
      stages: { read: 'Studying the character', plan: 'Storyboarding', draw: 'Inking and painting cels', finish: 'Adding the sparkle' },
      done: ['Key visual complete!', 'Main character energy.', 'To be continued…'],
    },
  },
  {
    id: 'gilded', name: 'Gilded', line: 'Candlelight, umber shadow, a frame of gold leaf.', dark: true,
    colors: { ground: '#1b130d', ground2: '#3b2616', surface: '#251910', ink: '#f4e7cd', soft: '#bba585', accent: '#d8ab4e', accent2: '#9c3a2e', onAccent: '#1b130d' },
    type: 'classical', frame: 'brass', ornament: 'crown', motifs: ['sparkle', 'star'], set: 'none', texture: 'grain-heavy',
    sky: { weather: 'motes', light: 'golden' }, wipe: 'curtain', sound: 'glass', motion: 'calm', radius: 1,
    voice: {
      hello: { morning: 'Good morning. The north light is perfect.', afternoon: 'Good afternoon. The sitter may be seated.', evening: 'Good evening. Candles for the glazes.', night: 'A late sitting. Very well.' },
      placeholder: 'Your commission', send: 'Commission',
      stages: { read: 'Studying the sitter', plan: 'Laying the umber', draw: 'Glazing', finish: 'Varnishing' },
      done: ['Your portrait, finished.', 'Hang it where the light is kind.', 'For the gallery.'],
    },
  },
  {
    id: 'pop', name: 'Pop', line: 'Halftone, primaries and one big feeling.',
    colors: { ground: '#fff6c9', ground2: '#ffd94d', surface: '#ffffff', ink: '#121212', soft: '#4d4d4d', accent: '#e8202a', accent2: '#1f5fff', onAccent: '#ffffff' },
    type: 'grotesk', frame: 'square', ornament: 'bolt', motifs: ['star', 'bolt', 'sparkle'], set: 'none', texture: 'dots',
    sky: { weather: 'confetti', light: 'day' }, wipe: 'star', sound: 'synth', motion: 'bouncy', radius: 0,
    voice: {
      hello: { morning: 'POW! Good morning!', afternoon: 'WHAM! What are we making?', evening: 'ZAP! The evening edition.', night: 'Still up? KAPOW.' },
      placeholder: 'Say it loud', send: 'Print',
      stages: { read: 'Looking sharp', plan: 'Separating colours', draw: 'Pulling the screens', finish: 'Dotting the dots' },
      done: ['WOW.', 'Fresh off the press!', 'That’s a cover.'],
    },
  },
  {
    id: 'woodblock', name: 'Woodblock', line: 'Washi paper, indigo ink, a vermilion seal.',
    colors: { ground: '#f4ebd9', ground2: '#e3d4b6', surface: '#fbf6ea', ink: '#1f2a44', soft: '#5f6577', accent: '#d2432f', accent2: '#2f5d7c', onAccent: '#fbf6ea' },
    type: 'editorial', frame: 'square', ornament: 'wave', motifs: ['petal', 'wave'], set: 'none', texture: 'linen',
    sky: { weather: 'petals', light: 'dawn' }, wipe: 'wave', sound: 'wood', motion: 'calm', radius: .6,
    voice: {
      hello: { morning: 'Morning. The blocks are inked.', afternoon: 'Afternoon. The paper is damp and ready.', evening: 'Evening. One more impression.', night: 'Night. The carving can wait; the print cannot.' },
      placeholder: 'What shall we carve?', send: 'Print',
      stages: { read: 'Studying the face', plan: 'Carving the keyblock', draw: 'Printing colour by colour', finish: 'Lifting the sheet' },
      done: ['The first impression.', 'Lifted clean.', 'One for the series.'],
    },
  },
  {
    id: 'clay', name: 'Clay', line: 'Thumbprints, pastel light, a little wobble.',
    colors: { ground: '#fdeee4', ground2: '#e2f1ec', surface: '#fffaf6', ink: '#3a2e4a', soft: '#7c6f8e', accent: '#ff8358', accent2: '#6fc0ae', onAccent: '#fffaf6' },
    type: 'grotesk', frame: 'round', ornament: 'flower', motifs: ['heart', 'flower', 'bubble'], set: 'none', texture: 'grain',
    sky: { weather: 'bubbles', light: 'day' }, wipe: 'ink', sound: 'wood', motion: 'bouncy', radius: 7,
    voice: {
      hello: { morning: 'Morning! The clay is soft.', afternoon: 'Afternoon. Roll up your sleeves.', evening: 'Evening. One more frame?', night: 'Night shoot. Lights, clay, action.' },
      placeholder: 'What shall we sculpt?', send: 'Sculpt',
      stages: { read: 'Squishing the clay', plan: 'Shaping the head', draw: 'Sculpting the details', finish: 'Setting the lights' },
      done: ['Ta-da!', 'Fresh from the oven.', 'Squeeze-ably cute.'],
    },
  },
];

/** Moods are quick ways to set the sky for the kind of day it is. */
export const MOODS = [
  { id: 'bright', label: 'Bright', glyph: 'sun', weather: 'motes', light: 'day', intensity: .7, tempo: 1 },
  { id: 'dreamy', label: 'Dreamy', glyph: 'cloud', weather: 'petals', light: 'golden', intensity: .6, tempo: 1.25 },
  { id: 'cosy', label: 'Cosy', glyph: 'teacup', weather: 'snow', light: 'dusk', intensity: .55, tempo: 1.15 },
  { id: 'restless', label: 'Restless', glyph: 'leaf', weather: 'leaves', light: 'day', intensity: .9, tempo: .85, wind: 1.8 },
  { id: 'low', label: 'Low', glyph: 'drop', weather: 'drizzle', light: 'dusk', intensity: .5, tempo: 1.35 },
  { id: 'electric', label: 'Electric', glyph: 'bolt', weather: 'sparkles', light: 'night', intensity: .9, tempo: .8 },
];

export const WEATHERS = [
  { id: 'clear', label: 'Clear', glyph: 'sun' }, { id: 'motes', label: 'Sunbeams', glyph: 'sparkle' }, { id: 'petals', label: 'Petals', glyph: 'petal' },
  { id: 'hearts', label: 'Hearts', glyph: 'heart' }, { id: 'notes', label: 'Music', glyph: 'notes' }, { id: 'rain', label: 'Rain', glyph: 'drop' },
  { id: 'drizzle', label: 'Drizzle', glyph: 'cloud' }, { id: 'snow', label: 'Snow', glyph: 'snowflake' }, { id: 'leaves', label: 'Leaves', glyph: 'leaf' },
  { id: 'fireflies', label: 'Fireflies', glyph: 'sparkle' }, { id: 'stars', label: 'Stars', glyph: 'star' }, { id: 'bubbles', label: 'Bubbles', glyph: 'bubble' },
  { id: 'glints', label: 'Glints', glyph: 'sparkle' }, { id: 'sparkles', label: 'Sparks', glyph: 'bolt' }, { id: 'embers', label: 'Embers', glyph: 'flame' },
  { id: 'confetti', label: 'Confetti', glyph: 'confetti' }, { id: 'fog', label: 'Mist', glyph: 'cloud' },
];
export const LIGHTS = [
  { id: 'auto', label: 'By the clock' }, { id: 'dawn', label: 'Dawn' }, { id: 'day', label: 'Day' }, { id: 'golden', label: 'Golden hour' }, { id: 'dusk', label: 'Dusk' }, { id: 'night', label: 'Night' },
];
export const FRAMES = ['print', 'arch', 'glow', 'square', 'round', 'postcard', 'brass', 'polaroid', 'scallop'];
export const SETS = ['window', 'boudoir', 'grid', 'blinds', 'glasshouse', 'awning', 'dome', 'none'];
export const WIPES = ['ink', 'heart', 'star', 'leaf', 'scan', 'blinds', 'wave', 'curtain'];
export const SOUNDS = ['wood', 'musicbox', 'synth', 'typewriter', 'glass', 'none'];
export const TEXTURES = ['grain', 'grain-heavy', 'linen', 'scanlines', 'dots', 'stripes', 'none'];

/** The time of day, as the sky names it. */
export function clockLight(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  return h < 5 ? 'night' : h < 8 ? 'dawn' : h < 16.5 ? 'day' : h < 18.75 ? 'golden' : h < 20.75 ? 'dusk' : 'night';
}
export const partOfDay = (d = new Date()) => { const h = d.getHours(); return h < 5 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : h < 23 ? 'evening' : 'night'; };
