/**
 * The showcase studio: everything happens on the device. It reads the request, takes about as long as a pace
 * suggests (so the in-between states can be seen), and answers with sketches from the painter, stamped as sketches.
 * The same sketching gives a live studio's jobs their instant draft.
 */
import * as P from './painter.js';
import { LOOKS, lookFromWords } from './looks.js';
import { sleep, rng, pick } from '../core/dom.js';
import { heardSpans } from '../room/maker.js';
import { selectAt } from './segment.js';
import * as D from './dress.js';

const PACE = { quick: 2200, fine: 4000, deep: 6800 };
const cancelled = new Set();
const seedOf = s => [...String(s)].reduce((a, c) => (Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261) % 100000;

/**
 * @param {any} spec @param {Record<string, any>} inputs
 * @param {{ layers?: boolean }} [opts] layers: keep each layer of a new picture as it is painted, with its note
 */
export async function sketch(spec, inputs, i = 0, size = P.MAX, opts = {}) {
  const layers = !!opts.layers;
  const it = spec.intent, seed = (Number.isFinite(spec.seed) ? spec.seed : seedOf(spec.id)) + i * 97, rnd = rng(seed);
  const canvasOf = async id => { const inp = inputs[id]; return (inp.canvas ||= await P.fromBlob(inp.blob, size)); };
  const subject = it.subject && inputs[it.subject] ? await canvasOf(it.subject) : null;
  const styleRef = it.refs.find(r => r.role === 'style' && inputs[r.id]);
  const variant = l => (i === 0 ? l : { ...l, ramp: l.ramp?.map(c => c), keep: Math.min(1, (l.keep ?? .2) + i * .15), bloom: (l.bloom || 0) + i * .08 });
  const words = spec.text || '';
  let out, note = '', kept = null, shows = [], scene = null, changes = /** @type {string[]} */ ([]), painted = /** @type {string[]} */ ([]);
  let say = /** @type {string | null} */ (null), next = /** @type {string[] | null} */ (null), alpha = false, recipe = /** @type {Recipe | null} */ (null), trip = /** @type {any} */ (null);
  const took = (/** @type {any} */ pe) => { out = pe.canvas; note = pe.note; say = pe.say; next = pe.next || null; alpha = !!pe.alpha; recipe = pe.recipe || null; trip = pe.trip || null; if (layers && pe.layers) kept = pe.layers; };
  // a picture made here from a photo is made again from that photo, with this ask in its recipe
  const rec = it.subject && inputs[it.subject]?.recipe, source = rec && inputs[rec.from];
  if (rec && source && ['edit', 'restyle', 'backdrop', 'remove'].includes(it.op)) {
    const after = recipeAfter(rec, spec, it, words, seed);
    if (after) {
      const src = await canvasOf(rec.from), mask = await subjectOf(source), made = remake(after.rec, src, mask, !!layers, seed), who = inputs[it.subject]?.handle || 'it';
      return { canvas: made.canvas, note: 'made again from ' + (source.handle || 'the photo') + '’s photo', layers: made.layers, shows: [], scene: null, changes: [], painted: [], alpha: !!after.rec.cut, recipe: after.rec,
        say: recipeSay(who, after, made, words), next: made.desc ? [made.desc.light === 'night' ? 'In daylight' : 'Make it night', 'Somewhere else', after.rec.look ? 'Warmer' : 'In watercolour'] : ['Somewhere else', 'In watercolour', 'Warmer'] };
    }
  }
  // a sketch made here knows its scene: an edit it understands, or another take, paints that scene again
  const was = it.subject && inputs[it.subject]?.scene, again = (/** @type {any} */ desc, /** @type {any} */ next) => {
    if (layers) desc.layers = kept = [];
    out = P.scene(desc, 768, 1024); scene = next; shows = P.describeScene(desc);
  };
  switch (subject ? it.op : 'create') {
    case 'reference': {
      const ref = await canvasOf(styleRef.id), ramp = P.paletteOf(ref, 5);
      out = P.grade(subject, variant({ ramp, keep: .3, grain: .03, bloom: .15, vignette: .15 }), .92, seed); note = 'palette taken from the reference';
      break;
    }
    case 'blend': {
      const other = it.refs.find(r => inputs[r.id]); out = other ? P.blend(subject, await canvasOf(other.id), seed) : P.grade(subject, LOOKS[0], .9, seed); note = 'double exposure, one palette';
      break;
    }
    case 'region': {
      out = subject;
      for (const pin of it.pins) if (pin.mask) out = P.regionEdit(out, pin.mask, pin.note || words, seed + pin.n);
      painted = it.pins.filter(pin => pin.mask && P.isScenery(pin.note || words)).map(pin => pin.note || words);
      note = painted.length ? 'scenery painted into the pins' : 'pinned regions changed'; break;
    }
    case 'remove': {
      out = it.pins?.length ? it.pins.reduce((c, pin) => (pin.mask ? P.regionEdit(c, pin.mask, 'remove', seed) : c), subject) : P.grade(subject, LOOKS.find(l => l.id === 'pastel-dream'), .3, seed);
      note = it.pins?.length ? 'cleared under the pins' : 'nothing pinned: pin what should go'; break;
    }
    case 'backdrop': {
      const pe = !spec.backdrop && !it.where ? await photoEdit(subject, it, words, inputs[it.subject], layers) : null;
      if (pe) { took(pe); break; }
      const where = (spec.backdrop?.words || it.where || words.replace(/.*?(background|backdrop|behind \w+|setting|surroundings)\s*(to|of|with|into|in|as|:)?\s*/i, '')) || 'a garden at golden hour';
      const mask = spec.subjectMask || await subjectOf(inputs[it.subject]), made = placed(subject, mask, where, words, seed, spec.backdrop?.ramp || null, layers, it.subject);
      out = made.canvas; note = mask ? 'subject kept by its outline' : 'subject guessed as the centre'; kept = made.layers; recipe = made.recipe;
      if (made.plan) { say = dressSay(inputs[it.subject]?.handle || 'it', made.plan, made.desc, made.because, words); next = ['In watercolour', 'As a profile picture', 'Somewhere else']; note += ', dressed: ' + D.pieceList(made.plan.pieces); }
      else if (THERE[made.desc?.land] || /\bmars\b/i.test(where)) say = `${inputs[it.subject]?.handle || 'it'}, ${/\bmars\b/i.test(where) ? 'on Mars' : THERE[made.desc.land]}${/\bwithout\b[^.]*\bhelmet|helmetless/i.test(words) ? ', without a helmet' : ''}.`;
      break;
    }
    case 'trip': { took(await voyage(spec, it, inputs, seed, layers)); break; }
    case 'vary': {
      if (was) { const s = was.seed + 7919 * (i + 1); again(P.sceneAgain(was, s), { ...was, seed: s }); note = 'the same words, painted again'; break; }
      const pool = LOOKS.filter(l => !l.halftone && !l.pixel), look = it.look || pick(pool, rnd());
      out = P.grade(subject, variant(look), .55 + rnd() * .35, seed); note = look.name; break;
    }
    case 'create': {
      const { look, desc } = freshScene(spec, words, seed + i * 13);
      if (layers) desc.layers = kept = [];
      out = P.scene(desc, 768, 1024); if (look) { out = P.grade(out, look, .6, seed); kept?.push({ label: 'All of it in ' + look.name, canvas: P.copy(out, out.width / 2, out.height / 2) }); }
      note = look ? 'scenery, ' + look.name : 'scenery from the words'; shows = P.describeScene(desc); scene = { words, seed: seed + i * 13, edits: [], look: look?.id || null };
      break;
    }
    default: {
      if (was) {
        const sun = Array.isArray(spec.sun) ? spec.sun : null, edited = editedScene(was, words, sun), desc = edited.desc, first = edited.first; changes = edited.changes;
        if (changes.length) {
          again(desc, { ...was, edits: [...(was.edits || []), words, ...(sun ? [{ sun }] : [])] });
          if (lookFromWords(words, LOOKS, { moods: false })) scene.look = lookFromWords(words, LOOKS, { moods: false })?.id;
          const medium = lookFromWords(words, LOOKS, { moods: false }) || first;
          if (medium) { out = P.grade(out, medium, .6, seed); kept?.push({ label: 'All of it in ' + medium.name, canvas: P.copy(out, out.width / 2, out.height / 2) }); }
          note = 'repainted: ' + changes.join(', ');
          break;
        }
      }
      const pe = it.op === 'edit' || (it.op === 'restyle' && D.dressFrom(words)) ? await photoEdit(subject, it, words, inputs[it.subject], layers) : null;
      if (pe) { took(pe); break; }
      const named = it.look || lookFromWords(words), look = named || pick(LOOKS.filter(l => !l.pixel), rnd()), stages = layers && look.wash ? [] : null;
      out = P.grade(subject, variant(look), look.strength ?? .9, seed, stages); note = look.name;
      if (layers) kept = [{ label: 'As it was', canvas: half(subject), reveal: 'fade' }, ...(stages?.length ? stages : [{ label: 'In ' + look.name + (!named && it.op === 'edit' ? ', a stand-in' : ''), canvas: half(out) }])];
      if (!named && it.op === 'edit') {
        // nothing here it can do: say so, and offer a look meanwhile rather than pretend
        const ask = words.replace(/@([A-Z]{1,2})\b/g, '$1').replace(/\s+/g, ' ').trim(), of = ask.length > 48 ? ask.slice(0, 47) + '…' : ask;
        say = `A sketch can’t do “${of}”. Here is ${inputs[it.subject]?.handle || 'it'} in ${look.name} meanwhile; the studio on a workstation can.`;
        note = look.name + ', a stand-in'; next = ['Warmer', 'Try a backdrop', 'As a profile picture'];
      }
    }
  }
  // anything else done to a picture shows as before and after
  if (layers && !kept && subject && out && out !== subject) kept = [{ label: 'As it was', canvas: half(subject), reveal: 'fade' }, { label: note.charAt(0).toUpperCase() + note.slice(1), canvas: half(out) }];
  return { canvas: out, note, layers: kept, shows, scene, changes, painted, say, next, alpha, recipe, trip };
}

/**
 * What the device can honestly do to any picture from words: take the background away (or make it one plain colour),
 * make a profile picture, or adjust it (warmer, brighter, black and white…). The same for a proof as for the picture.
 * Null when the words ask for none of these.
 * With frames, the steps it took too, for the card to show as it works: who it is of, found; then what was done.
 * @param {HTMLCanvasElement} src @param {any} it @param {string} words @param {any} input
 */
async function photoEdit(src, it, words, input, frames = false) {
  const t = words.toLowerCase(), who = input?.handle || 'it', bg = /\b(?:background|backdrop|bg)\b/.test(t);
  const clear = /\btransparent\b|\bcut (?:it |her |him |them |@[a-z]{1,2} )?out\b|\bsticker\b|\b(?:remove|delete|erase|lose|drop|get rid of|take away|without|no)\b[^.]*\b(?:background|backdrop|bg)\b/.test(t);
  const colour = bg ? Object.keys(P.COLOUR_WORDS).find(k => new RegExp('\\b' + k + '\\b').test(t)) : undefined;
  if (clear || (bg && (colour || /\b(?:plain|blank|clean|solid|simple|studio|neutral|seamless)\b/.test(t)))) {
    const mask = await subjectOf(input), keep = mask ? 'kept by its outline' : 'kept by a guess at the middle';
    if (clear && !colour) {
      const canvas = P.composite(src, mask, null);
      return { canvas, alpha: true, note: 'cut out, ' + keep, say: `${who}, cut out: the background is gone.`, next: ['On a plain white background', 'On a beach in Lisbon', 'As a profile picture'],
        layers: frames ? [found(src, mask), { label: 'The room behind, taken away', canvas: half(P.checkered(canvas)), reveal: 'fade' }] : null };
    }
    const named = colour || 'white', canvas = P.composite(src, mask, P.plainBackdrop(src.width, src.height, P.COLOUR_WORDS[named] || '#f4f1ec'));
    return { canvas, note: `on plain ${named}, ${keep}`, say: `${who}, on plain ${named}.`, next: ['On a beach in Lisbon', 'As a profile picture', 'Warmer'],
      layers: frames ? [found(src, mask), { label: `Plain ${named} behind`, canvas: half(canvas), reveal: 'fade' }] : null };
  }
  if (it.op === 'edit' && /profile (?:pic(?:ture)?|photo|image)|\bavatar\b|\bpfp\b|head ?shot|passport (?:photo|picture)|linkedin/.test(t)) {
    const mask = await subjectOf(input), canvas = P.portrait(src, mask, Math.max(256, Math.min(768, src.width)));
    return { canvas, note: 'a square around the face, on a clean backdrop', say: `${who}, as a profile picture: a square around the face, on a clean backdrop.`, next: ['On a plain blue background', 'Warmer', 'In watercolour'],
      layers: frames ? [found(src, mask), { label: 'A square around the face', canvas: half(P.squareOn(src, P.portraitBox(src, mask))), reveal: 'fade' }, { label: 'On a clean backdrop', canvas: half(canvas), reveal: 'fade' }] : null };
  }
  const plan = D.dressFrom(words);
  if (plan) {
    const mask = await subjectOf(input), there = namesPlace(words) ? words : plan.place, made = placed(src, mask, there, words, 7, null, frames, it.subject);
    if (it.look) { made.canvas = P.grade(made.canvas, it.look, it.look.wash ? .9 : .7, 7); made.recipe.look = it.look.id; }
    return { canvas: made.canvas, recipe: made.recipe, note: 'dressed: ' + D.pieceList(made.plan?.pieces || plan.pieces) + (it.look ? ', in ' + it.look.name : ''), say: dressSay(who, made.plan || plan, made.desc, made.because, words).replace(/\.$/, it.look ? ', in ' + it.look.name + '.' : '.'),
      next: ['In watercolour', 'As a profile picture', plan.pieces.includes('crown') ? 'Add wings' : 'Add a crown'], layers: made.layers };
  }
  const adj = it.op === 'edit' ? P.adjustmentsIn(t) : null;
  if (adj) {
    const list = adj.said.length > 1 ? adj.said.slice(0, -1).join(', ') + ' and ' + adj.said[adj.said.length - 1] : adj.said[0], canvas = P.adjust(src, adj.ops);
    return { canvas, note: 'adjusted: ' + adj.said.join(', '), say: `${who}, ${list}.`,
      layers: frames ? [{ label: 'As it was', canvas: half(src), reveal: 'fade' }, { label: list.charAt(0).toUpperCase() + list.slice(1), canvas: half(canvas) }] : null };
  }
  return null;
}
/** Somewhere with nothing to breathe, and what the helmet is for there. */
const AIRLESS = /** @type {Record<string, string>} */ ({ moon: 'there’s no air up there', space: 'there’s no air out there', under: 'to breathe down there', mars: 'the air on Mars is too thin to breathe' });
const THERE = /** @type {Record<string, string>} */ ({ moon: 'on the moon', space: 'out in space', under: 'under the sea', clouds: 'above the clouds', mars: 'on Mars' });
/** Whether the words name somewhere to be: a place the painter knows, a room, or a thing it would paint there. @param {string} words */
function namesPlace(words) { const d = P.sceneFrom(words); return d.land !== 'hills' || d.inside || d.things.length > 0 || /\bhills?\b/i.test(words); }
/**
 * How a picture made here from a photo can be made again: the photo it came from, the place it was put (a scene, with
 * every change asked of it since), what they wear, a look over it and any adjustments. A later ask changes the recipe
 * and the picture is made again from the photo, so nothing is ever cut out of a picture that was itself cut out.
 * @typedef {{ from: string, scene: { words: string, seed: number, edits: any[] } | null, ramp: string[] | null, dress: any, bare: boolean, look: string | null, adjust: string[], cut?: boolean, plain?: string | null, profile?: boolean, stand?: { x: number, s: number } | null, seed?: number }} Recipe
 */
/** Without a helmet, said any way. @param {string} words */
const bareHeaded = words => /\b(?:without|no|minus|lose|take off|leave off|remove)\s+(?:a |an |the |any |his |her |their |its |my )?helmet|helmetless|bare[- ]?headed|\btake (?:the |her |his |their |its |my )?helmet off/i.test(words);
/**
 * Someone put somewhere (or left where they are, with no place) in what the words dress them in: a recipe, made.
 * @param {HTMLCanvasElement} src @param {HTMLCanvasElement | null} mask @param {string | null} where @param {string} words @param {number} seed
 * @param {string[] | null} [ramp] @param {boolean} [frames] @param {string} [from]
 */
function placed(src, mask, where, words, seed, ramp = null, frames = false, from = '') {
  const plan = D.dressFrom(words);
  /** @type {Recipe} */ const recipe = { from, scene: where ? { words: where, seed, edits: [] } : null, ramp, dress: plan, bare: bareHeaded(words), look: null, adjust: [], seed };
  return { ...remake(recipe, src, mask, frames, seed), recipe };
}
/**
 * Where a trip goes when it is not told: four places as far apart as the device can paint, then others for the next
 * one. Each as it is painted, as the sheet writes it under the picture, and as it is said.
 */
const TRIPS = /** @type {[string, string, string][]} */ ([
  ['a beach in Lisbon at dawn', 'Lisbon, at dawn', 'Lisbon at dawn'],
  ['a Tokyo street at night with neon signs', 'Tokyo, at night', 'Tokyo at night'],
  ['on the moon', 'The moon', 'the moon'],
  ['under the sea', 'Under the sea', 'under the sea'],
  ['Paris at night', 'Paris, at night', 'Paris at night'],
  ['the pyramids at sunset', 'The pyramids, at sunset', 'the pyramids at sunset'],
  ['Mars at sunset', 'Mars, where the sunset is blue', 'Mars at sunset'],
  ['Kyoto in autumn', 'Kyoto, in autumn', 'Kyoto in autumn'],
  ['Venice at golden hour', 'Venice, at golden hour', 'Venice at golden hour'],
  ['San Francisco in the fog', 'San Francisco, in the fog', 'San Francisco in the fog'],
  ['Santorini in the afternoon', 'Santorini', 'Santorini'],
  ['New York at night', 'New York, at night', 'New York at night'],
  ['London in the rain', 'London, in the rain', 'London in the rain'],
  ['Rome at dusk', 'Rome, at dusk', 'Rome at dusk'],
  ['Sydney harbour', 'Sydney', 'Sydney'],
  ['Mount Fuji in spring', 'Fuji, in spring', 'Fuji in spring'],
  ['fields of lavender at golden hour', 'Lavender, at golden hour', 'the lavender at golden hour'],
  ['the northern lights over a frozen lake', 'The northern lights', 'under the northern lights'],
  ['above the clouds at sunrise', 'Above the clouds', 'above the clouds'],
]);
/** The sheet a trip is laid out on: two to a row, the name and the route above, each place written under its picture. @param {number} n @param {number} aspect */
function tripLayout(n, aspect) {
  const cells = n + (n % 2), SW = 1080, m = 50, g = 34, head = 156, under = 72, foot = 64, cw = (SW - m * 2 - g) / 2, ch = Math.round(cw * aspect);
  const rows = Math.ceil(cells / 2), SH = Math.round(head + rows * (ch + under) + (rows - 1) * g + foot);
  return { SW, SH, m, head, under, cw, ch, rects: Array.from({ length: cells }, (_, i) => [m + (i % 2) * (cw + g), head + Math.floor(i / 2) * (ch + under + g), cw, ch]) };
}
/** The shape of a trip's sheet, for its card to take before anything is on it. @param {number} n @param {number} aspect */
export const tripAspect = (n, aspect) => { const L = tripLayout(n, aspect); return L.SW + ' / ' + L.SH; };
/** The room's paper and hands, for what the device lays out itself. */
function paperLook() {
  const css = getComputedStyle(document.documentElement), v = (/** @type {string} */ n, /** @type {string} */ or) => css.getPropertyValue(n).trim() || or;
  return { ground: v('--ground', '#f4efe6'), ink: v('--ink', '#1d1a17'), accent: v('--accent', '#d4452f'), display: v('--font-display', 'Georgia, serif'), hand: v('--font-hand', 'cursive'), mono: v('--font-mono', 'monospace') };
}
/**
 * A trip's contact sheet: on the room's paper, "A trip" and the route across the top with the day, then each picture
 * with a white edge and a shadow, written under in the room's hand. Places not yet painted are empty frames.
 * @param {ReturnType<typeof tripLayout>} L @param {{ canvas: CanvasImageSource | null, caption: string }[]} cells @param {string} route @param {string} day
 */
function tripSheet(L, cells, route, day) {
  const look = paperLook(), c = P.make(L.SW, L.SH), x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), r = rng(4242);
  x.fillStyle = look.ground; x.fillRect(0, 0, L.SW, L.SH);
  // a little tooth to the paper
  for (let i = 0; i < 2600; i++) { x.fillStyle = r() < .5 ? 'rgb(0 0 0 / .035)' : 'rgb(255 255 255 / .05)'; x.fillRect(r() * L.SW, r() * L.SH, 1 + r() * 2, 1 + r() * 2); }
  // the name and the route, centred, clear of the corner a picture's handle sits on; the day at the foot
  x.fillStyle = look.ink; x.textBaseline = 'alphabetic'; x.textAlign = 'center';
  x.font = '400 66px ' + look.display; x.fillText('A trip', L.SW / 2, 92);
  x.font = '500 19px ' + look.mono; x.letterSpacing = '3px'; x.fillStyle = look.accent;
  let line = route.toUpperCase(); while (line.length > 8 && x.measureText(line).width > L.SW - 260) line = line.slice(0, -2).trimEnd() + '…';
  x.fillText(line, L.SW / 2, 130);
  x.textAlign = 'left'; x.fillStyle = look.ink; x.globalAlpha = .5; x.fillText(day.toUpperCase(), L.m, L.SH - 26); x.letterSpacing = '0px'; x.globalAlpha = 1;
  cells.forEach((cell, i) => {
    const [rx, ry, rw, rh] = L.rects[i];
    if (cell.canvas) {
      x.save(); x.shadowColor = 'rgb(0 0 0 / .22)'; x.shadowBlur = 22; x.shadowOffsetY = 8; x.fillStyle = '#fbf8f2'; x.fillRect(rx - 7, ry - 7, rw + 14, rh + 14); x.restore();
      x.drawImage(cell.canvas, rx, ry, rw, rh);
    } else {
      x.save(); x.strokeStyle = look.ink; x.globalAlpha = .2; x.lineWidth = 2; x.setLineDash([10, 9]); x.strokeRect(rx, ry, rw, rh); x.restore();
    }
    x.fillStyle = look.ink; x.globalAlpha = cell.canvas ? .88 : .3; x.font = '38px ' + look.hand; x.textAlign = 'left'; x.fillText(cell.caption, rx + 2, ry + rh + 52);
    x.globalAlpha = cell.canvas ? 1 : .3; x.fillStyle = look.accent; x.font = '500 17px ' + look.mono; x.textAlign = 'right'; x.fillText(String(i + 1).padStart(2, '0'), rx + rw, ry + rh + 48);
    x.globalAlpha = 1;
  });
  x.textAlign = 'left';
  return c;
}
/**
 * A trip: whoever is in the photo taken to each place in turn, in what the words dress them in, and a helmet wherever
 * there is no air; laid out as a contact sheet with each place written under it. Odd numbers end at home, the photo as
 * it was. Places named are taken as named; otherwise the studio picks, never the same kind of place twice, and another
 * trip goes where the last did not. With frames: the empty sheet, then each place as it is put down.
 * @param {any} spec @param {any} it @param {Record<string, any>} inputs @param {number} seed @param {boolean} frames
 */
