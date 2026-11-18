/**
 * The atmosphere is the room (your place, chosen once) and the sky (today's weather, light and mood, which resets
 * each morning unless you set it again). This module puts the two together and keeps them in step.
 */
import { ROOMS, MOODS } from './rooms.js';
import { enterRoom, setTempo, atmosphere } from './theme.js';
import { sky } from './sky.js';
import { app, settings } from '../state.js';
import { emit } from '../core/bus.js';
import { sound } from '../core/sound.js';
import { outsideWeather } from './outside.js';

export const today = () => new Date().toISOString().slice(0, 10);
export const allRooms = () => [...ROOMS, ...app.rooms];
export const roomById = id => allRooms().find(r => r.id === id) || ROOMS[0];
/** A room you already know, by its name or id: "noir", "the Observatory", "little princess". */
export function roomCalled(words) {
  const plain = (/** @type {string} */ s) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
  const k = plain(String(words || '').replace(/^\s*(?:the|a|an|my)\s+/i, '').replace(/\s+room\s*$/i, ''));
  return k ? allRooms().find(r => r.id === k || plain(r.name) === k) || null : null;
}
/** Today's sky settings; yesterday's are forgotten. */
export function skySettings() { const s = settings.get('sky', {}); return s.day === today() ? s : { day: today() }; }
export function setSky(patch) { settings.set('sky', { ...skySettings(), ...patch, day: today() }); applySky(); }
export function skyFor(room = atmosphere.room) {
  const s = skySettings(), mood = MOODS.find(m => m.id === s.mood);
  return { weather: s.weather || mood?.weather || outsideWeather()?.weather || room.sky?.weather || 'clear', light: s.light || mood?.light || room.sky?.light || 'auto', intensity: s.intensity ?? mood?.intensity ?? .7, wind: mood?.wind ?? .35, tempo: mood?.tempo ?? 1, mood: mood || null };
}
export function applySky() {
  const s = skyFor();
  sky.set(s); setTempo(s.tempo);
  emit('sky', s);
}
/** Moves into a room, growing it from where the finger was. */
export async function changeRoom(room, origin = null) {
  settings.set('room', room.id);
  sound.set(sound.on, room.sound);
  await enterRoom(room, { origin });
  sound.play('room');
}
