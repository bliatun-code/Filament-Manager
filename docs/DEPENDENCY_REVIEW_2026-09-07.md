# Dependency review — 2026-09-07

PR #90 is already merged. The recovery batch brings together the pending
Dependabot updates from [#91](https://github.com/bliatun-code/Filament-Manager/pull/91),
[#92](https://github.com/bliatun-code/Filament-Manager/pull/92), and
[#93](https://github.com/bliatun-code/Filament-Manager/pull/93), with their shared
CI fixes. The original failures do not establish a dependency regression.

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

The four UI updates in #91 fit the current engine and peer ranges:
`@types/react-dom` 19.2.7, `eslint-plugin-react-refresh` 0.5.6, `globals` 17.12.0,
and `typescript-eslint` 8.69.0. Neither npm lockfile has a registered vulnerability
in the dated audit, and no direct npm dependency has a deprecation marker.

Keep TypeScript 6: `typescript-eslint` 8.69.0 still requires TypeScript below 6.1,
and TypeScript 7.0 does not provide the compiler API used by that tooling.
Keep Node and its types on the chosen 24.x LTS line. These are specific
compatibility holds, not a blanket policy against major upgrades.
[Supported lint dependencies](https://typescript-eslint.io/users/dependency-versions/),
[TypeScript 7 release](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/),
[Node release status](https://nodejs.org/en/about/previous-releases).

Take Playwright 1.63 separately: it changes the test browser from Chromium 151
to 153 and needs its matching browser installation plus UI, accessibility,
Companion and performance verification. Do not automatically relax screenshot
or performance thresholds for the new browser. ESLint 10.10 is another compatible
minor tooling update, with no connection to the failed Rust test.
[Playwright release notes](https://playwright.dev/docs/release-notes#version-163),
[ESLint 10.10 release](https://github.com/eslint/eslint/releases/tag/v10.10.0).

The Cargo lockfile includes the #92 updates to `tauri-plugin-single-instance`
2.4.4, `open` 5.4.3 and `flate2` 1.1.10. The latter adds `miniz_oxide` 0.9.1
and `zlib-rs` 0.6.7; PNG still needs `miniz_oxide` 0.8.9. Multiple compatible
dependency generations in the graph are not, by themselves, a reason to force
one version across incompatible constraints. Manifest caret minima do not need
to be rewritten merely to match an already reviewed lockfile version.

Go beyond #92's `mdns-sd` 0.21.1 to 0.21.2 in this batch. It fixes an
out-of-bounds panic when receiving a truncated HINFO packet and removes the raw
packet dump from parse errors. This is a concrete network-input fix, unlike
updating an unrelated package solely because a new version exists.
[mdns-sd 0.21.2 release](https://github.com/keepsimple1/mdns-sd/releases/tag/v0.21.2).

Also take the compatible `quinn-proto` 0.11.17 security patch. The locked 0.11.16
is within the affected ranges of three upstream memory-exhaustion advisories.
The crate is in the resolved reqwest graph on both desktop targets, but our
reqwest features do not enable HTTP/3 and its QUIC runtime calls are behind that
feature. No active application exploit is demonstrated. The available patch
still belongs in this recovery batch. These upstream advisories were not
reported by the dated RustSec audit, which is why audit exit status alone is
insufficient evidence for dependency review.
[Quinn security release](https://github.com/quinn-rs/quinn/releases/tag/quinn-proto-0.11.17),
[GHSA-qfwj-vfxf-92j2](https://github.com/quinn-rs/quinn/security/advisories/GHSA-qfwj-vfxf-92j2),
[GHSA-2hv7-gw8g-gpq5](https://github.com/quinn-rs/quinn/security/advisories/GHSA-2hv7-gw8g-gpq5),
[GHSA-hmxj-32vh-65vr](https://github.com/quinn-rs/quinn/security/advisories/GHSA-hmxj-32vh-65vr).

Review `rustls` 0.23.44 in the next TLS maintenance batch. Its aws-lc signature
changes affect the provider selected by this application; verify Bambu
handshakes, certificate/pin rejection and both desktop platforms. The app does
not enable ECH or TLS keylogging, so those other patch notes do not demonstrate
an active application bug. Keep this protocol change separate from restoring
the already pending Dependabot checks.
[rustls 0.23.44 release](https://github.com/rustls/rustls/releases/tag/v%2F0.23.44).

A read-only `cargo update --dry-run` after the mDNS patch proposed 59 updates
within the declared Rust 1.88 and dependency constraints. The targeted Quinn fix
above is taken now; the remaining maintenance belongs in a reviewed Cargo batch,
including TLS tests for rustls/aws-lc and HTTP behavior for Hyper. The existing
Dependabot Cargo block now has `allow: dependency-type: all`, so ordinary version
updates also consider transitives. The existing weekly patch/minor group is
retained. This does not force incompatible versions, guarantee the exact dry-run
set, group majors, or change security-update grouping.
[GitHub's allow reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#allow).

## Rust advisory follow-up

The RustSec audit's vulnerability section contains zero entries. Its 17
informational warnings still require an explicit distinction:

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

The latest published `tauri` 2.11.5, `tauri-build` 2.6.3 and `tauri-utils` 2.9.3
are already locked. The published utility crate requires `urlpattern ^0.3`,
whose only published 0.3 release is 0.3.0. Upstream replaced `unic` with
`icu_properties`, but the Tauri switch to `urlpattern` 0.6 is not yet released.
Track that normal Tauri upgrade; there is no compatible lock-only fix today.
Do not add an advisory ignore or force the incompatible 0.6 API under 0.3.
[Published tauri-utils](https://crates.io/crates/tauri-utils/2.9.3/dependencies),
[upstream replacement](https://github.com/denoland/rust-urlpattern/pull/67).

## Verification scope

Registry and RustSec results are a dated assessment of known advisories, not a
general security guarantee. Full macOS and Windows smoke jobs, CodeQL and the
supply-chain workflow remain required for the combined pull request. No audit
warning, license requirement or test threshold is suppressed to make it pass.

## TLS/HTTP maintenance batch (2026-09-07 follow-up)

### Valgte oppdateringer

- `rustls` 0.23.43 → `0.23.44`
- `aws-lc-rs` 1.18.0 → `1.18.1`
- `aws-lc-sys` 0.44.0 → `0.45.0` (transitiv via `rustls`-provider)
- `tokio-rustls` 0.26.4 → `0.26.5`
- `hyper` 1.11.0 → `1.11.1`

### Grunnlag og kompatibilitet

- Kandidatversjoner ble sjekket mot upstream release-merker før oppdatering:
  `rustls` 0.23.44, `aws-lc-rs` 1.18.1, `aws-lc-sys` 0.45.0, `tokio-rustls` 0.26.5
  og `hyper` 1.11.1.
- `quinn-proto` er allerede låst til 0.11.17 fra forrige fellespakke, og ble
  ikke endret i denne runden.
- Kompatibilitet ble verifisert gjennom:
  - låst Cargo-løsning med eksplisitte `--precise`-oppdateringer i sekvens
  - full MSRV-kjøring (`cargo +1.88.0 check --workspace --all-targets --all-features --locked`)
  - TLS/HTTP-relatert testsett (fingerprinter/handshake/pinning/negative-krav)
  - komplett repo-verifisering med `npm run verify`.

### Cargo.lock-kontroll (utilsiktede endringer)

`Cargo.lock` endringer er begrenset til de valgte pakkene og nødvendige
transitive oppryddinger:
- Direkte: `aws-lc-rs`, `aws-lc-sys`, `hyper`, `rustls`, `tokio-rustls`.
- `windows-sys` gikk fra `0.61.2` til `0.59.0` i et begrenset sett av avhengigheter
  i lockfilen, og `getrandom` fikk også en eldre 0.3.4-linje i én graf.
- Det er ingen manifest-baserte version bumps utover de fire direkte endringene.

### Verifikasjon og resultat

- `cargo +1.88.0 check --workspace --all-targets --all-features --locked` ✅
- `cargo test` mot TLS-identitetsscenarier (handshake, SPKI/serial matching, pin
  og negativt oppførsel) ✅
- `npm run audit:dependencies` ✅ (npm-audit rent, Cargo-audit med kun kjente
  pre-eksisterende, ikke-advarende rustsec-/lisensstatus).
- `npm run verify` ✅ (full suite, inkludert kontrakter, UI/Companion,
  smoke/lint/test + `cargo fmt/test/clippy`).

### Gjenstående funn etter pakken

- Sikkerhet: Oppdateringene er et vedlikeholds-/harde-sikkerhetsløft i TLS/HTTP-kjeden
  (TLS/HTTP-ytelser og provider-kjede). Ingen nye advarsler ble introdusert i
  dagens kontrollkjøring.
- Vedlikehold: transitive lockforskyvninger (`windows-sys`/`getrandom`) er
  kompatible oppløsningsresultater, men bør overvåkes i neste batch dersom ny
  lockdominans gir avvik på tvers av støtteplattformene.
- Hypotetisk eksponering: Vi har fortsatt ikke tatt en større `hyper`/TLS/Net-batch
  (eks. HTTP/3/QUIC eller Playwright-impakt), så disse områdene ligger utenfor
  denne pakken og bør vurderes separat ved behov.
