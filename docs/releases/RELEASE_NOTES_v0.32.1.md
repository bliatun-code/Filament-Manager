# Filament Manager v0.32.1

Release notes prepared: 2026-10-14. Changes since v0.32.0.

This patch fixes Bambu catalog updates after the public filament collection
grew beyond the app's four-page limit and updates the TLS library for newly
reported security advisories.

## Bambu Catalog Refresh

- Both material discovery and the subsequent selected-material refresh now
  support a complete collection of up to eight pages. This covers the current
  five-page storefront and provides bounded room for further growth.
- Discovery allows up to ten collection requests, including fallback-store
  probes. Refresh keeps its separate limit of 24 product-detail requests for
  one selected material family.
- Incomplete, inconsistent, duplicated or blocked collection responses still
  preserve the existing material list and catalog. Request pacing, response
  limits, cooldowns and per-request timeouts remain intact. No automatic
  retries or discontinued-product marking are introduced.

## Security

- Updates rustls to 0.23.46, addressing
  [RUSTSEC-2026-0346](https://rustsec.org/advisories/RUSTSEC-2026-0346.html),
  [RUSTSEC-2026-0347](https://rustsec.org/advisories/RUSTSEC-2026-0347.html),
  [RUSTSEC-2026-0348](https://rustsec.org/advisories/RUSTSEC-2026-0348.html) and
  [RUSTSEC-2026-0349](https://rustsec.org/advisories/RUSTSEC-2026-0349.html).
  Security thresholds and advisory handling remain intact.

## Upgrade Notes

- In Client mode, catalog discovery and refresh run on the connected Host.
  **Update the Host as well as the desktop Client** to receive this fix.
- The database remains at **schema 7** and the portable backup format remains
  `filament-manager-backup-v1`. No schema migration is introduced.
- Export a full backup before upgrading. Portable backups omit machine-local
  credentials and pairings.
- The filament and printer colors and other product behavior from v0.32.0
  are unchanged apart from the catalog fix and rustls security patch.

## Verification And Distribution

Regression tests cover complete five- and eight-page collections, materials
found only on the final page, upper and aggregate request limits, fallback
stores, and late-page failures that must stop before catalog mutation.
A read-only check of the official storefront validated all 51 collection
products and a complete ABS snapshot without changing a database.

The tagged release workflow publishes the Universal 2 macOS DMG after signing,
Apple notarization, stapling and Apple Silicon/Intel installation checks. It
also publishes the per-user Windows x64 MSI after installation checks, source
SPDX SBOM, checksum manifests and signed installer build provenance. The
Windows installer remains unsigned.

[Bambu catalog fix, PR #164](https://github.com/bliatun-code/Filament-Manager/pull/164).
[All source changes since v0.32.0](https://github.com/bliatun-code/Filament-Manager/compare/v0.32.0...v0.32.1).
