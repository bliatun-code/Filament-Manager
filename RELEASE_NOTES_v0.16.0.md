# Filament Manager v0.16.0

Release date: 2026-06-20

## Highlights

- This release includes 250+ commits since `v0.15.1`, centered on Bambu Live diagnostics, AMS RFID onboarding, Bambu Filament Code intake, desktop/client batch scanning, and modal/UI polish.
- Added a fuller AMS onboarding flow for unknown RFID rolls, with existing-stock suggestions, Bambu catalog fallback, and direct owned or borrowed-in spool creation from a live slot.
- Integrated Bambu Filament Code lookup into the normal Add filament flow and added desktop/client batch entry for Bambu box codes.
- Added image barcode import and live webcam-assisted scanning for Bambu box labels, with scan feedback and safer duplicate handling.
- Moved Bambu batch entry into its own modal so normal catalog search, stock entry, wishlist, and order workflows stay visually connected.
- Tightened AMS shortlist matching for eSUN and Generic rolls by using Bambu Studio Other Color signals plus semantic color-name hints.

## Screenshot Tour

The release includes a small visual product tour with screenshots for the main
desktop workflows: [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md).

## Full Scope Since v0.15.1

- Expanded Bambu Live parsing and diagnostics for AMS slot presence bits, packed active-tray coordinates, external/virtual trays, AMS indexes, tray snapshots, job state, AMS status, nozzle ranges, nozzle thermal state, and live AMS weight estimates.
- Hardened live identity handling so Bambu preset/settings signals stay separate from physical RFID identity, while observed `tag_uid`, tray UUID, composite swatches, and partial tray snapshots are used more safely.
- Improved live printer telemetry and spool matching, including composite color sets, short Bambu series names, BambuStudio profile labels, multi-AMS coordinates, flat-tray scoping, stale payload handling, and implausible AMS percentage filtering.
- Added and validated shared Bambu data contracts: seeded catalog normalization, composite swatches, Bambu material family discovery, printer model/profile code references, seed catalog checks, and historical SQL migration smoke coverage.
- Built the AMS slot onboarding path for unknown RFID, catalog fallback, existing stock candidates, borrowed-in ownership, active slot state guards, stale-save blockers, and post-create RFID writes.
- Added Bambu Filament Code lookup across desktop/client and Companion, including active/discontinued history, ambiguous result handling, explicit selection requirements, localized copy, and shared conformance tests.
- Added Bambu batch intake for pasted/manual codes, keyboard-scanner style input, image barcode import, EAN/SKU alias handling, QR rejection, ZXing fallback, macOS camera permissions, mirrored video fallback, and live webcam scan feedback.
- Reworked modal sizing, full-screen behavior, batch scanner layout, inventory modal rhythm, and header actions so Add filament, lending, detail, and batch scanning dialogs feel more consistent.
- Tightened slot loading and write guards to exclude deleted, missing, inactive, loaned-out, unloaded, or already-bound spools from unsafe live RFID and slot-loading actions.
- Added broad UI, Companion, backend, diagnostics, and conformance coverage around the new Bambu code, RFID, slot onboarding, scanner, catalog fallback, and color-matching paths.
- Refreshed compatible lockfiles and kept dependency/release hygiene checks wired into the validation path.

## AMS And RFID Onboarding

- Unknown RFID slots can now offer one-click registration when there is a single strong stock candidate.
- Multiple stock candidates are shown as a short, explicit choice list before saving RFID.
- Bambu catalog matches can be turned into owned or borrowed-in spools directly from the slot before saving RFID.
- Occupied slots and manually assigned rolls keep stronger safeguards so live hints do not silently overwrite a deliberate assignment.
- Slot diagnostics and UI matching now share the same decision logic for stock candidates and catalog fallback.

## Bambu Box Codes

- The Add filament modal supports Bambu Filament Code lookup as part of the Bambu source flow.
- Batch entry accepts pasted codes, keyboard-scanner-style input, image import, and live webcam scanning in desktop/client builds.
- Bambu box EAN and SKU aliases can resolve to the matching five digit Filament Code when the printed barcode is easier to capture than the code text.
- Companion uses the same catalog validation rules for manual Bambu code lookup while staying camera-free over HTTP.
- Discontinued and ambiguous Bambu code results are surfaced for manual confirmation instead of being treated as ready matches.

## Bambu Live Diagnostics

- Diagnostic captures now include richer tray snapshots, AMS bit evidence, nozzle-range context, job/AMS status, source timestamps, and clearer signal-quality summaries.
- BambuStudio printer profile names and filament setting labels are normalized across host, UI, Companion, diagnostics, and tests.
- Live weight and remaining-percent displays reject impossible values and keep zero-weight loaded rolls recoverable.
- Preset-only Bambu settings are treated as hints, not RFID identity, reducing unsafe automatic roll replacement.

## Catalog And Data Contracts

- Seed catalog checks verify unique entries, normalized swatches, and safer duplicate handling.
- Bambu material, color, support-material, and printer model references are shared and validated instead of being copied ad hoc.
- Historical SQL migration smoke tests verify old checked-in schemas upgrade to the current schema.
- Composite swatches are accepted through Companion writes and used consistently in live matching.

## UI Polish

- Batch add now opens as a dedicated Bambu boxes modal rather than interrupting the normal search result list.
- Wide modals use more consistent sizing, column behavior, close controls, and fixed action placement.
- Webcam scanning now keeps scan results visible beside the camera pane and avoids heavy UI churn while the camera is active.
- Norwegian labels and helper copy were tightened across the new Bambu code and RFID flows.

## Validation

- `npm run verify` PASS
- `npm run test:ui` PASS
- `npm run lint:ui` PASS
- `npm --prefix ./ui run build` PASS
- `cargo update --dry-run` PASS with no compatible lockfile updates
- `git diff --check` PASS
