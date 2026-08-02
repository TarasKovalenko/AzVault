# AzVault UI Migration Plan

## Goal
Replace Fluent UI throughout the React application with Tailwind CSS and small custom primitives, redesign the interface around native macOS visual conventions, and ensure Activity Log only shows entries for the currently selected Key Vault.

## Scope Decisions
- Preserve existing application behavior, Tauri service contracts, data flows, and tests unless the new UI requires a change.
- Remove `@fluentui/react-components` and `@fluentui/react-icons` from runtime code and dependencies.
- Use Tailwind utilities for component styling, with a small global CSS layer for tokens, platform details, and complex reusable patterns.
- Use lightweight in-repo SVG icon components instead of introducing another UI component library.
- Keep components focused by responsibility and split oversized screens into subcomponents/hooks during migration.

## Phases
### Phase 1: Inventory and design system
**Status:** complete
   - Audit component/library usage and Activity Log data flow.
   - Confirm current Tailwind integration for Vite from official documentation.
   - Define macOS-inspired tokens, primitives, and migration map.
### Phase 2: Foundation
**Status:** complete
   - Install/configure Tailwind.
   - Build custom primitives (button, dialog, menu/popover, inputs, table helpers, icons, typography/status elements).
   - Replace global Fluent provider/theme dependency.
### Phase 3: Shell and navigation
**Status:** complete
   - Rewrite sign-in, app shell, top workspace dropdown, navigation rail, status bar, settings, command palette, and shared layout.
### Phase 4: Vault feature screens
**Status:** complete
   - Rewrite dashboard, secrets, keys, certificates, details, dialogs, and shared data components.
### Phase 5: Activity Log scoping and UI
**Status:** complete
   - Filter/query by selected vault URI/name and reset stale state on vault changes.
   - Rewrite Activity Log UI using the new primitives.
### Phase 6: Cleanup and verification
**Status:** complete
   - Remove Fluent dependencies/imports and obsolete CSS.
   - Run formatting, lint, tests, production build, and repository-wide stale-reference checks.

### Phase 7: Workspace breadcrumb selection repair
**Status:** complete
   - Reproduce and diagnose tenant/subscription/Key Vault dropdown behavior.
   - Repair dropdown event handling and workspace state transitions.
   - Add regression coverage and verify selecting another Key Vault in the browser.

### Phase 8: Application icon replacement
**Status:** complete
   - Inventory every application/platform icon target and inspect the supplied transparent source.
   - Generate deterministic size/format variants without altering the artwork.
   - Replace icon assets and in-app brand marks, then verify packaging configuration and builds.

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| Biome rejected Tailwind v4 `@theme` syntax | 1 | Enabled `css.parser.tailwindDirectives` in `biome.json`. |
| First TypeScript pass rejected nullable dashboard attention reasons | 1 | Convert filtered records into the explicit non-null `AttentionItem` shape. |
| First lint pass found custom-control label/ARIA and hook dependency issues | 1 | Associate controls via structure/ARIA roles and stabilize effect callbacks/dependencies. |
| Biome required semantic `<output>` for status roles | 2 | Replaced generic status spans/divs with semantic output elements. |
| TypeScript rejected injected `aria-haspopup` on the narrowly typed cloned trigger | 1 | Expand the cloned trigger prop contract to include the ARIA attribute. |
| First post-fix browser switch opened the menu but did not change the selected vault | 1 | Treat menu opening and item selection as separate defects; inspect event propagation and store hydration before changing the callback path. |
| Browser retry timed out after the trigger had previously existed | 1 | Vite logs showed coverage output caused a full page reload; re-enter mock mode and verify without concurrent file generation. |
| Clean alternate-vault click still left `kv-prod-app` selected | 2 | Investigate top-bar drag-region hit testing and menu item event handling rather than the already-validated store action. |
| Browser locator did not expose a `focus()` helper | 1 | Use the supported locator `press()` action directly for the keyboard-path comparison. |
| Explicit `no-drag` popup still closed without changing the vault | 3 | Remove ambiguous parent click bubbling; give menu items an explicit dropdown-close context so selection runs before close. |
| Explicit item close still did not run the vault callback | 3 | Move outside-dismiss from `mousedown` to post-activation `click` and use `composedPath()` containment so menu items cannot be unmounted before their click handler. |
