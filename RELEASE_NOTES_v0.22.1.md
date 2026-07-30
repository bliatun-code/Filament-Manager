# Filament Manager v0.22.1

Release date: 2026-07-30

## Update Notifications

- Release builds can now check the public GitHub release metadata after a short
  startup delay and at most once per 24 hours.
- A dismissible banner appears only when a newer version is available. Current,
  development, unavailable, and disabled-channel results stay quiet during the
  automatic check.
- Automatic checks can be disabled under **Settings -> General**. The existing
  manual **Check for updates** action remains available.
- **View release** always opens the known Filament Manager release page.
  Downloading and installing an update remain explicit user actions.

## Release And Repository Reliability

- Canonical tagged builds fail closed unless the public update metadata channel
  is configured to the repository's anonymous `releases/latest` endpoint.
- Public tagged releases require verified installer provenance in addition to
  the existing signed/notarized Universal 2 DMG, Windows MSI checks, installed
  artifact smoke tests, checksums, and source dependency SBOM.
- CodeQL categories retain their existing alert history across Rust,
  JavaScript/TypeScript, and GitHub Actions scans.
- Bambu catalog fallback selection now requires an exact trusted store hostname
  instead of accepting a matching substring.

## Validation

- Full macOS and Windows CI, including data-backed Companion tests and a clean
  Windows MSI installation.
- CodeQL analysis for Rust, JavaScript/TypeScript, and GitHub Actions.
- Release workflow contracts for the update channel, Universal 2 DMG, Windows
  MSI, checksums, SBOM, provenance, and guarded publication.
- Localization checks for all 21 supported application languages.

## Upgrade Notes

- The v0.22.0 installers were built before the public update channel was
  embedded. Install v0.22.1 manually once from the GitHub release page.
- After v0.22.1 is installed, optional automatic notifications can announce
  later releases. The application never downloads or installs an update by
  itself.

## Artifacts

- Universal 2 macOS DMG for Apple Silicon and Intel, Developer ID signed,
  notarized, stapled, and accompanied by `SHA256SUMS.txt`.
- Per-user Windows 11 x64 MSI, intentionally unsigned and accompanied by
  `SHA256SUMS-windows.txt`.
- SPDX 2.3 source dependency SBOM, checksum manifest, and signed public build
  provenance for the installer artifacts.
