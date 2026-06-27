# Filament Manager v0.18.0

Release date: 2026-06-27

## Highlights

- Fixed the installed macOS DMG path for Bambu Live printer communication by shipping the Local Network usage description and the required app sandbox network entitlements.
- Hardened local macOS release builds so `npm run tauri -- build --bundles dmg` ad-hoc signs the app and applies entitlements without blocking future Developer ID signing.
- Made Bambu Live MQTT connection attempts more robust by trying every resolved printer address before failing, with clearer diagnostics for macOS Local Network blocks.
- Cleaned up the renamed app/database environment override: `FILAMENT_MANAGER_DB_PATH` is now primary, while `BAMBU_DB_PATH` remains a legacy alias.
- Refreshed compatible Node and Rust dependency lockfiles.

## Included Since v0.17.0

- Add macOS Local Network usage copy to the app bundle.
- Add macOS network client/server entitlements for Bambu Live and companion LAN behavior.
- Avoid stale Bambu Live connection errors after MQTT reconnects.
- Show clearer Bambu Live diagnostics and live MQTT status tone in settings/printer UI.
- Try all resolved printer MQTT addresses before reporting connection failure.
- Move local ad-hoc macOS signing out of `tauri.conf.json` and into the tested Tauri wrapper.
- Add wrapper tests for ad-hoc signing, certificate signing, explicit Tauri config, and `--no-sign`.
- Prefer `FILAMENT_MANAGER_DB_PATH` for app/scraper DB overrides, with `BAMBU_DB_PATH` retained as a fallback.
- Refresh compatible `Cargo.lock` and `ui/package-lock.json` dependency versions.

## Notes For Testers

- If a previous installed macOS build could not reach a reachable Bambu printer, install this DMG into `Applications`, allow Filament Manager in `System Settings -> Privacy & Security -> Local Network`, then restart the app.
- macOS builds are still ad-hoc signed and not notarized unless built with an external signing identity.
- Windows MSI artifacts are produced by GitHub Actions and can take around 20 minutes to finish.

## Validation

- `npm run verify` PASS
- `npm audit --audit-level=moderate` PASS
- `npm --prefix ./ui audit --audit-level=moderate` PASS
- `cargo audit --file Cargo.lock` reviewed; remaining advisories are known transitive Tauri/wry GTK/WebKit warnings.
- `git diff --check` PASS
