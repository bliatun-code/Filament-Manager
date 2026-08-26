# ADR: Keep desktop and Companion presentation layers separate

| Field | Value |
| --- | --- |
| Status | Accepted |
| Date | 2026-08-21 |
| Evidence commit | `ccaad50bc613d6a84c2330f190863adfd430621b` |
| Prerequisites | `ActiveLibraryGateway` (`a63a2e59`) and generated shared contracts (`31a37370`) |

## Context

The desktop application uses React, TypeScript, Vite, and Tauri commands. The
Companion is a dependency-free browser presentation served by the embedded Rust
HTTP server. It uses same-origin HTTP, pairing-session cookies, CSRF tokens, and
protected Companion routes. Both presentations expose several of the same
inventory workflows, so maintaining two implementations has a real cost.

The gateway and generated contract work removed two reasons to merge the
presentations prematurely: a desktop flow can now select its authoritative
local or Host data source below the view layer, and canonical wire tokens and
selected DTOs no longer have to be copied by hand. This ADR evaluates whether
the remaining presentation code should nevertheless be consolidated.

## Decision

Keep the React desktop UI and the browser Companion as separate presentation
layers. Continue sharing authority below them:

1. Rust remains authoritative for business mutations, authorization, and wire
   contracts.
2. Deterministic generated artifacts remain the preferred way to share enums,
   DTO validators, and stable catalog data.
3. A pure model may be shared or generated when its inputs, outputs, and
   semantics are genuinely identical and it has no React, DOM, Tauri, session,
   or transport dependency.
4. Do not reuse React components, desktop state containers, Tauri clients, or
   the complete desktop bundle in Companion now.

This is not a permanent rejection of React in Companion. A dedicated Companion
entry may be prototyped when one of the measurable re-evaluation triggers below
is reached. The prototype must be compared with the current Companion entry; it
must not make the complete desktop distribution the browser payload.

## Evidence

### Reproducible snapshot

All measurements were taken from a clean archive of the evidence commit. They
therefore exclude concurrent working-tree changes.

```bash
ADR_HEAD=ccaad50bc613d6a84c2330f190863adfd430621b
ADR_SNAPSHOT="$(mktemp -d /tmp/filament-manager-ui-adr.XXXXXX)"
git archive "$ADR_HEAD" | tar -x -C "$ADR_SNAPSHOT"
cd "$ADR_SNAPSHOT"
node --version
npm --version
npm ci --ignore-scripts
npm --prefix ui ci --ignore-scripts
npm --prefix ui run build
```

The recorded environment was Node `v24.14.1`, npm `11.11.0`, Vite `8.2.1`,
macOS, and the lockfiles in the evidence commit. The production build transformed
922 modules.

Raw bytes are filesystem bytes. Normalized gzip is the sum of compressing each
file separately with Node 24 `gzipSync` defaults; it is a comparison metric, not
a claim that every file is fetched during initial navigation. Desktop pages and
vendors are lazy chunks, and Companion loads one locale at a time.

The asset totals can be reproduced with Node's `readdirSync`, `readFileSync`,
and `gzipSync` over `ui/dist/assets/*.{js,css}`. The Companion inventory is the
unique set of `../companion_browser/*` files referenced by `include_str!` in
`src-tauri/src/companion_assets.rs` and
`src-tauri/src/companion_locale_assets.generated.rs`.

### Bundle inventory

| Surface | Asset set | Files | Raw bytes | Normalized gzip bytes |
| --- | --- | ---: | ---: | ---: |
| Desktop | JavaScript | 84 | 4,431,581 | 1,308,340 |
| Desktop | CSS | 1 | 193,666 | 24,742 |
| **Desktop** | **JS + CSS total** | **85** | **4,625,247** | **1,333,082** |
| Companion | JavaScript | 66 | 1,000,278 | 262,531 |
| Companion | CSS | 3 | 93,260 | 14,996 |
| Companion | HTML | 1 | 1,011 | 398 |
| **Companion** | **Text total** | **70** | **1,094,549** | **277,925** |

Two Companion PNG icons add 163,892 raw bytes and are not gzip-compressed. Of
the Companion text total, 21 locale modules account for 599,693 raw and 171,930
normalized-gzip bytes. The non-locale surface is 49 files, 494,856 raw bytes,
and 105,995 normalized-gzip bytes.

