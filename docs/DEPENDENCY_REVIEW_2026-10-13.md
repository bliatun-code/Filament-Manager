# Dependency maintenance — 2026-10-13

This dated registry and verification snapshot follows the
[October 5 review](DEPENDENCY_REVIEW_2026-10-05.md). It starts from main
`66b955e5`, the merge of PR #152. That commit passed ordinary main CI and all
three CodeQL analyses. Application version 0.31.0, database schema, Rust 1.90
minimum, Node 24 support and the valued filament/printer colors remain unchanged.

## Scheduled audit finding repaired

The [scheduled audit after the previous merge](https://github.com/bliatun-code/Filament-Manager/actions/runs/37414690319)
failed specifically at the UI npm audit. Its UI build dependency `source-map-js` 1.2.1
matched the high-severity indexed source-map denial-of-service advisory
[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
This refresh selects the first patched version, 1.2.2, and both current npm
audits pass. Root audit/licenses, Cargo audit/licenses and SBOM had passed in
the older scheduled run. No gate is weakened and no advisory is ignored.
The advisory metadata was updated October 5 at 23:31 UTC, after the previous
merge verification; its original publication date was September 18.

## Selected compatible updates

| Area | Updated stable versions |
| --- | --- |
| Tauri | Backend/API 2.12.3; CLI 2.12.2; build/codegen/macros 2.7.2; single-instance 2.5.3 |
| Other Cargo dependencies | 30 compatible lockfile updates, including serde_json 1.0.154, sha2 0.11.1, zeroize 1.9.1, hyper 1.12.0, cc 1.8.0 and uuid 1.28.0; obsolete winreg 0.55 / windows-sys 0.59 branches removed |
| npm | Playwright 1.64.0, Node types 24.19.2, typescript-eslint 8.71.2 and Vite 8.3.4, plus Tauri CLI/API above |
| GitHub Actions | CodeQL 4.38.3, setup-node 7.1.0, download-artifact 8.0.2, upload-artifact 7.0.2 and reviewed dtolnay/rust-toolchain revision `e2a55d2` |
| SBOM scanner | Syft 1.54.1 in release and supply-chain workflows; Anchore action remains 0.24.3 |

[Tauri 2.12.3](https://github.com/tauri-apps/tauri/releases/tag/tauri-v2.12.3)
fixes channel-handler error propagation and Windows NSIS downgrade handling.
[CodeQL 4.38.3](https://github.com/github/codeql-action/releases/tag/v4.38.3)
selects its standard bundle 2.27.2 through the immutable action pin.
The [Rust setup revision](https://github.com/dtolnay/rust-toolchain/compare/7e38f4b43b4db5c8dd498af069a4f6196df1d067...e2a55d2ffb04f378e9626c28d38b36d230d1e12f)
improves input quoting. The artifact patches improve retry handling;
[Syft 1.54.1](https://github.com/anchore/syft/releases/tag/v1.54.1) fixes
deterministic NuGet `packages.lock.json` processing and Podman attestation handling.

All action references retain full immutable SHAs. Artifact contract tests now
require consistent immutable revisions within their reviewed major versions,
instead of requiring the previous download action's SHA. Permissions, release
gates, cache budgets, inputs and fail-closed validation remain in place.

## Larger upgrades still waiting

| Hold | Current evidence and next decision |
| --- | --- |
| TypeScript above 6.0.x | TypeScript 7.0.2 is published, but typescript-eslint 8.71.2 still requires `>=4.8.4 <6.1.0`. Keep `~6.0.3` and the explicit minor/major hold until the lint peer range expands. [Supported versions](https://typescript-eslint.io/users/dependency-versions/). |
| Tauri 3 | Backend/CLI remain alpha.4 and API alpha.2, unchanged since the previous review. Keep the stable 2.x line. [Alpha release](https://github.com/tauri-apps/tauri/releases/tag/tauri-v3.0.0-alpha.4). |
| Node 26 | Node 24.21.0 remains the supported LTS patch line. Node 26.11.1 is Current; its LTS transition is scheduled for October 28, a useful point to revisit the runtime policy. This is a policy decision, not a current peer failure. [Official schedule](https://github.com/nodejs/Release/blob/main/schedule.json). |
| Rust compiler | 1.99.0 remains the latest stable compiler; no new patch is available. [Release](https://github.com/rust-lang/rust/releases/tag/1.99.0). |

The remaining older Cargo versions are constrained by their parents:

- Tauri codegen 2.7.2 still uses sha2 0.10, whose crypto-common 0.1.7 branch
  pins generic-array exactly to 0.14.7. Updating our direct sha2 0.11 branch
  does not release that constraint.
- Axum 0.8.9 still pins matchit exactly to 0.8.4.
- GTK/glib-macros 0.18.5 still uses proc-macro-crate 2.0.2, with exact old
  toml_datetime/toml_edit requirements. The older TOML branch remains held.
- Brotli 9.0.0 requires decompressor `~6.0`, which excludes the newly published
  6.1.0 minor. This is a parent range constraint, not an MSRV failure.
  [Dependency metadata](https://crates.io/api/v1/crates/brotli/9.0.0/dependencies).
- The GTK branch still carries the known `glib` soundness and
  `proc-macro-error` maintenance warnings. Its parent requirements have not
  moved to the branches that remove those warnings. No advisory ignores or
  forced dependency overrides were added.

Root npm reports no outdated packages after the update. UI reports only the
Node-type and TypeScript holds, with installed and wanted versions equal.

## Verification

- npm audits report zero vulnerabilities; the npm license check passes for
  311 package entries across both lockfiles.
- Cargo audit reports zero vulnerability entries and the same two visible
  informational warnings. The all-feature Cargo license check passes.
- Rust 1.90 workspace/all-targets/all-features locked compilation passes.
- All 53 focused workflow contracts pass, as do action pinning and YAML parsing
  for the four workflows.
- The official Syft 1.54.1 macOS binary matches its published SHA-256 checksum.
  A scan of the updated tracked-source snapshot passes SPDX validation with
  611 packages and 3,049 relationships.
- Full `npm run verify` passes with Rust 1.99: production UI build, lint,
  accessibility and repository contracts; 406 Companion, 901 script, 2,076 UI,
  23 performance and 1,078 Rust tests. Three existing environment-dependent
  Rust tests remain ignored. Debug and release Clippy pass with warnings denied.

An independent implementation review found no blocking issue. All four
workflows retain the same behavior when their reviewed action and scanner pins
are excluded from comparison.

The [dependency policy](DEPENDENCY_SECURITY.md) remains the source for ongoing
holds. These version findings are a dated snapshot. This maintenance batch does
not publish a release or replace the installed application or production data.
