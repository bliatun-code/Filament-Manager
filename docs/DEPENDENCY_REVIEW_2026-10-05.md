# Dependency maintenance — 2026-10-05

This is a dated registry and verification snapshot, following the
[September 30 upgrade](DEPENDENCY_UPGRADE_2026-09-30.md). It starts from main
`1814721a`, including the user's merges of Rust setup action PR #147 and Tauri
CLI 2.12.1 in PR #148. The application version remains 0.31.0 and the database
schema and valued filament/printer colors are unchanged.

## Main failures and dependency PR blockers

The main [CI run](https://github.com/bliatun-code/Filament-Manager/actions/runs/37367599917)
and [CodeQL run](https://github.com/bliatun-code/Filament-Manager/actions/runs/37367489345)
after #148 failed because some Ubuntu jobs never acquired a hosted runner.
Their annotations report "The job was not acquired by Runner of type hosted even
after multiple attempts"; the affected jobs had no executed steps. Both native
smoke jobs and shared contracts passed. Retrying the affected jobs is the
appropriate response; these failures do not establish a Tauri CLI regression.
Both CI and all three CodeQL analyses passed on the unchanged main commit in
their second attempts. No source change was needed to repair those runs.

Two open dependency updates had actual compatibility problems:

- Rust 1.99 deprecates `AtomicUsize::fetch_update`. With warnings denied, two
  test-only failure-counter calls stopped both native smoke jobs in #151.
  They now share a `compare_exchange_weak` loop with checked subtraction and
  the same sequentially consistent orderings. Exhaustion and eight-thread
  contention tests verify exact failure consumption. No warnings are suppressed;
  the helper also compiles on the declared Rust 1.90 minimum.
- SBOM action #146 updated the immutable SHA to v0.24.3, while two workflow tests
  required v0.24.2. The tests now require a full SHA and matching action pins
  between release and audit workflows. Permission, validation, output and
  failure-handling contracts remain in place. Actual SBOM generation in #146
  passed; its obsolete expectations caused the smoke failures.

## Selected updates

| Area | Updated stable versions |
| --- | --- |
| Reviewed Rust compiler | 1.98.1 → [1.99.0](https://github.com/rust-lang/rust/releases/tag/1.99.0); Rust minimum remains 1.90 |
| Tauri backend/runtime | 2.12.1; build/codegen/macros 2.7.1; utils 2.10.1; single-instance 2.5.2 |
| Other Cargo dependencies | 18 compatible lockfile updates in total, including Tokio 1.53.2, objc2 0.6.5, mdns-sd 0.21.5, cc 1.6.0 and uuid 1.27.0 |
| UI | Tauri API 2.12.1, Node types 24.19.1, React plugin 6.1.2, ESLint 10.12.0, globals 17.13.0, typescript-eslint 8.71.1 and Vite 8.3.2 |
| SBOM action/scanner | SHA-pinned Anchore action 0.24.3; [Syft 1.54.0](https://github.com/anchore/syft/releases/tag/v1.54.0) in both workflows |

Syft's release includes parser robustness fixes and tool-internal advisory
remediation. Cargo audit 0.22.2, Cargo deny 0.20.2 and CodeQL action 4.38.2 were
already current stable versions. The npm root lockfile was already current after
the user's CLI merge.

## Larger compatibility holds

- TypeScript stays at 6.0.3: typescript-eslint 8.71.1 still supports versions
  below 6.1. See its [supported versions](https://typescript-eslint.io/users/dependency-versions/).
  The manifest now uses `~6.0.3`; Dependabot holds minor and major updates until
  this range expands. Compatible patches remain eligible. TypeScript 7.0.2 is
  published, but does not satisfy the current lint peer contract.
- Node types remain on 24 because the application and CI support Node 24. The
  Node 24 runtime selector automatically follows its patches; 24.21.0 was the
  latest patch at review time. A Node 26 migration is a runtime-policy change.
- Tauri 3 remains an alpha; the stable CLI/API/backend line is 2.12.1.
- crypto-common 0.1.7, through Tauri codegen's sha2/digest chain, pins
  generic-array exactly to 0.14.7. Axum 0.8.9 pins matchit exactly to 0.8.4.
  GTK/glib-macros → proc-macro-crate 2.0.2 pins old toml_datetime/toml_edit and
  holds the older TOML branch. No overrides force incompatible versions forward.

After updating, root npm reports no outdated packages. UI reports only the
explicit Node-type/TypeScript major holds, with installed and wanted versions
equal. A Cargo dry run selects zero further Rust 1.90-compatible updates.
The five remaining older transitive versions are constrained by their parents.

## Verification

- Both npm audits and Cargo audit report zero vulnerability entries. Cargo's
  two existing `glib` soundness and `proc-macro-error` maintenance warnings remain
  visible on the Linux/BSD dependency branch; no advisory ignores were added.
- Both license checks pass. npm evaluates 311 entries in the two lockfiles.
- Rust 1.90 workspace/all-targets/all-features locked compile passes.
- The 46 focused release, supply-chain and toolchain contract tests pass.
- Syft 1.54's official macOS binary matches its published SHA-256 checksum.
  A scan of a tracked-source snapshot using the updated lockfiles produces a
  valid SPDX 2.3 report: 613 packages and 3,057 relationships. No installed
  dependencies or build outputs were included in that source snapshot.
- Full `npm run verify` passes with Rust 1.99: production UI build, lint,
  accessibility and repository contract checks; 406 Companion tests,
  900 script tests, 2,076 UI tests and 23 performance tests; and 1,078 Rust
  tests with three existing environment-dependent tests ignored. Debug and
  release Clippy pass with warnings denied.

An independent implementation review found no blocking issue. This batch does
not replace the installed application, touch a production library or printer,
publish a release, or reopen the completed visual review. The
[dependency policy](DEPENDENCY_SECURITY.md) governs ongoing holds; this report's
registry results are a snapshot rather than a continuing availability check.
