/** Likeness: find out which studio is speaking, remember the room, raise the sky, open the desk, and over it the Lookbook. */
import { connect, studio } from './studio/studio.js';
import { boot, settings, app } from './state.js';
import { paint } from './room/theme.js';
import { sky } from './room/sky.js';
import { applySky, roomById, changeRoom, setSky } from './room/atmosphere.js';
import { on } from './core/bus.js';
import { refreshOutside } from './room/outside.js';
import { sound } from './core/sound.js';
import { screens } from './core/dom.js';
import { deskScreen } from './ui/desk.js';
import { showBook } from './looks/book.js';
import { watchKeyboard } from './core/keyboard.js';
import { welcome } from './ui/welcome.js';

await Promise.all([connect(), boot()]);
const stage = /** @type {HTMLElement} */ (document.getElementById('stage'));
watchKeyboard(stage);
const room = roomById(settings.get('room', 'salon'));
sky.mount(stage);
paint(room); sky.setRoom(room); applySky();
sound.set(settings.get('sound', false), room.sound);
on('room', r => { sky.setRoom(r); applySky(); });
const lookOutside = () => refreshOutside().then(o => { if (o) applySky(); }).catch(() => {});
lookOutside(); setInterval(lookOutside, 15 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) lookOutside(); });
screens().append(deskScreen());

/** A handle for tests and for poking around in the console. */
Object.assign(window, { likeness: { app, studio, sky, room: id => changeRoom(roomById(id)), setSky } });

/** Touching the empty room stirs the weather. */
stage.addEventListener('pointerdown', e => {
  const t = /** @type {HTMLElement} */ (e.target);
  if (!t.closest('button, a, input, textarea, .print, .say, .job, .sheet, .box, .focus, .picker, .book, .mr')) sky.poke(e.clientX, e.clientY);
});
// the Lookbook first, unless the address asks for the desk
const asked = new URLSearchParams(location.search);
if (!asked.has('desk') && !asked.has('skipwelcome')) {
  showBook();
  if (asked.has('welcome') || !navigator.webdriver) welcome({ force: asked.has('welcome') });
}
