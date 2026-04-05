# Next Steps

Historical notes below still mention the old localhost browser companion, `qa:companion-local`, and older browser wording like `Inventory` / `Add filament` where they describe earlier landed work. The current browser baseline is trusted-LAN-only, with `Storage` as the browser label for desktop `Inventory` / `Lager` and `Add spool` as the browser intake action.

## Current Direction
- Trusted-LAN is now the only supported browser-companion path.
- The desktop app plus SQLite remain the only source of truth.
- The old localhost browser companion, desktop launch/open/copy surface, and QA-only localhost harness are retired.
- The browser workflow surface stays mostly frozen unless real trusted-LAN QA exposes a blocker, with the current exception that browser `Add spool` now needs to stay aligned with the desktop intake model instead of falling back to a borrowed-in-only shortcut.
- Step 3 remains `appropriate security for a trusted LAN`: secure access, not encrypted traffic.
- Pairing, renewal, revoke, revoke-all, and paired-browser list refresh are behaving as intended in the current desktop + trusted-LAN baseline.
- The next active implementation track is webapp UI-only polish, starting with iPhone/small-screen simplification and calmer browser-shell hierarchy.
- Latest cleanup delta (2026-04-05):
  - webapp recovery/detail fallback copy now follows active locale (`en`/`nb`) instead of hardcoded English
  - companion success status banners now auto-clear after `8s` by default to reduce stale UI noise
  - generated/printed QR flow is now canonicalized to spool-id references so scans resolve directly to companion detail popup
  - inventory A4 print now uses generated landscape PDF with controlled pagination/column layout instead of HTML print rendering
  - immediate technical debt after this landing:
    - split large `settings` frontend bundle (current production warning: >500 kB minified chunk)
    - resolve workspace Git-root mismatch before final branch/commit flow (`Codex` parent currently owns `.git`, project appears as one untracked directory)

## Next 10 Iterations
1. Run repeated trusted-LAN QA on real iPhone, iPad, and desktop browsers over a real LAN.
2. Keep active code changes focused on webapp UI-only polish, especially iPhone/small-screen hierarchy, density, touch rhythm, and modal/sheet calmness.
3. Confirm enable/disable plus selected-interface bind behavior on an actual private network.
4. Confirm pairing-link QR handoff, renewal, expiry, revoke, and revoke-all behavior on real devices.
5. Add or tighten trusted-LAN automation only if it validates the real supported path instead of recreating localhost-only scaffolding.
6. Keep `npm run smoke` green as the baseline browser-shell regression gate.
7. Keep the browser workflow scope frozen; treat further work as bug fixes or narrow polish only.
8. Keep the modular browser shell split as the baseline instead of regrowing `app.js`.
9. Keep trusted-LAN copy blunt and consistent: explicit opt-in, interface-bound, and traffic is not encrypted.
10. Keep human browser auth separate from any future device-ingestion routes, and only reassess all-interfaces mode, mDNS discovery, or broader browser workflow expansion after repeated trusted-LAN validation.
- Treat the latest browser add-spool restoration as the new baseline too:
  - Storage once again exposes a real browser `Add spool` flow instead of a borrowed-in-only shortcut
  - the trusted-LAN browser shell now supports Bambu/eSUN/manual source selection, vendor-backed or manual owned-stock entry, borrowed-in stock entry, wishlist add, wishlist status changes, and `Stock now` from the queue
  - the next UI passes should refine the calmness and touch rhythm of that sheet instead of narrowing the workflow again
- Treat the first UI cleanup batch as the new baseline:
  - Storage row density and detail-modal internals are now improved, so the next cleanup work should target the remaining visual rhythm gaps instead of reopening those structures
- Treat the second UI cleanup batch as the new baseline too:
  - shared shell hierarchy, Printers density, and Settings density are now improved, so the next cleanup work should center on modal action rhythm, loans/storage cross-flow polish, and final breakpoint balance
- Treat the third UI cleanup batch as the new baseline too:
  - modal header rhythm plus Storage/Loans hidden-selection continuity are now improved, so the next cleanup work should center on final breakpoint balance and broader visual consistency instead of shell flow friction
- Treat the fourth UI cleanup batch as the new baseline too:
  - root-header consistency and tablet breakpoint balance are now improved, so the next cleanup work should center on the last visual-consistency pass rather than responsive restructuring
