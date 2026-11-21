# Contributing to Orveth

Thank you for your interest in contributing to Orveth! We welcome contributions from developers of all backgrounds. This document outlines our development workflow, coding standards, and pull request procedures.

---

## 1. Guiding Principles

- **Performance First**: Orveth is engineered for maximum throughput and minimal CPU/memory overhead. Avoid unbounded allocations or unnecessary cloning.
- **Local-First & Private**: All transfers, queues, and settings stay entirely on the user's machine. Zero telemetry, tracking, or remote analytics.
- **Explicit Error Handling**: Never swallow errors or panic in application code. Use typed, descriptive error variants via `OrvethError`.
- **Zero Mock / Dummy Data**: Application code must strictly interact with real endpoints, storage, or SQLite models. Test fixtures are confined to `tests/`.

---

## 2. Git Workflow & Branching Strategy

Our repository maintains two permanent branches:
- **`main`**: Production-ready release branch. Tagged releases (`v*`) and release artifacts are built from here.
- **`develop`**: Active development and integration branch. All feature branches branch off and merge into `develop`.

### Contribution Steps
1. **Fork and clone** the repository.
2. Create a feature or bugfix branch off `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feat/your-feature-name
   ```
3. Implement your changes following our coding and test guidelines.
4. Ensure all tests and linters pass locally:
   ```bash
   cargo test --workspace
   cargo clippy --workspace --all-targets -- -D warnings
   cargo fmt --check
   pnpm --dir apps/desktop typecheck
   pnpm --dir apps/desktop build
   ```
5. Commit using **Conventional Commits** (see Section 3).
6. Push to your fork and submit a Pull Request targeting `develop`.

---

## 3. Commit Message Convention

We adhere strictly to the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```text
<type>(<scope>): <short description>

[optional body]

[optional footer(s)]
```

### Common Types:
- `feat`: A new user-facing feature or capability.
- `fix`: A bug fix or error correction.
- `perf`: A code change that improves performance without altering functionality.
- `refactor`: Code changes that neither fix bugs nor add features.
- `test`: Adding missing tests or correcting existing tests.
- `docs`: Documentation updates, README changes, or inline doc comments.
- `chore`: Tooling, build pipeline, dependency bumps, or CI updates.

### Examples:
- `feat(torrent): add UDP tracker compact announce client`
- `fix(download): handle transient 429 rate limit with exponential backoff`
- `perf(storage): pre-allocate sparse chunks on filesystem before writing`

---

## 4. Coding Standards

### Rust Backend (`crates/`, `apps/desktop/src-tauri`)
- **Formatting**: Always format your code with `cargo fmt` before committing.
- **Linter**: Code must pass `cargo clippy --workspace --all-targets -- -D warnings` with zero warnings.
- **Error Handling**: Use `Result<T, OrvethError>`. Avoid `unwrap()` or `expect()` in production code paths; handle failures gracefully or propagate them with `?`.
- **Concurrency**: Use `tokio` asynchronous primitives for network and I/O tasks. Protect shared mutable state with standard synchronization primitives (`Arc<Mutex<T>>` or channels).
- **Safety**: Do not introduce `unsafe` blocks without documented necessity and architectural review.

### Frontend UI (`apps/desktop/src`)
- **Type Safety**: Strictly typed TypeScript with zero `any` declarations. Pass `pnpm typecheck` with no errors.
- **Component Design**: Keep React components modular and single-purpose. Prefer composable Radix UI primitives.
- **Styling**: Use utility classes via Tailwind CSS. Ensure all components render cleanly in dark mode.
- **State Flow**: Synchronize state with the Rust engine using Tauri IPC commands and event listeners. Avoid unnecessary component re-renders.

---

## 5. Testing Requirements

- **Unit Tests**: All new algorithms, state transitions, parsers, and utilities must include comprehensive unit tests.
- **Integration Tests**: Network clients and queue workers should have mock-server tests covering both standard success paths and failure modes (timeout, 5xx, range mismatch).
- **Run the full test suite**:
  ```bash
  cargo test --workspace --verbose
  ```

---

## 6. Security & Vulnerability Reporting

If you discover a security vulnerability within Orveth, please **do not open a public issue**. Instead, report it privately via GitHub Security Advisories or contact the maintainers directly.
