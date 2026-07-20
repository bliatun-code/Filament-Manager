# Filament Manager v0.21.2

Release date: 2026-07-20

## Highlights

- Windows upgrades now recover an existing inventory from the legacy Roaming
  data directory into the current Local database, even when an earlier affected
  build already created Local settings or inventory. Existing Local records and
  the recovered inventory are merged transactionally, the target is backed up,
  and the legacy source stays unchanged.
- The per-user Windows MSI keeps the application binary in the mandatory
  feature, preserves the system Desktop directory during uninstall, and manages
  the user `PATH` entry as a separate installer component.
- External documentation links use validated HTTP(S) URLs and the native
  Windows shell API instead of a command-shell launcher.

## Release Reliability

- Windows CI now compiles and verifies a real debug MSI after the full test
  suite, so WiX/template failures are caught before a release tag is created.
- Command-portability checks cover first-party PowerShell scripts as well as
  JavaScript, package scripts, and Windows workflow commands.
- Tag builds publish a GitHub release only after CI is green for the exact
  release commit and both platform artifacts and their platform-specific
  SHA-256 manifests have been downloaded and verified.
- Stable per-run artifact names let a failed release job be retried without
  invalidating an already verified artifact from the other platform.
- The Windows installer is normalized to a release-safe filename before its
  checksum manifest is written, so the downloaded MSI verifies without a
  GitHub filename rewrite.
- The Windows storage migration and command/path portability contracts include
  regression coverage for the failure modes addressed in this release.

## Artifacts

- Apple Silicon macOS DMG, signed with Apple Developer ID, notarized, stapled,
  and accompanied by `SHA256SUMS.txt`.
- Per-user Windows 11 x64 MSI accompanied by `SHA256SUMS-windows.txt`.

## Validation

- Full UI, companion, script, Rust, Clippy, and contract verification.
- Native macOS smoke test and Windows smoke test.
- Signed/notarized macOS artifact verification and compiled Windows MSI
  metadata, version, architecture, and checksum verification.

## Notes

- Existing users can install v0.21.2 over v0.21.1. Windows application data uses
  the current user's Local application-data directory, with an automatic,
  one-time recovery path for inventories affected by the earlier directory
  mismatch.
- This is primarily a Windows recovery, installer, and release-reliability
  update; it does not introduce a new database schema or change the main UI.
