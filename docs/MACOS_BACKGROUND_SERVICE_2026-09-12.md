# macOS Background Service Follow-up — 12 September 2026

Status: **The signed local upgrade and background-start tests pass. Local
automated checks and the final signed build pass. CI, the final installed
approval-message check and a real next login remain pending. No new release
is published.**

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

A never-seen service can report `NotFound` before its first registration, as
[Apple DTS explains](https://developer.apple.com/forums/thread/719862).
Treat that state as an initial installation only after validating the bundled
helper and plist; it does not itself authorize migration or override an OS
denial. An owned pending migration can resume before the first native call.
An unexplained established `NotFound` record never triggers automatic opt-in.

An isolated signed native probe also confirmed that unregistering a never-seen
service can return `EPERM` while its status stays `NotFound`. This is not treated
as successful removal: pending opt-out intent is retained. A later explicit
enable can supersede that intent after ownership, permission and resource checks,
so a failed initial removal cannot permanently block a new explicit opt-in.

Visual QA, packaged diagnostics, explicit database overrides, unbundled builds,
mounted disk images, and translocated copies retain their existing migration
exclusions. Native registration tests must be separate from database smoke tests.

## Signed Installed Verification

The installed 0.30.0 app and its legacy plist were backed up before replacement.
The local candidate is Developer ID signed, arm64, and has matching main/helper
signing teams, hardened runtime, macOS 11 deployment targets and the exact
embedded agent plist. This is a local signed-app check, not a notarized release.

Observed on macOS 27.0 with candidate `cfe688f8`:

| Check | Result |
| --- | --- |
| Enabled stock legacy upgrade | The modern helper registered, exited successfully, and retired only the owned legacy plist. The migration record has no pending flags. |
| System Settings identity | **Filament Manager** has the app icon and current background activity. The former publisher row subsequently disappeared during the same session, without a cache reset. |
| Explicit disable | The modern job and ownership record were removed; the main process kept the same PID. |
| Restart while disabled | The checkbox stayed off; no modern job, ownership record or legacy plist was recreated. |
| Explicit re-enable | The helper registered successfully and the checkbox returned to on. |
| macOS permission revoked | Restart and an in-app enable attempt preserved the OS denial. The original allowed preference was restored after the test. |
| Helper with an existing hidden app | Exit 0, unchanged main PID, one main process and zero on-screen app windows before and after. |
| Registered helper cold start | Starting the actual job through launchctl launched exactly one main process with `--background`; the helper exited 0, the app stayed inactive with zero on-screen windows, and foreground focus was preserved. |

Passive window/process observations were separate from UI actions, because
inspecting the hidden app through the UI automation surface could reopen it.
The cold-start check exercises the registered job; it is **not a real login**.

Final runtime source `ee76f8c3` also handles an explicit retry after interrupted
first registration and maps a stable approval-error prefix to localized guidance
in all 21 app languages. Its signed app and embedded helper passed the same
bundle/signature checks. The final candidate's installed message confirmation
remains pending; the English and Norwegian rendered cases passed locally.

## Automated Checks And Remaining Verification

The full Rust suite passed 1,007 tests before the native-status refinements;
the updated focused macOS suite passes 56 tests. Dev/release Clippy, Rust 1.88
checking, contracts, Cargo licenses, 891 script tests, 1,721 UI tests, and the
helper's arm64/x86_64 compilation and Universal 2 assembly checks passed.
The updated 21-language QA record follows actual production-catalog compilation,
Companion module generation/import checks and locale/formatting/runtime tests.
No new linguistic review or screenshot approval is claimed. PR CI is pending.

The signed candidate still needs a real next-login check. Disabled/absent and
customized legacy migration variants are covered by isolated policy tests;
they were not created in the user's real account. No new release is required
for that login check, and no logout or reboot is initiated automatically.
Apple's API establishes explicit app association but does not promise to erase
every stale publisher-history row on every Mac. No global background-task reset
is used, and this machine's observed cleanup is not a general cache guarantee.
