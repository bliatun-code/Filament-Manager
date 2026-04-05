# Step 3 Trusted LAN Plan

Superseded note:
- This plan was written while localhost companion support was still an active requirement.
- The current product direction has retired the localhost browser-companion surface.
- The security model and trusted-LAN constraints below still describe the intended Step 3 bar.

## Goal
- Add optional browser access from other devices on the same trusted LAN without changing the desktop-owned source-of-truth model.
- Keep the desktop app plus SQLite as the only source of truth.
- Keep browser access explicit, desktop-controlled, and trusted-LAN-only.

## Security Bar
- Step 3 is `appropriate security for a trusted LAN`.
- Step 3 secures access, not traffic.
- Plain HTTP is acceptable for Step 3 only if the UI and docs say this clearly:
  - trusted LAN only
  - traffic is not encrypted
- Step 3 should not be described as transport-secure or confidential on the network.

## Preserve This Baseline
- The browser workflow surface stays frozen during Step 3.
- Human browser auth stays separate from any future hardware/device-ingestion auth/routes.

## Core Requirements
- LAN mode is default-off and desktop-controlled.
- LAN mode is not just a bind-address change.
- UI and API stay same-origin for each mode.
- No wildcard CORS.
- Exact `Host` and `Origin` validation remain mandatory.
- `HttpOnly` cookies remain mandatory.
- CSRF remains mandatory for mutating routes.
- LAN browsers use per-browser approval/pairing and revocable paired-browser records.

## Recommended LAN Auth Model
- Remote browser opens the LAN `/companion` URL.
- If unpaired, it sees a pairing gate only.
- Desktop Settings generates a short-lived, single-use pairing link or QR for a human browser.
- Successful pairing creates:
  - a paired-browser record stored in desktop-owned data
  - a short-lived `HttpOnly` session cookie
  - a CSRF token for writes
  - a longer-lived `HttpOnly` device cookie for session renewal on that paired browser
- Revocation kills both future renewals and current sessions for that paired browser.

## Recommended Runtime Model
- Trusted LAN:
  - disabled by default
  - bound to one explicitly selected private interface/address and port
  - not automatically opened on all interfaces in the first release

## Desktop Settings UX
- Use a dedicated `Trusted LAN companion` section.
- Show:
  - enabled/disabled state
  - selected interface/address and port
  - exact LAN URL
  - blunt warning that traffic is not encrypted
  - pair-browser action
  - paired-browser list
  - revoke / revoke-all actions

## Likely File Areas
- Runtime/status/config:
  - `src-tauri/src/state.rs`
  - `src-tauri/src/main.rs`
- Companion server and auth split:
  - `src-tauri/src/companion_api.rs`
  - likely new Step 3 modules for LAN auth/pairing/session handling
- Desktop Settings UX:
  - `ui/src/pages/settings.tsx`
  - `ui/src/pages/settings_companion_model.ts`
  - `ui/src/lib/tauri_client.ts`
  - `ui/src/lib/i18n.ts`
- Browser pairing/session UX:
  - `src-tauri/companion_browser/app.js`
  - `src-tauri/companion_browser/companion_api_client.js`
  - `src-tauri/companion_browser/companion_data_controller.js`
  - `src-tauri/companion_browser/session_state.js`
  - `src-tauri/companion_browser/settings_shell.js`

## File-by-File Checklist
- `src-tauri/src/state.rs`
  - split localhost and trusted-LAN runtime state instead of treating companion status as one mode
  - expose separate local/LAN URLs, reachability, auth mode labels, and paired-browser counts in the runtime snapshot
- `src-tauri/src/main.rs`
  - add desktop commands for trusted-LAN status/config reads and LAN-specific actions such as pair-browser creation and revoke flows
- `src-tauri/src/companion_api.rs`
  - preserve exact `Host` / `Origin` checks for the trusted-LAN path
- `src-tauri/src/companion_api.rs` plus likely new Step 3 Rust modules
  - move LAN pairing, paired-browser storage, LAN session renewal, and revocation logic into focused modules instead of growing one file further
  - keep human browser auth separate from any later device-ingestion modules/routes
- `ui/src/lib/tauri_client.ts`
  - add types and invoke wrappers for trusted-LAN status, configuration, pairing creation, paired-browser listing, and revocation
- `ui/src/pages/settings_companion_model.ts`
  - keep the view model focused on trusted-LAN status/actions only
- `ui/src/pages/settings.tsx`
  - add the trusted-LAN enable/disable surface
  - add interface/address selection, LAN URL/status display, pair-browser actions, and paired-browser revoke controls
  - surface the blunt warning that trusted-LAN traffic is not encrypted
- `ui/src/lib/i18n.ts`
  - add trusted-LAN copy for warnings, pairing, revocation, LAN status, and device-list labels in both English and Norwegian
- `src-tauri/companion_browser/app.js`
  - keep a clean LAN entry path that can land on a pairing gate instead of assuming a local bootstrap token
- `src-tauri/companion_browser/companion_api_client.js`
  - add LAN session renew/logout behavior based on LAN-specific cookies instead of a JS-stored reusable bootstrap secret
- `src-tauri/companion_browser/companion_data_controller.js`
  - add LAN pairing-complete and revoked-session transitions without widening the operational workflow
- `src-tauri/companion_browser/session_state.js`
  - track whether the browser is in pairing-gate mode or authenticated LAN mode
- `src-tauri/companion_browser/settings_shell.js`
  - add trusted-LAN explanatory state only where needed; do not turn the browser shell into a desktop settings clone

## Implementation Order
1. Freeze docs and threat model.
2. Split localhost vs LAN runtime state and status reporting.
3. Add desktop Settings UX and LAN bind/interface controls.
4. Add LAN listener with disabled-state rejection and exact host/origin rules.
5. Add one-time pairing, paired-browser records, session renewal, and revocation.
6. Add browser-side pairing gate and recovery UX for LAN browsers.
7. Add focused Rust/browser tests.
8. Re-run trusted-LAN regression coverage before considering rollout.

## Test Gates
- Keep these green throughout Step 3:
  - `npm run smoke`
- Add new coverage for:
  - LAN disabled rejection
  - interface binding rules
  - pairing expiry and single use
  - paired-browser revocation
  - session renewal
  - exact `Host` / `Origin` enforcement

## Out of Scope
- TLS/certificate setup for the first Step 3 release
- cloud sync
- multi-user accounts
- direct browser-to-SQLite access
- broader browser workflow expansion
- device-ingestion auth/routes

## Open Questions
- Should the first LAN release allow only explicit interface/IP selection, or also an advanced all-interfaces mode?
- Should the first pairing UX be:
  - URL + QR only
  - URL + QR + short manual code fallback
- Where should paired-browser records live exactly:
  - SQLite tables
  - or another desktop-owned store
