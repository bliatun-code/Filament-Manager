# macOS Login Items Identity — 10 September 2026

Status: **The metadata and icon repair is verified. Local name correction has
been temporary because the older macOS grouping returned, so stable attribution
is still under investigation. Local Rust tests, Clippy, contracts, and dependency
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
API after validating the existing registration and before changing the agent
file. A registration failure leaves the old plist intact for a later retry in
that order. Recognized disabled agents receive the same association repair;
absent agents and other executable paths do not trigger registration.

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

The same thirteen tests also passed in the actual desktop test binary. On the
first candidate (`d57e664e`), the full `npm run test:rust` gate passed: 665 desktop tests, 295 core tests, 15 mDNS
tests, three generator tests, and both dev/release Clippy profiles. Three
existing tests remain ignored. `npm run check:contracts`, Cargo and npm license
checks, and `cargo audit` passed; the audit still reports seven warnings from
unchanged dependencies. The lockfile removes unused plugin dependencies without
upgrading remaining packages. The synthetic AppTranslocation rejection fixture
has a documented exception to the path-portability check.

The locked workspace check with all targets and features also passed on the
supported Rust 1.88 minimum version.

The ordering follow-up extended the same thirteen filesystem tests to cover
registration presence, including disabled agents and ownership refusal. All
thirteen passed again, along with thirteen desktop-lifecycle tests, both Clippy
profiles, Rust 1.88, formatting, and the full contract gate.

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

## Cache Follow-up And Packaged Verification

After local verification, System Settings reverted to the publisher row, now
with the correct icon. The plist remained byte-for-byte identical. BTM still
had the correct agent name and association, but its parent remained the
publisher and the associated app record was missing. Launch Services listed
only the real installed application; no remaining duplicate was observed.
The exact trigger of this cache change was not established.

Registering the real bundle again, reopening the settings page, and a scoped
Launch Services unregister/register did not restore the display. Refreshing
only the owned agent's modification time after bundle registration restored
one Filament Manager row with its icon. Its bytes, permissions, UUID, and OS
approval stayed unchanged; BTM advanced the agent generation. This local
diagnostic repair is separate from the shipped implementation: the app does
not use `lsregister`, touch correct files on every launch, or reset BTM.
The observation motivated registering the app before migrating its agent.

The old grouping later returned without another packaged QA run, so test-copy
registration alone does not explain it. The already-loaded launchd job was
confirmed idle and explicitly enabled. Reloading only that job preserved the
enabled override and the existing application process but did not immediately
correct the grouping. The local `launchctl` diagnostic is not part of the
shipped migration, which never unloads a potentially running application.

A final scoped diagnostic backed up the associated plist, unloaded only the
idle job, temporarily removed that one plist, and restored its identical bytes
and permissions after registering the real app. The same label was bootstrapped
again and its enabled override was verified. The publisher grouping still
remained. A normal launch of the installed application likewise did not resolve
it. A new macOS login remains the next user-controlled verification; it has not
been performed or assumed to succeed. No other background-item preferences or
global caches were reset.

[Apple DTS has described a similar icon-correct/name-stale case](https://developer.apple.com/forums/thread/721902)
with legacy registrations and recommended testing an old-to-new installation
on a clean machine. That older report is not proof of the exact same macOS 27
defect. Correct metadata does not guarantee that every existing OS cache is
immediately repaired.

An optimized arm64 DMG passed local bundle, architecture, and ad-hoc signature
verification. The full local desktop smoke encountered the existing running
production app's single-instance gate and exited before writing its mutation
result; this is not a passing desktop run. A separate copy installed privately
from that DMG passed all six packaged Host/Client phases, including recovery,
session renewal, and credential cleanup. The real agent stayed byte-identical,
and the private test work directory and installed test copy were removed.

This verifies the metadata repair and a packaged Host/Client run. It does not
yet verify migration through an installed app upgrade, next-login execution,
or behavior on other macOS versions. CI remains pending. Private backups,
screenshots, paths, signing identifiers, and raw background-task records are
kept outside the repository.

## Remaining Acceptance Checks

The next local check is a new login initiated by the user after saving their
work. Inspect Background App Activity again for the Filament Manager name and
icon, confirm that the existing approval is preserved, and check that the
normal app still starts as expected. Reopen the settings page later to catch
the temporary correction already observed. A new login is a verification
step, not a guaranteed cache repair.

Separately, verify an old-to-new signed app upgrade on a clean installation.
That must exercise normal startup with an existing legacy agent, both enabled
and disabled, and a user who never enabled launch at login. Packaged diagnostic
runs intentionally skip this migration and cannot substitute for that check.

A final independent source review of `1daaf5de` found no blocking ownership,
ordering, disabled-state, or FFI issues. The public APIs used predate the macOS
11 deployment target; this is not a claim of runtime verification on macOS 11.
