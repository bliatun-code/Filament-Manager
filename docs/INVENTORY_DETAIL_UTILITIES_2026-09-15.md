# RFID capture and single-label actions — 2026-09-15

This batch starts from PR #128's merge, `5fee07f4`, and covers the selected-roll
RFID capture actions and rendered label PNG export.

## Changes

A synchronous shared operation lock prevents duplicate submissions before React
renders busy state. Actions belong to the open roll detail and its resolved
library role, Host URL, library ID and target generation. Closing details,
switching rolls or changing authority retires the old scope. Old completions
cannot clear a newer operation's busy state or write feedback into its detail.

RFID confirmation additionally belongs to the capture opening, slot, observed tag
and observation timestamp. Changing those values invalidates the old callback;
current pairing/local-write eligibility is checked when invoked. Opening capture
starts one printer refresh and ignores a late failure after that capture closes.

A confirmed RFID write is consumed before refresh. Reload rejection or reported
ERROR/CACHED/OFFLINE preserves the success message alongside a load error. All
three reloads are attempted. A failed write keeps the capture available for an
explicit retry. An old accepted write cannot close a subsequently opened capture.

Client RFID requests carry the reviewed target generation. Native transport
checks it before health and retains the same target through authentication, POST
and cache refresh. Validation-status bookkeeping after accepted writes is best
effort. Legacy callers can omit the generation constraint.

PNG export retains the existing rendered PNG and label-size filename behavior.
It shares the detail operation guard; a late native result cannot report into
another roll or Host. No second file export starts while one is pending.

## Verification and limits

Local verification passes: 2,017 UI tests, 1,067 Rust tests, formatting,
debug/release Clippy, build/lint, 392 Companion tests, 896 script tests,
accessibility, performance, contracts and doctor. All 35 lifecycle tests pass;
33 regression cases fail against the prior hook. Both native regression tests
also fail against the prior transport.

Browser lifecycle tests mount the real React hook and intercept the native invoke
boundary. They cover duplicate calls, old callbacks/results, refresh outcomes,
retry, changed capture fields, authority, pairing, generation forwarding and
concurrent detail operations. Existing label rendering/export tests remain.

Native loopback tests cover stale generation before network, fresh and legacy
requests, target changes during health, POST and cache refresh, encoded roll IDs
and the RFID payload. They verify transport behavior; they do not simulate a
physical RFID reader. Client-local roll data is not used as a write fallback.

This does not add a durable write receipt, automatic retry or cross-device
compare-and-swap. A lost response or target change during POST can still leave an
unknown write outcome. A native file export already dispatched cannot be cancelled.
There is no dependency, schema, localization, version or release change. Platform
CI and package evidence are recorded in the PR.
