# Dependency maintenance — 2026-10-26

This review starts from v0.35.0 (`a66ffd7e`) and follows the
[October 13 review](DEPENDENCY_REVIEW_2026-10-13.md). Application version,
database schema, Node 24 support and Rust 1.90 minimum are unchanged.

## Compatible updates

- Local Node 24.14.1 → 24.22.1, the October 21 security release; the existing
  nvm default remains the Node 24 line. Node 26 is still Current on this date.
- Tauri CLI 2.12.4 and Rust Tauri 2.12.5, with build/codegen/macros 2.7.4.
- ESLint 10.13.0, typescript-eslint 8.72.0 and Vite 8.3.5, including its
  Rolldown 1.2.15 dependency.
- 38 compatible Cargo lockfile updates, including Brotli 9.1.0 and
  brotli-decompressor 6.2.0. Tauri's existing Brotli requirement accepts them;
  no override or Rust minimum increase is needed.
- CodeQL 4.39.1, pinned to the same full immutable SHA for init and analyze.

These incorporate the updates proposed in Dependabot PRs #179–#182 on the
current main baseline. A subsequent Cargo dry run selects zero more compatible
updates; npm reports only the intentional TypeScript and Node type major holds.

## Compatibility holds

TypeScript stays at 6.0.3: typescript-eslint 8.72 still requires TypeScript
below 6.1. Node types stay at 24 to match the runtime. Tauri 3 remains a
prerelease; stable Tauri 2 remains selected. Revisit Node 26 after its scheduled
October 28 LTS transition, as a separate runtime migration.

The Axum matchit pin, Tauri codegen's SHA-2 0.10 / crypto-common 0.1 /
generic-array 0.14 branch and the GTK 0.18 / old TOML macro branch still require
upstream changes. Rusqlite 0.41 is a separate breaking update. None is forced
forward through a dependency override.

## Audit status

Both npm audits report zero vulnerabilities. npm and Cargo license checks pass.
Cargo audit reports no vulnerability advisories and five informational warnings:
`glib`, `proc-macro-error`, `zbus_names`, `zvariant` and `zvariant_derive`.

The three newer maintenance advisories describe standalone crates folded into
zbus 6. They enter through the single-instance plugin's Linux/BSD zbus 5 branch;
all three are absent from the macOS and Windows target graphs. Upgrading that
branch requires an upstream plugin migration. The GTK warnings are also confined
to Linux/BSD. No advisory suppression or license exception was added.

References: [Node 24.22.1](https://github.com/nodejs/node/releases/tag/v24.22.1),
[TypeScript lint compatibility](https://typescript-eslint.io/users/dependency-versions/),
[zvariant advisory](https://rustsec.org/advisories/RUSTSEC-2026-0370),
[zbus_names advisory](https://rustsec.org/advisories/RUSTSEC-2026-0371),
[zvariant_derive advisory](https://rustsec.org/advisories/RUSTSEC-2026-0372).

## Verification

- Rust 1.90 locked workspace/all-target/all-feature compilation passes.
- Full smoke with Node 24.22.1 passes: production UI build, lint, accessibility,
  repository contracts and doctor; 421 Companion, 905 script, 2,221 UI and
  23 performance tests.
- Native and core Rust tests pass; formatting and Clippy results are recorded
  in [PR #183](https://github.com/bliatun-code/Filament-Manager/pull/183), together
  with Windows/macOS verification, installer and CodeQL checks.
