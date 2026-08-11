# Filament Manager v0.25.0

Release date: 2026-08-12

## Rolling 12-Month Filament Consumption

- The Dashboard now shows a chronological monthly bar chart for the current
  calendar month and the preceding eleven months, ordered oldest to newest.
- Months without recorded printing remain visible as zero buckets, making
  pauses and seasonal usage easier to recognize.
- The total above the chart is calculated from the same twelve buckets as the
  bars. The existing **Monthly Usage** card remains a separate last-30-days
  measurement.
- The chart replaces the previous line, which looked chronological but actually
  plotted all-time material totals ordered by size.
- Month labels and usage values are localized and available through pointer,
  keyboard, and assistive-technology interaction.
- Consumption is derived from recorded printer-linked print jobs and Bambu Live
  usage sessions. Existing recorded history appears automatically; unrecorded
  filament use cannot be reconstructed.

## Developer Improvements

- `npm run dev:local` now starts Tauri against a persistent, isolated standalone
  database without changing the installed app's saved host or client role.
- On its first run, the command creates a populated SQLite snapshot from an
  existing local library or successful standalone recovery snapshot. The copy
  receives a separate library and credential profile, while client pairing,
  Trusted LAN state, machine credentials, and printer connection secrets are
  removed.
- Later runs reuse `tmp/dev-local/filament-manager.db`, allowing realistic local
  development without repeatedly rebuilding test data or touching the source
  database.
- The Rust workspace now uses Rust edition 2024 and Cargo resolver 3. Resource,
  secret, database, task, and rollback cleanup order was made explicit before
  the migration. No user-visible, database-schema, or API behavior change was
  intended by the edition update.

## Dependency And CI Maintenance

- Refreshed compatible lockfile updates for `@axe-core/playwright` and
  `axe-core`, esbuild, browser-support metadata, UI globals, the Rust `futures`
  family, and `rustls-webpki`.
- Rolldown remains intentionally pinned to 1.2.1 because 1.2.3 currently
  increases the Settings bundle beyond its reviewed size budget.
- Both required macOS and Windows smoke jobs now compile the full workspace
  with the declared Rust 1.88 minimum supported version before running normal
  verification with the reviewed Rust 1.97.1 toolchain.
- The Windows release builder is pinned to Windows Server 2025, while ordinary
  Windows Smoke remains on the moving `windows-latest` runner as an early
  compatibility signal.
- Dependabot now surfaces major npm and Cargo upgrades instead of suppressing
  them with blanket rules. The remaining UI holds are explicit: TypeScript
  stays on 6.x until the lint toolchain supports TypeScript 7, and Node type
  definitions remain aligned with the Node 24 runtime contract.

## Upgrade Notes

- No manual database migration or settings change is required.
- To see the new twelve-month chart on a desktop client, update both the host
  and the client. A v0.25 client connected to an older host reports that the
  host must be updated instead of displaying a false zero history. An older
  client connected to a v0.25 host continues showing its previous consumption
  visualization until that client is updated.
- The twelve-month view is based on calendar-month buckets, including the
  current partial month. It is not a January-to-December calendar-year report
  or an exact trailing 365-day window.
- `npm run dev:local` is a source-development command, not an additional
  end-user role. It requires a populated source database, preserves an existing
  development copy, and does not refresh that copy automatically on later
  runs.

## Validation

- Full UI, Companion, script, Rust, Clippy, localization, accessibility,
  performance, bundle-budget, portability, and workflow-contract verification.
- Dedicated coverage for chronological month ordering, zero-filled months,
  local month rollover, separation from the 30-day card, cached client data,
  and safe behavior with an older host.
- Dedicated local-development database coverage for snapshot selection,
  sanitization, isolation, locking, persistence, and source protection.
- Exact Rust 1.88 workspace checks on both supported desktop platforms,
  followed by full verification with Rust 1.97.1.
- Clean npm and Cargo vulnerability audits, approved npm and Cargo license
  policies, CodeQL analysis, and validated SPDX SBOM generation.
- Full macOS and Windows smoke on all four merged pull requests, including a
  clean Windows MSI installation and launch.
- Release publication remains gated on verification of the exact signed and
  notarized macOS DMG, the Windows MSI, checksums, SBOM, and signed installer
  provenance.

## Artifacts

- Universal 2 macOS DMG for Apple Silicon and Intel, Developer ID signed,
  notarized, stapled, and accompanied by `SHA256SUMS.txt`.
- Per-user Windows 11 x64 MSI, intentionally unsigned and accompanied by
  `SHA256SUMS-windows.txt`.
- SPDX 2.3 source dependency SBOM with its checksum manifest.
- Signed GitHub build provenance for the DMG and MSI, published as a Sigstore
  JSON bundle.
