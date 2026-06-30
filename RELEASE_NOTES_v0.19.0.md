# Filament Manager v0.19.0

Release date: 2026-07-01

## Highlights

- Polished the desktop inventory UI with shared modal buttons, form controls,
  detail labels, focus-visible states, and compact settings/action primitives
  across inventory, loans, printers, statistics, and settings.
- Reworked the add-filament flow with a stronger selected-filament preview,
  swatch-colored catalog rows, clearer hover outlines, and swatch-colored
  create/wishlist actions.
- Reworked loan-out dialogs so the selected spool, loan details, and main
  action now read as one swatch-colored selection surface.
- Improved RFID capture and Bambu Live AMS behavior by showing live slot state,
  stabilizing captured-field status, and using current live AMS activity for
  spool sighting recency when appropriate.
- Brought the companion/webapp closer to the desktop design language with
  swatch-colored filament rows, hover outlines, selected-action buttons, and
  colored loan/add-filament action cards.

## Included Since v0.18.0

- Shared UI primitives for modal close buttons, roomy/solid modal actions,
  form controls, detail labels, danger-zone actions, compact settings controls,
  weight inputs, wishlist actions, printer slot actions, statistics filters,
  dashboard actions, inventory roll buttons, and stock source actions.
- Added focused keyboard-visible states to add modal batch actions, printer
  slot pickers, loan history actions, statistics filters, and loan-out inputs.
- Added selected-filament previews to the add-filament desktop modal and tuned
  add-filament catalog row hover halos to match the selected swatch color.
- Reworked the loan-out spool picker with shared swatch row styling, stronger
  hover treatment, and a unified selected-spool detail/action panel.
- Simplified verbose live AMS sighting copy and fixed spool sighting recency
  when the spool is loaded or active in AMS but the RFID identity timestamp is
  older.
- Added live slot status to RFID capture and stabilized the captured-field
  loading/count state to prevent rapid flicker.
- Kept long RFID and spool reference content readable by widening reference
  detail layouts.
- Polished companion storage/add-filament, loan picker, and loan create sheets
  with swatch surfaces, swatch action buttons, and matching hover outlines.
- Normalized companion CSS variable reporting so CSS contract failures point at
  stable companion paths.
- Refreshed compatible npm patch dependencies for PostCSS and the Tauri CLI.

## Notes For Testers

- The largest behavioral fix is AMS sighting freshness: loaded or active AMS
  spools can now show the printer's latest live AMS activity instead of an old
  RFID identity timestamp when that is the most accurate signal.
- The companion/webapp visual treatment has changed in add-filament and loan
  workflows; check both desktop-sized and narrow browser layouts.
- macOS builds are still ad-hoc signed and not notarized unless built with an
  external signing identity.
- Windows MSI artifacts are produced by GitHub Actions and can take around
  20 minutes to finish.

## Validation

- `npm run smoke` PASS
- `npm run test:rust` PASS
- `git diff --check` PASS
