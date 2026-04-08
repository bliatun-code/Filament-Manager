# Filament Manager v0.8.3

Release date: 2026-04-09

## Highlights
- Windows release-candidate follow-up:
  - Windows MSI build and smoke flow remain green on current `main`
  - companion test launcher is now explicit and stable across Windows shell and Node versions
- Node 24 readiness:
  - local Windows validation passed on Node `24.14.1`
  - GitHub Actions CI and release-build workflows now run on Node 24
  - Node `20.x` remains supported for development, while Node `24.x` is now the recommended baseline
- Ongoing release hardening:
  - Windows per-user MSI packaging remains in place
  - README guidance now matches current Windows and Node support expectations

## Validation
- `npm ci` PASS on Node 24 / Windows
- `npm --prefix ui ci` PASS on Node 24 / Windows
- `npm run smoke` PASS on Node 24 / Windows
- `npm run tauri -- build --bundles msi` PASS on Node 24 / Windows
- `npm run smoke` PASS on Node 20 / Windows after the companion test launcher change

## Notes
- This tag is the release follow-up to `v0.8.2` and captures the Node 24 CI/runtime readiness work now merged to `main`.
- Tag push triggers the existing GitHub Actions artifact workflow, but does not upload GitHub release assets automatically.