- Treat the fifth UI cleanup batch as the new baseline too:
  - shared card rhythm is now much more consistent, so the next cleanup work should center on smaller design-led polish instead of broad shell-wide CSS normalization
- Treat the sixth UI cleanup batch as the new baseline too:
  - header, banner, and detail-modal microcopy is now shorter and tighter, so the next cleanup work should center on any QA-exposed root-specific polish instead of more shell-wide text/chrome compression
- Treat the seventh browser UX batch as the new baseline too:
  - Storage now has a stronger borrowed-in registration sheet, Settings now exposes `Auto / Light / Dark`, and the browser shell now uses stronger swatch/printer tint language closer to the desktop app
- Treat the eighth browser UX batch as the new baseline too:
  - Printers now has a more guided slot-loading flow with an in-tab spool chooser, clearer open-slot CTAs, and richer human-readable slot/loan/reference copy
  - `qa:companion-local` now exercises the printer-side spool-picker path in both wide and phone layouts instead of only the older cross-flow slot shortcut
- Treat the ninth shared-shell polish batch as the new baseline too:
  - topbar copy and action labels are now shorter on phone, the phone root nav wastes less space by hiding inactive meta, and the detail modal header now behaves more like a compact task bar
- Treat the tenth touch/usability batch as the new baseline too:
  - list rows, printer roster cards, root switches, phone nav, and loan filters now have clearer touch feedback instead of feeling hover-first
  - phone action rows now only stretch real buttons, so helper chips and inline guidance stop turning into clumsy full-width blocks
  - the phone loans filter now uses a denser two-column rhythm, and iPad-sized Printers/detail layouts now use width more deliberately instead of feeling like stretched phone UI
- Treat the eleventh browser usability batch as the new baseline too:
  - the localhost QA harness now uses the current add-filament selectors instead of the older borrowed-in-only form names, so that coverage matches the real browser shell again
  - `qa:companion-local` now also exercises a tablet-sized pass alongside wide and phone layouts, which makes iPad regressions more likely to show up before manual review
  - the add-filament sheet and detail modal internals now use lighter copy, clearer collapsible rhythm, and better phone spacing without reopening shell structure
- Treat the twelfth root-flow usability batch as the new baseline too:
  - the Printers root now uses less duplicated selected-spool context, clearer in-tab spool-picker guidance, and a simpler `Ready on <printer>` slot-loading banner instead of repeating the same selection metadata in multiple places
  - the Loans root now uses shorter, more human filter-recovery language such as `Clear filters`, which makes hidden-selection recovery and active/returned filtering feel less dense on phone and desktop
  - the current same-machine QA run still exits cleanly after this root-specific cleanup, so the next likely work is real-device polish instead of more cross-root copy churn
- Treat the thirteenth printer-board cleanup batch as the new baseline too:
  - slot cards now collapse repeated status/selection text into a simpler subtitle-plus-meta structure, so open and loaded slots read faster on phone and tablet
  - long slot references now truncate inside the card instead of bleeding across the layout, which makes the active board more stable under same-machine real data
  - the current same-machine QA run still exits cleanly after this board cleanup, so the next likely work is visual/touch polish rather than more slot-card content churn
- Treat the fourteenth modal/sheet usability batch as the new baseline too:
  - detail forms and the add-filament sheet now use clearer action blocks with one primary action plus one short support line instead of button-plus-chip footers
  - the detail popup therefore reads more like a touch workflow and less like a dense admin form, especially for weight, QR, status, loan, and borrowed-in actions
  - the current same-machine QA run still exits cleanly after this batch too, so the next likely work is root-specific touch/spacing polish rather than more footer-copy churn
- Treat the fifteenth shell-chrome compactness batch as the new baseline too:
  - the topbar now uses shorter same-machine/Desktop summaries on phone, so the active flow header spends more room on actual workflow context than ambient environment copy
  - the selected-spool strip now keeps placement/load state in shorter pills while the meta line stays focused on reference plus grams, which makes the strip easier to scan on phone and tablet
  - the current same-machine QA run still exits cleanly after this batch too, so the next likely work is root-specific field spacing and contrast polish rather than more shell-summary churn
