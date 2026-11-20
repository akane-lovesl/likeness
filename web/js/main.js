/**
 * Likeness: find out which studio is speaking, dress the app in the style in front, raise the sky, and open the
 * styles. The desk (the conversation with the studio) is always there underneath, as the Studio tab; the Lookbook
 * (hair and make-up tried on a face) is a place of its own.
 */
import { connect, studio } from './studio/studio.js';
import { boot, settings, app } from './state.js';
import { paint } from './room/theme.js';
import { sky } from './room/sky.js';
import { applySky, roomById, changeRoom, setSky } from './room/atmosphere.js';
import { on } from './core/bus.js';
import { refreshOutside } from './room/outside.js';
import { sound } from './core/sound.js';
import { screens, h, icon } from './core/dom.js';
import { deskScreen } from './ui/desk.js';
import { showBook } from './looks/book.js';
import { watchKeyboard } from './core/keyboard.js';
import { welcome } from './ui/welcome.js';
import { define, start, back, go, here } from './core/nav.js';
import { homeScreen, intro } from './portrait/home.js';
import { createScreen, resumePortraits } from './portrait/create.js';
import { mineScreen } from './portrait/gallery.js';
import { portraits } from './portrait/keep.js';
import { STYLES, styleById } from './portrait/styles.js';

await Promise.all([connect(), boot()]);
const stage = /** @type {HTMLElement} */ (document.getElementById('stage'));
watchKeyboard(stage);
// the room: the one you were in, or the style in front's (the Little Princess, the first time)
const room = roomById(settings.get('room', styleById(settings.get('style', ''))?.room || STYLES[0].room));
sky.mount(stage);
paint(room); sky.setRoom(room); applySky();
sound.set(settings.get('sound', false), room.sound);
on('room', r => { sky.setRoom(r); applySky(); });
const lookOutside = () => refreshOutside().then(o => { if (o) applySky(); }).catch(() => {});
lookOutside(); setInterval(lookOutside, 15 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) lookOutside(); });

// the desk, under everything, with a way back from it
const desk = deskScreen();
screens().append(desk);
desk.querySelector('.desk__bar')?.prepend(h('button.icon-btn.desk__home', { type: 'button', 'aria-label': 'Back to the styles', title: 'Back', html: icon('back'), onclick: () => back() }));

define('home', homeScreen);
define('create', createScreen);
define('mine', mineScreen);
define('desk', () => ({ el: null, shown: () => desk.querySelector('textarea')?.blur() }));
define('looks', () => {
  showBook();
  const book = /** @type {HTMLElement | null} */ (stage.querySelector('section.book'));
  if (book && !book.querySelector('.lb-home')) book.querySelector('.lb-bar')?.prepend(h('button.lb-home', { type: 'button', 'aria-label': 'Back to the styles', title: 'Back', html: icon('back'), onclick: () => back() }));
  // the Lookbook's own way to the desk is the desk tab
  const watch = book && new MutationObserver(() => { if (book.classList.contains('is-away') && here() === 'looks') go('desk'); });
  watch?.observe(book, { attributes: true, attributeFilter: ['class'] });
  return { el: null, left: () => { watch?.disconnect(); if (book && !book.classList.contains('is-away')) { book.classList.add('is-away'); book.setAttribute('inert', ''); } } };
});

/** A handle for tests and for poking around in the console. */
Object.assign(window, { likeness: { app, studio, sky, room: id => changeRoom(roomById(id)), setSky, go } });

/** Touching the empty room stirs the weather. */
stage.addEventListener('pointerdown', e => {
  const t = /** @type {HTMLElement} */ (e.target);
  if (!t.closest('button, a, input, textarea, .print, .say, .job, .sheet, .box, .focus, .picker, .book, .mr, .cr, .mine, .tabs, .ph-track, .intro')) sky.poke(e.clientX, e.clientY);
});

// where to begin: the address's screen; the old addresses (?desk, ?looks, ?welcome) still work
const asked = new URLSearchParams(location.search);
if (asked.has('desk') || asked.has('skipwelcome')) start('desk');
else if (asked.has('looks') || asked.has('welcome')) {
  start('looks');
  if (asked.has('welcome')) welcome({ force: true });
} else {
  start('home');
  if (asked.has('intro') || !navigator.webdriver) intro({ force: asked.has('intro') });
}
portraits().then(resumePortraits).catch(() => {});
