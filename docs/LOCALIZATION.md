# Localization workflow

English is the canonical source language. All 20 non-English catalogs are
complete and published as community translations, so the desktop app and
Companion offer 21 languages in the same compact selector without Beta labels.
Norwegian Bokmål, German, and French retain their prior named-review record, but
must be reviewed against the current source fingerprint before returning to
maintained status. Inline English fallbacks remain an emergency runtime guard;
published locale catalogs are not allowed to depend on them. Generated
pseudo-locales are QA tools and must never appear as user choices.

`catalogKind`, `selectable`, and `releaseStatus` describe different concerns:

- `selectable` controls whether users can choose the language.
- `catalogKind: "source"` means a checked-in catalog with full key and
  placeholder parity. `catalogKind: "draft"` is reserved for a non-selectable,
  incomplete development overlay over English.
- `releaseStatus: "community"` means the complete catalog is published and can
  receive corrections without claiming named native approval.
- `releaseStatus: "maintained"` records named native review against a specific
  English source fingerprint.

`releaseQaAudits` is the separate release-evidence ledger. Each record names the
exact English source fingerprint, the complete desktop/Companion catalog-set
fingerprint, the runtime QA contract fingerprint, the locales covered, the
verification date, and passed artifact and runtime QA.
`artifactQa: "passed"` means every covered
desktop and Companion catalog generated and compiled successfully.
`runtimeQa: "passed"` means every covered catalog passed key, placeholder,
message-format, loading and runtime contract checks. A change to the formatter,
locale loader, registry, generator, localization checks or their tests changes
the runtime fingerprint and invalidates older evidence automatically. Any
translation change in any locale likewise changes the catalog-set fingerprint.
These
fields are machine-verifiable release engineering evidence, not native-language
approval. Screenshot gates remain a separate release check and must be reported
from their actual run; they are never inferred from this ledger.

All non-English locales are currently published community translations. Their
catalogs and automated structural QA are complete, but availability must not be
described as named native approval against the current source fingerprint.

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

New languages start as `catalogKind: "draft"`, `releaseStatus: "draft"`,
`selectable: false`, and use sparse dictionaries layered over English. While
incomplete, they are available to explicit QA only and the operating-system
language must not activate them automatically. Publishing requires full desktop
and Companion key parity, no catalog fallback, at least the configured
translation signal, current fingerprint-bound artifact QA, and visual QA. The locale then becomes a
`community` translation; it becomes `maintained` only after named native review.

1. Update English source strings first. Use parameterized messages instead of
   building sentences from translated fragments.
2. Run `npm run report:i18n`. The source fingerprint changes immediately and
   marks maintained translations stale.
3. Translate desktop and Companion catalogs, preserving placeholders and ICU
   plural/select syntax.
4. Update translator context when a new short label, overloaded term, or strict
   width constraint is introduced.
5. Run `npm run verify`, the full data-backed desktop locale matrix, and the
   representative Companion screenshot gate for every affected locale before
   publishing a new community translation.
6. Record a passed `releaseQaAudits` entry for the exact source, catalog-set and
   runtime contract fingerprints and
   only the locales actually exercised by the artifact and runtime gates. Keep
   the screenshot results with the release evidence instead of encoding an
   unverified visual pass in this file.
7. For maintained status, a named native reviewer checks the glossary, main
   workflows, safety/error copy, long strings, dates, numbers, plurals, labels,
   and documentation links.
8. After native approval, update the locale's `nativeReviewer`, `reviewedAt`,
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
owner can be selectable as a community translation, but is not eligible for
`maintained` status.

A maintained locale becomes stale whenever its reviewed source fingerprint no
longer matches the combined English desktop and Companion catalogs. Stale
locales fail `check:i18n-readiness`. Every selectable locale—community or
maintained—must pass the completeness gates below; only non-selectable draft
locales may use an English catalog overlay during development. Release readiness
requires:

- 100% key and placeholder coverage for actions, errors, confirmations, and
  safety-critical text;
- at least 95% overall translation signal, with unchanged technical terms
  reviewed explicitly;
- zero unknown literal keys and a current source fingerprint;
- passed fingerprint-bound artifact/runtime QA, plus the data-backed visual
  gates for release candidates.

Readiness rejects a selectable locale when no passed `releaseQaAudits` record
covers that locale and the current source, complete catalog-set and
runtime-contract fingerprints. Old records may remain as history, but they
cannot authorize changed catalog copy, formatter, loader, registry, generator or localization
gate. This intentionally does not imply that a native speaker reviewed the
language.

Promotion from `community` to `maintained` additionally requires named native
approval against the current source fingerprint.

## Collaboration model

GitHub pull requests are sufficient for the current review workflow because the
catalogs are code-reviewed, the reviewer group is small, and automated contracts
already run in CI. Reconsider a translation platform if contributor
volume, review latency, plural/context discussions, or stale catalog
coordination becomes difficult. Do not add a platform merely to export the same
files through another system.

The selectable set is frozen at the current 21 languages while review debt is
reduced. Fixes to the 20 non-English catalogs take priority over adding another
locale. Users can report a focused correction through the
[translation correction form](https://github.com/bliatun-code/Filament-Manager/issues/new?template=translation.yml).
The form records the language, affected surface, current wording, suggested
wording, and context without treating a single correction as complete native
review of the catalog.

User-facing counts, decimal values, percentages, temperatures, and weights use
the selected app locale through the shared `Intl.NumberFormat` helpers. Storage,
command payloads, calculations, CSV fields, and identifiers remain
locale-neutral so changing language cannot alter persisted values or machine
interfaces.

## Reviewer handoff

Use [`localization/REVIEW_CHECKLIST.md`](../localization/REVIEW_CHECKLIST.md) for
both focused community corrections and a complete native review. Norwegian
Bokmål, German, and French retain their previous reviewed fingerprint; repeat
the handoff before promoting them against the current source. Community
translations remain selectable with complete catalogs while their wording is
improved through the correction form and pull requests.

The complete English user guide is the documented fallback for languages that
do not yet have a reviewed locale-specific guide. Translated guides follow real
review and demand; they are not generated mechanically from the source guide.
