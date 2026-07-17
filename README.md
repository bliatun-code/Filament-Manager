# Filament Manager

Filament Manager is a desktop-first inventory app for 3D printer filament. It
tracks physical spools, loans, printer slots, filament usage, wishlist/order
items, catalog data, and optional Bambu AMS live observations in one local
library.

The app is built as a Tauri desktop application with a React UI and a Rust
backend. It can run as a single local installation, as a host for other desktop
clients, or as a local webapp/companion server for paired browsers on the same
LAN.

## Product Tour

A quick look at the main desktop and Companion workflows. Click a preview to
open the larger screenshot, or open the full
[screenshot tour](docs/SCREENSHOTS.md).

<p align="center">
  <a href="docs/screenshots/dashboard.jpg"><img src="docs/screenshots/dashboard-thumb.jpg" alt="Dashboard overview with inventory health and recent activity" width="220"></a>
  <a href="docs/screenshots/inventory.jpg"><img src="docs/screenshots/inventory-thumb.jpg" alt="Inventory grid with filament spool cards" width="220"></a>
  <a href="docs/screenshots/add-filament.jpg"><img src="docs/screenshots/add-filament-thumb.jpg" alt="Add filament stock entry flow" width="220"></a>
  <a href="docs/screenshots/bambu-batch-add.jpg"><img src="docs/screenshots/bambu-batch-add-thumb.jpg" alt="Bambu batch add flow" width="220"></a>
  <a href="docs/screenshots/wishlist-queue.jpg"><img src="docs/screenshots/wishlist-queue-thumb.jpg" alt="Wishlist and order queue" width="220"></a>
  <a href="docs/screenshots/loan-out.jpg"><img src="docs/screenshots/loan-out-thumb.jpg" alt="Loan out roll flow" width="220"></a>
  <a href="docs/screenshots/printers.jpg"><img src="docs/screenshots/printers-thumb.jpg" alt="Printer AMS slot overview" width="220"></a>
  <a href="docs/screenshots/add-printer.jpg"><img src="docs/screenshots/add-printer-thumb.jpg" alt="Add printer and multi-material setup" width="220"></a>
  <a href="docs/screenshots/statistics.jpg"><img src="docs/screenshots/statistics-thumb.jpg" alt="Statistics page with printer and loan usage" width="220"></a>
  <a href="docs/screenshots/filament-details.jpg"><img src="docs/screenshots/filament-details-thumb.jpg" alt="Filament detail panel with weight, ownership and QR tools" width="220"></a>
  <a href="docs/screenshots/filament-label.jpg"><img src="docs/screenshots/filament-label-thumb.jpg" alt="Individual filament QR label preview with physical size choices" width="220"></a>
  <a href="docs/screenshots/inventory-label-sheet.jpg"><img src="docs/screenshots/inventory-label-sheet-thumb.jpg" alt="Inventory label sheet preview with A4 and US Letter choices" width="220"></a>
  <a href="docs/screenshots/filament-history.jpg"><img src="docs/screenshots/filament-history-thumb.jpg" alt="Filament roll history timeline" width="220"></a>
  <a href="docs/screenshots/companion-tablet-inventory.jpg"><img src="docs/screenshots/companion-tablet-inventory-thumb.jpg" alt="Companion tablet inventory view" width="220"></a>
  <a href="docs/screenshots/companion-phone-inventory.jpg"><img src="docs/screenshots/companion-phone-inventory-thumb.jpg" alt="Companion phone inventory view" width="220"></a>
</p>

## Documentation

Start with the user guide for product behavior and workflows:

