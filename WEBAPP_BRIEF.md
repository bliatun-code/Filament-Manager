# Web App Brief

## Goal
Add browser-based access to `Filament Manager` so users can work from:
- PC browsers
- Mac browsers
- iPad browsers
- iPhone/mobile browsers

The web experience should support the same core operational workflows as the desktop app without replacing the desktop app as the primary source of truth too early.

## Terminology
- In the browser companion, `Storage` is the companion-facing label for the same stock surface the desktop app still calls `Inventory` / `Lager`.
- Browser intake should be described as `Add spool`; older historical notes below may still say `Add filament` when referring to earlier desktop UI or earlier browser batches.

## Target Capabilities
- Add spool from vendor-backed, manual, borrowed-in, and wishlist flows
- Update filament details
- Lend out filament
- Register borrowed-in filament from other people
- View stock status
- Assign filament to printer slots
- View printer state and slot occupancy

## Confirmed Product Direction
- Use a **desktop-hosted browser companion**
- Keep the desktop app as the only source of truth and only direct owner of the SQLite database
- Treat browser access as an operational companion first, not as a full remote/server product
- Keep catalog refresh, destructive maintenance, import/export, and reset flows desktop-first for the initial browser phases
- Treat Safari on iPhone/iPad as a first-class target, but do not force LAN/mobile access into the first implementation phase
- Current shorthand:
  - localhost browser companion = retired
  - Step 3 = implemented trusted-LAN browser access with appropriate security for a trusted LAN
  - current active implementation track = webapp UI-only polish, especially iPhone/small-screen simplification, with trusted-LAN backend/security behavior frozen unless a real UI blocker appears

## Recommended Architecture

### Preferred starting point
Use a **desktop-hosted companion architecture**:
- Tauri desktop app remains the source of truth
- Rust business rules stay shared inside the app
- The desktop process exposes an authenticated HTTP API for paired trusted-LAN browser access
- The browser UI talks to that API instead of talking to SQLite directly

### Service layering
Recommended structure:
- `SQLite / FilamentDatabase`
- `Application services`
- `Adapters`
  - Tauri commands for the desktop UI
  - HTTP routes for the browser companion
  - separate device-ingestion routes for scale/scanner-style hardware if needed
- `Frontend clients`
  - desktop React shell
  - browser shell served by the desktop process

### Why this is the best first move
- Preserves the current investment in Tauri + Rust + SQLite
- Reuses the existing domain and inventory logic instead of duplicating it in a server rewrite
- Lets browser workflows be validated before committing to sync, multi-user, or remote hosting problems
- Leaves a clean migration path open if a dedicated backend is later justified

## Implemented Browser Groundwork
- A first narrow shared service boundary now exists in `src-tauri/src/app_services.rs`
- The desktop process now serves the trusted-LAN companion API in `src-tauri/src/companion_api.rs`
- The desktop process now serves the browser shell at `/companion`
- The companion host now serves committed browser assets from `/companion/:asset`, which keeps the shell desktop-hosted while allowing small ESM modules instead of one special-cased script blob
- Settings now exposes trusted-LAN configuration, pairing, QR handoff, and paired-browser management from the desktop app
- The desktop Browser access surface now also auto-refreshes the paired-browser list after successful new pairings while the tab remains open
- The first companion routes are:
  - `GET /api/v1/inventory/spools`
  - `GET /api/v1/catalog/masters`
  - `GET /api/v1/wishlist`
  - `GET /api/v1/spools/by-qr`
  - `POST /api/v1/spools/owned`
  - `POST /api/v1/spools/manual`
  - `POST /api/v1/wishlist`
  - `POST /api/v1/wishlist/:item_id/status`
  - `POST /api/v1/spools/:spool_id/qr`
  - `GET /api/v1/loans`
  - `GET /api/v1/printers/overview`
  - `GET /api/v1/loans/active`
  - `POST /api/v1/spools/borrowed-in`
  - `POST /api/v1/spools/:spool_id/borrowed-in`
  - `POST /api/v1/spools/:spool_id/details`
  - `POST /api/v1/printers/:printer_id/slots/:slot_id/assignment`
  - `GET /api/v1/spools/:spool_id`
  - `POST /api/v1/spools/:spool_id/lend`
  - `POST /api/v1/loans/:loan_id/hand-back`
  - `POST /api/v1/loans/:loan_id/return`
  - `POST /api/v1/spools/:spool_id/weight`
