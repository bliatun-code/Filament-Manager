# macOS Installation And Verification

Official Filament Manager releases for macOS are distributed as one Universal
2 DMG for macOS 11 Big Sur or newer. Its application executable contains native
`arm64` and `x86_64` code for Apple Silicon and Intel Macs. The app and DMG are
signed with Apple Developer ID, notarized by Apple, and shipped with a stapled
notarization ticket.

## Install

1. Download the macOS DMG and `SHA256SUMS.txt` from the
   [latest GitHub release](https://github.com/bliatun-code/Filament-Manager/releases/latest).
2. Open the DMG and drag **Filament Manager** to **Applications**.
3. Open Filament Manager from Applications.
4. Allow Camera or Local Network access only when you use a feature that needs
   it, such as webcam scanning, Bambu Live, or Companion.

## Verify The Download

Keep the DMG and `SHA256SUMS.txt` in the same folder, then run:

```bash
cd ~/Downloads
shasum -a 256 -c SHA256SUMS.txt
```

The command must report `OK` for the DMG before installation. After copying the
app to Applications, macOS can also verify the signature and Gatekeeper status:

```bash
codesign --verify --deep --strict --verbose=2 "/Applications/Filament Manager.app"
spctl --assess --type execute --verbose=2 "/Applications/Filament Manager.app"
```

These checks supplement normal Gatekeeper behavior; users do not need them for
every installation.

Before a release DMG can be published on GitHub, the release workflow requires
the executable to contain exactly `arm64` and `x86_64`. It downloads the same
checksummed candidate on native Apple Silicon and Intel runners, mounts it,
copies its app to an isolated test installation without clearing quarantine
metadata, opens the installed copy through LaunchServices with an isolated
runtime database, and verifies SQLite integrity, schema compatibility, required
tables, foreign keys, and a visible application window on both architectures.

Tagged releases also include a validated source dependency SBOM. Public tag
releases include GitHub/Sigstore build provenance for the DMG and MSI. See
[Release Integrity And Supply Chain](SUPPLY_CHAIN.md) for their verification
commands and scope.

## Troubleshooting

An official signed and notarized release should open without removing
quarantine metadata or weakening Gatekeeper. If it does not:

- confirm that the checksum matches;
- confirm that the Apple Silicon or Intel Mac runs macOS 11 or newer;
- download the DMG again from the official release page;
- report the app version, macOS version, Mac architecture, and the exact error.

Before attaching logs or screenshots, remove private LAN addresses, printer
serials, access codes, pairing links, RFID values, names, and inventory data.
Security-sensitive reports should follow [the security policy](../SECURITY.md).
The sanitized support file available under **Settings → Program maintenance**
includes the non-secret build commit, target, and distribution channel, but not
the configured update metadata URL.
