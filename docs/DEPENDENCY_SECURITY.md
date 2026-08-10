# Dependency Security And License Policy

The supply-chain workflow checks the two npm lockfiles and the Cargo workspace
for matching dependency pull requests, every Tuesday at 04:27 UTC, and when
started manually from GitHub Actions. The live advisory queries and
`cargo deny` deliberately stay outside `npm run verify`: they depend on registry
state or an extra audit tool, while `verify` must remain a repeatable source and
build gate. The deterministic npm lockfile policy is also exercised by the
ordinary script test suite.

The reviewed Rust release is pinned in `rust-toolchain.toml` and monitored by
Dependabot's Rust-toolchain ecosystem. Both Cargo packages declare Rust 1.88 as
their minimum supported version; the ordinary release and smoke jobs use the
exact pinned release. Rust-toolchain pull requests must update the explicit
workflow toolchain values to match; the contract suite rejects partial bumps.

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

The Tauri dependency graph contains GTK dependencies used only by Tauri's Linux
backend. RustSec currently reports maintenance and soundness warnings for that
GTK3 graph even though Filament Manager distributes macOS and Windows builds.
Those warnings remain visible in the scheduled report, but only vulnerability
advisories fail `cargo audit`. License violations always fail.

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

Verify the declared Rust lower bound separately when changing Rust or Cargo
dependencies:

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
