# Localization review checklist

Use this checklist for community corrections or complete native review of any
registered locale. All non-English locales are currently published
community-review candidates. Norwegian Bokmål, German, and French retain a
named review record for an earlier source fingerprint and require a renewed
handoff before maintained status. This checklist supplements the canonical
terminology and workflow in
[`docs/LOCALIZATION.md`](../docs/LOCALIZATION.md); it does not replace a named
reviewer or record approval by itself.

## Before review

- For a maintained locale, confirm whether it is stale against the new English
  source fingerprint. For a community-review candidate, record the exact source
  fingerprint used for the review.
- Run `npm run report:i18n` and record the current combined English source
  fingerprint.
- Generate a review sheet with `npm run export:i18n-review -- --locale <locale>`.
  Open the TSV in a spreadsheet and filter by surface, state or context.
- Confirm the export reports `0 fallback`. Rows marked `unchanged` require
  reviewer confirmation that the term, product name, acronym or format should
  remain identical to English.
- Review only against artifacts produced from the same fingerprint.
- Keep product names and protocol acronyms such as Bambu Lab, eSUN, AMS, RFID,
  MQTT, QR, CSV, JSON and AGPL unchanged unless the product itself localizes
  them.

## Language review

- Check navigation, actions, empty states, errors, confirmations and destructive
  warnings for natural wording and consistent terminology.
- Distinguish a physical inventory spool from filament material and from an
  empty printer slot.
- Distinguish stock borrowed from somebody else from stock loaned out by the
  user.
- Treat AMS remaining weight as an estimate and RFID as physical spool identity.
- Check singular, plural and zero-count messages with real values.
- Check dates, decimal separators, relative times and sorting with accented or
  non-ASCII names.
- Check long compound labels and narrow controls without shortening away the
  meaning of destructive or security-sensitive actions.

## Maintaining translator context

- Add an exact entry or a narrowly scoped prefix group in
  `localization/message-context.json` for new copy whose meaning depends on a
  workflow, state transition, warning or product concept.
- Reserve `trivialGroups` for conventional, self-explanatory interface words.
  Every exemption needs a written reason; ambiguous exceptions still need an
  exact context entry.
- The uncovered-key delta baseline prevents new source keys from silently
  bypassing this review. If readiness reports a changed baseline, add context
  first. Update the reported count and fingerprint only after explicitly
  reviewing any remaining additions as genuinely trivial.

## Workflow review

- Dashboard ownership, health, client snapshot and activity cards.
- Inventory filters, add/manual/batch flows, wishlist and selected spool detail.
- Outbound loans, borrowed-in stock, returns and history.
- Printer slots, collapsed summaries, Bambu Live telemetry and RFID matching.
- Statistics filters, charts and borrower/owner breakdowns.
- Library roles, desktop pairing, Trusted-LAN browser pairing and revocation.
- Backup import/export, catalog repair, swatch editing and app reset warnings.
- Single PNG label and A4/US Letter label-sheet preview and output wording.
- Companion inventory, detail, add, loans, printers and settings on phone,
  tablet and wide layouts.

## Required QA commands

Replace `<locale>` with the registered locale ID, for example `de`, `fr`,
`pt-BR`, or `ja-JP`.

```sh
npm run report:i18n
npm run export:i18n-review -- --locale <locale>
node scripts/run-desktop-screenshot-gate.mjs --launch --locale <locale> --profile rich --scenario all
node scripts/run-companion-screenshot-gate.mjs --launch --locale <locale> --profile rich
npm run verify
```

The screenshot gates must use their temporary database copy. Do not run the
Companion screenshot gate against the live library without `--launch`.

## Approval

After corrections and a final clean QA run:

- Add the named native reviewer and review date to
  `localization/locale-status.json`.
- Set `reviewedSourceFingerprint` to the exact fingerprint that was reviewed.
- Change `releaseStatus` to `maintained` only in the reviewed release change.
  Locale selectability is a separate product decision and may already be true
  for a published community-review candidate.
- Re-run readiness, both visual matrices and full verification after the status
  change.
- Do not approve a stale fingerprint or infer native approval from automated
  tests, machine translation, public availability, or visual layout checks.
