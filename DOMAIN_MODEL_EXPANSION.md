# Domain Model Expansion

## Purpose
Extend the current model so the app can support both:
- lending our filament out to others
- borrowing someone else’s filament into our inventory

This document now reflects the refined phase-1 model, not just open-ended suggestions.

## Core Domain Decision
- Keep the physical filament unit (`filament_spools`) as the source-of-truth entity
- Treat ownership, operational status, and loan lifecycle as separate concerns
- Keep loan records (`spool_loans`) independent from the physical spool so history stays auditable

## Terminology

### Ownership
- `OWNED`
  - the spool belongs to us
- `BORROWED_IN`
  - the spool belongs to someone else but is physically in our inventory

### Loan Direction
- `OUTBOUND`
  - we loan our spool to someone else
- `INBOUND`
  - we borrow someone else’s spool into our inventory

### Loan Status
- `ACTIVE`
- `RETURNED`
- `LOST`
- `CANCELLED`

### Important Compatibility Note
- The current app still stores spool status `BORROWED` for existing outbound-loan flows
- In domain language, that status really means `loaned out`
- Borrowed-in support should not reuse spool status `BORROWED`
- Borrowed-in spool ownership is represented by `ownership_type = BORROWED_IN`

## Refined Entity Model

### Physical filament unit
`filament_spools` should represent:
- one physical spool
- its catalog identity
- its operational status
- its remaining/current weight
- its physical location or printer assignment
- its ownership metadata

Phase-1 additive fields:
- `ownership_type`
- `owner_name`
- `owner_contact`
- `ownership_note`

Notes:
- owned spools default to `ownership_type = OWNED`
- borrowed-in spools will later use `BORROWED_IN`
- owner metadata belongs on the spool because ownership persists even if multiple loan events happen over time

### Loan record
`spool_loans` should represent:
- a single borrowing/lending agreement tied to a spool
- the direction of that agreement
- the counterparty
- the handoff/return weights
- the lifecycle state of that agreement

Phase-1 additive fields:
- `loan_direction`
- `loan_status`
- `counterparty_name`
- `counterparty_contact`
- `counterparty_note`

Compatibility note:
- `borrower_name` remains for current outbound UI and legacy data compatibility
- phase-1 backfills `counterparty_name` from `borrower_name`
- current app queries that power the existing `Utlån` UI remain outbound-only on purpose

## Database / Model Shape

### Spools
Recommended shape now in code:
- `status`
- `ownership_type`
- `owner_name`
- `owner_contact`
- `ownership_note`

Interpretation:
- status answers “what is happening operationally?”
- ownership answers “who owns this spool?”

Examples:
- owned spool sitting on shelf:
  - `status = IN_STOCK`
  - `ownership_type = OWNED`
- owned spool mounted in printer:
  - `status = IN_USE`
  - `ownership_type = OWNED`
- owned spool loaned to someone else:
  - `status = BORROWED` for current compatibility
  - domain meaning: `loaned out`
  - `ownership_type = OWNED`
- borrowed-in spool on our shelf:
  - `status = IN_STOCK`
  - `ownership_type = BORROWED_IN`
- borrowed-in spool in our printer:
  - `status = IN_USE`
  - `ownership_type = BORROWED_IN`

### Loans
Recommended shape now in code:
- `loan_direction`
- `loan_status`
- `counterparty_name`
- `counterparty_contact`
- `counterparty_note`
- `grams_out`
- `returned_grams`
- `consumed_grams`

Interpretation:
- `grams_out`
  - grams at handoff/start of the loan record
- `returned_grams`
  - grams at return/end of the loan record
- `consumed_grams`
  - difference consumed while the spool was away from its owner

## Implications By Area

### Inventory
- Inventory needs an ownership-aware filter, not just a single mixed spool list
- Borrowed-in spools should be visible beside owned stock, but clearly labeled
- Future top-line inventory summaries should split:
  - all physical spools on hand
  - owned spools on hand
  - borrowed-in spools on hand
  - owned spools currently loaned out
- The current “Borrowed rolls” wording in parts of the UI is legacy outbound-loan wording and should later become “Loaned out”

### Loans
- The current loans page and helpers remain outbound-only in phase 1
- Future loans UI should either:
  - show outbound and inbound sections separately
  - or use an explicit direction filter with direction-aware labels
- Language should become direction-aware:
  - outbound: `Loaned to`
  - inbound: `Borrowed from`
- Return flow logic can stay structurally similar for both directions, but wording must change with direction

### Statistics
- Current borrower/loan-consumption statistics remain outbound-only in phase 1
- Future statistics should separate at least these concepts:
  - print usage from owned spools
  - print usage from borrowed-in spools
  - outbound loan consumption by borrower
  - inbound borrowed-spool consumption before return
- Dashboard and low-stock summaries need ownership-aware decisions before borrowed-in UI is exposed broadly

### Printer Assignment
- Borrowed-in filament should be assignable to printer slots
- Ownership must not block normal printer workflows
- Printer assignment is operational placement only
- The only spool class that should remain unavailable for printer assignment is outbound-loaned material that is not physically present
- A future optional warning for borrowed-in use is okay, but it should not be a hard rule by default

## Safe Phase-1 Groundwork

Completed/appropriate groundwork:
- add ownership metadata to spool records
- add direction/status/counterparty metadata to loan records
- backfill existing rows safely
- keep current outbound loan queries outbound-only so the current UI semantics do not silently change
- keep the current status vocabulary compatible until a broader UI pass is ready

Not included in phase 1:
- dedicated borrowed-in creation/edit UI beyond the existing add-flow
- ownership-specific reinterpretation of headline dashboard/statistics totals
- printer warnings for borrowed-in use
- contact/address book normalization

## Current Implemented UI Slice

Implemented after the groundwork:
- the existing add-filament flow can now register a spool as `BORROWED_IN`
- that registration also creates an active inbound loan row automatically
- inventory cards/list and the selected-spool popup now label borrowed-in ownership
- borrowed-in spools are excluded from outbound loan-out candidates
- `Lager` now has an ownership-aware filter for `All / Owned / Borrowed in`
- the `Utlan` page can now request inbound/outbound/all loan directions explicitly
- active inbound rows can be handed back from the direction-aware loans UI
- handing back a borrowed-in spool soft-deletes it from active inventory while keeping loan/history records
- `inventory_overview` now exposes additive ownership-aware summary metrics
- `Dashboard` and `Statistikk` now show dedicated ownership snapshot panels without changing the older headline totals
- `Statistikk` filament-consumption breakdowns now keep owned and borrowed-in rows separate and surface the borrowed-in owner name
- `Statistikk` active-slot details now filter and label owned vs borrowed-in printer assignments
- `Statistikk` now shows separate outbound borrower usage and inbound owner/counterparty usage panels
- loan-usage filament breakdowns now work for both outbound borrowers and inbound owners with direction-aware wording

Still intentionally deferred:
- a product-level decision on whether headline totals should remain combined or become ownership-specific
- direction-aware usage summaries on the `Utlan` page itself

## Recommended Next Phase
- Add explicit borrowed-in creation flow
- Add any follow-up selected-spool ownership editing
- Add ownership-aware statistics definitions before changing dashboard totals
- Rename legacy outward-facing `borrowed` wording to `loaned out` where appropriate
