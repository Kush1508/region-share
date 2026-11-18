# Region Share — Screen & Tab Element Cropper for Google Meet

A Manifest V3 Google Chrome extension that lets you select any DOM element or drag a custom region on any webpage (e.g. Semrush dashboards, charts, terminal logs) and stream **strictly** that cropped section into a clean, borderless popup window.

Presenting this popup window in **Google Meet** (or Zoom / Microsoft Teams) ensures your meeting participants see **only** the intended content—completely hiding your URL bar, browser tabs, bookmarks, taskbar, and the rest of the webpage.

---

## ✨ Features

- 🎯 **Zero-Prompt Direct Tab Capture:** No hunting through Chrome's "Choose what to share" picker—captures the tab automatically upon selection.
- 📐 **Interactive Live Crop Adjuster:** Move your mouse over the popup HUD and click **"Adjust Crop"** to live-drag and resize the 8-handle crop box directly over the stream.
- 🚀 **Hardware-Accelerated 60 FPS Compositing:** Real-time canvas cropping compensating for Chrome compositor letterboxing/pillarboxing without zoom drift.
- 🖥️ **Display Modes (Fit / Fill / 1:1):** Switch between Fit (scales to window), Fill (edge-to-edge), or 1:1 (native pixel resolution).
- 📱 **Samsung DeX & Mobile Chrome Edition:** Includes a zero-install **Focus Crop Bookmarklet** and a **Web Cropper Studio** with Picture-in-Picture for Samsung Galaxy Fold 3 / Samsung DeX.
- 🔒 **Privacy Focused:** 100% client-side, zero analytics, zero external network requests.

---

## 🛠️ Quick Installation (Chrome / Brave / Edge)

1. Clone or download this repository.
2. Open Google Chrome and go to `chrome://extensions`.
3. In the top-right corner, toggle on **Developer mode**.
4. Click **Load unpacked** and select this project folder.
5. Pin **Region Share** to your extensions toolbar for 1-click access!

---

## 💡 How to Use with Google Meet

1. **Crop your Dashboard/Section:** Click the **Region Share** icon on any tab. Click any element or drag across any area.
2. **Stream Opens Automatically:** A clean, borderless popup window opens and immediately streams the cropped region.
3. **Present in Google Meet:** In your meeting, click **Present now &rarr; Window &rarr; Region Share**. That's it!

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
