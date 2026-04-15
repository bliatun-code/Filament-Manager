# Filament Manager v0.10.1

Release date: 2026-04-16

## Highlights
- AMS slot logic is now stricter when live Bambu data shows that a different, unregistered RFID identity has replaced the filament currently assigned to a slot.
- Manual handling of unknown RFID is clearer: users can still override the slot manually, and that override now stays protected while the same unknown identity remains in the slot.
- Manually emptied AMS slots now stay empty until newer MQTT tray data arrives, instead of being visually or logically revived by cached slot identity.

## AMS Slot + RFID Behavior
- unknown live RFID now uses `tray_uuid` as the only RFID identity signal for slot logic
- conservative auto-clear now triggers only when a loaded AMS slot reports a new unknown identity together with a conflicting color signal
- no heuristic auto-match was added based on color, name, or material alone
- `RFID is not registered` is now shown directly in the printer slot UI when AMS reports an unregistered identity
- `RFID overridden` is now shown when the user manually keeps a slot assigned while the same unknown identity remains present

## Manual Clear Behavior
- manually setting an AMS slot to empty now clears the slot assignment and suppresses older cached tray identity for that slot
- stale cached tray identity can no longer rehydrate the slot after a manual clear
- only newer MQTT tray data than the clear timestamp can reactivate slot identity/matching for that slot

## Validation
- `npm run build` PASS
- `cargo test --manifest-path src-tauri/Cargo.toml bambu_live -- --nocapture` PASS
