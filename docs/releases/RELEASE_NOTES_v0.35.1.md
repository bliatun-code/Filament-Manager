# Filament Manager v0.35.1

Release date: 2026-10-27

## Companion and dialogs

- Keep Companion spool dialogs usable when the iPhone keyboard opens, without unwanted input zoom or a shifted inventory view afterwards.
- Make desktop loan dialogs scroll so their actions remain reachable.

## Printer matching and weights

- Refresh observed-roll matches immediately after RFID registration or adding a roll from the catalog.
- Show duplicate RFID bindings in the printer view and allow removing a saved RFID in spool properties.
- Open outgoing weighing directly from the action to clear a blocking roll.
- Skip another manual weigh-in when a fresh, unique RFID/AMS match already confirms the stored weight. Other rolls retain outgoing weighing.
- Make repeated, stable AMS weight discrepancies visible for review before accepting the estimate.

## Catalog and interface

- Avoid false eSUN access cooldowns for ordinary HTTP errors and unexpected page formats, while retaining cooldowns for access challenges.
- Simplify repeated form text, keep catalog feedback on its own tab and let successful update summaries expire.
- Align the Low Stock and Printers headers, soften dashboard hover feedback and make Host-managed settings clearer on Clients.

Existing libraries are preserved. Update the Host and desktop Clients together
to use the improved shared-library printer workflows on every device.
