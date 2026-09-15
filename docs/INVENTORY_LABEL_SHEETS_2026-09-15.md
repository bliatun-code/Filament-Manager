# Inventory label sheet lifecycle — 2026-09-15

This batch starts from PR #127's merge, `3d45019d`, and covers the existing
inventory label-sheet builder, for both all on-hand rolls and explicit selection.

## Changes

Each opening owns a session scoped to the current inventory workspace, library
role, Host URL, library ID, target generation and locale. Closing the dialog,
navigating between inventory workspaces, changing authority or unmounting retires
that session. Returning to the same Host never revives an old session.

Synchronous phase guards prevent duplicate preparation and PDF exports before
React renders loading/saving state. Old save and close callbacks cannot act on a
newly opened builder. Preparation checks its session after module/URL resolution,
QR creation and PNG rendering; saving checks after PDF creation and native export.
Late results cannot change a new preview, clear its busy state or report into it.

A preparation error closes the failed builder and reports the existing error.
A save error preserves the preview for an explicit retry. Successful export closes
and clears the session. The existing modal restores keyboard focus. Role resolution,
inventory loading and another inventory operation disable new starts/saves.
The header action remains available in every inventory workspace where it was
already exposed; changing workspace closes the previous builder.

The preview intentionally represents the rows captured when opened. All-stock
mode retains its existing on-hand filter; explicit selection can include an empty
roll. Cached Client data remains usable because label generation is a read action.
Lazy imports and the existing QR, PNG, PDF and native export implementations remain.

## Verification and limits

All 23 rendered lifecycle tests pass; 18 regression cases fail against the prior
implementation. Full local `npm run smoke` passes: 1,982 UI tests, 392 Companion
tests, 896 script tests, build/lint, accessibility, performance, contracts and
doctor. Rust source is unchanged in this batch.

The browser harness mounts the real React hook and modal. It controls the async
URL/rendering/PDF stages and intercepts native export, while retaining real row
selection and QR payload construction. It covers duplicate calls, cancellation at
each stage, stale selection, close/reopen, target A→B→A, late success/failure,
explicit retry, eligibility changes, workspace navigation and focus restoration.
Existing rendering and PDF tests exercise the actual artifact generators.

A native file export already dispatched before closing cannot be cancelled by
these UI guards; its late completion is ignored. This change does not add durable
export jobs or automatic retries. No database mutation, dependency, schema,
localization, version or release change is required. CI evidence is recorded in
this batch's PR; tests use synthetic data and are not human usability results.
