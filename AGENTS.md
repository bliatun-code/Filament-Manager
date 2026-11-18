# Working on Filament Manager

Start in the repository root. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup,
moved checkouts, the isolated development database, verification and PRs.
Use the maintained guides under `docs/development/` for current contracts.
`docs/internal/` holds local working notes and historical plans.

| Change | Code and constraints |
| --- | --- |
| Storage and startup | `src/backend/` owns the shared Rust and SQLite core. `src-tauri/src/` owns native startup and platform storage. Read the [architecture](docs/development/ARCHITECTURE.md) before moving modules. Append schema changes using the [migration procedure](docs/development/DATABASE_MIGRATIONS.md). |
| Host, Client and Companion | Scope Client caches to the exact Host, library ID and target generation. Send Client writes only to the paired Host. Surface uncertain writes without replaying them. Preserve browser session and CSRF checks. The [resilience gates](docs/development/QUALITY_GATES.md#hostclient-resilience-authority) exercise these boundaries. |
| Printers and scanning | Preserve deliberate slot assignments and RFID identities when Bambu Live or AMS provides a weak match. Keep keyboard entry available alongside the [camera and batch workflow](docs/CAMERA_AND_BATCH_SCANNING.md). |
| Desktop and browser UI | Desktop React lives in `ui/src/`. Browser Companion lives in `src-tauri/companion_browser/`. Check desktop modal sizing and mobile Companion behavior for the affected workflow. Follow the [localization workflow](docs/development/LOCALIZATION.md) when changing copy. |
