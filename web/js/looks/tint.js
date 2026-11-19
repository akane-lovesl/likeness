/**
 * A colour laid over a picture, the one way the whole app does it (the mirror's wash, the live mirror, the Lookbook's
 * sitters): the colour's hue and saturation taken; for hair, a soft light as well, so dark hair takes the colour too and
 * not only its hue; then lightened or deepened with the colour itself. The canvas is coated whole: mask it after.
 */

/** How light a colour is, 0 to 1. @param {string} hex */
export const lightness = (hex) => { const v = parseInt(hex.slice(1), 16); return (.3 * (v >> 16) + .59 * ((v >> 8) & 255) + .11 * (v & 255)) / 255; };

/** @param {CanvasRenderingContext2D} x the picture (or a part of it) to coat @param {string} tint @param {string} part */
export function coat(x, tint, part) {
  const w = x.canvas.width, h = x.canvas.height, light = lightness(tint);
  const lay = (/** @type {GlobalCompositeOperation} */ op, /** @type {number} */ a) => { x.globalCompositeOperation = op; x.globalAlpha = a; x.fillStyle = tint; x.fillRect(0, 0, w, h); };
  lay('color', part === 'lips' ? .75 : .9);
  if (part === 'colour') lay('soft-light', .6);
  if (light > .62) lay('screen', .38); else if (light < .2) lay('multiply', .55); else if (part === 'lips') lay('multiply', .3);
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
}
