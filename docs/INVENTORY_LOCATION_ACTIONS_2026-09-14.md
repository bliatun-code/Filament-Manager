# Location management reliability — 2026-09-14

This batch starts from PR #125's merge, `9a357248`, and covers create, rename,
archive, restore, permanent delete and merge in the Inventory locations view.

## Reproduced problems

Fifteen browser regressions fail against the prior implementation: duplicate
submission and confirmed writes misreported as failed after refresh rejection
for all six actions, archive/delete confirmations surviving a Host change, and
a merge review surviving changed location data. The harness mounts the real
panel and React actions and intercepts the Tauri invocation boundary.

The native loopback regression also fails against the old transport: after an
A→B→A target change, an old generation can still perform a location write.
The transport previously recaptured the current target after the health check.

Rendered focus tests additionally exposed a timing problem in the old
requestAnimationFrame helper: it could look for the destination before React
committed the updated controls. Focus is now scheduled from a layout effect
and cancelled when the panel unmounts or a new focus request supersedes it.

## Changes

- A shared synchronous operation lock prevents duplicate and mixed location
  submissions before React's busy state renders. Callbacks and completions are
  scoped to the active view and local/Client authority, including Host URL,
  library ID and target generation. A→B→A never revives an old callback.
- Writes require resolved authority, live location data, supported mutations,
  no active location load, and pairing plus a valid generation in Client mode.
- Confirmed writes return success even if the subsequent inventory/location
  refresh throws or reports ERROR, CACHED or OFFLINE. The success message stays
  alongside the existing inventory-load error. Rejected deletes still refresh
  eligibility, retaining their write error if that refresh also fails.
- The panel remounts when authority changes, discarding old drafts and reviews.
  Changed location data invalidates idle confirmations. An operation's own
  refresh can update the list without losing its completion cleanup and focus.
  Rejections invalidate changed reviews before another attempt.
- Panel submission guards retain the reviewed draft and row snapshot. Late
  completion cannot clear a new Host's draft or steal its keyboard focus.
- All six Host requests carry an optional desktop-side expected generation.
  The native transport checks it before health and retains the same target
  through legacy capability probing, authentication, POST and cache refresh.
  Validation-status bookkeeping after accepted writes is best effort.

## Verification and limits

The focused UI set includes the real forms, confirmation controls, rejected
rename/retry, delete eligibility refresh, focus restoration, refreshed rows and
loading state, missing authority and stale callbacks/results for all actions.
Two source-text lifecycle tests were replaced by these executable checks.

The native matrix covers all six actions across five phases: fresh target,
A→B→A before health, during health, during POST, and during cache refresh.
Fresh requests send one POST; changes before/during health send none. A change
during POST retains the existing invalid-target error and sends no subsequent
cache request. A change during cache refresh cannot turn an already accepted
write into failure. Existing legacy capability and structured-error tests remain.
The shared test database helper uses an atomic sequence to avoid filename
collisions during concurrent fixture creation.

Local verification passes: 1,920 UI tests, 1,061 Rust tests, formatting,
debug/release Clippy, build/lint, 392 Companion tests, 896 script tests,
accessibility, performance, contracts and doctor. The 58-test rendered lifecycle
suite also passes with identical Host values after A→B→A. The full UI suite was
rerun after updating its page-feedback wiring assertion; no functional failure
remains. Platform CI and downloaded package evidence are recorded in the PR.

No database migration, dependency update, localized text change, version bump or
release is required. These guards do not add cross-device compare-and-swap,
a durable mutation receipt or automatic network retry. A target change during
POST or a lost response can still leave an unknown write outcome. Existing
atomic database validation, reference protection, history and local authority
checks remain in place. Legacy desktop callers may omit the new generation
constraint. The tests use synthetic data and do not claim human usability results.
