# Architecture

Filament Manager is a Rust workspace with a React desktop UI and a browser
Companion. The boundaries below keep database behavior reusable, platform
startup explicit, and live-printer decisions independently testable.

## Workspace Boundaries

- The workspace-root `filament-manager-core` package owns the platform-neutral
  domain and SQLite backend under `src/backend/`.
- `src-tauri/` depends on that package normally. It owns Tauri commands,
  desktop integration, Companion HTTP/session handling, local-network runtime,
  document export, and printer transport.
- `ui/` owns the React desktop interface and its view models.
- Companion browser assets are built from the Tauri source tree but consume the
  same authenticated application services and core database contract.

The Tauri crate must not include backend files through cross-tree `#[path]`
attributes. Add a backend module to `src/backend/mod.rs` and expose only the
smallest API the adapter needs.

## Presentation Layers

The React desktop UI and the browser Companion remain separate presentation
layers. They share Rust-owned business authority and generated wire contracts,
while their Tauri and same-origin HTTP adapters, navigation, state, and rendering
remain surface-specific. Pure models are shared only when their inputs, outputs,
and behavior are genuinely identical and adapter-free.

The measured alternatives, bundle and overlap baselines, security constraints,
and concrete re-evaluation triggers are recorded in
[`ADR_REACT_COMPANION_CONSOLIDATION.md`](ADR_REACT_COMPANION_CONSOLIDATION.md).

## Desktop Background Lifecycle

`src-tauri/src/desktop_lifecycle.rs` owns the macOS menu-bar and Windows system-
tray lifecycle. The main window starts hidden and is shown after setup during a
normal launch; the autostart-only `--background` argument deliberately leaves
it hidden. A machine-local preference controls whether a user close request
hides the window or exits the process. Tray **Quit**, the macOS application-menu
**Quit**, and a failed hide always take the real exit path. The webview sends
the selected interface language's Open/Quit labels to the native tray menu (and
the custom macOS application-menu Quit item) after startup and whenever the
locale changes.

The real exit path has three phases: running, stopping, and exit allowed. The
first exit request is prevented while a single coordinator signals the LAN
watcher and Bambu Live observer, stops scheduling new blocking polls, and joins
or aborts the owned async tasks within fixed deadlines. It then shuts down the
Companion HTTP listener and local-service advertisement under the reconciliation
gate before allowing the final process exit. This prevents a network watcher or
late startup reconciliation from rebinding Companion during shutdown. A sync
printer poll already executing on a blocking thread remains best-effort and is
bounded by its network timeouts. Native operating-system termination paths such
as macOS Dock Quit, forced quit, logout, shutdown, or process kill can still
bypass asynchronous cleanup; committed SQLite transactions remain durable and
the OS closes process sockets.

Single-instance handling restores and focuses the existing main window. This
prevents a hidden second process from competing for SQLite, the Companion port,
or the stable mDNS name. Companion reconciliation, the LAN watcher, and Bambu
Live observation are Rust-owned process tasks and continue while the webview is
hidden. Frontend client-refresh timers use document visibility and are designed
to pause while the native window is hidden; continuous hidden Client
synchronization would require a separate Rust-owned scheduler.

Background mode is a user-session process, not an operating-system service. It
does not survive sign-out or shutdown and does not run while the machine is
asleep.

## Companion Network Address

On macOS and Windows, a Companion host advertises one stable `.local` address
through mDNS on the selected LAN. Pairing links and QR labels use that stable
address, while the exact current IP address remains available for listener
diagnostics. A DHCP change may update the listener binding without changing the
address shared with users. The canonical library-derived address uses the short
`fm-xxxxxxxx.local` form, and the HTTP root redirects to `/companion` for manual
entry.

Successful service registration alone is not enough to enable stable links.
Before the trusted-LAN runtime marks the name as available, it must resolve the
exact library-derived hostname to the selected private IPv4 address. This
prevents Windows from exposing pairing or QR links after a registration result
that did not produce a usable hostname.

The Windows responder enables only the selected private interface and IPv4
loopback. Loopback is required for reliable same-host Windows name resolution,
while excluding every other adapter prevents an explicit A record from being
announced over an unselected interface on the same subnet.

Stable-name resolution is limited to devices on the same LAN where mDNS traffic is allowed.
Existing IP-based browser and desktop pairings are not rewritten automatically;
they require one new pairing, and labels containing an old IP address must be
reprinted.

Desktop clients reuse pooled, proxy-free HTTP clients. Stable `.local` hosts
resolve through a shared mDNS daemon with one single-flight route slot per
hostname. Each resolved route keeps its own reusable pinned client. Requests
retain the stable URL, host header, TLS name, and origin while their connections
are pinned to a discovered private IPv4 address, so client authentication
remains host-bound without depending on ordinary DNS forwarding for `.local`.

