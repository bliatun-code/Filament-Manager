# Filament Manager v0.29.0

Release date: 2026-08-30

## Bambu And Prusa Themes

- Two playful, unofficial brand-inspired themes join the existing Auto, Light,
  and Dark appearance choices. Bambu uses a vivid green workshop palette, while
  Prusa uses its recognizable warm orange accents.
- Theme tokens now cover navigation, controls, dialogs, statistics, inventory
  surfaces, and the native desktop title bar. Desktop and Companion retain
  their own local appearance preferences.
- Filament swatches, material colors, and semantic status colors remain data
  colors. Selecting a theme never recolors the inventory itself.
- Theme, modal, contrast, accessibility, and visual-QA contracts protect all
  five appearance choices during future interface work.

## Complete 21-Language Experience

- Every selectable desktop and Companion language now ships a complete current
  catalog without a Beta label: English plus 20 translated locales.
- Localization gates reject missing or extra keys, invalid parameters, broken
  plurals and message formats, unavailable runtime bundles, and accidental
  dependence on English fallback rows.
- Compact language selection remains practical on desktop and phone. Native
  review and wording corrections are still welcome through the dedicated
  translation issue form; completeness does not claim that community review is
  finished.

## Safer Catalog And Printer Discovery

- Bambu and eSUN catalog maintenance now starts with one lightweight,
  read-only vendor discovery. It lists only the material families the current
  source can provide, imports nothing, and changes no catalog lifecycle state.
- A refresh is limited to one selected material family at a time. Source-format
  changes, rate limits, bot challenges, and incomplete responses fail closed:
  the local catalog is retained, the request is not widened, and unseen rows
  are not marked discontinued.
- Bambu and eSUN source handling follows the vendors' current storefront
  formats while keeping missing-swatch maintenance separate from retrieval.
- Passive Bambu printer discovery listens for current local announcements and
  can fill the host address and serial number from one unambiguous result. The
  same discovery path can recover a DHCP-changed address only after the saved
  printer identity is verified again.
- Loaned-spool detail rules are consistent: blocked status or placement edits
  no longer leave an undismissable dialog. Inventory header actions are also
  simplified consistently between desktop and Companion.

## Stronger Local Transport Trust

- Bambu Live now uses a rustls verifier that checks the announced serial, saved
  public-key pin, certificate lifetime, and handshake signature before reading
  credentials or sending MQTT authentication.
- Automatic printer-address recovery must prove the saved public-key pin before
  a new host is stored. This keeps convenient DHCP recovery tied to the printer
  identity that was approved previously.
- Bambu X.509 v1 printer certificates remain supported through validated raw
  public-key signature verification for TLS 1.2 and TLS 1.3.
- Credential-bearing desktop Host traffic accepts HTTPS, while deliberate
  private-LAN HTTP use is restricted to the normalized `.local` Host address.
  Companion remains a same-LAN service and must not be exposed publicly or
  forwarded through an untrusted VPN or proxy.
- Compatible frontend and Rust dependencies were refreshed, the yanked
  `chacha20` version was replaced, and the former native-tls/OpenSSL chain was
  removed. Dependency, license, and CodeQL checks report no known open finding
  for this release candidate.

## Expanded Bundled Filament Catalog

- The bundled seed catalog is rebuilt from the authoritative historical Host
  catalog: 2,074 source rows normalize to 1,607 unique entries.
- The update adds 501 catalog identities, refreshes metadata for 401 existing
  entries, and reactivates 84 entries. It removes no existing identity and does
  not newly mark any entry discontinued.
- The seed contains 382 Bambu and 1,218 eSUN entries. The remaining retained
  rows preserve other reviewed catalog identities and historical search.
- The 133 already-discontinued entries remain available for matching old stock.
  Seed version `2026.08.29-host-1607` and content-derived future export versions
  make later catalog updates independently verifiable.

## More Reliable Desktop Clients

- A Client now waits for its role and initial Host data to resolve before it
  can show Host-unavailable feedback. This removes the brief false offline
  warning and empty counters seen during ordinary navigation to a live Host.
- Inventory, locations, loans, printers, statistics, and settings share one
  retryable fallback message for cached, partial, or offline data instead of
  stacking a generic request error and a second Host warning.
- Last-good snapshots are preserved only for the exact Host/library target, and
  concurrent inventory refreshes cannot let an older response replace newer
  state.
- Catalog-backed Add Filament UI loads only when opened. It has explicit
  loading, ready, and retry states, ignores stale catalog responses, and keeps
  modal focus and keyboard dismissal accessible.
- Statistics and settings preserve valid partial or cached slices without
  presenting unavailable secondary data as a failure of the entire page.
- Full backups now record the actual Filament Manager release version instead
  of the internal core-library version, so v0.29.0 exports carry correct
  provenance metadata.

## Upgrade Notes

- No manual database migration, repair, import, or re-pairing is required when
  upgrading from v0.28. The database schema remains version 5.
- On first start, the bundled seed update adds and refreshes reviewed catalog
  metadata without removing existing catalog identities or changing physical
  spool records.
- Update the Host and all desktop Clients together before relying on the new
  fallback-state and catalog-loading behavior. Existing pairings remain valid.
- Existing Auto, Light, and Dark preferences are preserved. Bambu and Prusa are
  opt-in appearance choices, and Desktop and Companion preferences remain
  independent.
- Bambu Live access codes remain in the operating system credential store.
  Existing approved printer identities and saved public-key pins remain the
  basis for connection and address recovery.

## Validation

- Full desktop UI, Companion, Rust, localization, accessibility,
  public-readiness, bundle-budget, and large-inventory performance verification.
- All 21 desktop and Companion locale contracts, including runtime loading,
  message parameters, plurals, and translation-readiness policy.
- Theme and native-title-bar coverage for Auto, Light, Dark, Bambu, and Prusa,
  with inventory swatch preservation and desktop/Companion visual matrices.
- Catalog source parsing, conservative discovery, one-family refresh, failure
  retention, and the 1,607-entry seed identity contract.
- Bambu TLS identity, signed handshake, discovery, public-key pin, DHCP address
  recovery, and pre-credential verification coverage.
- Client initial resolution, fallback priority, target generation, race safety,
  cache isolation, partial statistics, and lazy catalog retry coverage.
- Clean npm and Cargo vulnerability audits, approved dependency-license
  policies, CodeQL analysis, SPDX SBOM validation, checksums, and signed build
  provenance remain publication gates.

## Artifacts

- Universal 2 macOS DMG for Apple Silicon and Intel, Developer ID signed,
  notarized, stapled, and accompanied by `SHA256SUMS.txt`.
- Per-user Windows 11 x64 MSI, intentionally unsigned and accompanied by
  `SHA256SUMS-windows.txt`.
- SPDX 2.3 source dependency SBOM with its checksum manifest.
- Signed GitHub build provenance for the DMG and MSI, published as a Sigstore
  JSON bundle.

## Included Pull Requests

- [#76 Stabilize client inventory, catalog refresh, and localization](https://github.com/bliatun-code/Filament-Manager/pull/76)
- [#77 Add Bambu and Prusa brand themes](https://github.com/bliatun-code/Filament-Manager/pull/77)
- [#78 Harden local transport trust and refresh dependencies](https://github.com/bliatun-code/Filament-Manager/pull/78)
- [#79 Update bundled filament seed catalog](https://github.com/bliatun-code/Filament-Manager/pull/79)
- [#80 Fix transient client Host fallback states](https://github.com/bliatun-code/Filament-Manager/pull/80)
