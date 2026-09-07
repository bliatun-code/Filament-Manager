# Dependency Security And License Policy

The supply-chain workflow checks the two npm lockfiles and the Cargo workspace
for matching dependency pull requests, every Tuesday at 04:27 UTC, and when
started manually from GitHub Actions. The live advisory queries and
`cargo deny` deliberately stay outside `npm run verify`: they depend on registry
state or an extra audit tool, while `verify` must remain a repeatable source and
build gate. The deterministic npm lockfile policy is also exercised by the
ordinary script test suite.

The reviewed Rust release has one version source, `rust-toolchain.toml`, monitored by
Dependabot's Rust-toolchain ecosystem. Both Cargo packages declare Rust 1.88 as
their minimum supported version. Both required smoke jobs compile the complete
workspace with Rust 1.88 on their supported desktop platform before selecting
the exact pinned release for ordinary verification. Each CI, release and audit
Rust setup first runs `scripts/read-rust-toolchain.mjs` with Node 24. The reader
accepts one exact `x.y.z` release pin and rejects rolling channels, expressions,
missing or duplicate pins, and unsupported configuration syntax before writing
the validated value to GitHub Actions output. The SHA-pinned Rust setup action
uses that output explicitly while retaining its required components and targets.
Dependabot therefore updates only the version source; workflow and contract
tests do not keep another copy of the release number. Every new toolchain still
requires ordinary verification, including formatting, tests and Clippy; the
Rust 1.88 lower bound and formatting style remain separate, explicit contracts.

Dependabot surfaces major npm and Cargo upgrades as focused pull requests
instead of suppressing them with wildcard rules. The UI has two temporary,
named compatibility holds: `@types/node` follows the application's Node 24
runtime contract, and TypeScript remains on 6.x until the lint toolchain
supports TypeScript 7. The contract suite requires these holds to stay explicit
and tied to their manifest baselines.

The weekly Cargo version-update group explicitly allows both direct and
transitive dependencies. Eligible patch and minor updates share the existing
`rust-patches` pull request, so reviewing transitive maintenance does not require
one full smoke run per package. Major versions remain outside that group and
dependency constraints still apply. Security-update grouping is a separate
Dependabot setting. [Dependabot allow policy](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#allow).

The workflow has read-only repository permission, uses SHA-pinned GitHub
Actions, and installs the Rust audit tools from exact versions with their own
lockfiles:

- npm reports moderate, high, and critical vulnerabilities from both
  `package-lock.json` files;
- `cargo audit` rejects RustSec vulnerability advisories and still reports
  informational RustSec warnings;
- the npm lockfile policy rejects missing, malformed, or unapproved license
  expressions; and
- `cargo deny` checks normal, build, target-specific, and development
  dependencies against the Cargo license allowlist.

The Tauri dependency graph contains GTK dependencies used by its Linux/BSD
backend. RustSec reports maintenance and soundness warnings for that GTK3 graph,
including its `proc-macro-error` build dependency, even though Filament Manager
distributes macOS and Windows builds. Separately, the unmaintained `unic`
packages reach both supported platforms through `tauri-utils` and `urlpattern`.
Do not classify all maintenance warnings as Linux-only. Follow a published,
compatible Tauri update for that dependency chain; do not force an incompatible
`urlpattern` version into the lockfile. The dated
[dependency review](DEPENDENCY_REVIEW_2026-09-07.md) records the current paths and
follow-up decisions. All warnings remain visible in the scheduled report, but
only vulnerability advisories fail `cargo audit`. License violations always fail.

## Policy Files

- npm licenses:
  [`config/dependency-license-policy.json`](../config/dependency-license-policy.json)
- Cargo licenses: [`deny.toml`](../deny.toml)
- scheduled checks:
  [`.github/workflows/supply-chain.yml`](../.github/workflows/supply-chain.yml)

The npm policy evaluates SPDX `AND`, `OR`, parentheses, and `WITH` exceptions.
An `OR` expression passes when at least one selectable license is approved; an
`AND` expression requires every license. Package exceptions are fail-closed:
they must pin the exact package name, version, and reported license, include a
review reason, and remain in active use. There are currently no package
exceptions.

## Local Checks

Install the same Rust tools used in CI:

```bash
cargo install --locked cargo-audit --version 0.22.2
cargo install --locked cargo-deny --version 0.20.2
```

Run all live dependency checks:

```bash
npm run audit:dependencies
```

Or run individual checks:

```bash
npm run check:npm-licenses
npm run audit:npm
npm run audit:cargo
npm run check:cargo-licenses
```

Reproduce the declared Rust lower-bound check for the current host when changing
Rust or Cargo dependencies:

```bash
rustup toolchain install 1.88.0 --profile minimal
cargo +1.88.0 check --workspace --all-targets --all-features --locked
```

The npm and RustSec audits contact their public advisory services. A registry,
advisory database, malformed response, or tool installation failure makes the
scheduled job fail rather than silently accepting an unknown result.

When a dependency introduces a new license, review its actual terms and how the
package is shipped before changing an allowlist. Do not add a broad exception
or suppress an advisory merely to make CI green.