- Tauri commands for spool listing, printer overview, spool history/usage, manual spool creation, manual detail edits, weight update, outbound loan creation, outbound loan history reads, active-loan listing, and outbound loan return now share that same browser-oriented service boundary instead of duplicating direct DB-open logic
- The current auth slice is intentionally narrow:
  - trusted-LAN stays default-off and desktop-controlled
  - the listener binds only to an explicitly selected private interface/address and port
  - browser access is approved through short-lived pairing links and revocable paired-browser records
  - authenticated reads/writes use HttpOnly cookies, with CSRF required for mutating requests
- The first browser shell currently includes:
  - storage-first spool listing
  - QR lookup
  - QR save/edit from spool detail
  - browser `Add spool` with Bambu/eSUN/manual source selection
  - owned stock entry from vendor-backed or manual selections
  - borrowed-in registration from the same add-spool surface
  - wishlist add, queue status changes, and `Stock now` from the browser shell
  - borrowed-in owner/contact/note editing from spool detail
  - borrowed-in hand-back from spool detail
  - narrow status/location editing from spool detail for selected unassigned, non-loaned spools
  - printer roster plus focused slot-board view
  - outbound loan review/history with direct return for active loans
  - basic printer-slot assignment/clear for the selected spool
  - contextual spool detail with history/usage and active-loan visibility
  - selected-spool outbound loan creation
  - manual weight update
  - a reworked mobile-first shell:
    - `Storage`, `Loans`, `Printers`, and `Settings` now act as the primary destinations
    - spool detail now opens as an in-app modal instead of acting like a peer top-level section or a persistent inspector pane
    - iPhone uses bottom root nav, iPad uses a top root switch, and desktop uses a left rail
  - explicit browser theme controls:
    - `Auto`, `Light`, and `Dark` now live in the Settings tab instead of relying only on passive `prefers-color-scheme` CSS
  - first browser locale controls:
    - `Settings` now exposes `English / Norwegian`
    - shared shell, status, task-sheet, and detail copy now has a browser-specific localization foundation in `src-tauri/companion_browser/companion_i18n.js`
  - stronger main-app visual language alignment:
    - Storage, Loans, selected-context chrome, detail summary, and Printers roster/board now use swatch- or brand-tinted surfaces closer to the desktop app
    - Loans and loaded printer-slot cards now inherit filament color treatment the same way as Storage, including fallback swatch inference when companion rows do not carry an explicit hex color
  - a more guided printer-slot flow:
    - Printers now includes its own in-tab spool chooser instead of forcing slot work to start only from Storage
    - open slots now expose clearer “load here” actions and chooser shortcuts instead of relying on looser implied context
    - the chooser now opens inside the active printer board only when needed, which keeps the selected-spool context from repeating as a giant full-width panel above the roster/board workspace
    - slot labels now avoid leaking raw internal AMS identifiers into the visible board and fall back to human `Slot <n>` naming when the underlying ids are machine-only values
    - the active board now also uses compact stat chips instead of the earlier large metric-card row, which keeps more vertical room available for actual slot work on tablet and desktop
  - broader human-friendly copy cleanup:
    - Storage, Loans, Printers, and the detail modal now prefer readable titles, short references, and friendlier state labels over raw internal ids
    - the selected-spool strip now keeps current placement/load state in the main meta line instead of repeating it again as a dedicated state pill
    - the detail summary card now focuses on vendor, reference, placement, slot state, and the two primary weight metrics instead of spending extra top-of-modal space on duplicated reference chrome
    - the Storage toolbar and QR/add utility sheets now use a tighter operational rhythm, while the restored add-spool sheet keeps stock entry and wishlist flows inside one calmer phone-first task surface
  - calmer transient feedback:
    - success status lines such as printer-slot assignment now auto-expire after about 20 seconds instead of lingering in the shell indefinitely
