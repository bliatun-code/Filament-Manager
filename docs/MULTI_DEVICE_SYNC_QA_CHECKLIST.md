# Multi-Device Sync RC QA Checklist

Last updated: 2026-04-09

This checklist is for the first release-candidate pass of desktop multi-device sync.
One device should be configured as `Host` and one as `Client` against the same `library_id`.

## Test Setup

- Device A: `Host`
- Device B: `Client`
- Both devices on same trusted LAN
- Browser companion status on host noted before starting
- Host library contains:
  - at least 1 printer
  - at least 1 loaded slot
  - at least 3 unassigned spools
  - at least 1 wishlist item
  - at least 1 active outbound loan (if available)

## Role / Linking

1. Set Device A to `Host` and save.
2. On Device B, set role to `Client`.
3. Enter host URL on Device B.
4. Run `Check host`.
5. Confirm host metadata matches expected device and library.
6. Link Device B to host library.
7. Pair desktop client on Device B.
8. Confirm `paired` state and expiry are shown.

Expected:
- no library mismatch after linking
- pairing succeeds once and survives page refresh
- host URL and remote device are shown clearly

## Read Path

### Dashboard
- Open Dashboard on client.
- Confirm host summary loads.
- Confirm `live` state appears.
- Disable host temporarily or stop companion endpoint.
- Confirm `cached` state appears if data was loaded before.

### Inventory
- Open Inventory on client.
- Confirm host spools load.
- Confirm counts and filters behave normally.
- Open a spool detail modal.

### Printers
- Open Printers on client.
- Confirm roster and slots reflect host.
- Confirm assigned spool state matches host.

### Loans
- Open Loans on client.
- Confirm active and returned records load from host.
- Confirm `live / cached / offline` state is honest.

## Write Path

### Inventory writes
- Update spool weight from client.
- Update spool tare weight from client.
- Update spool location from client.
- Toggle lost / restore status from client.

Expected:
- host reflects changes immediately or after refresh
- client refresh shows same final state

### Add spool / wishlist
- Create wishlist item from client.
- Change wishlist status from client.
- Delete wishlist item from client.
- Create owned spool from catalogue from client.
- Create manual spool from client.
- Create borrowed-in spool from client.
- Use `Stock now` from wishlist on client.

Expected:
- new/updated rows exist on host
- created spool opens/selects correctly on client
- wishlist status stays aligned

### Printer admin
- Create printer from client.
- Reconfigure printer from client.
- Delete printer from client.
- Assign spool to printer slot from client.
- Clear or replace slot assignment from client if supported in current UI.

Expected:
- printer roster stays aligned on both devices
- slot state and spool placement stay consistent

### Loan operations
- Create outbound loan from client.
- Return outbound loan from client.
- Hand back borrowed-in spool from client if available.

Expected:
- loan history updates on host and client
- inventory state remains consistent after loan transitions

## Session / Security

- Let desktop pairing expire if practical, or simulate invalid session.
- Run a protected write from client.

Expected:
- client renews session or shows a clear pairing-required message
- no protected write succeeds without valid pairing/csrf session

## Offline / Recovery

1. Load host data on client.
2. Make host unavailable.
3. Reopen Dashboard / Inventory / Printers / Loans on client.

Expected:
- cached state appears with `Updated` timestamp
- no fake `live` status remains visible
- write actions are blocked cleanly while host is unavailable

## Handoff / Migration

1. Export full backup on host.
2. Import backup on client machine.
3. Confirm machine-local trusted-LAN / sync state was not imported.
4. Promote imported machine to `Host`.

Expected:
- library identity remains controlled
- old host-specific browser/session state is not carried across
- new host can be validated and linked by a fresh client

## RC Gate

The sync series is ready for RC commit/push when:

- all read paths pass on two devices
- all protected write paths above pass on two devices
- cached fallback is honest on every synced page
- no machine-local state leaks through backup/import handoff
- pairing state is understandable and recoverable
- remaining non-goals are explicit in release notes
