# Filament Manager v0.14.0

Release date: 2026-05-13

## Highlights
- 23 commits since `v0.13.0`, focused on dependency compatibility, release hygiene, and behavior-preserving cleanup
- Runtime modules are now smaller and easier to maintain across companion API, trusted-LAN, library sync, catalog, printer, inventory, documents, and Bambu live flows
- Test coverage is split into targeted modules so future changes have clearer ownership and faster diagnosis
- Bambu live MQTT parsing and live slot/match/weight sync responsibilities are separated behind focused Rust modules

## Cleanup And Maintainability
- Extracted companion API asset registry, HTTP guards, error mapping, session handling, payload helpers, state helpers, models, and tests
- Extracted trusted-LAN commands, catalog commands, library sync commands, printer commands, inventory commands, and document commands from the main app runtime
- Extracted library sync host client helpers and models
- Extracted Bambu MQTT packet helpers and Bambu live sync/match helpers
- Split filament database, inventory engine, catalog lookup, app services, Bambu live, catalog command, and main runtime tests into sibling test modules

## Stability
- Library sync host/client request handling now has clearer boundaries for host HTTP, cookies, CSRF, and cached read/write behavior
- Bambu live sync now isolates tray match status, automatic slot clearing, exact RFID assignment, and live weight sync from MQTT polling
- Document, inventory, printer, catalog, trusted-LAN, and library-sync command surfaces are easier to audit without changing user-facing behavior

## Dependencies And Tooling
- Refreshed compatible Rust dependency lockfile entries after the `v0.13.0` release
- Kept direct npm dependencies current and audit-clean
- Release workflow remains tag-triggered and builds macOS DMG plus Windows MSI artifacts through GitHub Actions

## Validation
- `npm run test:rust` PASS
- `npm run smoke` PASS
- `git diff --check` PASS

## Technical Debt Notes
- The remaining large hotspots are `src/backend/filament_database.rs` and the large desktop page modules, especially Settings and Inventory.
- No broad Settings or Inventory rewrite is recommended before a concrete user-facing reason appears.
- Next cleanup should prefer one bounded backend boundary at a time, especially database repository/table grouping or a specific UI behavior hotspot.

## Notes
- `v0.14.0` is a cleanup checkpoint after the post-`v0.13.0` refactor batches.
- GitHub `latest` remains the source of truth for downloadable DMG/MSI assets.
