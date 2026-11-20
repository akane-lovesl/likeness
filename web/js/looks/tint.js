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
 * @param {number} [given] the hair's middle lightness, where it is known from more of the hair than this canvas holds (a
 * fringe brought forward is dyed as the hair it came from is)
 */
export function dyeHair(x, tint, mask = null, given = NaN) {
  const w = x.canvas.width, hh = x.canvas.height; if (!w || !hh) return;
  const img = x.getImageData(0, 0, w, hh), d = img.data;
  let m = null;
  if (mask) { const c = document.createElement('canvas'); c.width = w; c.height = hh; const mx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true })); mx.drawImage(mask, 0, 0, w, hh); m = mx.getImageData(0, 0, w, hh).data; }
  const L = (/** @type {number} */ i) => .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
  // the hair's light: its middle and how far it strays
  let n = 0, sum = 0;
  for (let i = 0; i < d.length; i += 16) { if ((m ? m[i] * m[i + 3] / 255 : d[i + 3]) < 128) continue; sum += L(i); n++; }
  if (!n) return;
  const mean = Number.isFinite(given) ? given : sum / n, v = parseInt(tint.slice(1), 16), t = [v >> 16, (v >> 8) & 255, v & 255], tl = .2126 * t[0] + .7152 * t[1] + .0722 * t[2];
  // a dye takes the hair most of the way to its own lightness; the strands keep their differences, a little stronger when lifted
  // (lifted a long way, as dark hair taken light, its strands show more, as they do in life)
  // a colour lifts dark hair only part of the way (it shows as a warm tint over it), where a bleach (platinum, silver: a
  // light colour with little hue) takes it all the way
  const hue = (Math.max(...t) - Math.min(...t)) / Math.max(1, Math.max(...t)), far = Math.max(0, Math.min(1, (tl - mean - 50) / 110));
  const lift = .82 - (hue > .25 ? .3 * far : 0), held = (.82 - lift) / .3;
  const target = mean + (tl - mean) * lift, keep = tl > mean ? 1.2 * Math.max(1, Math.min(2, Math.sqrt(target / Math.max(12, mean)))) : .95;
  const headroom = Math.max(1, 255 - tl), floor = Math.max(1, tl);
  const strength = .66 + .14 * held, desaturate = .22 - .14 * held;
  // The partially covered pixels between fine hairs already contain some background colour.
  for (let i = 0; i < d.length; i += 4) {
    const coverage = (m ? m[i] * m[i + 3] / 255 : d[i + 3]) / 255;
    if (!coverage) continue;
    const source = L(i), edge = (1 - coverage) * Math.max(0, Math.min(1, (source - mean - 35) / 85));
    const l = Math.max(0, Math.min(255, target + Math.min(56, source - mean) * keep));
    const grey = l * desaturate;
    const factor = l <= tl ? l / floor : 1 - (l - tl) / headroom * .85;
    // The caller applies the silhouette mask when it places the dyed hair over the picture.
    const white = l <= tl ? 0 : 255 * (1 - factor), amount = 1 - edge;
    for (let c = 0; c < 3; c++) {
      const dyed = (t[c] * factor + white) * strength + grey + d[i + c] * .12;
      d[i + c] += amount * (dyed - d[i + c]);
    }
  }
  x.putImageData(img, 0, 0);
}
