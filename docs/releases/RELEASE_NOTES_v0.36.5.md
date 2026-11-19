# Filament Manager v0.36.5

- Paired clients now keep a complete inventory list when another device changes stock during sync. If changes continue, the client keeps the last complete copy for offline use.
- Opening Inventory on a paired client transfers less data. The app now gets the last-sync time directly when it saves the inventory.
- The dashboard generates purchase suggestions faster in large libraries. Low-stock counts and the lowest remaining weight now agree with Inventory when a spool has no recorded remaining weight.
- A paired client now recognizes a saved empty inventory, including when the host is offline. An older empty list no longer clears newer stock totals.

[Download for macOS](https://github.com/bliatun-code/Filament-Manager/releases/download/v0.36.5/Filament-Manager_0.36.5_universal.dmg) · [Download for Windows x64](https://github.com/bliatun-code/Filament-Manager/releases/download/v0.36.5/Filament-Manager_0.36.5_x64-setup.exe)

[Windows installation guide](https://github.com/bliatun-code/Filament-Manager/blob/v0.36.5/docs/development/WINDOWS_DISTRIBUTION.md) · [All changes since v0.36.4](https://github.com/bliatun-code/Filament-Manager/compare/v0.36.4...v0.36.5)
