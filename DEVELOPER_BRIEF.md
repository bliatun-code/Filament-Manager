# Developer Brief

## Overview
- Project: `Filament Manager`, a Tauri desktop app for tracking filament inventory, printers, loans, catalog data, and usage history.
- Workspace: `/Users/bliatun/Documents/Codex/bambu-filament-manager`
- Stack:
  - UI: React + TypeScript + Vite
  - Desktop/backend: Tauri + Rust
  - Storage: SQLite

## Architecture
- `ui/`
  - App UI, pages, shared components, theme handling, and i18n
- `src-tauri/`
  - Tauri commands, shared companion service/API wiring, Rust business logic, DB access, import/export, printer management, and catalog operations
- Trusted-LAN browser companion groundwork now exists inside `src-tauri/`
  - `app_services.rs` provides the first narrow browser-oriented service boundary
  - `companion_api.rs` exposes the desktop-hosted `/api/v1` routes used by paired trusted-LAN browsers
  - `src-tauri/companion_browser/` contains the browser shell served directly by the desktop process at `/companion`
  - `state.rs` now tracks trusted-LAN runtime status plus desktop-owned pairing/session-related state
- Key UI patterns:
  - Shared modal system via `/Users/bliatun/Documents/Codex/bambu-filament-manager/ui/src/components/app_modal.tsx`
  - Page-level screens in `/Users/bliatun/Documents/Codex/bambu-filament-manager/ui/src/pages`
  - Central translations in `/Users/bliatun/Documents/Codex/bambu-filament-manager/ui/src/lib/i18n.ts`

## Main Modules
- **Dashboard**
  - High-level metrics, usage chart, low-stock and activity navigation
- **Lager / Inventory**
  - Filament cards/list, filters, selected filament popup, add filament flow
- **Utlån / Loans**
  - Active/returned loans, borrower stats, return flow, CSV export
- **Printere / Printers**
  - Printer cards, AMS/MMU/EXT slot placement, printer-linked consumption
- **Statistikk / Statistics**
  - Total usage, printer usage, per-person loan usage, popup drilldowns
- **Innstillinger / Settings**
  - General, `3D-printere`, `Filamentkatalog`, maintenance, backup/import/export/reset

## Data Model / Behavior
- Vendors: `Bambu`, `eSUN`, `Generic`
- Local catalog storage with discontinued handling
- Inventory states include in-stock, in-use, loaned, empty, and lost
- Phase-1 borrowed-in groundwork is additive in the backend:
  - `filament_spools` now carries ownership metadata
  - `spool_loans` now carries direction, status, and generic counterparty metadata
- The first user-facing borrowed-in slice is now implemented in inventory:
  - the add-filament flow can register a spool as borrowed in
  - borrowed-in spools carry owner/counterparty details
  - borrowed-in spools are labeled in inventory cards/list and the selected-spool popup
  - borrowed-in spools are excluded from outbound loan candidates
- Borrowed-in hand-back is now implemented:
  - the `Utlan` page can load inbound and outbound rows with a direction filter
  - active inbound rows can be handed back with direction-specific wording
  - handing back a borrowed-in spool soft-deletes it from active inventory while preserving loan/history records
- Ownership-aware inventory filtering is now implemented:
  - `Lager` can filter `All / Owned / Borrowed in`
  - this is intentionally a view/filter change only; dashboard/statistics totals are still undecided
- Ownership-aware summary metrics are now implemented additively:
  - `inventory_overview` now returns owned vs borrowed-in counts, low-stock counts, in-use counts, and 30-day print-consumption splits
  - `Dashboard` and `Statistikk` surface those splits in dedicated ownership summary panels
  - the existing headline totals still intentionally remain combined while broader metric semantics stay under discussion
- Ownership-aware statistics drill-downs are now implemented:
  - filament consumption breakdowns keep owned and borrowed-in rows separate instead of merging identical filament families together
  - borrowed-in consumption rows now surface the owner/counterparty name in `Statistikk`
  - active loaded-slot details can now filter and label owned vs borrowed-in printer assignments
- Direction-aware loan usage summaries are now implemented in `Statistikk`:
  - outbound borrower usage remains visible as before
  - borrowed-in owner/counterparty usage now has its own parallel panel and filament breakdown modal
  - backend loan-usage summary queries can now scope outbound vs inbound usage explicitly
