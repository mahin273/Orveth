document.addEventListener("DOMContentLoaded", async () => {
  const statusBadge = document.getElementById("statusBadge");
  const downloadForm = document.getElementById("downloadForm");
  const urlInput = document.getElementById("urlInput");
  const portInput = document.getElementById("portInput");
  const tokenInput = document.getElementById("tokenInput");
  const feedback = document.getElementById("feedback");
  const interceptToggle = document.getElementById("interceptToggle");
  const videoBarToggle = document.getElementById("videoBarToggle");
  const configToggle = document.getElementById("configToggle");
  const configBox = document.getElementById("configBox");
  const configArrow = document.getElementById("configArrow");

  const DEFAULT_PORT = 41527;

  // Load configuration from local storage
  const config = await new Promise((res) => {
    chrome.storage.local.get(
      {
        port: DEFAULT_PORT,
        token: "",
        interceptDownloads: true,
        showVideoBar: true,
      },
      res
    );
  });

  portInput.value = config.port || DEFAULT_PORT;
  tokenInput.value = config.token || "";
  interceptToggle.checked = config.interceptDownloads !== false;
  videoBarToggle.checked = config.showVideoBar !== false;

  // Toggle handlers
  interceptToggle.addEventListener("change", () => {
    chrome.storage.local.set({ interceptDownloads: interceptToggle.checked });
  });

  videoBarToggle.addEventListener("change", () => {
    chrome.storage.local.set({ showVideoBar: videoBarToggle.checked });
  });

  portInput.addEventListener("change", () => {
    const port = parseInt(portInput.value, 10) || DEFAULT_PORT;
    chrome.storage.local.set({ port });
    checkHealth();
  });

  tokenInput.addEventListener("change", () => {
    chrome.storage.local.set({ token: tokenInput.value.trim() });
    checkHealth();
  });

  // Collapsible settings toggle
  configToggle.addEventListener("click", () => {
    const isOpen = configBox.classList.toggle("open");
    configArrow.textContent = isOpen ? "▴" : "▾";
  });

  async function checkHealth() {
    const port = parseInt(portInput.value, 10) || DEFAULT_PORT;
    const token = tokenInput.value.trim();

    try {
      const headers = {};
      if (token) {
        headers["X-Orveth-Token"] = token;
      }

      const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`, { headers });
      if (res.ok) {
        const data = await res.json();
        statusBadge.className = "status-badge status-online";
        statusBadge.textContent = `● Connected (${data.version || "v0.2.6"})`;
        return true;
      } else {
        statusBadge.className = "status-badge status-offline";
        statusBadge.textContent = "● Token Mismatch";
        return false;
      }
    } catch {
      statusBadge.className = "status-badge status-offline";
      statusBadge.textContent = "● Orveth Offline";
      return false;
    }
  }

  await checkHealth();

  downloadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    feedback.textContent = "";
    const url = urlInput.value.trim();
    if (!url) return;

    const port = parseInt(portInput.value, 10) || DEFAULT_PORT;
    const token = tokenInput.value.trim();

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) {
        headers["X-Orveth-Token"] = token;
      }

      const res = await fetch(`http://127.0.0.1:${port}/api/v1/download`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url }),
      });

      if (res.ok) {
        const data = await res.json();
        feedback.className = "message success";
        feedback.textContent = `Queued: ${data.filename || "Download added"}`;
        urlInput.value = "";
      } else {
        const err = await res.json().catch(() => ({}));
        feedback.className = "message error";
        feedback.textContent = err.error || "Failed to add download";
      }
    } catch (err) {
      feedback.className = "message error";
      feedback.textContent = "Could not contact Orveth bridge.";
    }
  });
});