- Step 2 acceleration groundwork is now in place:
  - `src-tauri/companion_browser/app.js` is now focused on browser startup/pairing/layout wiring
  - `src-tauri/companion_browser/companion_app_shell.js` now owns trusted-LAN pairing fallback, top-level root-flow composition, and detail-modal rendering
  - `src-tauri/companion_browser/companion_dom_events.js` now owns browser document/root event registration and event-to-action wiring
  - `src-tauri/companion_browser/companion_runtime_state.js` now owns status/busy/detail-feedback helpers for the trusted-LAN browser shell
  - `src-tauri/companion_browser/companion_api_client.js` now owns browser pairing/session restore/retry transport
  - `src-tauri/companion_browser/companion_click_router.js` now owns click-action dispatch for the browser shell
  - `src-tauri/companion_browser/companion_input_router.js` now owns input/change dispatch for search, QR lookup, and borrowed-in draft fields
  - `src-tauri/companion_browser/companion_data_controller.js` now owns overview refresh, spool-detail loading, pairing/session renewal, and stale detail-request guarding
  - `src-tauri/companion_browser/companion_shell_state.js` now owns shell-state and layout helpers for root transitions, detail return context, and compact utility state
  - `src-tauri/companion_browser/companion_mutations.js` now owns browser write and lookup helpers for weight, QR, slot, loan, borrowed-in, and spool-detail edits
  - `src-tauri/companion_browser/companion_submit_router.js` now owns form-submit dispatch for the browser write surface
  - `src-tauri/companion_browser/detail_content.js` now owns selected-spool detail rendering for QR/status/location/weight plus borrowed-in, outbound-loan, usage, and history markup
  - `src-tauri/companion_browser/shell_chrome.js` now owns shared trusted-LAN session/topbar/root-nav/selected-context/detail-modal shell rendering
  - `src-tauri/companion_browser/storage_shell.js` now owns the Storage root rendering
  - `src-tauri/companion_browser/loans_shell.js` now owns the Loans root rendering
  - `src-tauri/companion_browser/printers_shell.js` now owns the Printers root rendering for roster/board shell chrome
  - `src-tauri/companion_browser/settings_shell.js` now owns the Settings root rendering
  - shared recovery/filter/selection guard logic now lives in `src-tauri/companion_browser/companion_logic.js`
  - session/bootstrap reset state now lives in `src-tauri/companion_browser/session_state.js`
  - shared browser formatting helpers now live in `src-tauri/companion_browser/formatters.js`
  - companion runtime snapshots now publish canonical `shell_url` and `launch_url`, so the desktop launch surface can use runtime-owned companion links instead of rebuilding them in UI code
  - the desktop Browser access status path now also runs a narrow runtime health probe before presenting the companion as reachable, which improves confidence without widening the browser API
  - the Settings companion launch surface now has focused automation for launch-model state and clipboard fallback behavior, which substantially reduces the old manual-only uncertainty around the desktop launch tab
  - node-level regression tests now cover recovery anchoring, recovery fallback selection, write guardrails, hero loading labels, disconnect/session reset behavior, session reauth retry/CSRF refresh behavior, selected-spool detail rendering behavior, and the Storage/Loans/Printers/Settings shell render modules
  - a same-machine QA harness now runs the real localhost shell against a copied SQLite snapshot through headless local Chrome, including forced session expiry/recovery, a forced stale detail-load race, the reworked four-tab root navigation, the Settings tab, and the modal detail flow on wide and phone layouts
  - the desktop React shell now lazy-loads page modules from `ui/src/App.tsx`, which removes the old Vite chunk-size warning and keeps the later UI-cleanup pass from starting with an oversized entry chunk
  - the first focused UI cleanup pass has now started on the stable shell, tightening topbar density, selected-context width use, sticky modal detail chrome, and phone nav/panel spacing without widening the workflow surface
  - the first focused UI cleanup density batch has now landed on top of that shell:
    - Storage spool rows now use a clearer title/meta/weight hierarchy with less pill clutter
    - the in-app detail modal now uses a denser summary block, fewer primary metric cards, and clearer main-column vs side-column rhythm
    - tablet/desktop detail side content now stays sticky, and phone alignment wastes less vertical space
  - the second focused UI cleanup density batch has now landed too:
    - shared shell chrome now gives the active flow and selected spool clearer hierarchy with less wasted action space
    - the Printers root now uses denser roster summaries and a tighter active-board summary
    - the Settings root now uses a compact local-session strip plus tighter scope blocks instead of loose explainer cards
  - the third focused UI cleanup continuity batch has now landed too:
    - the detail modal header now has a cleaner status/close rhythm, especially on phone
    - Storage and Loans now preserve selected-spool continuity more clearly when search or filters hide the active spool
    - loan-row action groupings are cleaner, with spool identity separated from the primary actions
  - the fourth focused UI cleanup breakpoint batch has now landed too:
    - the four root flows now share a more consistent header structure and shorter operational copy
    - tablet-sized layouts no longer inherit so many phone-style stacked action/button rules
    - iPad density is therefore better without reopening the shell architecture
  - the fifth focused UI cleanup consistency batch has now landed too:
    - shared banners, utility sheets, loan cards, settings blocks, printer cards, slot cards, info cards, and detail sections now use a more consistent content-card rhythm
    - the shell now feels more cohesive across the four roots without reopening workflow scope
  - the sixth focused UI cleanup compactness batch has now landed too:
    - shared header, banner, and detail-modal microcopy is shorter and tighter, which gives more of the first iPhone viewport to actual workflow UI
    - section-copy and header spacing is also tighter now, without reopening workflow scope or shell structure
  - the seventh browser UX batch has now landed too:
    - Storage now has an explicit borrowed-in registration sheet instead of only the older hidden helper, while owned stock intake remains desktop-first
    - the Settings tab now exposes explicit browser `Auto` / `Light` / `Dark` theme controls
    - card, banner, slot, and printer surfaces now use stronger swatch/printer tint language closer to the main desktop app
  - the eighth browser UX batch has now landed too:
    - Printers now keeps slot loading inside its own tab with a richer spool chooser, clearer open-slot CTAs, and a more guided “choose spool, then load here” flow
    - the browser shell now uses more human-friendly title/reference/status copy across Storage, Loans, Printers, and detail
    - `qa:companion-local` now covers the printer-side spool-picker path in both wide and phone layouts
  - the ninth shared-shell polish batch has now landed too:
    - topbar labels and actions are shorter on phone, the desktop rail is a bit lower-noise, and the selected-spool/detail-modal chrome now wastes less space
    - the phone bottom nav now hides inactive meta so the active tab gets more room without growing the control
    - the detail-modal header now behaves more like a compact task bar for touch use instead of a loose mini-page header
  - the tenth touch/usability batch has now landed too:
    - list rows, printer roster cards, root switches, phone nav, and loan filters now provide clearer tap feedback so the shell feels less desktop-hover biased on touch devices
    - phone action rows now stretch only real buttons, which keeps helper chips and form guidance compact instead of turning them into full-width blocks
    - phone loan filters now use a denser two-column layout, and iPad-sized Printers/detail layouts now use width more deliberately through tighter dense-list and modal-column balance
  - the eleventh usability/QA batch has now landed too:
    - the add-filament sheet is a bit lighter and cleaner on phone, especially around the preview card and close action
    - detail timeline sections now read more humanly and behave more clearly as collapsible mobile sections inside the modal
    - the localhost QA harness now uses the current add-filament selectors and also includes a tablet-sized pass alongside the existing wide and phone runs
  - the twelfth root-flow usability batch has now landed too:
    - the Printers root now keeps slot-loading guidance more focused, with a clearer in-tab chooser banner and less duplicated selected-spool metadata around the active board
    - the Loans root now uses shorter filter-recovery language, so hidden-selection recovery and `active / returned` filtering read more like direct operational UI on touch devices
  - the thirteenth printer-board cleanup batch has now landed too:
    - slot cards now use a simpler subtitle/meta structure, which makes open-slot vs loaded-slot reading faster without changing the slot actions
    - long slot references now truncate inside the card instead of bleeding through the active board layout
  - the fourteenth modal/sheet usability batch has now landed too:
    - detail forms now use clearer action blocks with short support lines instead of button-plus-chip footers
    - the add-filament sheet now uses the same action pattern, which makes the modal/sheet surfaces feel more consistent on touch devices
  - the fifteenth shell-chrome compactness batch has now landed too:
    - the topbar and selected-spool strip now use shorter phone summaries and less duplicated state text
    - the phone shell packs those actions into tighter two-column rows and truncates long selected-spool titles more cleanly
  - the sixteenth printers-fix batch has now landed too:
    - open printer slots now launch a direct `Choose filament` flow for that exact slot, and the storage spool list can assign straight into the targeted slot
    - shared theme tokens now fix the white-on-white primary-button issue in dark mode and improve disabled-button contrast
  - the twenty-first loans-density cleanup batch has now landed too:
    - the Loans root now uses shorter hidden-selection/header copy, a denser four-field metadata grid per row, and simpler action labels so the list reads faster on touch devices
    - the old reference-chip footer row is gone, and the loan-card/filter/return-sheet spacing is tighter, which reduces repeated chrome without changing outbound-loan behavior
  - the twenty-second printers-workspace cleanup batch has now landed too:
    - the largest remaining Printers render hotspot now lives in `printer_workspace.js`, which pulls chooser, slot-card, slot-label, and board-callout rendering out of `printers_shell.js`
    - the active Printers board now hides the slot-action banner whenever the chooser is already open, which removes a duplicated stacked surface and makes the root read less like overlapping guidance cards
  - the twenty-third shared chrome/detail compaction batch has now landed too:
    - the phone topbar and selected-spool strip now drop extra kicker/summary chrome, and the hidden-selection banners in Storage and Loans now use shorter recovery wording so more of the first viewport goes to active work
    - the detail modal now uses lighter phone header chrome, a shorter summary-meta line, and tighter QR/status/loan helper copy so the modal feels more like a compact task surface than a stacked form page
    - `app.css` now tightens topbar/selected-context/detail spacing again and lets the phone detail modal use a bit more height, while smoke plus same-machine localhost QA still pass on wide, tablet, and phone layouts
  - the twenty-fourth root-specific device polish batch has now landed too:
    - the Printers root now uses shorter header, chooser, and board-callout copy, which gets the active board to slot work faster without reopening the workflow model
    - Storage/Loans hidden-selection recovery banners now use denser phone action layout instead of fully stacked recovery buttons, utility-sheet close actions stay compact on phone, and the phone printer roster now scrolls with snap-friendly cards
    - same-machine localhost QA still passes on wide, tablet, and phone layouts after this batch, but recent real screenshots still show that the shell feels visually busy and less human-friendly than the main desktop app
  - the twenty-fifth light-mode parity and locale-foundation batch has now landed too:
    - Loans and loaded printer-slot cards now inherit filament color treatment the same way as Storage, including fallback swatch inference when companion rows do not carry an explicit hex color
    - success status lines such as `Printer slot assigned.` now auto-expire after about 20 seconds instead of lingering as stale shell chrome
    - Settings now exposes `English / Norwegian`, and shared browser-shell/status/task/detail copy now has a real localization foundation instead of staying effectively single-language
  - the twenty-sixth phone chrome calmness batch has now landed too:
    - phone root headers now stay as quieter helper copy beneath the shared topbar instead of repeating another large title block, which gets `Storage`, `Loans`, `Printers`, and `Settings` to actual controls faster on iPhone
    - the phone detail modal now keeps status pills full-width while the close affordance stays compact and quieter, so the header reads more like light utility chrome than a second action bar
    - `src-tauri/companion_browser/app_css.test.mjs`, `npm run test:companion`, and `npm run smoke` now preserve that calmer phone baseline
  - the twenty-seventh first-viewport cleanup batch has now landed too:
    - the shared root topbar no longer exposes refresh, so `Refresh companion data` now lives only in `Settings` → `Connection` instead of repeating across every root
    - phone root headers are now fully suppressed beneath the shared topbar, which gets straight to search, filters, printer selection, and settings cards faster on iPhone
    - `src-tauri/companion_browser/shell_chrome.test.mjs`, `src-tauri/companion_browser/app_css.test.mjs`, `npm run test:companion`, and `npm run smoke` preserve that slimmer first-viewport baseline
  - the twenty-eighth task-sheet recovery batch has now landed too:
    - phone task sheets now open from the top of the viewport and keep their own internal scroll area, so borrowed-in registration, `QR`, `Return`, and `Load filament` no longer feel trapped off-screen or detached at the bottom
    - the same batch also removes the leftover Rust dev warnings by making the older QA/outbound helper methods test-only instead of dead production code
    - `cargo check --no-default-features`, `npm run test:companion`, and `npm run smoke` preserve that popup and compile baseline

