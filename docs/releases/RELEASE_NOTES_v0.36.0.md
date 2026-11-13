# Filament Manager v0.36.0

- Windows now uses a per-user x64 NSIS installer (`_x64-setup.exe`). It can migrate supported per-user MSI installations while preserving the library and launch-at-login setting. Close Filament Manager from the tray before upgrading.
- Bambu catalogue refresh accepts both 500 g and 1,000 g store variants of PA6-CF, PAHT-CF and PET-CF. It keeps one catalogue entry per colour and preserves registered spool weights.
- eSUN catalogue refresh can use the TigerTag registry when the vendor source is unavailable. The supplemental source adds verified missing variants and preserves existing catalogue entries.
- Statistics stays in place while a new reporting period loads.

The Windows installer is unsigned. The [Windows installation guide](https://github.com/bliatun-code/Filament-Manager/blob/v0.36.0/docs/development/WINDOWS_DISTRIBUTION.md) covers migration and verification.
