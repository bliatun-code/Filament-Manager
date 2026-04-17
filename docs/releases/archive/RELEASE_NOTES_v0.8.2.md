# Filament Manager v0.8.2

Release date: 2026-04-08

## Highlights
- Windows release-candidate hardening:
  - `npm run doctor` now resolves `npm` / `npx` correctly on Windows
  - companion tests no longer depend on shell glob expansion that breaks on Windows
  - Windows runtime now prefers safer local app-data handling and lower-risk SQLite behavior
- Windows MSI packaging:
  - MSI is now packaged as a per-user install
  - default install no longer requires Administrator privileges
  - first-run database creation was validated on Windows
- CI and docs alignment:
  - `Windows Smoke` now runs full `npm run smoke`
  - README now includes Windows install and troubleshooting guidance
  - Settings auto-theme copy now refers to the system theme instead of macOS-specific wording

## Validation
- `npm run doctor` PASS on Windows
- `npm run smoke` PASS on Windows
- `npm run tauri -- build --bundles msi` PASS on Windows
- silent per-user MSI install PASS
- first-run database creation PASS
- uninstall PASS

## Notes
- This tag is intended to mark the first stable Windows-ready patch after `v0.8.1`.
- Tag push triggers the existing GitHub Actions artifact workflow, but does not upload GitHub release assets automatically.