- Important terminology note:
  - current spool status `BORROWED` is legacy compatibility for “loaned out”
  - actual borrowed-in support is modeled through spool ownership, not that status
- Filament history is preserved; delete and purge are separate actions
- Printer assignment is handled on `Printere`, not in the selected filament popup
- QR code save/print is supported
- Weight updates drive history and usage calculations

## Current UI Direction
- Light mode is in good shape overall
- Dark mode still needs polish for tinted filament/printer cards and popup styling
- Filament cards use toned swatch-derived tinting
- The browser companion now keeps that swatch language more consistent across `Storage`, `Loans`, and loaded printer-slot cards, including fallback color inference when explicit swatches are missing
- Printer cards use brand tinting:
  - `Bambu` → bamboo green
  - `Prusa` → orange
  - `Generic` → light gray
- Button styling and responsive behavior are being unified across `Lager`, `Utlån`, and `Printere`
- The browser companion now also has a first real locale foundation:
  - `Settings` exposes `English / Norwegian`
  - shared shell/status/task/detail copy is now partially localized through `src-tauri/companion_browser/companion_i18n.js`
  - success feedback like printer-slot assignment now expires automatically instead of lingering as stale shell chrome
- Norwegian terminology has been normalized:
  - `Skriver/Skrivere` → `Printer/Printere`
  - `Rull/Ruller` → `Filament/Filamenter`

## Current Active Tasks
- The trusted-LAN browser companion is now the only supported browser path:
  - the desktop app and SQLite remain the only source of truth
  - browser `Storage` is the companion-facing label for the same stock surface the desktop app still calls `Inventory` / `Lager`, and the browser intake action is `Add spool`
  - the browser workflow surface is intentionally narrow and currently centered on paired trusted-LAN `Storage`, `Loans`, `Printers`, `Settings`, modal detail, `Add spool` intake for vendor-backed/manual owned stock plus borrowed-in and wishlist flows, QR lookup/edit, outbound loans, weight edits, and printer-slot assignment
  - the browser shell visuals are now in an acceptable state for the current phase, including calmer hierarchy, better touch rhythm, swatch-driven surfaces, lighter transient feedback, and Norwegian/English support
  - `npm run smoke` is the baseline regression gate for this phase
- Step 3 trusted-LAN access is now implemented and is the live browser baseline:
  - LAN mode stays default-off and desktop-controlled
  - trusted-LAN binds only to an explicitly selected private interface/address and port instead of a blind `0.0.0.0` listener
  - human browser auth stays separate from any future hardware/device-ingestion paths
  - trusted-LAN browsers now use per-browser pairing, longer-lived device-cookie renewal, revocable paired-browser records in SQLite, exact `Host` / `Origin` checks, `HttpOnly` cookies, and CSRF protection
  - Step 3 still secures access, not traffic: the product/docs must keep saying that trusted-LAN traffic is not encrypted
- Near-term work after Step 3 implementation:
  - keep project docs aligned with the trusted-LAN-only browser baseline
  - keep the current browser workflow surface frozen unless real QA exposes a blocker
  - keep the modular browser shell split as the baseline instead of regrowing `app.js`
  - validate trusted-LAN on real devices and real networks before considering any broader browser workflow expansion
  - treat additional browser-shell tweaks as bug fixes or focused polish only when QA justifies them
- The current browser companion baseline still includes:
  - `Storage`, `Loans`, `Printers`, and `Settings` as the primary browser roots
  - built-in modal detail instead of a peer top-level browser section
  - QR lookup/edit, manual owned and borrowed-in registration, borrowed-in owner/contact edit and hand-back, narrow status/location editing, manual weight update, outbound loan creation/history/return, and printer-slot assignment/clear
  - dedicated desktop Settings trusted-LAN surface with interface selection, LAN status, pairing-link creation, paired-browser listing, and revoke / revoke-all controls
  - desktop-served committed browser assets under `/companion/:asset`

## Upcoming Expansion Track
- Support not only lending filament out, but also borrowing filament in from other people
- Current state:
  - borrowed-in registration works from the desktop add-filament flow and the browser `Storage` → `Add spool` flow
  - inventory surfaces show borrowed-in ownership clearly
  - `Utlån` can now show inbound rows and hand back borrowed-in spools with direction-aware wording
  - the `Utlån` side-panel usage summary still remains outbound-only for now
