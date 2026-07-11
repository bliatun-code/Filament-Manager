# Filament Manager v0.20.2

Release date: 2026-07-11

## Highlights

- Added a print-ready single-roll label builder in filament details with a
  polished preview, multiple physical label profiles, and 300 DPI PNG export
  directly to Downloads.
- Added a matching inventory label-sheet builder in Settings with A4 and US
  Letter page formats, multipage preview, and PDF export directly to Downloads.
- Improved label readability with a shared vendor, filament name, material, and
  reference hierarchy. Repeated material names are removed, long Bambu and eSUN
  identities split cleanly across lines, and generic or third-party filament
  names remain compact.
- Added small cross-workflow hints so single-label printing points to the full
  inventory sheet and the sheet builder points back to individual roll labels.
- Expanded data-backed visual QA for the single-label and inventory-sheet
  builders and refreshed their product-tour and user-guide coverage.
- Updated camera and batch-scanning documentation to reflect the completed
  shared review workflow for typed codes, images, and webcam input. OCR remains
  a later explicit batch workflow.

## Included Since v0.20.1

- Replaced the hidden app-data HTML label output with portable PNG files in the
  user's Downloads folder.
- Added P-Touch 60 × 24 mm, compact, standard, and expanded single-label
  profiles with print dimensions and resolution embedded in the output.
- Added consistent label artwork across single-roll images and inventory PDF
  sheets, including top-aligned vendor text and clearer spacing before the roll
  reference.
- Added A4 and US Letter inventory sheets with 60 × 24 mm labels, automatic
  pagination, page navigation, and filtering to available inventory rolls.
- Added localized English and Norwegian guidance for both label workflows.

## Notes For Testers

- Open a roll in Inventory and use **Create QR label** to preview each label size
  and save a PNG to Downloads.
- Confirm long Bambu and eSUN names stay readable without duplicating the
  material, and that generic or third-party labels keep useful product text.
- Open Settings → General and use the inventory label-sheet action to switch
  between A4 and US Letter, navigate multiple preview pages, and save the PDF to
  Downloads.
- The single-label panel should mention the full inventory sheet, while the
  sheet builder should explain where to print one roll at a time.
- Product-tour captures use a temporary copy of the local library; screenshot
  generation does not modify the live database.
- macOS builds are ad-hoc signed and are not notarized unless built with an
  external signing identity.
- Windows MSI artifacts are produced by GitHub Actions and can take around 20
  minutes to finish.

## Validation

- `npm run verify` PASS
- Data-backed desktop label screenshot gates PASS
- A4 and US Letter PDF render checks PASS
- `git diff --check` PASS
