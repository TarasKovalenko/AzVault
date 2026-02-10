# Release Checklist

## Pre-release

- [ ] `npm run lint`
- [ ] `npm run build`
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
- [ ] Verify signing/notarization requirements for distribution channels

## Post-release

- [ ] Tag release in git
- [ ] Publish release notes
- [ ] Track regressions/issues
