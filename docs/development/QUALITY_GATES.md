# Blocking quality gates

This document is the release contract for Filament Manager's performance,
Host/Client resilience, Client/Companion workflow parity, backup and upgrade,
accessibility, and localization gates. A gate is blocking when a failure makes
`Database Migration Integrity`, `macOS Smoke`, or `Windows Smoke` fail; the
release workflow requires all three checks before publishing artifacts.

The named owner is accountable for the threshold and for reviewing any proposed
exception. Contributors may implement fixes in every area, but a threshold must
not be weakened merely to make a change pass.

| Gate | Named owner | Blocking threshold | Local command | Required CI path |
| --- | --- | --- | --- | --- |
| Performance | `@bliatun-code` (performance gate owner) | The deterministic 10,000-spool, concurrency, timeout, render-window, lazy-loading, and bundle contracts pass with zero failures. Production JavaScript chunks remain within the committed byte budgets in [PERFORMANCE_BASELINE.md](PERFORMANCE_BASELINE.md). | `npm run test:performance:bundle` and `npm run test:performance` | `npm run smoke` on macOS and as part of `npm run verify` on Windows |
| Host/Client resilience | `@bliatun-code` (library-sync gate owner) | The loopback-TCP Rust gate and installed-candidate Host/Client gate pass with zero failures using separate processes and separate synthetic Host and Client databases. They must pair, route writes only to the Host, retain a same-ID Client shadow at 333 g, cache the Host result, fail closed while offline without reading or writing the Client's unrelated local library, recover the same authority after Host restart, renew the session, clear device credentials, and leave the Host at 760 g without mutating the Client shadow. Catalog jobs must recover one committed import and interrupt one unfinished job after restart, with no Client-local import. | `cargo test -p bambu-filament-manager library_sync_resilience_tests -- --nocapture` and `npm run smoke:release:packaged-host-client-e2e -- --executable=... --work-dir=... --log-dir=...` | Rust tests and the installed Host/Client gate in the macOS native and Windows jobs |
| Client/Companion workflow parity | `@bliatun-code` (workflow gate owner) | The five fixed workflows—register, find, load, lend and receive an on-order item—must pass with exact record counts and relationships. Client operations use a real loopback Host process, leave Client-local spool and history rows unchanged and refresh target-scoped caches. Companion uses its rendered browser UI against a temporary synthetic database and verifies persisted SQLite state after reload. | `cargo test -p bambu-filament-manager library_sync_resilience_tests -- --nocapture` and `npm run qa:visual:companion:data-e2e -- --startup-timeout-ms 120000` | Rust tests on macOS and Windows, plus the data-backed Companion gate in the macOS native job |
| Backup and database upgrade | `@bliatun-code` (data and release gate owner) | Backup validation and restore tests pass with zero failures; SQLite `quick_check` is `ok`, `foreign_key_check` is empty, unsupported future schemas are rejected before mutation, and device-local credentials never enter portable backups. The historical upgrade smoke must reach the current schema on two consecutive launches without changing protected business data. The installed macOS and Windows candidates must pass the mutating spool/loan/printer/full-backup E2E across a restart. Published migrations and the schema-0 baseline remain byte-identical to their pinned release. | `cargo test`, `npm run check:database-migrations -- --verify-published-reference`, `npm run smoke:release:database-upgrade -- ...`, and `npm run smoke:release:packaged-desktop-e2e -- ...` | Linux migration integrity, Rust tests, and the required platform database-upgrade or installed-app smoke |
| Accessibility | `@bliatun-code` (accessibility gate owner) | All six data-backed main pages have zero axe violations for WCAG 2.0 A/AA, 2.1 A/AA, and 2.2 AA and emit zero browser errors. The shared modal passes keyboard focus, Escape/focus return, and 200% zoom without page-level horizontal overflow. | `npm run test:a11y:app-modal` and `npm run test:a11y:data-backed` | `npm run smoke` on macOS and as part of `npm run verify` on Windows |
| Localization | `@bliatun-code` (localization gate owner) | Every selectable catalog keeps 100% key and placeholder coverage, zero English catalog-overlay fallback, zero unknown literal keys, at least 95% translation signal, and current fingerprint-bound artifact and runtime QA evidence. A locale described as maintained also needs a named native reviewer and a reviewed fingerprint matching the current English source. | `npm run check:i18n-readiness`, `npm run qa:visual:desktop:matrix`, and `npm run check:contracts` | `npm run smoke` on macOS and as part of `npm run verify` on Windows. Screenshots have their own release gates. |

