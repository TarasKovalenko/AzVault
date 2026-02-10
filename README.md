# AzVault

AzVault is a cross-platform desktop **Azure Key Vault Explorer** built with:
- Tauri v2 (Rust backend)
- React + TypeScript + Vite (frontend)
- Fluent UI components
- Azure device-code authentication flow (AAD OAuth2), with Azure CLI token fallback

## Features

- Device code sign-in for desktop UX
- Tenant + subscription discovery from Azure Resource Manager
- Key Vault discovery per subscription
- Vault tabs: `Secrets`, `Keys`, `Certificates`, `Access` (read-only), `Activity Log`
- Secret security controls:
  - values are never auto-loaded
  - explicit fetch confirmation required
  - reveal toggle is local-only
  - copy-to-clipboard is explicit with timed warning
- Secret lifecycle:
  - create/set secret (new version when name exists)
  - delete, recover, purge
- Metadata export for item lists (`JSON`/`CSV`)
- Local audit log with sanitized export (redacts sensitive data)
- Local persisted non-sensitive settings:
  - selected tenant/subscription/vault
  - recent vaults
  - environment preference
  - reveal-policy preference

## Security Notes

- Secret values are fetched only on explicit user action.
- Secret values are never written to disk by app logic.
- Audit log redacts sensitive secret-related details.
- Session refresh token is stored in OS secure storage via `keyring` when available.
- If direct token refresh is unavailable, AzVault can fall back to `az account get-access-token`.

## Project Structure

- Frontend: `/Users/taras/Projects/AzVault/src`
- Backend (Tauri/Rust): `/Users/taras/Projects/AzVault/src-tauri/src`

Key frontend files:
- `/Users/taras/Projects/AzVault/src/App.tsx`
- `/Users/taras/Projects/AzVault/src/services/tauri.ts`
- `/Users/taras/Projects/AzVault/src/stores/appStore.ts`
- `/Users/taras/Projects/AzVault/src/components/layout/Sidebar.tsx`
- `/Users/taras/Projects/AzVault/src/components/common/DetailsDrawer.tsx`

Key backend files:
- `/Users/taras/Projects/AzVault/src-tauri/src/lib.rs`
- `/Users/taras/Projects/AzVault/src-tauri/src/commands/mod.rs`
- `/Users/taras/Projects/AzVault/src-tauri/src/auth/mod.rs`
- `/Users/taras/Projects/AzVault/src-tauri/src/azure/mod.rs`
- `/Users/taras/Projects/AzVault/src-tauri/src/audit/mod.rs`

## Command Flow (Tauri)

Implemented commands:
- `auth_start`, `auth_poll`, `auth_status`, `auth_sign_out`, `set_tenant`
- `list_tenants`, `list_subscriptions`, `list_keyvaults`
- `list_secrets`, `list_keys`, `list_certificates`
- `get_secret_metadata`, `get_secret_value`
- `set_secret`, `delete_secret`, `recover_secret`, `purge_secret`
- `read_audit_log`, `write_audit_log`, `get_audit_log`, `export_audit_log`, `clear_audit_log`
- `export_items`

## UI Architecture

- `zustand` store (`appStore`) controls global app/session state.
- `react-query` handles command caching, refetch, retries, and loading states.
- `services/tauri.ts` is the typed boundary between React and Rust commands.
- Main shell layout:
  - Left sidebar: tenant/subscription/vault selection + recent vaults
  - Top bar: search, refresh, environment selector, profile menu
  - Main content tabs: item views + access summary + activity log
  - Details drawer: secret metadata/actions/reveal controls

## Azure Data Source Policy

Default mode is Azure-backed only. Mock mode exists for UI development and is disabled unless enabled explicitly.

To enable mock mode in development:

```bash
VITE_ENABLE_MOCK_MODE=true npm run dev
```

## Prerequisites

- Node.js 20+
- Rust stable toolchain
- Tauri prerequisites for your OS: <https://v2.tauri.app/start/prerequisites/>
- Azure account with Key Vault permissions
- Optional Azure CLI for fallback token provider:

```bash
az login
```

## Install & Run

```bash
npm install
npm run tauri dev
```

Frontend-only development:

```bash
npm run dev
```

Production build:

```bash
npm run tauri build
```

## Notes

- Environment selector is persisted in UI state; current backend APIs target Azure Public endpoints.
- 403/429/network failures are surfaced with actionable hints and retry behavior where applicable.
