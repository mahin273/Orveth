# Privacy Policy for Orveth Browser Integration

**Effective Date:** November 21, 2026  
**Extension Name:** Orveth Download Integration  
**Application:** Orveth Download Manager (Local Desktop Application)

---

## 1. Overview
Orveth Download Integration is an open-source companion extension designed solely to interface with your locally running Orveth desktop application. 

**We believe in absolute user privacy. We do not collect, transmit, store, sell, or monetize any of your personal data, browsing history, or download activity.**

---

## 2. Information Handled by the Extension

### A. Local Communication
- When you click "Download with Orveth" or when a download is automatically intercepted, the file URL, referer header, and cookies (if necessary for authenticated downloads) are dispatched **strictly to your local loopback address (`http://127.0.0.1:41527`)** where your local Orveth application listens.
- **Zero remote telemetry**: No network requests are made to any remote server, tracking service, or third-party analytics provider.

### B. Local Settings & Storage
- We use the `chrome.storage.local` API to store user preferences on your machine (e.g., whether automatic download interception is enabled, UI floating bar visibility, loopback port, and authorization token).
- These settings remain entirely on your local device.

---

## 3. Permissions Used and Justifications

| Permission | Purpose & Justification |
| :--- | :--- |
| `downloads` | Intercepts native browser file downloads so they can be accelerated by Orveth's multi-segment engine. |
| `storage` | Stores your local extension preferences (port, auto-intercept toggle, floating bar toggle). |
| `notifications` | Displays desktop notifications when downloads are intercepted or queued into Orveth. |
| `contextMenus` | Adds a right-click "Download with Orveth" option on links, images, and audio/video elements. |
| `<all_urls>` / Host Permissions | Enables the floating video detection bar (`Download Video with Orveth`) to identify HTML5 `<video>` elements and streams on media pages, and allows communicating with `http://127.0.0.1:41527`. |

---

## 4. Third-Party Sharing
We do not sell, rent, trade, or share any user data with any third party. All data stays within your local computer.

---

## 5. Open Source Transparency
The complete source code of Orveth and its companion browser extension is open source and auditable on GitHub:  
[https://github.com/orveth/orveth](https://github.com/orveth/orveth)

---

## 6. Contact
For any questions regarding this privacy policy or security matters, open an issue on our GitHub repository.
