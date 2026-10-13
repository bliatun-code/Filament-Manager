# Filament Manager v0.32.0

Release notes prepared: 2026-10-13. Changes since v0.31.0.

This release improves desktop and Companion workflows, fixes automatic Bambu
RFID assignment after partial live updates, and preserves the strong filament
and printer colors. It includes dependency security updates and improvements
to CI reliability.

## Inventory, Printers And Everyday Tasks

- Automatic Bambu slot assignment now accepts a retained exact RFID match when
  a loaded, connected printer supplies fresh compatible weight evidence. This
  fixes cases where MQTT observed details identified the roll but the printer
  overview still showed no assignment. Unique-match, removal, replacement and
  manual-clear protections remain in place; fresh weight does not override an
  explicit manual clear.
- Printer roll pickers display and search readable storage and AMS placement
  names instead of internal location or slot identifiers.
- Dashboard metrics appear before setup and action panels. Setup progress uses
  the same task list as its displayed completion count, and inventory,
  wishlist and Settings layouts make better use of smaller windows.
- Roll details place weight controls before QR and label metadata in narrow
  windows. Long names wrap, history uses the available width, and loan
  validation focuses the invalid borrower, weight or date field.
- Bulk review identifies selected rolls even when the current filter hides
  them. Price overwrite review lists which rolls will update or be skipped,
  starts with Cancel focused and restores focus afterward. Price results show
  roll references and scroll into view.
- Batch receipts fit short results and keep actions reachable for long lists.
  PNG label, PDF, backup and import feedback stays near the active task.
  Missing label prerequisites produce an explanation instead of an apparently
  empty label sheet.
- Roll-weight and diagnostic charts show scale and time endpoints, space
  measurements by elapsed time and plot a single measurement at its actual
  value. Forecasts use approximate days, months or years rather than
  unsupported date precision.

## Appearance And Companion

- The strong filament and printer card colors, filament swatches and
  multicolor information are retained. Secondary text receives a locally
  readable foreground on bright surfaces.
- The macOS title bar follows the selected appearance, fixing a white title
  bar while the application used dark mode.
- Companion correctly renders multicolor and gradient swatches, keeps long
  names and weights readable on small screens, and uses more compact task and
  Settings layouts.
- Companion shows errors and one persistent success result inside the active
  dialog. Failed saves retain entered weights; keyboard focus stays visible
  while scrolling and returns to the initiating control.
- Host status refresh can re-enable pairing after runtime recovery without
  replacing unsaved network settings. Revoked desktop pairing provides a
  direct Settings → Library and webapp recovery path.

## Dependencies And Build Reliability

- Updates the stable Tauri backend/API to 2.12.3 and CLI to 2.12.2, alongside
  compatible npm, Cargo and immutable GitHub Actions revisions. Builds use
  Rust 1.99 with minimum Rust 1.90 support.
- Updates the UI build dependency source-map-js to 1.2.2, addressing
  [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
  Audit gates and advisory handling remain intact. Details are in the
  [October dependency review](https://github.com/bliatun-code/Filament-Manager/blob/v0.32.0/docs/DEPENDENCY_REVIEW_2026-10-13.md).
- Limits optional Rust cache maintenance to its time budget and treats
  cache-storage failures as nonblocking for successful verification.
- Prepares synthetic Host database setup before timed test requests and adds
  strict readiness, concurrent-host and cache checks. Corrected Windows PR
  and main verification passed without test reruns; production transport
  deadlines remain unchanged.

## Upgrade Notes And Review

- Update the Host and desktop Clients together.
- The database remains at **schema 7**; no new schema migration is introduced.
  The portable format remains `filament-manager-backup-v1`.
- Export a full backup before upgrading. Portable backups omit machine-local
  credentials and pairings; existing batch receipts remain installation-local.
- The completed visual review covers the documented desktop and Companion
  families across Light, Dark, Bambu and Prusa, with explicit Auto and inherited
  evidence. It is a synthetic expert review, not human usability research,
  exhaustive accessibility certification or physical-printer certification.
  See the [final coverage record](https://github.com/bliatun-code/Filament-Manager/blob/v0.32.0/docs/visual-modernization-2026-10-01/critic-current-ledger.md).

## Distribution

The tagged release workflow publishes these artifacts after its required gates
pass:

- Universal 2 macOS DMG for Apple Silicon and Intel, Developer ID signed,
  notarized and stapled, with `SHA256SUMS.txt`.
- Per-user Windows 11 x64 MSI with `SHA256SUMS-windows.txt`. The Windows
  installer remains unsigned.
- SPDX 2.3 source dependency SBOM and `SHA256SUMS-sbom.txt`.
- GitHub build provenance for the DMG and MSI.

[All source changes since v0.31.0](https://github.com/bliatun-code/Filament-Manager/compare/v0.31.0...v0.32.0).
