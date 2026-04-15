# Filament Manager v0.10.0

Release date: 2026-04-15

## Highlights
- First stable release with opt-in Bambu live printer support for local read-only AMS and printer context
- RFID capture is now built into the filament workflow, so Bambu spool identity can be read from AMS slots and saved directly on rolls
- Printer slots now distinguish between persistent assignment and live use more clearly, with `ASSIGNED` replacing overloaded `IN_USE` semantics
- Diagnostics capture is now much more useful for research, with seeded sessions, field-change tracking, and richer CSV export

## Bambu Live + RFID
- `Live Bambu status (beta)` is now available as an opt-in integration for Bambu Lab printers
- live printer cards retain `last known good` AMS / tray identity instead of falling back aggressively during quiet MQTT periods
- AMS slot identity can be captured from any live AMS slot in the RFID popup and saved onto the selected filament
- cached slot data is reused in the RFID popup so the capture view opens with the last known AMS state instead of a blank panel
- inventory search now also matches RFID values

## Printer + Slot Workflow
- slot ownership now uses `ASSIGNED` as the persistent inventory state
- the `I bruk` badge is now a live printer signal instead of a stored spool status
- live Bambu auto-matching and slot emptying were tightened to avoid overreacting to stale or ambiguous tray data
- EXT remains a manual slot and no longer inherits AMS-specific live identity or remaining-filament assumptions

## Diagnostics + Analysis
- observed-details capture now starts as an explicit session when the diagnostics panel opens
- sessions are seeded from the last known live state, then enriched while the panel stays open
- capture tables now preserve last-known tray information across mixed MQTT payloads
- CSV export includes both field summaries and per-sample logs for better offline analysis

## Localization + UI Polish
- newly added RFID and live-printer UI now has better Norwegian coverage
- 3D printer settings buttons and inventory intake prompts were aligned with the current language model
- RFID and filament-history sections now default to calmer collapsed states where appropriate

## Security / Dependency Notes
- upgraded `rand` to `0.9` and adjusted local compatibility callsites so the current Dependabot security fix path builds cleanly

## Validation
- `npm run build` PASS
- `cargo check` PASS

## Next Focus
- evaluate whether to promote the most stable live Bambu fields beyond diagnostics into more prominent everyday UI
- continue refining printer-consumption logging from live data without overcommitting to automatic print-job semantics
