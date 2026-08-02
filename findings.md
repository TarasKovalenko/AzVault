# Findings

## Repository State
- The current branch already contains an uncommitted shell refactor from the immediately preceding user request; preserve and build on it.
- React 19, Vite 7, TypeScript 5.9, Zustand, TanStack Query, and Tauri 2 are in use.
- Fluent UI is currently used across nearly every `.tsx` component and must be eliminated comprehensively.

## Design Direction
- Target a macOS-native feel: translucent layered chrome, compact controls, system font stack, restrained shadows, 10–12px radii, segmented navigation, clear focus rings, and light/dark appearance driven by app state.
- Avoid fake traffic-light window controls because Tauri/window chrome ownership is not yet established.

## Activity Log
- The UI currently calls `getAuditLog(10000)` with query key `['auditLog']`, so data is global and cached across vault changes.
- `AuditEntry` contains `vaultName` but not a vault URI. Selected-vault scoping therefore uses the selected vault name unless the audit model is expanded.
- Export and clear are also global today. To make the screen semantically safe, their backend commands should accept an optional vault name so the selected-vault screen cannot silently export or clear other vaults.
- `VaultDashboard` also uses the global `['auditLog']` cache key and shows recent activity without vault filtering; it must be updated too.
- The Rust logger retains at most 1,000 entries even though the frontend asks for 10,000.
- Backend read/export/clear functions currently operate on the entire log. Adding an optional `vault_name` parameter preserves backwards compatibility while enabling safe per-vault behavior.

## Tailwind Research
- Current official Tailwind guidance for Vite uses `tailwindcss` plus `@tailwindcss/vite`, adds `tailwindcss()` to Vite plugins, and imports Tailwind with `@import "tailwindcss"`.
- Tailwind v4 is CSS-first and does not require the older v3 `tailwind.config.js`/PostCSS setup for this application.
- Source: https://tailwindcss.com/docs/installation/using-vite

## UI Inventory
- 37 source files import Fluent UI components; 25 import Fluent icons.
- The largest screens are `SecretsList` (885 lines), `VaultDashboard` (599), `AuditLog` (438), `SignIn` (404), and `SecretDetails` (400).
- Migration should start with reusable primitives so screen rewrites do not duplicate behavior.

## Foundation Decisions
- Added in-repo primitives for buttons/spinners, badges, form fields, switches, modal dialogs, dropdown menus, SVG icons, class composition, and toast notifications.
- Native HTML controls remain the accessibility foundation; custom components add macOS styling and behavior rather than hiding controls behind a compatibility shim.
- The new global theme uses CSS variables plus Tailwind utilities, with system fonts and light/dark translucent surfaces.
- Existing common components still need direct rewrites; retaining Fluent-compatible props would undermine the requested migration.
- `ContentTabs.tsx` has no consumers and can be removed instead of migrated.
- The navigation rail already owns all feature switching, so preserving a second tab implementation would create two navigation systems.
- After the shell/common/list migration, Fluent usage is isolated to seven feature files: five secret components, the dashboard, and Activity Log.
- Shared `ListToolbar` and `DetailField` components now keep list/detail screens compact and consistent.
- Secret UI has been decomposed into toolbar, import-review dialog, create/edit dialog, prefix-delete dialog, value-reveal panel, detail panel, and list orchestration.
- Activity query keys now include the selected vault name, preventing cross-vault cache reuse.
- The Activity table omits the redundant Vault column because every displayed row belongs to the selected vault.
- The dashboard recent-activity card uses the same selected-vault query contract.
## Final browser QA

- The local app loads cleanly at `http://127.0.0.1:5173/` and exposes the expected Azure CLI fallback plus an opt-in mock workspace path.
- The custom Tailwind sign-in screen has clear, uniquely addressable controls for mock-mode activation and continuation.
- The signed-in shell resolves tenant, subscription, and Key Vault selection in the top breadcrumb dropdown flow; there is no Key Vault side list.
- The rebuilt secrets workspace renders the mock records, toolbar actions, split-pane detail state, compact rail navigation, and status bar without the former component library.
- The Activity screen shows exactly three `kv-prod-app` audit rows in mock mode, excludes the unscoped `system/sign_in` entry, and removes the redundant Vault column.
- At a 1280×720 viewport the finished Activity layout has no horizontal overflow; the compact macOS-style shell, filters, table, scope label, and privacy note remain visible.

## Workspace breadcrumb follow-up