The Rust asset cache deliberately uses `flate2::Compression::fast`, which favors
CPU latency over compression ratio. Applying that exact encoder to the same 70-
file text inventory produced 376,961 bytes: 141,413 non-locale and 235,548
locale bytes. The HTML shell is served separately from the precompressed asset
cache, so this is a uniform runtime-compression baseline rather than a claim
about one navigation response. It is kept separate from the normalized cross-
surface comparison.

Serving the complete current desktop JS/CSS inventory to Companion would make
the embedded text inventory about 4.2 times larger raw and 4.8 times larger by
the normalized-gzip metric. That is not an acceptable consolidation strategy.
Bundle size alone does not rule out a dedicated React entry: the current
desktop `index` JS plus CSS is 449,099 raw and 101,038 normalized-gzip bytes,
close to the complete non-locale Companion text inventory. A separate entry
therefore requires a prototype and measurement rather than an assumption.

### Remaining hand-maintained semantic overlap

The overlap audit is intentionally conservative and reproducible. Node 24 and
the locked TypeScript compiler parsed production `.ts`, `.tsx`, and `.js`
files. Tests, declarations, locale modules, and `*.generated.*` files were
excluded. Exported function declarations present under the same name in both
presentations were then reviewed for equivalent responsibility. Physical lines
from the start through the end of each matching function were counted.

| Metric | Desktop | Companion | Total |
| --- | ---: | ---: | ---: |
| Matching exported names | 36 | 36 | 36 distinct names |
| Implementations | 37 | 38 | 75 |
| Function LOC | 367 | 341 | 708 |
| Files containing matches | 12 | 7 | 19 |

The matches include Bambu filament-code lookup, spool/loan normalization, tare
weight, printer-slot labels, color helpers, and display formatters. This is a
lower bound: differently named equivalents such as the QR payload parsers and
private helpers are not counted. It also avoids inflating the result with whole
files that contain mostly presentation-specific behavior.

Companion currently has 44 hand-maintained production JS files and 11,812
physical JS LOC after excluding tests, locales, and generated output. CSS and
HTML add 4 files and 4,183 LOC. The measured overlapping Companion function
bodies are therefore about 2.9% of its hand-maintained JS. A rewrite of the
whole Companion presentation is disproportionate to the overlap currently
known to be removable. Pure-model extraction remains worthwhile when one of
these areas is already being changed.

### Integration-specific dependencies

| Desktop React | Browser Companion |
| --- | --- |
| Seven direct runtime package roots are imported: React, React DOM, Tauri API, ZXing browser/library, `pdf-lib`, and `qrcode`. | Production ESM imports have zero external package roots; every import is relative and the browser uses platform APIs. |
| TypeScript, Vite, the React plugin, and Tailwind are required to build the presentation. | Assets are embedded with `include_str!`/`include_bytes!`; no npm build is required to start the server. |
| Thirteen `tauri_*.ts` client modules contain 2,041 LOC, four production files import Tauri packages directly, and the contract currently covers 128 invokes. | One browser API client owns same-origin fetch, pairing renewal, credentials, and CSRF injection; the contract covers 23 browser API paths backed by 58 Rust routes. |
| Local and Client modes depend on the gateway and credential-backed Host adapter. | Browser access depends on Host availability, private-LAN routing, cookie sessions, and server authorization. |

These are not interchangeable adapters. Importing a Tauri client into a
Companion bundle would fail in a normal browser and could bypass the intended
HTTP authorization boundary. Replacing Companion fetch calls with desktop
invokes would remove the very boundary that makes a paired browser safe.

### Test surfaces

The clean snapshot passed both presentation suites:

```bash
npm run test:companion -- --test-reporter=tap
npm run test:ui -- --test-reporter=tap
npm run check:companion-routes
npm run check:tauri-invokes
npm run check:shared-contracts
```

| Surface | Test files | Physical test LOC | Passing tests |
| --- | ---: | ---: | ---: |
| Desktop UI | 237 | 37,087 | 1,216 |
| Companion browser | 37 | 9,753 | 348 |

The counts do not make the suites interchangeable. Desktop also has production
build, lint, performance, accessibility, Tauri command, and packaged desktop
E2E gates. Companion adds Rust route/auth/session/CSP/asset tests, browser route
contracts, CSS and localization checks, and data-backed and screenshot gates.
A framework migration would retain the server-side security suite and would
need to replace, not simply delete, Companion DOM, focus, and rendering tests.

