# UI Release Candidate Checklist (Desktop/Mac)

Last updated: 2026-04-05
Scope: Desktop app UI only (not browser/trusted-LAN shell)

Status legend:
- `PASS` = implemented and validated through current smoke/build/test baseline
- `NEEDS CHECK` = requires manual visual validation in real Mac app

## Global
- `PASS` Shared feedback banners are consistent across pages.
- `PASS` Secondary modal chrome is largely unified.
- `PASS` Major duplicate side panels removed where they duplicated dedicated pages.
- `NEEDS CHECK` Native macOS titlebar/backdrop blur behavior in real windowed/fullscreen usage.
- `NEEDS CHECK` Live `Auto` theme switching (light <-> dark) while pages and modals are open.

## Dashboard
- `PASS` Wide/fullscreen chart scaling and lower-card reflow fixes landed.
- `PASS` Progress goals now use real data (not placeholder percentages).
- `PASS` Effective slot logic honors `EXT` vs `AMS` exclusivity.
- `PASS` Refresh path hardened for fullscreen edge cases.
- `NEEDS CHECK` Very wide fullscreen visual rhythm and spacing on real Mac display.

## Inventory
- `PASS` Inventory-side `Loaned out rolls` panel removed (duplicate of Loans workflow).
- `PASS` Add filament modal filter language unified (segmented controls).
- `PASS` Wishlist/order area hierarchy simplified and less chip-noisy.
- `NEEDS CHECK` Very long filament names/references in card and modal layouts.
- `NEEDS CHECK` Dark-mode readability with large mixed datasets in add-filament queue.

## Loans
- `PASS` Loans-side `Usage by person` panel removed (duplicate of Statistics).
- `PASS` Top summary strip removed; page now goes directly to operational list.
- `PASS` Spool references shortened to same style as Inventory (`#xxxxxx`).
- `PASS` History/return flows remain functional and smoke-validated.
- `NEEDS CHECK` Dense-card readability when many active/returned rows coexist.

## Printers
- `PASS` Add-printer dialog aligned with white light-mode modal baseline.
- `PASS` Save-only/update-weight popup now follows shared light-mode modal standard.
- `PASS` Form controls in weight popup updated for better contrast/readability.
- `NEEDS CHECK` Native number input steppers/focus ring contrast on macOS light mode.
- `NEEDS CHECK` Dark-mode swatch/tint intensity consistency across vendor-heavy data.

## Statistics
- `PASS` Borrower usage list now has inline filters (`All`, `Active`, `Completed`).
- `PASS` Default view for borrower usage list is now `Active`.
- `PASS` Breakdown modal structure and filter surfaces are consistent with newer baseline.
- `NEEDS CHECK` Empty/filter states in real usage when filter returns no rows.

## Settings
- `PASS` Shell hierarchy and tab rhythm are aligned with rest of desktop app.
- `PASS` Browser access section reduced in visual noise and improved theme consistency.
- `PASS` Misplaced passive `Validate backup file` pill removed from maintenance header.
- `NEEDS CHECK` Browser access + pairing + maintenance visual balance in real dark mode on Mac.

## Final Gate Before Declaring UI Review Complete
1. Run one manual pass in light mode across all pages.
2. Run one manual pass in dark mode across all pages.
3. Switch to `Auto` and verify live transitions while at least one modal is open.
4. Test one fullscreen pass on `Dashboard`, `Inventory`, `Loans`, `Statistics`.
5. Confirm no visual regressions in `Add filament`, `Loan out`, `Update weight`, `Add printer` dialogs.

## v0.1.0 Gate Snapshot (2026-04-05)
- Automated baseline:
  - `npm run smoke` PASS
- Still manual:
  - every `NEEDS CHECK` item above remains a real-device/manual gate before broad release rollout