## Phase-1 Exit Notes
- The browser companion now covers enough operational surface for a real same-machine alpha pass
- The main risk is no longer missing one more narrow write route; it is confidence, maintainability, and validation
- Pairing, renewal, revoke, revoke-all, and paired-browser list refresh are behaving as intended in the current trusted-LAN baseline
- Still to fix before Phase 1 should be considered stable:
  - keep any short manual desktop-launched Settings sanity pass as optional release-confidence work, not as the main blocker
  - capture and batch-fix the highest-signal issues from scripted localhost QA or future real-machine QA instead of continuing speculative one-off polish
  - the remaining browser-shell maintainability seam is now mostly the small startup/bootstrap/layout block still left in `src-tauri/companion_browser/app.js`
  - keep hardening the new app-shell IA around iPhone/iPad/desktop behavior instead of widening the browser workflow surface
  - keep the new `Storage` / `Loans` / `Printers` / `Settings` root model and modal-detail model stable across iPhone, iPad, and desktop instead of letting the shell drift back into ad hoc layout branches
  - keep the launch/bootstrap path anchored to the new runtime-owned `shell_url` / `launch_url` fields and the modular session/API client instead of reintroducing duplicated URL/session logic
  - validate the new desktop-served companion asset structure in real same-machine use before making further hosting changes
  - expand the new targeted regression coverage only where QA exposes real bootstrap/session or detail/recovery continuity failures
  - treat the current visual/human-factors debt as real product debt: the shell is operational, but it still reads as too busy and too tool-ish in places, especially around Printers, modal detail, and some form/popup surfaces
