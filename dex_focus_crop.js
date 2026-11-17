(() => {
  // Region Share - Focus Crop Bookmarklet for Official Chrome & Samsung DeX
  if (window.__regionShareActive) {
    if (typeof window.__regionShareExit === 'function') window.__regionShareExit();
    return;
  }
  window.__regionShareActive = true;

  // Cleanup helper
  let hoveredEl = null;
  let isolatedEl = null;
  let originalStyles = null;

  // Visual outline
  const outline = document.createElement('div');
  outline.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:3px solid #0284c7;background:rgba(2,132,199,0.12);transition:all 0.08s ease;display:none;border-radius:4px;';
  document.body.appendChild(outline);

  // Top Helper Banner
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;background:rgba(15,23,42,0.95);color:#fff;padding:10px 20px;border-radius:9999px;font-family:sans-serif;font-size:13px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 24px rgba(0,0,0,0.5);border:1px solid rgba(56,189,248,0.4);';
  banner.innerHTML = '<span style="color:#38bdf8;font-weight:700;">🎯 Region Share</span><span>Tap the dashboard section to isolate &amp; share</span><button id="rs-cancel-btn" style="background:rgba(255,255,255,0.15);border:none;color:#fff;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;">Cancel</button>';
  document.body.appendChild(banner);

  banner.querySelector('#rs-cancel-btn').onclick = (e) => {
    e.stopPropagation();
    exitInspector();
  };

  function updateOutline(target) {
    if (!target || target === outline || target === banner || banner.contains(target)) {
      outline.style.display = 'none';
      return;
    }
    const r = target.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    outline.style.left = `${r.left}px`;
    outline.style.top = `${r.top}px`;
    outline.style.width = `${r.width}px`;
    outline.style.height = `${r.height}px`;
    outline.style.display = 'block';
  }

  function onPointerMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el !== hoveredEl && el !== outline && !banner.contains(el)) {
      hoveredEl = el;
      updateOutline(el);
    }
  }

  function onPointerDown(e) {
    if (banner.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();

    const target = hoveredEl || document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === document.body || target === document.documentElement) return;

    isolateElement(target);
  }

  function isolateElement(el) {
    exitInspector();
    isolatedEl = el;

    // Save previous inline styles
    originalStyles = {
      position: el.style.position,
      top: el.style.top,
      left: el.style.left,
      width: el.style.width,
      height: el.style.height,
      zIndex: el.style.zIndex,
      backgroundColor: el.style.backgroundColor,
      overflow: el.style.overflow
    };

    // Exit Button
    const exitBadge = document.createElement('div');
    exitBadge.id = 'rs-exit-badge';
    exitBadge.style.cssText = 'position:fixed;top:14px;right:14px;z-index:2147483647;background:rgba(15,23,42,0.92);color:#fff;padding:8px 16px;border-radius:9999px;font-family:sans-serif;font-size:12px;font-weight:600;display:flex;align-items:center;gap:8px;box-shadow:0 6px 20px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.2);cursor:pointer;';
    exitBadge.innerHTML = '<span style="color:#ef4444;font-size:14px;">✕</span><span>Exit Cropped View</span>';
    document.body.appendChild(exitBadge);

    exitBadge.onclick = restoreElement;

    // Apply native Fullscreen if supported (hides Chrome address bar & tabs on Samsung DeX!)
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => applyFixedOverlay(el));
      document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
          restoreElement();
        }
      });
    } else {
      applyFixedOverlay(el);
    }

    window.__regionShareExit = restoreElement;
  }

  function applyFixedOverlay(el) {
    const computedBg = window.getComputedStyle(el).backgroundColor;
    const bg = (computedBg && computedBg !== 'rgba(0, 0, 0, 0)' && computedBg !== 'transparent') ? computedBg : '#ffffff';

    el.style.setProperty('position', 'fixed', 'important');
    el.style.setProperty('top', '0px', 'important');
    el.style.setProperty('left', '0px', 'important');
    el.style.setProperty('width', '100vw', 'important');
    el.style.setProperty('height', '100vh', 'important');
    el.style.setProperty('z-index', '2147483640', 'important');
    el.style.setProperty('overflow', 'auto', 'important');
    el.style.setProperty('background-color', bg, 'important');
  }

  function restoreElement() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    if (isolatedEl && originalStyles) {
      isolatedEl.style.position = originalStyles.position;
      isolatedEl.style.top = originalStyles.top;
      isolatedEl.style.left = originalStyles.left;
      isolatedEl.style.width = originalStyles.width;
      isolatedEl.style.height = originalStyles.height;
      isolatedEl.style.zIndex = originalStyles.zIndex;
      isolatedEl.style.backgroundColor = originalStyles.backgroundColor;
      isolatedEl.style.overflow = originalStyles.overflow;
    }

    const badge = document.getElementById('rs-exit-badge');
    if (badge) badge.remove();

    window.__regionShareActive = false;
    window.__regionShareExit = null;
    isolatedEl = null;
    originalStyles = null;
  }

  function exitInspector() {
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
    outline.remove();
    banner.remove();
    hoveredEl = null;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      exitInspector();
      if (isolatedEl) restoreElement();
    }
  }

  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKeyDown, true);
})();
