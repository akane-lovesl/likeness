/** Likeness: find out which studio is speaking, remember the room, raise the sky, open the desk. */
import { connect, studio } from './studio/studio.js';
import { boot, settings, app } from './state.js';
import { paint } from './room/theme.js';
import { sky } from './room/sky.js';
import { applySky, roomById, changeRoom, setSky } from './room/atmosphere.js';
import { on } from './core/bus.js';
import { sound } from './core/sound.js';
import { screens } from './core/dom.js';
import { deskScreen } from './ui/desk.js';

await Promise.all([connect(), boot()]);
const stage = /** @type {HTMLElement} */ (document.getElementById('stage'));
const room = roomById(settings.get('room', 'atelier'));
sky.mount(stage);
paint(room); sky.setRoom(room); applySky();
sound.set(settings.get('sound', false), room.sound);
on('room', r => { sky.setRoom(r); applySky(); });
screens().append(deskScreen());

/** A handle for tests and for poking around in the console. */
Object.assign(window, { likeness: { app, studio, sky, room: id => changeRoom(roomById(id)), setSky } });

/** Touching the empty room stirs the weather. */
stage.addEventListener('pointerdown', e => {
  const t = /** @type {HTMLElement} */ (e.target);
  if (!t.closest('button, a, input, textarea, .print, .say, .job, .sheet, .box, .focus, .picker')) sky.poke(e.clientX, e.clientY);
});
if (!settings.get('welcomed', false) && !new URLSearchParams(location.search).has('skipwelcome')) import('./ui/welcome.js').then(m => m.welcome());