async function voyage(spec, it, inputs, seed, frames) {
  const inp = inputs[it.subject], was = inp?.trip || inp?.recipe || null, fromId = was?.from && inputs[was.from] ? was.from : it.subject, source = inputs[fromId];
  const src = await P.fromBlob(source.blob, P.MAX), mask = await subjectOf(source), words = spec.text || '', who = source.handle || 'it';
  // the room's hands, loaded before anything is written in them
  const look = paperLook(); await Promise.all([look.display, look.hand, look.mono].map(f => document.fonts?.load('40px ' + f).catch(() => null)));
  // where to: the places named, then the studio's picks, not the same kind of place twice
  const landOf = (/** @type {string} */ w) => { const d = P.sceneFrom(w, null, 1); return d.inside ? 'inside:' + w : d.place || d.land; };
  const stops = /** @type {{ words: string, caption: string, said: string, seed: number }[]} */ ([]), lands = new Set();
  for (const p of it.places || []) { const bare = p.replace(/^(?:on|in|at|to)\s+/i, ''); stops.push({ words: p, caption: cap(bare), said: bare, seed: 0 }); lands.add(landOf(p)); }
  if (stops.length < 2) {
    const been = new Set((inp?.trip?.places || []).map((/** @type {any} */ p) => p.words)), r = rng(seed), left = TRIPS.filter(([w]) => !been.has(w));
    while (stops.length < 4 && left.length) {
      const [w, caption, said] = left.splice(been.size ? Math.floor(r() * left.length) : 0, 1)[0], land = landOf(w);
      if (lands.has(land)) continue;
      lands.add(land); stops.push({ words: w, caption, said, seed: 0 });
    }
  }
  stops.forEach((s, i) => { s.seed = seed + i * 31; });
  const dress = D.dressFrom(words) || was?.dress || null, bare = bareHeaded(words) || !!was?.bare;
  const aspect = src.height / src.width, L = tripLayout(stops.length, aspect), home = stops.length % 2 === 1;
  const day = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), route = stops.map(s => s.caption.split(',')[0]).join('  ·  ');
  const cells = /** @type {{ canvas: CanvasImageSource | null, caption: string }[]} */ ([...stops.map(s => ({ canvas: null, caption: s.caption })), ...(home ? [{ canvas: null, caption: 'And home' }] : [])]);
  const layers = frames ? [{ label: 'The route: ' + stops.map(s => s.said).join(', '), canvas: half(tripSheet(L, cells, route, day)), reveal: 'fade' }] : null;
  const helmeted = /** @type {boolean[]} */ ([]);
  stops.forEach((s, i) => {
    /** @type {Recipe} */ const rec = { from: fromId, scene: { words: s.words, seed: s.seed, edits: [] }, ramp: null, dress, bare, look: null, adjust: [], seed: s.seed };
    const made = remake(rec, src, mask, false, s.seed);
    helmeted.push(!!made.because);
    cells[i].canvas = made.canvas;
    layers?.push({ label: s.caption + (made.because ? ', in a helmet: ' + made.because : ''), canvas: half(tripSheet(L, cells, route, day)), reveal: 'sweep' });
  });
  if (home) { cells[cells.length - 1].canvas = src; layers?.push({ label: 'And home', canvas: half(tripSheet(L, cells, route, day)), reveal: 'fade' }); }
  const list = stops.map((s, i) => s.said + (helmeted[i] ? ' in a helmet' : '')), spoken = list.length > 1 ? list.slice(0, -1).join(', ') + (list.length > 2 ? ',' : '') + ' and ' + list[list.length - 1] : list[0];
  return {
    canvas: tripSheet(L, cells, route, day), note: 'a trip: ' + stops.map(s => s.said).join(', '), layers, alpha: false, recipe: null,
    say: who + (dress?.persona ? ', as ' + dress.persona.name : '') + ', on a trip: ' + spoken + '.', next: ['Another trip', 'Take them to Paris, Kyoto and Mars', 'In watercolour'],
    trip: { from: fromId, places: stops, dress, bare, home, rects: L.rects, size: [L.SW, L.SH], paint: [src.width, src.height] },
  };
}
/** A hint from a picture laid in a frame of a larger one (at: the frame, in fractions of it), as that one shows it. @param {any} o @param {number[]} at */
function intoFrame(o, at) {
  const [fx, fy, fw, fh] = at, X = (/** @type {number} */ v) => fx + v * fw, Y = (/** @type {number} */ v) => fy + v * fh, q = { ...o, s: fw, sy: fh, clip: at };
  if (o.box) q.box = [X(o.box[0]), Y(o.box[1]), o.box[2] * fw, o.box[3] * fh];
  for (const k of ['at', 'sun']) if (o[k]) q[k] = [X(o[k][0]), Y(o[k][1])];
  if (o.pts) q.pts = o.pts.map((/** @type {number[]} */ p) => [X(p[0]), Y(p[1])]);
  if (o.rects) q.rects = o.rects.map((/** @type {any[]} */ r) => [X(r[0]), Y(r[1]), r[2] * fw, r[3] * fh, r[4], r[5]]);
  if (o.path) q.path = [X(o.path[0]), o.path[1] * fw];
  if (o.avoid) q.avoid = [X(o.avoid[0]), Y(o.avoid[1]), o.avoid[2] * fw];
  if (o.holes) q.holes = o.holes.map((/** @type {number[]} */ h) => [X(h[0]), Y(h[1]), h[2] * fw, h[3] * fh]);
  if (o.pivot) q.pivot = [X(o.pivot[0]), Y(o.pivot[1])];
  if (o.devil) q.devil = [X(o.devil[0]), Y(o.devil[1]), o.devil[2] * fh];
  if (typeof o.r === 'number') q.r = o.r * fw;
  return q;
}
/** One stop of a trip as a recipe: the place, and them dressed for it. @param {any} t @param {any} p @returns {Recipe} */
const stopRecipe = (t, p) => ({ from: t.from, scene: { words: p.words, seed: p.seed, edits: [] }, ramp: null, dress: t.dress, bare: t.bare, look: null, adjust: [], seed: p.seed });
/**
 * A trip's sheet, alive: every frame on it playing what moves in its place, behind whoever stands in it there, and each
 * kept to its own frame. Painted at the size each place was painted at, so a town's windows are where they were.
 * @param {any} print @param {any} source
 */
