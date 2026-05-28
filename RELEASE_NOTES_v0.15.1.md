# Filament Manager v0.15.1

Release date: 2026-05-28

## Highlights

- Added complete user documentation in Norwegian and English.
- Reworked the README into a clearer project landing page for users, developers,
  verification, build, and release workflows.
- Refreshed compatible npm and Cargo dependencies, including the direct
  `rusqlite` update to `0.40.0`.
- Rechecked dependency drift, npm audit status, RustSec warnings, and release
  version consistency before publishing.

## Documentation

- Added [docs/BRUKERVEILEDNING.md](docs/BRUKERVEILEDNING.md) with a full
  Norwegian description of inventory, loans, Add filament flows, Host/Client,
  Standalone mode, webapp pairing, Bambu Live, RFID registration, automatic AMS
  weight handling, and job registration.
- Added [docs/USER_GUIDE.md](docs/USER_GUIDE.md) as the matching English guide.
- Updated README with feature overview, repo layout, install/development
  commands, verification commands, release artifact flow, installer notes,
  troubleshooting, and data-model notes.

## Dependencies

- Updated UI `typescript-eslint` from `8.59.4` to `8.60.0`.
- Updated direct Rust `rusqlite` from `0.39.0` to `0.40.0`.
- Refreshed compatible Rust lockfile dependencies including `reqwest`, `hyper`,
  `tao`, `wasm-bindgen`, `zerocopy`, and related transitive packages.

## Technical Debt Review

- `npm outdated` PASS
- `npm --prefix ./ui outdated` PASS
- `npm audit --audit-level=moderate` PASS
- `npm --prefix ./ui audit --audit-level=moderate` PASS
- `cargo update --dry-run --verbose` reviewed; remaining outdated entries are
  transitive upstream constraints.
- `cargo audit` reviewed; reported warnings are known upstream Tauri/Linux GTK
  stack warnings and are not direct local dependency drift.
- TODO/FIXME/HACK marker sweep found no open markers in source/scripts.

## Validation

- `npm run verify` PASS
- `git diff --check` PASS
- `npm run check:version` PASS
