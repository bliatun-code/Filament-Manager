# Blocking quality gates

This document is the release contract for Filament Manager's performance,
Host/Client resilience, Client/Companion workflow parity, backup and upgrade,
accessibility, and localization gates. A gate is blocking when a failure makes
`Database Migration Integrity`, `macOS Smoke`, or `Windows Smoke` fail; the
release workflow requires all three checks before publishing artifacts.

The named owner is accountable for the threshold and for reviewing any proposed
exception. Contributors may implement fixes in every area, but a threshold must
not be weakened merely to make a change pass.

| Gate                             | Named owner                                   | Blocking threshold                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Local command                                                                                                                                                                               | Required CI path                                                                                                                       |
| -------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Performance                      | `@bliatun-code` (performance gate owner)      | The deterministic 10,000-spool, concurrency, timeout, render-window, lazy-loading, and bundle contracts pass with zero failures. Production JavaScript chunks remain within the committed byte budgets in [PERFORMANCE_BASELINE.md](PERFORMANCE_BASELINE.md).                                                                                                                                                                                                                                                                                                                     | `npm run test:performance:bundle` and `npm run test:performance`                                                                                                                            | `npm run verify` on macOS and Windows                                                                                                  |
| Host/Client resilience           | `@bliatun-code` (library-sync gate owner)     | The loopback-TCP Rust gate and installed-candidate Host/Client gate pass with zero failures using separate processes and separate synthetic Host and Client databases. They must pair, route writes only to the Host, retain a same-ID Client shadow at 333 g, cache the Host result, fail closed while offline without reading or writing the Client's unrelated local library, recover the same authority after Host restart, renew the session, clear device credentials, and leave the Host at 760 g without mutating the Client shadow.                                      | `cargo test -p bambu-filament-manager library_sync_resilience_tests -- --nocapture` and `npm run smoke:release:packaged-host-client-e2e -- --executable=... --work-dir=... --log-dir=...`   | `npm run verify` plus the packaged DMG/MSI Host-Client gate in required macOS and Windows jobs                                         |
| Client/Companion workflow parity | `@bliatun-code` (workflow gate owner)         | The five fixed workflows—register, find, load, lend and receive an on-order item—must pass with exact record counts and relationships. Client operations use a real loopback Host process, leave Client-local spool and history rows unchanged and refresh target-scoped caches. Companion uses its rendered browser UI against a temporary synthetic database and verifies persisted SQLite state after reload.                                                                                                                                                                  | `cargo test -p bambu-filament-manager library_sync_resilience_tests -- --nocapture` and `npm run qa:visual:companion:data-e2e -- --startup-timeout-ms 120000`                               | Client coverage is part of `npm run verify` on macOS and Windows; the rendered Companion gate is a dedicated `macOS Smoke` step        |
| Backup and database upgrade      | `@bliatun-code` (data and release gate owner) | Backup validation and restore tests pass with zero failures; SQLite `quick_check` is `ok`, `foreign_key_check` is empty, unsupported future schemas are rejected before mutation, and device-local credentials never enter portable backups. The historical upgrade smoke must reach the current schema on two consecutive launches without changing protected business data. The installed DMG and MSI must pass the mutating spool/loan/printer/full-backup E2E across a restart. Published migrations and the schema-0 baseline remain byte-identical to their pinned release. | `cargo test`, `npm run check:database-migrations -- --verify-published-reference`, `npm run smoke:release:database-upgrade -- ...`, and `npm run smoke:release:packaged-desktop-e2e -- ...` | `Database Migration Integrity`, `npm run verify`, plus the database-upgrade and mutating packaged-app smokes in required platform jobs |
| Accessibility                    | `@bliatun-code` (accessibility gate owner)    | All six data-backed main pages have zero axe violations for WCAG 2.0 A/AA, 2.1 A/AA, and 2.2 AA and emit zero browser errors. The shared modal passes keyboard focus, Escape/focus return, and 200% zoom without page-level horizontal overflow.                                                                                                                                                                                                                                                                                                                                  | `npm run test:a11y:app-modal` and `npm run test:a11y:data-backed`                                                                                                                           | `npm run verify` on macOS and Windows                                                                                                  |
| Localization                     | `@bliatun-code` (localization gate owner)     | Every selectable catalog keeps 100% key and placeholder coverage, zero English catalog-overlay fallback, zero unknown literal keys, at least 95% translation signal, and current fingerprint-bound artifact and runtime QA evidence. A locale described as maintained also needs a named native reviewer and a reviewed fingerprint matching the current English source.                                                                                                                                                                                                          | `npm run check:i18n-readiness`, `npm run qa:visual:desktop:matrix`, and `npm run check:contracts`                                                                                           | `npm run verify` on macOS and Windows; screenshot results are recorded from their actual release-gate runs                             |

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