async function tripLife(print, source) {
  const t = print.provenance.trip, [SW, SH] = t.size || [print.w, print.h], [pw, ph] = t.paint || [768, 1024];
  const src = await sizedOf(source, 256), mask = await subjectOf(source), hints = /** @type {any[]} */ ([]);
  const front = P.make(320, Math.round(320 * SH / SW)), fc = /** @type {CanvasRenderingContext2D} */ (front.getContext('2d'));
  t.places.forEach((/** @type {any} */ p, /** @type {number} */ i) => {
    const [rx, ry, rw, rh] = t.rects[i], at = [rx / SW, ry / SH, rw / SW, rh / SH], rec = stopRecipe(t, p), desc = placeOf(rec, mask);
    if (!desc) return;
    const L = P.lifeIn(desc, pw, ph), win = L.hints.find(o => o.k === 'window'), pane = win ? intoFrame(win, at) : null;
    for (const o of L.hints) if (o.k !== 'arch' && o.k !== 'window') { const q = intoFrame(o, at); if (q.win) q.pane = pane; hints.push(q); }
    const box = /** @type {[number, number, number, number]} */ ([at[0] * front.width, at[1] * front.height, at[2] * front.width, at[3] * front.height]);
    fc.drawImage(L.front, ...box);
    if (mask) { const { plan } = planFor(rec, desc); fc.drawImage(plan ? D.dressUp(src, mask, plan, P.make(src.width, src.height), null, p.seed).canvas : P.composite(src, mask, null), ...box); }
  });
  return hints.length ? { hints, front } : null;
}
/**
 * A trip, to be travelled in a film: for each place, the place painted without them, them as they are dressed there,
 * and what moves there; then home, the photo as it was, and them on nothing. At a width w.
 * @param {any} print @param {any} source @param {number} w
 */