## Performance authority

The exact production chunk limits, render-window limits, network budgets, and
10,000-spool scenarios live in [PERFORMANCE_BASELINE.md](PERFORMANCE_BASELINE.md)
and their executable tests. Wall-clock probes are advisory because shared CI
runner timings are not stable; deterministic work and bundle limits are the
blocking authority.

Changing a committed performance limit requires all of the following in the
same pull request:

1. before-and-after production bundle or model measurements;
2. an explanation of why the additional startup or navigation work is needed;
3. updated executable tests and documentation; and
4. approval from the named performance gate owner.

## Host/Client resilience authority

The catalog-job suite checks durable request identity, single-job admission,
lost-response replay, responsive status during fetch, and restart recovery.
It rejects stale authority before import, records interrupted work after
worker loss, and rolls back failed receipt writes. The UI recovers without
reposting. Operational receipts stay out of portable backups. The focused
checks are `cargo test catalog_refresh_jobs` and the UI
`catalog_refresh_jobs.test.ts` suite.

The Client test in
[`library_sync_resilience_tests.rs`](../../src-tauri/src/library_sync_resilience_tests.rs)
starts a separate Host operating-system process on loopback TCP. It exercises
pairing, Host-authoritative writes, live and target-scoped cached reads, explicit
offline failure, recovery, and session renewal through production command
paths. A same-ID row and a sentinel in the Client database catch unintended
reads and writes.

Protected mutations bound connection establishment and give the Host time to
finish without a shared response deadline. Reads retain their own timeout.
Writes with uncertain outcomes are never replayed. Settings preserves last-good
catalog rows for the same Host and discards them when the target changes.
An app-level lock pauses the catalog poll and blocks authority changes and
duplicate refreshes throughout a mutation, including across Settings navigation.

Routine Trusted-LAN restarts and rebinds must drain accepted requests before
starting the replacement listener. The lifecycle regression gate holds an
authenticated POST open over real loopback TCP beyond the three-second app-exit
grace period, requires restart to remain pending, then verifies a successful
response and exactly one persisted weight/history mutation. Separate tests
require bounded app shutdown both directly and while a restart owns the
reconciliation gate, and cancellation must not detach the owned server task.
The native advertisement keeps its five-second app-exit grace period; routine
teardown waits for completion. These tests run with the platform Rust suites.
The focused command is `cargo test -p bambu-filament-manager companion_server_lifecycle_tests`.
They do not establish cancellation of accepted connection tasks or already
running blocking work; actual process exit remains the final shutdown bound.

A second scenario uses the same real transport boundary to register exactly one
Host spool, find it from Host data, assign it to the requested slot without
changing a sentinel assignment, create exactly one outbound loan and receive a
multi-spool on-order item. It verifies weights, statuses, counts and the
target-scoped spool, printer, loan and wishlist caches after the corresponding
production Client command paths. The Client-local spool and history snapshot
must remain row-for-row identical.

The [packaged multiprocess runner](../../scripts/run-packaged-host-client-e2e.mjs)
launches the installed candidate as isolated Host and Client processes. It
checks offline failure, same-Host restart and session renewal, credential
cleanup, and exact persisted history (three Host rows and one Client row),
with no plaintext authentication metadata. It also replays a completed Bambu
import, rejects a competing refresh, and
verifies that an unfinished eSUN job becomes interrupted after both processes
restart. Windows uses a private WebView2 profile per phase. This proves
native process lifecycle and loopback authority routing. Stable `.local`/mDNS
discovery, route pinning, and HTTPS/TLS identity require separate coverage.

