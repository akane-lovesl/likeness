/**
 * The keyboard. The page is laid out as if it were not there (the viewport is told the keyboard overlays it), so the
 * stage never shrinks or jumps when one opens; instead the line being typed in rises to sit just above it, and if the
 * browser pans the page to show the field anyway (Safari does), the stage is held where it was.
 */
export function watchKeyboard(/** @type {HTMLElement} */ stage) {
  let pan = 0;
  const update = () => {
    const vv = window.visualViewport; if (!vv) return;
    const el = /** @type {HTMLElement | null} */ (document.activeElement);
    const typing = !!el && el.matches('input:not([type="range"]):not([type="file"]), textarea') && stage.contains(el);
    // the stage's foot, where it would be unpanned, over the top of the keyboard
    const bottom = stage.getBoundingClientRect().bottom - pan, over = Math.max(0, Math.round(bottom - vv.height));
    const up = typing && over > 60;
    pan = up ? Math.round(vv.offsetTop) : 0;
    stage.style.setProperty('--pan', pan + 'px');
    stage.style.setProperty('--kb', (up ? over : 0) + 'px');
    stage.classList.toggle('is-typing', up);
  };
  window.visualViewport?.addEventListener('resize', update);
  window.visualViewport?.addEventListener('scroll', update);
  document.addEventListener('focusin', () => { update(); setTimeout(update, 120); setTimeout(update, 420); });
  document.addEventListener('focusout', () => setTimeout(update, 60));
  return update;
}
