/**
 * Region Share - Content Script
 * Handles DOM element inspection, custom Shift+drag rectangle cropping,
 * and real-time bounding rect tracking for dynamic elements.
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
  let highlightBox = null;
  let dragBox = null;
  let tooltip = null;
  let currentHoveredElement = null;

  // Drag state
  let isDragging = false;
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
        background: rgba(15, 23, 42, 0.12);
        cursor: crosshair;
        pointer-events: auto;
      }
      .highlight-box {
        position: fixed;
        pointer-events: none;
        box-sizing: border-box;
        border: 2px solid #00d2ff;
        background: rgba(0, 210, 255, 0.1);
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 0 18px rgba(0, 210, 255, 0.45);
        border-radius: 3px;
        transition: all 0.05s ease-out;
        display: none;
        z-index: 10;
      }
      .drag-box {
        position: fixed;
        pointer-events: none;
        box-sizing: border-box;
        border: 2px dashed #38bdf8;
        background: rgba(56, 189, 248, 0.18);
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 0 16px rgba(56, 189, 248, 0.35);
        border-radius: 2px;
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
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        color: #f8fafc;
        padding: 7px 12px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.2);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 12px;
        line-height: 1.4;
        white-space: nowrap;
        display: none;
        transform: translateY(0);
        transition: opacity 0.1s ease;
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
        background: rgba(255, 255, 255, 0.12);
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 11px;
        color: #e2e8f0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        margin-left: 6px;
      }
      .tooltip .hints {
        color: #94a3b8;
        font-size: 11px;
        margin-top: 3px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .tooltip .kbd {
        background: rgba(255, 255, 255, 0.15);
        color: #f1f5f9;
        padding: 0 4px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
      }
    `;

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';

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
    shadowRoot.appendChild(highlightBox);
    shadowRoot.appendChild(dragBox);
    shadowRoot.appendChild(tooltip);

    document.documentElement.appendChild(overlayHost);

    // Attach listeners
    backdrop.addEventListener('pointermove', onPointerMove);
    backdrop.addEventListener('pointerdown', onPointerDown);
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
    const margin = 10;

    let left = rect.left + (rect.width / 2) - (ttWidth / 2);
    // Keep horizontally in viewport
    left = Math.max(margin, Math.min(window.innerWidth - ttWidth - margin, left));

    let top = rect.top - ttHeight - margin;
    if (top < margin) {
      // Not enough room above, place below
      top = rect.top + rect.height + margin;
      if (top + ttHeight > window.innerHeight - margin) {
        // Place inside rect if too large
        top = Math.max(margin, rect.top + margin);
      }
    }

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  /**
   * Pointer move: handles both element hover inspection and Shift+drag box expansion
   */
  function onPointerMove(e) {
    if (!isSelectionActive) return;

    if (isDragging) {
      // Custom rectangle drag mode
      const currentX = e.clientX;
      const currentY = e.clientY;

      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

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
        `Release to finish • <span class="kbd">Esc</span> to cancel`
      );
      return;
    }

    // Hover mode: identify element under cursor
    // Temporarily hide overlay host from hit-testing
    overlayHost.style.pointerEvents = 'none';
    const target = document.elementFromPoint(e.clientX, e.clientY);
    overlayHost.style.pointerEvents = 'auto';

    if (!target || target === document.documentElement || target === document.body || target === overlayHost) {
      return;
    }

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
    const hints = `Click to select • <span class="kbd">Shift+Drag</span> for custom box • <span class="kbd">Esc</span> to cancel`;

    updateTooltipPosition(r, label, dims, hints);
  }

  /**
   * Pointer down: detects element click or Shift+drag initiation
   */
  function onPointerDown(e) {
    if (!isSelectionActive) return;

    // Start custom box selection if Shift is held or primary click on backdrop
    if (e.shiftKey) {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      currentHoveredElement = null;
      if (highlightBox) highlightBox.style.display = 'none';
      return;
    }

    // Normal click selection on hovered element
    if (currentHoveredElement && currentRect) {
      e.preventDefault();
      e.stopPropagation();
      finalizeSelection({
        isCustomRegion: false,
        element: currentHoveredElement,
        rect: currentRect
      });
    }
  }

  /**
   * Pointer up: completes custom drag box selection
   */
  function onPointerUp(e) {
    if (!isSelectionActive) return;

    if (isDragging) {
      isDragging = false;
      if (currentRect && currentRect.width >= 15 && currentRect.height >= 15) {
        finalizeSelection({
          isCustomRegion: true,
          element: null,
          rect: currentRect
        });
      } else {
        // Drag was too small, discard and resume hover inspection
        if (dragBox) dragBox.style.display = 'none';
        currentRect = null;
      }
    }
  }

  /**
   * Key down: handles Esc cancellation and Shift status
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
      // Track custom region with scroll offset
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
   * Starts real-time tracking of an element's bounding rect
   * (updates dynamically on scroll, resize, DOM layout shifts)
   */
  function startDynamicTracking(element) {
    cleanupTracking();
    trackedElement = element;

    const notifyUpdate = () => {
      if (!trackedElement || !document.contains(trackedElement)) return;
      if (rafPending) return;

      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (!trackedElement) return;

        const r = trackedElement.getBoundingClientRect();
        const update = {
          x: Math.round(r.left),
          y: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height)
        };

        // Only send if coordinates actually changed
        if (
          !lastSentRect ||
          lastSentRect.x !== update.x ||
          lastSentRect.y !== update.y ||
          lastSentRect.width !== update.width ||
          lastSentRect.height !== update.height
        ) {
          lastSentRect = update;
          chrome.runtime.sendMessage({
            action: 'RECT_UPDATE',
            rect: update,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
              devicePixelRatio: window.devicePixelRatio || 1
            }
          }).catch(() => {
            // Popup may have closed, ignore error
          });
        }
      });
    };

    // ResizeObserver on element
    try {
      trackedResizeObserver = new ResizeObserver(() => notifyUpdate());
      trackedResizeObserver.observe(trackedElement);
    } catch (e) {
      // Fallback
    }

    // Scroll and window resize listeners
    trackedScrollHandler = () => notifyUpdate();
    window.addEventListener('scroll', trackedScrollHandler, { passive: true });
    window.addEventListener('resize', trackedScrollHandler, { passive: true });
  }

  /**
   * Tracks a custom region relative to page scroll
   */
  function startCustomRegionTracking(initialRect) {
    cleanupTracking();
    const docX = initialRect.x + window.scrollX;
    const docY = initialRect.y + window.scrollY;
    trackedCustomRegion = { docX, docY, width: initialRect.width, height: initialRect.height };

    const notifyUpdate = () => {
      if (!trackedCustomRegion || rafPending) return;
      rafPending = true;

      requestAnimationFrame(() => {
        rafPending = false;
        if (!trackedCustomRegion) return;

        const currentViewX = Math.round(trackedCustomRegion.docX - window.scrollX);
        const currentViewY = Math.round(trackedCustomRegion.docY - window.scrollY);

        const update = {
          x: currentViewX,
          y: currentViewY,
          width: Math.round(trackedCustomRegion.width),
          height: Math.round(trackedCustomRegion.height)
        };

        if (
          !lastSentRect ||
          lastSentRect.x !== update.x ||
          lastSentRect.y !== update.y
        ) {
          lastSentRect = update;
          chrome.runtime.sendMessage({
            action: 'RECT_UPDATE',
            rect: update,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
              devicePixelRatio: window.devicePixelRatio || 1
            }
          }).catch(() => {});
        }
      });
    };

    trackedScrollHandler = () => notifyUpdate();
    window.addEventListener('scroll', trackedScrollHandler, { passive: true });
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
      window.removeEventListener('scroll', trackedScrollHandler);
      window.removeEventListener('resize', trackedScrollHandler);
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
    }
    currentHoveredElement = null;
    currentRect = null;
    isDragging = false;
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
