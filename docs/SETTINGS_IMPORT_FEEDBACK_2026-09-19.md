# Settings import feedback — 2026-09-19

The Client screenshot showed a successful eSUN import still displayed after the
user moved to another Settings tab. The shared Settings success banner had no
expiry. Recovering a completed catalog job also announced the same result again
after returning to Settings or restarting the Client webview.

Success feedback now expires after 20 seconds. A replacement message receives
its own timer; unrelated renders do not extend it. Errors remain visible, and
unmounting or clearing the message cancels its timer.

Catalog job notifications are acknowledged when Settings displays a positive
result. One local marker per library target remembers the last notified job,
separately from the retained request used to recover its result and import log.
Client target generations share the marker for the same Host URL and library;
different libraries remain independent. A late receipt cannot overwrite a newer
saved request or its notification marker. A new job still announces its result,
even when its summary text matches the previous import.

A job finishing while Settings is unmounted remains unacknowledged until the
user returns. React effect replay retains the current mount's feedback without
announcing it again. Zero-import warnings and terminal errors retain their
existing behavior. Result recovery and the existing summary/log controls remain
available independently of the transient banner.

## Verification and limits

Local verification passes: 2,031 UI tests, production build, lint and all contract
checks. The focused feedback/controller/hook suite contains 35 passing tests.

Browser tests mount the real feedback hook and rendered banner with a controlled
clock, checking expiry, replacement, error retention and unmount cleanup.
Controller and hook tests cover navigation, repeated polling, controller
recreation, Client target generations, separate libraries, unseen background
completion, new jobs, React effect replay and receipt/log restoration.

Four hook regressions fail against the previous hook; the effect replay test
also fails against notification gating without the mount-scoped ref. Notification storage read
and write failures are nonfatal and retain in-memory deduplication. If local
storage is unavailable or cleared, a webview restart can announce its recovered
result once again. Notification acknowledgment does not change the Host job or
add a network write. Platform CI results are recorded in the PR.

This batch changes no dependency, database schema, localization, version or
release artifact.
