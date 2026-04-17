# Filament Manager v0.9.2

Release date: 2026-04-14

## Highlights
- Stable follow-up patch focused on calmer trusted-LAN browser polish and safer, less invasive vendor catalog refreshes
- eSUN and Bambu imports now both reuse local catalog state more intelligently during filtered refreshes
- Browser `Add filament` and `Settings` continue the move toward a cleaner, more desktop-aligned experience

## Vendor Catalog Import Improvements
- eSUN material refresh is now genuinely material-scoped instead of relying on broad search-style discovery
- eSUN uses listing-first filtering, stale-aware cache reuse, and a filtered detail-fetch budget to reduce vendor traffic
- Bambu filtered refresh now reuses fresh cached catalog entries before paying for detail fetches
- refresh summaries now report cached reuse and detail fetch counts so filtered runs are easier to understand

## Trusted-LAN Browser Polish
- `Add filament` is broader and visually closer to the desktop modal on larger screens
- selected filament context now drives the right-side action card styling more clearly
- duplicated helper copy and repeated metadata were trimmed from the intake flow
- browser `Settings` removes extra explanatory copy for a calmer, more focused layout
- browser side rail no longer repeats the trusted-LAN library ownership explanation

## Desktop Polish
- `Statistics` ownership overview no longer duplicates the borrowed-in consumption metric in the header

## Validation
- `npm run smoke` PASS on macOS
- `cargo check --manifest-path src-tauri/Cargo.toml` PASS
- `node scripts/run-companion-tests.mjs` PASS
- manual QA PASS for:
  - eSUN catalog import
  - Bambu catalog import
  - trusted-LAN browser `Add filament`
  - trusted-LAN browser `Settings`

## Next Focus
- keep `v0.9.2` as the stable baseline for day-to-day desktop + trusted-LAN browser use
- continue with browser/desktop polish and operational ergonomics rather than parity catch-up