- Current implementation guidance:
  - do not widen the browser write surface again by default
  - do not spend new threads on recovery-only micro-tweaks unless a real reproduced issue justifies them
  - prefer one larger Step 2 batch that improves confidence and pace
  - the best next active move is now a UI-only simplification/rewrite pass informed by real iPhone/iPad review and the ugliest live-device issues
  - keep Rust, Tauri command, auth/session, and trusted-LAN service behavior out of that thread unless a real UI blocker cannot be solved without them
  - that rewrite should focus on making the webapp much more human-friendly: simpler hierarchy, calmer surfaces, richer but clearer filament selection, and popup/forms that feel like compact operational tools instead of stacked admin panels
  - the next likely cleanup targets are the add-filament/QR utility sheets, the inline loan-return surface, remaining printer-slot board overflow, and any root-specific spacing/touch issues that the new wide/tablet/phone QA baseline still does not catch
  - the next likely product-quality target after this batch is completing locale/copy coverage across the remaining detail/form surfaces before another screenshot-led device review
  - if screenshot capture tooling is flaky in this environment, prefer manual device review or temporary local capture over committing half-working helpers to the repo
  - only do one more `app.js` extraction if the remaining startup/bootstrap/layout block actually becomes noisy
  - use `WEBAPP_UI_ONLY_PROMPT.md` when starting a thread that should stay purely on webapp/browser-shell UI work