export async function tripOf(print, source, w) {
  const t = print.provenance?.trip;
  if (!t || !source?.blob) return null;
  const big = await P.fromBlob(source.blob, P.MAX), sw = w, sh = Math.round(w * big.height / big.width), src = P.copy(big, sw, sh), mask = await subjectOf(source);
  const me = mask ? P.composite(src, mask, null) : null;
  const stops = t.places.map((/** @type {any} */ p) => {
    const rec = stopRecipe(t, p), desc = placeOf(rec, mask) || P.sceneFrom(p.words, null, p.seed), back = P.scene(desc, sw, sh), { plan } = planFor(rec, desc);
    const person = mask ? (plan ? D.dressUp(src, mask, plan, P.make(sw, sh), null, p.seed).canvas : me) : null;
    const L = P.lifeIn(desc, sw, sh); if (person) L.front.getContext('2d')?.drawImage(person, 0, 0, L.front.width, L.front.height);
    return { back, person, life: { ...L, person, picture: back }, caption: p.caption };
  });
  return { stops, home: src, me };
}
/** What a recipe has them wear: what was asked, and a helmet where there is no air unless they go without. @param {Recipe} rec @param {any} desc */
function planFor(rec, desc) {
  const because = desc && !rec.bare ? AIRLESS[desc.land] || '' : '';
  const plan = rec.dress || because ? { ...(rec.dress || { pieces: [], persona: null, colours: {}, place: null, glow: null, trim: false, sparkle: false, confetti: false, off: [] }) } : null;
  if (plan) plan.pieces = [...plan.pieces, ...(because && !plan.pieces.includes('helmet') ? ['helmet'] : [])];
  return { plan: plan?.pieces.length ? plan : null, because: plan?.pieces.includes('helmet') && because && !rec.dress?.pieces?.includes('helmet') ? because : '' };
}
/**
 * A recipe's place, read again (with every change asked of it since), or null when they stay where they were. Given the
 * outline of who is put there, a landmark in it stands clear of them.
 * @param {Recipe} rec @param {HTMLCanvasElement | null} [mask]
 */
