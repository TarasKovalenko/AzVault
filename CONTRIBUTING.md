# Contributing

Thanks for contributing to AzVault.

## Development Setup

1. Install prerequisites from [README.md](README.md)
2. Install deps: `npm install`
3. Run the desktop app: `npm run tauri dev`

### Two build targets

The repository builds two separate bundles from one dependency tree:

| Target | Sources | Dev | Build | Output |
| --- | --- | --- | --- | --- |
| Desktop app (Tauri) | `index.html`, `src/` | `npm run tauri dev` | `npm run build` | `dist/` |
| Marketing site (GitHub Pages) | `site/` | `npm run dev:site` | `npm run build:site` | `dist-site/` |

Shared UI primitives live in `src/components/ui` and are imported by both. Keep the
landing page out of `src/` — anything under `src/` ends up inside the shipped desktop
bundle.

## Before Opening a PR

Run all checks:

```bash
npm run lint
npm run test:react
npm run build
npm run build:site
sh -n install.sh
cd src-tauri
cargo fmt --check
cargo test
cargo check
```

## PR Guidelines

- Keep PRs focused and small when possible.
- Include tests for behaviour changes on both the Rust backend and the React frontend.
- Document security-impacting changes in PR description.
- Do not include secrets, tokens, or local machine paths.

## Commit Style

Use clear, imperative messages, e.g.:
- `feat: add bulk secret deletion confirmation`
- `fix: validate vault URI host allowlist`
