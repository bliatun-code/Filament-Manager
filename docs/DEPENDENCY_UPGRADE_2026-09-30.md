# Stable dependency upgrade — 2026-09-30

This follows the initial [dependency review](DEPENDENCY_REVIEW_2026-09-30.md).
The user requested the larger available stable update after the main sync and
audit corrections. Existing visual changes and their stronger restored colors
are preserved; application version and database schema are unchanged.

## Updated dependencies

- Tauri backend 2.11.6 → 2.12.0, build/codegen/macros → 2.7.0, utils → 2.10.0,
  single-instance plugin → 2.5.1, and matching npm CLI/API → 2.12.0.
- Node 24 types → 24.19.0 and typescript-eslint → 8.71.0.
- The Cargo resolver selected 54 new package versions within the declared
  requirements, including the coordinated Tauri runtime dependencies and the
  remaining compatible TLS, Quinn, serde_with and WebAssembly updates.
- urlpattern 0.3 → 0.6 removes all five old unic packages. Obsolete transitive
  TOML/Windows generations are also removed where no longer needed.

[Tauri 2.12](https://github.com/tauri-apps/tauri/releases/tag/tauri-v2.12.0)
includes capability-origin fixes, cleanup of window/webview listeners, and
macOS tray-event fixes. The application does not opt into its new APIs merely
by upgrading.
[tauri-utils 2.10](https://github.com/tauri-apps/tauri/releases/tag/tauri-utils-v2.10.0)
requires Rust 1.90. Both Cargo manifests, native CI minimum-version checks and
cleanup commands, cache fingerprints, contract tests, README, contributing
guide and dependency policy now use that minimum. The reviewed build compiler
remains pinned to Rust 1.98.1.

## Holds and audit status

TypeScript stays at 6.0.3 because typescript-eslint still supports versions
below 6.1; Node stays on the chosen 24 LTS line. Tauri 3 prereleases are excluded.
The root npm outdated check is empty; UI reports only the TypeScript and Node
type major holds. A Cargo dry run selects zero additional compatible updates.
The older generic-array, matchit and TOML packages remain constrained by their
parents; no dependency overrides were added to force them forward.

Both npm audits report zero vulnerabilities. Cargo audit reports zero
vulnerability entries and two informational warnings (`glib` soundness and
`proc-macro-error` maintenance on the Linux/BSD branch). Targeted dependency
trees show neither package on aarch64 macOS or x86_64 Windows. The five unic warnings
are resolved by removal of the packages, without adding ignores. Both license
checks pass.

## Verification

- The 24 focused Rust toolchain/cache contract tests pass.
- Full smoke passes: 406 Companion, 896 script, 2,073 UI and 23 performance tests,
  accessibility gates, contracts, production UI build, lint and doctor.
- Rust 1.90 workspace/all-targets/all-features locked compile passes.
- A signed debug macOS app bundle builds successfully (not notarized).
- The isolated packaged Host/Client gate passes using the signed bundle and synthetic databases.
- All 1,076 Rust tests pass; three pre-existing ignored tests remain ignored.
- Formatting and both debug/release Clippy profiles pass with warnings denied.

No installed user application, production database or printer was modified and
no release was published by this batch. Subsequent macOS and Windows CI passed
before [PR #142](https://github.com/bliatun-code/Filament-Manager/pull/142) was
merged as `7ff84845`. This report retains the September 30 registry/audit snapshot;
ongoing compatibility holds are governed by the [dependency policy](DEPENDENCY_SECURITY.md).
