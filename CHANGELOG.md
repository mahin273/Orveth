# Changelog

All notable changes to **Orveth** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.4] - 2026-11-21

### Added
- **BitTorrent Protocol Engine (BEP 3)**:
  - Pure Rust bencode parser and serializer for metainfo files and tracker responses.
  - Magnet URI parser supporting `xt=urn:btih:`, display names (`dn`), and tracker announce endpoints (`tr`).
  - HTTP and UDP compact tracker client with binary peer decoding.
  - Interactive torrent inspection modal displaying multi-file trees, sizes, and tracker lists.
- **IDM-Grade Browser Companion Extension**:
  - Manifest V3 browser extension for Google Chrome, Brave, Microsoft Edge, and Mozilla Firefox.
  - Automatic download interception via `chrome.downloads.onCreated`, dispatching native downloads directly to Orveth.
  - Floating video capture bar injected over HTML5 media elements with one-click download resolution.
  - Quick-control popup with auto-intercept toggle, connection status check, and manual URL dispatcher.
- **Multi-Platform Release Pipeline**:
  - Automated GitHub Actions builds for Debian/Ubuntu (**`.deb`**), Fedora/RHEL (**`.rpm`**), and Windows NSIS installer (**`.exe`**) alongside universal Linux **`.AppImage`**.
  - Cross-platform path resolution supporting Windows `LOCALAPPDATA` and `USERPROFILE`.
- **Primary Workspace UI Redesign**:
  - Dedicated action toolbar with Add URL, Torrent, and Media extraction buttons.
  - Live "Engines & Network" sidebar monitor showing real-time statuses for `BEP 3`, `yt-dlp`, Loopback Bridge, and Tor/Proxy.
  - Interactive 3-card launch dashboard on empty state.

---

## [0.2.3] - 2026-11-21

### Added
- **Local Control REST API Bridge**:
  - Embedded loopback HTTP server listening on `127.0.0.1:41527`.
  - Secure token authentication via `X-Orveth-Token` header.
  - API endpoints for `/api/v1/health`, `/api/v1/download`, and `/api/v1/jobs`.
- **Native Messaging Support**:
  - Manifest generator for Chrome, Chromium, Brave, Microsoft Edge, and Firefox.
  - Python-based standard I/O bridge script dispatching native browser messaging to Orveth's REST API.

---

## [0.2.2] - 2026-11-21

### Added
- **Media & Video Extraction Engine (`yt-dlp`)**:
  - Stream metadata inspection resolving video formats, audio codecs, resolutions (4K, 1080p, 720p), and file sizes.
  - Automated background installer for official standalone `yt-dlp` executable.
  - Version verification and executable health monitoring.

---

## [0.2.1] - 2026-11-21

### Added
- **Custom Proxy & Tor Routing**:
  - HTTP, HTTPS, and SOCKS5 proxy protocol support in download workers.
  - Native Tor daemon integration via `socks5h://127.0.0.1:9050`.
  - Runtime proxy testing with latency measurements and bypass toggles.

---

## [0.2.0] - 2026-11-21

### Added
- **Accelerated Multi-Segment Engine**:
  - Dynamic byte-range chunk planner with up to 16 concurrent segment streams.
  - Single-stream automatic fallback for servers without `Accept-Ranges` support.
  - Sparse chunk allocation on disk to prevent filesystem fragmentation.
- **Token-Bucket Rate Limiter**:
  - Global and per-job speed capping with microsecond refill precision.
- **SQLite Persistence Queue**:
  - ACID-compliant WAL mode storage with startup state reconciliation.
  - Automatic resume for interrupted transfers with exponential backoff and jitter.
- **Streaming SHA-256 Integrity Verification**:
  - Incremental checksum computation alongside data writing.

---

## [0.1.0] - 2026-11-21

### Added
- Initial project scaffolding and modular Cargo workspace architecture.
- Tauri v2 application shell with React 18, TypeScript, and Tailwind CSS.
- Basic URL download dispatcher, table views, and dark mode interface.