function placeOf(rec, mask = null) {
  const desc = rec.scene ? P.sceneAgain(rec.scene) : null;
  if (desc && rec.ramp && !desc.ramp && !desc.pal) desc.ramp = rec.ramp;
  if (desc && mask) desc.clear = clearOf(mask);
  return desc;
}
/** Where a landmark can stand beside someone: on their wider side, about the middle of what is clear there. @param {HTMLCanvasElement} mask */
function clearOf(mask) {
  const f = D.figureOf(mask, mask.width, mask.height); if (!f.found) return null;
  const l = (f.cx - f.headW * .9) / mask.width, r = (f.cx + f.headW * .9) / mask.width;
  return l >= 1 - r ? { side: -1, at: Math.max(.15, l / 2 + .03) } : { side: 1, at: Math.min(.85, (1 + r) / 2 - .03) };
}
/** What is behind them: the place painted, one plain colour, or nothing at all. @param {Recipe} rec @param {any} desc @param {number} w @param {number} h */
const backOf = (rec, desc, w, h) => desc ? P.scene(desc, w, h) : rec.plain ? P.plainBackdrop(w, h, rec.plain) : rec.cut ? P.make(w, h) : null;
/**
 * Someone's layer laid over a place where they stand: moved across by x (of the width), and nearer or further (s, about
 * their feet at the bottom edge, so they never float). fx is their middle, as a fraction of the width.
 * @param {HTMLCanvasElement} back @param {HTMLCanvasElement} overlay @param {{ x: number, s: number } | null} stand @param {number} fx
 */
export function placeOn(back, overlay, stand, fx) {
  const w = back.width, h = back.height, out = P.copy(back), x = out.getContext('2d');
  x.save();
  if (stand) { x.translate((fx + stand.x) * w, h); x.scale(stand.s, stand.s); x.translate(-fx * w, -h); }
  x.drawImage(overlay, 0, 0, w, h); x.restore();
  return out;
}
/**
 * A recipe, made from its photo. With frames: who it is of, found; the place, layer by layer; then each piece; then the
 * look over all of it, and a profile picture's square.
 * @param {Recipe} rec @param {HTMLCanvasElement} src @param {HTMLCanvasElement | null} mask @param {boolean} frames @param {number} seed
 */
function remake(rec, src, mask, frames, seed) {
  const desc = placeOf(rec, mask); if (desc && frames) desc.layers = [];
  const w = src.width, h = src.height, bd = backOf(rec, desc, w, h), { plan, because } = planFor(rec, desc), pieces = frames ? /** @type {any[]} */ ([]) : null;
  // where they stand in the place, when they were moved there by hand
  const stand = rec.stand && bd && mask ? rec.stand : null, fx = stand ? D.figureOf(mask, w, h).cx / w : .5;
  let canvas, person = null;
  if (stand) {
    person = plan ? D.dressUp(src, mask, plan, P.make(w, h), pieces, seed).canvas : P.composite(src, mask, null);
    canvas = placeOn(/** @type {HTMLCanvasElement} */ (bd), person, stand, fx);
  } else canvas = plan ? D.dressUp(src, mask, plan, bd, pieces, seed).canvas : bd ? P.composite(src, mask, bd) : P.copy(src);
  if (rec.adjust?.length) canvas = P.adjust(canvas, rec.adjust);
  const look = rec.look ? LOOKS.find(l => l.id === rec.look) : null;
  if (look) canvas = P.grade(canvas, look, look.wash ? .9 : .7, seed);
  let layers = null;
  if (frames) {
    const small = half(src), plainHalf = stand ? half(P.composite(src, mask, null)) : null, backHalf = stand && bd ? half(bd) : null;
    layers = [found(src, mask),
      ...(desc?.layers || []).map((/** @type {any} */ l) => ({ label: l.label, canvas: stand && plainHalf ? placeOn(l.canvas, plainHalf, stand, fx) : P.composite(small, mask, l.canvas) })),
      ...(pieces || []).map(f => ({ ...f, canvas: stand && backHalf ? placeOn(backHalf, f.canvas, stand, fx) : f.canvas, reveal: 'fade' }))];
    if (look || rec.adjust?.length) layers.push({ label: look ? 'All of it in ' + look.name : cap(P.adjustmentsIn(rec.adjust.join(' '))?.said.join(', ') || 'Adjusted'), canvas: half(canvas) });
  }
  // a profile picture: the square around the face, found in the photo itself, so a helmet or a crown is not taken for it
  if (rec.profile) {
    const box = P.portraitBox(src, mask), size = Math.max(256, Math.min(768, src.width)), sq = P.make(size, size);
    layers?.push({ label: 'A square around the face', canvas: half(P.squareOn(canvas, box)), reveal: 'fade' });
    sq.getContext('2d').drawImage(canvas, box.sx, box.sy, box.side, box.side, 0, 0, size, size); canvas = sq;
  }
  return { canvas, desc, plan, because, layers };
}
/**
 * The two layers of a recipe's picture, for moving someone about in it by hand: the place behind, and the person in what
 * they wear on nothing, with their middle (fx) and where they stand now. Null when there is no place to move them in.
 * @param {Recipe} rec @param {any} input the photo it was made from @param {number} w
 */
export async function standStage(rec, input, w) {
  const src = await sizedOf(input, w), mask = await subjectOf(input);
  if (!mask) return null;
  const desc = placeOf(rec, mask), back = backOf(rec, desc, src.width, src.height);
  if (!back) return null;
  const { plan } = planFor(rec, desc), person = plan ? D.dressUp(src, mask, plan, P.make(src.width, src.height), null, 1).canvas : P.composite(src, mask, null);
  return { back, person, fx: D.figureOf(mask, src.width, src.height).cx / src.width, stand: rec.stand || { x: 0, s: 1 } };
}
/**
 * How a picture the device made was made, frame by frame, again: for a film of its making. A recipe is made again from
 * its photo, a scene painted again from its words; the steps come as the card showed them. Null for anything else.
 * @param {any} print @param {any} [source] the photo a recipe was made from
 */
export async function makingOf(print, source = null) {
  const rec = print.provenance?.recipe, kept = print.provenance?.scene;
  if (rec && source?.blob) {
    const src = await P.fromBlob(source.blob, P.MAX), mask = await subjectOf(source), made = remake(rec, src, mask, true, rec.seed ?? 7);
    return { start: half(src), frames: made.layers || [] };
  }
  if (kept) {
    const desc = P.sceneAgain(kept); desc.layers = [];
    const c = P.scene(desc, 768, 1024), look = kept.look ? LOOKS.find(l => l.id === kept.look) : null, frames = [...desc.layers];
    if (look) frames.push({ label: 'All of it in ' + look.name, canvas: P.copy(P.grade(c, look, .6, kept.seed), 384, 512) });
    return { start: null, frames };
  }
  return null;
}
/**
 * What moves in a picture the device made, for while it is looked at: the painter's hints for its place (stars, water,
 * rain, a lamp), and what stands in front of them, the things painted there and whoever was put there, in what they
 * wear, where they stand. With a sun held somewhere else, or someone moved by hand, as the picture is shown just then.
 * Null when nothing in it moves, or when it was finished in a look or cut to a square: a painting holds still.
 * @param {any} print @param {any} [source] the photo a recipe was made from
 * @param {{ sun?: number[] | null, stand?: { x: number, s: number } | null }} [o]
 * @returns {Promise<import('../ui/life.js').Life | null>}
 */
