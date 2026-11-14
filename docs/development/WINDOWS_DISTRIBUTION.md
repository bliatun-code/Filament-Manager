# Windows Installation And Verification

Filament Manager v0.36.0 and later use a per-user x64 setup EXE for Windows 11.
Run the installer as your normal Windows user. The normal installation path
requires no Administrator privileges.

## Download

1. Open the [latest release](https://github.com/bliatun-code/Filament-Manager/releases/latest).
2. Download the Windows `*_x64-setup.exe` file and `SHA256SUMS-windows.txt` from
   the same release. Releases through v0.35.1 use a Windows `.msi` file.
3. Keep the installer and checksum file together.

## Verify the download

Open PowerShell in the download folder and run:

```powershell
$manifest = (Get-Content -LiteralPath .\SHA256SUMS-windows.txt -Raw).Trim()
if ($manifest -notmatch '\A([0-9a-fA-F]{64})[ \t]+\*?(Filament-Manager_[^/\\\r\n]+\.(?:exe|msi))\z') {
    throw "The Windows checksum manifest is invalid."
}
$expectedHash = $Matches[1]
$installerName = $Matches[2]
$actualHash = (Get-FileHash -LiteralPath $installerName -Algorithm SHA256 -ErrorAction Stop).Hash

if ($actualHash -ne $expectedHash) {
    throw "The installer checksum does not match the release manifest."
}

Write-Host "Checksum verified for $installerName"
```

If the command reports a mismatch, download both files again from the
official release page before installing.

The checksum confirms that the installer matches the release artifact.
Public tag releases also include GitHub/Sigstore build provenance for both
desktop installers and a validated source dependency SBOM. See
[Release Integrity And Supply Chain](SUPPLY_CHAIN.md) for verification
commands. The Windows installer and application are unsigned.

## Install or upgrade

Exit Filament Manager from its tray menu before running setup. The NSIS
installer can migrate the published per-user x64 MSI versions v0.33.0
through v0.35.1. Use the same destination as the previous installation if
it is a custom directory under your current Windows user profile.

For other MSI installations or a location outside your user profile, exit
the app, uninstall it through Windows Settings, then install the setup EXE
in its normal per-user location. Keep the library directory
`%LOCALAPPDATA%\no.bliatun.filamentmanager` in place.

If a migration was interrupted and the program files remain without a
Windows Settings entry, rename the program's installation folder and run
setup again.

Migration preserves the launch-at-login choice. The MSI uninstaller removes
the program directory it added to the user `PATH`. NSIS creates a Start Menu
shortcut and offers a desktop shortcut. Ordinary NSIS uninstall removes the
program and its launch-at-login entries and retains the library.

## Automated installer smoke test

Ordinary `Windows Smoke` builds a debug NSIS installer with the per-user
template used by releases. It verifies the installer and x64 payload, checks
the installer hash before execution, and exercises a clean install, the
packaged desktop and Host/Client flows, and uninstall.

Before publication, CI verifies the NSIS bootstrap, x64 application payload,
product name, version and unsigned status. It checks that the downloaded
installer and payload match the verified build. On a clean hosted Windows
profile, it checks the per-user install, application launch, fresh database,
historical database upgrade, Host/Client, persistence, portable backup and
uninstall. A separate migration gate exercises the upgrade from the
published v0.35.1 MSI. The published-NSIS gate verifies the v0.36.1 checksum
and build provenance before installing that exact release on its own runner.
It opens a synthetic library in v0.36.1, upgrades interactively in place, and
checks that the new app opens the same data, the launch-at-login choice survives,
the older installer cannot replace the candidate, and uninstall retains the
library.

The installed desktop and Host/Client tests verify that a catalog batch
replayed after restart returns the same rolls without duplicate loans or
history. The tests use isolated databases and keep private files out of
uploaded diagnostic logs.

## Runtime database safeguards

On startup, an existing database is inspected read-only before schema writes.
The app runs SQLite `quick_check` and verifies that the recorded schema is not
newer than schema v7 supported by this build. A failed integrity or compatibility
check stops startup instead of silently modifying the database.

An existing supported database older than schema v7
receives an automatically created and verified local recovery snapshot before
its schema v7 upgrade. Verified snapshots are also used before a full restore
and storage migrations that replace or merge an existing database. If snapshot
creation or verification fails, the destructive operation does not continue.

If an older inventory is found under the previous Roaming location, the
app performs a one-time, transactional recovery into Local storage. It
preserves the Roaming source and creates a verified recovery snapshot
before replacing or merging an existing Local database.

## Diagnostics and support file

Open **Settings → Program maintenance → Application diagnostics** to review the
app/schema version, SQLite quick and foreign-key checks, journal mode, database
size, and local database path. **Download sanitized support file** creates JSON
for troubleshooting without database contents or the local path. It also omits
names, IP addresses, printer serials, tokens, QR/RFID values, and raw printer
telemetry. The file includes the non-secret build commit, target, and
distribution channel, but not the configured update metadata URL.

## NSIS release rehearsal

Run **Windows NSIS release rehearsal** on `main` in GitHub Actions to build
and test a per-user x64 release candidate. The workflow downloads the checked
candidate by digest and uses it for the installed-app, MSI migration and
published NSIS upgrade gates. While the repository version still matches the
published NSIS baseline, the rehearsal candidate uses the next patch version
with `-rc.1` in a temporary build config. Use the rehearsal to exercise the
upgrade from v0.36.1 while manual release builds on main still build v0.36.1. The rehearsal uploads workflow artifacts for testing.
