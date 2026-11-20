/** Small DOM vocabulary: an element builder, icons, sheets, toasts and a few numbers. */
import { drag, reduced } from './motion.js';

/**
 * h('button.btn.btn--accent', { onclick }, 'Label'): tag.classes, props, children.
 * @param {string} tag @param {Record<string, any>|null} [props] @param {...any} kids @returns {any}
 */
export function h(tag, props, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'style') for (const [p, val] of Object.entries(v)) p.startsWith('--') ? el.style.setProperty(p, val) : (el.style[p] = val);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'data') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list' && k !== 'form' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat(Infinity).filter(x => x != null && x !== false));
  return el;
}

const P = {
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>', back: '<path d="M15 5l-7 7 7 7"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 3.5 3 3-2.5L20 17"/>',
  camera: '<path d="M4 8.5h3.2L9 6h6l1.8 2.5H20v10.5H4z"/><circle cx="12" cy="13.2" r="3.3"/>',
  album: '<rect x="4" y="4" width="7" height="9" rx="1"/><rect x="13" y="4" width="7" height="6" rx="1"/><rect x="4" y="15" width="7" height="5" rx="1"/><rect x="13" y="12" width="7" height="8" rx="1"/>',
  heart: '<path d="M12 19.5c-5-3.5-8-6.4-8-10 0-2.4 1.9-4.3 4.3-4.3 1.6 0 3 .9 3.7 2.2.7-1.3 2.1-2.2 3.7-2.2 2.4 0 4.3 1.9 4.3 4.3 0 3.6-3 6.5-8 10z"/>',
  pin: '<path d="M12 21s-6-5.4-6-10.5a6 6 0 0 1 12 0C18 15.6 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/>',
  brush: '<path d="M14.5 4.5l5 5-8.5 8.5-5-5z"/><path d="M6 13c-2 0-3 1.6-3 3.5V20h3.5c1.9 0 3.5-1 3.5-3"/>',
  erase: '<path d="M9 19h10M5 15l8.5-8.5 5 5L12 18H8z"/>',
  wand: '<path d="M5 19L15 9M14 5v2M18 5v2M17 3.5v0M19 8h2M14 10l1 1"/><path d="M17 4l.6 1.4L19 6l-1.4.6L17 8l-.6-1.4L15 6l1.4-.6z"/>',
  backdrop: '<path d="M3 18l5.5-7 4 5 3-3.5L21 18z"/><circle cx="16.5" cy="7.5" r="2"/><rect x="3" y="4" width="18" height="16" rx="2"/>',
  vary: '<rect x="7" y="7" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
  compare: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M12 3v18"/>',
  use: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', save: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  retry: '<path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v5h5"/>', stop: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
  bolt: '<path d="M13 3L5 13.5h6l-1 7.5 8-10.5h-6z"/>', feather: '<path d="M19.5 4.5C12 4.5 7 9 6 16.5L4 20M6 16.5h6l-2-2h4.5L12 12h5"/>', gem: '<path d="M7 4h10l4 5-9 11L3 9z"/><path d="M3 9h18M12 20L9 9l3-5 3 5z"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  page: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9.5 13h5M12 10.5v5"/>',
  sparkle: '<path d="M12 3c.5 4.6 2.4 6.5 7 7-4.6.5-6.5 2.4-7 7-.5-4.6-2.4-6.5-7-7 4.6-.5 6.5-2.4 7-7z"/>',
  at: '<circle cx="12" cy="12" r="3.6"/><path d="M15.6 12v1.4c0 1.5 1 2.4 2.2 2.4s2.2-1 2.2-3.8a8 8 0 1 0-3.3 6.5"/>',
  sky: '<path d="M7 18h10a3.6 3.6 0 0 0 .4-7.2 5 5 0 0 0-9.6-1A4.3 4.3 0 0 0 7 18z"/>',
  room: '<path d="M4 20V9.5L12 4l8 5.5V20"/><path d="M9.5 20v-6h5v6"/>',
  dial: '<circle cx="12" cy="12" r="8"/><path d="M12 12l4-3"/>',
  undo: '<path d="M9 7L4.5 11.5 9 16M5 11.5h9a5 5 0 0 1 0 10h-2"/>',
  film: '<rect x="4" y="4.5" width="16" height="15" rx="2"/><path d="M8 4.5v15M16 4.5v15M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  text: '<path d="M5 6h14M12 6v13"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.5-1-2.6 0-1 .8-1.7 1.8-1.7H17a3.5 3.5 0 0 0 3.5-3.5c0-4.2-3.8-7.5-8.5-7.5z"/><circle cx="7.8" cy="11" r="1.1"/><circle cx="10.5" cy="7.5" r="1.1"/><circle cx="15" cy="7.8" r="1.1"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  orbit: '<ellipse cx="12" cy="13" rx="9" ry="3.6"/><path d="M14.6 7.4l2.6 2.1-3.2.9"/><circle cx="12" cy="8.6" r="2.4"/>',
  lenses: '<circle cx="6.8" cy="12" r="4.3" fill="currentColor"/><circle cx="17.2" cy="12" r="4.3"/>',
  weeks: '<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.6 4 5.6 4 8.5s-4 3.9-4 8.5M16 3.5c0 4.6-4 5.6-4 8.5s4 3.9 4 8.5"/><path d="M10 18.5c.6-1.4 1.3-2 2-2s1.4.6 2 2z" fill="currentColor"/>',
};
/** An inline stroke icon. */
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const frame = () => new Promise(r => requestAnimationFrame(() => r(undefined)));
export const stage = () => /** @type {HTMLElement} */ (document.getElementById('stage'));
export const screens = () => /** @type {HTMLElement} */ (document.getElementById('screens'));
export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const pick = (list, seed = Math.random()) => list[Math.floor(seed * list.length) % list.length];
/** Seeded randomness, for drawings that must come out the same twice. @param {number|string} [seed] */
export function rng(seed = 1) { let s = (typeof seed === 'string' ? [...seed].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261) : seed) >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507 | s) + 0x6d2b79f5 >>> 0) % 1e9) / 1e9; }
/** "about 40 s", "about 2 min" */
export function eta(ms) {
  if (ms == null || !isFinite(ms)) return '';
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 10) return 'a few seconds';
  if (s < 55) return `about ${Math.round(s / 5) * 5} s`;
  const m = Math.round(s / 30) / 2;
  return `about ${m % 1 ? m.toFixed(1) : m} min`;
}
export const seconds = ms => (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s';

let toastTimer = 0;
/** A short line of confirmation near the top of the stage. */
let ruler = /** @type {CanvasRenderingContext2D | null} */ (null);
/**
 * Of some ways to say a thing, longest first, the first that fits a text field as its placeholder (else the last):
 * a hint cut off halfway looks broken, a shorter one does not.
 * @param {HTMLInputElement} input @param {string[]} words @returns {string}
 */
export function fitting(input, words) {
  const st = getComputedStyle(input), room = input.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight), last = words[words.length - 1] || '';
  ruler ||= document.createElement('canvas').getContext('2d');
  if (!ruler || !(room > 0)) return last;
  ruler.font = 'italic ' + st.fontWeight + ' ' + st.fontSize + ' ' + st.fontFamily;
  const r = ruler;
  return words.find(w => r.measureText(w).width <= room) ?? last;
}

