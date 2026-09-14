# Saving roll and catalog details — 2026-09-14

This follow-up starts from PR #124's merge, `22106b33`. It covers the two
remaining save actions in the inventory detail dialog: common roll details and
unlocked catalog metadata.

## Findings and changes

Six browser regressions failed against the previous hook: each action allowed
two writes in one event, could mark another roll's draft saved after navigation,
and reported a refresh failure as a failed write. The tests mount the real React
hook with the installed runtime and exercise its Tauri invocation boundary.

Both actions now share a synchronous submission lock. A save belongs to its
original roll, open dialog and local/Host context, including Client target
generation. Previously captured callbacks stay invalid after A→B→A navigation
or draft changes. An old completion cannot clear the busy state of a newer save.

A confirmed write marks the submitted draft saved before refresh. Later refresh
failures use the existing inventory-load error, including cached/offline domain
results and the catalog loader's explicit failure callback. They do not cause
the same submitted intent to be sent again. A rejected write permits an explicit
retry, and a new draft can be saved after an earlier submission. Newer draft
values and catalog edit state are not overwritten by old completion cleanup.

Save errors are scoped to the detail dialog. Three unused separate ownership,
location and tare handlers were removed; the product already uses the single
atomic common-details payload for those fields. Existing validation, purchase
metadata, loan restrictions and old-Host capability checks are retained.

## Authority through the native write

Reviewed common-detail requests constrain the active-library gateway with the
original local/Client authority. Under the existing role-transition gate, the
backend compares Client URL, library ID and generation before selecting a write
destination. A queued local request cannot silently become a Client write.
Legacy callers without the optional constraint retain their existing API.

The gateway carries its captured generation into the Host operation. Catalog
metadata requests likewise carry the Client's generation. Both Host write paths
keep the original target guard through health, authentication and POST instead
of recapturing the current target after health. These are desktop-side guards;
they do not add a new Host protocol or require a new capability advertisement.

Best-effort validation-status bookkeeping after an acknowledged write does not
turn that write into a reported failure. Existing target guards continue to
protect cache and status updates. Network response loss remains an unknown write
outcome; this patch does not introduce a durable mutation receipt or automatic
network retry. It also does not add cross-device compare-and-swap for catalog or
roll fields; existing transactional backend validation remains in effect.

## Verification

- Browser regressions cover duplicate and mixed saves, rejection/retry, stale
  callbacks, late results, A→B→A, changed drafts, missing Host generation and
  refresh failures, including a held refresh completed after closing the view.
- Native tests exercise fresh and stale generations for both common and catalog
  writes over loopback TCP. Changing the target away and back during health must
  yield only the health request and zero POSTs. Fresh requests each send one POST.
- The gateway tests compare role, normalized URL, library ID and generation and
  reject a queued local request after the persisted role becomes Client.
- A shared test database helper now includes a per-process atomic sequence:
  concurrent cases exposed collisions in its timestamp-only filename.

Local verification passes: smoke (build/lint, 392 Companion tests, 896 script
tests, accessibility, performance, contracts and doctor), the final 1,864-test UI
suite, 37 focused browser checks, 1,060 Rust tests and both Clippy profiles.
Build/lint, the focused save/payload checks and public-readiness were rechecked
after the final catalog-refresh and cleanup changes. Platform CI results are
recorded in the PR. No new
localized copy, database migration, dependency update, release or real inventory
mutation is part of this change. These automated checks are not human usability
measurements.
