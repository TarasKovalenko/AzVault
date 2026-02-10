# Contributing

Thanks for contributing to AzVault.

## Development Setup

1. Install prerequisites from `README.md`
2. Install deps: `npm install`
3. Run app: `npm run tauri dev`

## Before Opening a PR

Run all checks:

```bash
npm run lint
npm run build
cd src-tauri
cargo fmt --check
cargo test
cargo check
```

## PR Guidelines

- Keep PRs focused and small when possible.
- Include tests for Rust backend behavior changes.
- Document security-impacting changes in PR description.
- Do not include secrets, tokens, or local machine paths.

## Commit Style

Use clear, imperative messages, e.g.:
- `feat: add bulk secret deletion confirmation`
- `fix: validate vault URI host allowlist`
