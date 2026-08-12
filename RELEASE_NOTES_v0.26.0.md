# Filament Manager v0.26.0

Release date: 2026-08-12

## Fresh AMS Weight Corrections

- Large, implausible AMS weight drops remain blocked from automatic inventory
  updates. The stored weight stays unchanged instead of treating a long period
  away from the app as newly observed print usage.
- For a loaded spool with a fresh, unique, exact RFID match, **Update weight**
  can now show the AMS remaining percentage, estimated net filament, empty-spool
  tare, AMS spool basis, calculated total, and observation time.
- **Use AMS estimate** explicitly rebases the inventory weight. The correction
  records weight and history evidence atomically without inventing a print job,
  Bambu Live session, or filament consumption for the time the app was away.
- AMS percentages remain estimates rather than physical scale measurements.
  Use a measured total weight whenever exact remaining filament matters.

## Desktop Client Reliability And Responsiveness

- Desktop clients now reuse pooled, proxy-free HTTP clients and share
  single-flight mDNS resolution for a paired `.local` host. A successful private
  route remains fresh for five minutes; a retained last-known-good route is
  revalidated again after 30 seconds when periodic discovery has a transient
  failure.
- A fully failed host refresh no longer immediately marks the host unavailable.
  The Dashboard preserves its last-good state through the first failed
  core-read wave, reduces duplicate focus refreshes, and throttles heavy
  revision fallback work while the LAN recovers.
- Desktop host reads, pairing, all supported host writes, and library-sync
  settings now run through a bounded blocking executor. This includes longer
  Bambu and eSUN catalog refreshes and operating-system credential-store work,
  keeping them off the UI invoke path.
- Warm client sessions reuse a zeroizing in-memory device token and collapse
  concurrent renewal attempts. Cold starts, credential changes, and
  authorization failures still consult the protected credential store and
  remain fail-closed.

## Client Catalog Completeness

- A desktop client now requests up to 5,000 host catalog rows instead of 1,000,
  so the bundled seed and current host additions are not silently truncated in
  the Add Filament flow.
- Optional catalog search is URL-encoded and forwarded to both the current and
  compatible legacy host routes. Legacy fallback occurs only for an exact HTTP
  404 response, not for unrelated transport text containing those digits.

## Security And Data Integrity

- Authenticated desktop requests remain behind the expected library-identity
  preflight and are never transparently replayed onto a newly resolved address
  after a transport failure.
- Retained-address recovery is credential-free and health-only. A candidate is
  promoted only after a ready response reports the exact expected library ID;
  invalid status, malformed data, another library, and route-generation races
  all fail closed.
- AMS acceptance revalidates the current online and MQTT-connected observation,
  settled reader state, fresh roll identity and weight, manual cache-clear
  boundary, exact unique RFID match, assigned spool, and expected stored weight
  on the authoritative host.
- Explicit acceptance and automatic live-weight sync use serialized immediate
  transactions, preventing a stale background decision from overwriting a user
  correction. Carried weight evidence is cleared when the effective roll
  identity or loaded-slot generation changes.

## Upgrade Notes

- No manual database migration or settings change is required when upgrading
  from v0.25. Existing desktop pairings remain valid and do not need to be
  recreated.
- Update both the host and each desktop client before using the AMS correction
  from a client. Matching versions are also recommended for the complete host
  catalog and the full client reliability improvements. Configure Bambu Live on
  the authoritative host.
- Stable `.local` pairing still requires the host and client to share a private
  LAN that permits mDNS/Bonjour traffic. The client never turns cached data into
  an offline write or automatically replays a credential-bearing operation at
  a different address.
- If **Use AMS estimate** is absent, wait for current Live data and the AMS reader
  to settle, confirm that the inventory spool has the exact RFID assignment, or
  enter a physical measured weight instead.

## Validation

- Full UI, Companion, script, Rust, Clippy, localization, accessibility,
  performance, bundle-budget, portability, public-readiness, and workflow
  contract verification.
- Exact Rust 1.88 locked workspace checks across all targets and features,
  followed by the normal reviewed toolchain verification.
- Dedicated resolver, retained-route, session-renewal, bounded-executor,
  Dashboard hysteresis, catalog completeness, and exact-404 fallback coverage.
- Dedicated AMS identity-generation, freshness, transaction rollback,
  concurrent live-sync serialization, protected Companion route, host payload,
  UI revalidation, accessibility, and no-synthetic-usage coverage.
- Clean npm and Cargo vulnerability audits, approved npm and Cargo license
  policies, CodeQL analysis, and validated SPDX SBOM generation.
- The public AMS dialog screenshot is produced from a sanitized, time-relative
  fixture through an exact-window gate that waits for fresh rendered Live
  telemetry before capture.
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