The pairing URL, databases and coordination files stay in an owner-only
directory. Delete it only after all candidate processes are confirmed stopped,
credential cleanup succeeds against the same private database and OS credential
scope, and the run-bound summary is durable. Platform wrappers use exact
executable paths to identify processes. Enumeration or cleanup failure
retains the private staging area locally. Upload only the sanitized summary
and redacted logs.

The harness retries initial Host startup only for a classified port conflict.
A restarted Host must recover on the original paired port.

## Fixed workflow parity authority

The automated workflow gates protect data integrity and routing for the same
five tasks defined in [USABILITY_TEST_PROTOCOL.md](USABILITY_TEST_PROTOCOL.md).
They complement the moderated usability study; they do not prove the 90%
unassisted-completion or 30% timing thresholds.

For Client, the Rust real-TCP scenario proves the authoritative Host boundary,
while UI routing and the shared inventory search model remain covered by their
TypeScript behavior tests. `ActiveLibraryGateway` is extended only when a
behavior test finds an uncovered authority decision; passing Host-specific
production command paths are not moved merely to make the abstraction larger.

For Companion, `scripts/run-companion-data-e2e.mjs` drives the rendered web UI
against a generated, sanitized fixture and temporary migrated database copies.
It registers and reloads a spool, finds and opens the correct row, loads that
spool into a printer slot, lends and returns it, receives an on-order item and
then checks both visible state and persisted database relationships. Printer
loading and clearing must each use exactly one atomic slot-operation request;
the gate rejects the legacy split assignment/weight sequence and verifies that
unrelated slot assignments survive. Rust behavior tests force a late database
failure and require assignment, location, weight, usage and history to roll back
together. Overview-controller tests additionally require successful optional
datasets to commit while a failed optional dataset retains its last valid value;
inventory remains the required authoritative dataset. Real user libraries are
never opened or modified by this gate.

## Backup and upgrade authority

The Rust backup suite is the authority for validation, atomic restore,
credential exclusion, supported-schema handling, and rollback behavior. The
release-upgrade smoke adds process-level evidence: it starts the application
twice against a sanitized historical database, verifies migration to the
current schema, and compares row identities and preserved values before and
after both launches.

A fixture used in CI must be synthetic or explicitly sanitized, content-locked,
and owner-only on disk. A structural migration fixture must use an older schema
than the current application. A pinned previous-release fixture may use the
same schema when its stated purpose is packaged installer compatibility and
data-preservation verification rather than exercising a schema transition. Raw
user databases, credentials, printer addresses, pairing state, and other private
values must never become CI artifacts.

The append-only manifest and procedure are documented in
[DATABASE_MIGRATIONS.md](DATABASE_MIGRATIONS.md). The dedicated integrity job
compares published migration SQL, the frozen schema baseline, and its legacy
normalization source set to the pinned release before exercising clean and
historical database paths through the Rust runner.

The packaged desktop E2E starts the executable installed from the candidate
package twice against one synthetic, isolated database. Through the application's
normal Tauri command layer it creates a spool, updates its weight, lends and
returns it, creates a printer, assigns the spool to an AMS slot, restarts, and
then validates both persisted state and a complete portable backup. The harness
is available only when its exact environment gate, private work directory,
run-specific marker, and database path all agree. Unix artifacts use owner-only
`0700`/`0600` modes; Windows smoke parents use protected current-user ACLs. The
database is removed after the run and is never uploaded with the private smoke
logs.

