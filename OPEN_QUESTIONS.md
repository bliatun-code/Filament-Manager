# Open Questions

## UI / UX
- How minimal should the selected filament popup be?
  - Keep only information and quick actions
  - Or allow limited editing beyond QR and weight
- Should assignment-related history events stay visible in filament history?
  - Keep everything for traceability
  - Or hide noisy system events like printer-slot assignments
- How strong should dark-mode tinting be?
  - Subtle and conservative
  - Or more vivid so filament/printer colors pop harder

## Selected Filament Popup
- Should the header show both status and remaining weight chips, or should those values appear only once in the body?
- Should location be shown at all in the popup, or only on the printer page and card/list surfaces?
- Should the weight update section be simplified further into a single compact action row?

## Add Spool / Intake Flow
- Should the browser add-spool sheet stay split into:
  - left: catalog and stock entry
  - right: wishlist/order flow
  - or become more step-based on narrower windows
- Should `Add current selection to wishlist` remain visible even when no item is selected, or only appear once an item is selected?
- Should we add a more explicit visual highlight for the currently selected vendor source beyond the active pill style?

## Inventory
- How much metadata should be shown on filament cards?
  - minimal human-friendly summary
  - or slightly more operational detail
- Should borrowed items in the side panel remain compact summaries, or become richer mini-cards matching inventory styling?

## Loans
- Should loan cards eventually support more compact “dense mode” layouts for large loan counts?
- Should the return flow remain a popup-first interaction everywhere, or should some quick-return inline action survive on desktop?

## Printers
- How much vendor branding should printer cards carry?
  - soft brand tint only
  - or stronger visual identity per vendor
- Should printer cards in dark mode use a different tint algorithm than filament cards?

## Catalog / Data
- Should catalog refresh logs remain purely in settings, or should the browser add-spool sheet offer a lightweight “last refreshed” hint only?
- Should material-type refresh defaults stay broad, or should we guide users toward smaller, safer partial refreshes to avoid anti-bot issues?

## Internationalization
- Norwegian copy is being normalized, but some wording may still need decisions:
  - `Printer` vs `3D-printer`
  - when to say `Filament` vs material family name directly
- Do we want to prioritize full Norwegian polish first, or keep English/Norwegian parity moving together?

## Product Direction
- Is the selected filament popup mainly a read-and-manage surface, while all operational assignment belongs elsewhere?
- Should future UI work prioritize:
  - popup cleanup
  - catalog/import flow
  - dark mode polish
  - mobile/narrow window responsiveness

## Borrowed-In Filament
- Current phase decision:
  - borrowed-in filament stays visible together with owned stock in `Lager`
  - `Lager` now has an explicit ownership filter for `All / Owned / Borrowed in`
- Current phase decision:
  - dashboard/statistics headline totals still remain combined
  - ownership-aware summary panels now expose the split additively instead of silently redefining the existing totals
- Current phase decision:
  - detailed statistics drill-downs now expose ownership filters/labels where borrowed-in stock is operationally relevant
  - filament-consumption rows keep owned and borrowed-in usage separate
  - active loaded-slot details can filter owned vs borrowed-in assignments
- Current phase decision:
  - `Statistikk` now exposes separate outbound borrower usage and inbound owner/counterparty usage panels
  - the shared filament breakdown modal now supports both directions with direction-specific wording
- Should borrowed-in filament count in future primary/top-line inventory metrics:
  - total filament count
  - low-stock warnings
  - dashboard summaries
- Should borrowed-in filament show a softer warning before printer assignment, even though the default domain decision is to allow assignment?
- Current phase decision:
  - handed-back borrowed-in spools are soft-deleted from active inventory
  - loan rows and spool history are preserved
  - the existing loans modal shell is shared, but inbound/outbound now use direction-specific wording and backend handling
- Should handed-back borrowed-in spools later get a dedicated historical surface beyond the loans/history records?
- Should the `Utlån` page later make its side-panel usage summary direction-aware too, given that `Statistikk` now exposes the inbound/outbound split already?

## Web App / Browser Companion
- Current phase decision:
  - trusted-LAN is now the only supported browser-companion access path
  - desktop remains the source of truth and direct SQLite owner
  - the retired localhost browser-companion path should not be treated as an active product surface anymore
- Current phase decision:
  - browser `Storage` is the companion label for desktop `Inventory` / `Lager`
  - browser intake is a real `Add spool` flow, not a borrowed-in-only helper
