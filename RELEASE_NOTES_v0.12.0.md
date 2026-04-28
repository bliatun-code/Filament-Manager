# Filament Manager v0.12.0

Release date: 2026-04-28

## Highlights
- Cleaner release baseline after removing older release drafts, historical tags, and internal working notes from the public repository
- Desktop Settings now has a calmer web-app toggle and tighter subtab treatment
- Light-mode contrast and shared app surfaces are stronger across the desktop UI
- Browser companion UI is calmer in light and dark mode, with restored printer brand tinting and better swatch visibility
- Browser companion internal QR scanning and manual QR lookup have been removed while printed QR / camera-app deep links remain supported

## UI Polish
- Settings library/web-app controls now use a single accessible switch in standalone mode
- The Settings web-app switch now keeps a calmer, readable active state in dark mode
- Settings subtabs, inventory filters, badges, and shared surfaces have been tightened for a cleaner operational feel
- Dashboard usage widgets are more stable during refresh
- Companion light mode has clearer contrast, calmer cards, stronger swatches, and printer cards that preserve vendor color intent

## Companion QR Cleanup
- Companion camera QR scanning and manual QR lookup controls have been removed from the browser UI
- The scanner module is no longer served in the companion bundle
- Printed QR labels and external camera-app links still open matching spool detail through `spool_qr` / `qr_code` deep links
- Browser companion slot assignment now keeps the intended clear-then-assign flow when a slot is already loaded

## Client / Host Stability
- Paired-client statistics ownership cards now derive from host spool and usage rows when available
- Paired-client printer live indicators are more stable by using fresh slot snapshot evidence as a fallback
- Client settings can use host inventory data for relevant library paths
- Host QR links are used in client A4 inventory prints

## Refactoring
- Printer slot write, display-state, slot-model, form-model, measured-weight, live-display, and data-source helpers have been extracted
- Inventory, dashboard, loan, statistics, and settings helper layers are more centralized
- Browser companion asset registration is centralized

## Dependencies
- `postcss`, `openssl`, and `rustls-webpki` dependency updates are included
- Transitive `rand` lockfile handling is kept aligned with the current Tauri dependency chain

## Validation
- `npm run smoke` PASS
- `cargo check --manifest-path src-tauri/Cargo.toml` PASS
- `cargo test --manifest-path src-tauri/Cargo.toml` PASS
- `git diff --check` PASS

## Notes
- Older local release-draft history, obsolete release objects, and older tags have been removed so this release can serve as the current clean baseline.
- GitHub `latest` remains the source of truth for downloadable DMG/MSI assets