export async function lifeOf(print, source = null, o = {}) {
  if (print.provenance?.trip) return source?.blob ? tripLife(print, source) : null;
  const rec = print.provenance?.recipe, kept = print.provenance?.scene;
  if (rec ? !rec.scene || rec.look || rec.profile || rec.adjust?.length || !source?.blob : !kept || kept.look) return null;
  const mask = rec ? await subjectOf(source) : null;
  if (rec && !mask) return null;
  const desc = rec ? placeOf(rec, mask) : P.sceneAgain(kept);
  if (!desc) return null;
  if (o.sun) P.setSun(desc, o.sun);
  const w = print.w || 768, h = print.h || 1024, { hints, front, bare, cut } = P.lifeIn(desc, w, h);
  let person = null;
  if (rec && mask) {
    const src = await sizedOf(source, 192);
    const { plan } = planFor(rec, desc), sw = src.width, sh = src.height, fig = D.figureOf(mask, sw, sh), fx = fig.cx / sw, stand = o.stand || rec.stand || null;
    const dressed = plan ? D.dressUp(src, mask, plan, P.make(sw, sh), null, rec.seed ?? 7).canvas : P.composite(src, mask, null);
    person = placeOn(P.make(front.width, front.height), dressed, stand, fx); front.getContext('2d')?.drawImage(person, 0, 0);
    // a fairy's sparkle about the head, a party's confetti coming down: where the person stands now
    const at = (/** @type {number} */ x, /** @type {number} */ y) => stand ? [fx + stand.x + (x - fx) * stand.s, 1 + (y - 1) * stand.s] : [x, y], k = stand?.s || 1;
    if (plan?.sparkle) { const [x0, y0] = at((fig.cx - fig.headW * 1.3) / sw, Math.max(0, fig.top / sh - .06)); hints.push({ k: 'sparkle', box: [x0, y0, fig.headW * 2.6 / sw * k, (fig.headH / sh + .2) * k] }); }
    if (plan?.confetti) hints.push({ k: 'confetti', box: [0, 0, 1, 1] });
  }
  if (!hints.some(o => !['window', 'arch'].includes(o.k))) return null;
  // the picture itself, for what moves whole (a boat, a balloon) to be cut from
  const picture = bare && print.blob ? await P.fromBlob(print.blob, Math.max(w, h)) : null;
  return { hints, front, bare, cut, person, picture };
}
/** Where someone was moved to, in words: "further back and to the left". @param {{ x: number, s: number }} st */
export function standWords(st) {
  const depth = st.s < .62 ? 'far back' : st.s < .9 ? 'further back' : st.s > 1.1 ? 'closer' : '';
  const side = Math.abs(st.x) < .05 ? (depth ? '' : 'in the middle') : (Math.abs(st.x) < .16 ? 'a little to the ' : 'to the ') + (st.x < 0 ? 'left' : 'right');
  return [depth, side].filter(Boolean).join(' and ') || 'where they were';
}
const cap = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Somewhere to go when the words only say "somewhere else". */
const ELSEWHERE = ['on the moon', 'a beach in Lisbon at golden hour', 'a lavender field at dusk', 'above the clouds at sunrise', 'a lighthouse at sunset', 'a Tokyo street at night, neon', 'under the sea', 'a snowy forest at dawn', 'a desert motel at golden hour', 'a jazz bar at midnight', 'a lemon grove on the Amalfi coast'];
/**
 * A recipe with one more ask in it, or null when the ask is not one a recipe takes (a pin, a blend, a cut-out). What
 * changed comes with it, for the reply.
 * @param {Recipe} rec @param {any} spec @param {any} it @param {string} words @param {number} seed
 */
function recipeAfter(rec, spec, it, words, seed) {
  const r = /** @type {Recipe} */ (JSON.parse(JSON.stringify(rec))), t = words.toLowerCase(), did = /** @type {Record<string, any>} */ ({});
  r.seed = seed;
  if (it.pins?.length) return null;
  if (spec.stand && typeof spec.stand.x === 'number' && typeof spec.stand.s === 'number') {
    r.stand = { x: Math.max(-.5, Math.min(.5, spec.stand.x)), s: Math.max(.3, Math.min(1.3, spec.stand.s)) }; did.stand = standWords(r.stand);
    return { rec: r, did };
  }
  // the background taken away, or one plain colour behind them; a profile picture, whatever is behind
  const bg = /\b(?:background|backdrop|bg)\b/.test(t), colour = bg ? Object.keys(P.COLOUR_WORDS).find(k => new RegExp('\\b' + k + '\\b').test(t)) : undefined;
  const cut = /\btransparent\b|\bcut (?:it |her |him |them |@[a-z]{1,2} )?out\b|\bsticker\b|\b(?:remove|delete|erase|lose|drop|get rid of|take away|without|no)\b[^.]*\b(?:background|backdrop|bg)\b/.test(t);
  if (cut && !colour) { r.scene = null; r.plain = null; r.cut = true; did.cut = true; }
  else if (bg && (colour || /\b(?:plain|blank|clean|solid|simple|studio|neutral|seamless)\b/.test(t))) { r.scene = null; r.cut = false; r.plain = P.COLOUR_WORDS[/** @type {keyof typeof P.COLOUR_WORDS} */ (colour || 'white')] || '#f4f1ec'; did.plain = colour || 'white'; }
  if (/profile (?:pic(?:ture)?|photo|image)|\bavatar\b|\bpfp\b|head ?shot/.test(t)) { r.profile = true; did.profile = true; }
  if (did.cut || did.plain) return { rec: r, did };
  // a new place: said, chosen from the ideas, or just "somewhere else"
  const anew = /\b(?:somewhere else|another place|elsewhere|a different place|somewhere new|take (?:her|him|them|me) somewhere)\b/.test(t);
  const where = spec.backdrop?.words || it.where || (anew ? ELSEWHERE.filter(p => p !== r.scene?.words)[Math.abs(seed) % (ELSEWHERE.length - 1)] : null);
  if (where) { r.scene = { words: where, seed, edits: [] }; r.ramp = spec.backdrop?.ramp || null; r.cut = false; r.plain = null; did.place = true; }
  // what they wear: someone new to be changes the costume; a piece asked for is added; "without the helmet" takes it off
  const add = D.dressFrom(words), off = D.takenOff(words);
  if (add?.persona) { r.dress = add; did.dress = true; if (!where && add.place && !r.scene && !namesPlace(words)) { r.scene = { words: add.place, seed, edits: [] }; did.place = true; } }
  else if (add) { const cur = r.dress || { ...add, pieces: [] }; cur.pieces = [...new Set([...cur.pieces, ...add.pieces])]; cur.colours = { ...cur.colours, ...add.colours }; r.dress = cur; did.dress = true; }
  if (off.length && r.dress?.pieces.some((/** @type {string} */ p) => off.includes(p))) { r.dress.pieces = r.dress.pieces.filter((/** @type {string} */ p) => !off.includes(p)); if (!r.dress.pieces.length) r.dress = null; did.dress = true; }
  if (bareHeaded(words) && !r.bare) { r.bare = true; did.bare = true; }
  if (add && !where && namesPlace(words) && !did.place) { r.scene = { words, seed, edits: [] }; did.place = true; }
  // the hour, the weather, things in the scene: the place painted again with the change, or with the sun where it was put
  const sun = Array.isArray(spec.sun) ? spec.sun : null;
  if (r.scene && !did.place && !did.dress) {
    const d = P.sceneAgain(r.scene), changes = P.changeScene(d, words, { light: !sun });
    if (sun) changes.unshift(P.hourWords(sun));
    if (changes.length) { r.scene.edits = [...(r.scene.edits || []), words, ...(sun ? [{ sun }] : [])]; did.hour = changes; }
  }
  // a look over all of it, or a change any picture takes
  if (it.look && it.op === 'restyle') { r.look = it.look.id; did.look = it.look.name; }
  const adj = !did.hour && !did.look && !did.place && !did.dress ? P.adjustmentsIn(t) : null;
  if (adj) { r.adjust = [...(r.adjust || []), ...adj.ops]; did.adjust = adj.said; }
  return Object.keys(did).length ? { rec: r, did } : null;
}
/** Where the words put someone, as they said it: "in a library", "on a rooftop in Tokyo". @param {string} words */
function placeSaid(words) { const m = words.match(/\b(in|at|on|by|under|inside|above)\s+((?:a|an|the|some)\s+[^,.!?]{2,40}|[A-Z][^,.!?]{1,40})[.!?]*$/); return m ? m[1] + ' ' + m[2].trim() : ''; }
/** What a recipe's new ask did, in a line. */
function recipeSay(/** @type {string} */ who, /** @type {any} */ after, /** @type {any} */ made, /** @type {string} */ words) {
  const d = after.did, there = made.desc ? (/\bmars\b/i.test(after.rec.scene?.words || '') ? 'on Mars' : THERE[made.desc.land] || '') : '';
  if (d.stand) return `${who}, ${d.stand}.`;
  if (d.cut) return `${who}, cut out: the background is gone.`;
  if (d.plain) return `${who}, on plain ${d.plain}${d.profile ? ', as a profile picture' : ''}.`;
  if (d.profile && !d.place && !d.dress) return `${who}, as a profile picture: a square around the face${made.plan ? ', ' + D.pieceList(made.plan.pieces) + ' and all' : ''}.`;
  if (d.place || d.dress) {
    if (made.plan) return dressSay(who, made.plan, made.desc, made.because, after.rec.scene?.words || '').replace(/\.$/, after.rec.bare && made.desc && AIRLESS[made.desc.land] ? ', without a helmet.' : '.');
    return `${who}, ${there || (made.desc ? 'somewhere new: ' + (after.rec.scene?.words || '') : 'as they were')}${after.rec.bare && made.desc && AIRLESS[made.desc.land] ? ', without a helmet' : ''}.`;
  }
  if (d.bare) return `${who}, ${there || 'there'}, without a helmet.`;
  if (d.hour) return `${who}, painted again: ${d.hour.join(', ')}.`;
  if (d.look) return `${who}, in ${d.look}.`;
  return `${who}, ${d.adjust.join(', ')}.`;
}
/** What was done, in a line: "A, as a superhero: a cape, the city at night behind." */
function dressSay(/** @type {string} */ who, /** @type {any} */ plan, /** @type {any} */ desc, /** @type {string} */ because, words = '') {
  const what = D.pieceList(plan.pieces.filter((/** @type {string} */ p) => !(because && p === 'helmet')));
  const said = placeSaid(words.replace(/\bwithout\b.*$/i, '').trim());
  const there = !desc ? '' : /\bmars\b/i.test(words) ? 'on Mars' : THERE[desc.land] || said || (desc.land === 'city' ? (desc.light === 'night' ? 'the city at night behind' : 'the city behind') : 'somewhere new');
  const head = plan.persona ? `${who}, as ${plan.persona.name}${what ? ': ' + what : ''}` : `${who}${what ? ', with ' + what : ''}`;
  return head + (there ? ', ' + there : '') + (because ? ', in a helmet: ' + because : '') + '.';
}
/** Half size, for a frame on the card. @param {HTMLCanvasElement} c */
const half = c => P.copy(c, Math.round(c.width / 2), Math.round(c.height / 2));
/** The first frame of anything done to a person: the room dimmed, a light along who the device found. */
const found = (/** @type {HTMLCanvasElement} */ src, /** @type {HTMLCanvasElement | null} */ mask) => ({ label: mask ? 'Who it is of, found on this device' : 'A guess at who it is of', canvas: half(P.traced(src, mask)), reveal: 'bloom' });