- Current phase decision:
  - trusted-LAN uses single-use pairing links plus revocable paired-browser records, device-cookie renewal, and exact `Host` / `Origin` validation
  - mutating requests use a normal session + CSRF model rather than open LAN trust
- Current phase decision:
  - Step 3 trusted-LAN access is now the live browser baseline without widening browser workflow scope
  - Step 3 secures access, not traffic: plain HTTP remains acceptable only with blunt trusted-LAN-only wording and an explicit `traffic is not encrypted` warning
  - the first trusted-LAN release binds only to an explicitly selected private interface/address instead of opening all interfaces by default
- Which workflows are desktop-first vs browser-first?
  - catalog maintenance
  - inventory updates
  - slot assignment
  - loans
  - QR lookup/edit
- Current phase decision:
  - QR lookup is now browser-available from the inventory section
  - QR save/edit is now browser-available from spool detail
  - browser `Storage` now exposes a real `Add spool` flow with vendor-backed/manual owned intake, borrowed-in intake, wishlist add/status changes, and `Stock now`
  - borrowed-in owner/contact/note editing is now browser-available from spool detail
  - borrowed-in hand-back is now browser-available from spool detail
  - narrow status/location editing is now browser-available from spool detail for selected unassigned, non-loaned spools
  - basic selected-spool printer-slot assignment/clear is now browser-available
  - outbound loan review/history with direct return for active loans is now browser-available
  - selected-spool outbound loan creation is now browser-available from spool detail, along with active-loan visibility for the selected spool
  - replacing a different occupied spool in a slot still stays desktop-first
- Current phase decision:
  - the browser UI should start as an operational companion, not as a full desktop-settings replacement
  - the first browser shell now serves that slice at `/companion`: Storage inventory overview, QR lookup/edit, `Add spool` intake for owned/borrowed-in/wishlist flows, borrowed-in editing/hand-back, printer overview, outbound loan review/history with direct return for active loans, spool detail with active-loan visibility, narrow status/location updates, manual weight update, basic selected-spool printer-slot assignment/clear, and selected-spool outbound loan creation
  - the first browser shell now also has a compact/touch-friendly narrow-width mode, but that does not change the intentionally narrow workflow scope
  - replacing a different occupied spool in a printer slot still stays desktop-first for now
- Should the browser companion eventually ship as:
  - a same-codebase responsive shell
  - or a more explicitly mobile-optimized browser shell layered on the same backend services
- For trusted-LAN follow-up, should pairing stay:
  - per-device approval only
  - or should there ever be a simpler revocable shared-token mode for trusted home-lab devices
- For trusted-LAN follow-up, should desktop Settings continue to allow:
  - explicit interface/IP selection only
  - or later add an advanced all-interfaces mode
- For trusted-LAN handoff, should desktop Settings later add:
  - QR display next to the existing one-time pairing link
  - or a short manual code fallback
- For trusted-LAN discovery, should the product eventually add:
  - manual URL + one-time pairing link only
  - or mDNS/Bonjour discovery in a later release
- For trusted-LAN QA/operations, should the next automation investment be:
  - real trusted-LAN browser/device automation
  - or a lighter manual verification matrix until the LAN product shape settles

## Data / Domain Semantics
- The source-of-truth entity is now expected to remain the physical filament unit with ownership metadata, but some questions remain:
  - how much owner metadata belongs directly on the spool
  - when, if ever, a separate reusable contacts table should be introduced
- Should loan records always remain separate from the physical filament unit history, even when they are tightly coupled in UI?
- How should we represent counterparties beyond phase 1:
  - simple free-text names first
  - or a reusable contacts/people table
- Should statistics distinguish between:
  - owned-filament consumption
  - borrowed-in consumption
  - loaned-out loss/consumption

## How To Use This File
- Put unresolved design or product choices here
- Move confirmed decisions into:
  - `/Users/bliatun/Documents/Codex/bambu-filament-manager/DEVELOPER_BRIEF.md`
  - `/Users/bliatun/Documents/Codex/bambu-filament-manager/SESSION_STATE.md`
- Move actionable implementation work into:
  - `/Users/bliatun/Documents/Codex/bambu-filament-manager/NEXT_STEPS.md`
  - `/Users/bliatun/Documents/Codex/bambu-filament-manager/UI_POLISH_TODO.md`
