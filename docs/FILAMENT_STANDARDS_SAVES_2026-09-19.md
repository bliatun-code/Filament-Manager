# Filament standards save lifecycle — 2026-09-19

This batch follows PR #130 (`626e8c8e`). The previous standards hook could submit
concurrent writes from the same rendered snapshot, apply a late result after a
library generation changed, or overwrite an accepted save with an older read.
Currency and group-default saves also lacked visible success feedback.

Currency, group-price and batch handlers now share a synchronous operation lock.
Reads already in flight are invalidated before writing; reads do not restart
while a mutation is pending. Old callbacks, old snapshots, target changes and
unmounts retire the write's permission to update the current view. Native writes
already dispatched are not cancelled. Low-stock saving has the same mounted
scope and guards old full-settings snapshots. The existing Host-only policy for
library defaults and thresholds is preserved.

The rendered tab shares a lock across all four operations. Changing library
scope remounts its drafts and review state. Success feedback for currency and
group defaults includes the saved value, uses existing translations and expires
after 20 seconds. Errors stay visible; overwrite errors appear inside the modal.
A review whose spool data changed cannot submit its former selection.

An accepted batch delivers its receipt before refreshing inventory and standards.
Both refreshes are attempted even if either callback throws synchronously.
Refresh failures are reported separately and cannot discard a committed receipt.
The consumed snapshot cannot submit the batch again before fresh data is loaded.
Receipts carry a library scope so a receipt retained by App is not shown under
another library. Ordinary navigation can still recover the completed receipt.

## Verification and limits

Local `npm run smoke` passes: 2,048 UI tests, 392 Companion tests, 896 script
tests, 23 performance tests, production build, lint, accessibility, contracts and
doctor. The rendered lifecycle suite passes all 10 tests.

Five mutation regressions fail against the original hook: all three concurrent
write paths, stale reads/callbacks after a save, and receipt delivery before
refresh. Hook tests also cover generation changes, explicit retry, unmount and
synchronous refresh failures. Browser tests mount the real tab and low-stock
hook with synthetic data and intercepted writes, covering success expiry,
errors, concurrent clicks, old completions, read-only Client behavior and stale
overwrite reviews. Full validation and platform/package CI results are recorded
in the PR.

The lock belongs to the current Settings mount. This is not a new durable
cross-window write receipt or cross-process compare-and-swap protocol. A lost
native response can still leave an unknown write outcome. No database schema,
dependency, translation catalog, version or release change is included.
