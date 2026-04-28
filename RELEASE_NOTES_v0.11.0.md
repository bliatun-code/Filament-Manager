# Filament Manager v0.11.0

Release date: 2026-04-17

## Highlights
- Big parity release across desktop host, paired client, and trusted-LAN browser companion
- `Home location` is now a first-class spool concept instead of being overloaded into the same field as printer placement
- RFID capture and save flows now reach much further across paired-client and browser workflows
- Printer live state and diagnostics are clearer, richer, and more consistent across host and client views

## Host / Client / Browser Parity
- paired client now gets host-backed inventory RFID capture and save-to-roll flows
- paired client settings now use host-backed printer diagnostics data instead of depending only on local live state
- browser companion now supports:
  - `Home location` in spool details and add-spool flows
  - live printer badges and simple live slot context
  - RFID capture/save from host-backed live printer data
- browser companion spool history and constraint feedback are now much better localized

## Home Location + Placement
- spools now keep `home location` separate from current placement
- when a spool is removed from a printer slot, current placement can restore from `home location`
- updating `home location` on a spool that is simply on the shelf also updates the searchable current `location`
- add-spool flows now preserve both `home location` and initial `location` consistently across desktop, paired client, and browser companion

## Printer + RFID Improvements
- AMS slot logic is stricter and calmer around unknown RFID, manual overrides, and manual clear behavior
- paired client and browser companion now surface more host live printer state directly in the UI
- inventory and printer flows can save observed RFID back to the selected spool through the host
- Bambu `tray_weight` is now used to derive remaining grams from `remain` percent for supported live AMS updates

## Diagnostics + Live Analysis
- printer diagnostics now have explicit `Start capture` / `Stop capture`
- numeric capture fields can be plotted directly in a simple live chart
- latest raw live data can be copied directly from the diagnostics panel
- paired client settings can now render host-backed printer diagnostics instead of being limited to local-only live state
- diagnostics terminology has better Norwegian localization

## Browser Companion
- storage/detail flows now reflect `home location` more accurately
- live printer state is visible directly in the browser printer workspace
- spool-history labels are less technical and better localized
- browser-safe edit errors are translated into clearer Norwegian messages

## Validation
- `npm run smoke` PASS
- `cargo check --manifest-path src-tauri/Cargo.toml` PASS
- focused browser companion tests PASS
- manual QA PASS for:
  - paired-client RFID capture/save
  - paired-client and browser `home location`
  - browser live printer state
  - diagnostics capture/chart/copy flow

## Notes
- Older local release-draft history has been removed from the repository so this note can serve as the current clean baseline.
- GitHub `latest` remains the source of truth for downloadable DMG/MSI assets
