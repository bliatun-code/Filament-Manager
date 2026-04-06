# Filament Manager v0.1.2

Release date: 2026-04-06

## Highlights
- Added app version visibility in `Settings -> General` for easier support and release verification.
- Improved Trusted-LAN `Browser access` layout for better flow and density:
  - server status/network summary and server controls are now grouped as one cohesive section
  - pairing action is moved below browser label input
  - redundant helper copy removed
- Companion state now persists more reliably, and dashboard includes a companion status indicator shortcut.
- Fixed wishlist row removal in add-flow.
- Polished Norwegian wording consistency for dashboard and Trusted-LAN status copy.

## Stability / Preflight
- Working tree clean before release prep.
- `cargo check` passes on release baseline.

## Notes
- Trusted-LAN access remains opt-in and desktop-controlled.
- Traffic on home LAN remains unencrypted by design; pairing still protects access.
