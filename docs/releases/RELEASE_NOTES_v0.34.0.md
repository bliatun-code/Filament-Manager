# Filament Manager v0.34.0

Release notes prepared: 2026-10-25. Changes since v0.33.0.

This release gives Dashboard a balanced layout with useful details visible,
centers branded QR logos, and restores Host-provided printer live status on
Clients. It also includes dependency security and maintenance updates.

## A Balanced Dashboard

- On-hand spools, outbound loans and consumption over the last 30 days lead the
  page. Printer summaries and low-stock rolls appear together, with annual
  consumption and recent loan activity visible below.
- Progress goals, the inventory-health percentage and the collapsed **Setup
  and library details** collection are removed. Ownership, loaded slots and
  incoming-order details remain available in a compact summary.
- Purchase suggestions remain collapsed until opened. Important setup, overdue
  loans, incoming orders and printer trust actions remain visible.
- Printer job totals appear in the corresponding printer cards. Recent activity
  focuses on loans, preserving each roll's identity and color.
- The layout adapts to narrow windows and supports light and dark themes.

## Printer Status On Clients

- Clients display fresh, trusted printer telemetry supplied by their connected
  Host. Stale or unavailable data remains explicitly unavailable.
- Printers without live data no longer show the redundant **Manual setup**
  badge on Hosts, Clients or standalone installations.

## Centered QR Logos

- The reel logo is centered in desktop and Companion QR codes and exported
  labels. The renderer protects QR function patterns and reduces the logo when
  needed, with a plain-code fallback when safe branding is unavailable.
- Digital decoding checks cover screen renderings and exported label images.
  These checks do not replace a physical print-and-scan sample at the intended
  size.

## Maintenance And Verification

- Dependency updates include security fixes for certificate validation and
  frontend packages, alongside Rust, UI and workflow maintenance updates.
- Dashboard copy is included in all 21 supported language catalogs. Automated
  browser QA covers 63 views across languages, window sizes and themes, plural
  formatting and the purchase-suggestion disclosure. This is automated QA,
  not a claim of native-speaker review.
- macOS and Windows verification, database upgrade tests and tests of the
  installed applications gate publication through the existing release workflow.

## Upgrade And Downloads

- Update the Host and desktop Clients to use the latest behavior together.
  Updating a Client does not update its Host automatically.
- The database remains at **schema 7** and the portable backup format remains
  `filament-manager-backup-v1`; no new schema migration is introduced.
- Export a full backup before upgrading. Portable backups omit machine-local
  credentials and pairings.
- macOS: universal Apple Silicon/Intel DMG, Developer ID signed, notarized and
  stapled. Windows 11: per-user x64 MSI; the Windows installer remains unsigned.
  Checksum manifests, a source dependency SBOM and signed installer provenance
  accompany the verified installers.

[All changes since v0.33.0](https://github.com/bliatun-code/Filament-Manager/compare/v0.33.0...v0.34.0).
