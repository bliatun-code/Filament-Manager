# Filament Manager v0.9.0-rc.4

Release date: 2026-04-11

## Highlights
- Fourth multi-device sync release candidate
- Focused on client/host operational fixes after real two-machine QA
- Windows host refresh target for the next QA loop

## Sync and Client Workflow Fixes
- Inventory, printers, loans, statistics, and settings now behave more consistently when the host is unavailable
- Client banners are quieter in `LIVE` mode and use clearer localized fallback copy in `CACHED` and `OFFLINE`
- Settings and trusted-LAN browser timestamps now use the same UTC-to-local interpretation as the rest of the app
- `Legg til filament / Add spool` in client mode now loads host catalog and wishlist data reliably, including compatibility fallback for older host route shapes

## Printers
- Printer slot swaps from a paired client now support the full measured-weight flow again
- Outgoing spool measurements now record host-side print usage instead of only overwriting weight, so statistics and printer-linked usage stay aligned
- Slot reassignment through the host sync path no longer stalls the incoming/outgoing weight dialog on successful save

## Settings and Role Flow
- `Bibliotek og webapp` remains role-first and popup-driven
- Role transitions now follow the intended matrix:
  - backup + verification where required
  - no unnecessary backup prompts for `Klient -> Kun lokal` or `Klient -> Vert`
- Client pairing copy is calmer and clearer, and advanced host details stay focused on diagnostics only
- Host mode keeps webapp as host-owned and always-on once the device is in `Vert`

## Validation
- `cargo check --manifest-path src-tauri/Cargo.toml` PASS
- `npm run smoke` PASS on macOS
- Manual host/client QA remains green for:
  - Dashboard
  - Inventory
  - Printers
  - Loans
  - Statistics
  - Add spool popup
  - Filament detail popup

## RC Scope
- This is still a pre-release for cross-device sync testing
- Single-host library model only
- No multi-master sync
- No offline write queue
- No automatic host failover

## Next QA Focus
- Update the Windows host to `v0.9.0-rc.4`
- Continue host/client operational testing against the refreshed host baseline
- Fix forward from `v0.9.0-rc.4` until the sync release is steady enough for `v0.9.0`
