# Open Questions

## UI / UX
- Current phase decision:
  - the selected filament popup stays information-first with quick actions, not broader editing scope
- Current phase decision:
  - assignment-related history events can stay hidden when they are mostly noisy system events like printer-slot assignments
- Current phase decision:
  - dark-mode tinting stays subtle and conservative rather than more vivid by default

## Selected Filament Popup
- Current phase decision:
  - this popup remains a read/manage surface rather than an operational assignment surface
  - duplicated status/remaining presentation should stay reduced rather than grow back

## Add Spool / Intake Flow
- Current phase decision:
  - the browser add-spool sheet stays split into left `catalog/stock entry` and right `wishlist/order flow`
  - it should not become more step-based in this phase
- Current phase decision:
  - `Add current selection to wishlist` should only appear once an item is selected
- Current phase decision:
  - the active pill treatment is enough for the selected vendor source in this phase

## Inventory
- Current phase decision:
  - filament cards stay at a minimal human-friendly summary level rather than adding more operational metadata
- Current phase decision:
  - borrowed items in the side panel remain compact summaries rather than richer inventory-style mini-cards

## Loans
- Current phase decision:
  - `Loans` does not need a dedicated dense mode in this phase
- Current phase decision:
  - the return flow remains popup-first rather than restoring inline quick-return actions

## Printers
- Current phase decision:
  - printer cards keep a soft brand tint rather than a stronger per-vendor visual identity
- Current phase decision:
  - printer cards do not need a separate dark-mode tint algorithm from filament cards in this phase

## Catalog / Data
- Current phase decision:
  - catalog refresh logs remain in `Settings`
  - the browser add-spool sheet does not need a lightweight `last refreshed` hint in this phase
- Current phase decision:
  - material refresh defaults stay broad rather than steering harder toward partial refreshes in this phase

## Internationalization
- Current phase decision:
  - current wording normalization is sufficient for this phase
  - we are not opening a separate terminology pass for `Printer` vs `3D-printer` or `Filament` vs material-family wording now
- Current phase decision:
  - English and Norwegian should continue to move in parity rather than running a Norwegian-first polish pass

## Product Direction
- Current phase decision:
  - we are not locking a single next UI priority in this file for this phase
  - follow-up work can continue to be chosen case-by-case from active QC, release, and product needs

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
- Current phase decision:
  - primary/top-line inventory metrics stay combined
  - ownership-aware additive panels remain the place where owned vs borrowed-in splits are shown
- Current phase decision:
  - borrowed-in filament does not need a softer warning before printer assignment in this phase
- Current phase decision:
  - handed-back borrowed-in spools are soft-deleted from active inventory
  - loan rows and spool history are preserved
  - the existing loans modal shell is shared, but inbound/outbound now use direction-specific wording and backend handling
- Current phase decision:
  - handed-back borrowed-in spools do not need a dedicated historical surface beyond loans/history records in this phase
- Current phase decision:
  - direction-aware inbound/outbound summaries belong in `Statistikk`
  - `Utlån` does not need a matching side summary in this phase

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
- Current phase decision:
  - the current desktop-first vs browser-first workflow split is sufficiently defined by the implemented product boundaries in this phase
  - desktop remains the broader operational surface, while the browser companion keeps its intentionally narrower workflow scope
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
- Current phase decision:
  - the browser companion stays a narrow operational companion on the same product base in this phase
- Current phase decision:
  - trusted-LAN pairing remains per-device approval only in this phase
- Current phase decision:
  - desktop `Settings` continues to use explicit interface/IP selection only rather than adding all-interfaces mode
- Current phase decision:
  - trusted-LAN handoff does not need QR display beside the pairing link or a manual code fallback in this phase
- Current phase decision:
  - trusted-LAN discovery stays manual URL + pairing-link based in this phase
- Current phase decision:
  - we are not locking a dedicated trusted-LAN automation direction in this phase
  - a lighter manual verification approach remains acceptable until the LAN product shape changes

## Data / Domain Semantics
- Current phase decision:
  - the physical filament unit remains the source-of-truth entity with ownership metadata on the spool in this phase
- Current phase decision:
  - loan records remain separate from the physical filament unit history even when the UI presents them closely together
- Current phase decision:
  - counterparties remain simple free-text names in this phase
- Current phase decision:
  - we are not opening a larger statistics-semantics split beyond the current owned / borrowed-in / loaned-out handling in this phase

## How To Use This File
- Put unresolved design or product choices here
- Move confirmed decisions into:
  - `/Users/bliatun/Documents/Codex/bambu-filament-manager/DEVELOPER_BRIEF.md`
  - `/Users/bliatun/Documents/Codex/bambu-filament-manager/SESSION_STATE.md`
- Move actionable implementation work into:
  - `/Users/bliatun/Documents/Codex/bambu-filament-manager/NEXT_STEPS.md`
  - `/Users/bliatun/Documents/Codex/bambu-filament-manager/UI_POLISH_TODO.md`
