# Filament Manager v0.9.0-rc.8

Release date: 2026-04-12

## Highlights
- Eighth multi-device sync release candidate
- Focused client/host polish RC after the `rc.7` snapshot hotfix
- Tightens desktop-client pairing visibility, dashboard behavior, and final paired-client QC fixes before the next release-candidate pass

## Pairing And Client-State Improvements
- `Innstillinger / Settings` now distinguishes between `host is reachable` and `desktop pairing is still valid`
- paired desktop status refreshes automatically when opening the library-role / webapp settings, instead of waiting for a manual `Sjekk vert / Check host`
- invalid pairing is surfaced consistently as `Må pares på nytt / Re-pair required`
- paired desktop flow now exposes `Forny paring / Renew pairing` when host is reachable but pairing has expired or been revoked
- host-validation and pairing-invalid banners now follow the active UI language instead of leaking raw English backend text

## Dashboard And Client UX Fixes
- `Oversikt / Dashboard` now reuses the same pairing-invalid state as `Settings`, so the client-status pill no longer shows a misleading green `Connected to host` while pairing is invalid
- the dashboard client-status pill now stays stable instead of flickering between repair/live states during refresh
- `Oversikt` no longer triggers full host refreshes on every native window resize, which fixes the jerky resize behavior reproduced only in paired-client mode

## Inventory And Role-Change Polish
- `Lager / Inventory` no longer shows the generic green client-mode info banner at the same time as an active auth/renewal error
- role-change popups for `client -> host` and `client -> standalone` now share the same calmer structure and no longer mix Norwegian and English copy in the same dialog

## Validation
- `npm run smoke` PASS on macOS
- paired desktop QC PASS for:
  - `Oversikt / Dashboard` pairing-invalid pill state
  - `Innstillinger / Settings` auto-refreshing pairing state
  - `Forny paring / Renew pairing`
  - localized pairing-invalid status/banner copy
  - live / cached / offline client behavior
  - protected-write blocking when host is unavailable
  - protected-write blocking when host pairing is invalid
  - `Statistikk / Statistics` `Forbruk per printer -> Forbruk per filament` in paired client mode against refreshed host
  - `Oversikt / Dashboard` resize smoothness in paired client mode after removing resize-triggered refreshes

## Remaining Release Risk
- This is still a pre-release for cross-device sync testing
- Single-host library model only
- No multi-master sync
- No offline write queue
- No automatic host failover

## Next QA Focus
- Update both host and paired client to `v0.9.0-rc.8`
- Continue real two-machine regression testing from the repaired pairing/dashboard baseline