- Treat the sixteenth printers-fix batch as the new baseline too:
  - open printer slots now expose a direct `Choose filament` path that opens the storage spool list for that exact slot, and choosing a row can assign straight into the targeted slot instead of forcing a disconnected picker-then-load flow
  - the localhost QA harness now follows that slot-first assignment flow, so the scripted wide/tablet/phone pass is exercising the real repaired interaction instead of the older printer picker path
  - shared primary/disabled button contrast is now corrected through theme tokens, which fixes the white-on-white primary-button failure in dark mode and improves disabled-button readability in light mode
- Treat the seventeenth printers-layout cleanup batch as the new baseline too:
  - the printer filament chooser now lives inside the active board only when it is actually needed, instead of sitting as a full-width top panel that repeats selected-spool context
  - printer slot labels now fall back to human `Slot <n>` naming when companion data only has long internal AMS ids, so the board no longer leaks raw machine identifiers into the main UI
  - the active slot board now caps desktop density more deliberately and allows slot meta to wrap like card content, which fixes the unreadable squeezed-card layout seen in same-machine real-data screenshots
  - the current same-machine QA run still exits cleanly after this board/layout cleanup, so the next likely work is real-device visual polish rather than another printer-flow rewrite
- Treat the eighteenth printers-density cleanup batch as the new baseline too:
  - the active printer board now uses compact stat chips instead of a full row of large metric cards, which gives the slot area more room on desktop and tablet
  - the roster cards now use tighter summary chips, and the active-load banner now speaks more honestly when a printer is already full instead of pretending there is still a load target
  - the current same-machine QA run still exits cleanly after this density pass, so the next likely work is device-level visual polish rather than more board-header restructuring
- Treat the nineteenth detail-density cleanup batch as the new baseline too:
  - the selected-spool strip now carries reference, grams, and current placement/load state in one tighter meta line instead of splitting that context across both the meta line and pills
  - the detail popup now uses a denser summary card with vendor-only subtitle, a shorter summary-meta line, and two primary weight metrics instead of spending a full metric card on duplicated reference text
  - helper copy inside weight, QR, status, and loan sections is now shorter, so the detail flow reaches editable controls faster on phone and tablet without losing meaning
  - the current same-machine QA run still exits cleanly after this detail/selected-context pass, so the next likely work is real-device spacing polish rather than another summary-structure rewrite
- Treat the twentieth storage-density cleanup batch as the new baseline too:
  - the Storage toolbar now uses a tighter search/action rhythm, and the QR/add utility sheets now read more like compact operational sheets instead of mini pages
  - add-filament preview/form spacing and the hidden-selection banner are both denser, which reduces stacked chrome before the actual spool list on phone and tablet
  - the current same-machine QA run still exits cleanly after this storage-sheet pass, so the next likely work is still device-level polish rather than another toolbar/sheet restructure
- Treat the twenty-first loans-density cleanup batch as the new baseline too:
  - the Loans root now uses shorter header/recovery copy, one denser metadata grid per row, and simpler action labels so the list reads more like a compact operational queue
  - the old reference-chip footer row is gone, and the return sheet now uses tighter action wording, which reduces repeated chrome on phone and tablet without changing loan behavior
  - the current same-machine QA run still exits cleanly after this loans pass, so the next likely work is still device-level polish rather than another Loans structure rewrite
- Treat the twenty-second printer-workspace cleanup batch as the new baseline too:
  - the Printers root now routes board, slot-card, and picker rendering through `printer_workspace.js`, which removes the largest remaining root-flow render hotspot from `printers_shell.js`
  - the active printer board no longer stacks the ready/load callout above the picker when the picker is already open, and the picker now uses a denser summary plus a scroll-bounded list, which cuts duplicated chrome in the noisiest root without widening workflow scope
  - the current same-machine QA run still exits cleanly after this printer-workspace pass, so the next likely work is still device-level polish rather than another printer-flow restructure
- Treat the twenty-second printers-workspace cleanup batch as the new baseline too:
  - the largest remaining Printers render hotspot is now split into `src-tauri/companion_browser/printer_workspace.js`, which pulls slot-label parsing, chooser rendering, slot cards, and board-callout composition out of `printers_shell.js`
  - the Printers board no longer stacks the chooser and the slot-action banner on top of each other while the filament picker is already open, which removes one of the loudest remaining visual-debt patterns without changing slot behavior
  - the current same-machine QA run still exits cleanly after this Printers batch, so the next likely work is still real-device polish or a deliberate next workflow step rather than more shell sprawl inside the Printers root
