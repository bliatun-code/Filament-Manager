# Filament Manager v0.9.0-rc.6

Release date: 2026-04-12

## Highlights
- Sixth multi-device sync release candidate
- Focused client/host parity fixes plus final QC polish before the next host refresh
- Intended to update the Windows host so client testing can continue against the newly added statistics host API

## Client/Host Parity
- `Legg til printer / Add printer` on paired client now loads the shared supported printer-model list instead of opening with an empty selector
- `Refill / Reactivate roll` in the filament popup now works in paired client mode through the host-backed write flow
- `Statistikk / Statistics` now has a host API path for `Forbruk per printer -> Forbruk per filament`, so client can use the detailed per-printer filament breakdown after the host is updated to `rc.6`

## Weight & Loan Flow Fixes
- Return / hand-back dialogs now treat measured return weight as total roll weight including spool, while still storing net filament grams correctly
- `Lån ut / Loan out` now keeps `Gjenværende / Remaining` as filament-only display while the editable outgoing-weight field uses measured total weight including spool
- `Maks tilgjengelig / Max available` in the loan-out dialog now matches the measured outgoing-weight logic

## Printer & List QC Polish
- Shared filament display-title formatting now removes repeated `material + filament name` patterns across printers, loans, statistics, and settings
- Printer slot dropdown now has improved spacing, location placement, and cleaner metadata hierarchy
- `Nåværende filament / Current roll` on printer slots is reduced to a compact status row instead of repeating the same spool details already shown in the selector
- `Lån ut / Loan out` filament list now follows the calmer `Legg til filament / Add filament` list style more closely
- Printer cards now show actual configured setup (`1 AMS x 4`, `2 AMS x 8`, etc.) so `Reconfigure` results are visible immediately

## Dashboard & Statistics
- Dashboard `Utlånt / Loaned` health tile counts only active outbound loans
- Statistics borrower/printer filament breakdown popups now use the same deduplicated display titles and quieter secondary metadata

## Validation
- `npm run smoke` PASS on macOS
- `cargo check --manifest-path src-tauri/Cargo.toml` PASS
- Focused local QA marked PASS for:
  - client add-printer model list
  - client refill / reactivate in filament popup
  - printer reconfigure visibility
  - loan-out weight semantics and visual cleanup
  - statistics popup visual cleanup
  - printer-slot dropdown spacing and metadata cleanup

## Remaining Release Risk
- This is still a pre-release for cross-device sync testing
- The new statistics per-printer filament breakdown path requires both host and client to be on `v0.9.0-rc.6`
- Single-host library model only
- No multi-master sync
- No offline write queue
- No automatic host failover

## Next QA Focus
- Update the Windows host to `v0.9.0-rc.6`
- Re-test client against the refreshed host for the new statistics breakdown API
- Continue two-machine QC from the updated host baseline and fix forward toward `v0.9.0`
