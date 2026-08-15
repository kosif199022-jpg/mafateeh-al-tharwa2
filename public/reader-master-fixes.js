/* مفاتيح الثروة — Runtime stability fixes (v30.1)
 * Centralizes mobile modal/scroll safeguards without rewriting reader.html.
 */
(() => {
  'use strict';

  const VERSION = '30.1';
  window.__MAFATEEH_RUNTIME_VERSION__ = VERSION;

  const docEl = document.documentElement;
  const body = document.body;

  // reader.html used to be hard-coded to iOS. Detect the actual platform early.
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  docEl.dataset.platform = isIOS ? 'ios' : isAndroid ? 'android' : 'web';

  // The auto-scroll loop uses the legacy scrollBy(x,y) form. Explicitly make
  // CSS scrolling instant so every animation frame is not turned into a new
  // smooth-scroll animation (especially important in Safari).
  docEl.style.scrollBehavior = 'auto';

  // Register offline support immediately instead of waiting for window.load.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').then(reg => reg.update()).catch(() => {});
  }

  const style = document.createElement('style');
  style.id = 'mk-master-fixes-style';
  style.textContent = `
    html { scroll-behavior:auto !important; }
    /* One runtime owns scroll containment. Avoid competing position:fixed locks
       from optional reader modules, which can lose the reading position on iOS. */
    html.mixer-open, body.mixer-open, body.smart-modal-open {
      position:static !important;
      inset:auto !important;
      width:auto !important;
      height:auto !important;
    }
    body.mk-overlay-open { overscroll-behavior:none; }
  `;
  document.head.appendChild(style);

  const overlaySelectors = [
    '#search.on', '#drawer.on', '#prefs.on', '#scrim.on',
    '#mediaShade.on', '#installShade.on', '#journalShade.on', '#noteShade.on',
    '[role="dialog"][aria-hidden="false"]', '[aria-modal="true"]:not([aria-hidden="true"])',
    '.studio-shade.on', '.studio-modal.on', '.mixer-shade.on', '.mixer-modal.on',
    '.smart-modal.on', '.smart-sheet.on', '.mk-modal.on', '.mk-sheet.on',
    '[class*="shade"].on[aria-hidden="false"]', '[class*="modal"].on[aria-hidden="false"]'
  ].join(',');

  const overlayRootSelector = [
    '#search', '#drawer', '#prefs', '#scrim', '#mediaShade', '#installShade', '#journalShade', '#noteShade',
    '[role="dialog"]', '[aria-modal="true"]',
    '.studio-shade', '.studio-modal', '.mixer-shade', '.mixer-modal',
    '.smart-modal', '.smart-sheet', '.mk-modal', '.mk-sheet',
    '[class*="shade"]', '[class*="modal"]'
  ].join(',');

  let overlayOpen = false;
  let savedY = 0;
  let checkQueued = false;

  function pauseAutoScroll() {
    try {
      if (typeof window.autoScrollPause === 'function') window.autoScrollPause(true);
      else if (typeof autoScrollPause === 'function') autoScrollPause(true);
    } catch (_) {}
  }

  function hasVisibleOverlay() {
    for (const el of document.querySelectorAll(overlaySelectors)) {
      if (!el.isConnected) continue;
      const cs = getComputedStyle(el);
      if (cs.display !== 'none' && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none') return true;
    }
    return false;
  }

  function syncOverlayState() {
    checkQueued = false;
    const open = hasVisibleOverlay();
    if (open === overlayOpen) {
      if (open) pauseAutoScroll();
      return;
    }

    overlayOpen = open;
    if (open) {
      savedY = window.scrollY || docEl.scrollTop || 0;
      body.classList.add('mk-overlay-open');
      pauseAutoScroll();
    } else {
      body.classList.remove('mk-overlay-open');
      // Some optional modules clear styles/classes asynchronously. Restore after
      // their close handlers finish, without using smooth scrolling.
      requestAnimationFrame(() => {
        if (Math.abs((window.scrollY || 0) - savedY) > 2) {
          window.scrollTo({ top: savedY, left: 0, behavior: 'instant' });
        }
      });
    }
  }

  function queueOverlayCheck() {
    if (checkQueued) return;
    checkQueued = true;
    requestAnimationFrame(syncOverlayState);
  }

  new MutationObserver(queueOverlayCheck).observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-hidden', 'style']
  });

  // Robust nested-scroll handling. Instead of maintaining a hand-written list
  // such as .track-list, find the nearest element that can actually scroll.
  function scrollableAncestor(el, root) {
    for (let node = el instanceof Element ? el : el?.parentElement; node && node !== body; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (/(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
      if (node === root) break;
    }
    return null;
  }

  let touchY = 0;
  document.addEventListener('touchstart', event => {
    if (!overlayOpen || !event.touches?.length) return;
    touchY = event.touches[0].clientY;
  }, { capture: true, passive: true });

  document.addEventListener('touchmove', event => {
    if (!overlayOpen || !event.touches?.length) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const root = target?.closest?.(overlayRootSelector);
    if (!root) {
      event.preventDefault();
      return;
    }

    const y = event.touches[0].clientY;
    const dy = y - touchY;
    touchY = y;
    const scroller = scrollableAncestor(target, root);

    if (!scroller) {
      event.preventDefault();
      return;
    }

    const atTop = scroller.scrollTop <= 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    if ((atTop && dy > 0) || (atBottom && dy < 0)) {
      event.preventDefault();
      return;
    }

    // Prevent older bubble-phase boundary handlers from selecting an outer
    // container and freezing this nested scroller. The browser default remains.
    event.stopPropagation();
  }, { capture: true, passive: false });

  // Desktop/trackpad equivalent: keep wheel scrolling inside the active modal.
  document.addEventListener('wheel', event => {
    if (!overlayOpen) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const root = target?.closest?.(overlayRootSelector);
    const scroller = root ? scrollableAncestor(target, root) : null;
    if (!scroller) {
      event.preventDefault();
      return;
    }
    const atTop = scroller.scrollTop <= 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    if ((atTop && event.deltaY < 0) || (atBottom && event.deltaY > 0)) event.preventDefault();
  }, { capture: true, passive: false });

  // If an overlay opens between two auto-scroll frames, this observer pauses the
  // loop before it can interpret a temporarily collapsed scrollHeight as EOF.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAutoScroll();
  });

  queueOverlayCheck();
})();
