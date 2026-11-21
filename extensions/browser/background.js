// Orveth WebExtension Background Service Worker (IDM-Grade Interception Engine)

const DEFAULT_PORT = 41527;

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      {
        port: DEFAULT_PORT,
        token: "",
        interceptDownloads: true,
        showVideoBar: true,
      },
      resolve
    );
  });
}

// Send download job to Orveth loopback API
async function sendToOrveth(url, customFileName, referrer) {
  const config = await getConfig();
  const endpoint = `http://127.0.0.1:${config.port}/api/v1/download`;

  const headers = {
    "Content-Type": "application/json",
  };
  if (config.token && config.token.trim()) {
    headers["X-Orveth-Token"] = config.token.trim();
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        url,
        custom_file_name: customFileName || undefined,
        referrer: referrer || undefined,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Orveth Download Queued",
        message: data.filename
          ? `Queued: ${data.filename}`
          : "Download queued in Orveth",
      });
      return { success: true, data };
    } else {
      const errData = await res.json().catch(() => ({}));
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Orveth Download Failed",
        message: errData.error || `HTTP ${res.status}: Failed to queue download`,
      });
      return { success: false, error: errData.error };
    }
  } catch (err) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Orveth Not Reachable",
      message: `Could not connect to Orveth bridge on port ${config.port}. Is Orveth running?`,
    });
    return { success: false, error: err.toString() };
  }
}

// 1. IDM-Style Automatic Browser Download Interception
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  const config = await getConfig();
  if (!config.interceptDownloads) return;

  const url = downloadItem.finalUrl || downloadItem.url;
  if (!url) return;

  // Skip browser internal and data URLs
  if (
    url.startsWith("blob:") ||
    url.startsWith("data:") ||
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:")
  ) {
    return;
  }

  // Cancel and clean browser download entry
  try {
    await chrome.downloads.cancel(downloadItem.id);
    await chrome.downloads.erase({ id: downloadItem.id });
  } catch (_) {
    // Already finished or cancelled
  }

  const filename = downloadItem.filename ? downloadItem.filename.split(/[\/\\]/).pop() : undefined;
  await sendToOrveth(url, filename, downloadItem.referrer);
});

// 2. Register Context Menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "orveth-download-link",
    title: "Download with Orveth",
    contexts: ["link", "image", "video", "audio"],
  });

  chrome.contextMenus.create({
    id: "orveth-download-selection",
    title: "Download selection with Orveth",
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "orveth-download-all-links",
    title: "Download all links on page with Orveth",
    contexts: ["page"],
  });
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "orveth-download-all-links") {
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { action: "GET_PAGE_LINKS" }, async (response) => {
      if (response && response.links && response.links.length > 0) {
        const config = await getConfig();
        const endpoint = `http://127.0.0.1:${config.port}/api/v1/downloads/batch`;
        const headers = { "Content-Type": "application/json" };
        if (config.token) headers["X-Orveth-Token"] = config.token;

        try {
          await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({ urls: response.links }),
          });
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icon128.png",
            title: "Batch Download Queued",
            message: `Sent ${response.links.length} links to Orveth`,
          });
        } catch (_) {}
      }
    });
    return;
  }

  let targetUrl = info.linkUrl || info.srcUrl || info.selectionText || info.pageUrl;
  if (!targetUrl) return;

  targetUrl = targetUrl.trim();
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://") && !targetUrl.startsWith("magnet:")) {
    if (targetUrl.includes(".")) {
      targetUrl = `https://${targetUrl}`;
    }
  }

  await sendToOrveth(targetUrl, undefined, tab?.url);
});

// 3. Handle messages from Floating Video Badge in content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "DOWNLOAD_MEDIA") {
    sendToOrveth(request.url, undefined, sender?.tab?.url).then((res) => {
      sendResponse(res);
    });
    return true; // Keep message channel open for async response
  }
});
