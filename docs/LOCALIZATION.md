# Localization workflow

English is the canonical source language. All 20 non-English catalogs are
complete and published as community-review candidates, so the desktop app and
Companion currently offer 21 languages in the same compact selector. Norwegian
Bokmål, German, and French retain their prior named-review record, but must be
reviewed against the current source fingerprint before returning to maintained
status. English remains the runtime fallback. Generated pseudo-locales are QA
tools and must never appear as user choices.

`catalogKind`, `selectable`, and `releaseStatus` describe different concerns:

- `selectable` controls whether users can choose the language.
- `catalogKind: "draft"` permits fallback overlays and keeps a catalog eligible
  for community correction; it does not by itself mean that the locale is
  hidden.
- `releaseStatus: "maintained"` records named native review against a specific
  English source fingerprint.

All non-English locales are currently published community-review candidates.
Their catalogs and automated visual QA are complete, but availability must not
be described as named native approval against the current source fingerprint.

## Canonical terminology

Use these concepts consistently in the desktop app, Companion, labels, guides,
and release notes. Product and protocol acronyms remain unchanged.

| Concept | Canonical English | Norwegian Bokmål | Meaning and boundary | Visual context |
| --- | --- | --- | --- | --- |
| Physical consumable | spool in inventory prose; roll in compact user-facing actions where already established | filamentrull / rull | One physical carrier plus its filament. Do not use *filament* when the carrier or identity is relevant. | [Filament details](screenshots/filament-details.jpg) |
| Inventory | inventory | lager | The collection of tracked physical spools, including borrowed-in stock. | [Inventory](screenshots/inventory.jpg) |
| Outbound loan | loan / loaned out | utlån / utlånt | User-owned stock temporarily given to somebody else. | [Loans](screenshots/loans.jpg) |
| Borrowed-in | borrowed in | innlånt | Stock owned by somebody else and temporarily held by the user. Never translate it as loaned out. | [Add filament](screenshots/add-filament.jpg) |
| Tare | empty spool weight / spool tare | tomvekt for rullen | Weight of the empty carrier, subtracted from measured total weight. | [Filament details](screenshots/filament-details.jpg) |
| Remaining weight | remaining weight | gjenstående vekt | Estimated usable filament excluding tare. Bambu Live/AMS values remain estimates. | [Filament details](screenshots/filament-details.jpg) |
| Slot | slot | spor | One material position in an AMS, MMU, external holder, or toolhead group. | [Slot assignment](screenshots/printer-slot-assignment.jpg) |
| Toolhead | toolhead | verktøyhode | Printer head/extruder material position, not a handheld tool. | [Slot assignment](screenshots/printer-slot-assignment.jpg) |
| Empty inventory status | empty | tom | A physical spool has no usable filament. Distinct from an unoccupied printer slot. | [Filament details](screenshots/filament-details.jpg) |
| Lost inventory status | lost | mistet | The physical spool cannot currently be located. It is not deleted. | [Filament details](screenshots/filament-details.jpg) |
| AMS | AMS | AMS | Bambu Lab Automatic Material System. Keep the acronym and vendor capitalization. | [Printers](screenshots/printers.jpg) |
| RFID | RFID | RFID | Radio-frequency spool identity. Keep the acronym; do not imply every vendor supports it. | [RFID capture](screenshots/rfid-capture.jpg) |
| Companion | Companion | Companion | Filament Manager's trusted-LAN browser interface. Treat as a feature name, not a person. | [Companion inventory](screenshots/companion-phone-inventory.jpg) |

Short or ambiguous message keys have additional machine-checked translator notes
in [`localization/message-context.json`](../localization/message-context.json).
Interpolated values such as `{name}`, `{count}`, product names, filament codes,
paths, identifiers, and URLs are user data and must not be translated.

## Translation change workflow

New languages start as `catalogKind: "draft"`, `selectable: false`, and use
sparse dictionaries layered over English. While incomplete, they are available
to explicit QA only and the operating-system language must not activate them
automatically. Publishing a completed locale as a community-review candidate is
an explicit release decision after full catalog, artifact, and visual QA. A
locale becomes `maintained` only after named native review.

1. Update English source strings first. Use parameterized messages instead of
   building sentences from translated fragments.
2. Run `npm run report:i18n`. The source fingerprint changes immediately and
   marks maintained translations stale.
3. Translate desktop and Companion catalogs, preserving placeholders and ICU
   plural/select syntax.
4. Update translator context when a new short label, overloaded term, or strict
   width constraint is introduced.
5. Run the full data-backed desktop and Companion visual matrices, then
   `npm run verify` before exposing a new community-review candidate.
6. For maintained status, a named native reviewer checks the glossary, main
   workflows, safety/error copy, long strings, dates, numbers, plurals, labels,
   and documentation links.
7. After native approval, update the locale's `nativeReviewer`, `reviewedAt`,
   and `reviewedSourceFingerprint` in `localization/locale-status.json`, then
   repeat the release checks.

The report treats dictionary parity as key coverage and separately reports the
share of target strings that differ from English. Legitimate unchanged strings
such as AMS, RFID, vendor names, measurements, and product names are reviewed
manually; the distinct-string percentage is a warning signal, not proof of
translation quality.

## String freeze

Start a locale release freeze after translation review begins. During the
freeze, source-string changes require the localization owner to classify them:

- **Blocking:** safety, destructive actions, authentication, data loss, or a
  broken workflow. Translate and re-review before release.
- **Deferrable:** ordinary copy improvements. Move them to the next release.
- **Locale-only:** translation correction that does not change placeholders or
  meaning. Native review is still required, but the source fingerprint stays
  stable.

The freeze ends only after all maintained locales pass the release report and
the locale-specific visual/release gates. Never bypass a stale fingerprint by
copying the new value without native review.

## Review ownership and stale-locale policy

Every locale marked `maintained` must have one named native reviewer or
maintainer in `localization/locale-status.json`. Norwegian Bokmål, German, and
French retain a named review of an earlier source fingerprint and are candidates
until that handoff is repeated for the current catalog. A locale without an
owner can be selectable as a clearly described community-review candidate, but
is not eligible for `maintained` status.

A maintained locale becomes stale whenever its reviewed source fingerprint no
longer matches the combined English desktop and Companion catalogs. Stale
locales fail `check:i18n-readiness`; they may use English runtime fallback during
development, but must not ship as fully supported. Release readiness requires:

- 100% key and placeholder coverage for actions, errors, confirmations, and
  safety-critical text;
- at least 95% overall translation signal, with unchanged technical terms
  reviewed explicitly;
- zero unknown literal keys and a current source fingerprint;
- named native approval and passed data-backed visual/artifact QA.

## Collaboration model

GitHub pull requests are sufficient for the current review workflow because the
catalogs are code-reviewed, the reviewer group is small, and automated contracts
already run in CI. Reconsider a translation platform if contributor
volume, review latency, plural/context discussions, or stale catalog
coordination becomes difficult. Do not add a platform merely to export the same
files through another system.

## Reviewer handoff

Use [`localization/REVIEW_CHECKLIST.md`](../localization/REVIEW_CHECKLIST.md) for
both focused community corrections and a complete native review. Norwegian
Bokmål, German, and French retain their previous reviewed fingerprint; repeat
the handoff before promoting them against the current source. Community review
candidates remain selectable while retaining their review-candidate status and
English fallback contract.

The complete English user guide is the documented fallback for languages that
do not yet have a reviewed locale-specific guide. Translated guides follow real
review and demand; they are not generated mechanically from the source guide.