/** A new picture's scene from its words: the look they name (a medium, never a mood), and the room's light when the words bring no colours. */
function freshScene(spec, words, seed) {
  const look = spec.intent.look || lookFromWords(words, LOOKS, { moods: false }), desc = P.sceneFrom(words, look?.ramp || null, seed);
  if (!desc.pal && !desc.ramp && spec.room?.colors) desc.pal = spec.room.colors;
  return { look, desc };
}
/**
 * A sketch's scene with an edit applied, as far as the painter understands it (changes lists what it did). A sun put
 * somewhere by hand sets the hour, whatever the words say about it.
 * @param {any} was @param {string} words @param {number[] | null} [sun]
 */
function editedScene(was, words, sun = null) {
  const desc = P.sceneAgain(was), first = was.look ? LOOKS.find(l => l.id === was.look) : null;
  if (first?.ramp && !desc.pal) desc.ramp = first.ramp;
  const changes = P.changeScene(desc, words, { light: !sun });
  if (sun) { P.setSun(desc, sun); changes.unshift(P.hourWords(sun)); }
  return { desc, first, changes };
}
const thumbs = new WeakMap(), subjects = new WeakMap();
/** Who or what a picture is of: the segmenter's outline of whatever is in the middle, found once per picture; null if it cannot tell. */
const subjectOf = (/** @type {any} */ input) => {
  if (!input?.blob) return Promise.resolve(null);
  if (!subjects.has(input.blob)) subjects.set(input.blob, P.fromBlob(input.blob, 512).then(async c => {
    // a person in a picture is usually a face above the middle and a body below it: ask about both, keep them together
    const face = await selectAt(c, .5, .45); if (face.guessed) return null;
    const body = await selectAt(c, .5, .84).catch(() => null);
    if (!body || body.guessed || body.area > .6) return P.whole(face.mask);   // that was the room, not the body
    const both = P.make(face.mask.width, face.mask.height), x = both.getContext('2d'); x.drawImage(face.mask, 0, 0); x.drawImage(body.mask, 0, 0, both.width, both.height);
    return P.whole(both);
  }).catch(() => null));
  return subjects.get(input.blob);
};
const thumbOf = async (/** @type {any} */ input) => { if (!thumbs.has(input.blob)) thumbs.set(input.blob, await P.fromBlob(input.blob, 256)); return thumbs.get(input.blob); };
const sized = new WeakMap();
/** A photo at about a width, kept: the sun is dragged over a recipe many times a second. @param {any} input @param {number} w */
const sizedOf = async (input, w) => { const k = Math.round(w / 64) * 64; let m = sized.get(input.blob); if (!m) sized.set(input.blob, m = new Map()); if (!m.has(k)) m.set(k, await P.fromBlob(input.blob, k)); return m.get(k); };

/**
 * A proof: what the device would paint for a request, small and at once, while it is still being typed. The same
 * reading as the sketch it will make (a new picture from the same seed, a sketch painted again, a look, a reference's
 * colours); null when there is nothing honest to show, such as a change it would only guess at.
 * @param {any} spec @param {Record<string, any>} inputs
 * @returns {Promise<HTMLCanvasElement | null>}
 */
export async function proofOf(spec, inputs, w = 192, h = 256) {
  const it = spec.intent, words = spec.text || '', was = it.subject && inputs[it.subject];
  if (!was && it.op === 'create') {
    if (words.replace(/@[A-Za-z]{1,2}\b/g, '').replace(/[^\p{L}]/gu, '').length < 3) return null;
    const { look, desc } = freshScene(spec, words, spec.seed), c = P.scene(desc, w, h);
    return look ? P.grade(c, look, .6, spec.seed) : c;
  }
  if (was?.scene && (it.op === 'edit' || it.op === 'restyle')) {
    const { desc, first, changes } = editedScene(was.scene, words, Array.isArray(spec.sun) ? spec.sun : null);
    if (changes.length) { const c = P.scene(desc, w, h), medium = lookFromWords(words, LOOKS, { moods: false }) || first; return medium ? P.grade(c, medium, .6, 1) : c; }
  }
  const rec = was?.recipe, source = rec && inputs[rec.from];
  if (rec && source && ['edit', 'restyle', 'backdrop', 'remove'].includes(it.op)) {
    const after = recipeAfter(rec, spec, it, words, Number.isFinite(spec.seed) ? spec.seed : 1);
    if (after) return remake(after.rec, await sizedOf(source, Math.max(w, 256)), await subjectOf(source), false, Number.isFinite(spec.seed) ? spec.seed : 1).canvas;
  }
  if (was?.blob && it.op === 'backdrop') {
    const t = await thumbOf(was), where = spec.backdrop?.words || it.where || words;
    return placed(t, await subjectOf(was), where, words, Number.isFinite(spec.seed) ? spec.seed : 1, spec.backdrop?.ramp || null).canvas;
  }
  if (was?.blob && (it.op === 'edit' || (it.op === 'backdrop' && !spec.backdrop) || (it.op === 'restyle' && D.dressFrom(words)))) { const pe = await photoEdit(await thumbOf(was), it, words, was); if (pe) return pe.canvas; }
  if (was?.blob && it.op === 'restyle' && it.look) return P.grade(await thumbOf(was), it.look, it.look.strength ?? .9, 1);
  const ref = it.refs?.find((/** @type {any} */ r) => r.role === 'style' && inputs[r.id]);
  if (was?.blob && it.op === 'reference' && ref) return P.grade(await thumbOf(was), { ramp: P.paletteOf(await thumbOf(inputs[ref.id]), 5), keep: .3, grain: .03, bloom: .15, vignette: .15 }, .92, 1);
  return null;
}