- Treat the twenty-third shared chrome/detail compaction batch as the new baseline too:
  - phone topbar and selected-spool chrome now drop extra kicker/summary clutter, and Storage/Loans hidden-selection banners now use shorter recovery wording plus lighter action labels
  - the detail modal now uses lighter header chrome, shorter summary/meta treatment, and tighter QR/status/loan helper copy so editable controls arrive faster on phone and tablet
  - `app.css` now compacts topbar/selected-context/detail spacing further and gives the phone detail modal a little more working height, while the same-machine QA run still exits cleanly on wide, tablet, and phone
- Treat the twenty-fourth root-specific device polish batch as the new baseline too:
  - Storage/Loans recovery banners now use a denser phone action pattern instead of turning every action into a full stacked column, which makes hidden-selection recovery feel more operational on iPhone
  - the Printers root now uses shorter header/chooser copy, a lighter picker summary, snap-friendly phone roster scrolling, and less stacked chooser chrome before slot work starts
  - the utility-sheet close action no longer takes a full phone row by default, while smoke plus same-machine localhost QA still pass on wide, tablet, and phone
  - recent same-machine screenshots still show the shell as visually busy in places, so the next real win should come from simplification/rewrite rather than another long chain of tiny CSS-only nudges
- Treat the twenty-fifth light-mode parity and locale-foundation batch as the new baseline too:
  - Loans and loaded printer-slot cards now inherit filament color treatment the same way as Storage, including fallback swatch inference when explicit hex values are missing
  - success status lines like `Printer slot assigned.` now auto-expire after about 20 seconds instead of lingering as stale shell chrome
  - Settings now exposes `English / Norwegian`, and shared browser-shell/status/task/detail copy now has a real localization foundation instead of staying effectively single-language
  - the current automated browser-shell suite plus `npm run smoke` still exit cleanly after this batch, so the next likely work is broader locale completion and live-device QA rather than another shell restructure
- Treat the twenty-sixth phone chrome calmness batch as the new baseline too:
  - phone root headers now sit as quieter helper copy beneath the shared topbar instead of repeating another large section title, which gives the first viewport more room for search, filters, roster, and settings controls
  - the phone detail modal close affordance is compact again while status pills keep the available width, so the header feels calmer without hiding useful context
  - `npm run test:companion` and `npm run smoke` still pass after this batch, so the next cleanup work should stay centered on remaining sheet/action hierarchy rather than reopening root-header duplication
- Treat the twenty-seventh first-viewport cleanup batch as the new baseline too:
  - shared root-level refresh is gone, and `Refresh companion data` now lives only in `Settings` → `Connection`, which removes one of the loudest repeated controls from the first phone viewport
  - phone root headers are now fully suppressed under the shared topbar, which lets `Storage`, `Loans`, `Printers`, and `Settings` start with real controls instead of another helper block
  - `npm run test:companion` and `npm run smoke` still pass after this batch, so the next cleanup work should focus on remaining sheet/action density instead of more topbar/header duplication
- Treat the twenty-eighth task-sheet recovery batch as the new baseline too:
  - longer phone task sheets now scroll internally instead of drifting off-screen, and shorter ones now open from the top of the viewport instead of reading like low detached bottom drawers
  - the Rust dev build is back to a clean warning-free state for these paths because the leftover QA/outbound compatibility helpers are now test-only
  - `cargo check --no-default-features`, `npm run test:companion`, and `npm run smoke` all pass after this batch, so the next cleanup work should move deeper into sheet/card hierarchy rather than basic popup behavior
- Treat the desktop runtime as the canonical source for companion shell/launch URLs and keep browser session/bootstrap transport logic outside the render file.
- Keep the Browser access status tied to a real runtime health probe so `Running` means reachable, not just internally marked running.
- Validate the new desktop-served companion asset structure under `/companion` while keeping SQLite and desktop behavior unchanged.
- Expand browser-side regression coverage only where trusted-LAN QA exposes real launch, recovery, or continuity failures.

