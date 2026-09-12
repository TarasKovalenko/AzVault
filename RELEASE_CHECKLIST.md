# Release Checklist

## Pre-release

- [ ] `npm run lint`
- [ ] `npm run test:react`
- [ ] `npm run build` (desktop bundle) and `npm run build:site` (Pages site)
- [ ] `sh -n install.sh` and `shellcheck install.sh`
- [ ] `cd src-tauri && cargo fmt --check && cargo test && cargo check`
- [ ] CI green on default branch
- [ ] README and changelog updated
- [ ] Security-sensitive changes reviewed

## Secrets/Compliance

- [ ] Run repository secret scan (`detect-secrets`/equivalent)
- [ ] Confirm no local absolute paths or personal metadata in docs
- [ ] Confirm no credentials in tracked files/history

## Packaging

- [ ] Build release artifacts with `npm run tauri build`
- [ ] Verify app launch on target OSes
- [ ] Verify installed macOS builds on both Apple Silicon (`aarch64`) and Intel when publishing dual-arch DMGs
- [ ] Verify Azure CLI is discoverable from the installed macOS app (`/opt/homebrew/bin/az` on Apple Silicon)
- [ ] Verify signing/notarization requirements for distribution channels

## Installer

- [ ] Confirm the published release actually carries build assets — a tag with an
      empty asset list makes `install.sh` fail for every user
- [ ] Confirm the tag matches the version in `package.json`, `Cargo.toml` and
      `tauri.conf.json`, and uses the `vX.Y.Z` form (not `v.X.Y.Z`)
- [ ] Confirm the release published a `SHA256SUMS` asset
- [ ] Confirm the release published build provenance attestations
- [ ] Smoke-test `curl -fsSL .../install.sh | sh` on macOS and Linux against the new tag
- [ ] Smoke-test `install.sh --uninstall`

## Post-release

- [ ] Tag release in git
- [ ] Publish release notes
- [ ] Track regressions/issues
