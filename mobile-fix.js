/* Mobile navigation hardening for <deck-stage>.
   Symptom: on some touch devices a single tap advances by 2 slides
   (1→3→5). Root cause is some combination of synthesized click,
   pointer + click double-fire, or an overlay click bubbling on top of
   the tap-zone click.

   Fix strategy (defense in depth):
     (1) Patch DeckStage.prototype._go with a debounce window so any
         second nav request within DEBOUNCE_MS is dropped — no matter
         where it came from (tap, click, pointer, key, api).
     (2) Set touch-action: manipulation on the shadow tap-zones so iOS
         doesn't add the 300ms click delay or double-tap zoom.
     (3) Listen at the deck-stage host in capture phase and squash
         duplicate clicks too, as a belt for older browsers that don't
         deliver pointerup before click (so step 1 sees them as a single
         path either way).
*/
(function () {
  const DEBOUNCE_MS = 400;

  function patchPrototype() {
    const Ctor = customElements.get('deck-stage');
    if (!Ctor || Ctor.__navDebounced) return false;
    const proto = Ctor.prototype;
    if (!proto || typeof proto._go !== 'function') return false;

    const original = proto._go;
    proto._go = function patchedGo(i, reason) {
      const now = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
      // Always allow programmatic API and keyboard — only debounce
      // pointer/touch/click flavours where the duplicates originate.
      const debounceable = reason === 'tap' || reason === 'click' || reason === 'pointer';
      if (debounceable) {
        const last = this.__lastNavAt || 0;
        if (now - last < DEBOUNCE_MS) return;
        this.__lastNavAt = now;
      } else {
        this.__lastNavAt = now;
      }
      return original.call(this, i, reason);
    };

    Ctor.__navDebounced = true;
    return true;
  }

  function patchInstance(stage) {
    if (!stage || stage.__tapHardened) return;
    const root = stage.shadowRoot;
    if (!root) return;
    stage.__tapHardened = true;

    // Disable iOS double-tap zoom + 300ms click delay on tap zones.
    root.querySelectorAll('.tapzones, .tapzone').forEach((el) => {
      el.style.touchAction = 'manipulation';
    });

    // Belt: squash duplicate clicks at the host.
    let lastClick = 0;
    stage.addEventListener(
      'click',
      (e) => {
        const t = e.timeStamp || Date.now();
        if (t - lastClick < DEBOUNCE_MS) {
          e.stopImmediatePropagation();
          e.preventDefault();
          return;
        }
        lastClick = t;
      },
      true
    );
  }

  function tryAll() {
    patchPrototype();
    document.querySelectorAll('deck-stage').forEach(patchInstance);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryAll, { once: true });
  } else {
    tryAll();
  }
  // DeckStage upgrades + builds shadow DOM in connectedCallback. Retry a
  // few times in case we ran first.
  requestAnimationFrame(tryAll);
  setTimeout(tryAll, 50);
  setTimeout(tryAll, 200);
  setTimeout(tryAll, 800);
})();
