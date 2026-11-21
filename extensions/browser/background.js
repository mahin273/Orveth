// Orveth WebExtension Background Worker

const DEFAULT_PORT = 41527;

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      {
        port: DEFAULT_PORT,
        token: "",
        intercept: false,
      },
      resolve
    );
  });
}

// Register Context Menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "orveth-download-link",
    title: "Download with Orveth",
    contexts: ["link", "image", "video", "audio"],
  });

  chrome.contextMenus.create({
    id: "orveth-download-page",
    title: "Download Page with Orveth",
    contexts: ["page"],
  });
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const targetUrl = info.linkUrl || info.srcUrl || info.pageUrl;
  if (!targetUrl) return;

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
        url: targetUrl,
        referrer: tab?.url || undefined,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Orveth Download Queued",
        message: data.filename ? `Queued: ${data.filename}` : "Download queued successfully",
      });
    } else {
      const errData = await res.json().catch(() => ({}));
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Orveth Download Failed",
        message: errData.error || `HTTP ${res.status}: Failed to queue download`,
      });
    }
  } catch (err) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Orveth Not Reachable",
      message: `Could not connect to Orveth bridge on port ${config.port}. Is Orveth running?`,
    });
  }
});
