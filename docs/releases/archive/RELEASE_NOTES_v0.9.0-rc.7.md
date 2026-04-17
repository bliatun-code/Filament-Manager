# Filament Manager v0.9.0-rc.7

Release date: 2026-04-12

## Highlights
- Seventh multi-device sync release candidate
- Fast-follow host hotfix for the paired-client snapshot regression discovered right after `rc.6`
- Intended to refresh the Windows host so client testing can continue against the new statistics host API and the repaired snapshot path

## Host Snapshot Hotfix
- Fixed a host-side active-loan row mapping regression after `spool_tare_weight_g` was added to the snapshot query
- Paired-client host snapshot reads should no longer fail on `NULL` tare values with `Invalid column type Null at index: 18, name: spool_tare_weight_g`
- Protected paired-client writes that depend on the refreshed host snapshot path, such as spool location updates, should stop failing with the same host-side `500` error

## Carried Forward From rc.6
- `Legg til printer / Add printer` on paired client now loads the shared supported printer-model list instead of opening with an empty selector
- `Refill / Reactivate roll` in the filament popup now works in paired client mode through the host-backed write flow
- `Statistikk / Statistics` now has a host API path for `Forbruk per printer -> Forbruk per filament`, so client can use the detailed per-printer filament breakdown after the host is updated
- Return / hand-back dialogs treat measured return weight as total roll weight including spool while still storing net filament grams correctly
- `Lån ut / Loan out` keeps `Gjenværende / Remaining` as filament-only display while the editable outgoing-weight field uses measured total weight including spool
- Shared filament display-title formatting removes repeated `material + filament name` patterns across printers, loans, statistics, and settings
- Printer slot dropdown and loan-out filament list use the calmer compact styling that was marked PASS in local QA

## Validation
- `npm run smoke` PASS on macOS
- `cargo check --manifest-path src-tauri/Cargo.toml` PASS
- Focused host regression check:
  - active-loan snapshot mapping updated to match the new tare column layout

## Remaining Release Risk
- This is still a pre-release for cross-device sync testing
- The new statistics per-printer filament breakdown path still requires both host and client to be on the refreshed RC
- Single-host library model only
- No multi-master sync
- No offline write queue
- No automatic host failover

## Next QA Focus
- Update the Windows host to `v0.9.0-rc.7`
- Re-test paired-client host snapshot refresh (`Sjekk vert / Check host`)
- Re-test paired-client location update/write flow
- Re-test client against the refreshed host for the new statistics breakdown API
