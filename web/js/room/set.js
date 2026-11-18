/**
 * Set pieces: the scenery a room stands in. Each is a function of the room's colours that returns SVG
 * for the layer between the ground and the sky, and how much room it needs at the top of the stage.
 */
import { mix, alpha } from '../core/color.js';
import { ORN } from './ornaments.js';

const svg = body => `<svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMin slice" aria-hidden="true">${body}</svg>`;
const n = v => v.toFixed(1);

function fern(x, y, dir, len, col) {
  let d = '';
  for (let i = 0; i < 11; i++) {
    const t = i / 10, px = x + dir * (t * len * .55 + Math.sin(t * 2.2) * 10), py = y + t * len, s = 1 - t * .55;
    d += `<ellipse cx="${n(px - dir * 9 * s)}" cy="${n(py + 2)}" rx="${n(9 * s)}" ry="${n(2.6 * s)}" transform="rotate(${n(dir * 28)} ${n(px)} ${n(py)})"/>`;
    d += `<ellipse cx="${n(px + dir * 9 * s)}" cy="${n(py + 2)}" rx="${n(9 * s)}" ry="${n(2.6 * s)}" transform="rotate(${n(-dir * 28)} ${n(px)} ${n(py)})"/>`;
  }
  return `<g fill="${col}">${d}<path d="M${x} ${y}q${dir * len * .3} ${len * .5} ${dir * len * .55} ${len}" stroke="${col}" stroke-width="1.4" fill="none"/></g>`;
}

