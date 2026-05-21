# Filament Manager v0.15.0

Release date: 2026-05-21

## Highlights
- Bambu live printer tracking now records automatic filament usage from AMS weight changes when a print session provides enough context.
- Completed print detection is more tolerant of bursty MQTT data and near-finished carried snapshots, so successful jobs are less likely to be missed.
- AMS weight handling rejects implausible drops and filament increases instead of treating noisy measurements as real consumption.
- The inventory add flow no longer offers “stock roll now” for wishlist rows already marked as received.
- Dependency patch versions are refreshed across Tauri, Rust, Vite, PostCSS, TypeScript ESLint, and local tooling.

## Bambu Live And Printer Usage
- Added stronger session tracking around running, finished, cancelled, and preflight print states.
- Preserved usage across late AMS rebounds while avoiding duplicate consumption when a finished job is stale.
- Improved live diagnostic capture fields so future printer traces are easier to reason about.
- Added test coverage for AMS rebounds, noisy deltas, near-finished sessions, and repeated live updates.

## UI And Workflow Polish
- Kept wishlist/order actions aligned with item state so received rows are reference-only unless removed or moved back.
- Tightened inventory creation guards so stale callbacks cannot stock an already received wishlist row.
- Preserved the recent light/dark UI polish and inventory action layout fixes.

## Dependencies And Release Hygiene
- Updated compatible npm and Cargo dependencies after the OpenSSL security Dependabot update.
- Added a version consistency check across package metadata, Cargo, Tauri config, README, and roadmap release tags.
- `npm run verify` now includes the version guard through the contract checks.

## Validation
- `npm run verify` PASS
- `npm audit --omit=dev` PASS
- `npm --prefix ./ui audit --omit=dev` PASS
- `npm outdated` PASS
- `npm --prefix ./ui outdated` PASS
- `cargo update --dry-run --manifest-path src-tauri/Cargo.toml` PASS
- `git diff --check` PASS

## Notes
- GitHub `latest` remains the source of truth for downloadable DMG/MSI assets.
- The remaining RustSec warnings are transitive Tauri/Linux GTK stack warnings and are still upstream-bound rather than local direct dependency drift.
