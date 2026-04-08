# Filament Manager v0.8.4

Release date: 2026-04-09

## Highlights
- Version alignment release:
  - app, Tauri bundle, and release tag now use the same `0.8.4` version
  - release assets generated from this tag now match the published version number
- Windows release-candidate work remains included:
  - per-user MSI packaging
  - Windows runtime/storage hardening
  - Windows smoke and MSI build validation
- Node 24 readiness remains included:
  - companion test launcher is stable across Windows shell and Node versions
  - GitHub Actions CI and release-build workflows now run on Node 24
  - Node `20.x` remains supported for development

## Validation
- `npm run smoke` PASS on Windows
- `npm run tauri -- build --bundles msi` PASS on Windows
- GitHub Actions CI PASS on `main`
- GitHub Actions Release Build Artifacts PASS for the previous release pipeline validation

## Notes
- `v0.8.4` supersedes `v0.8.3` as the clean, version-consistent public release.
- This release does not redesign or change user-facing workflows beyond version alignment and the previously merged Windows/Node 24 hardening work.
