# Filament Manager v0.31.0

Release notes prepared: 2026-09-20. Changes since v0.30.0.

This release improves everyday inventory work, Companion on smaller screens,
Host/Client recovery, and backup/import feedback. It also fixes macOS background
startup identity and adds a TLS security update.

## Inventory, Weighing And Printer Slots

- The default **All** inventory view now hides **Empty** rolls. Use the **Empty**
  filter to find their history or prepare them for reuse; they are not deleted.
- Marking a roll as used up now saves its 0 g remaining weight, empty status,
  released printer slot, home location and history together. Lost/found and
  explicit reactivation also save their related changes together, preventing
  a failed step from leaving a partly updated roll.
- Weighing an empty roll above its empty-spool weight reactivates it in the same
  save. It returns to **Assigned** when it still has a printer slot, otherwise
  **In stock**. Repeated identical measurements do not count usage twice, and
  weight increases are corrections rather than negative consumption.
- Desktop printer loading, replacement, unloading and weighing now apply
  weight, consumption and assignment in one transaction. A dialog based on an
  old roll or slot assignment is rejected without partial changes.
- **Load in printer** keeps a valid selected destination when printers refresh.
  It cannot overwrite another roll that has since occupied that slot; use the
  printer's replacement flow for an intentional swap.
- Bulk review shows translated status names, selected/affected/unchanged
  counts, and straightforward save confirmations. Errors name the blocking
  rolls. Empty-to-in-stock changes require positive recorded filament weight,
  checked again against the Host's actual data. If one affected roll fails,
  the whole change is rejected.
- Roll details, removal confirmations, locations, bulk reviews, RFID capture
  and label generation are protected against rapid duplicate submissions and
  late replies after changing the roll, dialog or Host. A confirmed save stays
  successful if a subsequent refresh fails. Label/PDF results remain attached
  to the dialog and selection that requested them.

## Clearer Desktop And Companion Workflows

- Companion can now save an empty-spool tare change correctly and retain it
  after reload. Weighing, lending, returning and printer dialogs preview total
  weight minus tare before saving. Invalid inputs stay visible for correction;
  whole-gram validation no longer silently truncates decimal or exponent input.
- Companion loan selection searches the full inventory before limiting the
  displayed results, shows the matching count, and keeps search available when
  nothing matches. Printer dialogs and desktop inventory show useful placement
  names instead of internal location identifiers.
- Narrow Companion layouts keep navigation and catalog content readable, and
  printer cards reduce repeated status labels. A single desktop inventory
  result no longer stretches to fill the entire panel height.
- Loan drafts and return errors stay with the correct operation. Purchase and
  receipt actions, currency, low-stock thresholds and group-pricing saves reject
  duplicate or obsolete submissions. Confirmed pricing results remain visible
  when the following refresh fails.
- Green Settings confirmations expire after 20 seconds. Completed catalog jobs
  retain their results without replaying the same success banner after
  navigation or a Client restart. Successful jobs that import products while
  Settings is closed still notify on return. Errors and warnings keep their
  existing visibility.

## Host, Client And Connection Feedback

- Clients retain the known Host name during an outage and explain when the
  displayed data may be outdated. **Refresh** offers a direct retry; transport
  details remain available under advanced details.
- First-time loading shows progress or a retryable error instead of presenting
  an unresolved Host library as an empty local library. Roll details distinguish
  unavailable history from a history with no events.
- A revoked or missing pairing asks for pairing again. A normal network outage
  keeps the pairing and does not queue rejected changes for later replay.
- Pairing instructions now explain both desktop Clients and browsers. Client
  lists and revocation use consistent names, and a failed pairing clears the
  earlier intermediate success message.
- Companion distinguishes connection failures from server errors and warns
  when previously loaded data may be stale. Successful refresh clears the
  warning.

## Backup And Import

- The import section explains the difference before file selection: inventory
  CSV/JSON creates or updates rolls with matching IDs, while a full JSON backup
  replaces the library after confirmation.
- Validation summaries identify the file they describe and clear when a new
  file is processed. A rejected file cannot retain a previous file's
  **Fully compatible** result.
