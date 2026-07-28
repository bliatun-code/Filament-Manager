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
