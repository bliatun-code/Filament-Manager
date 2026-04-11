# Filament Manager v0.9.0-rc.3

Release date: 2026-04-11

## Highlights
- Third multi-device sync release candidate
- Focused on real host/client QA follow-up after `v0.9.0-rc.2`
- Client-host sync polish now covers the full core desktop surface:
  - `Oversikt / Dashboard`
  - `Lager / Inventory`
  - `Printere / Printers`
  - `Utlån / Loans`
  - `Statistikk / Statistics`
  - `Legg til filament / Add spool` popup
- Client filament detail popup now reads host history/usage and supports host-backed danger-zone actions

## Settings and Role Flow
- `Bibliotek og webapp` is reworked into a role-first flow
- Role changes now use guided popups with the correct behavior per transition:
  - backup + verification where required
  - no unnecessary backup prompts for `Klient -> Kun lokal` or `Klient -> Vert`
  - explicit two-step confirmation for role changes
- Client pairing now starts from a pairing link and avoids mixing host URL and token concepts in the main flow
- Host mode now treats the webapp as host-owned and always-on when the device is in `Vert`
- Advanced host details are reduced to diagnostics and cached snapshot details only

## Client Workflows Hardened
- `Legg til filament` on client now loads host catalog and wishlist data reliably, including compatibility fallback for older host builds
- Client dashboard and statistics views now tolerate partial host/cached data better instead of collapsing to empty states
- Client inventory/printers/loans/statistics alignment with host has been tightened through manual QA

## Validation
- `npm run smoke` PASS on macOS
- Focused Rust companion/sync tests PASS
- Manual host/client QA checkpoints are green for:
  - Dashboard
  - Inventory
  - Printers
  - Loans
  - Statistics
  - Add spool popup

## RC Scope
- This is still a pre-release for cross-device sync testing
- Single-host library model only
- No multi-master sync
- No offline write queue
- No automatic host failover

## Next QA Focus
- Build and validate the refreshed Windows host from this RC
- Continue client-side operational testing against the updated host baseline
- Fix forward from `v0.9.0-rc.3` until the sync release is steady enough for `v0.9.0`