/** The words the device knew, as a line for the card: Heard “rainy” · “Tokyo” · “jazz bar”. */
function heard(text) {
  const words = heardSpans(text).map(s => text.slice(s.at, s.end)).slice(0, 6);
  return words.length ? 'Heard ' + words.map(w => '“' + w + '”').join(' · ') : '';
}

const SAY = {
  create: (s, h, shows = []) => {
    // what was asked, without the asking, and what the sketch shows of it
    const what = s.text.replace(/@[A-Za-z]{1,2}\b\s*/g, '').replace(/^\s*(?:please\s+)?(?:(?:paint|draw|sketch|make|create|imagine|render|generate|picture|show)(?: me| us)?|give me)\s+/i, '').replace(/[.!?]+$/, '').trim();
    // "A lighthouse…" said back as "a lighthouse…", so it is never read as the picture called A
    const of = (what.length > 64 ? what.slice(0, 63) + '…' : what).replace(/^(?:A|An|The|Some|Two|Three|My|Our|Your|This)(?= [a-z])/, m => m.toLowerCase());
    return shows.length ? `A first sketch of ${of}: ${shows.slice(0, 3).join(', ')}.` : `A first sketch of “${of}”.`;
  },
  edit: (s, h) => `${h(s.intent.subject)}, changed as you asked.`, restyle: (s, h) => `${h(s.intent.subject)}, in ${s.intent.look?.name || 'a new look'}.`,
  reference: (s, h) => `${h(s.intent.subject)} in ${h(s.intent.refs.find(r => r.role === 'style')?.id)}’s colours.`, blend: (s, h) => `${h(s.intent.subject)} and ${h(s.intent.refs[0]?.id)}, folded into one.`,
  region: (s, h) => `Changed what you pinned on ${h(s.intent.subject)}.`, remove: (s, h) => `Cleared it from ${h(s.intent.subject)}.`,
  backdrop: (s, h) => { const where = s.backdrop?.name?.toLowerCase() || s.intent.where; return where ? `${h(s.intent.subject)}, somewhere new: ${where}.` : `${h(s.intent.subject)}, somewhere new.`; }, vary: (s, h) => `${['One', 'Two', 'Three', 'Four'][s.n - 1] || s.n} takes on ${h(s.intent.subject)}.`,
};
const NEXT = {
  create: ['Make it night', 'In watercolour', 'Two more like this'], edit: ['Warmer', 'Try a backdrop', 'Two more like this'], restyle: ['Softer', 'Stronger', 'Try a backdrop'],
  reference: ['Less of the reference', 'Two more like this', 'In Film ’77'], blend: ['More of the first', 'Make it dreamier'], region: ['Brighter', 'Try a backdrop', 'Three variations'],
  remove: ['Bring it back', 'Try a backdrop'], backdrop: ['Somewhere else', 'Golden hour light', 'Make it night'], vary: ['More like the first', 'In watercolour'],
};

export const local = {
  kind: 'device',
  /** @param {any} spec @param {Record<string, any>} inputs */
  async *turn(spec, inputs) {
    const t0 = performance.now(), n = spec.n || 1, total = PACE[spec.pace || 'fine'] * (1 + (n - 1) * .3);
    const gate = async ms => { await sleep(ms); if (cancelled.has(spec.id)) throw Object.assign(new Error('Stopped.'), { cancelled: true }); };
    // something new is painted in layers you can watch, each with its note; a picture you have develops as before
    const was = spec.intent.subject && inputs[spec.intent.subject];
    const paints = !was || spec.intent.op === 'create' || spec.intent.op === 'trip' || (!!was.scene && ['edit', 'restyle', 'vary'].includes(spec.intent.op));
    // the making starts at once, while the request is still being read: the reading is real time, not a pause
    const making = (async () => { const out = []; for (let i = 0; i < n; i++) out.push(await sketch(spec, inputs, i, P.MAX, { layers: true })); return out; })();
    making.catch(() => {});
    yield { type: 'accepted', eta: total };
    // a picture you brought is on the card from the start, so the work is seen to begin from it
    const base = was?.blob && !paints ? await P.fromBlob(was.blob, 512).catch(() => null) : null;
    if (base) for (let i = 0; i < n; i++) yield { type: 'partial', index: i, canvas: base, layer: true, reveal: 'fade', base: true };
    yield { type: 'stage', stage: 'read' };
    const words = paints ? heard(spec.text || '') : ''; if (words) yield { type: 'note', text: words };
    await gate(total * (paints ? .1 : .14));
    yield { type: 'plan', plan: { op: spec.intent.op, note: 'read on this device' } };
    yield { type: 'stage', stage: 'plan' }; await gate(total * (paints ? .04 : .14));
    yield { type: 'stage', stage: 'draw' };
    const made = await making;
    // the card already shows the picture as it was, so a first frame that only repeats it is skipped
    const layers = made.map(m => (m.layers || []).filter((/** @type {any} */ l, k) => !(base && k === 0 && l.label === 'As it was'))), most = Math.max(0, ...layers.map(l => l.length));
    // every frame stays long enough to be seen: a person found glows for a beat, a change sweeps across and settles
    const HOLD = /** @type {Record<string, number>} */ ({ bloom: 1300, fade: 750 }), holds = Array.from({ length: most }, (_, k) => Math.max(total * .7 / most, ...layers.map(l => HOLD[l[k]?.reveal || ''] || 850)));
    // more to show than the estimate allowed for: say so now, rather than run late
    const ends = performance.now() - t0 + holds.reduce((a, b) => a + b, 0) + total * .04 + 400;
    if (ends > total * 1.1) yield { type: 'accepted', eta: Math.round(ends) };
    if (most) {
      for (let k = 0; k < most; k++) {
        if (layers[0][k]) yield { type: 'note', text: layers[0][k].label, quick: true };
        for (let i = 0; i < n; i++) { const l = layers[i][Math.min(k, layers[i].length - 1)]; if (l) yield { type: 'partial', index: i, canvas: l.canvas, layer: true, reveal: l.reveal || null }; }
        await gate(holds[k]);
      }
    } else {
      const steps = made.map(m => P.partials(m.canvas));
      for (let k = 0; k < 3; k++) {
        await gate(total * .17);
        for (let i = 0; i < n; i++) yield { type: 'partial', index: i, canvas: steps[i][k] };
      }
    }
    yield { type: 'stage', stage: 'finish' }; await gate(total * (most ? .04 : .08));
    for (let i = 0; i < n; i++) {
      const c = P.stamp(P.copy(made[i].canvas)), blob = await P.toBlob(c, made[i].alpha ? 'image/png' : 'image/jpeg');
      yield { type: 'result', index: i, blob, w: c.width, h: c.height, provenance: { kind: 'sketch', label: 'Sketch', detail: 'Drawn on this device · ' + made[i].note, ...(made[i].scene ? { scene: made[i].scene } : {}), ...(made[i].recipe ? { recipe: made[i].recipe } : {}), ...(made[i].trip ? { trip: made[i].trip } : {}) } };
    }
    const handle = id => inputs[id]?.handle || 'it';
    const said = made[0]?.say ? made[0].say : made[0]?.changes?.length ? `${handle(spec.intent.subject)}, painted again: ${made[0].changes.join(', ')}.`
      : made[0]?.painted?.length ? `Painted ${made[0].painted.map(p => '“' + p + '”').join(' and ')} into what you pinned on ${handle(spec.intent.subject)}.`
      : (SAY[spec.intent.op] || SAY.edit)(spec, handle, made[0]?.shows || []);
    yield { type: 'reply', text: said, suggestions: made[0]?.next || NEXT[spec.intent.op] || NEXT.edit };
    yield { type: 'done', ms: performance.now() - t0 };
  },
  cancel(id) { cancelled.add(id); },
  /** A first look at a picture just brought, while nobody is waiting: who it is of is then known before it is asked for. @param {any} input */
  glance(input) {
    const look = () => { subjectOf(input); };
    if ('requestIdleCallback' in globalThis) requestIdleCallback(look, { timeout: 3000 }); else setTimeout(look, 800);
  },
};
