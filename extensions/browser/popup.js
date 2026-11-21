document.addEventListener("DOMContentLoaded", async () => {
  const statusBadge = document.getElementById("statusBadge");
  const downloadForm = document.getElementById("downloadForm");
  const urlInput = document.getElementById("urlInput");
  const tokenInput = document.getElementById("tokenInput");
  const feedback = document.getElementById("feedback");

  const DEFAULT_PORT = 41527;

  // Load config
  const config = await new Promise((res) => {
    chrome.storage.local.get({ port: DEFAULT_PORT, token: "" }, res);
  });

  tokenInput.value = config.token || "";

  tokenInput.addEventListener("change", () => {
    chrome.storage.local.set({ token: tokenInput.value.trim() });
    checkHealth();
  });

  async function checkHealth() {
    try {
      const res = await fetch(`http://127.0.0.1:${config.port}/api/v1/health`, {
        headers: config.token ? { "X-Orveth-Token": config.token } : {},
      });
      if (res.ok) {
        const data = await res.json();
        statusBadge.className = "status-badge status-online";
        statusBadge.textContent = `● Connected (v${data.version || "0.2.x"})`;
        return true;
      } else {
        statusBadge.className = "status-badge status-offline";
        statusBadge.textContent = "● Unauthorized / Error";
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

    try {
      const headers = { "Content-Type": "application/json" };
      if (config.token) {
        headers["X-Orveth-Token"] = config.token;
      }

      const res = await fetch(`http://127.0.0.1:${config.port}/api/v1/download`, {
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
