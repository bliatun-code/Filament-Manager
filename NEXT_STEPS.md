# Next Steps

Historical notes below still mention the old localhost browser companion, `qa:companion-local`, and older browser wording like `Inventory` / `Add filament` where they describe earlier landed work. The current browser baseline is trusted-LAN-only, with `Storage` as the browser label for desktop `Inventory` / `Lager` and `Add spool` as the browser intake action.

## v0.10.1 AMS Slot Logic Follow-up (2026-04-16)
- Release status:
  - stable follow-up patch after `v0.10.0`
  - intended to lock in stricter AMS-slot replacement behavior and manual-clear authority
  - version bump, commit, and tag push are complete for `v0.10.1`
  - GitHub release is published
  - host/client batch 1 is complete: host derives unknown-RFID override context and manual-clear cache suppression on protected slot writes
  - host/client batch 2 is complete: paired client receives minimal live slot/RFID snapshot data from the host
- Validation baseline:
  - `npm run build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml bambu_live -- --nocapture` ✅
  - `npm run smoke` ✅
- Release note focus:
  - unknown RFID replacement clears only on strong `tray_uuid` + color evidence
  - manual RFID override stays protected while the same unknown identity remains present
  - manually emptied AMS slots stay empty until newer MQTT tray data arrives
- Next client/host polish focus:
  - validate paired-client printer UI across `LIVE`, `CACHED`, and `OFFLINE` host states
  - decide whether paired client needs any extra visual distinction for host-driven `In use` vs passive live identity badges

## v0.9.2 Stable Import + Browser Polish (2026-04-14)
- Release target:
  - stable follow-up patch after `v0.9.1`
  - intended to lock in the quieter browser polish pass plus safer vendor-import behavior
- Planned release actions:
  - bump app/package/Tauri versions to `0.9.2`
  - publish GitHub release with browser polish + catalog import notes
  - attach refreshed macOS DMG and Windows MSI assets
- Validation baseline:
  - desktop host/client baseline still PASS from `0.9.1`
  - trusted-LAN browser polish PASS
  - eSUN catalog import PASS
  - Bambu catalog import PASS
  - technical preflight before tagging:
    - `npm run smoke`
    - `cargo check --manifest-path src-tauri/Cargo.toml`

## v0.10.0 Bambu Live + RFID Stable Release (2026-04-15)
- Release target:
  - next stable release after `v0.9.2`
  - intended to package the Bambu live-status / RFID work, diagnostics tooling, and slot-status refactor
- Planned release actions:
  - bump app/package/Tauri versions to `0.10.0`
  - publish GitHub release with Bambu live + RFID notes
  - attach refreshed macOS DMG and Windows MSI assets
- Validation baseline:
  - `cargo check`
  - `npm run build`
  - optional fuller preflight before tagging:
    - `npm run smoke`
- Release note focus:
  - opt-in Bambu live printer support
  - AMS/RFID capture and save flow
  - diagnostics capture/export improvements
  - `ASSIGNED` slot-state refactor plus live `I bruk` badge behavior

## v0.9.0-rc.7 Snapshot Hotfix RC (2026-04-12)
- Release target:
  - completed as the host hotfix RC that repaired the active-loan snapshot regression
  - superseded by `v0.9.0-rc.8` for continued paired desktop/client QA

## v0.9.0-rc.8 Sync Polish RC (2026-04-12)
- Release target:
  - next pre-release candidate after `rc.7`, focused on paired desktop/client status polish and dashboard behavior
  - intended to keep two-machine QC moving from the repaired host baseline without carrying misleading pairing state in the UI
- Planned release actions:
  - bump app/package/Tauri versions to `0.9.0-rc.8`
  - publish GitHub pre-release with short pairing/dashboard polish notes
  - attach refreshed macOS DMG and Windows MSI assets for manual host/client testing
- RC validation focus:
  - confirm dashboard pairing-warning pill stays yellow and localized when host is reachable but pairing is invalid
  - confirm `Settings` auto-refreshes paired status without manual `Sjekk vert / Check host`
  - confirm `Forny paring / Renew pairing` flow works cleanly from the invalid-pairing state
  - confirm inventory side/page banners prioritize active auth errors over generic client-info banners
  - confirm `Oversikt` resize remains smooth in paired-client mode after removing resize-triggered refreshes
  - technical preflight required before tagging:
    - `npm run smoke`
    - `cargo check --manifest-path src-tauri/Cargo.toml`

## v0.9.0-rc.7 Snapshot Hotfix RC (2026-04-12)
- Release target:
  - fast-follow pre-release candidate to repair the host snapshot regression found immediately after `rc.6`
  - intended to refresh the Windows host before continued client QA
- Planned release actions:
  - bump app/package/Tauri versions to `0.9.0-rc.7`
  - publish GitHub pre-release with a short host-hotfix note
  - attach refreshed macOS DMG and Windows MSI assets for manual testing
