# Windows synthetic Host test stability — 2026-10-13

This follow-up starts from main `81a1900a`, the merge of PR #161. Its first
[main CI attempt](https://github.com/bliatun-code/Filament-Manager/actions/runs/38326720400/attempts/1)
failed in `reviewed_detail_saves_keep_the_original_target_through_health_and_post`:
the synthetic server's response write returned Windows 10053 / ConnectionAborted,
then the thread join panicked. The other 693 Windows binary tests passed.
An unchanged rerun passed, which left the fixture's timing hazard unresolved.

## What the evidence establishes

The old log identifies the socket write but does not contain the scenario,
request, client result or elapsed time. Windows documents 10053 as a local abort
that can result from a timeout or protocol error; the exact historical trigger
cannot be established from that log.
[Winsock reference](https://learn.microsoft.com/en-us/windows/win32/winsock/windows-sockets-error-codes-2).

The fixture has a concrete timing defect: after receiving health it opens
SQLite, configures the connection, loads settings, performs two settings saves
and closes its database handle before formatting the response into the socket.
That work runs inside the production health request's 2.5-second deadline.
Windows connection setup configures WAL and uses a five-second SQLite busy
timeout. Reqwest's request deadline includes receiving the complete response
body, so fixture setup can consume a budget meant for the HTTP operation.
[Reqwest timeout contract](https://docs.rs/reqwest/latest/reqwest/blocking/struct.RequestBuilder.html#method.timeout).

## Test-only correction

The detail and RFID scenarios share a prepared synthetic Host. It opens and
retains the database, loads original settings and builds complete response
buffers before signaling readiness. The client operation starts only after
that signal. Database teardown happens after the server is joined, before
Windows file cleanup.

The real A→B→A target change still happens after receiving the selected health,
POST or cache request. Both public settings saves execute and must advance
the generation by exactly two while restoring the original Host and library.
The no-POST checks after a health transition and the correct original-target
POST checks remain in place.

Responses use one complete buffer with `write_all` and TCP_NODELAY. Socket
failures remain fatal and include scenario, request, processing duration and
client result. Readiness and server lifetime are bounded; no retry, ignored
test or disconnect suppression is introduced. Production code, transport
deadlines and CI gates are unchanged.

Spool cache reads now return the valid empty list `[]` instead of `{}`.
The tests require a completed current-target cache to persist and require a
stale-target response to leave the new target's cache empty.

## Verification and limits

- A channel-controlled regression holds fixture setup and verifies that neither
  the save nor a health connection begins before readiness; it then exercises
  the real successful health and POST path.
- Four independent detail scenarios also execute concurrently without a global
  serialization lock.
- All seven targeted detail/RFID tests pass, including the existing stale-target
  rejection and all RFID transition phases.
- Rust 1.90 workspace/all-targets/all-features locked compilation passes.
- Full `npm run test:rust` passes under ordinary suite concurrency: 1,080 Rust
  tests pass, with the same three existing environment-dependent tests ignored.
  Formatting and debug/release Clippy pass with warnings denied.

An independent review found no blocking issue. Two real settings transactions
necessarily remain inside the health response interval: this correction removes
avoidable setup and fragmented writes, but does not promise that every future
overloaded runner will be error-free. Windows PR and main CI must validate the
new fixture; test failures should be diagnosed rather than automatically retried.