## API / Service Direction

### Service boundary first
- Introduce an explicit application service layer before adding a larger browser API surface
- Do not mirror every Tauri command one-for-one into browser routes
- Keep Tauri commands and HTTP handlers thin wrappers over the same Rust services

Suggested service split:
- `InventoryService`
- `LoanService`
- `PrinterService`
- `CatalogService`
- `StatisticsService`
- `CompanionAuthService`

### API shape
- Use versioned JSON routes such as `/api/v1/...`
- Prefer resource-style reads and workflow-style writes
- Keep browser endpoints intentionally smaller and safer than the full desktop command surface

Suggested browser-safe read surface:
- inventory list/detail
- loan list/detail
- printer overview/slot state
- catalog search/read
- dashboard/statistics summary

Suggested browser-safe write surface:
- create spool
- create borrowed-in spool
- lend spool out
- return outbound loan
- hand back inbound borrowed-in spool
- update spool weight
- assign spool to printer slot
- clear printer slot

Keep desktop-only for now:
- catalog refresh/import
- full backup/import/export
- reset/maintenance
- label-print side effects

## Local Auth / Session Strategy

### Phase-1 auth model
- `localhost` only first
- Browser app and API should be served from the same local origin when possible
- Use a one-time bootstrap or pairing code generated by the desktop app
- Exchange that code for:
  - an HttpOnly session cookie
  - a CSRF token for mutating requests
- Validate `Origin` / `Host`
- Do not allow wildcard CORS
- Current implementation note:
  - the desktop app now exposes a loopback API that uses a bootstrap exchange to mint a local browser session
  - bootstrap is still desktop-mediated and intentionally narrow; it is not a LAN or remote auth model

### LAN later, not now
- Optional LAN access can come after the local browser flow is stable
- LAN mode should be explicit opt-in, not a silent default
- LAN mode should use per-device approval or pairing and revocable device records

### Important implementation note
- The current lightweight mobile API should be treated only as a seed/example transport, not as the final browser architecture
- Do not carry forward:
  - open `0.0.0.0` binding by default
  - wildcard CORS
  - unauthenticated write routes

## Recommended Strategy