- Mock data contains four Key Vaults, so inability to switch is not caused by an empty result set.
- `VaultPicker` passes the selected vault name and URI correctly to the Zustand `selectVault` action on item click.
- The shared `Dropdown` renders its popup as an absolutely positioned child of the top bar; browser reproduction is needed to distinguish clipping/stacking from event-handling failure.
- The local Vite app is available for the interaction test at `http://127.0.0.1:5173/`.
- Browser reproduction reaches the signed-in mock workspace with `kv-prod-app` selected and all three breadcrumb triggers exposed as buttons.
- Root cause confirmed: `Dropdown` injects `onClick` and `aria-expanded` into its trigger element, but `PickerTrigger` discarded all injected button props instead of forwarding them to its native `<button>`. The breadcrumb received focus but never toggled the menu.
- Other dropdowns use either native buttons or the shared `Button`, both of which forward click props correctly; the defect is isolated to workspace breadcrumb triggers.
- After forwarding trigger props, the Key Vault menu opens correctly and exposes all four vaults with proper `menu`/`menuitem` semantics.
- A second interaction defect remains: clicking `kv-prod-data` closes the menu but leaves `kv-prod-app` selected, so the selection callback/state transition needs separate diagnosis.
- The apparent selection failure was invalidated by the test runner: Vitest coverage output triggered Vite page reloads, returning the mock-only session to sign-in during the interaction. The Zustand selection action itself has no competing reset effect.
- A clean, consolidated retry still opened the menu and closed it on `kv-prod-data`, but did not update the visible selection. This confirms a second real interaction issue after the trigger fix.
- The workspace switcher sits inside a macOS/Tauri drag region. Its trigger is inside a bounded `.no-drag` wrapper, but the absolutely positioned popup extends below that wrapper and did not mark its own hit-test area as non-draggable.
- Keyboard probing only focused the menu item in the browser harness and did not activate it; it does not disprove the drag-region hit-testing diagnosis.
- Marking the popup itself as non-draggable is necessary for Tauri, but the browser click still only closes the menu. The remaining suspect is the shared parent-panel click handler unmounting the menu during bubbled item activation.
- Explicit item-close context also left selection unchanged, which indicates the item `click` never fires. The document-level `mousedown` outside-dismiss listener is unmounting the popup before activation; dismissal should happen on `click` after item handlers and use the event composed path for containment.
- Even post-activation outside dismissal did not restore item events inside the title-bar region. The robust macOS/Tauri solution is to use styled native `<select>` controls for the three breadcrumb pickers, keeping dropdowns in the top bar while avoiding overflow popovers inside draggable chrome.
- Browser verification succeeded with the native breadcrumb controls: selecting `kv-prod-data` updates both the Key Vault combobox and the bottom status bar from `kv-prod-app` to `kv-prod-data`.
- Tenant, subscription, and Key Vault remain separate accessible top-bar comboboxes with Tailwind/macOS styling and loading/disabled states.

## Application icon replacement

- The second supplied file (`Firefly_just icon without any backgrounds 715145.png`) is the correct canonical source: 1344×768 RGBA with transparent surroundings. The Gemini Flash variant is RGB and contains a checkerboard baked into the pixels.
- The artwork is a polished blue rounded-square shield/key mark centered on a wide transparent canvas; it should be tightly alpha-cropped, square-padded, and resized deterministically rather than regenerated.
- Tauri currently consumes `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, and `icon.ico`; the repository also contains Windows Store, iOS, and Android icon variants generated from `src-tauri/icons/icon_source.png`.
- The imagegen workflow led to preserving the provided artwork exactly: this is a deterministic packaging conversion, so model-based editing would introduce unwanted visual drift.
- The transparent artwork alpha bounds are `(443, 141)–(914, 623)`, a 471×482 mark on the 1344×768 canvas. A square crop with modest transparent padding will preserve the full rounded-square edge before 1024px resampling.
- The installed Tauri CLI can generate the complete desktop, Windows Store, iOS, and Android set from one squared transparent PNG, including `.icns` and `.ico` containers.
- In-app brand marks still use a temporary letter `A` in the top bar and a generic shield on sign-in; both should use the same canonical artwork. The HTML currently has no favicon link.
- Pillow 12.1 is available for lossless alpha-aware crop/pad/resize preprocessing; model generation is unnecessary.
- The canonical 1024×1024 master uses crop box `(404, 108)–(952, 656)` and retains balanced transparent padding; visual inspection confirms the complete blue rounded-square edge and shield/key artwork are intact.
- Tauri regenerated 53 platform asset files. The resulting ICNS and six-image ICO containers are valid, while generated PNGs retain transparency and expected dimensions.
- Initial code verification passes, but importing the 1024px master directly into React adds about 897 KB to the frontend bundle. The in-app mark only renders at 28–44 CSS pixels, so a dedicated 256px alpha PNG is sufficient for high-density displays and avoids shipping the packaging master to every UI session.
- The dedicated 256px React asset is 92.86 KB, reducing the frontend image payload by roughly 90% while still providing more than 5× source pixels for the largest 44px rendered mark.
- Browser inspection confirms the new mark renders crisply and proportionally at 44px on the dark macOS-style sign-in card, with no background box, clipping, or layout shift.
- Signed-in browser inspection confirms the 28px top-bar mark is recognizable, aligned with the AzVault wordmark, and does not disturb the workspace selectors or window chrome.