- RC validation focus:
  - confirm paired-client `Sjekk vert / Check host` snapshot fetch succeeds again
  - confirm paired-client protected writes such as spool location update no longer fail through the host snapshot path
  - re-test the new statistics per-printer filament breakdown API from paired client against the refreshed host
  - continue two-machine QC from the updated host baseline and fix forward toward `v0.9.0`
  - technical preflight required before tagging:
    - `npm run smoke`
    - `cargo check --manifest-path src-tauri/Cargo.toml`

## v0.9.0-rc.6 Sync RC (2026-04-12)
- Release target:
  - next pre-release candidate for cross-device sync testing with updated Windows host coverage
  - intended for manual host/client QA before the final `v0.9.0`
- Planned release actions:
  - bump app/package/Tauri versions to `0.9.0-rc.6`
  - publish GitHub pre-release with sync RC notes
  - attach macOS DMG and Windows MSI assets for manual testing
- RC validation focus:
  - two-machine host/client QA using `docs/MULTI_DEVICE_SYNC_QA_CHECKLIST.md`
  - confirm live/cached/offline behavior plus protected writes
  - completed for current core surfaces:
    - `Oversikt / Dashboard`
    - `Lager / Inventory`
    - `Printere / Printers`
    - `Utlån / Loans`
    - `Statistikk / Statistics`
    - `Legg til filament / Add spool` popup in client mode
    - `Filament popup` in client mode
  - specific fixes now marked PASS in local QA:
    - paired client `Add printer` model selection
    - paired client `Refill / Reactivate roll`
    - printer reconfigure visibility (`1 AMS x 4`, `2 AMS x 8`, etc.)
    - loan-out weight semantics and calmer list styling
    - statistics popup naming/metadata cleanup
    - printer-slot dropdown spacing/metadata cleanup
  - verify with the refreshed Windows host build after `v0.9.0-rc.6`
  - re-test the new statistics per-printer filament breakdown API from paired client against the refreshed host
  - continue client work testing with the updated host baseline and fix any remaining operational regressions before `v0.9.0`
  - remaining non-code release risk from older notes:
    - manual macOS visual `NEEDS CHECK` items in `UI_RELEASE_CANDIDATE_CHECKLIST.md` still apply before broad rollout, but no blocker-level automated regression was reproduced in current preflight

## v0.8.4 Release Closeout (2026-04-09)
- Release baseline:
  - `v0.8.4` is published and now serves as the clean, version-consistent public release.
  - GitHub Release assets are uploaded and version-aligned:
    - `Filament.Manager_0.8.4_x64_en-US.msi`
    - `Filament.Manager_0.8.4_aarch64.dmg`
  - Windows preflight, Windows MSI packaging, Node 24 CI/runtime readiness, and release-pipeline validation are all landed.
  - Older `v0.8.3` has been marked as superseded.
- Next actions:
  - treat release work as complete unless a real release regression is reported
  - keep the next implementation batch scoped to new product work or targeted bug fixes only
  - if any post-release issue appears, fix forward from `v0.8.4` instead of rewriting older release tags

## Multi-Device Sync MVP Checkpoint (local WIP, 2026-04-10)
- Current local baseline:
  - role model per install: `Standalone / Host / Client`
  - persistent `library_id`
  - host validation + linking flow in `Settings`
  - desktop pairing for protected client writes
  - read-only + cached host-backed client views for `Dashboard`, `Inventory`, `Printers`, and `Loans`
  - protected client-to-host writes for daily actions:
    - `weight`, `tare`, `location/status`
    - `slot assignment`
    - `loan out`, `return/hand-back`
    - `add spool`
    - `wishlist create/status/delete/stock-now`
    - `printer create/update/delete`
  - controlled host handoff via backup/import + role switch
- Current MVP boundary after QA:
  - paired client supports full remote daily administration for:
    - dashboard/inventory/printers/loans/statistics reads
    - weight/tare/location/status updates
    - printer slot assignment
    - loan out / return / hand-back
    - add spool
    - wishlist admin
    - printer admin
  - still host-only:
    - broader maintenance/reset flows
    - catalog refresh/repair
    - backup/validation flows as routine client actions
    - multi-master/offline-write replication
- Next recommended work after checkpoint commit/push:
  - review `Settings` end-to-end for library roles + host webapp/trusted-LAN clarity
  - decide whether to cut a new RC after Settings polish or keep sync fixes in the current RC line

## v0.8.1 Release Readiness (2026-04-08)
- Release baseline:
  - inventory filter count now stays aligned between card/list views and is rendered in the material-filter row for better scan flow
  - dashboard ownership/on-hand counters are now based on real on-hand statuses (`IN_STOCK`, `IN_USE`) instead of mixed total snapshots
  - A4 inventory print now includes borrowed-in entries while keeping ownership context compact in the vendor line
  - Windows preflight/runtime/package hardening is now merged to `main`
  - Windows MSI now installs per-user without Administrator privileges for the default path
  - Windows CI now runs full `npm run smoke`
  - Windows Settings auto-theme copy is now platform-neutral
  - no new blocker-level cleanup debt found in this pre-release scan
  - `npm run smoke` passes.