## Alternatives considered

### 1. Full consolidation into the desktop React application

This would provide one component model, one TypeScript toolchain, and the
largest theoretical reduction in duplicate presentation logic. It was rejected
for now because it would require a rewrite of the Companion state, DOM, focus,
and mutation layers; a new browser transport adapter; hashed-asset serving; and
a broad test migration. Reusing the complete desktop distribution has a measured
bundle penalty, while the size of a dedicated entry is still unknown.

The current gateway covers one complete spool-details flow, not every desktop
and Companion workflow. Component consolidation before the remaining data-source
boundaries are stable would mix transport selection, authentication, and view
migration in the same change.

### 2. Separate presentations with generated contracts and pure-model sharing

This is the selected alternative. It preserves a small, host-local, dependency-
free Companion and a typed, code-split desktop application. It also lets the
two surfaces keep different navigation, density, camera, focus, and recovery
behavior while business authority remains in Rust.

The cost is continued maintenance of two rendering and interaction stacks and
at least the measured 708 LOC lower bound of parallel semantics. That cost is
controlled by generating stable contracts and extracting a pure rule only when
both consumers truly need identical behavior. Cross-tree imports that couple
Companion to desktop/Tauri modules are not part of this decision.

### 3. Gradual shared framework or React islands

A second Vite entry, shared TypeScript package, or isolated React islands could
measure reuse without a big-bang rewrite. It was deferred because it would
temporarily create three composition models, complicate focus/event ownership,
and add a required build and asset-manifest path to Companion before the measured
overlap justifies it. It remains the preferred experiment when re-evaluation is
triggered; the experiment must start with a dedicated entry and one bounded
workflow.

## Risks that a future prototype must close

- **Offline and LAN-only operation:** every runtime asset must remain embedded;
  no CDN, remote font, or Internet bootstrap may be introduced.
- **CSP:** the existing `script-src 'self'` and `connect-src 'self'` policy must
  remain. The build may not require inline script, `eval`, or an external dev
  runtime in production.
- **Authentication:** same-origin cookies, CSRF on mutations, pairing renewal,
  no-store responses, and server-side authorization remain mandatory. React
  state is not an authentication source.
- **Tauri isolation:** the Companion dependency graph must contain no
  `@tauri-apps/*` imports or invoke-only clients. Desktop remains free to use
  them behind its adapters.
- **Asset routing:** hashed chunks, dynamic imports, ETags, gzip, and fallback
  behavior must work through the embedded Rust asset registry on macOS and
  Windows.
- **Browser compatibility and accessibility:** current older-mobile syntax
  choices, focus restoration, live regions, 200% zoom behavior, keyboard use,
  and screenshot/data-backed flows must retain equivalent gates.

## Consequences

- There is no presentation rewrite or bundle change now.
- New wire-level duplication is blocked by the shared-contract generator.
- Existing pure semantic overlap is reduced opportunistically, with behavior
  tests on both consumers before one implementation is removed.
- Surface-specific view and interaction behavior may remain intentionally
  different; equality is required for business results, not for component
  structure.
- A future consolidation proposal must provide a measured dedicated build and
  security/test evidence, not only an estimated maintenance benefit.

## Re-evaluation triggers

Re-open this ADR when any one of these conditions is met:

1. The same-name exported-function audit reaches at least 60 names or 1,200
   combined function LOC, compared with the current 36 names and 708 LOC.
2. Hand-maintained Companion production JS reaches 18,000 LOC, compared with
   11,812, or three consecutive cross-surface features each add parallel model
   logic to both presentations.
3. Gateway coverage expands from the current single complete flow to inventory,
   loans, and printer-slot writes with transport-independent view inputs.
4. A dedicated React Companion prototype stays at or below 620,000 raw and
   180,000 `Compression::fast` gzip bytes for non-locale text, contains no Tauri
   imports, and passes the existing auth, CSP, route, accessibility, screenshot,
   and data-backed gates. These limits provide roughly 25% headroom over the
   current 494,856 raw and 141,413 runtime-gzip baseline.
5. Measured feature delivery or defect data shows that parallel presentation
   maintenance, rather than backend/contracts, is a recurring release blocker.

Re-evaluation means running a bounded prototype and updating this ADR. It does
not authorize an unmeasured migration.
