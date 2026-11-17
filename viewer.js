/**
 * Region Share - Cropped Stream Viewer
 * Captures the selected browser tab and renders a crisp, high-DPI
 * real-time cropped canvas of the targeted element or custom region.
 * Compensates for Chrome compositor letterboxing/pillarboxing and provides
 * an interactive live crop adjuster.
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
  const adjustCropBtn = document.getElementById('adjust-crop-btn');
  const fitToggleBtn = document.getElementById('fit-toggle-btn');
  const stopBtn = document.getElementById('stop-btn');

  // Interactive Live Crop Adjuster elements
  const cropAdjuster = document.getElementById('crop-adjuster');
  const adjusterVideo = document.getElementById('adjuster-video');
  const adjusterContainer = document.getElementById('adjuster-container');
  const adjBox = document.getElementById('adj-box');
  const adjLabel = document.getElementById('adj-label');
  const adjFullBtn = document.getElementById('adj-full-btn');
  const adjResetBtn = document.getElementById('adj-reset-btn');
  const adjDoneBtn = document.getElementById('adj-done-btn');

  // Session & Tracking State
  let sessionId = null;
  let sessionData = null;
  let currentRect = { x: 0, y: 0, width: 800, height: 600 };
  let initialRect = null;
  let currentViewport = { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: 1 };
  let manualVideoCrop = null; // Fine-tuned video-pixel crop from the adjuster
  let isStreaming = false;
  let mediaStream = null;
  let hudHideTimeout = null;

  // Scale mode: 'fit' (default), 'fill', 'native' (1:1)
  let scaleMode = 'fit';

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

    const streamId = params.get('streamId');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'GET_SESSION',
        sessionId
      });

      if (response && response.session) {
        sessionData = response.session;
        applySessionData(sessionData);

        // Auto-stream the cropped tab directly if streamId is available (zero prompt!)
        const activeStreamId = streamId || sessionData.streamId;
        if (activeStreamId) {
          startTabCaptureDirect(activeStreamId);
        }
      } else {
        statusMsg.textContent = 'Session data not found or expired. Please re-select the region.';
      }
    } catch (err) {
      statusMsg.textContent = 'Unable to connect to extension background service.';
    }
  }

  /**
   * Directly captures the source tab using streamId without showing any browser picker
   */
  async function startTabCaptureDirect(streamId) {
    statusMsg.textContent = '';
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        }
      });

      const videoTrack = mediaStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error('No video track from tab capture.');

      videoTrack.onended = () => stopCapture('Source tab capture ended.');

      document.title = 'Region Share - Cropped Stream (Share this window in Meet)';

      sourceVideo.srcObject = mediaStream;
      await sourceVideo.play();

      isStreaming = true;

      setupCard.classList.add('hidden');
      cropCanvas.classList.remove('hidden');
      streamHud.classList.remove('hidden');

      resetHudTimer();
      startCropperLoop();
    } catch (err) {
      // Direct tab capture fallback to manual picker
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
        if (!initialRect) initialRect = { ...rect };
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
        return;
      }

      if (msg.rect) {
        currentRect = msg.rect;
        if (!manualVideoCrop) {
          hudDims.textContent = `${Math.round(currentRect.width)} × ${Math.round(currentRect.height)}`;
        }
      }
      if (msg.viewport) {
        currentViewport = msg.viewport;
      }
    }
  });

  /**
   * Starts screen capture with fallback browser picker
   */
  async function startCapture() {
    statusMsg.textContent = '';
    startBtn.disabled = true;

    try {
      try {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'browser',
            frameRate: { ideal: 60, max: 60 }
          },
          audio: false
        });
      } catch (optErr) {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        });
      }

      document.title = 'Region Share - Cropped Stream (Share this window in Meet)';

      const videoTrack = mediaStream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('No video track received from capture.');
      }

      videoTrack.onended = () => {
        stopCapture('Source capture ended in browser.');
      };

      sourceVideo.srcObject = mediaStream;
      await sourceVideo.play();

      isStreaming = true;

      setupCard.classList.add('hidden');
      cropCanvas.classList.remove('hidden');
      streamHud.classList.remove('hidden');

      resetHudTimer();
      startCropperLoop();

    } catch (err) {
      if (err && err.name === 'NotAllowedError') {
        statusMsg.textContent = 'Capture was cancelled. Please click above and select the source tab.';
      } else {
        statusMsg.textContent = 'Capture was cancelled or unavailable.';
      }
    } finally {
      startBtn.disabled = false;
    }
  }

  /**
   * Calculates the exact video stream bounding coordinates for the crop area,
   * accurately compensating for letterbox/pillarbox offsets added by Chrome's compositor.
   */
  function calculateVideoCropCoords(videoW, videoH) {
    if (manualVideoCrop) {
      return {
        sx: Math.max(0, Math.min(videoW - 1, manualVideoCrop.sx)),
        sy: Math.max(0, Math.min(videoH - 1, manualVideoCrop.sy)),
        sw: Math.max(1, Math.min(videoW - manualVideoCrop.sx, manualVideoCrop.sw)),
        sh: Math.max(1, Math.min(videoH - manualVideoCrop.sy, manualVideoCrop.sh)),
        contentW: videoW,
        contentH: videoH,
        offsetX: 0,
        offsetY: 0
      };
    }

    const vpW = currentViewport.width || 1920;
    const vpH = currentViewport.height || 1080;

    const videoAspect = videoW / videoH;
    const viewportAspect = vpW / vpH;

    let contentW = videoW;
    let contentH = videoH;
    let offsetX = 0;
    let offsetY = 0;

    // Detect if Chrome letterboxed (horizontal bars) or pillarboxed (vertical bars)
    if (viewportAspect > videoAspect + 0.001) {
      contentW = videoW;
      contentH = videoW / viewportAspect;
      offsetY = (videoH - contentH) / 2;
    } else if (viewportAspect < videoAspect - 0.001) {
      contentH = videoH;
      contentW = videoH * viewportAspect;
      offsetX = (videoW - contentW) / 2;
    }

    const scaleX = contentW / vpW;
    const scaleY = contentH / vpH;

    const sx = Math.max(0, Math.min(videoW - 1, offsetX + (currentRect.x * scaleX)));
    const sy = Math.max(0, Math.min(videoH - 1, offsetY + (currentRect.y * scaleY)));
    const sw = Math.max(1, Math.min(videoW - sx, currentRect.width * scaleX));
    const sh = Math.max(1, Math.min(videoH - sy, currentRect.height * scaleY));

    return { sx, sy, sw, sh, contentW, contentH, offsetX, offsetY };
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

      if (videoW > 0 && videoH > 0) {
        const crop = calculateVideoCropCoords(videoW, videoH);

        const targetBufferW = Math.round(crop.sw);
        const targetBufferH = Math.round(crop.sh);

        if (cropCanvas.width !== targetBufferW || cropCanvas.height !== targetBufferH) {
          cropCanvas.width = targetBufferW;
          cropCanvas.height = targetBufferH;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
        }

        ctx.drawImage(
          sourceVideo,
          crop.sx, crop.sy, crop.sw, crop.sh,
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

    if (cropAdjuster && !cropAdjuster.classList.contains('hidden')) {
      closeAdjuster();
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }

    if (sourceVideo) {
      sourceVideo.srcObject = null;
    }

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
      if (isStreaming && cropAdjuster.classList.contains('hidden')) {
        streamHud.classList.add('fade-out');
      }
    }, 2500);
  }

  /**
   * Cycle display modes: Fit (contain) -> Fill (cover) -> 1:1 Native
   */
  function cycleScaleMode() {
    if (scaleMode === 'fit') {
      scaleMode = 'fill';
      cropCanvas.className = 'fill-mode';
      fitToggleBtn.querySelector('span').textContent = 'Fill';
    } else if (scaleMode === 'fill') {
      scaleMode = 'native';
      cropCanvas.className = 'native-mode';
      fitToggleBtn.querySelector('span').textContent = '1:1';
    } else {
      scaleMode = 'fit';
      cropCanvas.className = '';
      fitToggleBtn.querySelector('span').textContent = 'Fit';
    }
  }

  // ==========================================
  // Interactive Live Crop Adjuster
  // ==========================================
  let adjBoxLeft = 0;
  let adjBoxTop = 0;
  let adjBoxWidth = 100;
  let adjBoxHeight = 100;
  let adjRatioX = 1;
  let adjRatioY = 1;
  let adjDragAction = null;
  let adjDragStartX = 0;
  let adjDragStartY = 0;
  let adjStartBox = null;

  async function openAdjuster() {
    if (!isStreaming || !mediaStream) return;

    adjusterVideo.srcObject = mediaStream;
    await adjusterVideo.play();
    cropAdjuster.classList.remove('hidden');

    // Wait for adjuster video layout
    requestAnimationFrame(() => {
      syncAdjusterBoxFromCurrent();
    });
  }

  function closeAdjuster() {
    cropAdjuster.classList.add('hidden');
    adjusterVideo.pause();
    adjusterVideo.srcObject = null;
    adjDragAction = null;
  }

  function syncAdjusterBoxFromCurrent() {
    const videoW = adjusterVideo.videoWidth || sourceVideo.videoWidth || 1920;
    const videoH = adjusterVideo.videoHeight || sourceVideo.videoHeight || 1080;
    const vRect = adjusterVideo.getBoundingClientRect();

    adjRatioX = vRect.width / videoW;
    adjRatioY = vRect.height / videoH;

    const crop = calculateVideoCropCoords(videoW, videoH);

    adjBoxLeft = crop.sx * adjRatioX;
    adjBoxTop = crop.sy * adjRatioY;
    adjBoxWidth = crop.sw * adjRatioX;
    adjBoxHeight = crop.sh * adjRatioY;

    updateAdjBoxDisplay();
  }

  function updateAdjBoxDisplay() {
    const vRect = adjusterVideo.getBoundingClientRect();
    const maxW = vRect.width || 1;
    const maxH = vRect.height || 1;

    // Clamp inside video rect
    adjBoxWidth = Math.max(24, Math.min(maxW, adjBoxWidth));
    adjBoxHeight = Math.max(24, Math.min(maxH, adjBoxHeight));
    adjBoxLeft = Math.max(0, Math.min(maxW - adjBoxWidth, adjBoxLeft));
    adjBoxTop = Math.max(0, Math.min(maxH - adjBoxHeight, adjBoxTop));

    adjBox.style.left = `${Math.round(adjBoxLeft)}px`;
    adjBox.style.top = `${Math.round(adjBoxTop)}px`;
    adjBox.style.width = `${Math.round(adjBoxWidth)}px`;
    adjBox.style.height = `${Math.round(adjBoxHeight)}px`;

    const cropW = Math.round(adjBoxWidth / (adjRatioX || 1));
    const cropH = Math.round(adjBoxHeight / (adjRatioY || 1));
    adjLabel.textContent = `${cropW} × ${cropH} px`;
  }

  // Adjuster Pointer Interactions (Move & Resize)
  adjBox.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const handle = e.target.closest('.adj-h');
    adjDragAction = handle ? handle.dataset.dir : 'move';
    adjDragStartX = e.clientX;
    adjDragStartY = e.clientY;
    adjStartBox = {
      left: adjBoxLeft,
      top: adjBoxTop,
      width: adjBoxWidth,
      height: adjBoxHeight
    };

    window.addEventListener('pointermove', onAdjusterPointerMove);
    window.addEventListener('pointerup', onAdjusterPointerUp);
  });

  function onAdjusterPointerMove(e) {
    if (!adjDragAction || !adjStartBox) return;

    const dx = e.clientX - adjDragStartX;
    const dy = e.clientY - adjDragStartY;

    if (adjDragAction === 'move') {
      adjBoxLeft = adjStartBox.left + dx;
      adjBoxTop = adjStartBox.top + dy;
    } else {
      // Resize handle directions
      if (adjDragAction.includes('e')) {
        adjBoxWidth = Math.max(24, adjStartBox.width + dx);
      }
      if (adjDragAction.includes('s')) {
        adjBoxHeight = Math.max(24, adjStartBox.height + dy);
      }
      if (adjDragAction.includes('w')) {
        const newW = Math.max(24, adjStartBox.width - dx);
        adjBoxLeft = adjStartBox.left + (adjStartBox.width - newW);
        adjBoxWidth = newW;
      }
      if (adjDragAction.includes('n')) {
        const newH = Math.max(24, adjStartBox.height - dy);
        adjBoxTop = adjStartBox.top + (adjStartBox.height - newH);
        adjBoxHeight = newH;
      }
    }

    updateAdjBoxDisplay();
  }

  function onAdjusterPointerUp() {
    adjDragAction = null;
    adjStartBox = null;
    window.removeEventListener('pointermove', onAdjusterPointerMove);
    window.removeEventListener('pointerup', onAdjusterPointerUp);
  }

  // Adjuster action buttons
  adjDoneBtn.addEventListener('click', () => {
    const rx = adjRatioX || 1;
    const ry = adjRatioY || 1;

    manualVideoCrop = {
      sx: Math.round(adjBoxLeft / rx),
      sy: Math.round(adjBoxTop / ry),
      sw: Math.round(adjBoxWidth / rx),
      sh: Math.round(adjBoxHeight / ry)
    };

    hudDims.textContent = `${Math.round(manualVideoCrop.sw)} × ${Math.round(manualVideoCrop.sh)}`;
    closeAdjuster();
  });

  adjFullBtn.addEventListener('click', () => {
    const videoW = adjusterVideo.videoWidth || sourceVideo.videoWidth || 1920;
    const videoH = adjusterVideo.videoHeight || sourceVideo.videoHeight || 1080;
    const crop = calculateVideoCropCoords(videoW, videoH);

    adjBoxLeft = crop.offsetX * adjRatioX;
    adjBoxTop = crop.offsetY * adjRatioY;
    adjBoxWidth = crop.contentW * adjRatioX;
    adjBoxHeight = crop.contentH * adjRatioY;

    updateAdjBoxDisplay();
  });

  adjResetBtn.addEventListener('click', () => {
    manualVideoCrop = null;
    if (initialRect) {
      currentRect = { ...initialRect };
    }
    syncAdjusterBoxFromCurrent();
  });

  // Base Event Listeners
  startBtn.addEventListener('click', startCapture);
  stopBtn.addEventListener('click', () => stopCapture('Stream stopped by user.'));
  adjustCropBtn.addEventListener('click', openAdjuster);
  fitToggleBtn.addEventListener('click', cycleScaleMode);

  window.addEventListener('mousemove', () => {
    if (isStreaming) {
      resetHudTimer();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (cropAdjuster && !cropAdjuster.classList.contains('hidden')) {
        closeAdjuster();
      } else if (isStreaming) {
        stopCapture('Stream stopped via Escape key.');
      }
    }
  });

  // Initialize
  initSession();
})();
