# macOS Login Items Identity — 10 September 2026

Status: **The local metadata repair restored the Filament Manager name and app
icon in System Settings. Local Rust tests, Clippy, contracts, and dependency
checks passed. CI and a packaged app upgrade containing this change remain
pending.**

## Cause

The previous `tauri-plugin-autostart` 2.5.1 / `auto-launch` 0.5.0 integration
wrote a legacy LaunchAgent with `Label`, `ProgramArguments`, and `RunAtLoad`,
but no `AssociatedBundleIdentifiers`. The installed app already contained the
correct bundle identity and icon.

Apple documents that a legacy agent without this association can appear under
the organization in its signing certificate instead of the application name.
The associated executable and app must share a signing team, and Launch
Services must know the app bundle; Apple recommends `LSRegisterURL` when
registration is needed. See
[Updating helper executables from earlier versions of macOS](https://developer.apple.com/documentation/servicemanagement/updating-helper-executables-from-earlier-versions-of-macos).
The inspected agent and the successful local repair matched this explanation.

## Permanent Change

The macOS implementation keeps the existing
`no.bliatun.filamentmanager.plist` filename and label. New registrations include
`AssociatedBundleIdentifiers = ["no.bliatun.filamentmanager"]`, the validated
app executable, `--background`, and `RunAtLoad = true`. Plist serialization
escapes paths correctly, and replacement is staged atomically.

On normal startup, migration repairs only a recognized existing agent for the
same installed executable. It changes only the bundle association, preserving
the executable path, arguments, `RunAtLoad`, `Disabled`, other keys, and file
permissions. An absent registration stays absent, and a second reconciliation
leaves an already-correct file unchanged. Malformed, mismatched, linked, or
nonregular files are rejected. Another app copy cannot repoint the existing
registration. Launch Services is refreshed through the public `LSRegisterURL`
API.

Visual QA, packaged desktop/Host–Client tests, and explicit database overrides
skip automatic migration. Unbundled development executables, mounted DMGs, and
translocated apps also cannot migrate the installed registration. Only an
explicit enable action creates a registration or restores disabled plist
intent. macOS background approval remains controlled by System Settings; this
change never invokes `launchctl` or overrides that approval. Windows behavior
is unchanged.

Implementation:
[agent management](../src-tauri/src/macos_autostart.rs),
[regression tests](../src-tauri/src/macos_autostart_tests.rs),
[Launch Services registration](../src-tauri/src/macos_app_registration.rs), and
[desktop lifecycle integration](../src-tauri/src/desktop_lifecycle.rs).

## Local Verification

Thirteen focused tests passed in a standalone harness using the production
module. They cover creation and XML escaping; absent and repeated migration;
preserved disabled state and explicit re-enabling; scoped deletion; rejected
identity, path, and file types; failed writes; detected concurrent changes;
and non-UTF-8 paths.

The same thirteen tests also passed in the actual desktop test binary. The full
`npm run test:rust` gate then passed: 665 desktop tests, 295 core tests, 15 mDNS
tests, three generator tests, and both dev/release Clippy profiles. Three
existing tests remain ignored. `npm run check:contracts`, Cargo and npm license
checks, and `cargo audit` passed; the audit still reports seven warnings from
unchanged dependencies. The lockfile removes unused plugin dependencies without
upgrading remaining packages. The synthetic AppTranslocation rejection fixture
has a documented exception to the path-portability check.

The locked workspace check with all targets and features also passed on the
supported Rust 1.88 minimum version.

A private helper exercised the actual agent-management and bundle-registration
modules against the existing signed **0.30.0** installation on **macOS 27**.
The original agent was backed up privately before repairing its association.
The helper confirmed that all other plist values stayed identical and that a
second reconciliation made no change. It did not enable the item, replace the
installed application, or publish a release.

After the repair, accessibility inspection and visual review in System Settings
showed one **Filament Manager** entry with the correct application icon and
its switch still on. The previously separate publisher and older app rows
were no longer shown. The legacy background-item UUID and disposition
`0xb` (enabled, allowed, notified) were unchanged; the associated bundle ID was
correct. Internal parent attribution still referred to the signing identity,
which also remains in the app's signature. The repair changes visible app
attribution, not the signing identity.

`codesign --verify --deep --strict` also passed for the installed application
after the metadata repair.

This verifies the metadata repair on an existing installation. It does not
yet verify migration through an installed app upgrade, next-login execution,
or behavior on other macOS versions. CI remains pending. Private backups,
screenshots, paths, signing identifiers, and raw background-task records are
kept outside the repository.