- Norwegian: [docs/BRUKERVEILEDNING.md](docs/BRUKERVEILEDNING.md)
- English: [docs/USER_GUIDE.md](docs/USER_GUIDE.md)
- Screenshot tour: [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md)
- macOS installation and verification:
  [docs/MACOS_DISTRIBUTION.md](docs/MACOS_DISTRIBUTION.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security policy: [SECURITY.md](SECURITY.md)

Release notes:

- [v0.21.1](RELEASE_NOTES_v0.21.1.md)
- [v0.21.0](RELEASE_NOTES_v0.21.0.md)
- [v0.20.2](RELEASE_NOTES_v0.20.2.md)
- [v0.20.1](RELEASE_NOTES_v0.20.1.md)
- [v0.19.0](RELEASE_NOTES_v0.19.0.md)
- [v0.18.0](RELEASE_NOTES_v0.18.0.md)
- [v0.17.0](RELEASE_NOTES_v0.17.0.md)

## Feature Overview

- Inventory for owned and borrowed-in filament spools.
- Add filament flow for Bambu, eSUN, generic/manual entries, Bambu Filament
  Code lookup, manual Bambu code batch entry, and wishlist/order planning.
- Loan tracking for outgoing loans and borrowed-in spools, including returns and
  CSV export.
- Printer profiles for Bambu AMS, Prusa MMU3, Prusa XL toolheads, and
  single-material printers.
- Compact printer cards that keep assigned filament swatches and material names
  visible while detailed slots are collapsed.
- Optional Bambu Live integration for local AMS slot observations, RFID matching,
  estimated AMS weight, Bambu filament settings/status diagnostics, nozzle
  temperature, and print-session usage accounting.
- QR/RFID support for robust spool lookup and safer automatic AMS matching.
- Print-ready QR labels for individual rolls as 300-DPI PNG files, plus matching
  A4 or US Letter inventory label sheets as PDF files, all saved to Downloads.
- Local companion/webapp for paired phones, tablets, and workshop browsers.
- Host/client library mode for sharing one desktop-owned library with other
  desktop installations.
- Catalog refresh and maintenance for Bambu and eSUN filament data.
- Backup, import/export, reset, and maintenance tools.

## Languages

Filament Manager can be used in 21 languages:

- English, Norwegian Bokmål, German, French, Spanish, Brazilian Portuguese,
  Italian, Polish, Dutch, Czech, Swedish, Danish, Finnish, and Turkish.
- Simplified Chinese, Traditional Chinese, Japanese, and Korean.
- Ukrainian, Russian, and Hungarian.

Language is selected from one compact list under **Settings → General**. English
remains the canonical fallback. German and French have completed named review;
the other new translations have complete catalogs and automated visual QA, and
community corrections are welcome through
[GitHub issues](https://github.com/bliatun-code/Filament-Manager/issues) or pull
requests.

## License

Filament Manager is licensed under the GNU Affero General Public License v3.0
or later (`AGPL-3.0-or-later`).

You may use, study, modify, and redistribute this software, including
commercially. If you distribute modified versions, or run a modified version
for users over a network, you must make the corresponding source code available
under the same license.

This license is intended to keep improvements to Filament Manager open and
available to its users. See [LICENSE](LICENSE) for the full license text and
[NOTICE.md](NOTICE.md) for trademark and attribution notices.

## Repository Layout

- `src-tauri/`: Tauri shell, Rust commands, companion server, Bambu live sync,
  trusted-LAN, and desktop integration.
- `src/backend/`: shared Rust backend modules used by the Tauri app.
- `src/scraper/`: TypeScript catalog scraper utilities.
- `ui/`: React desktop UI, UI models, tests, and styling.
- `scripts/`: local validation, Tauri wrapper, and contract checks.
- `docs/`: user-facing guides.
- `.github/workflows/release-build.yml`: protected tag/manual workflow for the
  signed Apple Silicon DMG and Windows MSI artifacts, including Developer ID
  signing, notarization, stapling, and verification.

## Requirements

- Node.js `24.x`
- npm `>=10`
- Rust toolchain for Tauri builds
- Xcode app + Command Line Tools for macOS builds
- `sqlite3` CLI recommended for scraper fallback behavior
- Current macOS DMG: Apple Silicon and macOS 11.0 Big Sur or newer

The project uses the local Tauri CLI from npm dependencies through
`npm run tauri`, so a global `cargo tauri` install is not required.

## Install

Use clean installs when preparing CI/release-like work:

```bash
npm ci
npm --prefix ./ui ci
```

For normal local development, `npm install` in both package roots is also fine:

```bash
npm install
npm --prefix ./ui install
```

## Development

Run the desktop app in Tauri dev mode:

```bash
npm run tauri -- dev
```

Run the frontend alone:

```bash
npm --prefix ./ui run dev
```

Run the health check:

```bash
npm run doctor
```

## Verification

Full local verification:

```bash
npm run verify
```

What `verify` covers:

- UI production build
- UI lint
- companion/webapp tests
- React/UI model tests
- seed catalog, Bambu catalog data, and printer model data contracts
- Tauri invoke and companion route contract checks
- UI reachability and architecture checks
- version consistency checks
- doctor/runtime checks
- Rust formatting
- Rust tests
- Rust clippy with warnings denied

Useful narrower checks:

```bash
npm run smoke
npm run test:ui
npm run test:companion
npm run test:rust
npm run check:contracts
```

`test:ui` and `test:companion` also accept `--grep "name pattern"` for focused
Node test runs.

Dependency/audit checks:

```bash
npm outdated
npm --prefix ./ui outdated
npm audit --audit-level=moderate
npm --prefix ./ui audit --audit-level=moderate
cargo update --dry-run --verbose
```

## Build

Build the desktop app with the local Tauri CLI:

```bash
npm run tauri -- build
```

Build only a macOS DMG:

```bash
npm run tauri -- build --bundles dmg
```

On macOS, `npm run tauri` ad-hoc signs ordinary local builds so bundle
entitlements are applied. Official tagged macOS artifacts are Developer ID
signed, notarized, stapled, and verified before publication. The public macOS
contract is Apple Silicon (`arm64`) on macOS 11 Big Sur or newer; Intel and
universal artifacts are not currently published. See
[macOS Installation And Verification](docs/MACOS_DISTRIBUTION.md) for the user
installation and checksum flow.

Build only a Windows MSI on Windows:

```powershell
npm ci
npm --prefix ./ui ci
npm run doctor
npm run smoke
npm run tauri -- build --bundles msi
```

Windows MSI uses the per-user WiX template in `src-tauri/wix/per-user.wxs`.

## Release Status

- Latest release page: https://github.com/bliatun-code/Filament-Manager/releases/latest
- Current version: `0.21.1`
- Version source of truth must stay aligned across:
  - `package.json`
  - `package-lock.json`
  - `src-tauri/Cargo.toml`
  - `Cargo.lock`
  - `src-tauri/tauri.conf.json`
  - this README current version

The version guard is included in:

```bash
npm run check:version
npm run verify
```

## GitHub Actions Release Artifacts

The release workflow builds installer artifacts from version tags and
maintainer-approved manual runs:

- Workflow: `.github/workflows/release-build.yml`
- Tag trigger: a version tag matching `v*`
- Manual trigger: `workflow_dispatch` for a selected platform
- Outputs:
  - `filament-manager-macos-dmg-<ref>` with the normalized DMG and
    `SHA256SUMS.txt`
  - `filament-manager-windows-msi-<ref>`

The macOS job fails instead of publishing an ad-hoc fallback when signing,
notarization, stapling, verification, or checksum generation fails. Release
assets are treated as immutable; a mismatch is investigated rather than
silently replaced.

## Installers and App Data

macOS:

- Download DMG from the latest GitHub release.
- App data path is typically
  `~/Library/Application Support/no.bliatun.filamentmanager`.
- Installation and verification:
  [docs/MACOS_DISTRIBUTION.md](docs/MACOS_DISTRIBUTION.md)

If Bambu Live works in development but the installed DMG reports `No route to
host` for a reachable printer, allow Filament Manager in `System Settings ->
Privacy & Security -> Local Network`, then restart the app. The installed app
uses a different macOS privacy identity than the development process.

Windows:

- Supported installer path: Windows 11 + Tauri MSI.
- MSI default install path:
  `C:\Users\<user>\AppData\Local\Filament Manager`
- App data path:
  `C:\Users\<user>\AppData\Local\no.bliatun.filamentmanager`
- The MSI is per-user and should not require Administrator privileges for the
  default install path.
- Uninstall removes installed app files but keeps local app data unless that data
  is removed manually.

## Catalog Scraping

Safe Bambu catalog refresh from the scraper:

```bash
FILAMENT_MANAGER_DB_PATH=./data/filament-manager.db npm run scrape:auto:safe
```

Manual scraper run:

```bash
BAMBU_BASE_URL=https://eu.store.bambulab.com \
BAMBU_COLLECTION=bambu-lab-3d-printer-filament \
FILAMENT_MANAGER_DB_PATH=./data/filament-manager.db \
npm run scrape
```

Optional tuning:

- `BAMBU_VERBOSE=1`
- `BAMBU_FETCH_RETRIES=2`
- `BAMBU_TIMEOUT_MS=20000`
- `BAMBU_PRODUCT_DELAY_MS=200`
- `BAMBU_MATERIAL_TYPES=PLA,PETG` to refresh a smaller material slice
- `BAMBU_DB_PATH` is still accepted as a legacy alias for
  `FILAMENT_MANAGER_DB_PATH`

Catalog data is stored in SQLite in `filament_master_list`. The app ships with
a sanitized, case-normalized seed catalog in
`src/data/seed_filament_catalog.json` so old or currently unavailable
manufacturer listings stay searchable when users add rolls they already own or
find through resellers. The seed is deduplicated by material, filament name, and
color name after normalization, and contains only master catalog metadata, never
spool, loan, printer, RFID, location, or usage history.

The Settings UI can still refresh supported Bambu and eSUN catalog data. The
normal path is to refresh selected material families when new products appear;
a full vendor audit is heavier and may mark products that are no longer visible
at the manufacturer as historical/discontinued. Filtered material refreshes
skip discontinued marking to avoid hiding untouched families. Bambu refreshes
discover the material families exposed by the current store and show them in the
refresh summary, so larger catalog maintenance can be split into lower-traffic
material runs. Bambu color swatches prefer the local official hex table before
falling back to name-based color estimates. Swatches remain backward compatible
with single `#RRGGBB` values, and can also store `multi(#RRGGBB,#RRGGBB,...)`
for hard segmented multi-colour rolls or `gradient(#RRGGBB,#RRGGBB,...)` for
smooth transition rolls.

## Data Model Notes

- Spool edits, status changes, weight updates, RFID updates, printer assignments,
  loan events, live usage, deletions, and lifecycle changes are tracked in local
  history.
- Deleting a spool normally hides it from active inventory while preserving
  history.
- Permanent purge is available for cases where the spool and related records
  should truly be removed.
- Every printer gets an `EXT` slot so single-spool usage works even without a
  multi-material system.
- The supported printer model catalog is shared by desktop, webapp, and host
  code. Bambu Lab entries also keep their Bambu Studio printer profile code so
  diagnostics can display familiar upstream names without duplicating model
  maps in the UI.
- Bambu AMS weight is treated as an estimate, not as a physical scale reading;
  live usage accounting is intentionally conservative.
- Bambu Studio filament settings signals such as `tray_info_idx` and
  `tray_id_name` are diagnostic material/profile hints, not physical spool
  identity. Saved RFID/tray UUID data remains the strong identity signal for
  automatic AMS matching.

## Stability Goals

The project is configured to keep working when upstream dependencies change:

- `better-sqlite3` is optional; scraper code can fall back to the `sqlite3` CLI.
- Auto-scrape detects working Bambu store/collection paths dynamically.
- Scraper network calls use retry and timeout controls.
- Tauri configuration uses the v2 schema with explicit capabilities.
- Local wrapper scripts keep CI and developer commands consistent.

## Troubleshooting

`npm run doctor` fails because `npm` or `npx` is not found:

- Verify Node 24 is installed.
- Reopen the terminal after installing Node.

`npm run smoke` fails in companion or UI tests:

- Run `npm ci`.
- Run `npm --prefix ./ui ci`.
- Re-run `npm run smoke`.

Windows MSI install fails with permission errors:

- Use the current per-user MSI from `target/release/bundle/msi`.
- Do not force install into `Program Files`.

App starts but data appears empty:

- Check whether the expected app data directory exists.
- Check whether `filament-manager.db` was created on first run.
- If using Client mode, verify the host is reachable and pairing is valid.

`sqlite3` CLI warning in `doctor`:

- This is not a blocker when `better-sqlite3` is available and `doctor` reports
  `ok`.

## Tauri Config Source of Truth

Use `src-tauri/tauri.conf.json` as the primary Tauri app config. Windows-specific
bundle overrides live in `src-tauri/tauri.windows.conf.json`.
