# Filament Manager v0.9.0-rc.5

Release date: 2026-04-11

## Highlights
- Fifth multi-device sync release candidate
- Small QC-driven fixes on top of the current host/client baseline
- Intended to refresh the Windows host and continue two-machine sync validation

## QC Fixes
- Printer-slot filament dropdown is now alphabetically sorted across `local-only`, `host`, and `client`
- `Lån ut / Loan out` popup now uses the same alphabetical filament ordering across `local-only`, `host`, and `client`
- Dashboard `Utlånt / Loaned` health tile now counts only active outbound loans and no longer includes borrowed-in rolls
- Paired-client printer creation now follows host-write gating on save, so the modal no longer opens successfully and then stalls on submit

## Shared UI/Data Consistency
- Added a shared spool sorter so the same alphabetical filament ordering can be reused across printer and loan candidate lists
- Dashboard loan health math now uses the explicit loan direction instead of relying on mixed active-loan snapshots

## Validation
- `npm run smoke` PASS on macOS
- Focused UI build/test validation PASS for:
  - printer-slot sort
  - loan-out sort
  - dashboard loaned counter fix
- Local QA marked PASS for:
  - printer-slot filament sort
  - loan-out filament sort
  - dashboard `Utlånt / Loaned` counter

## Remaining Release Risk
- This is still a pre-release for cross-device sync testing
- Single-host library model only
- No multi-master sync
- No offline write queue
- No automatic host failover
- Older manual macOS visual `NEEDS CHECK` items in `UI_RELEASE_CANDIDATE_CHECKLIST.md` still remain as broad-rollout confidence work

## Next QA Focus
- Update the Windows host to `v0.9.0-rc.5`
- Continue host/client QA against the refreshed host build
- Re-check the recently fixed dashboard/printer/loan sorting behaviors on real host + client machines
- Fix forward from `v0.9.0-rc.5` until the sync release is steady enough for `v0.9.0`
