/**
 * The keyboard. The page is laid out as if it were not there: the stage's height is held at the height the screen had
 * without it (--app-h), so a browser that shrinks the page for the keyboard (instead of laying it over the page) can
 * no longer squash everything sized to the stage; the viewport is also told the keyboard overlays it. The line being
 * typed in rises to sit just above the keyboard, and if the browser pans the page to show the field anyway (Safari
 * does), the stage is held where it was. A field that opens at the top of the screen (the portrait's notes) needs none
 * of this, and is the way new text fields are made.
 */
export function watchKeyboard(/** @type {HTMLElement} */ stage) {
  let pan = 0, tall = 0, wide = 0;
  const root = document.documentElement;
  const typingNow = () => { const el = /** @type {HTMLElement | null} */ (document.activeElement); return !!el && el.matches('input:not([type="range"]):not([type="file"]):not([type="checkbox"]), textarea, [contenteditable="true"]'); };
  /** The screen's height without a keyboard: taken whenever nothing is being typed, or the screen turned. */
  const measure = () => {
    const h = window.innerHeight, w = window.innerWidth;
    if (w !== wide) { wide = w; tall = 0; }
    if (!typingNow() || !tall) tall = h;
    else tall = Math.max(tall, h);
    root.style.setProperty('--app-h', tall + 'px');
  };
  const update = () => {
    measure();
    const vv = window.visualViewport; if (!vv) return;
    const typing = typingNow() && stage.contains(document.activeElement);
    // the stage's foot, where it would be unpanned, over the top of the keyboard
    const bottom = stage.getBoundingClientRect().bottom - pan, over = Math.max(0, Math.round(bottom - vv.height));
    const up = typing && over > 60;
    pan = up ? Math.round(vv.offsetTop) : 0;
    stage.style.setProperty('--pan', pan + 'px');
    stage.style.setProperty('--kb', (up ? over : 0) + 'px');
    stage.classList.toggle('is-typing', up);
    // a page that scrolled itself to show the field is put back: the stage is never moved off the screen
    if (typing && (window.scrollY || document.scrollingElement?.scrollTop)) window.scrollTo(0, 0);
  };
  measure();
  window.addEventListener('resize', update);
  window.visualViewport?.addEventListener('resize', update);
  window.visualViewport?.addEventListener('scroll', update);
  document.addEventListener('focusin', () => { update(); setTimeout(update, 120); setTimeout(update, 420); });
  document.addEventListener('focusout', () => setTimeout(update, 60));
  window.addEventListener('orientationchange', () => { tall = 0; setTimeout(update, 300); });
  return update;
}
