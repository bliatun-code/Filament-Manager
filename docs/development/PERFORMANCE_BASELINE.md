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
| Dashboard startup | Sync settings and Companion status start together. Once the role is known, Host and standalone libraries read the overview and compact stock summary in one SQLite transaction, alongside concurrent printer, active loan, wishlist and printer settings reads. A final status check discards results if the library target changed. |
| Slow Host | A Client requests the compact Dashboard snapshot, printer overview, active loans, wishlist and printer settings concurrently. A legacy snapshot triggers a separate spool read. Normal reads have a 2.5-second timeout. Explicit Host validation has a 0.9-second timeout. |
| Interrupted Host | A failed read wave uses available Host cache data. The connection indicator gives a previously reachable Host one failed core-read wave before marking it unavailable. |
| Client blocking work | The executor admits up to 32 operations and runs up to eight at once. Network, credential-store and database work stays off the UI invoke path. See the [Host/Client gates](QUALITY_GATES.md#hostclient-resilience-authority) for write timeouts and catalog-job recovery. |
| 10,000 spools | A real 10,000-row fixture passes through normalization, inventory mapping, options, filtering, grouping, bounded render-window selection, overview calculation, and dashboard derivation without truncation. |
| Dashboard revisit | The fixture exercises 250 cached-snapshot clones. A revisit paints the saved view before starting background reads. |

The default Inventory card view reads up to 96 product groups with three spool
previews per card. Closed roll menus render only their summary. Opening a menu
shows up to 100 loaded rolls, with further choices available on demand. Counts and weights cover the whole group. More groups and
up to 100 more members of one group can be requested separately. A changed
inventory or catalog revision restarts paging. Free-text card search matches
all terms on each spool before grouping and paging. Typing refreshes the card
results independently of tab counts. Hosts without card-search support and
offline Clients use the full stock reader and the existing local filter.
Current Hosts also filter individual rolls by status, ownership, material,
vendor, location and low-stock policy before grouping. Opening the filter panel
requests distinct materials and vendors from the whole stock in the same read
transaction. Additional product and roll pages reuse those choices while the
Host, library, target generation, inventory revision and catalog revision match.
A revision change restarts pagination with fresh choices. Older Hosts and offline Clients filter the complete live or saved
list. Open inventory from a linked shelf passes the location and search text
to the first card-page read. Returning to a filtered card view in the same
library and refreshing a local card view reuse the active search and filters. Opening an individual shelf roll still checks its
placement against stock from the reviewed library and generation.
Opening and closing Add spool keeps the loaded cards and reads the
registration catalog on demand. A successful registration refreshes stock
so the new roll can be opened. List view, labels and selection use the
complete stock so they cover every matching roll.
A Client without a complete offline capture obtains one on its first full read.
Older Hosts and disconnected Clients use the existing full-list or scoped
offline path. Reading a card page preserves the last complete capture and its
timestamp. An explicit refresh of Stock on a paired Client renews that complete
offline inventory.

The 10,000-spool contract renders at most 200 list rows or 96 card groups at
once. Complete pagination is separately covered by
`ui/src/lib/spool_data_source.test.ts`, including the 10,000-row case with
1,000-row pages. When the Client has a Host address, library ID and target
generation, the shared full-list loader delegates pagination and offline storage
to `fetch_library_sync_spool_snapshot`. Rows cross into the UI once, alongside
the SQLite capture time. Inventory owns its scoped fallback and rechecks the
target before displaying rows. The loan picker requires fresh Host rows.
Native spool snapshot tests cover interrupted pagination and target switches.

Loans, Printers, Inventory, and Statistics use `get_library_sync_page_status` to resolve
the current role, pairing and Host target. `cargo test page_status` verifies
that this lookup can read the settings with unreadable cache values and
returns identical JSON with zero and 10,000 cached spools. Each page loads
the lists it needs separately.

Opening **Loans & borrowed-in**, lending and returning load loan history,
active loans and four tab counts. Local libraries count in SQLite. Paired
clients ask the Host for the counts and keep the last result for offline use.
On the first offline open after upgrading, SQLite can derive the counts from
existing cached lists. Opening a specific roll loads the full inventory. A loan write
saves the affected Host roll and its tab counts from the acknowledgement,
keeping the timestamp of the last complete offline inventory copy. A fresh
full snapshot absorbs any loan changes confirmed while its pages were in flight.
Older Hosts use their snapshot and supported list endpoints for the badges;
an unavailable count displays a dash.

Opening **Locations** from Loans and refreshing after a rename use location rows
and the compact workspace counts. Each roll counts once per linked location,
including its home location. Deletion uses all saved references, including
child locations. Paired Clients can display saved location counts offline.
Older Hosts and caches without counts derive them from stock when available.
Opening a location's linked rolls requests up to 100 rows by immutable location
ID. Both current and home placements qualify. A roll linked twice appears once.
Searching covers the whole selected location, and a change to inventory or
catalog data restarts pagination. Paired reads use the same Host, library and
target generation throughout. Offline pages come from the saved inventory and
preserve its capture time. A page never replaces the complete offline copy.
Older Hosts can use the full-list fallback. Opening the full Inventory or a
roll's editing controls remains an explicit action.
Merging locations on a paired Client refreshes the full inventory copy because
the merge can move both current and home assignments.

Opening **Loan out roll** reads the first 150 eligible rolls, the total count
and any eligible selection from Inventory in one call. Searches match all
words across the full library, including the roll reference and location.
Show more restarts at the first page if inventory, catalog, printer or loan
revisions have changed. The paired picker requires the same Host, library and
target generation throughout. Only a Host without the picker capability uses
the older live inventory and printer reads. An unreachable Host leaves lending
unavailable and preserves the offline inventory copy.

Printers reads the overview and printer settings together. The overview carries
vendor, initial and tare weights, catalog default weight and the material's
low-stock threshold for each resolved assignment. Opening or refreshing manual
slots uses those rows for display and weighing.

The spool picker requests up to 120 eligible rolls and the total number of
matches in one call. Search covers the whole library, including localized placement
labels. Show more requests the next page. Changed inventory, catalog or
printer revisions restart pagination. A page never replaces a complete offline
inventory snapshot.

Live tray matching, older Hosts and incomplete assignments use the complete
inventory. The picker reuses those rows when available. After a full read,
refreshes keep it current until the page closes or the target changes.

On a partial Host failure, the Client reads the saved copy of each failed domain.
A saved overview can still display its assigned spools without a saved inventory
list. Rust saves and returns complete Client spool snapshots in one call.
After loading the catalog, the page checks the current Host, library and
generation before displaying results. A change restarts loading for the new target.

Statistics opens with the inventory overview. It includes ownership counts and
the remaining grams of owned, on-hand stock for the forecast. Zero is a complete
measurement. Local libraries and current Hosts supply the overview without a
spool list. An older Host without the weight uses its full spool read. A failed
Host summary first checks the saved summary for the same Host, library and
generation. Older copies can still use scoped spool rows. Printers and loan
history each read their own cache only on failure. Period reports have no offline
fallback.

Current Statistics clients request currency totals and coverage on opening and
period changes. They fetch the selected inventory or material-cost trace when
its detail panel opens. The request and its result must match the displayed
period and original library, Host and target generation. Older Hosts return both
trace lists inline. Requests without a trace selector retain that contract.

A period change reuses a complete live overview, printers and loans for the same
day, library, Host and target generation if inventory, catalog, printer, job and
loan revisions match before and after the new report. Missing or changed
revisions and manual retries reload the page data. The final target check
discards late replies after a Host or library change.

Settings opens and refreshes General without reading local, live or cached spool
rows. The Printers and Filament defaults tabs request spool rows when needed.
Only Filament defaults requests the grouped filament standards. A paired Client
export requests live rows on demand and uses the same target's complete saved
copy if the Host read fails. A missing copy fails the export, while a saved
empty library exports successfully.

Settings reads the device name, validation status and low-stock policy without
cache lists. Client reads run concurrently. Failed printer, summary and requested
spool reads select their own saved data. The final settings read checks the
target generation in the same SQLite transaction and recovers a newer summary
if another request overtook it. A target change restarts the load once. The
native spool command saves complete snapshots under stable inventory and catalog
revisions. An interrupted read keeps the last complete copy, and a stale target
cannot replace it. Live rows remain available if only the local save fails.

The Client dashboard paints its cached figures before contacting the Host. The
following live refresh consumes that first read once, scoped to the same Host,
library and target generation. Healthy refreshes request no cache lists. On a
later partial failure, the dashboard requests only the failed domains, including
loan history when an older client lacks an active-loans cache. A target change
during a refresh discards the old replies and restarts from the new cache.

Dashboard requests `/library/snapshot?dashboard=true`. Its authenticated Host
response includes inventory figures, up to four low-stock preview rows and one
purchase candidate per low-stock product in the same SQLite read transaction.
The Client filters candidates against its live or cached purchase queue. It
keeps the compact Dashboard snapshot alongside the ordinary summary so reads by
other pages preserve its offline view. Older Hosts and existing offline copies
continue to use the spool-list calculations until a compact snapshot is available.

A low-stock purchase suggestion carries the mode, Host address, library ID and
target generation of the dashboard that displayed it. Clicking it checks compact
status and the native command verifies the reviewed target again. The authoritative
database checks all open purchases and inserts only when needed, in one immediate
transaction. Master ID matches take priority over product descriptions. Concurrent
clients receive the same item ID. Older Hosts require an update for this Dashboard
shortcut. Manual purchase entry uses the ordinary create operation. Overlapping clicks share a request only for the same
product and target. A completed purchase opens Purchases directly for that library.
The Stock tab reads only the total purchase count locally. A paired Client sends
its saved Stock page revision to the Host. On the first read or a revision
change, the Host includes up to 50 recent orders in the same snapshot so the
Client can renew its offline copy. Only the count crosses the desktop bridge
on a successful compact read. Older Hosts use the existing purchase reader.

Opening and refreshing Purchases reads the queue independently of stock.
The current Host and local database count the full purchase queue and return
50 matching rows per page. Filtering and literal case-insensitive search run
before pagination. The search field updates immediately and requests a page after
200 ms without typing. Clearing the search or choosing a status takes effect
immediately. A Dashboard handoff sorts the acknowledged order first
within the selected filter. Each response reads totals and rows from one
SQLite snapshot. Older Hosts use their existing recent list. Offline search
and counts use only saved rows. The Purchases fallback reads the saved wishlist.
The active Loans fallback reads the saved active list, including an empty one,
and uses saved loan history only when the active list is missing.
The Client retains up to 500 visited purchase rows from
the same wishlist revision and rejects pages from an obsolete pairing.

Inventory and Purchases read the default purchase currency in the background.
Local libraries read one SQLite setting. Current Hosts return the currency code
or `null` through the authenticated library API. On older Hosts that support
filament price standards, the native Client extracts the currency from that
response. Only the currency crosses the desktop bridge in either case.
The value belongs to the selected library and target generation. An unavailable
Host leaves the default blank and the currency field allows manual entry.

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
