# Filament Manager v0.30.0

Release notes prepared: 2026-09-08.

## Clearer Registration And Receipt

- Registering a single roll in the desktop **Add spool** dialog now opens a
  confirmation with **Open roll** and
  **Register another roll**. Open selects the exact roll returned by the
  library; registering another returns to the form with the filament selection
  retained, without creating anything.
- Repeated clicks cannot submit the same registration twice. A confirmed save
  remains successful if the following inventory refresh fails. This protects
  the active registration session; recovery of an unknown network outcome is
  provided separately by the Bambu batch flow below.
- Receiving an on-order item can set its home location immediately. The rolls,
  location, purchase details and receipt history are saved together, including
  partial deliveries. The confirmation shows the received and remaining counts.
- Loading a roll into a printer now confirms the exact printer, device and slot
  selected when the action began. A later printer refresh cannot change the
  destination named in the confirmation.
- Receipt and batch dialogs keep their controls reachable in smaller windows,
  preserve keyboard focus and restore focus when dismissed. The new messages
  are included in all 21 selectable languages.

## Atomic Bambu Batches And Recovery

- Register 1–100 catalog rolls as one transaction. Either the complete batch is
  saved, including any borrowed-in loans, locations and history, or none of it
  is saved. Repeated valid codes still represent separate physical rolls.
- Each batch has a saved request and durable receipt. If a response is lost,
  **Continue same batch** uses the original request and returns the original
  roll IDs when the batch was already saved, without adding duplicate rolls,
  loans or history.
- Reopening the dialog or app restores the pending request or confirmed
  receipt without automatically submitting another batch. An uncertain outcome
  requires an explicit continuation. A fresh attempt rejected before any save
  can be edited.
- The success view can open each individual roll. Starting a new batch removes
  completed rows and retains codes that still need review.
- Recovery stays with its original library and Host. An older Host without
  batch support is rejected before registration, with no fallback to a series
  of individual writes. A failed cache refresh cannot undo a confirmed receipt.

## Recoverable Catalog Updates

- Bambu and eSUN family refreshes now run as tracked jobs. Their status and
  saved result remain available after navigation or a lost start response,
  without silently starting another supplier request.
- Only one catalog refresh can run at a time for a library, including requests
  from different desktop Clients. Switching libraries or Hosts cannot send an
  old start request or publish its result in the new target.
- A completed import and its success receipt are committed together. After the
  local app or Host process running a job restarts, completed results remain
  readable and unfinished jobs are reported as interrupted. Recovery does not
  automatically resubmit interrupted work.
- Settings retains the last valid catalog and counts when a secondary Host
  read fails. Catalog progress and the active-operation lock survive leaving
  and returning to Settings.

## More Reliable Host, Client And Companion Workflows

- Companion printer-slot load, replacement and clearing now save outgoing
  consumption, incoming weight, assignment, location and history together.
  A request based on an outdated slot assignment fails without partial changes.
- Routine Trusted-LAN server restarts wait for accepted requests to finish
  before replacing the listener. Application shutdown retains its separate
  bounded shutdown behavior.
- Host/Client recovery has stronger checks for pairing, session renewal,
  offline reads and protected writes. Failed Host writes never fall back to
  creating or changing records in the Client's unrelated local library.
- Lending a roll refreshes the printer cache when its slot is cleared.
  Companion retains valid optional overview data during a partial refresh
  failure, and Client feedback avoids duplicate transient offline warnings.
- Full JSON backup import now uses an explicit in-app confirmation with the
  filename and **Cancel** selected initially. This fixes the missing native
  confirmation on macOS. A confirmed import remains successful if the
  subsequent settings refresh fails.

## Upgrade Notes

- The database advances from schema 5 to schema 7, adding catalog-job records
  and the batch receipt journal. Migration runs automatically on startup;
  existing inventory and relationships are retained.
- Update the Host and desktop Clients together to use catalog jobs, atomic
  batches and receipt locations. Unsupported new operations fail before a
  write on older Hosts.
