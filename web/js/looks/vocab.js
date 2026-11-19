/**
 * What a look can change, part by part, and each way it can change: a name to show, a drawing to show it by, and the
 * words the studio is given, precise enough for GPT Image to change that one thing and leave the person alone.
 */
import { sketchSVG, VIEWS } from './line.js';

/** @typedef {{ id: string, name: string, words: string, sketch?: any }} Style */
/** @typedef {{ id: string, name: string, masked: boolean, styles: Style[] }} Part */

/** @type {Part[]} */
export const PARTS = [
  { id: 'bangs', name: 'Bangs', masked: true, styles: [
    { id: 'curtain', name: 'Curtain', words: 'curtain bangs, parted in the middle, sweeping softly out to the cheekbones' },
    { id: 'blunt', name: 'Blunt', words: 'blunt bangs cut straight across, just above the brows' },
    { id: 'wispy', name: 'Wispy', words: 'wispy see-through bangs, light and separated' },
    { id: 'side', name: 'Side-swept', words: 'side-swept bangs falling across the forehead from a side part' },
    { id: 'micro', name: 'Micro', words: 'short micro bangs, well above the brows' },
    { id: 'birkin', name: 'Birkin', words: 'long, soft Birkin bangs that brush the lashes' },
  ] },
  { id: 'brows', name: 'Brows', masked: true, styles: [
    { id: 'soft', name: 'Soft arch', words: 'soft, natural brows with a gentle arch' },
    { id: 'straight', name: 'Straight', words: 'straight, flat brows' },
    { id: 'arched', name: 'High arch', words: 'high, defined arched brows' },
    { id: 'feathered', name: 'Feathered', words: 'fluffy brushed-up feathered brows' },
    { id: 'bold', name: 'Bold', words: 'bold, fuller, darker brows' },
    { id: 'thin', name: 'Fine', words: 'thin, finely shaped brows' },
  ] },
  { id: 'colour', name: 'Colour', masked: true, styles: [
    { id: 'copper', name: 'Copper', words: 'rich copper hair', sketch: { colour: '#b4532a' } },
    { id: 'platinum', name: 'Platinum', words: 'icy platinum blonde hair', sketch: { colour: '#e9e2cf' } },
    { id: 'honey', name: 'Honey', words: 'honey-blonde balayage', sketch: { colour: '#c9944e' } },
    { id: 'jet', name: 'Jet', words: 'glossy jet-black hair', sketch: { colour: '#14100d' } },
    { id: 'rose', name: 'Rose gold', words: 'soft rose-gold pastel hair', sketch: { colour: '#d99a96' } },
    { id: 'silver', name: 'Silver', words: 'silver-grey hair', sketch: { colour: '#a9aab0' } },
  ] },
  { id: 'cut', name: 'Cut', masked: false, styles: [
    { id: 'bob', name: 'Bob', words: 'a sleek chin-length bob', sketch: { hair: 'bob' } },
    { id: 'pixie', name: 'Pixie', words: 'a short pixie cut', sketch: { hair: 'pixie' } },
    { id: 'shag', name: 'Shag', words: 'a layered shag with movement', sketch: { hair: 'shag' } },
    { id: 'long', name: 'Long layers', words: 'long layers falling past the shoulders', sketch: { hair: 'long' } },
    { id: 'curls', name: 'Curls', words: 'defined, bouncy curls', sketch: { hair: 'curly' } },
    { id: 'buzz', name: 'Buzz', words: 'a close buzz cut', sketch: { hair: 'buzz' } },
  ] },
  { id: 'lashes', name: 'Eyes', masked: true, styles: [
    { id: 'natural', name: 'Natural', words: 'naturally longer lashes' },
    { id: 'wing', name: 'Winged', words: 'a fine black winged liner' },
    { id: 'smoky', name: 'Smoky', words: 'soft smoky eyes' },
    { id: 'bright', name: 'Lifted', words: 'lifted, curled lashes with a touch of mascara' },
  ] },
  { id: 'lips', name: 'Lips', masked: true, styles: [
    { id: 'nude', name: 'Nude', words: 'a soft nude lip' },
    { id: 'red', name: 'Red', words: 'a classic matte red lip' },
    { id: 'berry', name: 'Berry', words: 'a deep berry lip' },
    { id: 'gloss', name: 'Gloss', words: 'a clear glossy lip' },
  ] },
  { id: 'beard', name: 'Beard', masked: true, styles: [
    { id: 'stubble', name: 'Stubble', words: 'light stubble' },
    { id: 'trimmed', name: 'Trimmed', words: 'a short, neatly trimmed beard' },
    { id: 'full', name: 'Full', words: 'a full, well-groomed beard' },
    { id: 'moustache', name: 'Moustache', words: 'a moustache' },
    { id: 'clean', name: 'Clean-shaven', words: 'clean-shaven' },
  ] },
];
export const partById = (/** @type {string} */ id) => PARTS.find(p => p.id === id);
export const styleOf = (/** @type {string} */ part, /** @type {string} */ id) => partById(part)?.styles.find(s => s.id === id);

