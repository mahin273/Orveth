// Orveth Content Script: IDM-Grade Video Sniffer & Floating Download Bar

(function () {
  let floatingBarEnabled = true;

  // Load user preference for floating video bar
  chrome.storage.local.get({ showVideoBar: true }, (res) => {
    floatingBarEnabled = res.showVideoBar !== false;
    if (floatingBarEnabled) {
      scanAndAttachVideoBars();
    }
  });

  // SVG download icon
  const DOWNLOAD_ICON_SVG = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  `;

  function createFloatingBadge(videoElement) {
    if (videoElement.dataset.orvethAttached) return;
    videoElement.dataset.orvethAttached = "true";

    const badge = document.createElement("div");
    badge.className = "orveth-video-downloader-badge";
    badge.innerHTML = `
      <span class="orveth-badge-icon">${DOWNLOAD_ICON_SVG}</span>
      <span class="orveth-badge-text">Download with Orveth</span>
      <span class="orveth-badge-tag">HD</span>
    `;

    // Position relative to video or parent container
    const container = videoElement.parentElement;
    if (container && getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    badge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Resolve best target URL
      let targetUrl = window.location.href;
      const host = window.location.hostname.toLowerCase();

      // If generic HTML5 direct video file (.mp4, .webm, etc.)
      const isPlatform =
        host.includes("youtube.com") ||
        host.includes("youtu.be") ||
        host.includes("vimeo.com") ||
        host.includes("twitch.tv") ||
        host.includes("twitter.com") ||
        host.includes("x.com") ||
        host.includes("tiktok.com");

      if (!isPlatform && (videoElement.currentSrc || videoElement.src)) {
        targetUrl = videoElement.currentSrc || videoElement.src;
      }

      badge.querySelector(".orveth-badge-text").textContent = "Sending to Orveth...";

      chrome.runtime.sendMessage(
        {
          action: "DOWNLOAD_MEDIA",
          url: targetUrl,
          title: document.title,
        },
        (response) => {
          if (response && response.success) {
            badge.classList.add("orveth-badge-success");
            badge.querySelector(".orveth-badge-text").textContent = "Queued in Orveth ✓";
            setTimeout(() => {
              badge.classList.remove("orveth-badge-success");
              badge.querySelector(".orveth-badge-text").textContent = "Download with Orveth";
            }, 3000);
          } else {
            badge.querySelector(".orveth-badge-text").textContent = "Failed to queue";
            setTimeout(() => {
              badge.querySelector(".orveth-badge-text").textContent = "Download with Orveth";
            }, 3000);
          }
        }
      );
    });

    if (container) {
      container.appendChild(badge);
    } else {
      videoElement.parentNode.insertBefore(badge, videoElement);
    }
  }

  function scanAndAttachVideoBars() {
    if (!floatingBarEnabled) return;
    const videos = document.querySelectorAll("video");
    videos.forEach((v) => {
      // Ignore tiny background video sprites under 150px
      const rect = v.getBoundingClientRect();
      if (rect.width > 160 || rect.height > 120 || v.duration > 0) {
        createFloatingBadge(v);
      }
    });
  }

  // Observe dynamically loaded video players (e.g. YouTube SPA navigation, infinite scroll)
  const observer = new MutationObserver(() => {
    scanAndAttachVideoBars();
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Listen to messages from background worker
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_PAGE_LINKS") {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      const links = anchors
        .map((a) => a.href)
        .filter((href) => {
          return (
            href.startsWith("http://") ||
            href.startsWith("https://") ||
            href.startsWith("magnet:")
          );
        });
      const uniqueLinks = Array.from(new Set(links));
      sendResponse({ links: uniqueLinks });
    }
  });

  // Initial scan
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanAndAttachVideoBars);
  } else {
    scanAndAttachVideoBars();
  }
})();
