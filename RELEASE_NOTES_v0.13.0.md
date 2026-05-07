# Filament Manager v0.13.0

Release date: 2026-05-07

## Highlights
- 109 commits since `v0.12.0`, covering stability fixes, dependency updates, release hygiene, and cleanup-oriented refactoring
- Paired client flows are more resilient when the host is unavailable, stale, or missing cached data
- App data reset, backup import, spool deletion, loan state, and printer slot cleanup paths have been hardened
- Dark-mode surfaces are restored after the Tailwind 4 dependency upgrade
- Release and CI checks now cover UI lint, Rust formatting, Rust tests, Clippy, companion tests, UI tests, build, and doctor

## User-Facing Fixes
- Fixed the client catalog search/filter hang when no catalog entries match
- Fixed app data reset failures caused by foreign-key ordering
- Fixed backup import rollback when foreign-key validation fails
- Fixed dark-mode color regressions in dashboard cards, page filters, settings, inventory, loans, and printer page headers
- Fixed browser companion pairing shell assets so pairing links no longer land on a blank page
- Fixed companion preferences, theme/media handling, and URL cleanup so blocked browser globals or cleanup errors do not break pairing
- Guarded overlapping refresh loops for printer, settings, trusted-LAN browser, and RFID capture polling

## Client / Host Stability
- Host read/write target resolution is now shared and trims base URL/library id consistently
- Client inventory, catalog, wishlist, printer, loan, statistics, settings, and spool-detail loading now use centralized host-target handling
- Client read paths keep cached fallback behavior for offline host states
- Host writes for spools, loans, printers, printer slots, and wishlist mutations use shared validation before dispatch
- Dashboard, settings, statistics, printer, wishlist, and inventory loaders are more centralized and easier to test

## Inventory, Loans, and Printer Safety
- Spool deletion now clears printer slot assignments and rejects deletion while active loans exist
- Deleted spools are hidden from active loan lists, usage summaries, active history, and UI actions
- Returned loans are kept inactive and loan CSV export avoids recursive calls
- Loaded printer slots preserve locked current location while home location can still update
- MQTT packet parsing rejects oversized remaining-length values
- Bambu live cleanup and slot assignment cache suppression are more explicit

## Refactoring and Cleanup
- Removed obsolete prototype modules, old copied UI sources, unused scanner/demo assets, unused logo concepts, and unused dependencies
- Extracted shared helpers for colors, dates, weights, RFID matching, inventory export, display titles, command errors, modal panel classes, QR artifacts, and data-source loading
- Centralized active-loan loading, loan-out candidates, settings snapshot refresh, trusted-LAN settings, spool lifecycle writes, printer writes, printer slot assignments, and timestamp parsing
- Kept internal working docs local through `.gitignore`

## Dependencies and Tooling
- Updated npm, Tauri, Rust, frontend, and related dependency lockfiles
- Split CI install steps and improved workflow cancellation behavior
- Auto-discovered UI tests through the shared Node test runner
- Added UI lint to `npm run smoke`
- Added Rust formatting enforcement to `npm run test:rust`

## Validation
- `npm run smoke` PASS
- `npm run test:rust` PASS
- `npm --prefix ./ui run build` PASS
- `git diff --check` PASS

## Notes
- `v0.13.0` is intended as the next clean checkpoint before further cleanup/optimization batches.
- GitHub `latest` remains the source of truth for downloadable DMG/MSI assets.
