# Filament Manager v0.27.0

Release date: 2026-08-15

## Background Operation On macOS And Windows

- **Continue running in the background when I close the window** can now hide
  Filament Manager to the macOS menu bar or Windows system tray instead of
  stopping it. The setting is optional and independent of launch at login.
- **Start in the background when I sign in** can launch the app hidden for the
  current user. On macOS, move the app to Applications before enabling this
  option so the saved launch path remains stable.
- The localized native menu can restore the existing window or quit the app.
  Starting Filament Manager again restores and focuses that same process rather
  than opening a second instance against the database, Companion port, or mDNS
  name.
- Companion and Host serving, trusted-LAN reconciliation, stable `.local`
  advertising, Bambu Live observation, and print-usage monitoring continue
  while the window is hidden. Desktop Client webview refresh timers are designed
  to pause until the window is restored.
- Coordinated Quit cancels the owned background loops and shuts down Companion
  and its local-service advertisement within bounded deadlines. Forced native
  termination, sign-out, shutdown, and process kill remain best-effort; this is
  a user-session app, not an operating-system service, and it does not run while
  the computer sleeps.

## Custom QR Label Sizes

- Individual filament labels now offer a **Custom** size alongside the existing
  presets. Width can be 45–150 mm and height 24–80 mm in 0.5 mm steps.
- Custom labels use the existing landscape layout and must be wide enough for
  the QR code and readable text: width must be at least 20 mm greater than the
  height and at least 1.6 times the height.
- The most recent valid custom dimensions and selected label size are remembered
  on the current device. Invalid draft values do not replace the last valid
  preference or enable export.
- The adaptive 300-DPI renderer fits the full text block, keeps a four-module QR
  quiet zone, and uses integer module scaling. Browser decoding tests cover the
  smallest and largest supported custom labels with a long production-shaped
  URL.
- A4 and US Letter inventory label sheets remain fixed at 60 × 24 mm. Their
  shared QR rendering and public screenshots have been refreshed as part of the
  same change.

## AMS Localization And Feedback Polish

- The AMS weight-estimate acceptance introduced in v0.26 now has complete
  follow-up localization across all 21 supported desktop and Companion
  languages.
- Roll history shows the localized **AMS estimate** source instead of exposing
  the internal `BAMBU_AMS_ACCEPTED` identifier. Companion also localizes the
  stale-estimate retry message.
- Telemetry wording such as **Last live update**, remaining weight, and AMS
  spool basis has been corrected where older translations could imply body
  weight, live broadcasting, or another mechanical meaning.
- New client-to-host AMS acceptance no longer leaves a transient English
  success message in Library settings, and compatible legacy messages are
  hidden when reading an older local state.

## Upgrade Notes

- No manual database migration, repair, or pairing change is required when
  upgrading from v0.26.
- Close-to-tray and launch at login are both opt-in. If a tray icon cannot be
  created, Filament Manager keeps the controls unavailable and uses the normal
  visible-window or exit behavior instead of silently hiding the app.
- The last custom label dimensions are a local device preference. They are not
  included in the shared library or synchronized between Host and Client.
- Update Host and Client installations together for consistent localized AMS
  history and feedback.

## Validation

- Full UI, Companion, Rust, localization, accessibility, workflow-contract,
  portability, performance, and public-readiness verification.
- Exact Rust 1.88 locked workspace checks across all targets and features,
  followed by the repository's current reviewed Rust toolchain checks and
  Clippy policy.
- Dedicated background lifecycle, single-instance, shutdown cancellation,
  Companion cleanup, Windows autostart quoting/uninstall, custom-label
  validation and persistence, QR decoding, AMS history, and legacy-status
  regression coverage.
- Refreshed sanitized screenshots for background settings, the AMS estimate
  dialog, the custom individual label, and the fixed inventory label sheet.
- Clean npm and Cargo vulnerability audits, approved dependency license
  policies, CodeQL analysis, and validated SPDX SBOM generation are release
  gates.
- Release publication remains gated on verification of the exact signed and
  notarized macOS DMG, the Windows MSI, checksum manifests, source SBOM, and
  signed installer provenance.

## Artifacts

- Universal 2 macOS DMG for Apple Silicon and Intel, Developer ID signed,
  notarized, stapled, and accompanied by `SHA256SUMS.txt`.
- Per-user Windows 11 x64 MSI, intentionally unsigned and accompanied by
  `SHA256SUMS-windows.txt`.
- SPDX 2.3 source dependency SBOM with its checksum manifest.
- Signed GitHub build provenance for the DMG and MSI, published as a Sigstore
  JSON bundle.
