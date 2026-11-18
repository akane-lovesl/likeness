/** Colour arithmetic for rooms, looks and palettes. Hex in, hex out. */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const rgb = hex => { let h = hex.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); const n = parseInt(h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/** @param {number[]} c */
export const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
export const alpha = (c, a) => `rgb(${rgb(c).join(' ')} / ${a})`;
export function luminance(c) { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; }
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
export function hsl(c) {
  const [r, g, b] = rgb(c).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return hex([f(0) * 255, f(8) * 255, f(4) * 255]);
}
/** The more legible of two inks on a ground. */
export const readable = (ground, a = '#1d1915', b = '#fbf8f2') => (contrast(ground, a) >= contrast(ground, b) ? a : b);
/** Nudges ink until it reads on the ground (WCAG 4.5:1 for body text). */
export function ensure(ink, ground, ratio = 4.5) {
  let c = ink; const dark = luminance(ground) > .4;
  for (let i = 0; i < 20 && contrast(c, ground) < ratio; i++) c = mix(c, dark ? '#000000' : '#ffffff', .12);
  return c;
}
