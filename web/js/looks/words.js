/**
 * Words that shape. What someone types is read the way a stylist hears it: "curtain bangs, a bit longer, parted left;
 * softer brows" names what to change (a part, a style) and how (the markup's own handles, each -1 to 1, the same ones a
 * finger drags in the mirror), so a sentence is drawn on the face in front while it is still being written. The markup
 * says a shape back in words (markup.js); this reads those words, and the everyday ways of putting them, the other way.
 */

/** @typedef {{ part: string, style: string, shape: Record<string, number> }} Heard what was heard for one part: its style ('' when only the part, or only its shape, was said) and the handles the words move */

/** Styles named outright, the more particular names first: the first to claim a word keeps it. */
const STYLES = /** @type {[string, string, RegExp][]} */ ([
  ['colour', 'copper', /\b(?:copper|ginger|auburn|red(?:dish)?[- ]hair(?:ed)?)\b/],
  ['colour', 'platinum', /\b(?:platinum|icy blonde?|bleach(?:ed)?(?: blonde?)?)\b/],
  ['colour', 'rose', /\b(?:rose[- ]?gold|pink hair|pastel(?: pink)?)\b/],
  ['colour', 'silver', /\b(?:silver(?:[- ]gr[ae]y)?|gr[ae]y hair)\b/],
  ['colour', 'jet', /\b(?:jet(?:[- ]black)?|black hair|raven)\b/],
  ['colour', 'honey', /\b(?:honey(?:[- ]blonde?)?|balayage|golden|blonde?)\b/],
  ['bangs', 'curtain', /\bcurtains?\b/],
  ['bangs', 'birkin', /\bbirkin\b/],
  ['bangs', 'blunt', /\b(?:blunt|straight across)\b/],
  ['bangs', 'wispy', /\b(?:wispy|see[- ]through)\b/],
  ['bangs', 'side', /\b(?:side[- ]?swept|swept to the side|side fringe)\b/],
  ['bangs', 'micro', /\b(?:micro|baby bangs)\b/],
  ['brows', 'feathered', /\b(?:feather(?:ed|y)|brushed[- ]up|fluffy|laminated)\b/],
  ['brows', 'arched', /\bhigh[- ]arch(?:ed)?\b|\barched brows?\b/],
  ['brows', 'straight', /\b(?:straight|flat) brows?\b/],
  ['brows', 'bold', /\bbold brows?\b/],
  ['brows', 'thin', /\b(?:thin|fine|skinny) brows?\b/],
  ['brows', 'soft', /\bsoft[- ]arch(?:ed)?\b|\bnatural brows?\b/],
  ['cut', 'bob', /\b(?:bob|lob)\b/],
  ['cut', 'pixie', /\bpixie\b/],
  ['cut', 'shag', /\b(?:shag|wolf ?cut)\b/],
  ['cut', 'long', /\blong layers\b|\blong hair\b/],
  ['cut', 'curls', /\b(?:curl(?:s|y)|perm(?:ed)?|ringlets)\b/],
  ['cut', 'buzz', /\b(?:buzz(?:ed| ?cut)?|shaved head|crew cut)\b/],
  ['lashes', 'wing', /\b(?:wing(?:ed)?(?: liner)?|cat[- ]eye|eyeliner|liner)\b/],
  ['lashes', 'smoky', /\bsmok(?:y|ey)\b/],
  ['lashes', 'bright', /\b(?:lifted|curled) lashes\b|\bmascara\b/],
  ['lashes', 'natural', /\bnatural lashes\b/],
  ['lips', 'red', /\b(?:(?:classic|matte|bold|bright) )?red(?: lips?| lipstick)?\b/],
  ['lips', 'berry', /\b(?:berry|plum|wine|burgundy)\b/],
  ['lips', 'nude', /\bnude\b/],
  ['lips', 'gloss', /\b(?:lip ?gloss|gloss(?:y)?|shiny lips?)\b/],
  ['beard', 'stubble', /\b(?:stubble|five o'?clock shadow)\b/],
  ['beard', 'moustache', /\bmou?stache\b/],
  ['beard', 'clean', /\b(?:clean[- ]?shaven|no beard|shave (?:it )?off)\b/],
  ['beard', 'full', /\b(?:full|big) beard\b/],
  ['beard', 'trimmed', /\b(?:trimmed|short|neat) beard\b/],
]);
/** Parts named without a style. */
const SAID = /** @type {[string, RegExp][]} */ ([
  ['bangs', /\b(?:bangs?|fringe)\b/], ['brows', /\b(?:eye)?brows?\b/], ['colour', /\b(?:colou?r|dye[ds]?)\b/], ['cut', /\b(?:hair)?cut\b/],
  ['lashes', /\b(?:lash(?:es)?|eyes?|eye ?make-?up)\b/], ['lips', /\b(?:lips?|lipstick|mouth)\b/], ['beard', /\b(?:beard|facial hair|goatee)\b/],
]);
/**
 * How each part's handles are said: [handle, which way (1 more, -1 less), the words]; or, ending in true, [handle,
 * value, the words, true] for words that say exactly where ("to the jaw").
 * @type {Record<string, [string, number, RegExp, boolean?][]>}
 */
const MOVES = {
  bangs: [
    ['length', .9, /\b(?:to|past) the (?:jaw|chin|cheekbones?)\b|\b(?:to|brush(?:ing)?) the lashes\b/, true],
    ['length', -.9, /\beye level\b|\bhigh on the forehead\b|\bwell above the brows?\b/, true],
    ['length', 1, /\b(?:longer|long|lower|grown[- ]out|past the brows?|below the brows?)\b/],
    ['length', -1, /\b(?:shorter|short|higher|cropped|above the brows?|trimmed)\b/],
    ['part', 0, /\b(?:centre|center|middle)[- ](?:parted|part(?:ing)?)\b|\bparted (?:in the )?(?:middle|centre|center)\b/, true],
    ['part', 1, /\bparted (?:to the )?right\b|\bright(?:[- ]side)? part(?:ing)?\b|\bnearer the middle\b/],
    ['part', -1, /\bparted (?:to the )?left\b|\bleft(?:[- ]side)? part(?:ing)?\b|\bdeeper(?: side)? part\b/],
  ],
  brows: [
    ['arch', -.85, /\b(?:almost|nearly) straight\b|\bbarely arched\b/, true],
    ['arch', 1, /\b(?:higher(?: arch)?|more arch(?:ed)?|lifted|sharper|arched|peaked)\b/],
    ['arch', -1, /\b(?:softer(?: arch)?|flatter|straighter|gentler|rounder|less arch(?:ed)?)\b/],
    ['tail', 1, /\b(?:longer tails?|longer|extended|to the temples?)\b/],
    ['tail', -1, /\b(?:shorter tails?|shorter)\b/],
    ['full', 1, /\b(?:fuller|thicker|bushier|bolder|heavier|denser)\b/],
    ['full', -1, /\b(?:finer|thinner|slimmer|lighter|sparser)\b/],
  ],
  lashes: [
    ['long', 1, /\b(?:longer|bigger|more dramatic|dramatic|bolder|sharper|extended|fuller)\b/],
    ['long', -1, /\b(?:shorter|subtler|subtle|smaller|softer|tiny|short flick|more natural)\b/],
  ],
  beard: [
    ['length', -.9, /\b(?:close[- ]cropped|very short)\b/, true],
    ['length', 1, /\b(?:longer|fuller|bigger|grown[- ]out)\b/],
    ['length', -1, /\b(?:shorter|closer|tighter|neater|tidier|cropped)\b/],
  ],
  cut: [
    ['length', .9, /\bpast the shoulders\b|\bdown the back\b/, true],
    ['length', .5, /\b(?:to|on) the shoulders\b|\bshoulder[- ]length\b/, true],
    ['length', -.6, /\babove the chin\b|\bear[- ]length\b/, true],
    ['length', 1, /\b(?:longer|long|grown[- ]out)\b/],
    ['length', -1, /\b(?:shorter|short|cropped|trimmed)\b/],
    ['volume', 1, /\b(?:fuller|more volume|bigger|voluminous|bouncier|more body|thicker)\b/],
    ['volume', -1, /\b(?:sleeker|sleek|flatter|smoother|less volume|straighter)\b/],
  ],
  colour: [
    ['shade', 1, /\b(?:lighter|brighter|paler|blonder)\b/],
    ['shade', -1, /\b(?:deeper|darker|richer)\b/],
  ],
  lips: [
    ['shade', 1, /\b(?:lighter|softer|paler|sheer(?:er)?|subtler)\b/],
    ['shade', -1, /\b(?:deeper|darker|richer|bolder|stronger)\b/],
  ],
};
// how far: "a bit longer" a little way, "much longer" most of the way, "longer" between
const LITTLE = /(?:\ba (?:little )?bit|\ba little|\bslightly|\ba touch|\ba tad|\bjust|\bsomewhat|\bsubtly)\s+(?:more\s+)?$/;
const LOTS = /(?:\bmuch|\ba lot|\bway|\breally|\bvery|\bfar|\bsuper|\bextra|\bdramatically)\s+(?:more\s+)?$/;
const strength = (/** @type {string} */ before) => (LOTS.test(before) ? .9 : LITTLE.test(before) ? .3 : /\beven\s+$/.test(before) ? .7 : .55);

/**
 * What a request asks of each part it names, in the order it names them; words that only shape ("a bit longer") shape
 * the part their clause names, or the one before, or the part in front.
 * @param {string} text @param {string} [inFront] the part the words are about when they name none
 * @returns {Heard[]}
 */
export function hear(text, inFront = '') {
  const t = text.toLowerCase(), all = (/** @type {RegExp} */ re) => [...t.matchAll(new RegExp(re.source, 'g'))];
  /** @type {{ at: number, end: number }[]} */ const used = [];
  const free = (/** @type {number} */ a, /** @type {number} */ b) => !used.some(f => a < f.end && b > f.at);
  /** @type {{ at: number, end: number, part: string, style: string }[]} */ const named = [];
  for (const [part, style, re] of STYLES) for (const m of all(re)) { const at = m.index || 0, end = at + m[0].length; if (free(at, end)) { used.push({ at, end }); named.push({ at, end, part, style }); } }
  for (const [part, re] of SAID) for (const m of all(re)) { const at = m.index || 0, end = at + m[0].length; if (free(at, end)) { used.push({ at, end }); named.push({ at, end, part, style: '' }); } }
  named.sort((a, b) => a.at - b.at);
  /** @type {Map<string, Heard>} */ const out = new Map();
  const heard = (/** @type {string} */ part) => { let x = out.get(part); if (!x) { x = { part, style: '', shape: {} }; out.set(part, x); } return x; };
  for (const n of named) { const x = heard(n.part); if (n.style) x.style = n.style; }
  // clause by clause (a comma, a full stop, an "and" or a "with" begins the next): the words that shape shape the part
  // their clause names (the nearest, if it names more than one), or the part the clause before was about
  const cuts = [0, ...all(/[,;.!?]|\b(?:and|with|but|plus|then|also)\b/).map(m => m.index || 0), t.length];
  let last = inFront;
  for (let c = 0; c < cuts.length - 1; c++) {
    const a = cuts[c], b = cuts[c + 1], here = named.filter(n => n.at >= a && n.at < b);
    const parts = here.length ? [...new Set(here.map(n => n.part))] : last ? [last] : [];
    for (const part of parts) for (const [id, way, re, exact] of MOVES[part] || []) for (const m of all(re)) {
      const at = m.index || 0, end = at + m[0].length;
      if (at < a || end > b || !free(at, end)) continue;
      if (here.length > 1 && here.reduce((p, n) => (Math.abs(n.at - at) < Math.abs(p.at - at) ? n : p)).part !== part) continue;
      used.push({ at, end });
      heard(part).shape[id] = exact ? way : way * strength(t.slice(Math.max(a, at - 24), at));
    }
    if (here.length) last = here[here.length - 1].part;
  }
  return [...out.values()];
}
