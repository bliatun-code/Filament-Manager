# Filament Manager v0.9.1

Release date: 2026-04-13

## Highlights
- First stable release after the `v0.9.0-rc.*` device-parity cycle
- Desktop host/client flows and trusted-LAN browser flows are now aligned enough to share the same daily-use baseline
- Browser companion now feels much closer to the desktop app across `Storage`, `Printers`, `Loans`, and spool detail/task-sheet workflows

## Desktop Host/Client Baseline
- paired desktop client now behaves more honestly when host pairing is invalid, including localized `re-pair required` states
- dashboard no longer thrashes host-backed refreshes on every resize in paired-client mode
- inventory pages prioritize active auth/renewal errors over generic client-info banners
- role-change dialogs and paired-status surfaces are calmer, more consistent, and easier to trust during sync-related admin work

## Trusted-LAN Browser Parity
- browser `Printers` now uses weigh-in / weigh-out flows for slot loading, slot clearing, and printer-linked usage
- browser `Loans` now owns loan create / return / hand-back with measured total weight semantics aligned to desktop rules
- browser spool detail once again supports status/location edits, with `Details` and `History` staying stable across rerenders
- browser Add Filament / Add Spool flow is visually closer to the desktop intake modal and calmer across desktop, tablet, and narrow mobile widths
- browser lists and pickers now sort, filter, and label spools/printer slots more like the desktop product

## Mobile And Large-Screen Browser Polish
- narrow mobile `Storage` keeps weight and status aligned to the right for more even card heights
- large-screen browser `Printers` no longer wastes a full selection column when only one printer exists
- add-flow sheets, pickers, and detail popups now use calmer spacing, less duplicate copy, and more consistent action hierarchy

## Validation
- `npm run smoke` PASS on macOS
- `cargo check --manifest-path src-tauri/Cargo.toml` PASS
- `node scripts/run-companion-tests.mjs` PASS
- desktop host/client QA PASS
- trusted-LAN browser QA PASS on:
  - iPhone
  - iPad
  - desktop browsers

## Remaining Product Boundaries
- single-host library model only
- no multi-master sync
- no offline write queue
- no automatic host failover

## Next Focus
- treat `v0.9.1` as the new stable baseline
- fix forward only if real post-release regressions appear
- keep the next batch focused on incremental browser/desktop polish rather than parity catch-up