The same installed executable also creates a two-roll borrowed catalog batch
with repeated master IDs. The second launch reuses the saved request and must
return exactly the original ordered receipt. Independent SQLite checks require
unchanged rolls, loans, history, revisions, and the local batch journal across
that replay. Portable backups include the rolls and loans and omit the journal.
The paired Host/Client gate replays its batch after Host restart and session
renewal, proves unchanged batch rows and revisions, and requires zero batch
spools, loans, or receipts in the Client's unrelated local database.

Current-schema checks verify the `catalog_spool_batches` structure and its
constraints. The CI baseline starts at schema 1. The pinned v0.28.0
(schema 5) and v0.30.0 (schema 7) fixtures must reach the
[current schema](../../src/backend/database_schema.rs).
Newly migrated batch journals must be empty, and existing journals must retain
their protected receipts across both launches. The Windows summary must
explicitly report successful local and Host batch replays. See the
[release fixture guide](RELEASE_UPGRADE_FIXTURES.md) for preparation and
validation.

## Accessibility authority

The data-backed browser gate runs axe against Dashboard, Inventory, Loans,
Printers, Statistics, and Settings with realistic synthetic data. Its threshold
is zero violations, not a severity-filtered allowance. The focused modal gate
covers behavior that a static scan cannot prove: initial focus, wrapped tab
order, Escape, focus restoration, scroll reachability, and layout at 200% zoom.

`npm run test:loans:dialogs` also exercises the real loan dialogs with synthetic
native responses: failed and late loads, fresh candidates on reopen, inline
errors in both return directions, retained drafts, whole-gram validation,
single submission, blocked dismissal while saving, and refresh failure after a
successful write. It must pass all five scenarios; native transaction behavior
is checked separately against temporary SQLite databases in the Rust suite.

The desktop and Companion screenshot gates accept `auto`, `light`, `dark`,
`dark-deep`, and `blue`. A theme-model or palette change must exercise a
representative desktop and Companion capture for every affected theme, verify
the resolved light/dark contrast contract, and retain the fixture's exact
filament, material, and status swatches. A decorative accent is never allowed
to redefine data colors merely to make a themed capture look consistent.

An accessibility exception requires a standards-based reason, a removal date,
and approval from the named gate owner.

## Localization authority

[LOCALIZATION.md](LOCALIZATION.md) defines publication, fingerprint expiration,
native review, and string-freeze rules. A selectable catalog requires passed
artifact and runtime QA for the current fingerprints in `releaseQaAudits`.
The per-locale desktop matrix and representative Companion screenshots remain
separate release checks. Native-language review is required for maintained
status.

## Wiring and change control

`npm run verify` includes the production UI build, UI lint, Companion and script
tests, both browser accessibility gates, loan-dialog regressions, the complete UI suite, deterministic
performance checks, localization contracts, the real-TCP Host/Client resilience
gate within the Rust suite, formatting, and Clippy in development and release
profiles. `Windows Smoke` executes this command. On macOS, the UI job runs
`npm run smoke` and the WebKit check while the native job builds the production
UI, runs `npm run test:rust`, and exercises the data-backed Companion workflow
with a generated fixture. The required `macOS Smoke` check succeeds only
after both jobs succeed. Release publication waits up to 90 minutes for
`Database Migration Integrity`, `macOS Smoke`, and `Windows Smoke` in the
`ci.yml` push run on `main` for the tagged commit. It polls every minute while
the run or a required job is pending or missing. A failed, cancelled, or skipped
required job, an incomplete set of checks in a finished run, or a timeout
stops publication before a draft is created. The platform smoke jobs also
invoke the installed Host-Client gate through `--packaged-host-client-e2e` on macOS and
`-RunPackagedHostClientE2E` on Windows. Windows retains the explicit
`UnsignedRequired` Authenticode policy until signing work is resumed.

The executable contract in `scripts/quality-gates-contract.test.mjs` checks
that `npm run smoke` retains every required command, both platforms run the
UI and native checks, publication requires the migration and platform checks,
and the documentation retains the ownership and core thresholds.
