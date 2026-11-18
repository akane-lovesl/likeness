/**
 * Little sounds, synthesised on the spot in each room's palette: a music box, a marimba, glass chimes, an arcade
 * synth, a typewriter. Off until you say otherwise; never loud.
 */
let ac = /** @type {AudioContext|null} */ (null), master = null, on = false, palette = 'wood', noise = null;
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const hz = semi => 523.25 * 2 ** (semi / 12);

function ctx() {
  if (!ac) {
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return null;
    ac = new AC(); master = ac.createGain(); master.gain.value = .5; master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(freq, { type = 'sine', when = 0, attack = .004, decay = .5, gain = .1, harmonic = 0, filter = 0 } = {}) {
  const c = ctx(); if (!c) return;
  const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
  o.type = /** @type {OscillatorType} */ (type); o.frequency.value = freq;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + attack + decay);
  let out = /** @type {AudioNode} */ (g);
  if (filter) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; g.connect(f); out = f; }
  o.connect(g); out.connect(master); o.start(t); o.stop(t + attack + decay + .05);
  if (harmonic) tone(freq * 3, { type: 'sine', when, attack, decay: decay * .4, gain: gain * harmonic });
}
function click({ when = 0, gain = .12, length = .03, freq = 2400 } = {}) {
  const c = ctx(); if (!c) return;
  if (!noise) { noise = c.createBuffer(1, c.sampleRate * .2, c.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter(), t = c.currentTime + when;
  s.buffer = noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.4;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + length);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * .1, length + .02);
}
const run = (notes, gap, opts) => notes.forEach((n, i) => tone(hz(n), { ...opts, when: i * gap }));

const PALETTES = {
  musicbox: { tap: () => tone(hz(24), { decay: .3, gain: .035, harmonic: .3 }), send: () => run([12, 16, 19, 24], .085, { decay: .7, gain: .06, harmonic: .35 }), arrive: () => run([24, 19, 16, 19, 24, 28, 31], .11, { decay: 1.1, gain: .055, harmonic: .4 }), room: () => run([7, 12, 16, 19, 24], .07, { decay: .9, gain: .05, harmonic: .3 }), pin: () => tone(hz(28), { decay: .5, gain: .05, harmonic: .4 }), error: () => run([7, 3], .16, { decay: .6, gain: .05 }) },
  wood: { tap: () => tone(hz(7), { type: 'triangle', decay: .12, gain: .06 }), send: () => run([0, 7], .07, { type: 'triangle', decay: .25, gain: .08 }), arrive: () => run([0, 4, 7, 12], .09, { type: 'triangle', decay: .45, gain: .08 }), room: () => run([12, 7, 4, 0], .06, { type: 'triangle', decay: .3, gain: .06 }), pin: () => tone(hz(12), { type: 'triangle', decay: .2, gain: .07 }), error: () => run([2, -3], .12, { type: 'triangle', decay: .3, gain: .07 }) },
  glass: { tap: () => tone(hz(31), { decay: .4, gain: .025 }), send: () => run([19, 24], .12, { decay: 1.2, gain: .04 }), arrive: () => { for (let i = 0; i < 6; i++) tone(hz(19 + PENTA[Math.floor(Math.random() * 6)]), { when: i * .09 + Math.random() * .05, decay: 1.6, gain: .035 }); }, room: () => run([24, 21, 19, 16], .1, { decay: 1.4, gain: .035 }), pin: () => tone(hz(36), { decay: .8, gain: .03 }), error: () => run([14, 9], .2, { decay: .9, gain: .035 }) },
  synth: { tap: () => tone(hz(12), { type: 'square', decay: .05, gain: .025, filter: 2400 }), send: () => run([0, 7, 12, 19], .045, { type: 'square', decay: .09, gain: .03, filter: 3000 }), arrive: () => run([12, 16, 19, 24, 19, 24, 28], .06, { type: 'square', decay: .14, gain: .03, filter: 3200 }), room: () => run([24, 19, 12, 7, 0], .05, { type: 'sawtooth', decay: .12, gain: .025, filter: 1800 }), pin: () => tone(hz(24), { type: 'square', decay: .08, gain: .03, filter: 2600 }), error: () => run([0, -5, -10], .08, { type: 'sawtooth', decay: .15, gain: .03, filter: 1200 }) },
  typewriter: { tap: () => click({ gain: .08 }), send: () => { for (let i = 0; i < 4; i++) click({ when: i * .07 + Math.random() * .02, gain: .1 }); click({ when: .34, gain: .14, length: .08, freq: 900 }); }, arrive: () => { click({ gain: .12, length: .06, freq: 900 }); tone(2637, { when: .12, decay: 1.4, gain: .05, harmonic: .5 }); }, room: () => click({ gain: .14, length: .1, freq: 600 }), pin: () => click({ gain: .1 }), error: () => tone(220, { type: 'triangle', decay: .3, gain: .06 }) },
  none: {},
};

export const sound = {
  get on() { return on; },
  set(enabled, pal = palette) { on = !!enabled; palette = PALETTES[pal] ? pal : 'wood'; if (on) ctx(); },
  /** @param {'tap'|'send'|'arrive'|'room'|'pin'|'error'} what */
  play(what) { if (!on) return; try { PALETTES[palette]?.[what]?.(); } catch { /* audio is a nicety */ } },
};
