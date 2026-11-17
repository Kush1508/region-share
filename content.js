/**
 * Region Share - Content Script
 * High-performance DOM inspector and arbitrary drag cropper.
 * Uses elementsFromPoint for zero-layout-thrashing hit testing across all websites.
 */

(() => {
  // If already loaded in this tab, clean up previous overlay and re-register
  if (typeof window.__regionShareCleanup === 'function') {
    try {
      window.__regionShareCleanup();
    } catch (e) {}
  }

  let isSelectionActive = false;
  let overlayHost = null;
  let shadowRoot = null;
  let backdrop = null;
  let highlightBox = null;
  let dragBox = null;
  let tooltip = null;
  let topBar = null;
  let currentHoveredElement = null;

  // Pointer & Drag state
  let isPointerDown = false;
  let hasDragged = false;
  let startX = 0;
  let startY = 0;
  let currentRect = null;

  // Tracking state for selected element
  let trackedElement = null;
  let trackedResizeObserver = null;
  let trackedScrollHandler = null;
  let trackedCustomRegion = null;
  let lastSentRect = null;
  let rafPending = false;

  /**
   * Generates a readable label for an element (e.g. "div.hero-header#main")
   */
  function getElementLabel(el) {
    if (!el || !el.tagName) return 'Element';
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    let classes = '';
    if (el.className && typeof el.className === 'string') {
      const clsList = el.className.trim().split(/\s+/).filter(Boolean);
      if (clsList.length > 0) {
        classes = `.${clsList.slice(0, 2).join('.')}`;
      }
    }
    return `${tag}${id}${classes}`;
  }

  /**
   * Robust hit-testing using elementsFromPoint so we penetrate cleanly through the overlay
   */
  function getElementUnderPoint(x, y) {
    try {
      const elements = document.elementsFromPoint(x, y) || [];
      return elements.find(el => (
        el &&
        el !== overlayHost &&
        el !== document.documentElement &&
        el !== document.body &&
        !overlayHost?.contains(el)
      ));
    } catch (e) {
      return null;
    }
  }

  /**
   * Creates the isolated Shadow DOM overlay
   */
  function createOverlay() {
    if (overlayHost) {
      removeOverlay();
    }

    overlayHost = document.createElement('div');
    overlayHost.id = 'region-share-overlay-host';
    shadowRoot = overlayHost.attachShadow({ mode: 'open' });

    // Styles inside Shadow DOM
    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        display: block;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
      }
      .backdrop {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(15, 23, 42, 0.16);
        cursor: crosshair;
        pointer-events: auto;
      }
      .top-bar {
        position: fixed;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 30;
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(56, 189, 248, 0.4);
        border-radius: 9999px;
        padding: 6px 16px;
        box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(56, 189, 248, 0.25);
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        pointer-events: auto;
        user-select: none;
      }
      .top-badge {
        font-weight: 700;
        color: #38bdf8;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .top-instruction {
        color: #cbd5e1;
        font-size: 12px;
      }
      .top-instruction strong {
        color: #ffffff;
      }
      .top-cancel-btn {
        background: rgba(239, 68, 68, 0.2);
        border: 1px solid rgba(239, 68, 68, 0.4);
        color: #fca5a5;
        border-radius: 6px;
        padding: 3px 10px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .top-cancel-btn:hover {
        background: rgba(239, 68, 68, 0.4);
        color: #ffffff;
      }
      .highlight-box {
        position: fixed;
        pointer-events: none;
        box-sizing: border-box;
        border: 2px solid #00d2ff;
        background: rgba(0, 210, 255, 0.12);
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 210, 255, 0.5);
        border-radius: 4px;
        transition: all 0.04s ease-out;
        display: none;
        z-index: 10;
      }
      .drag-box {
        position: fixed;
        pointer-events: none;
        box-sizing: border-box;
        border: 2px dashed #38bdf8;
        background: rgba(56, 189, 248, 0.2);
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 0 20px rgba(56, 189, 248, 0.4);
        border-radius: 3px;
        display: none;
        z-index: 11;
      }
      .drag-handle {
        position: absolute;
        width: 8px;
        height: 8px;
        background: #38bdf8;
        border: 1px solid #fff;
        border-radius: 1px;
      }
      .handle-tl { top: -4px; left: -4px; }
      .handle-tr { top: -4px; right: -4px; }
      .handle-bl { bottom: -4px; left: -4px; }
      .handle-br { bottom: -4px; right: -4px; }

      .tooltip {
        position: fixed;
        pointer-events: none;
        z-index: 20;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        color: #f8fafc;
        padding: 7px 12px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        line-height: 1.4;
        white-space: nowrap;
        display: none;
        user-select: none;
      }
      .tooltip .title {
        font-weight: 600;
        color: #38bdf8;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .tooltip .dims {
        display: inline-block;
        background: rgba(255, 255, 255, 0.15);
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 11px;
        color: #e2e8f0;
        font-family: ui-monospace, SFMono-Regular, monospace;
        margin-left: 6px;
      }
      .tooltip .hints {
        color: #94a3b8;
        font-size: 11px;
        margin-top: 3px;
      }
      .tooltip .kbd {
        background: rgba(255, 255, 255, 0.2);
        color: #f1f5f9;
        padding: 0 4px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
      }
    `;

    backdrop = document.createElement('div');
    backdrop.className = 'backdrop';

    // Top instruction pill
    topBar = document.createElement('div');
    topBar.className = 'top-bar';
    topBar.innerHTML = `
      <span class="top-badge">🎯 Region Share</span>
      <span class="top-instruction"><strong>Click</strong> an element, or <strong>Drag</strong> any box to crop</span>
      <button class="top-cancel-btn" title="Cancel Selection">Cancel (Esc)</button>
    `;
    topBar.querySelector('.top-cancel-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      stopSelection();
    });

    highlightBox = document.createElement('div');
    highlightBox.className = 'highlight-box';

    dragBox = document.createElement('div');
    dragBox.className = 'drag-box';
    ['tl', 'tr', 'bl', 'br'].forEach(pos => {
      const h = document.createElement('div');
      h.className = `drag-handle handle-${pos}`;
      dragBox.appendChild(h);
    });

    tooltip = document.createElement('div');
    tooltip.className = 'tooltip';

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(backdrop);
    shadowRoot.appendChild(topBar);
    shadowRoot.appendChild(highlightBox);
    shadowRoot.appendChild(dragBox);
    shadowRoot.appendChild(tooltip);

    const mountTarget = document.body || document.documentElement;
    mountTarget.appendChild(overlayHost);

    // Attach pointer listeners on backdrop
    backdrop.addEventListener('pointerdown', onPointerDown);
    backdrop.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown, true);
  }

  /**
   * Position the tooltip neatly above or below the bounding rect
   */
  function updateTooltipPosition(rect, label, dimsText, hintText) {
    if (!tooltip) return;

    tooltip.innerHTML = `
      <div class="title">
        <span>${label}</span>
        <span class="dims">${dimsText}</span>
      </div>
      <div class="hints">${hintText}</div>
    `;

    tooltip.style.display = 'block';

    const ttWidth = tooltip.offsetWidth || 280;
    const ttHeight = tooltip.offsetHeight || 50;
    const margin = 12;

    let left = rect.left + (rect.width / 2) - (ttWidth / 2);
    left = Math.max(margin, Math.min(window.innerWidth - ttWidth - margin, left));

    let top = rect.top - ttHeight - margin;
    if (top < margin) {
      top = rect.top + rect.height + margin;
      if (top + ttHeight > window.innerHeight - margin) {
        top = Math.max(margin, rect.top + margin);
      }
    }

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  /**
   * Pointer down: initiates click tracking or drag selection
   */
  function onPointerDown(e) {
    if (!isSelectionActive) return;
    isPointerDown = true;
    hasDragged = false;
    startX = e.clientX;
    startY = e.clientY;
  }

  /**
   * Pointer move: handles both element hover inspection and click+drag custom box
   */
  function onPointerMove(e) {
    if (!isSelectionActive) return;

    // Check if dragging a custom rectangle
    if (isPointerDown) {
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);

      if (dx > 4 || dy > 4 || e.shiftKey) {
        hasDragged = true;

        const left = Math.min(startX, e.clientX);
        const top = Math.min(startY, e.clientY);
        const width = Math.abs(e.clientX - startX);
        const height = Math.abs(e.clientY - startY);

        currentRect = { x: left, y: top, width, height };

        dragBox.style.left = `${left}px`;
        dragBox.style.top = `${top}px`;
        dragBox.style.width = `${width}px`;
        dragBox.style.height = `${height}px`;
        dragBox.style.display = 'block';

        if (highlightBox) highlightBox.style.display = 'none';

        updateTooltipPosition(
          { left, top, width, height },
          'Custom Region',
          `${Math.round(width)} × ${Math.round(height)} px`,
          `Release to crop • <span class="kbd">Esc</span> to cancel`
        );
        return;
      }
    }

    // Hover mode: identify element under cursor
    const target = getElementUnderPoint(e.clientX, e.clientY);
    if (!target) return;

    currentHoveredElement = target;
    const r = target.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;

    currentRect = {
      x: r.left,
      y: r.top,
      width: r.width,
      height: r.height
    };

    highlightBox.style.left = `${r.left}px`;
    highlightBox.style.top = `${r.top}px`;
    highlightBox.style.width = `${r.width}px`;
    highlightBox.style.height = `${r.height}px`;
    highlightBox.style.display = 'block';

    const label = getElementLabel(target);
    const dims = `${Math.round(r.width)} × ${Math.round(r.height)} px`;
    const hints = `Click to crop element • Drag across any area • <span class="kbd">Esc</span> to cancel`;

    updateTooltipPosition(r, label, dims, hints);
  }

  /**
   * Pointer up: completes custom drag box selection or element click
   */
  function onPointerUp(e) {
    if (!isSelectionActive || !isPointerDown) return;
    isPointerDown = false;

    // Case 1: Custom rectangular drag completion
    if (hasDragged && currentRect && currentRect.width >= 10 && currentRect.height >= 10) {
      finalizeSelection({
        isCustomRegion: true,
        element: null,
        rect: currentRect
      });
      return;
    }

    // Case 2: Direct click on element
    const target = getElementUnderPoint(e.clientX, e.clientY) || currentHoveredElement;
    if (target) {
      const r = target.getBoundingClientRect();
      finalizeSelection({
        isCustomRegion: false,
        element: target,
        rect: { x: r.left, y: r.top, width: r.width, height: r.height }
      });
    }
  }

  /**
   * Key down: handles Esc cancellation
   */
  function onKeyDown(e) {
    if (!isSelectionActive) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      stopSelection();
    }
  }

  /**
   * Finalizes the selected area and initiates streaming popup
   */
  function finalizeSelection({ isCustomRegion, element, rect }) {
    stopSelection();

    // Start dynamic tracking if it's an element
    if (!isCustomRegion && element) {
      startDynamicTracking(element);
    } else if (isCustomRegion) {
      startCustomRegionTracking(rect);
    }

    // Send selection details to background script to launch popup
    chrome.runtime.sendMessage({
      action: 'OPEN_VIEWER',
      selection: {
        isCustomRegion,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1
        },
        elementTag: element ? getElementLabel(element) : 'Custom Box'
      }
    }).catch(err => {
      console.warn('[Region Share] Error opening viewer popup:', err);
    });
  }

  /**
   * Tracks viewport resize changes so crop stays proportional
   */
  function startDynamicTracking(element) {
    cleanupTracking();
    trackedElement = element;

    const notifyUpdate = () => {
      if (rafPending) return;
      rafPending = true;

      requestAnimationFrame(() => {
        rafPending = false;
        chrome.runtime.sendMessage({
          action: 'RECT_UPDATE',
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio || 1
          }
        }).catch(() => {});
      });
    };

    trackedScrollHandler = () => notifyUpdate();
    window.addEventListener('resize', trackedScrollHandler, { passive: true });
  }

  /**
   * Keeps viewport synchronized on window resize
   */
  function startCustomRegionTracking(initialRect) {
    cleanupTracking();

    const notifyUpdate = () => {
      if (rafPending) return;
      rafPending = true;

      requestAnimationFrame(() => {
        rafPending = false;
        chrome.runtime.sendMessage({
          action: 'RECT_UPDATE',
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio || 1
          }
        }).catch(() => {});
      });
    };

    trackedScrollHandler = () => notifyUpdate();
    window.addEventListener('resize', trackedScrollHandler, { passive: true });
  }

  /**
   * Cleans up tracking listeners and observers
   */
  function cleanupTracking() {
    if (trackedResizeObserver) {
      trackedResizeObserver.disconnect();
      trackedResizeObserver = null;
    }
    if (trackedScrollHandler) {
      window.removeEventListener('resize', trackedScrollHandler);
      window.removeEventListener('scroll', trackedScrollHandler);
      trackedScrollHandler = null;
    }
    trackedElement = null;
    trackedCustomRegion = null;
    lastSentRect = null;
  }

  /**
   * Removes overlay element and resets selection state
   */
  function removeOverlay() {
    if (overlayHost) {
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown, true);
      overlayHost.remove();
      overlayHost = null;
      shadowRoot = null;
      highlightBox = null;
      dragBox = null;
      tooltip = null;
      topBar = null;
      backdrop = null;
    }
    currentHoveredElement = null;
    currentRect = null;
    isPointerDown = false;
    hasDragged = false;
  }

  /**
   * Starts selection mode
   */
  function startSelection() {
    isSelectionActive = true;
    createOverlay();
  }

  /**
   * Stops selection mode cleanly
   */
  function stopSelection() {
    isSelectionActive = false;
    removeOverlay();
  }

  /**
   * Toggles selection mode
   */
  function toggleSelection() {
    if (isSelectionActive) {
      stopSelection();
    } else {
      startSelection();
    }
  }

  // Expose global methods for direct programmatic or event-driven invocation
  window.__regionShareStart = startSelection;
  window.__regionShareStop = stopSelection;
  window.__regionShareToggle = toggleSelection;
  window.__regionShareCleanup = () => {
    stopSelection();
    cleanupTracking();
  };

  window.addEventListener('region-share-start', startSelection);
  window.addEventListener('region-share-toggle', toggleSelection);
  window.addEventListener('region-share-stop', stopSelection);

  // Listen for control commands from background service worker
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'START_SELECTION') {
      startSelection();
      sendResponse({ status: 'started' });
    } else if (msg.action === 'STOP_SELECTION') {
      stopSelection();
      sendResponse({ status: 'stopped' });
    } else if (msg.action === 'TOGGLE_SELECTION') {
      toggleSelection();
      sendResponse({ status: isSelectionActive ? 'active' : 'inactive' });
    } else if (msg.action === 'GET_TRACKED_RECT') {
      if (trackedElement && document.contains(trackedElement)) {
        const r = trackedElement.getBoundingClientRect();
        sendResponse({
          rect: {
            x: Math.round(r.left),
            y: Math.round(r.top),
            width: Math.round(r.width),
            height: Math.round(r.height)
          },
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio || 1
          }
        });
      } else if (trackedCustomRegion) {
        sendResponse({
          rect: {
            x: Math.round(trackedCustomRegion.docX - window.scrollX),
            y: Math.round(trackedCustomRegion.docY - window.scrollY),
            width: Math.round(trackedCustomRegion.width),
            height: Math.round(trackedCustomRegion.height)
          },
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio || 1
          }
        });
      } else {
        sendResponse({ rect: null });
      }
    }
    return true;
  });
})();
