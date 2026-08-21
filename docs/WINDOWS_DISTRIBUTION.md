# Windows Installation And Verification

Official Windows releases are distributed as a per-user x64 MSI for Windows
11. The installer does not require Administrator privileges for the normal
installation path.

## Download

1. Open the [latest release](https://github.com/bliatun-code/Filament-Manager/releases/latest).
2. Download the Windows `.msi` file and `SHA256SUMS-windows.txt` from the same
   release.
3. Keep both files in the same folder while verifying the download.

## Verify the download

Open PowerShell in the download folder and run:

```powershell
$manifest = (Get-Content -LiteralPath .\SHA256SUMS-windows.txt -Raw).Trim()
$expectedHash, $msiName = $manifest -split '\s+', 2
$msiName = $msiName.Trim()
$actualHash = (Get-FileHash -LiteralPath $msiName -Algorithm SHA256).Hash.ToLowerInvariant()

if ($actualHash -ne $expectedHash) {
    throw "The MSI checksum does not match the release manifest."
}

Write-Host "Checksum verified for $msiName"
```

Do not install the file if the command reports a mismatch. Download both files
again from the official release page instead.

The checksum confirms that the downloaded MSI is byte-for-byte identical to
the artifact produced by the release workflow. During that workflow, the MSI
is also opened through Windows Installer and checked for the expected product
name, release version, and x64 package architecture before it can be uploaded.
Version-tag releases are published only after the exact commit has passed the
macOS and Windows CI checks and the MSI, signed macOS DMG, and both platform
checksum manifests have passed their respective verification steps.

Tagged releases also include a validated source dependency SBOM. Public tag
releases include GitHub/Sigstore build provenance for the DMG and MSI. See
[Release Integrity And Supply Chain](SUPPLY_CHAIN.md) for their verification
commands and scope. This provenance does not Authenticode-sign the MSI; Windows
installer signing remains intentionally deferred.

## Automated installer smoke test

Before GitHub release publication, the Windows release job downloads and
exercises the internally uploaded MSI candidate on a clean hosted Windows
runner profile. It exercises the MSI's per-user installation path, which is
configured not to request elevation, launches the installed executable with an
isolated runtime database, waits for a responsive application window, and
verifies that SQLite
`quick_check`, schema compatibility, and the required catalog, inventory, and
settings tables pass. CI then closes the app normally, uninstalls it, and
confirms that the executable, installer registration, shortcuts, and user
`PATH` entry are removed while the isolated database remains healthy and
unchanged. Verbose install, uninstall, application, and smoke-test logs are
retained as a CI artifact for troubleshooting. The MSI is intentionally
unsigned; the smoke test fails unless both the source MSI and installed
executable report the exact Authenticode status `NotSigned`.

## Runtime database safeguards

On startup, an existing database is inspected read-only before schema writes.
The app runs SQLite `quick_check` and verifies that the recorded schema is not
newer than schema v3 supported by this build. A failed integrity or compatibility
check stops startup instead of silently modifying the database.

An existing unversioned, schema-v1, or schema-v2 database receives an
automatically created and verified local recovery snapshot before its schema v3
upgrade. Verified snapshots are also used before a full restore and storage
migrations that replace or merge an existing database. If snapshot creation or
verification fails, the destructive operation does not continue.

## Install

Upgrades keep the active database under the current user's Local application
data. If an older inventory is found under the previous Roaming location, the
app performs a one-time, transactional recovery into Local storage, preserves
the Roaming source, and creates a verified recovery snapshot before replacing
or merging an existing Local database.

After the checksum passes, open the MSI and follow the installer. Filament
Manager is installed for the current user. App data remains in the current
user's application-data directory and is not removed by simply downloading a
new installer.

## Diagnostics and support file

Open **Settings → Program maintenance → Application diagnostics** to review the
app/schema version, SQLite quick and foreign-key checks, journal mode, database
size, and local database path. **Download sanitized support file** creates JSON
for troubleshooting without database contents or the local path. It also omits
names, IP addresses, printer serials, tokens, QR/RFID values, and raw printer
telemetry. The file includes the non-secret build commit, target, and
distribution channel, but not the configured update metadata URL.
