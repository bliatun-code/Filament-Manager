# Filament Manager v0.21.0

Release date: 2026-07-13

## Highlights

- Expanded the app from four published interface languages to 21: English,
  Norwegian Bokmål, German, French, Spanish, Brazilian Portuguese, Italian,
  Polish, Dutch, Czech, Simplified Chinese, Traditional Chinese, Japanese,
  Korean, Turkish, Ukrainian, Russian, Hungarian, Swedish, Danish, and Finnish.
- Replaced the growing language button grid with a compact native language
  selector in both the desktop app and Companion. The selector remains usable
  with a keyboard, screen reader, narrow phone, and long translated labels.
- Added complete desktop and Companion catalogs for every published language,
  locale-aware plurals and formatting, CJK/Cyrillic font coverage, and 43-view
  desktop plus 21-view Companion visual-QA matrices backed by a real library
  copy. Community corrections are invited through GitHub issues and pull
  requests.
- Added print-ready individual filament labels with physical-size preview,
  multiple label profiles, and 300-DPI PNG export to Downloads.
- Added matching A4 and US Letter inventory label sheets with multipage preview
  and PDF export to Downloads.
- Completed the shared Bambu code review workflow for typed, image, and webcam
  scanning input. OCR remains a separate later workflow.

## Language And Localization Work

- Centralized locale metadata, aliases, formatting locale, text direction,
  guide fallback, and publication state in one registry shared by desktop,
  Companion, Rust launch boundaries, and screenshot tooling.
- Added ICU-style parameter and plural handling, locale-aware dates, numbers,
  relative time, and sorting.
- Added structured localized error handling across desktop and Companion.
- Added LTR, RTL, and CJK pseudo-locales plus automated key, placeholder,
  fallback, font, keyboard, and screenshot contracts.
- German and French retain named review metadata. The additional complete
  catalogs are published for practical use and community feedback without
  claiming external native review.

## Label And Scanning Work Since v0.20.1

- Replaced hidden app-data HTML label output with portable PNG files in the
  user’s Downloads folder.
- Added P-Touch 60 × 24 mm, Compact, Standard, and Expanded single-label
  profiles with readable vendor, filament, material, and reference hierarchy.
- Added A4 and US Letter inventory sheets using the same label artwork and
  automatic pagination.
- Added cross-links between individual labels and inventory label sheets in the
  app and user guides.
- Updated camera and batch-scanning documentation to reflect the implemented
  webcam and image review flow.

## Community Translation Feedback

If wording is incorrect or unnatural, open a GitHub issue or pull request with
the language, screen, current text, and suggested replacement. Screenshots are
especially helpful for truncation and line-breaking problems.

## Validation

- Full `npm run verify` suite
- Complete data-backed desktop and Companion visual-QA matrices
- Locale completeness and zero-fallback review exports
- macOS DMG and Windows MSI release workflow
- Version and release-contract checks

## Notes

- English remains the canonical fallback and complete guide language.
- The macOS build is ad-hoc signed unless an external signing identity is
  supplied; it is not notarized by the project.
- Windows MSI and macOS DMG artifacts are built from the signed release tag by
  GitHub Actions.
