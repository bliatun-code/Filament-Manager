# Filament Manager

Desktop-first filament inventory project with:
- Tauri backend (`src-tauri`)
- TypeScript scraper (`src/scraper`)
- React UI (`ui`)

## Stability Goals

The project is configured to keep working when upstream dependencies change:
- `better-sqlite3` is optional; scraper falls back to `sqlite3` CLI.
- Auto-scrape detects working Bambu store/collection dynamically.
- Scraper network calls use retries + timeout controls.
- Local Tauri CLI is used via npm script (`npm run tauri`), avoiding `cargo tauri` install issues.
- Tauri configuration is on v2 schema with explicit capabilities.

## Requirements

- Node.js `>=20 <26`
- npm `>=10`
- Rust toolchain (for Tauri build)
- Xcode app + Command Line Tools (macOS build)
- `sqlite3` CLI recommended (required if `better-sqlite3` is unavailable)

## Install

```bash
npm install
cd ui && npm install
```

## Windows Install

- Supported build path: Windows 11 + Tauri MSI
- Recommended Node/npm baseline for development:
  - Node `24.x` recommended
  - Node `20.x` still supported
  - npm `>=10`
- Recommended Rust target:
  - `x86_64-pc-windows-msvc`
- Build/install flow:

```powershell
npm ci
npm --prefix ui ci
npm run doctor
npm run smoke
npm run tauri -- build --bundles msi
```

- MSI default install path:
  - `C:\Users\<user>\AppData\Local\Filament Manager`
- App data path:
  - `C:\Users\<user>\AppData\Local\com.bambu.filament.manager`

## macOS App Download

- Latest release (DMG): https://github.com/bliatun-code/Filament-Manager/releases/latest
- Current stable: `v0.8.4`

If macOS blocks first launch of an unsigned build downloaded from GitHub:

1. Move app to `Applications` from the DMG.
2. Try `Right click -> Open` once.
3. If still blocked, run:

```bash
xattr -dr com.apple.quarantine "/Applications/Filament Manager.app"
```

## GitHub Actions Release Artifacts

The repository includes a tag-triggered build workflow:
- Workflow: `.github/workflows/release-build.yml`
- Triggers:
  - push tag matching `v*` (example: `v0.8.2`)
  - manual run via `workflow_dispatch`
- Outputs:
  - macOS DMG artifact
  - Windows MSI artifact

How to trigger from git:

```bash
git tag -a v0.8.2 -m "v0.8.2"
git push origin v0.8.2
```

How to download artifacts:
1. Open GitHub repo -> `Actions` tab.
2. Open the run named `Release Build Artifacts` for the tag.
3. Download artifacts from the `Artifacts` section:
   - `filament-manager-macos-dmg-<tag>`
   - `filament-manager-windows-msi-<tag>`

### Windows RC notes

- Windows MSI is now packaged as a per-user install and does not require Administrator privileges for the default install path.
- Installer path: `C:\Users\<user>\AppData\Local\Filament Manager`
- App data path: `C:\Users\<user>\AppData\Local\com.bambu.filament.manager`
- First-run on Windows creates the local SQLite database automatically.
- Uninstall removes the installed app files but keeps local app data unless you remove it manually.

### Windows troubleshooting

- `npm run doctor` fails because `npm` or `npx` is not found:
  - verify Node 24 or Node 20 is installed and reopen the terminal
- `npm run smoke` fails in companion tests:
  - run `npm ci`
  - run `npm --prefix ui ci`
- MSI install fails with permission errors:
  - use the current per-user MSI from `target/release/bundle/msi`
  - do not force install into `Program Files`
- App starts but data appears empty:
  - verify the app data directory exists at `C:\Users\<user>\AppData\Local\com.bambu.filament.manager`
  - check whether `bambu.db` was created on first run
- `sqlite3` CLI warning in `doctor`:
  - this is not a blocker if `better-sqlite3` is available and `doctor` still reports `ok`

## Health Check

```bash
npm run doctor
```

## Scraping

Safe run (recommended):

```bash
BAMBU_DB_PATH=./data/bambu.db npm run scrape:auto:safe
```

Manual run:

```bash
BAMBU_BASE_URL=https://eu.store.bambulab.com \
BAMBU_COLLECTION=bambu-lab-3d-printer-filament \
BAMBU_DB_PATH=./data/bambu.db \
npm run scrape
```

Optional tuning:
- `BAMBU_VERBOSE=1`
- `BAMBU_FETCH_RETRIES=2`
- `BAMBU_TIMEOUT_MS=20000`
- `BAMBU_PRODUCT_DELAY_MS=200`

## Catalog storage and lifecycle

- Catalog data is stored locally in SQLite (`filament_master_list`) in your configured `BAMBU_DB_PATH`.
- The app now supports **Import / Refresh Bambu Catalog** directly from the Inventory page.
- On refresh, Bambu items seen in the latest import are reactivated; older Bambu items are marked discontinued (kept in DB for historical inventory rules).

## Roll lifecycle and history

- Roll edits, weight updates, used-up transitions, and deletions are tracked in local history (`spool_history_events`).
- Deleting a roll removes it from active inventory view (soft delete) but preserves history.
- Permanent purge is available for a roll and removes the roll plus related weight, scan, print, and lifecycle history records.
- Selected roll view includes a small usage diagram based on stored weight readings.
- Inventory list groups identical filament/color entries into one card and summarizes total weight with per-roll lines.

## Add + wishlist workflow

- Inventory now separates **Manage inventory** and **Add to inventory** in one page.
- Add mode includes a local DB-backed wishlist/order tracker (`wishlist_items`).
- Wishlist entries can be moved to **On order**, then converted to stocked rolls with **Stock roll now**.

## Printer slot profiles

- Every printer always gets one `EXT` slot, so single-roll usage works even with no multi-material system configured.
- Bambu models use AMS profiles (`4` slots per AMS; configurable AMS unit count).
- Prusa MMU3-compatible models use optional MMU3 profiles (`5` channels when enabled).
- Prusa XL profiles use toolhead counts (`1`, `2`, or `5` toolheads).
- Prusa MINI+ defaults to single-material (`EXT` only).

## UI modal standards

- Modal UX checklist: `docs/MODAL_UX_CHECKLIST.md`

## Tauri CLI

Use local CLI from dependencies:

```bash
npm run tauri -- --version
npm run tauri -- info
```

## Tauri Config Source of Truth

- Use `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/tauri.conf.json` as the only Tauri app config.
- The root-level `tauri.conf.json` is intentionally not used.
