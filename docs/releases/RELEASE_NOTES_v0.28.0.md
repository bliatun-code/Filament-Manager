# Filament Manager v0.28.0

Release date: 2026-08-26

## Faster Inventory Workflows

- Inventory now separates stock, locations, and wishlist/order work into clearer
  workspaces. The purchasing queue is available directly from Inventory instead
  of being hidden inside the add-spool flow.
- Spool details provide contextual **Loan out**, **Load in printer**, and
  **Print label** actions. Related detail changes use one save action, and
  closing or navigating away warns before unsaved changes are discarded.
- **All** includes every spool status, and an empty inventory is distinguished
  from a filtered view with no matches.
- Bulk work is available through an explicit **Select multiple** mode, keeping
  the normal stock view compact. Selected spools can be moved, assigned a
  status, exported, or included in a label sheet.
- Move and status changes show selected, affected, and unchanged counts before
  confirmation. The affected rows and their history events are committed
  atomically, and the operation is rejected if a reviewed spool changes before
  confirmation.
- Inventory label sheets have moved from Settings to Inventory. A sheet can be
  created for all available inventory or for an explicit selection.

## Actionable Dashboard Without Low-Stock Noise

- **Requires action** now focuses on overdue loans, incoming order follow-up,
  and Bambu Live trust issues, with direct links to the relevant workflow.
- Low-stock items are presented separately as optional suggestions. The section
  is quieter and collapsible, and individual suggestions can be hidden locally
  or restored without changing stock data or thresholds.
- A low-stock suggestion can open or reuse the matching wishlist/order entry
  with duplicate protection instead of creating repeated purchase plans.
- The low-stock boundary is consistent across Dashboard, Inventory, Statistics,
  Host, Client, and Companion: an on-hand spool is low at or below its effective
  threshold, while empty and unavailable statuses are handled separately.

## Stable Location Management

- User-managed storage locations are stable objects with immutable IDs. They
  can be created, renamed, archived, restored, and merged without losing spool
  placement or history references.
- Printer slots and loan-owned system locations remain automatic and are no
  longer shown in the location-management workspace.
- Each location shows its current association count. Selecting it opens
  Inventory with that exact location filter for shelf cleanup and investigation.
- An active or archived user location can be permanently deleted only when it
  has no current-placement, home-location, or child-location references.
  Eligibility is revalidated inside the delete transaction, while historical
  event text remains available.
- Search and filtering resolve both current and home-location names, while
  archive, restore, and merge preserve the original location identity.

## Filament Defaults And Safe Group Pricing

- Settings has a new **Filament defaults** tab. Global and per-material
  low-stock thresholds have moved there from General settings.
- A library-owned three-letter default purchase currency can be configured for
  new individual prices and price-group work. Saving it never rewrites existing
  purchase data.
- Collapsible price groups are derived from the library's own vendor, material,
  product-family, and nominal-spool-weight data. Colors do not split a group,
  and Generic or unique product families remain visible as one-spool groups.
- Each group shows spool count and price coverage. Individual spools can be
  removed from the selection before review.
- **Only missing prices** preserves existing prices and fills eligible missing
  values. **Update selected prices** separately reviews and confirms how many
  existing and manually entered prices will be replaced.
- A per-spool **Protect individual price from group updates** control blocks
  both batch modes while preserving normal manual price editing.
- The batch result lists updated, unchanged, protected, and manually required
  rows. Relevant rows link directly to their spool details.
- Historical, empty, lost, missing, removed, and legacy-archived spools are
  protected from automatic selection and overwrite. An unpriced historical
  spool can still be selected deliberately, one at a time, in missing-price
  mode; its price, currency, and protection lock are then stored together.
- Missing-price and missing-currency warnings in Statistics open the relevant
  control in Filament defaults. Desktop Clients read Host-owned standards
  without falling back to a local shadow library.

## Purchases, Loans, Value And Forecasting

- Receipt and spool details can record purchase price, currency, purchase date,
  batch code, and supplier reference. The fields remain editable and are
  included in full backup and lightweight CSV/JSON exchange.
- Outbound loans can include contact details and an expected return date.
  Due-today and overdue states remain visible until the loan is returned.
- Statistics supports the last 30 days, 90 days, last 12 months, and an
  inclusive custom date range. Period totals and drill-downs use the same range.
- **Inventory value** uses remaining weight and registered unit price for the
  current active stock snapshot. **Material cost** applies the same basis to
  recorded consumption in the selected reporting period.
- Value and cost remain separated by currency and ownership. Missing or invalid
  data is reported as incomplete coverage rather than zero, and trace rows link
  totals back to spools, consumption events, and printers.
- A deterministic consumption forecast uses owned on-hand stock and recorded
  owned usage from the last 30 days. It shows assumed daily use, estimated
  30-day consumption, remaining stock, days of supply, and a possible depletion
  date without creating an order automatically.

## Client, Host And Companion Reliability

- Inventory detail access routes through one authoritative active-library
  gateway in Standalone, Host, and Client modes.
- Client reads, validation results, runtime authorization, and caches are bound
  to the exact Host, library ID, and monotonically increasing target generation.
  A delayed response from Host A cannot update the interface after switching to
  Host B, including an A-to-B-to-A transition.
- Role lookup and authority changes fail closed. A Client never reads or writes
  a local shadow library, exposes local printer credentials, starts local Host
  services, or accepts a local Companion response after becoming a Client.
