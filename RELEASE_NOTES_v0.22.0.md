# Filament Manager v0.22.0

Release date: 2026-07-29

## Highlights

- Bambu Live now verifies the printer identity before reading or sending the
  access code. The first connection requires an explicit local trust decision,
  and a changed identity stops the connection until it is reviewed again.
- Reusable Bambu and desktop-library credentials now live in macOS Keychain or
  Windows Credential Manager instead of SQLite. Existing credentials migrate
  on first start with verified writes, rollback, cleanup, and retry behavior.
- Database startup, backup, restore, Windows storage recovery, and support
  diagnostics have been hardened. Schema upgrades and destructive replacement
  operations create verified local recovery snapshots.
- Companion pairing, authenticated reads and writes, client renewal, reset, and
  restore now share stricter lifecycle and concurrency boundaries.
- The desktop UI has improved scaling, onboarding, field validation, printer
  telemetry layout, and data-loading behavior. Obsolete manual Refresh buttons
  have been removed.

## Inventory Workflows

- The add-filament flow provides persistent field labels and visible validation
  for starting weight, location, and manual filament data.
- Filament usage history now keeps the newest bounded measurement window, and
  wide dialogs remain usable in short application windows.

## Release Reliability

- macOS release artifacts are Developer ID signed, notarized, stapled, and
  checked for bundle identity, the exact Universal 2 architecture set,
  deployment target, entitlements, privacy strings, hardened runtime, and
  Gatekeeper acceptance. The same DMG is installed and launched natively on
  Apple Silicon and Intel before publication.
- Windows remains intentionally unsigned. The per-user x64 MSI is verified for
  product metadata and then installed, launched, database-checked, uninstalled,
  and checked for user-data retention in CI. Both the MSI and installed EXE
  must report the exact Authenticode status `NotSigned`.
- Release requests keep the package version, Cargo metadata, Tauri metadata,
  release notes, installer versions, checksums, and source dependency SBOM in
  one guarded contract.

## Validation

- Upgrade qualification against an isolated, sanitized v0.21.2-era database
  snapshot.
- Bambu Live observation with up to 30 seconds allowed for telemetry.
- Automated browser validation of webcam startup and image-based Bambu barcode
  scanning with a controlled test video source. Packaged-app camera permissions
  and real-camera optics remain manual hardware checks.
- Brother P-Touch 24 mm PNG labels plus A4 and US Letter PDF label sheets.
- Installed release-artifact smoke tests on Apple Silicon macOS, Intel macOS,
  and Windows.
- Data-backed desktop and Companion screenshot gates.
- Full UI, Companion, script, Rust, Clippy, localization, portability, and
  public-readiness verification.

## Artifacts

- Universal 2 macOS DMG for Apple Silicon and Intel, signed with Apple Developer
  ID, notarized, stapled, and accompanied by `SHA256SUMS.txt`.
- Per-user Windows 11 x64 MSI, intentionally unsigned and accompanied by
  `SHA256SUMS-windows.txt`.
- SPDX 2.3 source dependency SBOM and checksum manifest.

## Upgrade Notes

- v0.21.2 users can install v0.22.0 over the existing application. The first
  start may migrate reusable credentials into the operating system credential
  store; printer and inventory data remain in the local database.
- If a Bambu printer identity cannot be verified or has changed, live status
  stays disconnected and the access code is not sent. Review and trust the
  identity again under **Settings -> 3D printers**.
- Portable backups intentionally omit device-local credentials, trust state,
  and active browser or desktop sessions.