/** A short note at the top of the stage; with an action, a button to act on it (e.g. undo) while it shows. @param {string} text @param {number} [ms] @param {{ label: string, run: () => void } | null} [action] */
export function toast(text, ms = 2200, action = null) {
  let el = stage().querySelector('.toast');
  if (!el) stage().append(el = h('div.toast', { role: 'status' }));
  el.replaceChildren(text, ...(action ? [h('button.toast__act', { onclick: () => { el.classList.remove('is-in'); action.run(); } }, action.label)] : []));
  el.classList.toggle('toast--act', !!action);
  requestAnimationFrame(() => el.classList.add('is-in'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-in'), ms);
}

/**
 * Raises a sheet from the bottom edge; it can be flung back down. Resolves with whatever close() was given.
 * @param {(close: (value?: any) => void, panel: HTMLElement) => Node[]} build @param {{ cls?: string, label?: string }} [opts]
 */
export function sheet(build, { cls = '', label = '' } = {}) {
  return new Promise(resolve => {
    const scrim = h('div.scrim'), body = h('div.sheet__body'), grip = h('div.sheet__grip');
    const panel = h('div.sheet' + (cls ? '.' + cls : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, grip, body);
    let done = false;
    // Escape puts the sheet on top away (only that one), and the keys go back where they were
    const was = /** @type {HTMLElement | null} */ (document.activeElement);
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Escape' || done) return;
      const all = stage().querySelectorAll('.sheet'); if (all[all.length - 1] !== panel) return;
      e.preventDefault(); e.stopPropagation(); close(); was?.focus?.({ preventScroll: true });
    };
    window.addEventListener('keydown', onKey, true);
    const close = value => {
      if (done) return; done = true;
      window.removeEventListener('keydown', onKey, true);
      scrim.classList.remove('is-in'); panel.classList.remove('is-in'); panel.style.transform = '';
      setTimeout(() => { scrim.remove(); panel.remove(); resolve(value); }, reduced ? 0 : 380);
    };
    body.append(...build(close, panel));
    scrim.addEventListener('click', () => close());
    drag(grip, {
      start: () => { panel.classList.add('is-dragging'); },
      move: d => { panel.style.transform = `translateY(${Math.max(0, d.dy)}px)`; },
      end: d => { panel.classList.remove('is-dragging'); if (d.dy > 90 || d.vy > 600) close(); else panel.style.transform = ''; },
    });
    stage().append(scrim, panel);
    requestAnimationFrame(() => requestAnimationFrame(() => { scrim.classList.add('is-in'); panel.classList.add('is-in'); }));
  });
}

/** Reads a file chooser and resolves the chosen files (images only). */
export function chooseFiles({ multiple = true, capture = false } = {}) {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept: 'image/*', multiple, hidden: true });
    if (capture) input.setAttribute('capture', 'environment');
    input.addEventListener('change', () => { resolve([...(input.files || [])]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}
