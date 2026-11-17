/**
 * Region Share - Background Service Worker (Manifest V3)
 * Orchestrates content script injection, popup window creation,
 * and state synchronization between the source tab and cropped viewer.
 */

const activeSessions = new Map();

// Listen for clicks on the extension action icon
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  // If the user is on the demo.html page, toggle selection directly on it
  if (tab.url && tab.url.includes('demo.html')) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_SELECTION' });
    } catch (e) {}
    return;
  }

  // If the user clicks on an internal browser page (e.g. chrome://extensions or new tab),
  // open the interactive Demo/Test page so they immediately have a real webpage to crop!
  if (
    !tab.url ||
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('chrome-extension://') ||
    tab.url.startsWith('edge://') ||
    tab.url.startsWith('view-source:') ||
    tab.url.startsWith('about:')
  ) {
    try {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('demo.html')
      });
    } catch (e) {
      console.warn('[Region Share] Could not open demo tab:', e);
    }
    return;
  }

  try {
    // Attempt to toggle selection if already injected
    await chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_SELECTION' });
  } catch (err) {
    // Content script not yet active in this tab (e.g. tab opened before extension loaded), inject CSS and JS
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });

      // Now start selection
      await chrome.tabs.sendMessage(tab.id, { action: 'START_SELECTION' });
    } catch (injectErr) {
      console.warn('[Region Share] Injection info:', injectErr);
    }
  }
});

// Handle incoming messages from content scripts and viewer popups
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'OPEN_VIEWER') {
    handleOpenViewer(msg.selection, sender.tab).then(sendResponse);
    return true; // Keep message channel open for async response
  }

  if (msg.action === 'GET_SESSION') {
    const session = activeSessions.get(msg.sessionId);
    sendResponse({ session });
    return false;
  }

  if (msg.action === 'RECT_UPDATE') {
    // Broadcast rect updates to any open viewer popups
    chrome.runtime.sendMessage({
      action: 'VIEWER_RECT_UPDATE',
      tabId: sender.tab ? sender.tab.id : null,
      rect: msg.rect,
      viewport: msg.viewport
    }).catch(() => {
      // Ignored if no viewer is currently listening
    });
    return false;
  }
});

/**
 * Creates a clean, borderless popup window sized proportionally to the cropped area
 */
async function handleOpenViewer(selection, sourceTab) {
  const sessionId = 'rs_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

  const sessionData = {
    sessionId,
    sourceTabId: sourceTab ? sourceTab.id : null,
    sourceTabTitle: sourceTab ? sourceTab.title : 'Selected Tab',
    sourceTabUrl: sourceTab ? sourceTab.url : '',
    selection,
    createdAt: Date.now()
  };

  activeSessions.set(sessionId, sessionData);

  // Calculate clean popup dimensions matching crop aspect ratio
  const rect = selection.rect;
  const aspect = (rect.width > 0 && rect.height > 0) ? (rect.width / rect.height) : (16 / 9);

  let targetWidth = Math.round(rect.width);
  // Clamp width to reasonable desktop bounds
  targetWidth = Math.max(560, Math.min(1280, targetWidth));
  let targetHeight = Math.round(targetWidth / aspect);

  // Clamp height
  if (targetHeight < 400) {
    targetHeight = 400;
  } else if (targetHeight > 840) {
    targetHeight = 840;
    targetWidth = Math.round(targetHeight * aspect);
  }

  // Account for minimal popup window frame chrome on OS
  const windowWidth = targetWidth + 16;
  const windowHeight = targetHeight + 36;

  try {
    const popupUrl = chrome.runtime.getURL(`viewer.html?session=${encodeURIComponent(sessionId)}`);
    const win = await chrome.windows.create({
      url: popupUrl,
      type: 'popup',
      width: windowWidth,
      height: windowHeight,
      focused: true
    });

    sessionData.windowId = win.id;
    return { success: true, sessionId, windowId: win.id };
  } catch (err) {
    console.warn('[Region Share] Popup info:', err);
    return { success: false, error: err.message };
  }
}

// Clean up cached sessions when popup windows are closed
chrome.windows.onRemoved.addListener((windowId) => {
  for (const [sessionId, data] of activeSessions.entries()) {
    if (data.windowId === windowId) {
      activeSessions.delete(sessionId);
      break;
    }
  }
});
