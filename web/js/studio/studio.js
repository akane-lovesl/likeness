/**
 * Which studio is speaking. The showcase is a folder of static files that sketches on the device; a live studio is
 * the same app served by likeness serve, which answers studio.json with its engine: the simulator here, or Codex
 * with GPT Image on the workstation. The edition is shown on every screen, and every picture says how it was made.
 */
import { local } from './local.js';
import { remote } from './remote.js';

export const studio = {
  /** @type {'showcase' | 'simulator' | 'workstation'} */ mode: 'showcase',
  /** @type {any} */ info: null,
  /** @type {any} */ engine: local,
  get live() { return this.mode !== 'showcase'; },
  get label() { return { showcase: 'Showcase', simulator: 'Live · Simulator', workstation: 'Live · Workstation' }[this.mode]; },
  get makes() { return { showcase: 'sketches', simulator: 'simulated renders', workstation: 'renders' }[this.mode]; },
};

export async function connect() {
  try {
    const initial = document.getElementById('studio-state');
    const info = initial ? JSON.parse(initial.textContent || 'null')
      : await fetch('studio.json', { cache: 'no-store', signal: AbortSignal.timeout(2500) }).then(res => res.ok ? res.json() : null);
    if (info?.edition === 'live' && info.engine) { studio.mode = info.engine.kind === 'simulator' ? 'simulator' : 'workstation'; studio.info = info; studio.engine = remote(info.events === 'poll'); }
  } catch { /* no studio answered: showcase */ }
  document.documentElement.dataset.mode = studio.mode;
  return studio;
}
