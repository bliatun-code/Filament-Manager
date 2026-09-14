# Dependency review — 2026-09-14

This review starts from PR #120's merge, `36ff64f6`, and combines the updates
proposed in Dependabot #121–123. All three original PRs were green when reviewed;
their results do not substitute for verification of this combined candidate.

## Updates in this batch

- React and React DOM 19.2.8 → 19.3.0, with matching 19.3 type packages.
- Vite 8.2.2 → 8.3.0, typescript-eslint 8.69.0 → 8.70.0 and Node 24 types
  24.13.3 → 24.13.4.
- CodeQL init/analyze 4.37.9 → 4.38.0, retaining a full commit SHA pin.
  The upstream annotated release tag resolves to `b96794f015dfd88f77b49b1c93e0fa7110f94c63`.
- 37 Cargo package versions change, including Dependabot's 16 named updates,
  their dependency adjustments, and the remaining compatible patch updates.
  The unused `tinyvec_macros` package is removed. Cargo manifests and Rust's
  existing 1.88 minimum remain unchanged.

[React 19.3](https://react.dev/blog/2026/09/09/react-19-3) shipped on September 9.
Its new View Transitions and Fragment Refs APIs are stable, but this maintenance
batch does not introduce their use. Existing modal, registration, stale-response,
accessibility and performance tests exercise the upgraded React runtime.
[Vite 8.3](https://github.com/vitejs/vite/releases/tag/v8.3.0) includes preload
and proxy performance work and fixes dependency path matching.

The native changes include [reqwest 0.13.5](https://github.com/seanmonstar/reqwest/releases/tag/v0.13.5)
(blocking-client timeout and proxy-credential fixes),
[mdns-sd 0.21.3](https://github.com/keepsimple1/mdns-sd/releases/tag/v0.21.3)
(legacy unicast response ID/TTL correctness), plist 1.10.1 and open 5.4.4.
serde_with 3.23 moves its macros to syn 3/darling 0.24; existing syn generations
needed by other crates are retained.

The additional [quinn-proto 0.11.18 security release](https://github.com/quinn-rs/quinn/releases/tag/quinn-proto-0.11.18)
fixes three panic advisories involving stream reads, datagram buffering and ACK
delay; quinn moves to 0.11.12.
These packages remain in the lockfile for reqwest's optional HTTP/3 dependency
chain. HTTP/3 is not enabled here, and the current macOS/Windows normal/build
feature trees contain no active quinn-proto path. This is preventive lockfile maintenance,
not evidence of an exploitable QUIC endpoint in Filament Manager.

## September upgrades and remaining holds

| Area | Published status checked September 14 | Decision / next trigger |
| --- | --- | --- |
| React | 19.3.0 stable, September 9 | Included with matching DOM and type packages. |
| Tauri | 3.0.0-alpha.0, September 12–13; stable remains tauri 2.11.5 / tauri-build 2.6.3 / tauri-utils 2.9.3 | Keep stable 2.x. Revisit a compatible stable fix or a separately planned stable v3 migration. |
| TypeScript | Latest stable 7.0.2; current supported 6.x is 6.0.3 | Keep 6.0.3 until typescript-eslint supports 7 and compiler-API consumers/build invocation can migrate together. |
| Node | 24 is Active LTS; 26 is Current | Keep the existing Node 24 runtime and matching types. Reassess the next LTS transition, not a types-only major bump. |
| Rust toolchain | 1.98.1 stable, September 3 | Already pinned; no newer stable release in the upstream release listing. |

The first [Tauri 3 alpha](https://github.com/tauri-apps/tauri/releases/tag/tauri-v3.0.0-alpha.0)
requires Rust 1.95 and changes runtime APIs, resource handling and ACL generation.
The [tauri-utils alpha](https://github.com/tauri-apps/tauri/releases/tag/tauri-utils-v3.0.0-alpha.0)
uses urlpattern 0.6, replacing the old unic dependency chain. It is not a
compatible 2.x patch. Some upstream GitHub releases are marked `prerelease: false`
despite their `-alpha.0` version; npm correctly exposes the alpha under `next`,
with stable CLI/API versions 2.11.4/2.11.1 under `latest`. Do not treat that
GitHub flag alone as readiness for the application.

[Rust 1.98.1](https://github.com/rust-lang/rust/releases/tag/1.98.1) is already
the single toolchain pin consumed by the workflows; Rust 1.88 remains the
separately tested application minimum.

[typescript-eslint's supported range](https://typescript-eslint.io/users/dependency-versions/)
and the published 8.70.0 peer requirement remain `>=4.8.4 <6.1.0`.
[TypeScript 7's release](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
describes the native compiler and side-by-side tooling migration; availability
alone does not remove this compatibility hold.
[Node's release status](https://nodejs.org/en/about/previous-releases) likewise
does not justify switching the established LTS contract to Current.

After installation, npm reports only the two explicit major holds as outdated:
TypeScript and Node types. Root npm dependencies have no outstanding update.
The registry check of all 37 direct registry crate names finds their latest
stable versions already present in the resulting lockfile. This checks actual
stable version order, not the most recently published backport.

Cargo's remaining older transitive versions are not a new upgrade backlog:
Axum pins matchit 0.8.4, crypto-common 0.1.7 pins generic-array 0.14.7, and an
older TOML family remains through the Linux/BSD system-deps branch. Do not
override upstream dependency constraints or add advisory ignores to make a
version list look current.

## Audits and verification

The dated npm audits report zero vulnerabilities in both lockfiles; npm and
Cargo license checks pass. RustSec reports zero vulnerability entries and seven
informational warnings: five unic maintenance warnings plus proc-macro-error
maintenance and glib soundness warnings. The unic chain remains reachable on
supported desktop targets through Tauri/urlpattern; the other two are in the
Linux/BSD branch. No advisory ignore was added.

The September 7 report recorded 17 warnings. The current advisory database marks
the ten GTK3 maintenance advisories as withdrawn (for example,
[RUSTSEC-2024-0415](https://rustsec.org/advisories/RUSTSEC-2024-0415.html)); the
lower warning count must not be attributed to removing GTK from our lockfile.
Audit results are a dated known-advisory check, not a general security guarantee.

Local `npm run verify` passes: 392 Companion tests, 896 script tests, 1,827 UI
tests, 23 performance tests, accessibility gates, contracts, formatting, 1,056
Rust tests and debug/release Clippy. The Rust 1.88
workspace/all-targets/all-features locked compile also passes, as does
`npm run check:public-readiness` with the new report tracked.
Combined-candidate CI results are recorded in the PR.
CI must exercise both native platforms, package startup, backup/restore,
Host/Client behavior, supply-chain checks and CodeQL before merge. This batch
does not change application version, database schema, release gates or publish
a release.