### Phase 1: Confirm and preserve the desktop/domain model
- Keep the desktop app and SQLite database as the source of truth
- Add support for:
  - outbound loans
  - inbound borrowed filament
  - ownership/source tracking
  - clearer inventory state accounting

### Phase 2: Extract an internal service/API layer
- Status: started
- A first narrow service boundary is now in place for:
  - inventory spool listing
  - printer overview
  - outbound loan history reads
  - active outbound-loan listing
  - manual spool creation
  - spool detail
  - narrow status/location editing
  - manual weight update
  - browser-safe printer-slot assignment/clear for the selected spool
  - selected-spool outbound loan creation
  - outbound loan return
- Continue by:
  - broadening the service boundary only where the browser shell actually needs it
  - keeping the session/bootstrap surface small while the first browser shell is added

### Historical Phase 3: Localhost browser alpha
- Desktop app hosts the companion browser UI/API locally
- Start with same-machine browser access only
- Initial browser slice should focus on:
  - inventory lookup
  - QR lookup/edit
  - manual borrowed-in registration
  - borrowed-in owner/contact/note editing
  - borrowed-in hand-back
  - printer overview
  - outbound loan review/history with direct return for active loans
  - basic printer-slot assignment/clear
  - spool detail with active-loan visibility
  - narrow status/location editing
  - selected-spool outbound loan creation
  - manual weight update
- Keep the workflow surface intentionally narrow until auth/session and browser UX feel solid
- Status:
  - the local API transport now exists
  - a first browser shell now exists at `/companion`
  - the desktop app now exposes the first launch/bootstrap UX from a dedicated Settings companion tab
  - the browser shell now has a first touch-friendly narrow-width mode
  - the browser shell now also supports outbound loan history via `GET /api/v1/loans`
  - the browser shell now also supports an active outbound-loan overview backed by `GET /api/v1/loans/active`
  - the browser shell now also supports manual borrowed-in registration from the inventory section via `POST /api/v1/spools/borrowed-in`
  - the browser shell now also supports QR lookup from the inventory section via `GET /api/v1/spools/by-qr`
  - the browser shell now also supports QR save/edit from spool detail via `POST /api/v1/spools/:spool_id/qr`
  - the browser shell now also supports borrowed-in owner/contact/note editing from spool detail via `POST /api/v1/spools/:spool_id/borrowed-in`
  - the browser shell now also supports borrowed-in hand-back from spool detail via `POST /api/v1/loans/:loan_id/hand-back`
  - the browser shell now also supports narrow status/location editing from spool detail via `POST /api/v1/spools/:spool_id/details`, while loaned-out and loaded spools still stay on their existing dedicated flows
  - the browser shell now also supports basic printer-slot assignment/clear for the selected spool
  - the browser shell now also supports direct outbound-loan return from the history surface via the existing return route
  - the browser shell now also supports selected-spool outbound loan creation from spool detail
  - the old blank-startup failure caused by an unserved `companion_i18n.js` asset in the embedded host is now fixed
  - low-content desktop/tablet pages no longer sag under a stretched shell grid, and loaded printer-slot cards now keep the same swatch-surface language as Storage and Loans
  - trusted-LAN pairing access is now the stable baseline for the browser companion
  - the next major step is not more browser workflow expansion; it is real-device LAN validation and polish on top of that trusted-LAN baseline

### Step 2 Close-Out
- Treat the current trusted-LAN companion as the stable browser baseline
- Keep the current browser write/read surface frozen unless QA exposes a real bug or missing operational blocker
- Keep `npm run smoke` green before starting broader network-scope changes
- Do not spend the next phase on more speculative browser UX expansion

### Step 3: Trusted-LAN Access With Appropriate Security
- Status:
  - browser access from other devices on the same trusted LAN is now implemented without changing the desktop-owned source-of-truth model
  - LAN mode stays explicit opt-in and default off
  - the old localhost product path has since been retired, so trusted-LAN is now the only supported browser access mode
  - pairing/auth for human browsers stays separate from any future hardware/device-ingestion auth
  - the desktop app owns LAN enable/disable, pairing-link creation, paired-browser listing, and revocation
  - the LAN listener binds only to one explicitly selected private interface/address and port instead of blindly opening `0.0.0.0`
  - trusted-LAN browsers now use single-use pairing links, revocable paired-browser records, shorter-lived session cookies, longer-lived device-cookie renewal, exact `Origin` / `Host` validation, `HttpOnly` cookies, and CSRF protections
  - Step 3 still secures access, not traffic: the UI/docs explicitly say that trusted-LAN traffic is not encrypted
