/* Mobile tap debounce for <deck-stage>.
   On some touch devices a single tap fires `click` twice (synthesized
   pointer/click pairs), advancing the deck by 2 — slides skip 1→3→5.
   We attach a capture-phase listener to the shadow tap-zones and drop
   any second click that arrives within DEBOUNCE_MS of the previous one.
   Also disables double-tap zoom on the zones via touch-action. */
(function () {
  const DEBOUNCE_MS = 350;

  function patch(stage) {
    if (!stage || stage.__tapDebounced) return;
    const root = stage.shadowRoot;
    if (!root) return;
    const zones = root.querySelector('.tapzones');
    if (!zones) return;
    stage.__tapDebounced = true;

    // Disable iOS double-tap zoom + 300ms click delay on the zones.
    zones.style.touchAction = 'manipulation';
    root.querySelectorAll('.tapzone').forEach((z) => {
      z.style.touchAction = 'manipulation';
    });

    let last = 0;
    zones.addEventListener(
      'click',
      (e) => {
        const now = e.timeStamp || Date.now();
        if (now - last < DEBOUNCE_MS) {
          e.stopImmediatePropagation();
          e.preventDefault();
          return;
        }
        last = now;
      },
      true // capture: run before the original handlers
    );
  }

  function tryPatch() {
    document.querySelectorAll('deck-stage').forEach(patch);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryPatch, { once: true });
  } else {
    tryPatch();
  }
  // Shadow DOM is built in connectedCallback — re-try on next frame in case
  // we executed before the element upgraded.
  requestAnimationFrame(tryPatch);
  setTimeout(tryPatch, 100);
})();