- Release actions:
  - build and validate fresh macOS DMG for `0.8.1` locally
  - build and validate fresh Windows MSI from merged `main` before tagging
  - publish `v0.8.1` tag + GitHub release notes (without DMG upload)
  - keep next scope focused on targeted regression fixes only

## v0.6.1 Release Readiness (2026-04-06)
- Release baseline:
  - `main` is clean and currently includes trusted-LAN settings flow compactness, persisted companion toggle state, dashboard companion status indicator, and app version visibility in Settings.
  - no blocking cleanup debt found in preflight scan (`git status`, marker scan, and `cargo check` baseline).
- Release actions:
  - build and validate fresh macOS DMG for `0.6.1`
  - publish `v0.6.1` tag + GitHub release with DMG asset
  - keep post-release scope focused on regression fixes and remaining manual QA findings

## v0.8.0 Release Readiness (2026-04-07)
- Release baseline:
  - inventory/detail lifecycle updates are in place (`location edit`, `lost toggle`, `refill/reactivate`)
  - low-stock and inventory-all filters now match product rules (`1-200 g`, no empty/lost in low-stock, no empty in all)
  - loan/printer candidate restrictions are aligned with operational status constraints
  - requested QC scope is verified: `Dashboard`, `Inventory`, `Add filament popup`, `Loans`, `Loan out popup`, `inventory print`, `QR label print`
  - `npm run smoke` passes.
- Release actions:
  - build and validate fresh macOS DMG for `0.8.0`
  - publish `v0.8.0` tag + GitHub release with DMG asset
  - keep next scope focused on regression fixes and post-release UI fine-tuning only

## v0.1.0 Release Readiness (2026-04-05)
- Release baseline:
  - `npm run smoke` passes on current `main`
  - trusted-LAN reset now clears paired browsers/pairings
  - QR detail + label + A4 print flows are in place
- Remaining pre/post-release debt:
  - split oversized frontend `settings` chunk (>500 kB warning)
  - resolve 2 moderate GitHub Dependabot vulnerabilities
  - complete manual RC visual checks in:
    - `/Users/bliatun/Documents/Codex/bambu-filament-manager/UI_RELEASE_CANDIDATE_CHECKLIST.md`

## v0.1.1 Fast-Follow Hardening (2026-04-05)
- Baseline now landed:
  - `Settings` bundle hot path split with lazy-loaded QR/PDF helper imports
  - former `settings` >500 kB warning removed from production build baseline
  - dependency lockfiles refreshed (`root` + `ui`) within current semver ranges
  - `npm audit` currently reports zero vulnerabilities in both package roots
- Follow-up checklist:
  - verify GitHub Dependabot alerts directly in repo Security tab (token scope needed for API access)
  - if alerts remain open, patch and release `v0.1.1` with focused notes only
  - keep scope limited to hardening and regression fixes (no workflow redesign)
- Plan doc:
  - `/Users/bliatun/Documents/Codex/bambu-filament-manager/V0_1_1_HARDENING_PLAN.md`

## Current Direction
- Trusted-LAN is now the only supported browser-companion path.
- The desktop app plus SQLite remain the only source of truth.
- The old localhost browser companion, desktop launch/open/copy surface, and QA-only localhost harness are retired.
- The browser workflow surface stays mostly frozen unless real trusted-LAN QA exposes a blocker, with the current exception that browser `Add spool` now needs to stay aligned with the desktop intake model instead of falling back to a borrowed-in-only shortcut.
- Step 3 remains `appropriate security for a trusted LAN`: secure access, not encrypted traffic.
- Pairing, renewal, revoke, revoke-all, and paired-browser list refresh are behaving as intended in the current desktop + trusted-LAN baseline.
- The next active implementation track is webapp UI-only polish, starting with iPhone/small-screen simplification and calmer browser-shell hierarchy.
- Latest cleanup delta (2026-04-05):
  - Bambu catalog refresh now runs from in-app Rust lookup (no runtime `node/npm` subprocess dependency in packaged desktop path)
  - webapp recovery/detail fallback copy now follows active locale (`en`/`nb`) instead of hardcoded English
  - companion success status banners now auto-clear after `8s` by default to reduce stale UI noise
  - generated/printed QR flow is now canonicalized to spool-id references so scans resolve directly to companion detail popup
  - inventory A4 print now uses generated landscape PDF with controlled pagination/column layout instead of HTML print rendering
  - immediate technical debt after this landing:
    - no known blocker-level debt; prioritize manual trusted-LAN device QA and release regression checks

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
