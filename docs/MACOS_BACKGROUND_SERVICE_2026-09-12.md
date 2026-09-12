# macOS Background Service Follow-up — 12 September 2026

Status: **Implementation and local verification are in progress. No new release
has been published, and the installed app has not yet been replaced.**

## Why This Follow-up Is Needed

[PR #111](https://github.com/bliatun-code/Filament-Manager/pull/111) repaired the
legacy LaunchAgent's bundle association and icon. All eleven checks passed, but
the publisher name remained after a real system restart. The
[earlier evidence record](MACOS_AUTOSTART_IDENTITY_2026-09-10.md) separates that
display problem from the passing packaged regression tests.

On macOS 13 and newer, use Apple's
[SMAppService agent API](https://developer.apple.com/documentation/servicemanagement/smappservice/agent%28plistname%3A%29?language=objc)
to register an agent embedded in the application. macOS 11/12 retain the legacy
backend. An API-loading failure on a newer OS is an error, not permission to
fall back to a different registration method.

## Implementation

The bundled agent has label `no.bliatun.filamentmanager.background` and runs
`Contents/MacOS/filament-manager-login-helper` once at login. The separate
launcher opens its exact containing app with `--background`, then exits.
It first checks for an existing main process at the same app/executable URL,
so it does not send a reopen event to an already running application.

The separate process matters because
[unregistering a running agent terminates that process](https://developer.apple.com/documentation/servicemanagement/smappservice/unregister%28%29?language=objc).
Disabling autostart must not terminate Filament Manager. Native removal waits
for its asynchronous completion on a worker thread; status inspection also
runs outside the UI event loop.

The helper is an `externalBin`, which Tauri signs before the containing app.
The agent plist is copied into `Contents/Library/LaunchAgents` before signing.
The helper is built for each Cargo target, combined for Universal 2 bundles,
and checked independently for architecture, macOS 11 deployment target, stable
signing identifier, hardened runtime, and matching release signing team.
No generated executable is committed.

## Existing Preferences And Recovery

Automatic migration requires an unchanged, owned, stock legacy plist with
launch-at-login enabled. Both Service Management approval and the persistent
launchctl override must allow it. Missing, disabled, customized, unsafe,
foreign, and uninspectable registrations do not authorize a new service.

After registering the modern helper, remove only the previously inspected
legacy plist. Do not unload the old running main process. Its old RunAtLoad-only
job can remain loaded until logout; removing the file prevents its next-login
registration. The different service label avoids a loaded-job collision.
The old Settings history may remain visible during this transition.

`RequiresApproval` remains disabled until the user changes macOS permission.
Neither retry nor helper refresh bypasses this state or a persistent launchctl
disable. Changed or newly denied legacy state during migration triggers rollback
of the new helper and preserves the old file.

An app-scoped record binds the registered service to the exact app executable
and helper/plist fingerprint. Pending migration, refresh, and disable intent
is flushed before OS mutations and recovered after interruption. A second app
copy cannot silently repoint the existing service. An unchanged fingerprint
does not re-register on every launch.

Visual QA, packaged diagnostics, explicit database overrides, unbundled builds,
mounted disk images, and translocated copies retain their existing migration
exclusions. Native registration tests must be separate from database smoke tests.

## Verification Still Required

The local focused Rust tests and helper build/signing tests pass. Integrated
Rust checks, the actual signed app bundle, and CI are being completed.

Before claiming the visible issue fixed, verify the signed installed candidate:
enabled legacy transition; disabled/absent preference preservation; main app
survival when autostart is disabled; no reopening of an existing hidden window;
correct app identity in System Settings; and behavior at the next real login.
Apple's API establishes explicit app association but does not promise to erase
every stale publisher-history row. No global background-task reset is used.
