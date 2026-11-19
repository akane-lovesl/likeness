/**
 * The showcase studio: everything happens on the device. It reads the request, takes about as long as a pace
 * suggests (so the in-between states can be seen), and answers with sketches from the painter, stamped as sketches.
 * The same sketching gives a live studio's jobs their instant draft.
 */
import * as P from './painter.js';
import { LOOKS, lookFromWords } from './looks.js';
import { sleep, rng, pick } from '../core/dom.js';
import { heardSpans } from '../room/maker.js';

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
      const where = (spec.backdrop?.words || words.replace(/.*?(background|backdrop|behind \w+|setting|surroundings)\s*(to|of|with|into|in|as|:)?\s*/i, '')) || 'a garden at golden hour';
      const bd = P.scene(P.sceneFrom(where, spec.backdrop?.ramp || null, seed), subject.width, subject.height);
      out = P.composite(subject, spec.subjectMask || null, bd); note = spec.subjectMask ? 'subject kept by its mask' : 'subject guessed as the centre';
      break;
    }
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
      const look = it.look || lookFromWords(words) || pick(LOOKS.filter(l => !l.pixel), rnd());
      out = P.grade(subject, variant(look), look.strength ?? .9, seed); note = look.name;
    }
  }
  return { canvas: out, note, layers: kept, shows, scene, changes, painted };
}

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
const thumbs = new WeakMap();
const thumbOf = async (/** @type {any} */ input) => { if (!thumbs.has(input.blob)) thumbs.set(input.blob, await P.fromBlob(input.blob, 256)); return thumbs.get(input.blob); };

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
    const of = what.length > 64 ? what.slice(0, 63) + '…' : what;
    return shows.length ? `A first sketch of ${of}: ${shows.slice(0, 3).join(', ')}.` : `A first sketch of “${of}”.`;
  },
  edit: (s, h) => `${h(s.intent.subject)}, changed as you asked.`, restyle: (s, h) => `${h(s.intent.subject)}, in ${s.intent.look?.name || 'a new look'}.`,
  reference: (s, h) => `${h(s.intent.subject)} in ${h(s.intent.refs.find(r => r.role === 'style')?.id)}’s colours.`, blend: (s, h) => `${h(s.intent.subject)} and ${h(s.intent.refs[0]?.id)}, folded into one.`,
  region: (s, h) => `Changed what you pinned on ${h(s.intent.subject)}.`, remove: (s, h) => `Cleared it from ${h(s.intent.subject)}.`,
  backdrop: (s, h) => `${h(s.intent.subject)}, somewhere new.`, vary: (s, h) => `${['One', 'Two', 'Three', 'Four'][s.n - 1] || s.n} takes on ${h(s.intent.subject)}.`,
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
    const paints = !was || spec.intent.op === 'create' || (!!was.scene && ['edit', 'restyle', 'vary'].includes(spec.intent.op));
    yield { type: 'accepted', eta: total };
    yield { type: 'stage', stage: 'read' };
    const words = paints ? heard(spec.text || '') : ''; if (words) yield { type: 'note', text: words };
    await gate(total * (paints ? .1 : .14));
    yield { type: 'plan', plan: { op: spec.intent.op, note: 'read on this device' } };
    yield { type: 'stage', stage: 'plan' }; await gate(total * (paints ? .04 : .14));
    yield { type: 'stage', stage: 'draw' };
    const made = [];
    for (let i = 0; i < n; i++) made.push(await sketch(spec, inputs, i, P.MAX, { layers: paints }));
    const layers = made.map(m => m.layers || []), most = Math.max(0, ...layers.map(l => l.length));
    if (most) {
      for (let k = 0; k < most; k++) {
        if (layers[0][k]) yield { type: 'note', text: layers[0][k].label, quick: true };
        for (let i = 0; i < n; i++) { const l = layers[i][Math.min(k, layers[i].length - 1)]; if (l) yield { type: 'partial', index: i, canvas: l.canvas, layer: true }; }
        await gate(total * .7 / most);
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
      const c = P.stamp(P.copy(made[i].canvas)), blob = await P.toBlob(c);
      yield { type: 'result', index: i, blob, w: c.width, h: c.height, provenance: { kind: 'sketch', label: 'Sketch', detail: 'Drawn on this device · ' + made[i].note, ...(made[i].scene ? { scene: made[i].scene } : {}) } };
    }
    const handle = id => inputs[id]?.handle || 'it';
    const said = made[0]?.changes?.length ? `${handle(spec.intent.subject)}, painted again: ${made[0].changes.join(', ')}.`
      : made[0]?.painted?.length ? `Painted ${made[0].painted.map(p => '“' + p + '”').join(' and ')} into what you pinned on ${handle(spec.intent.subject)}.`
      : (SAY[spec.intent.op] || SAY.edit)(spec, handle, made[0]?.shows || []);
    yield { type: 'reply', text: said, suggestions: NEXT[spec.intent.op] || NEXT.edit };
    yield { type: 'done', ms: performance.now() - t0 };
  },
  cancel(id) { cancelled.add(id); },
};
