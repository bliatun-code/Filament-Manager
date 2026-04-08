# Filament Manager v0.8.1

Release date: 2026-04-08

## Highlights
- Inventory counter consistency:
  - the visible spool counter now uses the same filtered dataset in both card and list views
  - counter placement is moved to the material filter row for a cleaner filter-panel flow
- Dashboard ownership totals now reflect on-hand operational stock:
  - top spool total and in-use summary now derive from `IN_STOCK` + `IN_USE`
  - ownership cards (`Owned on hand`, `Borrowed in on hand`) now align with the same on-hand rule set
- A4 inventory print ownership visibility:
  - borrowed-in spools remain included in overview printouts
  - borrowed-in context is shown compactly in the vendor line instead of adding extra ownership chips

## Validation
- `npm run smoke` PASS

## Notes
- This release publishes notes/tag only; DMG is built locally but not uploaded to GitHub assets.
