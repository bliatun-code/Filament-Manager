# Inventory bulk action reliability — 2026-09-14

This batch starts from PR #126's merge, `4b272815`, and covers reviewed MOVE
and STATUS operations on explicitly selected inventory rolls.

## Reproduced problems

Eight browser regression cases fail against the previous implementation:
same-event duplicate submission, refresh rejection after an accepted write,
same-event cancellation followed by an old confirmation, and omission of the
reviewed Client target generation, for both actions. The native regression
also fails: an old generation can submit a MOVE before the fix.

## Changes

- Selection, reviews and feedback belong to the active Stock workspace and
  resolved library authority. Leaving that workspace or changing Host, library
  or generation clears the old selection. A→B→A does not revive callbacks.
- A synchronous operation lock prevents duplicate submission before React
  renders busy state. Cancelling or changing a draft immediately revokes its
  old callbacks, including within the same event.
- Confirmation requires live Client data, pairing and a valid generation.
  Changes to a selected roll's status, placement, loan or printer assignment
  invalidate its review even if the values later return to their original
  state. Unselected roll changes do not invalidate a reviewed batch; filtering
  preserves explicitly selected rolls that are temporarily hidden.
- A receipt must confirm all affected rolls and their history. An accepted
  review is consumed before refresh, preventing replay. Refresh rejection or
  ERROR/CACHED/OFFLINE keeps the confirmed success alongside a load error.
  A mismatched receipt cannot report success and requires a fresh review.
- Late results cannot overwrite a new workspace's feedback, selection or busy
  state. Keyboard focus returns after refreshed controls become available.
- Client MOVE/STATUS requests forward the reviewed target generation. Native
  transport checks it before health and retains existing target checks through
  authentication, POST and cache refresh. Legacy callers may still omit it.

## Verification and limits

The rendered browser suite exercises the real React hook and confirmation panel
at the Tauri invocation boundary. Native loopback tests use a real Host service
and two synthetic rolls: both MOVE and STATUS commit together, replay is
rejected, and a changed second roll aborts the entire transaction. Invalid
generation, changed health target, legacy Host and missing pairing send no POST.
A target change during cache refresh preserves the accepted receipt. Client
business rows remain unchanged throughout these Host operations.

Full local validation passes: 1,959 UI tests, 1,065 Rust tests, formatting,
debug/release Clippy, build/lint, 392 Companion tests, 896 script tests,
accessibility, performance, contracts and doctor. The rendered bulk suite has
39 tests including its parent. Platform/package CI evidence is recorded in the PR.
The existing backend transaction and stale-row preconditions are retained;
this batch does not introduce them. There is no automatic network retry or
durable request receipt, so a lost response or target change during POST can
still leave an unknown outcome. The separate label/PDF loading lifecycle is
outside this batch. Tests use synthetic data and are not human usability tests.

No schema, dependency, localization, version or release change is required.