## Now
- Treat Step 3 as landed:
  - the old localhost browser-companion surface is retired
  - trusted-LAN mode is default-off and desktop-controlled
  - the LAN listener binds only to an explicitly selected private interface/address and port
  - per-browser pairing, renewal, revocation, and the browser pairing gate are in place
  - pairing, renewal, revoke, revoke-all, and paired-browser list refresh are behaving as intended
  - the browser shell visuals are good enough to shift the active work back toward UI-only polish
- Update and keep the docs aligned:
  - `DEVELOPER_BRIEF.md`
  - `WEBAPP_BRIEF.md`
  - `NEXT_STEPS.md`
  - `SESSION_STATE.md`
  - `OPEN_QUESTIONS.md`
- Validate trusted-LAN behavior on real devices before making another product-direction change.
- Use `WEBAPP_UI_ONLY_PROMPT.md` when the next thread should stay strictly on browser-shell UI work.

## Next
- Validate the trusted-LAN implementation on real devices and real networks:
  - test the desktop Settings enable/disable flow against an actual LAN interface
  - test pairing-link handoff, renewal, and revoke behavior from paired trusted-LAN browsers
  - confirm the blunt `traffic is not encrypted` wording is clear enough in real use
- Keep the active implementation thread UI-only unless real-device QA exposes a backend/service blocker:
  - focus first on iPhone/small-screen browser-shell hierarchy, spacing, touch rhythm, and modal/sheet simplification
  - keep Rust, Tauri command, auth/session, and workflow-scope changes out of that thread by default
- Decide the next trusted-LAN product choices only after that validation:
  - whether to keep explicit-interface-only for the first release or later add an advanced all-interfaces mode
  - whether any broader browser workflow expansion is actually justified after trusted-LAN stays solid
- Treat the old UI polish backlog as the main implementation queue again, but keep it strictly UI-led unless QA proves otherwise.

## After That
- Reassess whether any broader browser workflow expansion is justified after trusted-LAN is stable in real use.
- Keep human browser auth separate from any future hardware/device-ingestion routes.
- Return to lower-priority UI consistency polish only after the LAN/security model is settled.

## Planning Track: Borrowed-In Filament + Web App
- Phase 1 groundwork is complete
  - ownership fields now exist on spools
  - direction/status/counterparty fields now exist on loans
  - current loan queries still intentionally behave as outbound-only
- Borrowed-in registration is now available from the add-filament flow
  - borrowed-in spools are labeled in inventory and excluded from outbound loan-out candidates
  - borrowed-in hand-back is now available from the direction-aware `Utlan` page
  - handed-back borrowed-in spools are currently hidden from active inventory via soft delete
- Ownership-aware filtering is now available in `Lager`
  - `All / Owned / Borrowed in` is a view-only filter for now
  - dashboard/statistics headline totals are still intentionally unchanged, but additive ownership snapshot panels now show the split
- Ownership-aware statistics drill-downs are now available in `Statistikk`
  - filament-consumption breakdowns now keep owned and borrowed-in usage separate
  - active loaded-slot details can now filter `All / Owned / Borrowed in`
- Direction-aware loan usage summaries are now available in `Statistikk`
  - outbound borrower usage and inbound owner/counterparty usage now live in separate panels
- Next borrowed-in implementation step
  - decide whether owner/contact/note editing belongs in the selected-spool surface or in a future dedicated edit flow
  - decide whether handed-back borrowed-in spools should later get a visible historical surface beyond loan/history views
- Next UI/model step
  - rename legacy outbound-only “borrowed” wording to “loaned out” where appropriate
  - keep polishing direction-aware labels and empty states in `Utlan`
- Next statistics step
  - decide whether the existing headline totals should stay combined or become owned-only in some surfaces
  - decide whether low-stock alerts and dashboard warning priority should treat borrowed-in stock differently from owned stock
  - decide whether the `Utlån` side-panel usage summary should also become direction-aware instead of staying outbound-oriented
