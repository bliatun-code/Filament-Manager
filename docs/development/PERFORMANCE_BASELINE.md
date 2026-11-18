# Performance baseline

Filament Manager keeps a deterministic performance contract in the normal
verification suite and a separate, advisory wall-clock probe for local
investigation. The CI contract avoids machine-speed assumptions: it checks
bounded work, dependency waves, cache behavior, render windows, and production
bundle sizes.

## Release contract

`npm run test:performance` covers the following data-driven scenarios:

| Area | Regression guard |
| --- | --- |
| Cold startup | Every top-level page remains a lazy chunk. The production entry chunk stays at or below 300,000 bytes when the built-bundle contract runs. |
| Page navigation | Navigation uses a React transition, each page chunk has a size budget, and a previously loaded dashboard restores its last-good snapshot before background I/O. |
| Dashboard startup | Sync settings and Companion status start together. Once the role is known, a local library loads its overview, spools, printers, active loans, wishlist and printer settings concurrently. |
| Slow Host | A Client requests the snapshot, spools, printer overview, active loans, wishlist and printer settings from the Host in one wave. Normal reads have a 2.5-second timeout. Explicit Host validation has a 0.9-second timeout. |
| Interrupted Host | A failed read wave uses available Host cache data. The connection indicator gives a previously reachable Host one failed core-read wave before marking it unavailable. |
| Client blocking work | The executor admits up to 32 operations and runs up to eight at once. Network, credential-store and database work stays off the UI invoke path. See the [Host/Client gates](QUALITY_GATES.md#hostclient-resilience-authority) for write timeouts and catalog-job recovery. |
| 10,000 spools | A real 10,000-row fixture passes through normalization, inventory mapping, options, filtering, grouping, bounded render-window selection, overview calculation, and dashboard derivation without truncation. |
| Dashboard revisit | The fixture exercises 250 cached-snapshot clones. A revisit paints the saved view before starting background reads. |

The 10,000-spool contract renders at most 200 list rows or 96 card groups at
once. Complete pagination is separately covered by
`ui/src/lib/spool_data_source.test.ts`, including the 10,000-row case with
1,000-row pages.

The source contract rejects artificial waits in the dashboard load path. A
three-second `sleep`, delay promise, or timer cannot be added to the initial
dashboard loader without failing verification. Polling timers remain allowed
after a completed load.

## Production bundle budgets

`npm run check:ui-bundle-chunks` runs after the production UI build and enforces
these uncompressed JavaScript budgets:

| Chunk | Maximum |
| --- | ---: |
| Entry (`index-*`) | 300,000 bytes |
| Dashboard | 65,000 bytes |
| Inventory | 260,000 bytes |
| Loans | 55,000 bytes |
| Printers | 115,000 bytes |
| Settings | 190,000 bytes |
| Statistics | 90,000 bytes |

Increase a budget only after inspecting the production bundle and documenting
the added startup or navigation work. Keep scanner, PDF, QR, and locale code
out of eager page chunks.

## Commands

Run the deterministic release contract:

```sh
npm run test:performance
```

This command checks source/model behavior and tests the bundle checker with
synthetic asset manifests. To build the UI and enforce budgets against the
actual production chunks, run:

```sh
npm run test:performance:bundle
```

`npm run smoke` runs the production build, the deterministic performance
contract, and the actual built-bundle check. It is therefore the normal macOS
and Windows CI verification path.

For a local wall-clock sample, run:

```sh
npm run qa:performance
```

The advisory model probe performs two warmups and reports the median of eleven samples
for:

- the complete 5,000- and 10,000-spool UI model pipeline;
- the relative growth from 5,000 to 10,000 rows;
- 500 cached dashboard snapshot clones.

Default advisory limits are 1,000 ms for the 10,000-spool pipeline, 250 ms for
500 snapshot clones, and a maximum 3× growth ratio. These intentionally
roomy limits detect a large regression while tolerating laptops, debug builds,
background work, and CI virtualization. The probe is not part of CI because
wall-clock comparisons across runner types are not stable enough to be a
release gate.

Use JSON output or temporary investigative budgets when comparing a change:

```sh
npm run qa:performance -- --json
npm run qa:performance -- --samples=11 --pipeline-budget-ms=750
```

For an end-to-end local browser sample, run:

```sh
npm run qa:performance:browser
```

This starts the real Vite desktop UI in Chromium with the sanitized Visual-QA
SQLite fixture behind a Tauri invoke adapter. It measures data-ready Dashboard
startup plus real Dashboard → Inventory → Printers → Dashboard transitions.
The default fixture contains inventory, printer, loan, job, and settings data;
the measured pages must both render fixture evidence and issue their critical
data calls. To exercise an isolated copy of a richer local database, use
`--source /path/to/database.db`. The browser timings are advisory and stay out
of CI; deterministic lazy-loading, transition, timeout, request-wave,
render-window, and bundle guards remain the release gates.

Do not lower or raise the committed defaults from a single run. Compare several
warm runs on the same machine, inspect the bundle contract, and keep the
deterministic request/render guards as the release authority.