- Batch receipts belong to the installation and are omitted from portable
  JSON backups. Importing a full backup into that installation preserves its
  existing batch journal, so replaying an old request cannot duplicate restored
  rolls. Replaying after restoring a backup of the same library from before
  the batch returns the original receipt without recreating rolls missing from
  that backup.
- A full app reset clears the journal and creates a new library identity.
  Batch replay protection does not transfer with a portable backup to another
  installation or survive manual replacement of the database file.

## Dependencies And Verification

- Updated Rust, TLS/HTTP, mDNS and desktop dependencies, together with ESLint
  and Playwright. Rust builds and CI now read the same exact toolchain version.
  The dependency review records the included patches and remaining upstream
  advisory follow-up in [Dependency review](https://github.com/bliatun-code/Filament-Manager/blob/cd8b5db6cd35550bf2d0130906cc2a91cd67096c/docs/DEPENDENCY_REVIEW_2026-09-07.md).
- The preceding source candidate `aee8d23e` passed main CI and CodeQL, plus
  separate packaged release verification. Those packages still carried version
  `0.29.0`; their results are not v0.30.0-head verification.
- That candidate passed signed and notarized Universal 2 DMG installation on
  Apple Silicon and Intel, and unsigned Windows x64 MSI installation and
  removal. Historical v0.28.0 schema 5→7 upgrades preserved protected data
  through two launches on macOS arm64 and Windows x64; Intel did not run that
  historical upgrade scenario.
- Installed desktop and Host/Client checks verified batch replay after restart,
  borrowed-in records, catalog-job recovery, session renewal, credential cleanup
  and no Client-local shadow writes. Details and package hashes are recorded in
  [Release verification](https://github.com/bliatun-code/Filament-Manager/blob/cd8b5db6cd35550bf2d0130906cc2a91cd67096c/docs/RELEASE_VERIFICATION_2026-09-08.md).
- Each versioned release head requires its own checks before publication. These
  automated and synthetic native checks do not establish measured improvements
  in human task completion or time.

## Distribution

The tagged release workflow produces the following after its required gates pass:

- Universal 2 macOS DMG for Apple Silicon and Intel, Developer ID signed,
  notarized, stapled and accompanied by `SHA256SUMS.txt`.
- Per-user Windows 11 x64 MSI, intentionally unsigned and accompanied by
  `SHA256SUMS-windows.txt`. Authenticode remains deferred.
- SPDX 2.3 source dependency SBOM with its checksum manifest.
- Signed GitHub build provenance for the DMG and MSI from the tagged release
  build.

## Included Pull Requests

- [#85 Harden Host Client resilience and recovery feedback](https://github.com/bliatun-code/Filament-Manager/pull/85)
- [#86 Harden fixed Host Client workflow gates](https://github.com/bliatun-code/Filament-Manager/pull/86)
- [#87 Gate packaged Host/Client flows and stabilize Client catalog refresh](https://github.com/bliatun-code/Filament-Manager/pull/87)
- [#88 Make Companion printer slot operations atomic](https://github.com/bliatun-code/Filament-Manager/pull/88)
- [#89 Make registration and catalog recovery safe across retries and restarts](https://github.com/bliatun-code/Filament-Manager/pull/89)
- Dependency and build-tool updates: [#83](https://github.com/bliatun-code/Filament-Manager/pull/83),
  [#84](https://github.com/bliatun-code/Filament-Manager/pull/84),
  [#90](https://github.com/bliatun-code/Filament-Manager/pull/90),
  [#94](https://github.com/bliatun-code/Filament-Manager/pull/94),
  [#95](https://github.com/bliatun-code/Filament-Manager/pull/95),
  [#96](https://github.com/bliatun-code/Filament-Manager/pull/96),
  [#97](https://github.com/bliatun-code/Filament-Manager/pull/97) and
  [#98](https://github.com/bliatun-code/Filament-Manager/pull/98).