/** What a part's drawing needs to show one of its styles. @param {string} part @param {Style} s */
export function sketchFor(part, s) {
  if (s.sketch) return s.sketch;
  return { [part]: s.id };
}

/**
 * The words for the studio: the change, and that nothing else changes. A person's own words come after, as they
 * wrote them. @param {{ part: string, style: Style }[]} picks @param {string} own
 */
export function wordsFor(picks, own = '') {
  const change = picks.map(p => p.style.words);
  const said = change.length ? 'Give them ' + (change.length > 1 ? change.slice(0, -1).join(', ') + ' and ' + change[change.length - 1] : change[0]) + '.' : '';
  return [said, own.trim(), change.length ? 'Keep everything else exactly as it is: the same person, face, expression, skin, light and background.' : ''].filter(Boolean).join(' ');
}

/** A short title for what was picked: "Curtain bangs", "Copper · Bob". @param {{ part: string, style: Style }[]} picks */
export const titleOf = (picks) => picks.map(p => (['bangs', 'brows'].includes(p.part) ? p.style.name + ' ' + partById(p.part)?.name.toLowerCase() : p.style.name)).join(' · ');

/** One part in one style, drawn as its chip shows it. @param {string} part @param {string} style */
export function plateSVG(part, style) {
  const s = styleOf(part, style);
  return s ? sketchSVG(sketchFor(part, s), { view: VIEWS[part], only: part }) : '';
}

/** The parts a request names in its own words ("longer bangs", "fuller brows"), in the order they are offered. */
const NAMED = /** @type {[string, RegExp][]} */ ([
  ['bangs', /\b(?:bangs?|fringe)\b/], ['brows', /\b(?:eye)?brows?\b/], ['colour', /\b(?:colou?r(?:ed)?|blonde?|brunette|copper|ginger|platinum|highlights|lowlights|dye[ds]?|balayage|ombr[eé]|silver|grey|gray|auburn)\b/],
  ['cut', /\b(?:cut|haircut|bob|pixie|shag|layers|curls|curly|buzz|shorter|longer hair|short hair|long hair|perm)\b/], ['lashes', /\b(?:lash(?:es)?|liner|eyeliner|mascara|smoky|eyeshadow|eye make-?up)\b/],
  ['lips', /\b(?:lips?|lipstick|gloss)\b/], ['beard', /\b(?:beard|moustache|mustache|stubble|shaven|shave|goatee|sideburns)\b/],
]);
/** @param {string} text */
export const partsIn = (text) => NAMED.filter(([, re]) => re.test(text.toLowerCase())).map(([p]) => p);

/** The colour a part is washed with when a change is sketched over a face: the hair's new colour, or the lips'. */
const LIP_TINT = /** @type {Record<string, string>} */ ({ nude: '#c98b7a', red: '#c1272d', berry: '#7b1e3c', gloss: '#e8a9a0' });
/** @param {string} part @param {string} style @returns {string | null} */
export function tintOf(part, style) {
  if (part === 'colour') return styleOf(part, style)?.sketch?.colour || null;
  if (part === 'lips') return LIP_TINT[style] || null;
  return null;
}
