# Filament Manager v0.20.1

Release date: 2026-07-10

## Highlights

- Refined the responsive desktop layout across dashboard, inventory, loans,
  printers, statistics, and settings, with more stable behavior in narrower
  desktop windows.
- Reworked printer overview cards so assigned filament swatches and material
  names remain visible while slot details are collapsed. Bambu Live telemetry
  now has a stable, aligned row for state, temperatures, and AMS conditions.
- Improved inventory and loan workflows with searchable queues, clearer result
  counts, return summaries, bounded roll history, and explicit confirmations for
  destructive or unsaved actions.
- Improved printer configuration, slot selection, Bambu Live diagnostics, and
  Trusted-LAN/library settings with clearer status, guided role changes, and
  safer handling of unsaved edits.
- Strengthened keyboard navigation, focus handling, dialog naming, form labels,
  and accessible relationships across the main desktop workflows.
- Normalized spool, ownership, status, and loan data at UI, export, and data
  source boundaries.
- Expanded data-backed visual QA, refreshed the public product tour, and added a
  30-second live-data readiness wait for Companion printer screenshots.
- Fixed Windows smoke verification for CRLF checkouts.

## Included Since v0.20.0

- Added wishlist/order search, status filtering, result counts, stocking, and
  removal controls.
- Added guarded inventory danger-zone confirmations and clearer return flows for
  outgoing and borrowed-in filament.
- Added localized roll-history summaries with event counts and bounded expansion
  for long timelines.
- Added compact collapsed-slot summaries that also work for manually assigned
  filament on printers without live integration.
- Kept Bambu Live job state, nozzle/bed temperature, AMS humidity, and AMS
  temperature together longer as printer cards narrow.
- Added a local library device name and a guided Standalone/Host/Client role
  change review.
- Added discard protection for dirty printer reconfiguration and improved the
  compact editor layout.
- Separated catalog vendor audit from applying selected material updates.
- Added richer desktop QA scenarios for wishlist, history, inbound returns,
  printer setup/editing, library role changes, and loan statistics.
- Refreshed all existing product-tour images and added seven new workflow images
  using English, dark mode, and a rich temporary copy of the local library.
- Updated npm patch dependencies and strengthened Windows-compatible repository
  checks.

## Notes For Testers

- Collapsed printer cards should show each assigned slot's swatch and material
  without opening **Show slots**, including manually configured non-live
  printers.
- A live Bambu printer should show printer state, nozzle/bed temperature, AMS
  humidity, AMS temperature, and observed slot colors after the live connection
  has populated.
- Library role changes and dirty printer edits should require deliberate review
  before data or local edits are replaced.
- Product-tour captures use a temporary database copy; screenshot generation
  does not modify the live library.
- macOS builds are ad-hoc signed and are not notarized unless built with an
  external signing identity.
- Windows MSI artifacts are produced by GitHub Actions and can take around 20
  minutes to finish.

## Validation

- `npm run verify` PASS
- Desktop product-tour screenshot gates PASS at 1200x800
- Printer/RFID/diagnostic screenshot gates PASS after a 30-second live-data wait
- Companion wide/tablet/phone screenshot gate PASS
- `git diff --check` PASS