- Remaining follow-through:
  - keep the Step 3 contract in `docs/STEP3_TRUSTED_LAN_PLAN.md`
  - validate the trusted-LAN flow on real iPhone/iPad/desktop browsers over a real LAN
  - decide whether pairing handoff should later add QR display and whether Settings should ever offer an advanced all-interfaces mode

### Phase 5: Expand Local Browser Workflows Only If Localhost + Trusted-LAN Stay Solid
- Reassess whether additional browser-safe write scope is actually needed after localhost + trusted-LAN are stable
- Keep catalog refresh/import/export/reset desktop-first unless real use proves otherwise

### Phase 6: Reassess remote/server needs
- Only after the local-first browser workflow is stable and useful
- If real usage proves it necessary, the service layer can become the bridge toward a dedicated backend later

## Browser / Device Expectations
- Safari on iPhone and iPad must be treated as a first-class target
- Chrome/Edge/Safari on desktop should be supported
- Touch-first interactions should be considered for:
  - inventory browsing
  - printer slot assignment
  - loan registration
  - quick stock updates

## Security Considerations
- No unauthenticated write access
- Prefer explicit bootstrap/pairing into a real session
- Keep localhost as the stable baseline
- Keep trusted-LAN as an explicit opt-in capability
- Keep CORS/network exposure tightly controlled
- Separate human browser sessions from hardware/device ingestion paths if both exist
- For Step 3, use the narrower trusted-LAN claim: access is secured through pairing, revocation, sessions, host/origin checks, and CSRF, while traffic remains unencrypted over HTTP
- The UI and docs must say this bluntly: trusted LAN only, traffic is not encrypted

## Product Direction
Treat the web app as an operational companion focused on:
- quick stock updates
- loan handling
- printer slot operations
- inventory lookup

Keep catalog refresh/maintenance as desktop/settings-first unless usage proves otherwise.

## Risks / Tradeoffs
- The desktop app must be running for browser access in the first local-first architecture
- Starting with localhost-only is the safest option, but it does not yet solve true phone/tablet-on-LAN access
- Reusing the same React app is efficient, but a browser/mobile shell will still need touch-first layout decisions instead of a straight desktop copy
- SQLite remains fine for the first phase, but connection behavior and contention should be hardened before increasing concurrent browser traffic
- Reusing the current permissive mobile API design directly would create avoidable security risk

## Smallest Safe Implementation Phase
Now implemented:
- service-layer extraction in Rust for the first browser-facing slice
- a loopback-only authenticated companion server
- the first same-machine browser-safe API routes for:
  - inventory overview/listing
  - manual borrowed-in registration
  - printer overview
  - outbound loan review/history with direct return for active loans
  - basic printer-slot assignment/clear
  - spool detail with active-loan visibility
  - narrow status/location editing
  - selected-spool outbound loan creation
  - manual weight update

Recommended next phase:
- freeze the current localhost + trusted-LAN workflow surface as the stable baseline
- update docs to reflect that Step 3 is now implemented and that the next major step is real-device validation, not broader browser-scope growth
- validate the trusted-LAN flow on real devices and real networks before changing the security or workflow model again
- keep broader workflow expansion deferred until the same-machine plus trusted-LAN model feels solid

Why this phase first:
- It validates the transport and session model early
- It keeps write-side complexity small
- It avoids committing to LAN/mobile pairing before the local browser experience is stable

## Best New-Thread Prompt
Use something like:

> Continue work on `/Users/bliatun/Documents/Codex/bambu-filament-manager`.
> Read:
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/README_DEV.md`
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/DEVELOPER_BRIEF.md`
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/SESSION_STATE.md`
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/WEBAPP_BRIEF.md`
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/DOMAIN_MODEL_EXPANSION.md`
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/docs/STEP3_TRUSTED_LAN_PLAN.md`
> The localhost browser companion and the first trusted-LAN implementation are now in place.
> Continue with the next webapp follow-up phase:
> - keep SQLite desktop-owned and keep localhost mode fully supported
> - do not widen browser workflow scope
> - validate trusted-LAN behavior on real iPhone/iPad/desktop browsers over a real LAN
> - keep the product claim narrow: secure access, not encrypted traffic
> - update docs and any QA-driven rough edges without reopening the security model or turning LAN into a blind all-interfaces listener