- Webapp phase 1 groundwork is now implemented
  - a narrow shared Rust `CompanionService` now sits between adapters and the inventory/printer/spool-weight logic needed by the first browser slice
  - the desktop app now hosts the browser `/api/v1` companion API through the explicit trusted-LAN runtime, bound only to the selected interface and port
  - the first routes cover inventory spool listing, QR lookup, QR save/edit, printer overview, outbound loan review/history with direct return, manual borrowed-in registration, borrowed-in metadata edit, borrowed-in hand-back, spool detail with active-loan visibility, narrow status/location editing, manual weight update, browser-safe printer-slot assignment/clear, selected-spool outbound loan creation, and outbound loan return
  - browser auth now uses short-lived pairing links plus paired-browser renewal, with an HttpOnly session cookie and CSRF protection for mutating routes
  - the `/companion` browser shell now uses a mobile-first app shell with `Storage` / `Loans` / `Printers` / `Settings` as the primary roots
  - the desktop app now exposes trusted-LAN browser access, pairing, and paired-browser management from the dedicated Settings browser-access tab
  - Step 2 acceleration now has a first concrete batch in place:
    - browser shell state/recovery helpers live in `companion_logic.js`
    - browser pairing/session/renew transport now lives in `companion_api_client.js`
    - browser click-action dispatch now lives in `companion_click_router.js`
    - browser input/change dispatch now lives in `companion_input_router.js`
    - browser overview/detail/pairing orchestration now lives in `companion_data_controller.js`
    - browser shell-state and layout helpers now live in `companion_shell_state.js`
    - browser app-shell composition now lives in `companion_app_shell.js`
    - browser DOM event wiring now lives in `companion_dom_events.js`
    - browser runtime feedback/token helpers now live in `companion_runtime_state.js`
    - browser write and lookup helpers now live in `companion_mutations.js`
    - browser form-submit dispatch now lives in `companion_submit_router.js`
    - selected spool detail rendering now lives in `detail_content.js`
    - Storage root rendering now lives in `storage_shell.js`
    - Loans root rendering now lives in `loans_shell.js`
    - Printers root rendering now lives in `printers_shell.js`
    - Settings root rendering now lives in `settings_shell.js`
    - session/bootstrap reset state lives in `session_state.js`
    - formatting helpers live in `formatters.js`
    - Settings companion launch-model logic now lives in `ui/src/pages/settings_companion_model.ts`
    - clipboard fallback logic now lives in `ui/src/lib/clipboard.ts`
    - the desktop host serves those committed browser assets through `/companion/:asset`
    - companion status snapshots now include canonical `shell_url` and `launch_url`
    - `npm run smoke` now also runs node-level companion regression tests for recovery/session/detail rendering plus focused Settings companion launch/clipboard tests before `doctor`
    - `npm run qa:companion-local` now runs a same-machine browser QA harness against a copied local SQLite snapshot using the real localhost shell
- Next webapp implementation step
  - keep Phase-1 exit prep anchored to the scripted same-machine QA pass and the focused launch/clipboard/detail-render automation, then treat any shorter manual desktop-launched pass as final confidence work
  - use the new modular shell/test coverage as the base for any follow-up fixes instead of re-growing `app.js`
  - treat `companion_click_router.js` and `companion_shell_state.js` as the baseline for browser click routing and shell-state/layout behavior instead of moving those paths back into the render file
  - treat `companion_input_router.js` and `companion_data_controller.js` as the baseline for browser input routing and overview/detail/bootstrap orchestration instead of moving those paths back into the render file
  - treat `companion_dom_events.js` and `companion_runtime_state.js` as the baseline for browser DOM event wiring and runtime feedback/token state instead of moving those paths back into the render file
  - treat `companion_mutations.js` and `companion_submit_router.js` as the baseline for browser writes and submit handling instead of moving those paths back into the render file
  - keep the new root IA intact:
    - `Storage`, `Loans`, `Printers`, and `Settings` stay primary
    - detail stays in a built-in modal instead of becoming a peer top-level destination or persistent side pane again
  - if Step 2 hardening stays clean, treat the structural split as good enough and move into the later mobile/tablet/desktop UI cleanup pass; only revisit `app.js` again if the smaller bootstrap/layout startup seam starts getting noisy
  - if the current alpha is solid, only then decide whether the next larger browser workflow is actually justified
  - keep catalog refresh/import/export/reset desktop-only for now

## Validation
- Smoke:
  - `cd /Users/bliatun/Documents/Codex/bambu-filament-manager && npm run smoke`
- Dev app:
  - `cd /Users/bliatun/Documents/Codex/bambu-filament-manager && npm run tauri -- dev`