A successfully resolved route remains fresh for five minutes. Periodic
revalidation keeps a last-known-good route through a transient multicast failure
but retries discovery after 30 seconds. If the cached address itself has a
transport failure while discovery is unavailable, only a credential-free health
request may try that exact previous pin again. The route is promoted only after a
ready response reports the exact expected library ID. Authenticated reads and
writes are never transparently replayed onto a newly resolved address after a
transport failure.

The desktop runtime caches a host-matched authenticated session and a zeroizing
copy of its device token after successful renewal. Concurrent failures collapse
to one renewal attempt; credential changes, authorization failures, reset, and
rollback paths still invalidate or restore the complete runtime state under the
credential-mutation gate.

The stable name is a library identity, so only one active Companion host may
publish it at a time. A copied backup on a second host fails closed on name
collision rather than accepting a platform-generated rename. On macOS, DNS-SD
error `-65548` is treated as this name-conflict condition and surfaced as an
actionable Host handoff instead of a generic platform failure.

## Incremental Module Maintenance

Large modules are reduced along existing responsibility boundaries when their
area is otherwise being changed. Line count alone is not a reason for a broad
rewrite, and an extraction must preserve the existing public API and gain
focused behavior or contract coverage.

The current seams are:

- `companion_api.rs` owns Companion sessions, request protection,
  credential-bearing operations, and the remaining workflow mutations;
  protected inventory, catalog, printer, loan, wishlist, QR, and spool-detail
  reads live in `companion_inventory_read_api.rs`, wishlist mutations live in
  `companion_wishlist_write_api.rs`, and read-only health and `/library/*`
  handlers live in `companion_library_api.rs`;
- `inventory_engine.rs` remains the public transaction-oriented domain API,
  while Bambu Live context derivation for printer-slot assignments is isolated
  in `inventory_printer_slot_live.rs`;
- `vendor_lookup.rs` owns vendor lookup orchestration and network behavior;
  reusable HTML, color, handle, and weight parsing lives in
  `vendor_lookup_parsing.rs`; pure eSUN material-filter and source selection
  policy lives in `vendor_lookup_material_scope.rs`, and deterministic
  known-entry reuse and freshness policy lives in `vendor_lookup_cache.rs`;
- `inventory_bambu_batch_modal.tsx` owns camera/image state, effects, timers,
  and modal composition; the state-free batch review surface lives in
  `inventory_bambu_batch_review_panel.tsx`, while pure labels, previews,
  messages, and shared presentation classes live in
  `inventory_bambu_batch_modal_model.ts`;
- Companion `app.css` contains the shared foundation and reusable components,
  while `workspace.css` contains the application shell and workflow layouts.
  Their order in `index.html` is part of the visual contract.

`use_printer_slot_interactions.ts` remains cohesive around stateful slot
operations, permissions, validation, and writes. Pure incoming-weight dialog
preparation and draft discard behavior live in
`printer_slot_weight_interaction_model.ts`. Extract further only when a changed
interaction exposes another small effect boundary that can be tested
independently; do not move code merely to reduce the file length.

## Startup And Storage

`src-tauri/src/main.rs` is application wiring. Database location selection,
schema preparation, recovery snapshots, legacy storage migration, and the
Windows split-location merge live in `src-tauri/src/app_storage.rs`.

Storage changes must preserve these rules:

- inspect an existing database before applying a schema update;
- create and retain the appropriate recovery snapshot around destructive or
  migratory work;
- never replace a readable database with a weaker legacy candidate;
- keep device credentials and transport state out of portable data flows;
- treat Windows split-location conflicts as failures, not silent overwrites.

## Data Consistency And Request Responsiveness

`InventoryEngine` is the transaction boundary for user-visible inventory
changes. A command that changes a spool, related locations or loans, weight
readings, print jobs, and history must commit all of those records together or
leave all of them unchanged. Lower database helpers that already own a
transaction expose an internal connection-based variant when they need to join
an engine transaction; nested independent transactions are not an acceptable
substitute.

Compound detail and statistics responses use one deferred SQLite read
transaction. Every query contributing to a response therefore observes the
same database snapshot, even if another connection commits while the response
is being assembled.

The statistics value/cost report is calculated only in Rust from recorded
weights, purchase price, and purchase currency. Inventory value uses the
current active-spool snapshot, while material cost uses the report's half-open
UTC period. Amounts remain partitioned by currency and ownership; missing or
invalid input contributes to explicit row and weight coverage instead of a
zero value. Trace payloads are deterministically capped at 2,000 rows, but the
totals and coverage stream every matching row inside the same read transaction.
The additive nullable report field lets a newer Client expose an older Host as
unavailable without introducing a divergent local calculation.

The inventory-overview contract keeps rolling usage distinct from its existing
30-day totals. Its twelve-month series contains the current local calendar
month and the preceding eleven months, zero-filled and ordered oldest to
newest, from printer-linked jobs and persisted Bambu Live usage sessions. The
`consumption_12m_available` flag defaults to false when an older host omits the
new fields, so a newer client can request an upgrade instead of treating absent
history as zero. The UI derives the chart headline from the same normalized
buckets it renders, and the client Dashboard snapshot cache carries both the
series and its availability state.

