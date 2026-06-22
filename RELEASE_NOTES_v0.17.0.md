# Filament Manager v0.17.0

Release date: 2026-06-23

## Highlights

- Public-readiness release after the internal `v0.16.0` testing round.
- Improved host/client behavior so desktop clients route sensible inventory, catalog, printer, wishlist, loan, and settings writes through the host library instead of drifting into local-only data.
- Polished the Companion inventory flow with host-backed add/spool actions, consistent Inventory naming, and less noisy Bambu code helper UI.
- Added AGPL-3.0-or-later licensing, notice text, in-app legal links, repository hygiene files, issue templates, CodeQL, Dependabot guardrails, and a screenshot product tour for the public repository.
- Hardened settings legal/source links and desktop URL opening so source, license, and notice actions work in both Tauri and browser-style runtimes.
- Renamed the app bundle/storage identity to `no.bliatun.filamentmanager` before wider distribution.

## Included Since v0.16.0

- Add AGPL licensing and settings links.
- Add screenshot product tour.
- Prepare repository for public release.
- Limit Dependabot to safe update batches.
- Fix settings legal document links.
- Rename app storage and tidy Companion add flow.
- Route client writes through host.
- Fix `OptionalUpdate` Clippy default handling.
- Improve Companion host-backed inventory flows.
- Harden desktop URL opening.

## Notes For Testers

- This release is still intended for the final private stability pass before making the repository public.
- macOS builds are not notarized yet. Downloaded apps may still need quarantine removal until Apple signing/notarization is added.
- If running host/client mode, keep the host app as the source of truth for the library and use the client pairing/settings flow rather than editing local client data directly.

## Validation

- `npm run verify` PASS
- `npm run test:ui` PASS
- `npm run test:companion` PASS
- `npm run check:contracts` PASS
- `npm --prefix ./ui run build` PASS
- `git diff --check` PASS
