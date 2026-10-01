# Dependency review — 2026-09-30

This is the initial review. The subsequently authorized larger update is recorded
in the [stable upgrade report](DEPENDENCY_UPGRADE_2026-09-30.md), subsequently
merged in PR #142. The initial local-main, Rust 1.88 and deferred-Tauri statements
below describe the first maintenance stage, not the current checkout.

## Local update

Fetched GitHub main at `5b80cb95` and merged it into `codex/visual-modernization`
with merge commit `6878255f`. Local main now also points to `5b80cb95`.
This incorporates Dependabot PRs #138 (CodeQL), #139 (root npm), #140 (UI npm)
and #141 (Cargo). Existing visual work, the color restoration, and the RFID fix
were preserved. Both npm installation trees were refreshed from their lockfiles.
No push, application installation, or release was performed.

## Audit corrections

The initial UI npm audit identified three denial-of-service advisories in
`brace-expansion` 5.0.9, a transitive development dependency through ESLint /
minimatch. Updated only that lockfile entry to 5.0.12, within the existing range.
This is build/lint tooling, not evidence of an exposed application endpoint.
[Upstream advisory](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-qhr7-859c-m2p7).

Cargo audit additionally reported that `yoke-derive` 0.8.3 had been yanked.
Updated it to 0.8.4 without changing declared requirements. A yanked version is
not itself a vulnerability finding.

After these corrections, both npm audits report zero vulnerabilities. Cargo
reports zero vulnerability entries and the same seven informational warnings:
five `unic` maintenance warnings, `proc-macro-error` maintenance, and `glib`
soundness. The yanked-version warning is gone. npm and Cargo license checks pass.
No advisory suppression or license-policy exception was introduced.

## Previously deferred upgrades

| Upgrade | Current evidence | Decision |
| --- | --- | --- |
| Tauri / old `unic` chain | Stable Tauri 2.12.0 and tauri-utils 2.10.0 are published. The published utils manifest requires urlpattern 0.6, replacing the old 0.3 chain. Both crates require Rust 1.90. | The awaited stable upstream update has arrived, but is outside our declared Rust 1.88 support contract. Plan a coordinated Tauri CLI/API/backend update with an explicit MSRV and CI change. Keep 2.11.x in this maintenance review. |
| Tauri 3 | CLI next is 3.0.0-alpha.3; API next is 3.0.0-alpha.2. | Still prerelease; no migration in this update. |
| TypeScript 7 | Latest is 7.0.2, but typescript-eslint 8.71.0 still declares TypeScript >=4.8.4 <6.1.0. | Keep 6.0.3 until official lint/compiler-consumer support arrives. |
| Node 26 | Current, while Node 24 remains LTS. | Keep Node 24 and corresponding types; reassess at LTS transition. |
| Rust toolchain | Latest upstream stable remains 1.98.1. | Existing build-toolchain pin is current; it is distinct from the supported minimum of 1.88. |

Sources checked today:

- [Tauri 2.12 release](https://github.com/tauri-apps/tauri/releases/tag/tauri-v2.12.0)
- [tauri-utils 2.10 release and Rust 1.90 requirement](https://github.com/tauri-apps/tauri/releases/tag/tauri-utils-v2.10.0)
- Published crate manifests downloaded with `cargo info`, plus npm dist-tags and peer metadata.
- [typescript-eslint supported versions](https://typescript-eslint.io/users/dependency-versions/)
- [Node release status](https://nodejs.org/en/about/previous-releases)
- [Rust stable release](https://github.com/rust-lang/rust/releases/tag/1.98.1)

## Other available maintenance

Beyond the merged PRs, registry checks find Node 24 types 24.19.0 and
typescript-eslint 8.71.0. Tauri CLI/API 2.12.0 should be reviewed with the backend.
Cargo's initial dry run proposed 15 compatible updates; one (yoke-derive) was
applied above. The other 14 remain a separate optional maintenance batch:
js-sys, quinn-proto, quinn-udp, serde_with and its macros, siphasher, smallvec,
tokio-rustls, five wasm-bindgen packages, and web-sys.
This review does not claim every published dependency is now installed.

## Local verification

- UI production build and lint pass.
- All 2,073 UI tests and 406 Companion tests pass.
- Rust 1.88 workspace/all-targets/all-features locked compile passes.
- Dependency audits, both license policies, and GitHub Actions SHA-pin checks pass.
- All 1,076 Rust tests pass (three intentionally ignored tests remain ignored).
- Debug Clippy with warnings denied passes.

The UI lint run also found a render-time ref read in the pre-existing, unfinished
filament-defaults dialog change. Its return-focus element now uses state. That
small correction remains with the existing uncommitted dialog work; it is not
included in the dependency lockfile commit.

These are local macOS checks. Windows CI, packaged app behavior, and release
verification have not been rerun for this combined branch.
