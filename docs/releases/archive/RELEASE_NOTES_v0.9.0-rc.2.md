# Filament Manager v0.9.0-rc.2

Release date: 2026-04-09

## Highlights
- Second multi-device sync release candidate
- First RC remains the functional sync milestone; this RC focuses on release-pipeline hardening for Windows MSI prerelease builds
- Desktop library roles: `Standalone`, `Host`, `Client`
- Host validation, linking, and desktop pairing for protected writes
- Client read-through + cached fallback for Dashboard, Inventory, Printers, and Loans
- Client-to-host daily operations now include:
  - spool weight and tare updates
  - spool location and status updates
  - printer slot assignment
  - loan out, return, and hand-back
  - add spool flows
  - wishlist administration
  - printer create, update, and delete
- Controlled host handoff path via backup/import + role switch

## Pipeline Hardening
- Windows release workflow now normalizes prerelease bundle versions so MSI builds can succeed from prerelease tags like `v0.9.0-rc.2`
- Manual workflow dispatch now falls back to `package.json` version instead of misreading branch names as app versions

## Validation
- `npm run smoke` PASS on macOS
- Focused Rust sync/trusted-LAN tests PASS
- GitHub Actions release workflow now passes the Windows prerelease-version gate that blocked `v0.9.0-rc.1`
- This release is intended for manual host/client QA across real machines

## RC Scope
- This is a pre-release for cross-device testing, not the final sync release
- Single-host library model only
- No multi-master sync
- No offline write queue
- No automatic host failover

## Manual QA Focus
- Validate Mac host <-> Windows client and Windows host <-> Mac client
- Confirm live/cached/offline behavior
- Confirm protected write flows after desktop pairing
- Confirm backup/import host handoff behavior
