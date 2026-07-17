# Filament Manager v0.21.1

Release date: 2026-07-17

## Highlights

- The Apple Silicon macOS DMG is now signed with Apple Developer ID,
  notarized by Apple, stapled, and verified with Gatekeeper before it is made
  available for download.
- The release artifact includes `SHA256SUMS.txt`, and the published DMG uses a
  stable filename without spaces.
- The supported macOS floor is explicitly verified as macOS 11.0 Big Sur or
  newer on Apple Silicon (`arm64`). This release does not add Intel or universal
  macOS support.

## Release Reliability

- The macOS release job fails closed if signing credentials, notarization,
  stapling, the expected Apple Team ID, hardened runtime, required entitlements,
  architecture, minimum system version, or Gatekeeper validation does not pass.
- Release tags must match the application version exactly and point to a commit
  on `main` before installer jobs can start.
- Windows MSI and macOS DMG artifacts are produced by the same protected release
  workflow, with pinned GitHub Actions and read-only repository permissions.
- Compatible npm and Rust dependencies were refreshed.

## Validation

- Full local verification suite
- Signed app and final-DMG notarization through Apple
- Stapled-ticket and Gatekeeper verification
- Independent checksum and macOS release-verifier pass after downloading the
  GitHub Actions artifact
- Windows x64 MSI artifact build and installer-format validation

## Notes

- There are no new end-user UI, database schema, or inventory workflows
  compared with v0.21.0.
- Existing users can install v0.21.1 over the previous version. Application data
  remains in the same local data directory.
