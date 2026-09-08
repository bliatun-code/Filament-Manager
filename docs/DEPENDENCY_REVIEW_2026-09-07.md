# Dependency review — 2026-09-07

Status updated on 2026-09-08. The dependency batches planned in this review are
merged, following the earlier [#90](https://github.com/bliatun-code/Filament-Manager/pull/90):

- [#94](https://github.com/bliatun-code/Filament-Manager/pull/94) combined the
  updates proposed in [#91](https://github.com/bliatun-code/Filament-Manager/pull/91),
  [#92](https://github.com/bliatun-code/Filament-Manager/pull/92) and
  [#93](https://github.com/bliatun-code/Filament-Manager/pull/93) with their shared
  CI fixes and the mDNS/Quinn patches described below.
- [#95](https://github.com/bliatun-code/Filament-Manager/pull/95) updated ESLint
  to 10.10.0.
- [#96](https://github.com/bliatun-code/Filament-Manager/pull/96) applied the
  grouped Cargo update with 43 updates, including aws-lc, tokio-rustls and Hyper.
- [#97](https://github.com/bliatun-code/Filament-Manager/pull/97) completed the
  TLS/HTTP follow-up with rustls 0.23.44 and a Windows test-timeout correction.
- [#98](https://github.com/bliatun-code/Filament-Manager/pull/98) updated
  Playwright and playwright-core to 1.63.0.

The resulting main candidate is
[`aee8d23e`](https://github.com/bliatun-code/Filament-Manager/commit/aee8d23eeef1684150491fef8823589f58d388a5).
All 11 PR #98 checks passed. The separate main
[CI run](https://github.com/bliatun-code/Filament-Manager/actions/runs/34227436481)
and [CodeQL run](https://github.com/bliatun-code/Filament-Manager/actions/runs/34227436487)
also passed on `aee8d23e`. The subsequent manual
[release verification](RELEASE_VERIFICATION_2026-09-08.md) passed on that same
source commit without publishing a release.
The historical findings and validation below explain this completed dependency
round. They do not prescribe another broad version update.

## Why the dependency PRs failed

- Both #91 and #92 failed the same macOS Rust timeout test. Their Windows jobs
  passed. The fixture returned HTTP 200 after 100 ms while the client deadline
  was 20 ms; under runner scheduling delays the ready response could win over
  the expired timer. The fixture now holds the response until `send()` returns,
  with bounded server cleanup and an independent harness fallback. Production
  request behavior and timeouts are unchanged. Removing the test client deadline
  deliberately made the fixed test fail with HTTP 200 after 10 seconds; restoring
  it passed again.
- #93 changed `rust-toolchain.toml` to 1.98.1 while seven workflow inputs and a
  contract test still required 1.98.0. A small, dependency-free Node reader now
  validates the exact release in that file and supplies all seven workflow
  inputs. The SHA-pinned actions, Rust 1.88 MSRV checks, components and release
  targets remain enforced. Future valid patch versions need no second version
  edit. [Rust 1.98.1](https://github.com/rust-lang/rust/releases/tag/1.98.1)
  fixes a vtable code-generation miscompilation.

## Broader dependency decisions

The four UI updates proposed in #91 and merged through #94 fit the reviewed
engine and peer ranges:
`@types/react-dom` 19.2.7, `eslint-plugin-react-refresh` 0.5.6, `globals` 17.12.0,
and `typescript-eslint` 8.69.0. The dated audits reported no registered
vulnerabilities in either npm lockfile, and the registry check found no
deprecation markers on the direct npm dependencies.

Keep TypeScript 6: `typescript-eslint` 8.69.0 still requires TypeScript below 6.1,
and TypeScript 7.0 does not provide the compiler API used by that tooling.
Keep Node and its types on the chosen 24.x LTS line. These are specific
compatibility holds, not a blanket policy against major upgrades.
[Supported lint dependencies](https://typescript-eslint.io/users/dependency-versions/),
[TypeScript 7 release](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/),
[Node release status](https://nodejs.org/en/about/previous-releases).

Playwright 1.63 was taken separately in #98. It changed the test browser from
Chromium 151 to 153 and was checked with the matching browser installation and
the existing UI, accessibility, Companion and performance gates. Screenshot and
performance thresholds were retained. ESLint 10.10.0 was merged separately in
#95; it was not a fix for the Rust timeout test.
[Playwright release notes](https://playwright.dev/docs/release-notes#version-163),
[ESLint 10.10 release](https://github.com/eslint/eslint/releases/tag/v10.10.0).

The #94 Cargo update incorporated #92's `tauri-plugin-single-instance`
2.4.4, `open` 5.4.3 and `flate2` 1.1.10. The latter added `miniz_oxide` 0.9.1
and `zlib-rs` 0.6.7; PNG still needs `miniz_oxide` 0.8.9. Multiple compatible
dependency generations in the graph are not, by themselves, a reason to force
one version across incompatible constraints. Manifest caret minima do not need
to be rewritten merely to match an already reviewed lockfile version.

The #94 batch went beyond #92's `mdns-sd` 0.21.1 to 0.21.2. It fixes an
out-of-bounds panic when receiving a truncated HINFO packet and removes the raw
packet dump from parse errors. This network-input fix was the reason for
including the additional patch.
[mdns-sd 0.21.2 release](https://github.com/keepsimple1/mdns-sd/releases/tag/v0.21.2).

The #94 batch also included `quinn-proto` 0.11.17. The previously locked 0.11.16
was within the affected ranges of three upstream memory-exhaustion advisories.
The crate is in the resolved reqwest graph on both desktop targets, but our
reqwest features do not enable HTTP/3 and its QUIC runtime calls are behind that
feature. No active application exploit was demonstrated. These upstream
advisories were not reported by the dated RustSec audit, which is why audit
exit status alone is insufficient evidence for dependency review.
[Quinn security release](https://github.com/quinn-rs/quinn/releases/tag/quinn-proto-0.11.17),
[GHSA-qfwj-vfxf-92j2](https://github.com/quinn-rs/quinn/security/advisories/GHSA-qfwj-vfxf-92j2),
[GHSA-2hv7-gw8g-gpq5](https://github.com/quinn-rs/quinn/security/advisories/GHSA-2hv7-gw8g-gpq5),
[GHSA-hmxj-32vh-65vr](https://github.com/quinn-rs/quinn/security/advisories/GHSA-hmxj-32vh-65vr).

The TLS/HTTP follow-up was completed through #96 and #97. The rustls 0.23.44
aws-lc signature changes affect the provider selected by this application, so
the follow-up included TLS identity, certificate and pin-rejection tests and
the existing platform gates. The app does not enable ECH or TLS keylogging;
those other patch notes did not demonstrate an active application bug.
[rustls 0.23.44 release](https://github.com/rustls/rustls/releases/tag/v%2F0.23.44).

A read-only `cargo update --dry-run` after the mDNS patch proposed 59 updates
within the declared Rust 1.88 and dependency constraints. This was a dated
candidate set, not a permanent list of outstanding work. The targeted Quinn
patch was included in #94, the grouped Cargo maintenance in #96, and rustls in
#97. The resulting lockfile is the basis for subsequent reviews; the original
59-update count must not be reused as the current backlog.

The Dependabot Cargo block has `allow: dependency-type: all`, so ordinary version
updates also consider transitives. The existing weekly patch/minor group is
retained. This does not force incompatible versions, guarantee the exact dry-run
set, group majors, or change security-update grouping.
[GitHub's allow reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#allow).

## Rust advisory follow-up

The recorded RustSec audits reported zero vulnerability entries and 17
informational warnings. Those warnings require an explicit distinction:

- Ten GTK3 maintenance warnings, the `glib` soundness warning, and the
  `proc-macro-error` maintenance warning enter through Linux/BSD-only Tauri
  branches. They are not part of the native macOS/Windows dependency paths.
  Reassess these before adding Linux distribution.
  [glib advisory](https://rustsec.org/advisories/RUSTSEC-2024-0429.html),
  [proc-macro-error advisory](https://rustsec.org/advisories/RUSTSEC-2024-0370.html).
- Five `unic` maintenance warnings are also in the macOS/Windows normal and
  build graph: `tauri` / `tauri-build` → `tauri-utils` 2.9.3 → `urlpattern` 0.3.0
  → `unic-ucd-ident` and its four supporting packages. Tauri uses this code for
  remote ACL URL patterns; our default capability declares no remote URLs.
  This review establishes dependency reachability, not a demonstrated exploit.
  [unic advisory](https://rustsec.org/advisories/RUSTSEC-2025-0100.html).

At the 2026-09-07 registry check, the latest published `tauri` 2.11.5,
`tauri-build` 2.6.3 and `tauri-utils` 2.9.3 were already locked; these versions
remain in the reviewed main candidate. The utility crate requires
`urlpattern ^0.3`, whose only published 0.3 release was 0.3.0. Upstream had
replaced `unic` with `icu_properties`, but the Tauri switch to `urlpattern` 0.6
was not yet released. Follow that change through a published, compatible Tauri
update; the dated registry check found no compatible lock-only fix.
Do not add an advisory ignore or force the incompatible 0.6 API under 0.3.
[Published tauri-utils](https://crates.io/crates/tauri-utils/2.9.3/dependencies),
[upstream replacement](https://github.com/denoland/rust-urlpattern/pull/67).

## Verification scope

Registry and RustSec results are a dated assessment of known advisories, not a
general security guarantee. The recorded local checks below belong to their
respective dependency batches. PR #98's 11 completed checks include macOS and
Windows smoke, CodeQL and the supply-chain checks; the separate main CI and
CodeQL runs also passed as recorded above. Audit warnings remain visible, and license
requirements and screenshot/performance thresholds were retained. The test
waiting corrections are documented in this report. Release verification remains
a separate gate; its completed candidate results and platform limits are recorded
in [the release report](RELEASE_VERIFICATION_2026-09-08.md).

## TLS/HTTP follow-up — merged through #96 and #97

The planned TLS/HTTP versions reached main in two PRs:

| Package | Previous lock | Reviewed lock | Merged in |
| --- | --- | --- | --- |
| `aws-lc-rs` | 1.18.0 | 1.18.1 | #96 |
| `aws-lc-sys` | 0.44.0 | 0.45.0 | #96 |
| `tokio-rustls` | 0.26.4 | 0.26.5 | #96 |
| `hyper` | 1.11.0 | 1.11.1 | #96 |
| `rustls` | 0.23.43 | 0.23.44 | #97 |

The diff from #96's merge (`48096d7c`) to #97's merge (`39db1036`) changes only
the rustls version and checksum in `Cargo.lock`. Its sole manifest change raises
the rustls requirement in `src-tauri/Cargo.toml` to 0.23.44. The other four
versions were already present after #96; #97 did not change `windows-sys` or
`getrandom`. `quinn-proto` remained at the 0.11.17 patch taken in #94.

The recorded local validation for the TLS follow-up passed:

- `cargo +1.88.0 check --workspace --all-targets --all-features --locked`.
- The targeted TLS identity tests, including certificate/SPKI/serial matching
  and rejection of unknown or changed identities and incorrect pins.
- `cargo test -p bambu-filament-manager printer_bambu_live_commands::tests::full_printer_delete_waits_for_in_flight_security_save`.
- `npm run verify`, including UI/Companion, contracts, accessibility,
  performance, Rust formatting/tests and both Clippy profiles.
- `npm run audit:dependencies`: no npm vulnerability entries, the informational
  RustSec warnings described above, and a passing Cargo license check.

The #97 test correction increased the post-lock completion wait in
`full_printer_delete_waits_for_in_flight_security_save` to 10 seconds after a
Windows CI timeout. It changed the test's waiting allowance, not the production
TLS or deletion behavior. These results complete the planned TLS/HTTP batch;
they do not establish coverage of every possible protocol or browser defect.

## Playwright 1.63.0 — merged in #98 on 2026-09-08

The root manifest now requires `playwright ^1.63.0`; `package-lock.json` resolves
both `playwright` and `playwright-core` to 1.63.0. The update removed Playwright's
optional `fsevents` dependency and its now-unused root lockfile entry.
`@axe-core/playwright` and `axe-core` remain locked at 4.13.0. The declared
`playwright-core >=1.0.0` peer range accepts 1.63.0; compatibility was also checked
through the existing accessibility tests.

The [Playwright release](https://playwright.dev/docs/release-notes#version-163)
updates the test browser to Chromium 153. CI retains the explicit matching
browser installation, `node ./node_modules/playwright/cli.js install chromium`,
before running the browser-dependent checks. This changes the test browser;
the installed Tauri apps continue to use WKWebView on macOS and WebView2 on
Windows. The Cargo dependencies, Node/types 24, TypeScript 6, SHA-pinned actions,
and screenshot/performance thresholds were unchanged by #98.

The recorded local `npm run verify` and `npm run audit:dependencies` passed.
Verification included UI build/lint, Companion and script tests, accessibility,
UI and performance tests, contracts, and the full Rust/Clippy sequence. The
audits reported zero npm vulnerability entries, the same 17 informational
RustSec warnings, and a passing Cargo license check. These warnings were still
reported; no advisory ignore was added. All 11 PR #98 checks passed before merge.

This completes the planned browser-tooling update. Further dependency work
follows the existing [maintenance policy](DEPENDENCY_SECURITY.md), including
the Tauri/`unic` follow-up above. Release verification on `aee8d23e` is completed
and recorded in [the release report](RELEASE_VERIFICATION_2026-09-08.md).
Any later publishing candidate must meet the gates in
[the improvement plan](IMPROVEMENT_PLAN.md#neste-arbeid).