The Companion server treats SQLite, credential-store, catalog-network, and
other blocking work as blocking operations:

- Axum handlers submit that work through the bounded Companion blocking
  executor instead of running it on async worker threads;
- request middleware performs database-backed session authorization through
  the same boundary;
- the in-memory session store removes expired sessions and enforces a fixed
  capacity, evicting the oldest session first.

Keep these boundaries explicit when adding a route. A fast handler may validate
headers or transform an already-loaded value directly, but it must not open
SQLite, contact a remote host, or access an operating-system credential store
on an async worker thread.

Desktop client commands follow the same principle through a separate bounded
blocking executor. It admits at most 32 operations and runs at most eight at a
time. Host reads, pairing, supported writes, cache refreshes, and library-sync
settings clone the owned application state and move the complete synchronous
network, credential-store, and database chain behind that boundary. A wrapper
must not acquire the credential-mutation gate or perform part of a write before
delegation. Bambu and eSUN catalog refreshes deliberately retain a longer
reviewed network budget, but they do not run on the UI invoke path.

## Bambu Live Boundaries

Passive local discovery is a convenience path, not printer authentication. An
untrusted advertised address and serial may fill a setup form, but a saved
printer address may change only after the stored serial and SPKI pin verify the
candidate over TLS. Discovery and recovery never read or send an access code.

When a trusted Live poll fails before any different TLS identity is observed,
automatic address recovery may run on a per-printer cooldown. It discovers
private-LAN candidates, considers only the saved serial, applies the same TLS
pin proof as manual recovery, and uses a compare-and-swap database update so a
concurrent settings edit cannot be overwritten. An untrusted or changed
identity remains blocked for explicit user review; automatic recovery cannot
turn discovery metadata into trust.

The live-printer path is intentionally ordered:

1. `bambu_printer_discovery.rs` listens briefly for local Bambu announcements
   on a user-selected private interface and treats all announcement metadata as
   untrusted until the TLS identity check passes.
2. `bambu_tls_identity.rs` extracts the certificate identity and requires the
   configured serial plus locally approved SPKI before authentication.
3. `credential_store.rs` resolves reusable secrets through a machine-local
   profile backed by macOS Keychain or Windows Credential Manager.
4. `bambu_live.rs` owns bounded polling and writes MQTT authentication only
   after the exact TLS connection passes the identity gate.
5. `bambu_live_observation.rs` parses payloads and merges partial observations.
6. `bambu_live_matching.rs` evaluates exact RFID and conservative metadata
   candidates without writing inventory.
7. `bambu_live_usage.rs` applies slot and weight/session rules after matching.
8. `bambu_live_persistence.rs` stores the final observation and state-change
   events.
9. `bambu_live_sync.rs` keeps the matching-before-usage orchestration explicit.

Weak color or name hints must never outrank an exact RFID identity or a
deliberate manual override. Persistence remains after enrichment so readers do
not observe a partially processed state.

Large AMS weight discontinuities are rejected by automatic sync. Explicit
acceptance is narrower than a manual scale reading: the authoritative engine
requires an online, MQTT-connected and settled observation, fresh identity and
weight evidence newer than any manual cache clear, the assigned loaded slot,
and one unique exact RFID match. It re-derives the estimate and compares the
expected stored weight inside a `BEGIN IMMEDIATE` transaction, then writes only
the corrected spool weight and assigned status, the reviewed virtual AMS scale,
a weight reading, and correction history. It must not create a print job or
live-usage session for an interval the app did not observe.

Automatic live-weight sync starts its own immediate transaction before reading
the spool and holds it through classification and all related writes. This
serializes it against explicit acceptance and prevents a stale background
decision from overwriting the correction. Observation merging also starts a new
weight-evidence generation when the effective UUID/RFID identity, loaded state,
or identity-bearing spool metadata changes; an earlier roll's percentage or
weight timestamp must never carry into a new exact match.

## Verification

Run the complete contract before submitting structural changes:

```bash
npm run verify
```

Focused Rust work can start with:

```bash
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo clippy --workspace --release --all-targets -- -D warnings
```

Architecture tests guard the core-crate import, startup ownership, and the
Bambu Live orchestration boundaries. Update a guard only when the replacement
boundary is equally explicit and covered by behavior tests.

The accessibility gate has two layers. The isolated AppModal harness exercises
focus order, focus return, keyboard trapping, Escape, and 200% zoom. The
data-backed axe analysis renders the sanitized application fixture and checks
Dashboard, Inventory, Loans, Printers, Statistics, and Settings after each page
has loaded real fixture evidence. Both layers run in `npm run smoke`; a static
component-only assertion is not a replacement for either browser pass.

Performance regression contracts and the current budgets are documented in
[`PERFORMANCE_BASELINE.md`](PERFORMANCE_BASELINE.md).
