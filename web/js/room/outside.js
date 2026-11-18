/**
 * The weather outside, brought in, only when you switch it on. Your position, rounded to about ten kilometres, is
 * sent to open-meteo.com for the current weather, at most every forty-five minutes. Nothing else leaves the device.
 * A mood or a weather you choose for the day still comes first.
 */
import { settings } from '../state.js';

const FRESH = 45 * 60 * 1000, STALE = 6 * 3600 * 1000;

/** @returns {{ on: boolean, at?: number, weather?: string, code?: number, temp?: number, day?: boolean }} */
export const outside = () => settings.get('outside', { on: false });
/** The outside weather if it is on and recent enough to believe. */
export function outsideWeather() { const o = outside(); return o.on && o.weather && Date.now() - (o.at || 0) < STALE ? o : null; }
export function setOutside(on) { settings.set('outside', { on }); }

/** WMO weather codes to the app's weathers. */
function fromCode(code, day) {
  if (code >= 95) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code === 45 || code === 48 || code === 3) return 'fog';
  return day ? (code === 0 ? 'clear' : 'motes') : 'stars';
}

/** Looks outside, if it is time to. Resolves the reading, or null when switched off. */
export async function refreshOutside({ force = false } = {}) {
  const o = outside();
  if (!o.on) return null;
  if (!force && o.at && Date.now() - o.at < FRESH) return o;
  const pos = await new Promise((resolve, reject) => navigator.geolocation
    ? navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, maximumAge: 3600 * 1000, timeout: 15000 })
    : reject(new Error('no geolocation')));
  const lat = Math.round(pos.coords.latitude * 10) / 10, lon = Math.round(pos.coords.longitude * 10) / 10;
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current=weather_code,is_day,temperature_2m';
  const data = await fetch(url, { signal: AbortSignal.timeout(10000) }).then(r => { if (!r.ok) throw new Error('weather ' + r.status); return r.json(); });
  const c = data.current || {};
  const next = { on: true, at: Date.now(), weather: fromCode(Number(c.weather_code), !!c.is_day), code: Number(c.weather_code), temp: Math.round(Number(c.temperature_2m)), day: !!c.is_day };
  if (outside().on) settings.set('outside', next);
  return next;
}
