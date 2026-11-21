# Orveth Browser Extension — Installation & Store Publishing Guide

This guide details both **direct user installation** (without waiting for store reviews) and **publishing to official browser extension stores** (Chrome Web Store, Firefox Add-ons, Edge Add-ons).

---

## 1. Direct User Installation (Instant — No Store Required)

Users can immediately install and use the Orveth extension in any modern browser:

### A. Chrome, Brave, Edge, Vivaldi, Opera (Chromium-based)
1. Open the browser and navigate to `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
2. Toggle on **Developer mode** in the top-right corner.
3. Click **"Load unpacked"**.
4. Select the `extensions/browser/` folder from the repository.
5. The **Orveth Download Integration** extension icon appears in the browser toolbar! Pin it for quick access.

### B. Firefox
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **"Load Temporary Add-on..."**.
3. Select `extensions/browser/manifest.json`.
4. The extension will be active immediately for testing and local use.

---

## 2. Packaging the Extension for Store Upload

Always build a clean ZIP file excluding `.git`, `.DS_Store`, or temporary files:

```bash
cd extensions/browser
zip -r ../orveth-extension-v0.2.4.zip . -x "*.DS_Store" -x "__MACOSX*"
```

The resulting `orveth-extension-v0.2.4.zip` is ready for direct upload to developer consoles.

---

## 3. Chrome Web Store Publishing Guide

### Step 1: Create a Google Developer Account
1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Sign in with your Google account.
3. Pay the **one-time $5 registration fee** (Google requirement for all extension publishers).

### Step 2: Upload Package
1. Click **"New item"**.
2. Drag and drop `orveth-extension-v0.2.4.zip`.

### Step 3: Fill in Store Listing
- **Item Name**: `Orveth Download Integration`
- **Summary**: `High-speed download interception, floating web video capture bar, and integration with Orveth Download Manager.`
- **Description**:
  ```markdown
  The official companion browser extension for Orveth — the accelerated, multi-engine desktop download manager.

  Features:
  - ⚡ Automatic Download Interception: Seamlessly captures browser downloads and dispatches them to Orveth for multi-segment, 16x acceleration.
  - 🎬 Floating Media & Video Bar: Automatically detects HTML5 videos, streams, and media files on web pages with a 1-click download button.
  - 🧲 Context Menu Integration: Right-click any link, image, audio, or video and choose "Download with Orveth".
  - 🔒 Local-First & 100% Private: All communication remains strictly on your computer (127.0.0.1:41527). Zero telemetry, zero external tracking.

  Requirements:
  Requires the free, open-source Orveth desktop application installed and running on your system.
  Source Code & Desktop App: https://github.com/orveth/orveth
  ```
- **Category**: `Productivity` or `Accessibility`.
- **Language**: `English`.
- **Graphic Assets**:
  - Small promo tile: 440 x 280 px
  - Large promo tile: 920 x 680 px (optional)
  - Marquee promo tile: 1400 x 560 px (optional)
  - Screenshots: 1280 x 800 px (at least 1 screenshot showing the popup and video button).

### Step 4: Privacy & Permissions Disclosure (Crucial for Passing Review)
In the **Privacy practices** tab, answer Google's review questions accurately:
1. **Single Purpose**:
   > "Intercepts native browser downloads and identifies web video streams to route them to the local Orveth desktop download acceleration engine."
2. **Permission Justifications**:
   - `downloads`: "Required to detect native browser download creation events and cancel them so they can be dispatched to the local Orveth desktop manager for multi-segment acceleration."
   - `storage`: "Used to store user preferences locally (port number, toggle states for auto-interception and floating download bar)."
   - `contextMenus`: "Adds right-click options for users to dispatch specific links, media, and images directly to Orveth."
   - `notifications`: "Displays local notifications confirming when an intercepted download has been queued in Orveth."
   - `host_permissions` (`<all_urls>`): "Required for content scripts to detect HTML5 video elements across media streaming sites and communicate with the local loopback server at http://127.0.0.1:41527."
3. **Data Usage**:
   - Check: *"Does not collect or use user data"*.
4. **Privacy Policy Link**:
   - Link to `PRIVACY.md` hosted on your GitHub repository:
     `https://github.com/orveth/orveth/blob/main/extensions/PRIVACY.md`

### Step 5: Submit for Review
- Click **"Submit for review"**.
- Google typically completes automated and manual reviews within **24 to 72 hours**. Once approved, it is live on the Chrome Web Store with a public store link.

---

## 4. Mozilla Firefox Add-ons (AMO) Publishing Guide

Firefox does not charge any registration fee.

### Step 1: Create a Firefox Developer Account
1. Visit the [Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/).
2. Log in with your Firefox Account.

### Step 2: Submit Add-on
1. Click **"Submit a New Add-on"**.
2. Select distribution: **"On this site"** (public listing on AMO).
3. Upload `orveth-extension-v0.2.4.zip`.
4. AMO runs automated linter checks immediately.

### Step 3: Source Code & Privacy
- If prompted whether the code is minified/obfuscated, select **"No"** (all Orveth extension code is plain, readable JavaScript).
- Enter the Privacy Policy link (`https://github.com/orveth/orveth/blob/main/extensions/PRIVACY.md`).
- Click **"Submit"**. AMO approval usually takes **12 to 48 hours**.

---

## 5. Microsoft Edge Add-ons Publishing Guide

Edge Add-ons is completely free and features automated import from Chrome:

1. Register at the [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge).
2. In the Edge Developer Dashboard, click **"Create new extension"**.
3. You can either:
   - Upload the same `orveth-extension-v0.2.4.zip`, OR
   - **One-Click Chrome Import**: Provide your approved Chrome Web Store extension URL; Microsoft will import the listing, metadata, and assets automatically!

---

## 6. GitHub Releases Distribution (Direct Download)

In addition to store listings:
1. Attach `orveth-extension-v0.2.4.zip` to your GitHub Releases page alongside `Orveth.AppImage` and `.deb` / `.rpm` installers.
2. In the README, provide direct instructions for users to extract and load via `chrome://extensions` or Firefox.
