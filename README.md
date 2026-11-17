# Region Share — Screen & Element Cropper for Google Meet

A Manifest V3 Google Chrome extension that lets you select any DOM element or drag a custom rectangular region on any webpage and stream **only** that cropped section into a clean, borderless popup window.

Presenting this popup window in Google Meet (or Zoom / Microsoft Teams) ensures your meeting participants see **only** the intended content—completely hiding your URL bar, browser tabs, bookmarks, taskbar, and the rest of the webpage.

---

## Features

- **DOM Element Inspection:** Click the toolbar icon to enter selection mode. Hovering over elements highlights their bounding box with a crisp border, displaying element tags and exact dimensions in pixels.
- **Custom Rectangular Cropping (Shift + Drag):** Hold <kbd>Shift</kbd> and drag anywhere on the page to crop an arbitrary region, even across complex layouts that do not map to a single HTML container.
- **Dynamic Element Tracking:** If the selected element resizes, mutates, or moves due to page scrolling, the cropped feed dynamically follows and re-centers the element in real time.
- **Borderless Popup Window:** Opens a standalone Chrome popup (`type: "popup"`) with zero address bar or extraneous browser chrome, sized proportionally to your crop.
- **High-DPI Canvas Cropping:** Uses `requestVideoFrameCallback` to crop video frames directly at source pixel fidelity without blur or downsampling.
- **Auto-Hiding HUD:** An unobtrusive live status HUD pill displays resolution and 60 FPS performance, automatically fading out so Google Meet captures 100% pure video content.
- **Graceful Lifecycle:** Cleanly cancels on <kbd>Esc</kbd> and resets smoothly when screen capture is stopped in Chrome.

---

## Installation (Load Unpacked)

No build tools, bundlers, or npm dependencies are required.

1. Open Google Chrome.
2. Navigate to `chrome://extensions` in the address bar.
3. In the top-right corner, toggle on **Developer mode**.
4. Click the **Load unpacked** button in the top-left corner.
5. In the file picker dialog, select this folder:
   ```
   c:\Users\KIIT\Desktop\chrome_Extensions\google_meet_cropped_screen
   ```
6. The extension **"Region Share - Screen & Element Cropper"** is now loaded and ready!
7. *(Recommended)* Click the puzzle piece icon (Extensions) in your Chrome toolbar and pin **Region Share** for one-click access.

---

## How to Use with Google Meet

### Step 1: Select the Target Element or Region
1. Navigate to any webpage you want to present (e.g. dashboards, charts, terminal logs, code snippets).
2. Click the **Region Share** icon in your Chrome toolbar.
3. **To select an HTML element:** Move your cursor over the element (a cyan highlight box and dimension tooltip appear) and **click**.
4. **To select a custom rectangular area:** Hold <kbd>Shift</kbd>, click and drag a box across the screen, then release.
   *(Press <kbd>Esc</kbd> anytime to cancel selection mode).*

### Step 2: Start the Cropped Stream
1. A borderless popup window titled **"Region Share - Cropped Stream"** will open automatically, sized to match your crop.
2. Click the blue **Start Cropped Share** button.
3. In Chrome's "Choose what to share" modal:
   - Select the **Chrome Tab** tab.
   - Click on your source tab (the extension displays the source tab name in the popup as a guide).
   - Click **Share**.
4. The setup button disappears and the window immediately renders the live, high-DPI cropped feed.

### Step 3: Present in Google Meet
1. In your Google Meet meeting, click **Present now** (the screen share icon).
2. Select **Window**.
3. Choose the **Region Share - Cropped Stream** window.
4. Your meeting audience will now see only your cropped element or custom box—no tabs, no URL bar, and no OS taskbar!

---

## File Structure

```
google_meet_cropped_screen/
├── manifest.json         # Manifest V3 extension configuration
├── background.js        # Service worker managing popup windows and messaging
├── content.js           # Injected inspector, Shift+drag box, and dynamic tracking
├── content.css          # Reset styles for overlay container
├── viewer.html          # Borderless stream viewer popup
├── viewer.js            # Real-time high-DPI canvas cropping engine
├── viewer.css           # Minimalist dark theme and auto-hiding controls
├── icons/               # Extension icons (16px, 48px, 128px)
├── scripts/             # Icon generator utilities
└── README.md            # Documentation and instructions
```

---

## Supported Environments & Compatibility
- **Google Chrome:** Version 94+ (Manifest V3 support, `requestVideoFrameCallback`, `getDisplayMedia`).
- **Protocols:** Works across both `https://` and `http://localhost` development environments.
