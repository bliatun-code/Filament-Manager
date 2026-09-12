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
It also runs the mutating packaged desktop gate against a separate private
database: create and update a spool, complete a loan and return, create a
printer and slot assignment, restart the installed app against the same
database, and validate both persisted state and a complete portable backup.
The gate also registers two borrowed rolls from the same catalog entry in one
atomic batch. After restart it submits the original request again and requires
the same ordered roll IDs, with no extra rolls, loans, history, or revisions.
The database must contain the current batch receipt table with its actual
constraints; the portable backup must omit that installation-local journal.
The private database is removed after the gate and is never uploaded with the
diagnostic logs.

Tagged releases also include a validated source dependency SBOM. Public tag
releases include GitHub/Sigstore build provenance for the DMG and MSI. See
[Release Integrity And Supply Chain](SUPPLY_CHAIN.md) for their verification
commands and scope.

## Login Items And Background Activity

**Launch at login** is optional. When enabled in Filament Manager, it starts
the app in the background after login. On recent macOS versions, System
Settings → General → Login Items identifies the related background activity.
Older registrations may still show the publisher's name. macOS controls permission to run in
the background; the app's launch preference does not override that permission.

Older registrations could show the publisher's name and a generic icon even
though the installed application already had the correct icon. The
registration lacked the bundle association that macOS uses to identify the
app. This fallback is described in
[Apple's Login Items documentation](https://developer.apple.com/documentation/servicemanagement/updating-helper-executables-from-earlier-versions-of-macos).
The publisher's signing identity remains part of the app's valid signature.

This source version uses an app-embedded Service Management launcher on macOS
13 and newer; macOS 11/12 retain the associated legacy LaunchAgent. Automatic
transition requires an owned, stock registration that both the app preference
and macOS permit. Missing, disabled, or customized registrations do not silently
opt in. Disabling the modern launcher leaves the main application running.

The association repair fixed the icon of the installed 0.30.0 app, but its old
publisher grouping remained after restart. The modern implementation has not
yet been verified through a signed installed upgrade or published in a release.
Existing Settings history may remain until after the old login session ends;
no system-wide cache reset is required or performed. See the
[follow-up verification record](MACOS_BACKGROUND_SERVICE_2026-09-12.md) for
current evidence and outstanding checks.

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
