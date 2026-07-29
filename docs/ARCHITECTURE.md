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

## Incremental Module Maintenance

Large modules are reduced along existing responsibility boundaries when their
area is otherwise being changed. Line count alone is not a reason for a broad
rewrite, and an extraction must preserve the existing public API and gain
focused behavior or contract coverage.

The current seams are:

- `companion_api.rs` owns Companion mutations, sessions, credentials, and
  workflow handlers; read-only health and `/library/*` handlers live in
  `companion_library_api.rs`;
- `inventory_engine.rs` remains the public transaction-oriented domain API,
  while Bambu Live context derivation for printer-slot assignments is isolated
  in `inventory_printer_slot_live.rs`;
- `vendor_lookup.rs` owns vendor lookup orchestration and network behavior;
  reusable HTML, color, handle, and weight parsing lives in
  `vendor_lookup_parsing.rs`, while pure eSUN material-filter and source
  selection policy lives in `vendor_lookup_material_scope.rs`;
- `inventory_bambu_batch_modal.tsx` owns modal state, effects, and rendering;
  pure labels, previews, messages, and presentation classes live in
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

## Bambu Live Boundaries

The live-printer path is intentionally ordered:

1. `bambu_tls_identity.rs` extracts the certificate identity and requires the
   configured serial plus locally approved SPKI before authentication.
2. `credential_store.rs` resolves reusable secrets through a machine-local
   profile backed by macOS Keychain or Windows Credential Manager.
3. `bambu_live.rs` owns bounded polling and writes MQTT authentication only
   after the exact TLS connection passes the identity gate.
4. `bambu_live_observation.rs` parses payloads and merges partial observations.
5. `bambu_live_matching.rs` evaluates exact RFID and conservative metadata
   candidates without writing inventory.
6. `bambu_live_usage.rs` applies slot and weight/session rules after matching.
7. `bambu_live_persistence.rs` stores the final observation and state-change
   events.
8. `bambu_live_sync.rs` keeps the matching-before-usage orchestration explicit.

Weak color or name hints must never outrank an exact RFID identity or a
deliberate manual override. Persistence remains after enrichment so readers do
not observe a partially processed state.

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