The catalog-job gate covers durable request identity, one active refresh across
entry points, replay after a lost response, responsive authenticated status
during fetch, and ordinary server restart retaining the same worker. It also
requires stale-authority rejection before import, atomic rollback on a failed
success receipt, explicit interruption after process/worker loss, and safe
UI recovery without another POST. Both a previous Host with no job capability
and late A→B→A results must be rejected. Job receipts must stay outside portable
backups, and schema 0–5 upgrades must retain existing rows and relationships.
Focused checks are `cargo test catalog_refresh_jobs` and the UI
`catalog_refresh_jobs.test.ts` suite; these also run in the full local gate.

`src-tauri/src/library_sync_resilience_tests.rs` is the Rust transport and
authority gate. The Client test starts a separate Host operating-system process
and communicates with it over a real TCP listener. Host and Client use isolated
databases so they cannot accidentally share library state. The test covers
authenticated pairing, a Host-authoritative write through `ActiveLibraryGateway`,
live reads and target-scoped cached reads through their production command
paths, explicit failure while the Host is stopped, restart recovery, and
automatic session renewal. A same-ID row and a separate sentinel remain in the
Client-local database throughout the scenario. A failure must never expose
those rows as if they were Host data or convert an uncertain Host write into a
local mutation.

Protected Client mutations intentionally have no shared total response
deadline: the Host may need several minutes to complete a bounded supplier
catalog update, and retrying an uncertain non-idempotent write is not safe.
Connection establishment remains bounded, while idempotent reads retain their
explicit per-request deadline. A transport regression test proves both sides of
that policy. Settings additionally treats a rejected catalog read as a partial
reload: it atomically resolves the initial data-source identity, distinguishes
pending from unavailable, preserves the last-good rows for the same Host,
clears them on an actual target-identity change, and pauses its silent poll
while the catalog mutation is active. Library role, Host address, pairing and
target-generation changes remain locked until that mutation has a definitive
result. The operation lock belongs to the application shell instead of the
Settings route, so navigation away and back cannot reset it, start a second
supplier request or let progress and feedback cross from Host A into Host B.

Routine Trusted-LAN restarts and rebinds must drain accepted requests before
starting the replacement listener. The lifecycle regression gate holds an
authenticated POST open over real loopback TCP beyond the three-second app-exit
grace period, requires restart to remain pending, then verifies a successful
response and exactly one persisted weight/history mutation. Separate tests
require bounded app shutdown both directly and while a restart owns the
reconciliation gate, and cancellation must not detach the owned server task.
The native advertisement keeps its five-second app-exit grace period; routine
teardown waits for completion. These tests run in `npm run verify`; the focused
command is `cargo test -p bambu-filament-manager companion_server_lifecycle_tests`.
They do not establish cancellation of accepted connection tasks or already
running blocking work; actual process exit remains the final shutdown bound.

A second scenario uses the same real transport boundary to register exactly one
Host spool, find it from Host data, assign it to the requested slot without
changing a sentinel assignment, create exactly one outbound loan and receive a
multi-spool on-order item. It verifies weights, statuses, counts and the
target-scoped spool, printer, loan and wishlist caches after the corresponding
production Client command paths. The Client-local spool and history snapshot
must remain row-for-row identical.

The packaged multiprocess gate complements the Rust gate by launching the
executable installed from the candidate DMG or MSI as two isolated application
roles. Host generation 1 issues one pairing URL and accepts the first
Host-authoritative weight update. The Client then proves that live reads and
writes fail while Host is stopped without changing its same-ID 333 g local
shadow. Host generation 2 reuses the same private Host database and TCP port;
the Client renews its session, observes the 760 g Host row, refreshes the
target-scoped cache and clears its device credential. A final independent
cleanup launch proves credential deletion is idempotent. Closed SQLite files
must contain exactly three Host history rows (`CREATED` plus two
`WEIGHT_UPDATED`) and one Client history row (`CREATED`), with no plaintext
authentication metadata.

The runner keeps the one-time pairing URL, raw databases and coordination files
inside an owner-only work directory. It deletes that directory only after every
started process is confirmed stopped, the independent credential cleanup has
passed, and the identity-bound summary is durable. If an earlier Client cannot
be confirmed stopped, no second Client is started against the same database or
credential scope inside the runner. The outer DMG/MSI wrapper first stops every
process whose executable path exactly matches the installed candidate, then
resumes one cleanup-only Client against the same private database, credential
profile, run ID and original loopback port. Rust verifies both cleared SQLite
metadata and a direct `None` read from the profile-scoped operating-system
credential store; a credential-read error fails closed. A second exact-process
check follows the resumed Client. Any failure retains the private work and
installed staging locally for controlled inspection; neither is uploaded. Only
a sanitized, run-bound result summary and redacted process logs may be uploaded.
macOS derives the exact process set from `proc_listallpids` and canonical
`proc_pidpath` results, including directly started binaries that are not yet
visible through `NSWorkspace`; Windows uses CIM `Win32_Process` executable paths
and a separate private WebView2 profile for every Host and Client phase and
cleanup attempt. Failure to enumerate either platform's process set fails
closed. This gate proves installed native process lifecycle and loopback
authority routing; it deliberately does not claim stable `.local`/mDNS
discovery, route pinning, or HTTPS/TLS identity verification.

