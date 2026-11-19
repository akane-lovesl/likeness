/**
 * A colour laid over a picture, the one way the whole app does it (the mirror's wash, the live mirror, the Lookbook's
 * sitters). Hair is dyed: it is brought most of the way to the colour's own lightness (platinum lifts black hair, copper
 * deepens grey, jet darkens anything), then takes the colour's hue, and keeps some of its own light and shade. Anything
 * else (lips) takes the hue, and is lightened or deepened a little with the colour itself. The canvas is coated whole:
 * mask it after.
 */

/** How light a colour is, 0 to 1. @param {string} hex */
export const lightness = (hex) => { const v = parseInt(hex.slice(1), 16); return (.3 * (v >> 16) + .59 * ((v >> 8) & 255) + .11 * (v & 255)) / 255; };

/** @param {CanvasRenderingContext2D} x the picture (or a part of it) to coat @param {string} tint @param {string} part */
export function coat(x, tint, part) {
  const w = x.canvas.width, h = x.canvas.height, light = lightness(tint);
  const lay = (/** @type {GlobalCompositeOperation} */ op, /** @type {number} */ a) => { x.globalCompositeOperation = op; x.globalAlpha = a; x.fillStyle = tint; x.fillRect(0, 0, w, h); };
  if (part === 'colour') { lay('luminosity', .62); lay('color', .9); lay('soft-light', .35); }
  else {
    lay('color', part === 'lips' ? .75 : .9);
    if (light > .62) lay('screen', .38); else if (light < .2) lay('multiply', .55); else if (part === 'lips') lay('multiply', .3);
  }
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
}

/**
 * Hair dyed on a still picture, strand by strand: the hair's own light and shade kept (its texture is what makes it
 * read as hair), its middle brought most of the way to the colour's own lightness, then given the colour's hue. Where
 * the hair is is read from the mask (or, without one, from the picture's own alpha); the whole canvas is dyed, so
 * mask it after. For video, coat is quicker.
 * @param {CanvasRenderingContext2D} x @param {string} tint @param {CanvasImageSource | null} [mask] the hair, white, at the canvas's size
 */
export function dyeHair(x, tint, mask = null) {
  const w = x.canvas.width, hh = x.canvas.height; if (!w || !hh) return;
  const img = x.getImageData(0, 0, w, hh), d = img.data;
  let m = null;
  if (mask) { const c = document.createElement('canvas'); c.width = w; c.height = hh; const mx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true })); mx.drawImage(mask, 0, 0, w, hh); m = mx.getImageData(0, 0, w, hh).data; }
  const L = (/** @type {number} */ i) => .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
  // the hair's light: its middle and how far it strays
  let n = 0, sum = 0;
  for (let i = 0; i < d.length; i += 16) { if ((m ? m[i] * m[i + 3] / 255 : d[i + 3]) < 128) continue; sum += L(i); n++; }
  if (!n) return;
  const mean = sum / n, v = parseInt(tint.slice(1), 16), t = [v >> 16, (v >> 8) & 255, v & 255], tl = .2126 * t[0] + .7152 * t[1] + .0722 * t[2];
  // a dye takes the hair most of the way to its own lightness; the strands keep their differences, a little stronger when lifted
  const target = mean + (tl - mean) * .82, keep = tl > mean ? 1.2 : .95;
  for (let i = 0; i < d.length; i += 4) {
    const l = Math.max(0, Math.min(255, target + (L(i) - mean) * keep));
    // the colour at that lightness: darker by scaling it, lighter toward a warm white
    const c = l <= tl ? t.map(q => q * l / Math.max(1, tl)) : t.map(q => q + (255 - q) * (l - tl) / Math.max(1, 255 - tl) * .85);
    // hair is never as loud as its swatch: some of the colour's strength given back to grey at that lightness, a little of its own kept
    const g = l * .22; d[i] = c[0] * .66 + g + d[i] * .12; d[i + 1] = c[1] * .66 + g + d[i + 1] * .12; d[i + 2] = c[2] * .66 + g + d[i + 2] * .12;
  }
  x.putImageData(img, 0, 0);
}
