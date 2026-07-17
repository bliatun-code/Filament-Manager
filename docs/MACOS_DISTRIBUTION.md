# macOS Installation And Verification

Official Filament Manager releases for macOS are distributed as an Apple
Silicon (`arm64`) DMG for macOS 11 Big Sur or newer. The app and DMG are signed
with Apple Developer ID, notarized by Apple, and shipped with a stapled
notarization ticket.

## Install

1. Download the macOS DMG and `SHA256SUMS.txt` from the
   [latest GitHub release](https://github.com/bliatun-code/Filament-Manager/releases/latest).
2. Open the DMG and drag **Filament Manager** to **Applications**.
3. Open Filament Manager from Applications.
4. Allow Camera or Local Network access only when you use a feature that needs
   it, such as webcam scanning, Bambu Live, or Companion.

The current DMG is not an Intel or universal build. Intel Macs are not part of
the published compatibility contract.

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

## Troubleshooting

An official signed and notarized release should open without removing
quarantine metadata or weakening Gatekeeper. If it does not:

- confirm that the checksum matches;
- confirm that the Mac is Apple Silicon and runs macOS 11 or newer;
- download the DMG again from the official release page;
- report the app version, macOS version, Mac architecture, and the exact error.

Before attaching logs or screenshots, remove private LAN addresses, printer
serials, access codes, pairing links, RFID values, names, and inventory data.
Security-sensitive reports should follow [the security policy](../SECURITY.md).