- Non-idempotent Host writes are sent exactly once and wait for a definitive
  response instead of being replayed after a transport timeout. Compound writes
  against an older Host fail before the first partial mutation, while an
  identical loan return remains safely repeatable.
- Pairing, session renewal, Trusted-LAN role changes, and Bambu Live polling are
  scoped to the authoritative role, credential profile, library, and target
  generation. In-flight work from an obsolete target is discarded.
- Dynamic Host paths and search values use consistent RFC 3986 encoding.
- Companion adds bounded request bodies, timeouts, rate limits, Content Security
  Policy, and defensive HTTP response headers. Stable authority and capability
  errors are localized instead of exposing raw backend messages.

## Data Integrity, Localization And Interface Polish

- Lightweight CSV/JSON exchange preserves vendor, nominal/current/remaining
  weight, spool tare, ownership and counterparty, purchase metadata, price
  protection, and user-managed current and home locations.
- Imports remain deliberately lighter than a full backup: foreign printer-slot
  and outbound-loan relations are normalized safely instead of being recreated
  as storage locations, while borrowed-in ownership creates a valid relation.
- Legacy subset imports preserve omitted fields, distinguish explicit clearing
  from missing data, and cannot reopen returned loans or reuse system-owned
  location IDs as user shelves.
- Full restore, import, startup repair, low-stock-policy revisions, and
  historical price locking have stronger transaction and no-op guarantees.
- English remains canonical. Norwegian Bokmål, German, and French include
  complete catalogs for the current copy, but every non-English locale remains
  marked Beta until a fresh native-language review. Other Beta languages use
  tested English fallback in desktop and Companion. Locale gates cover keys,
  parameters, plurals, accessibility labels, and Companion bundle budgets.
- Settings keeps its two-column layout at narrower desktop widths before
  collapsing to rows, and spool references in Filament defaults use the same
  compact identifier shown in Inventory and on QR labels.

## Upgrade Notes

- No manual database migration, repair, import, or re-pairing is required when
  upgrading from v0.27.
- A v0.27 library is upgraded automatically from schema 2 to schema 5. Before
  the first write, Filament Manager performs a read-only compatibility and
  integrity check, creates and verifies a local recovery copy, and applies the
  location, purchase-metadata, and price-standard migrations transactionally.
- Existing location IDs, spool references, and purchase prices are preserved.
  Existing prices are identified as manually entered, and the default currency
  never rewrites older rows.
- Historical and unavailable spools are automatically protected from batch
  price overwrite. Their individual prices remain manually editable.
- Update the Host and all desktop Clients together before using the new
  location, loan, reporting, and pricing workflows. Existing pairings remain
  valid; older Hosts reject unsupported new writes before partial changes.
- Do not use an older Filament Manager build to modify a schema-5 library.
  Newer-schema databases are rejected instead of silently downgraded.
- CSV/JSON export is intended for lightweight spool exchange. Use a full backup
  when moving the complete library with history, printers, loans, catalog data,
  and settings.

## Validation

- Full desktop UI, Companion, Rust, localization, accessibility, usability,
  workflow-contract, portability, public-readiness, bundle-budget, and
  10,000-spool performance verification.
- Exact Rust 1.88 minimum-supported-toolchain checks across all targets and
  features, followed by reviewed Rust 1.98 formatting, tests, and Clippy with
  warnings denied.
- Clean-install and historical v0.27 database upgrades through the real
  schema-5 migration runner, including verified recovery copies, preserved data
  and foreign keys, SQLite `quick_check`, idempotent second startup, full restore,
  and lightweight import/export round trips.
- Dedicated atomic bulk-operation, stale-review rollback, location reference,
  historical price-lock, grouped-price receipt, low-stock boundary, loan due
  state, reporting-period, value/cost trace, and forecast coverage.
- Dedicated Client target-generation, role-transition, cache-isolation,
  legacy-capability, exact-once write, idempotent return, pairing, Trusted-LAN,
  Bambu Live profile, and in-flight authority-change coverage.
- Companion CSP, security-header, request-size, timeout, rate-limit,
  path-encoding, localized-error, and locale lazy-loading coverage.
- Packaged-desktop workflow gates create and edit a spool, loan and return it,
  assign and clear a printer slot, restart the packaged app, and validate backup
  behavior on macOS and Windows before publication.
- Refreshed sanitized desktop and Companion screenshots cover Dashboard,
  Inventory, locations, filament defaults, spool details, loans, Statistics,
  and responsive Settings layouts.
- Clean npm and Cargo vulnerability audits, approved dependency-license
  policies, CodeQL analysis, validated SPDX SBOM generation, checksums, and
  signed build provenance remain release gates.
- Publication remains gated on installing and launching the exact signed and
  notarized macOS DMG and the exact Windows MSI, then verifying checksums, the
  source SBOM, and provenance bundle.

## Artifacts

- Universal 2 macOS DMG for Apple Silicon and Intel, Developer ID signed,
  notarized, stapled, and accompanied by `SHA256SUMS.txt`.
- Per-user Windows 11 x64 MSI, intentionally unsigned and accompanied by
  `SHA256SUMS-windows.txt`.
- SPDX 2.3 source dependency SBOM with its checksum manifest.
- Signed GitHub build provenance for the DMG and MSI, published as a Sigstore
  JSON bundle.