An installed process that fails before the UI receives its public gate
configuration writes a static, identity-bound failure result when possible and
always exits instead of consuming the full runner timeout. Host startup is
retried at most three times only when Rust classifies the actual listener bind
failure as `AddrInUse` and the safe phase result carries the closed
`port-in-use` kind for the expected Host startup step. This avoids localized
error parsing and a second time-of-check/time-of-use port probe. Generation 1
then selects a new port and resets only its private synthetic Host database and
all SQLite sidecars; generation 2 must recover on the original paired port.

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

The packaged desktop E2E starts the executable installed from the candidate DMG
or MSI twice against one synthetic, isolated database. Through the application's
normal Tauri command layer it creates a spool, updates its weight, lends and
returns it, creates a printer, assigns the spool to an AMS slot, restarts, and
then validates both persisted state and a complete portable backup. The harness
is available only when its exact environment gate, private work directory,
run-specific marker, and database path all agree. Unix artifacts use owner-only
`0700`/`0600` modes; Windows smoke parents use protected current-user ACLs. The
database is removed after the run and is never uploaded with the private smoke
logs.

## Accessibility authority

The data-backed browser gate runs axe against Dashboard, Inventory, Loans,
Printers, Statistics, and Settings with realistic synthetic data. Its threshold
is zero violations, not a severity-filtered allowance. The focused modal gate
covers behavior that a static scan cannot prove: initial focus, wrapped tab
order, Escape, focus restoration, scroll reachability, and layout at 200% zoom.

The desktop and Companion screenshot gates accept Auto, Light, Dark, Bambu, and
Prusa as explicit theme inputs. A theme-model or palette change must exercise a
representative desktop and Companion capture for every affected theme, verify
the resolved light/dark contrast contract, and retain the fixture's exact
filament, material, and status swatches. A decorative accent is never allowed
to redefine data colors merely to make a themed capture look consistent.

An accessibility exception must identify a standards-based reason, include a
bounded removal date, and be approved by the named accessibility gate owner.
There are currently no committed exceptions.

## Localization authority

English is the canonical source. The detailed publication, stale-fingerprint,
native-review, and string-freeze rules are in
[LOCALIZATION.md](LOCALIZATION.md). A selectable language must have complete
desktop and Companion catalogs without relying on an English catalog overlay.
Completeness and translation signal do not substitute for native review: an
unowned locale may remain a community translation, but it cannot be labelled
maintained.
Readiness also requires every selectable locale to be covered by a passed
`releaseQaAudits` record for the current English source, complete catalog-set and
runtime-contract fingerprints. Artifact QA
means complete desktop/Companion catalog generation and compilation; runtime QA
means key, placeholder, message-format, loading and runtime contract checks.
The runtime fingerprint includes the formatter, loaders, locale registry,
generator, localization gates and their contract tests, so changing those files
automatically expires older evidence.
The per-locale desktop matrix and representative Companion screenshot gate stay
separate release checks so the ledger cannot imply that an unrun or blocked
screen capture passed. None of these checks is native-language review.

## Wiring and change control

`npm run verify` includes the production UI build, UI lint, Companion and script
tests, both browser accessibility gates, the complete UI suite, deterministic
performance checks, localization contracts, the real-TCP Host/Client resilience
gate within the Rust suite, formatting, and Clippy in development and release
profiles. Both required platform jobs execute this command. The macOS job also
runs the data-backed Companion workflow gate with a generated fixture. Release publication
separately verifies the successful
`Database Migration Integrity`, `macOS Smoke`, and `Windows Smoke` check runs
for the exact commit. The platform smoke jobs also invoke the installed
Host-Client gate through `--packaged-host-client-e2e` on macOS and
`-RunPackagedHostClientE2E` on Windows. Windows retains the explicit
`UnsignedRequired` Authenticode policy until signing work is resumed.

The executable contract in `scripts/quality-gates-contract.test.mjs` fails if a
required command is removed from `npm run smoke`, a platform stops running
`npm run verify`, release publication stops requiring the migration-integrity
and both platform checks, or the documented ownership and core thresholds
disappear.
