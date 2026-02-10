# AzVault

AzVault is a cross-platform desktop Azure Key Vault explorer built with:
- Tauri v2 (Rust)
- React + TypeScript + Vite
- Fluent UI

AzVault uses **Azure CLI authentication only**. You authenticate with `az login`, and the app requests short-lived tokens via `az account get-access-token`.

## Status

- `cargo test` passing
- `cargo check` passing
- `npm run lint` passing
- `npm run build` passing

## Features

- Tenant/subscription/key vault discovery
- Browse Secrets, Keys, Certificates
- Secret metadata + explicit value fetch flow
- Secret CRUD lifecycle (set/delete/recover/purge)
- Bulk secret selection + one-click delete with confirmation
- Local audit log with redaction/sanitized export
- VS Code-like operator UI with light/dark themes

## Authentication Model (CLI Only)

1. Run `az login`
2. (Optional) select default subscription: `az account set --subscription <id>`
3. Open AzVault and click **Connect with Azure CLI**

AzVault does not persist AAD refresh tokens or secret values.

## Threat Model (Short)

### In scope
- Prevent accidental secret exposure in logs/UI
- Restrict backend calls to Azure endpoints
- Validate user-provided vault URIs and secret names
- Keep audit data sanitized and size-bounded

### Out of scope
- Compromised local machine or compromised Azure CLI installation
- Clipboard exfiltration outside app controls
- Azure-side RBAC/access policy misconfiguration

## Local Data Storage

Stored locally:
- UI/session preferences (tenant/subscription/vault selection, recent vaults, theme)
- Local audit log entries (sanitized/redacted)

Never stored locally by app logic:
- Secret values
- Refresh tokens

## Repository Layout

- `src/`: React frontend
- `src-tauri/src/`: Rust backend
- `.github/workflows/`: CI workflows

## Prerequisites

- Node.js 20+
- Rust stable toolchain
- Azure CLI (`az`)
- Tauri OS prerequisites: [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

## Development

Install deps:

```bash
npm install
```

Run desktop app:

```bash
npm run tauri dev
```

Frontend-only mode:

```bash
npm run dev
```

Optional mock mode for UI development:

```bash
VITE_ENABLE_MOCK_MODE=true npm run dev
```

## Quality Gates

Frontend:

```bash
npm run lint
npm run build
```

Rust:

```bash
cd src-tauri
cargo fmt --check
cargo test
cargo check
```

## Security

Please read `SECURITY.md` before reporting vulnerabilities.

## License

MIT (`LICENSE`).