- Prepare the product for browser-based access from:
  - PC
  - Mac
  - iPad
  - iPhone/mobile browsers
- Future browser workflows should support:
  - adding filament
  - updating filament
  - lending out filament
  - registering borrowed-in filament
  - viewing stock status
  - assigning filament to printer slots
- Recommended direction:
  - keep the desktop app as source of truth first
  - keep SQLite owned by the desktop app in the first browser phases
  - treat the browser experience as a desktop-hosted operational companion first
  - introduce a shared Rust service/API layer before building the browser UI
  - keep catalog refresh/import/export/reset desktop-first initially
  - current implemented phase-1 slice:
    - shared `CompanionService` for spool listing, printer overview, active-loan lookup, outbound loan history reads, manual spool creation, manual detail edits, spool detail, weight update, printer-slot assignment, selected-spool outbound loan creation, and outbound loan return
    - trusted-LAN companion API served by the desktop process at `/companion` and `/api/v1`
    - per-browser pairing, device-cookie renewal, HttpOnly cookies, and CSRF protection for the trusted-LAN browser path
    - QR lookup/edit from the browser inventory/detail surfaces via the shared service/API boundary
    - manual borrowed-in spool registration from the browser inventory section
    - borrowed-in owner/contact/note editing from companion spool detail
    - borrowed-in hand-back from companion spool detail via the same inbound-return logic already used by desktop
    - narrow status/location editing from companion spool detail for selected unassigned, non-loaned spools
    - outbound loan history view via the browser shell, with active/returned filtering and jump-to-detail for return handling
    - browser-safe printer-slot assignment/clear for the selected spool, with occupied-slot replacement still desktop-first
    - selected-spool outbound loan creation from spool detail plus direct outbound-loan return from the history view
  - recommended next slice:
    - validate the dedicated Settings trusted-LAN tab plus the browser QR lookup/edit, borrowed-in manual-registration/edit/hand-back, narrow status/location update, outbound-loan history/direct-return, slot, and selected-spool outbound-loan creation workflows in real trusted-LAN use
    - treat borrowed-in hand-back recovery continuity as part of that validation scope, especially the newer opening-state hardening across `Inventory`, `Printers`, `Loans`, and `Detail`
    - if that slice is solid, decide whether Phase 1 should stay in QA/hardening mode before broadening the API surface further
    - keep broader workflow expansion deferred until that trusted-LAN browser shell is stable

## Planning References
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/WEBAPP_BRIEF.md`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/DOMAIN_MODEL_EXPANSION.md`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/docs/STEP3_TRUSTED_LAN_PLAN.md`

## Known Focus Areas
- Simplify popup headers and reduce duplicated chips/cards
- Improve dark-mode gradient/tint behavior on filament and printer cards
- Keep modal close button and header spacing robust
- Review whether assignment events like `ASSIGNED_TO_AMS` should remain visible in filament history
- Keep print label output minimal and human-friendly

## Important Files
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/ui/src/pages/inventory.tsx`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/ui/src/components/app_modal.tsx`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/ui/src/lib/i18n.ts`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/ui/src/lib/clipboard.ts`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/src/main.rs`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/src/app_services.rs`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/src/companion_api.rs`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/src/state.rs`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/ui/src/pages/settings_companion_model.ts`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/index.html`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/app.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/companion_api_client.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/companion_app_shell.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/companion_dom_events.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/companion_click_router.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/companion_input_router.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/companion_logic.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/companion_data_controller.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/companion_runtime_state.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/companion_shell_state.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/companion_mutations.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/companion_submit_router.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/detail_content.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/shell_chrome.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/storage_shell.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/loans_shell.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/printers_shell.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/settings_shell.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/session_state.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/formatters.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/app.css`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/scripts/companion_local_qa.mjs`

## Validation
- Quick smoke check:
  - `cd /Users/bliatun/Documents/Codex/bambu-filament-manager && npm run smoke`
- Dev app run:
  - `cd /Users/bliatun/Documents/Codex/bambu-filament-manager && npm run tauri -- dev`
