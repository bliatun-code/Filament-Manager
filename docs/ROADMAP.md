# Filament Manager – Extended Plan

## Current phase goals (stabilization + production readiness)

1. **Data integrity hardening**
   - Add DB migration smoke tests for schema upgrades.
   - Add FK-safe location assignment tests for printer + loan flows.
   - Add rollback-safe command patterns for all multi-step mutations.

2. **Workflow completion**
   - Finalize loan lifecycle UX (active + history + return).
   - Complete printer-linked usage flows across inventory and printers tabs.
   - Add strict status transition rules (e.g. disallow invalid state jumps).

3. **Dashboard accuracy**
   - Replace all placeholder widgets with live metrics.
   - Add explicit “last updated” timestamps from DB records.
   - Add quick actions from dashboard cards into context pages.

4. **UX consistency**
   - Normalize section spacing, button hierarchy and status color semantics.
   - Standardize confirmation patterns for destructive actions.
   - Ensure dark/light/auto works consistently across all pages.

5. **Reliability + security**
   - Add command-level input normalization and bounds checking.
   - Add explicit rate-limits / retries for network-backed catalog refresh.
   - Ensure all exports are sanitized and bounded by safe limits.

---

## Next 20 feature proposals

1. Add **bulk roll actions** (set status/location on multiple rolls).
2. Add **undo window** (10–30s) for delete/mark-empty actions.
3. Add **printer presets** (X1/P1/A1 templates with default AMS config).
4. Add **AMS drag-and-drop** slot assignment UI.
5. Add **job import** from slicer logs to auto-fill print usage.
6. Add **loan due date + overdue alerts**.
7. Add **borrower profile cards** with usage trends and active loans.
8. Add **roll valuation** (cost per gram + remaining value).
9. Add **purchase lot tracking** (same order/batch grouping).
10. Add **shelf/bin map** view for physical storage layout.
11. Add **saved filter views** (e.g. “Low stock PLA”, “Borrowed PETG”).
12. Add **label templates** with QR + color swatch variants.
13. Add **API token storage hardening** (OS keychain integration).
14. Add **offline catalog snapshot versioning** + rollback.
15. Add **activity feed filters** (printer, person, spool, date range).
16. Add **anomaly detection** (unexpected gram drops/spikes).
17. Add **CSV/JSON import wizard** for migrating from spreadsheets.
18. Add **multi-user audit trail** (who changed what and when).
19. Add **daily auto-backup** with retention policy.
20. Add **health dashboard** (DB integrity checks + sync diagnostics).
