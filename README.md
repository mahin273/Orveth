# Orveth

A fast, reliable, power-user download manager for Linux desktop built around a capable, independently testable Rust download engine and a clean Tauri + React frontend.

## Features

- **Engine First:** Segmented and single-stream transfers with verified byte ranges.
- **Adaptive Concurrency:** Auto-detects server range support and adapts segment counts.
- **Robust Persistence:** SQLite backed queue with startup recovery and reconciliation.
- **Network Resilient:** Resumes interrupted transfers with exponential backoff and jitter.
- **Bandwidth Control:** Token-bucket rate limiting (global and per-job).
- **Integrity Verification:** Optional SHA-256 verification against user-supplied digests.
- **Desktop Integration:** Native notifications, reveal in file manager, and AppImage packaging.

## Architecture

Orveth is structured as a cargo workspace with independent domain crates and an application desktop shell:

```text
crates/
├── orveth-core          # Engine facade, lifecycle state machine, domain models
├── orveth-download      # HTTP transfer worker, segment validation, single-stream fallback
├── orveth-scheduler     # Priority queue manager and worker coordinator
├── orveth-storage       # File allocation, chunked segment writers, atomic finalizer
├── orveth-persistence   # SQLite repositories, WAL mode, migrations, state recovery
└── orveth-integrity     # Streamed checksums and hash verification
apps/
└── desktop              # Tauri 2 application and React + TypeScript UI
```

## Getting Started

### Prerequisites

- Rust (edition 2021 / 1.75+)
- Node.js (v20+)
- pnpm (v9+)
- Linux desktop libraries (GTK3, WebKit2GTK)

### Development

```bash
# Run tests across all crates
cargo test --workspace

# Start desktop app in development
cd apps/desktop
pnpm install
pnpm tauri dev
```

## License

MIT License. See [LICENSE](LICENSE) for details.
