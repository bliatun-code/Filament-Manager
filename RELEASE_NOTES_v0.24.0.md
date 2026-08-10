# Filament Manager v0.24.0

Release date: 2026-08-10

## Bambu Live Setup And Address Recovery

- Bambu Live can now be configured as an optional second step when adding a
  supported Bambu printer from the Printers page.
- The setup checks the printer TLS identity and requires an explicit trust
  decision before enabling Live. The access code remains in the operating
  system credential store.
- A trusted Live integration can now automatically recover after the printer
  receives a new DHCP address. The saved address changes only when discovery
  finds the expected printer serial and the previously trusted TLS public-key
  identity also matches.
- Address recovery does not send the printer access code, and a changed or
  unverified identity remains blocked for explicit review.

## Upgrade Guidance

- Existing enabled Bambu Live integrations that predate printer identity trust
  remain disconnected until their identity is reviewed.
- The Dashboard now shows a clickable **Bambu Live needs attention** message
  for each affected printer. It opens the matching printer directly under
  **Settings → 3D printers**, where the identity can be checked and trusted.
- Already trusted printers need no migration action. If automatic address
  recovery cannot establish both the saved serial and trusted identity, review
  the connection manually rather than trusting an unexpected identity.

## Client Dashboard Reliability

- Paired desktop clients now render their locally cached Dashboard before
  contacting the host, so a slow or temporarily unavailable host no longer
  delays the first useful view.
- Client caching now includes filament-consumption data, preserving recent
  consumption totals and material-usage summaries while the host is
  unavailable.
- Local-name resolution and HTTP fallback now share one request timeout budget,
  reducing delays when mDNS resolution is slow.

## Dependency And Release Maintenance

- Updated compatible Node.js and Rust dependencies, patched the vulnerable
  transitive `nanoid` release, and removed a stale WebAssembly runtime
  override.
- Dependency-changing pull requests now run npm and Cargo vulnerability and
  license audits, plus a pinned source-SBOM generation check.
- The reviewed Rust toolchain is pinned to 1.97.1, while both Cargo packages
  declare Rust 1.88 as their minimum supported version. Workspace compatibility
  with the exact Rust 1.88 toolchain was validated for this release.
- Maintainers on macOS can opt into a stable development signing identity for
  `tauri dev`, reducing repeated Keychain approvals after local rebuilds
  without using the Developer ID release identity.
- CI smoke checkouts no longer retain repository credentials, and release SBOM
  generation now uses the pinned Syft 1.51.0 release.

## Validation

- Full UI, Companion, script, Rust, Clippy, localization, accessibility,
  performance-contract, and release-workflow verification.
- Automated coverage for Bambu Live onboarding, TLS trust migration notices,
  guarded address recovery, and direct navigation to the affected printer
  settings.
- Client-cache-first Dashboard coverage, including cached filament consumption
  and bounded local-name resolution.
- npm and Cargo vulnerability and license audits, Rust 1.88 workspace
  compatibility, and pinned SPDX 2.3 SBOM generation.
- Full macOS and Windows smoke, CodeQL analysis, and installed release-artifact
  checks before publication.

## Artifacts

- Universal 2 macOS DMG for Apple Silicon and Intel, Developer ID signed,
  notarized, stapled, and accompanied by `SHA256SUMS.txt`.
- Per-user Windows 11 x64 MSI, intentionally unsigned and accompanied by
  `SHA256SUMS-windows.txt`.
- SPDX 2.3 source dependency SBOM, checksum manifests, and signed GitHub build
  provenance for the installer artifacts.
