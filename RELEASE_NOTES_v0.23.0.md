# Filament Manager v0.23.0

Release date: 2026-08-02

## Stable Local Companion And Desktop Pairing

- Companion now publishes a short, library-bound `fm-xxxxxxxx.local` address on
  macOS and Windows when the selected private LAN supports mDNS/Bonjour.
- New Companion/browser links, permanent QR labels, and new desktop-client
  pairings use that stable local address instead of a changing DHCP address.
- Desktop clients now resolve their paired `.local` host through the local
  mDNS service before connecting, matching browser behavior on macOS and
  Windows.
- The app verifies that a stable local address resolves to the selected private
  LAN address before enabling pairing or permanent QR links. The numeric
  address remains available only for diagnostics.
- A library can have only one active Companion host. A second copy of the same
  library does not silently claim or rename the published address.

## Bambu Printer Discovery And Safer Address Recovery

- **Find Bambu printers** listens briefly for local printer announcements and
  shows the announced serial number and address to simplify Live setup.
- A saved Bambu Live printer can recover a DHCP-changed address only when the
  discovered serial and the previously trusted TLS public-key pin both match.
  The recovery check does not send the printer access code.
- Discovery is a setup aid, not authentication: a changed identity remains
  blocked until it is explicitly reviewed and paired again.

## Reliability And Maintenance

- Improved macOS process cleanup for the visual QA launch path.
- Updated compatible JavaScript and Rust dependencies. npm vulnerability audits
  remain clean; the known Rust ecosystem advisories are transitive Linux GTK
  warnings inherited through Tauri and do not affect the supported macOS or
  Windows installers.
- Refreshed the screenshot tour with stable local Companion and live-printer
  views. The data-driven visual QA fixture now keeps its telemetry and network
  data synthetic, so the release tour remains representative without exposing
  a developer LAN address.

## Upgrade Notes

- Existing browser and desktop clients paired through an old numeric address
  need one new pairing. QR labels printed with an old numeric address should be
  reprinted after the stable local address is ready.
- Keep the host and clients on the same private LAN and allow mDNS/Bonjour.
  On Windows, allow Filament Manager through Windows Defender Firewall on
  private networks only.

## Validation

- Full macOS and Windows smoke, including a data-backed Companion flow and a
  clean Windows MSI installation.
- Local dependency vulnerability and license checks, release workflow
  contracts, and all localization checks.
- The public tag workflow verifies, installs, and launches the exact release
  DMG on Apple Silicon and Intel before release publication.

## Artifacts

- Universal 2 macOS DMG for Apple Silicon and Intel, Developer ID signed,
  notarized, stapled, and accompanied by `SHA256SUMS.txt`.
- Per-user Windows 11 x64 MSI, intentionally unsigned and accompanied by
  `SHA256SUMS-windows.txt`.
- SPDX 2.3 source dependency SBOM, checksum manifests, and signed GitHub
  build provenance for the installer artifacts.
