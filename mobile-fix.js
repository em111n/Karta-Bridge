/* Mobile navigation hardening v3 — replaces tap-zone handlers entirely.
   Symptom: each tap on phone advances by 2 (1→3→5…). Some browsers
   double-fire click after touch, and patching debounce wasn't enough.
   Now we replace the tap-zone click handlers with our own pointerup-
   based ones so there is exactly one trigger per finger lift, and we
   also monkey-patch _go on the prototype as a belt. */
(function () {
  const DEBOUNCE_MS = 450;
  const log = (...a) => { try { console.log('[deck-fix]', ...a); } catch (e) {} };

  // -- (1) Prototype-level _go debounce ---------------------------------
  function patchPrototype() {
    const Ctor = customElements.get('deck-stage');
    if (!Ctor || Ctor.__navHardened) return false;
    const proto = Ctor.prototype;
    if (!proto || typeof proto._go !== 'function') return false;

    const orig = proto._go;
    proto._go = function patchedGo(i, reason) {
      const now = (performance && performance.now) ? performance.now() : Date.now();
      const last = this.__lastNavAt || 0;
      if (now - last < DEBOUNCE_MS) {
        log('drop dup _go', { i, reason, dt: Math.round(now - last) });
        return;
      }
      this.__lastNavAt = now;
      return orig.call(this, i, reason);
    };

    Ctor.__navHardened = true;
    log('prototype patched');
    return true;
  }

  // -- (2) Replace tap-zone handlers with pointerup --------------------
  function rewireTapZones(stage) {
    if (!stage || stage.__zonesRewired) return;
    const root = stage.shadowRoot;
    if (!root) return;
    const zones = root.querySelector('.tapzones');
    if (!zones) return;

    const back = root.querySelector('.tapzone--back');
    const fwd = root.querySelector('.tapzone--fwd');
    if (!back || !fwd) return;

    // Disable iOS click delay & double-tap zoom on the zones.
    [zones, back, fwd].forEach((el) => { el.style.touchAction = 'manipulation'; });

    // Suppress all click + touchend on the zones — we'll drive nav from pointerup.
    const swallow = (e) => { e.stopImmediatePropagation(); e.preventDefault(); };
    ['click', 'touchend', 'touchstart', 'mousedown', 'mouseup'].forEach((ev) => {
      back.addEventListener(ev, swallow, true);
      fwd.addEventListener(ev, swallow, true);
    });

    // Single, debounced source of truth: pointerup.
    let last = 0;
    const fire = (dir) => {
      const now = performance.now ? performance.now() : Date.now();
      if (now - last < DEBOUNCE_MS) { log('drop pointerup', dir); return; }
      last = now;
      log('nav', dir);
      if (dir === 1) stage.next(); else stage.prev();
    };
    back.addEventListener('pointerup', (e) => { e.preventDefault(); fire(-1); });
    fwd.addEventListener('pointerup', (e) => { e.preventDefault(); fire(1); });

    stage.__zonesRewired = true;
    log('zones rewired');
  }

  // -- (3) Window-level dup click squash -------------------------------
  let lastWinClick = 0;
  window.addEventListener('click', (e) => {
    const t = e.timeStamp || Date.now();
    if (t - lastWinClick < DEBOUNCE_MS) {
      log('drop dup window click');
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
    lastWinClick = t;
  }, true);

  function tryAll() {
    patchPrototype();
    document.querySelectorAll('deck-stage').forEach(rewireTapZones);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryAll, { once: true });
  } else {
    tryAll();
  }
  requestAnimationFrame(tryAll);
  [50, 200, 500, 1200].forEach((ms) => setTimeout(tryAll, ms));
})();
