# German and French localization review

Use this checklist for native review of the hidden `de` and `fr` pilot locales.
It supplements the canonical terminology and workflow in
[`docs/LOCALIZATION.md`](../docs/LOCALIZATION.md); it does not replace a named
reviewer or record approval by itself.

## Before review

- Confirm the locale is still `draft`, not selectable, and has English as its
  runtime and user-guide fallback.
- Run `npm run report:i18n` and record the current combined English source
  fingerprint.
- Generate a review sheet with `npm run export:i18n-review -- --locale <locale>`.
  Open the TSV in a spreadsheet and filter by surface, state or context.
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

Replace `<locale>` with `de` or `fr`.

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
- Change release status and locale selectability only in the same reviewed
  release change.
- Re-run readiness, both visual matrices and full verification after the status
  change.
- Do not approve a stale fingerprint or infer native approval from automated
  tests, machine translation or visual layout checks.
