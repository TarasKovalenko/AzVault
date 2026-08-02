# Progress

## 2026-08-02
- Started full Fluent UI → Tailwind/custom component migration.
- Created persistent plan, findings, and progress files per the planning-with-files skill.
- Phase 1 inventory is in progress.
- Audited all Fluent imports/component sizes and Activity Log frontend/backend call sites.
- Confirmed the official Tailwind v4 Vite integration (`tailwindcss` + `@tailwindcss/vite`).
- Installed Tailwind v4 and its Vite plugin, and removed both Fluent UI packages.
- Added the initial custom UI primitive layer and replaced the Fluent provider/toaster foundation.
- Rewrote shared empty/loading/error/confirmation/table/split-pane components with Tailwind and custom primitives.
- Completed the Tailwind/custom primitive foundation.
- Rebuilt the app shell, top bar, workspace hierarchy dropdowns, navigation rail, account menu, and status bar with macOS-inspired styling.
- Removed the unused `ContentTabs` implementation.
- Rebuilt sign-in, settings, command palette, key list/details, and certificate list/details.
- Completed the shell/navigation phase; only seven feature files still reference Fluent UI.
- Rebuilt all secret dialogs and detail/value surfaces, and split the large Secrets screen into focused components.
- Rebuilt the Secrets list orchestration, vault dashboard, and dashboard subcards.
- Added native per-vault Activity read/export/clear support with a Rust regression test.
- Rebuilt Activity Log as focused toolbar/table components and scoped dashboard activity to the selected vault.
- Removed the obsolete Fluent-era stylesheet; cleanup and verification are in progress.
- Formatting initially failed because Biome's Tailwind directive parser was disabled; enabled it in repository configuration.
- First verification: 24 React tests and 84 Rust tests passed. TypeScript found one dashboard type narrowing issue; lint found accessibility/dependency diagnostics now being corrected.
- Production build now passes; the second lint pass reduced findings to two semantic status-element diagnostics, corrected with `<output>`.
## Browser QA

- Opened the production UI through the local Vite server and verified the initial sign-in state.
- Enabled mock mode successfully; continuing through workspace and vault-scoped Activity validation.
- Entered the mock workspace and verified `Contoso Corp / Production / kv-prod-app` is selected in the top bar.
- Navigated to Activity and verified all rendered entries belong to `kv-prod-app`; the mock `system/sign_in` entry is excluded.
- Visually inspected the finished 1280×720 dark-theme layout and confirmed there is no document-level horizontal overflow.
- Completed cleanup and verification: production build, lint, 24 React tests, and 84 Rust tests all pass.

## Workspace breadcrumb repair

- Started a focused follow-up after the Key Vault breadcrumb was reported as non-interactive.
- Reproduced the signed-in workspace in the browser with four mock vaults available from the service layer.
- Confirmed the Key Vault trigger receives focus but its menu does not render, then traced the failure to dropped trigger props in `PickerTrigger`.
- Fixed trigger prop forwarding and verified the Key Vault menu now opens; continuing because the first alternate-vault click did not update the selected vault.
- Build, lint, and all 24 React tests pass after the trigger repair. Identified Vite reloads from generated coverage pages as interference in the first selection verification.
- Traced the remaining pointer failure to the dropdown popup extending outside the top bar's bounded non-drag region.
- Decided to replace only workspace breadcrumb popovers with Tailwind-styled native selects; other application dropdowns remain custom.
- Rebuilt all three breadcrumb pickers around a shared `WorkspaceSelect` primitive and removed the obsolete custom `PickerTrigger`.
- Verified in the browser that changing the Key Vault to `kv-prod-data` updates the selected workspace successfully.

## Application icon replacement

- Started inventorying app/platform icon targets using the supplied Firefly artwork as the canonical source.
- Selected the RGBA Firefly file as the source and inventoried desktop, Windows Store, iOS, and Android icon targets.
- Confirmed the source alpha bounds, local image tooling, Tauri icon generator, and in-app brand-mark call sites.
- Created `src/assets/azvault-icon.png`, `public/favicon.png`, and a new Tauri `icon_source.png`, then regenerated the full desktop/Windows/iOS/Android icon set.
- Visually inspected the 1024px master and validated alpha bounds plus `.icns`/`.ico` container output.
- Wired the artwork into the top bar, sign-in brand mark, and favicon; build, lint, 24 React tests, and diff checks pass.
- Identified and began correcting an unnecessary 897 KB frontend image payload by downscaling only the React asset to 256px while retaining the 1024px Tauri master.
- Reduced the React asset to 256px/92.86 KB and confirmed the production build still passes.
- Visually verified the new sign-in brand mark in the running application.
- Visually verified the 28px top-bar brand mark in the signed-in workspace.
- Completed icon replacement across Tauri platform assets, favicon, sign-in, and top-bar branding.