export const SET_PIECES = {
  /** Afternoon sun through a four-pane window, cast across the wall. */
  window: { top: 0, draw: c => svg(`<defs><filter id="sb" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter></defs>
    <g class="set-breathe" filter="url(#sb)" fill="${mix(c.surface, '#fff6dc', .6)}" opacity=".55" transform="translate(196 92) rotate(14) skewX(-30)">
      <rect x="0" y="0" width="84" height="112"/><rect x="94" y="0" width="84" height="112"/><rect x="0" y="122" width="84" height="112"/><rect x="94" y="122" width="84" height="112"/>
    </g>`) },

  /** A scalloped valance with a string of pearls, and drapes tied back with bows. */
  boudoir: { top: 8, draw: c => {
    let arcs = '', pearls = '';
    for (let x = 372; x > -12; x -= 36) { arcs += `A18 15 0 0 1 ${x - 36} 22`; pearls += `<circle cx="${x - 18}" cy="38.5" r="2.3"/>`; }
    const drape = `<path d="M-4 0C58 0 74 40 62 118 54 184 34 226 20 262c12 46 4 150-24 214z" fill="${alpha(c.accent, .12)}"/>
      <path d="M14 8c10 60 8 150-2 240M34 6c14 70 8 150-8 226M50 10c10 50 4 120-14 200" stroke="${alpha(c.accent, .16)}" stroke-width="1.2" fill="none"/>
      <g transform="translate(6 246) scale(1.2)" fill="${alpha(c.accent2, .75)}"><path d="${ORN.bow.f}"/></g>`;
    return svg(`<path d="M-12 0H372V22${arcs}z" fill="${alpha(c.accent, .2)}"/>
      <path d="M372 22${arcs}" stroke="${alpha(c.accent2, .7)}" stroke-width="1.2" fill="none"/>
      <g fill="${alpha(c.accent2, .8)}">${pearls}</g>
      <g class="set-drape">${drape}</g><g class="set-drape set-drape--r" transform="translate(360 0) scale(-1 1)">${drape}</g>`);
  } },

  /** A neon horizon: a striped sun sinking into a grid. */
  grid: { top: 0, draw: c => {
    const hz = 448; let rays = '', rows = '', cuts = '';
    for (let i = -12; i <= 12; i++) rays += `<line x1="180" y1="${hz}" x2="${180 + i * 64}" y2="660"/>`;
    for (let k = 1; k < 10; k++) rows += `<line x1="-40" y1="${n(hz + k * k * 2.6)}" x2="400" y2="${n(hz + k * k * 2.6)}"/>`;
    for (let k = 0; k < 6; k++) cuts += `<rect x="60" y="${hz - 44 + k * 9}" width="240" height="${1.5 + k * .9}" fill="#000"/>`;
    return svg(`<defs><linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd36e"/><stop offset=".55" stop-color="${c.accent}"/><stop offset="1" stop-color="${mix(c.accent, c.ground, .4)}"/></linearGradient>
      <mask id="gm"><rect width="360" height="640" fill="#fff"/>${cuts}</mask><linearGradient id="gh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.accent}" stop-opacity=".0"/><stop offset=".5" stop-color="${c.accent}" stop-opacity=".35"/><stop offset="1" stop-color="${c.accent2}" stop-opacity="0"/></linearGradient></defs>
      <rect x="0" y="${hz - 60}" width="360" height="120" fill="url(#gh)"/>
      <g class="set-glow" mask="url(#gm)" opacity=".55"><circle cx="180" cy="${hz}" r="96" fill="url(#gs)"/></g>
      <rect x="0" y="${hz}" width="360" height="200" fill="${c.ground}"/>
      <g stroke="${c.accent2}" stroke-width="1" opacity=".42">${rays}<g class="set-rows">${rows}</g></g>
      <line x1="0" y1="${hz}" x2="360" y2="${hz}" stroke="${c.accent}" stroke-width="1.4" opacity=".8"/>`);
  } },

  /** Light through venetian blinds, leaning across the room. */
  blinds: { top: 0, draw: () => {
    let r = '';
    for (let i = -2; i < 16; i++) r += `<rect x="-240" y="${i * 44}" width="840" height="21"/>`;
    return svg(`<defs><filter id="bb"><feGaussianBlur stdDeviation="2.2"/></filter></defs><g class="set-sway" filter="url(#bb)" fill="#fff" opacity=".055" transform="rotate(-24 180 320)">${r}</g>`);
  } },

  /** The ironwork of a glasshouse, with ferns hanging from the roof. */
  glasshouse: { top: 0, draw: c => {
    const line = alpha(mix(c.surface, '#ffffff', .5), .9), leaf = alpha(c.accent2, .24);
    return svg(`<g stroke="${line}" stroke-width="2" fill="none">
      <path d="M18 660V250Q18 70 180 4 342 70 342 250V660"/><path d="M180 4V660M98 40V660M262 40V660"/><path d="M18 300H342M18 450H342M18 600H342"/>
      <path d="M60 140Q180 70 300 140"/></g>
      ${fern(0, -6, 1, 150, leaf)}${fern(360, -6, -1, 120, leaf)}${fern(70, -10, 1, 80, alpha(c.accent2, .16))}`);
  } },

  /** A striped awning with a scalloped edge, and its shadow. */
  awning: { top: 13, draw: c => {
    let s = '';
    for (let x = 0, i = 0; x < 380; x += 30, i++) {
      const fill = i % 2 ? c.surface : c.accent2;
      s += `<path d="M${x} 0h30v38a15 15 0 0 1-30 0z" fill="${fill}"/>`;
    }
    return svg(`<defs><linearGradient id="as" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.ink}" stop-opacity=".16"/><stop offset="1" stop-color="${c.ink}" stop-opacity="0"/></linearGradient></defs>
      <rect x="0" y="40" width="360" height="40" fill="url(#as)"/><g class="set-flutter">${s}</g>
      <path d="M0 610q45-14 90 0t90 0 90 0 90 0V640H0z" fill="${alpha(c.accent2, .1)}"/>`);
  } },

  /** An armillary of brass rings turning very slowly, and a constellation. */
  dome: { top: 0, draw: c => {
    const pts = [[46, 168], [92, 128], [138, 146], [176, 102], [228, 126], [252, 178], [304, 160]];
    const lines = pts.slice(1).map((p, i) => `<line x1="${pts[i][0]}" y1="${pts[i][1]}" x2="${p[0]}" y2="${p[1]}"/>`).join('');
    const stars = pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1.6 : 2.6}"/>`).join('');
    return svg(`<g class="set-spin" stroke="${c.accent}" fill="none" opacity=".16"><circle cx="180" cy="760" r="560"/><circle cx="180" cy="760" r="500"/>
      <ellipse cx="180" cy="760" rx="140" ry="560"/><ellipse cx="180" cy="760" rx="300" ry="560"/><ellipse cx="180" cy="760" rx="440" ry="560"/></g>
      <g stroke="${c.accent}" stroke-width=".8" opacity=".38">${lines}</g><g fill="${c.accent}" opacity=".85">${stars}</g>
      <g opacity=".5"><circle cx="300" cy="74" r="15" fill="${alpha(c.accent2, .5)}"/><ellipse cx="300" cy="74" rx="27" ry="6" transform="rotate(-18 300 74)" stroke="${c.accent2}" fill="none"/></g>`);
  } },

  none: { top: 0, draw: () => '' },
};

/** Puts a room's set piece on the stage. */
export function dressSet(room) {
  const piece = SET_PIECES[room.set] || SET_PIECES.none, el = document.querySelector('.set');
  if (el) el.innerHTML = piece.draw(room.colors);
  document.documentElement.style.setProperty('--set-top', piece.top + 'cqw');
}
