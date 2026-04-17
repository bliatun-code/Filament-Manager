# Filament Manager v0.9.0-rc.9

Release date: 2026-04-13

## Highlights
- Ninth multi-device release candidate
- Focused browser-companion parity RC for trusted-LAN usage on iPhone, iPad, and desktop browsers
- Brings browser `Printers`, `Loans`, spool detail, and small-screen `Storage` closer to the same operational rules and calmer polish already validated in the desktop app

## Browser Printers Parity
- browser `Printers` now treats slot assignment and slot clearing as weigh-in / weigh-out workflows instead of immediate admin actions
- `Load filament` only completes when incoming measured weight is saved
- `Clear slot` now requires outgoing measured weight before the slot is emptied, so printer-linked usage stays aligned with desktop behavior
- slot candidate lists are filtered to remove unavailable rolls and now sort alphabetically like the desktop pickers
- large-screen printer selection is more compact, and single-printer setups no longer waste a dedicated roster column
- Prusa slot labels now follow printer type correctly in the browser (`MMU3` channels vs `XL` toolheads)

## Browser Loans And Detail Flow
- browser `Utlån / Loans` now owns outbound loan creation through its own filtered spool picker and required outgoing weighing flow
- browser return and hand-back flows now use measured total weight including the spool, then save net filament grams correctly to backend/statistics
- filament detail in the browser no longer exposes loan creation controls, keeping loan operations in the `Loans` flow where weigh-in / weigh-out rules are explicit
- spool detail regained editable `status` and `location`, with both `Details` and `History` collapsed by default and preserved across rerenders

## Browser Small-Screen And Modal Polish
- browser detail popup top chrome no longer repeats the same filament title twice
- loan picker sheets remove duplicated helper text inside the scrollable list
- the narrowest mobile `Storage` layout now keeps weight/status aligned to the right so card heights stay more even and predictable

## Validation
- `npm run smoke` PASS on macOS
- `cargo check --manifest-path src-tauri/Cargo.toml` PASS
- `node scripts/run-companion-tests.mjs` PASS
- companion test baseline: `131 / 131` green
- manual browser QA PASS for:
  - iPhone-focused `Storage` density and narrow-width list rhythm
  - browser `Printers` weigh-in / weigh-out flows
  - browser `Utlån / Loans` weigh-out / return / hand-back flows
  - browser spool detail status/location save flow
  - browser spool/detail rerender stability
  - browser large-screen printer roster compaction

## Remaining Release Risk
- This is still a pre-release for cross-device sync and browser-companion validation
- Single-host library model only
- No multi-master sync
- No offline write queue
- No automatic host failover

## Next QA Focus
- Update host and browser clients to `v0.9.0-rc.9`
- Run parallel real-device browser validation on iPhone, iPad, and desktop browsers
- If no new browser regressions appear, treat the current sync/browser baseline as closeout-ready
