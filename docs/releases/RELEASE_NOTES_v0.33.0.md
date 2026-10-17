# Filament Manager v0.33.0

Release notes prepared: 2026-10-17. Changes since v0.32.1.

This release simplifies Dashboard and Statistics, adds the reel logo to
filament QR codes, and makes catalog, Host-version and label-export workflows
clearer. The strong filament and printer colors are preserved.

## Simpler Dashboard And Statistics

- Dashboard leads with compact inventory, printer and last-30-days usage
  totals, printer summaries, low-stock rolls and recent activity. Required
  setup, overdue loans, incoming orders and printer identity reviews remain
  visible. Ownership, health, goals and the separate rolling twelve-month
  consumption chart are available under **Setup and library details**.
- Printer summaries distinguish saved configuration from live observations.
  Only fresh, connected and trusted local Bambu Live data can show current
  activity. Cached, unavailable, stale and unsupported Host detail data are
  identified instead of being presented as an empty list or live status.
- Statistics separates **Consumption**, **Inventory value** and **Printers**
  into three views with one reporting-period picker. Switching views retains
  date drafts, the applied period, filters and calculation/detail state.
- Consumption emphasizes recorded use and its actual material and filament
  color breakdown. Inventory value keeps current stock separate from
  selected-period material cost, with missing-price and coverage details
  available on demand. Printer details retain their existing actions.
- Current stock and loaded slots, rolling-30-day forecasts and all-recorded
  loan usage retain their own stated scopes. Currencies remain separate;
  unavailable measurements and prices are not filled with invented values.

## Printer States, Search And Help

- Explicit paused and preparing printer states now take precedence over hot
  nozzle temperature, preventing those printers from appearing to be printing.
  Terminal and unknown-state handling is preserved.
- Inventory search includes vendor names and matches all whitespace-separated
  search words in any order. Existing filters, QR references and RFID searches
  remain available.
- Catalog progress uses translated operation and phase messages instead of
  displaying backend English as the main status. Technical diagnostics remain
  available, and an older refresh receipt cannot replace a current audit's
  result.
- Help source, product-tour and localized-manual links follow the installed
  stable version. Development or unknown versions explain why matching help
  is unavailable instead of silently showing unreleased instructions.

## Branded QR Codes And Label Exports

- Filament QR codes on desktop, Companion and A4/US Letter PDF sheets use the
  cropped reel logo in color, without the app icon's background. Individual
  label PNGs from spool details use its black-and-white version for label
  printers. All variants retain the original spool link.
- The QR renderers use H error correction, a four-module white border and
  integer source scaling. Logo placement protects the QR's fixed patterns;
  the plate can shrink, move or give way to a plain code when no safe position
  is available. Existing label dimensions and 300-DPI PNG/PDF layouts remain.
- Failed previews offer **Try preview again**. A successful PNG or PDF export
  offers **Open saved file** in the default viewer; files are not opened or
  printed automatically. A moved, deleted, changed or no-longer-registered
  export must be saved again before it can be opened from the app.
- The PDF builder stays open after saving. Changing A4/US Letter format clears
  the previous file action until the new format is saved. Label feedback and
  file actions stay tied to the current roll, size, Host and dialog session.
- Printing guidance calls for **100% / actual size**, with page fitting turned
  off and the selected paper or label size matched in the print settings.

Digital checks compare branded and plain codes, decode the actual exported
PDF images and Companion SVGs, and use ZXing and Apple Vision. These are
synthetic decoding and export checks, not physical tape, printer or phone-camera
tests. Print and scan a sample at its intended size before producing a batch.
See the [QR validation report](https://github.com/bliatun-code/Filament-Manager/blob/v0.33.0/docs/QR_LOGO_VALIDATION_2026-10-15.md).

## Host Versions And Catalog Feedback

- Client settings show **This device** separately from the named Host's app
  version. Verified current responses and older saved versions are labelled
  separately; an older Host that does not report its version stays explicitly
  unknown. **Refresh host status** rechecks the configured Host, and the normal
  public update check compares each verified version separately.
- Creating a Host pairing invitation waits for an ongoing server restart, then
  keeps the listener stable while its health is checked and the invitation is
  saved. The existing health deadline and authorization checks are retained.
- Failed or interrupted catalog work shows a short next step. **View refresh
  log** opens retained technical details only when requested. Uncertain status
  warns that a job may still be running rather than submitting another import.
  A later status-read failure cannot replace an already confirmed completion
  or interruption.
- Catalog discovery limits, complete-response checks and explicit refresh
  behavior are preserved. This release does not add automatic catalog retries
  or automatic discontinued-product marking.

## Upgrade Notes

- **Update the Host as well as desktop Clients.** New Host-version metadata
  and Companion QR branding require an updated Host; older Hosts remain
  supported with an unknown version. Updating a Client does not install or
  update its Host or the Host's webapp automatically.
- Catalog discovery and refresh run on the Host in Client mode. Updating only
  a Client does not deliver backend catalog fixes to that Host.
- The database remains at **schema 7** and the portable backup format remains
  `filament-manager-backup-v1`. No schema migration is introduced.
- Export a full backup before upgrading. Portable backups omit machine-local
  credentials and pairings; existing operational receipts remain local.

## Verification And Distribution

Automated and synthetic rendered checks cover the new views, keyboard
navigation, report scopes, stale replies, Host changes, explicit retries and
saved-file validation. New copy is included in all 21 supported language
catalogs. This does not imply human usability research, native-speaker review,
exhaustive accessibility certification or physical-printer certification.

Cold macOS CI runs have a larger finite job budget so that the final packaged
application checks can complete after full verification. All checks, application
timeouts and cache-write safeguards remain in place.

The tagged release workflow publishes these artifacts after its required gates
pass:

- Universal 2 macOS DMG for Apple Silicon and Intel, Developer ID signed,
  notarized and stapled, with `SHA256SUMS.txt`.
- Per-user Windows 11 x64 MSI with `SHA256SUMS-windows.txt`. The Windows
  installer remains unsigned.
- SPDX 2.3 source dependency SBOM and `SHA256SUMS-sbom.txt`.
- Signed installer build provenance for the DMG and MSI.

[QR branding, PR #166](https://github.com/bliatun-code/Filament-Manager/pull/166),
[everyday workflow fixes, PR #167](https://github.com/bliatun-code/Filament-Manager/pull/167),
[simpler Dashboard and Statistics, PR #168](https://github.com/bliatun-code/Filament-Manager/pull/168),
and [Host, catalog and label polish, PR #169](https://github.com/bliatun-code/Filament-Manager/pull/169).
[All source changes since v0.32.1](https://github.com/bliatun-code/Filament-Manager/compare/v0.32.1...v0.33.0).