- Empty files, malformed JSON, unsupported backups and invalid inventory data
  receive distinct messages with correction guidance and the selected filename.
  Private parser and database details are not shown. Invalid imports leave no
  partially imported inventory.
- Packaged verification now exercises a full restore and the following restart,
  along with previous-release database compatibility. Startup checks require a
  fresh acknowledgment from each launched process, strengthening the evidence
  that the new package actually opened the test library.

## macOS Background Startup

On macOS 13 and newer, launch at login uses an app-associated helper so
background activity is identified as **Filament Manager** with its icon, rather
than only the signing publisher's name. Existing enabled standard registrations
migrate to the new helper. Disabled preferences and macOS permission denials
remain respected; missing permission produces instructions in Settings.

The signed local candidate tested on September 12 was checked through a real
logout/login with the correct app name, icon and hidden startup, as recorded in
the [background-startup verification](https://github.com/bliatun-code/Filament-Manager/blob/v0.31.0/docs/MACOS_BACKGROUND_SERVICE_2026-09-12.md).
This is not a promise to remove every
historical Login Items row on every Mac. macOS 11 and 12 retain the older login
mechanism. Install the app in **Applications** before enabling launch at login.

## Upgrade Notes

- Update the Host and desktop Clients together. The protected printer, empty,
  status and weighing operations require support from an updated Host. Updating
  only the Client does not install the new backend bulk-reactivation rule.
- The database remains at **schema 7**, as in v0.30.0. No new schema migration is
  introduced. The portable format remains `filament-manager-backup-v1`.
- Export a full backup before upgrading or importing data. Inventory exports
  are not full backups. Portable full backups omit machine-local credentials
  and pairings; moving to another installation requires configuring those again.
- Existing batch receipts remain local to the installation. Catalog job
  receipts and batch journals are not portable backup content.

## Dependencies And Review

- Includes React/React DOM 19.3, Vite 8.3, and the compatible Rust and tooling
  updates documented in the
  [September dependency review](https://github.com/bliatun-code/Filament-Manager/blob/v0.31.0/docs/DEPENDENCY_REVIEW_2026-09-14.md).
- Updates rustls to **0.23.45** to reject TLS 1.3 handshake messages at an
  incorrect encryption level, addressing
  [RUSTSEC-2026-0285](https://rustsec.org/advisories/RUSTSEC-2026-0285.html).
- Populated-data reviews covered the desktop, Companion, Host/Client,
  import/restore and bulk actions. They found and retested the concrete fixes
  above. These were agent expert assessments with synthetic data, not a human
  usability study, a full screen-reader audit or physical-printer certification.
  Details are in the
  [UI](https://github.com/bliatun-code/Filament-Manager/blob/v0.31.0/docs/UI_USABILITY_REVIEW_2026-09-19.md),
  [Host/Client](https://github.com/bliatun-code/Filament-Manager/blob/v0.31.0/docs/HOST_CLIENT_USABILITY_REVIEW_2026-09-19.md),
  [import](https://github.com/bliatun-code/Filament-Manager/blob/v0.31.0/docs/DATA_IMPORT_USABILITY_REVIEW_2026-09-20.md)
  and [bulk-action](https://github.com/bliatun-code/Filament-Manager/blob/v0.31.0/docs/BULK_ACTIONS_USABILITY_REVIEW_2026-09-20.md)
  reports. New messages are present in all 21 language catalogs with technical
  checks; no new native-speaker approval is implied.

## Distribution

The tagged release workflow publishes these artifacts after its required gates
pass:

- Universal 2 macOS DMG for Apple Silicon and Intel, Developer ID signed,
  notarized and stapled, with `SHA256SUMS.txt`.
- Per-user Windows 11 x64 MSI with `SHA256SUMS-windows.txt`. The Windows
  installer remains unsigned.
- SPDX 2.3 source dependency SBOM and `SHA256SUMS-sbom.txt`.
- GitHub build provenance for the DMG and MSI.

[All source changes since v0.30.0](https://github.com/bliatun-code/Filament-Manager/compare/v0.30.0...v0.31.0).
