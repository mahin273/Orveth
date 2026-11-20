# Contributing to Orveth

All contributions must adhere to the design principles and git workflow in `designdoc.md`.

## Workflow

1. Create a branch from `develop`:
   `git switch -c feature/<scope>-<description>`
2. Follow Conventional Commits: `<type>(<scope>): <message>`.
3. Keep changes atomic and test-covered.
4. Ensure `cargo test --workspace` passes before opening a PR.
