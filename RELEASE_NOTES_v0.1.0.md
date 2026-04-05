# Filament Manager v0.1.0

Release date: 2026-04-05

## Highlights
- Trusted-LAN browser companion is the supported web path.
- QR flow is unified:
  - spool detail popup shows generated QR
  - printed label QR resolves back to companion spool detail
  - payload parsing remains backward-compatible (legacy + versioned/deep-link forms)
- Label and print improvements:
  - single label print contains QR + vendor + material/filament/color
  - A4 in-stock overview is generated as landscape PDF with grouped layout
- iPhone/small-screen shell polish:
  - calmer root hierarchy
  - task-sheet/modal scroll and placement fixes
  - improved touch/action rhythm across Storage/Loans/Printers/Settings
- Trusted-LAN reset hardening:
  - `Reset app data` now clears trusted-LAN pairings/paired browsers as expected

## Validation Snapshot
- `npm run smoke`: PASS (ui build + companion tests + settings-ui tests + doctor)
- Release-candidate checklist exists in:
  - `/Users/bliatun/Documents/Codex/bambu-filament-manager/UI_RELEASE_CANDIDATE_CHECKLIST.md`

## Known Issues / Technical Debt
- Frontend bundling:
  - `settings` production chunk is currently above 500 kB warning threshold.
- Security housekeeping:
  - GitHub currently reports 2 moderate repository vulnerabilities (Dependabot advisory page).
- Manual visual QA still recommended before wide distribution:
  - macOS titlebar/backdrop behavior
  - live `Auto` theme switching with open modals
  - very wide fullscreen rhythm and dense-data readability checks

## Upgrade Notes
- Existing local data remains in:
  - `~/Library/Application Support/com.bambu.filament.manager/bambu.db`
- Existing trusted-LAN sessions may require re-pairing after `Reset app data` (expected behavior).

## Source of Truth
- Desktop app + local SQLite remain authoritative.

