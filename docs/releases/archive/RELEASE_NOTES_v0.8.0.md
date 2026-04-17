# Filament Manager v0.8.0

Release date: 2026-04-07

## Highlights
- Inventory detail lifecycle improvements:
  - edit spool location after creation
  - mark spool as lost / found
  - refill/reactivate flow for empty spools
  - automatic reactivation when measured weight indicates refill above spool tare
- Stock and low-stock logic now follows operational rules:
  - `All` inventory filter excludes empty spools
  - low-stock filter shows only `1-200 g`
  - low-stock excludes `EMPTY` and `LOST`
  - dashboard low-stock counters and ownership low-stock cards align with the same rule set
- Loan and printer safety constraints:
  - loan-out candidates now exclude assigned, borrowed-in, empty, lost, missing, and borrowed statuses
  - printer slot candidates now exclude non-usable statuses (`EMPTY`, `LOST`, `MISSING`, `BORROWED`)
- Continued UX hardening for add-flow/loan-flow/popup behavior and status messaging.

## QC Scope Checked
- Oversikt (Dashboard)
- Lager (Inventory)
- Legg til filament popup
- Utlån (Loans)
- Lån ut filament popup
- Utskrift lageroversikt
- QR etikett-utskrift

## Validation
- `npm run smoke` PASS
- `npm run doctor` PASS

## Notes
- Trusted-LAN remains desktop-controlled and opt-in.
- Home-LAN traffic remains unencrypted by design; pairing and session controls protect access.
