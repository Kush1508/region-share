/**
 * Region Share - Cropped Stream Viewer
 * Captures the selected browser tab and renders a crisp, high-DPI
 * real-time cropped canvas of the targeted element or custom region.
 */

(() => {
  // DOM Elements
  const sourceVideo = document.getElementById('source-video');
  const cropCanvas = document.getElementById('crop-canvas');
  const ctx = cropCanvas.getContext('2d', { alpha: false, desynchronized: true });
  const setupCard = document.getElementById('setup-card');
  const startBtn = document.getElementById('start-btn');
  const statusMsg = document.getElementById('status-msg');

  // Info display elements
  const tabTitleEl = document.getElementById('tab-title');
  const promptTabHintEl = document.getElementById('prompt-tab-hint');
  const targetTagEl = document.getElementById('target-tag');
  const targetDimsEl = document.getElementById('target-dims');

  // Floating HUD elements
  const streamHud = document.getElementById('stream-hud');
  const hudDims = document.getElementById('hud-dims');
  const hudFps = document.getElementById('hud-fps');
  const fitToggleBtn = document.getElementById('fit-toggle-btn');
  const stopBtn = document.getElementById('stop-btn');

  // Session & Tracking State
  let sessionId = null;
  let sessionData = null;
  let currentRect = { x: 0, y: 0, width: 800, height: 600 };
  let currentViewport = { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: 1 };
  let isStreaming = false;
  let mediaStream = null;
  let hudHideTimeout = null;

  // FPS calculation
  let frameCount = 0;
  let lastFpsTime = performance.now();

  /**
   * Initialize session from URL query parameters
   */
  async function initSession() {
    const params = new URLSearchParams(window.location.search);
    sessionId = params.get('session');

    if (!sessionId) {
      // Allow standalone usage without prior element selection
      applySessionData({
        sourceTabTitle: 'Screen / Tab / Window',
        selection: {
          elementTag: 'Custom Crop',
          rect: { x: 100, y: 100, width: 960, height: 540 },
          viewport: { width: window.screen.width || 1920, height: window.screen.height || 1080 }
        }
      });
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'GET_SESSION',
        sessionId
      });

      if (response && response.session) {
        sessionData = response.session;
        applySessionData(sessionData);
      } else {
        statusMsg.textContent = 'Session data not found or expired. Please re-select the region.';
      }
    } catch (err) {
      console.warn('[Viewer] Could not retrieve session data:', err);
      statusMsg.textContent = 'Unable to connect to extension background service.';
    }
  }

  /**
   * Populate UI with session selection metadata
   */
  function applySessionData(data) {
    if (data.sourceTabTitle) {
      tabTitleEl.textContent = data.sourceTabTitle;
      promptTabHintEl.textContent = `"${data.sourceTabTitle}"`;
    }

    if (data.selection) {
      const { rect, viewport, elementTag } = data.selection;
      if (rect) {
        currentRect = { ...rect };
        targetDimsEl.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)} px`;
        hudDims.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
      }
      if (viewport) {
        currentViewport = { ...viewport };
      }
      if (elementTag) {
        targetTagEl.textContent = elementTag;
      }
    }
  }

  /**
   * Listen for real-time bounding rect updates from source tab content script
   */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'VIEWER_RECT_UPDATE') {
      if (sessionData && msg.tabId && msg.tabId !== sessionData.sourceTabId) {
        return; // Message from a different tab
      }

      if (msg.rect) {
        currentRect = msg.rect;
        hudDims.textContent = `${Math.round(currentRect.width)} × ${Math.round(currentRect.height)}`;
      }
      if (msg.viewport) {
        currentViewport = msg.viewport;
      }
    }
  });

  /**
   * Starts screen capture and triggers cropped canvas render loop
   */
  async function startCapture() {
    statusMsg.textContent = '';
    startBtn.disabled = true;

    try {
      // Trigger browser screen/tab capture dialog
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          frameRate: { ideal: 60, max: 60 },
          width: { ideal: 3840 },
          height: { ideal: 2160 }
        },
        audio: false,
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude'
      });

      const videoTrack = mediaStream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('No video track received from capture.');
      }

      // Handle stream end when user clicks Chrome's native "Stop sharing" bar
      videoTrack.onended = () => {
        stopCapture('Source capture ended in browser.');
      };

      sourceVideo.srcObject = mediaStream;
      await sourceVideo.play();

      isStreaming = true;

      // Reveal live canvas & HUD, hide setup UI
      setupCard.classList.add('hidden');
      cropCanvas.classList.remove('hidden');
      streamHud.classList.remove('hidden');

      resetHudTimer();

      // Launch real-time frame cropping loop
      startCropperLoop();

    } catch (err) {
      console.warn('[Viewer] Capture failed or was cancelled:', err);
      if (err.name === 'NotAllowedError') {
        statusMsg.textContent = 'Capture was cancelled. Please click above and select the source tab.';
      } else {
        statusMsg.textContent = `Capture error: ${err.message || err}`;
      }
    } finally {
      startBtn.disabled = false;
    }
  }

  /**
   * High-DPI real-time cropping render loop
   */
  function startCropperLoop() {
    function renderFrame() {
      if (!isStreaming || !sourceVideo || sourceVideo.paused || sourceVideo.ended) {
        return;
      }

      const videoW = sourceVideo.videoWidth;
      const videoH = sourceVideo.videoHeight;

      if (videoW > 0 && videoH > 0 && currentViewport.width > 0 && currentViewport.height > 0) {
        // Compute coordinate scaling factor between video stream and browser viewport
        const scaleX = videoW / currentViewport.width;
        const scaleY = videoH / currentViewport.height;

        // Source crop rectangle coordinates in stream pixel space
        const sx = Math.max(0, Math.min(videoW - 1, currentRect.x * scaleX));
        const sy = Math.max(0, Math.min(videoH - 1, currentRect.y * scaleY));
        const sw = Math.max(1, Math.min(videoW - sx, currentRect.width * scaleX));
        const sh = Math.max(1, Math.min(videoH - sy, currentRect.height * scaleY));

        const targetBufferW = Math.round(sw);
        const targetBufferH = Math.round(sh);

        // Adjust canvas resolution dynamically to match source crop resolution 1:1
        if (cropCanvas.width !== targetBufferW || cropCanvas.height !== targetBufferH) {
          cropCanvas.width = targetBufferW;
          cropCanvas.height = targetBufferH;
          // Crisp high quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
        }

        // Draw cropped section directly onto high-DPI canvas
        ctx.drawImage(
          sourceVideo,
          sx, sy, sw, sh,
          0, 0, targetBufferW, targetBufferH
        );

        // FPS calculation
        frameCount++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
          const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
          hudFps.textContent = `${fps} fps`;
          frameCount = 0;
          lastFpsTime = now;
        }
      }

      // Schedule next frame with requestVideoFrameCallback or fallback to rAF
      if ('requestVideoFrameCallback' in sourceVideo) {
        sourceVideo.requestVideoFrameCallback(renderFrame);
      } else {
        requestAnimationFrame(renderFrame);
      }
    }

    if ('requestVideoFrameCallback' in sourceVideo) {
      sourceVideo.requestVideoFrameCallback(renderFrame);
    } else {
      requestAnimationFrame(renderFrame);
    }
  }

  /**
   * Stops streaming and restores the initial setup view
   */
  function stopCapture(notice) {
    isStreaming = false;

    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }

    if (sourceVideo) {
      sourceVideo.srcObject = null;
    }

    // Reset canvas and clear
    if (cropCanvas) {
      ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
      cropCanvas.classList.add('hidden');
    }

    streamHud.classList.add('hidden');
    setupCard.classList.remove('hidden');

    if (notice) {
      statusMsg.textContent = notice;
    }
  }

  /**
   * Auto-hide floating HUD after inactivity so the viewer is 100% clean for screen sharing
   */
  function resetHudTimer() {
    streamHud.classList.remove('fade-out');
    if (hudHideTimeout) {
      clearTimeout(hudHideTimeout);
    }
    hudHideTimeout = setTimeout(() => {
      if (isStreaming) {
        streamHud.classList.add('fade-out');
      }
    }, 2500);
  }

  // Event Listeners
  startBtn.addEventListener('click', startCapture);
  stopBtn.addEventListener('click', () => stopCapture('Stream stopped by user.'));

  fitToggleBtn.addEventListener('click', () => {
    const isFill = cropCanvas.classList.toggle('fill-mode');
    fitToggleBtn.querySelector('span').textContent = isFill ? 'Fill' : 'Fit';
  });

  window.addEventListener('mousemove', () => {
    if (isStreaming) {
      resetHudTimer();
    }
  });

  // Keyboard shortcut Esc inside viewer to stop
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isStreaming) {
      stopCapture('Stream stopped via Escape key.');
    }
  });

  // Initialize
  initSession();
})();
