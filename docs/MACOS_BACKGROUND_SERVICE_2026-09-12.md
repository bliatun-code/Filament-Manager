# macOS Background Service Follow-up — 12 September 2026

Status: **The signed local upgrade, background-start tests, final installed
approval-message check and real logout/login pass. Local automated checks, the
final signed build and all eleven PR CI checks pass. App identity remains correct
after login. No new release is published.**

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
bundle/signature checks. The English and Norwegian rendered cases passed locally.

That final candidate was subsequently installed after a normal quit, preserving
the prior candidate for rollback. Its changed signed helper bytes triggered the
expected registration fingerprint refresh. The new record matched the installed
helper/plist, all pending flags cleared, the helper exited 0, and one main process
remained. The retired legacy plist stayed absent.

With only Filament Manager's macOS background permission temporarily turned off,
the refreshed app settings showed launch-at-login off. An explicit enable attempt
kept it off and displayed the complete Norwegian System Settings guidance,
without exposing the native error prefix or a generic update failure. The message
was visually checked in the installed app. The OS switch and ownership record
remained unchanged by the denied attempt.

After restoring the original OS permission and restarting the app normally,
launch-at-login was on, the message was gone, and the settled registration
remained unchanged. System Settings still showed **Filament Manager with its app
icon**, with no former publisher row. This closes the final installed-candidate
check; the separate real-login result follows.

### Real Logout/Login

The user then logged out of macOS and back in with final candidate `ee76f8c3`
installed. The first post-login observation used only passive process, window
and service inspection, before opening or selecting Filament Manager through UI
automation. The GUI audit session changed while the OS boot session stayed the
same, confirming a new login session rather than a screen unlock.

Exactly one new installed app process was already running with `--background`.
It was inactive and had zero on-screen regular windows at that first check.
The registered helper had run once and exited 0 in the new session. The app's
ownership record was unchanged, all pending flags remained false, and the legacy
plist stayed absent. The installed executable still matched the verified signed
candidate. An independent read-only review confirmed these observations.

System Settings subsequently showed **Filament Manager with its app icon**,
current background activity and its switch on. The former publisher row remained
absent. Automatic background startup and identity after real logout/login are
therefore verified on this Mac. This was not a reboot test; the passive snapshot
does not establish whether any transient window or focus change occurred earlier
in the login sequence.

## Automated Checks And Verification Scope

The full Rust suite passed 1,007 tests before the native-status refinements;
the updated focused macOS suite passes 56 tests. Dev/release Clippy, Rust 1.88
checking, contracts, Cargo licenses, 891 script tests, 1,721 UI tests, and the
helper's arm64/x86_64 compilation and Universal 2 assembly checks passed.
The updated 21-language QA record follows actual production-catalog compilation,
Companion module generation/import checks and locale/formatting/runtime tests.
No new linguistic review or full locale screenshot approval is claimed; the
targeted Norwegian native guidance observation is recorded above.

### PR CI And Packaged Artifacts

[PR #113](https://github.com/bliatun-code/Filament-Manager/pull/113) was pushed as
one package. In [CI run 34709798415](https://github.com/bliatun-code/Filament-Manager/actions/runs/34709798415),
macOS Smoke, Windows Smoke, shared contracts and database migration integrity
passed. The separate CodeQL and dependency/license/SBOM checks passed: all eleven
PR checks are green. The current macOS full suite passed **1,020 Rust tests**
(three ignored); Windows passed **979 Rust tests** (two ignored). Both platforms
passed **1,721 UI tests** each.

Both platform checkout logs identify merge `2cb1cb491cded7f4aa101a145dd418e5f6a04697`.
It has the same tree, `1a401267fa687769f71d2a80c8b46bc6b14049eb`, as PR head
`5a8106897d005a0d6af39658267c2a6a412f08bb`.

The macOS artifact (`10303755075`) was inspected beyond its green job result:

- All four desktop phases passed: mutation, restart verification, restore and
  post-restore restart. Restore reversed a deliberate data perturbation, with
  matching restored table digests and preserved batch replay behavior.
- All six Host/Client phases passed, including offline cache behavior, recovery
  after host restart, session renewal and batch replay. Authentication cleanup
  and exact process termination matched the same run's cleanup authorization.
  The successful outer gate also requires removal of its private work directory;
  the uploaded artifacts cannot independently inspect the runner after deletion.
- The helper architecture/minimum-OS packaging checks and installed bundle's
  deep/strict signature checks passed.

The Windows artifact (`10303617457`) independently passed the same four desktop
and six Host/Client phases, including restore digests, batch replay and cleanup.
Its clean MSI installation passed hidden background launch, default close,
close-to-tray and single-instance restoration. Uninstall removed the owned
autostart/installer registrations, shortcuts and PATH entry while preserving
the database hash.

The historical database artifact (`10302963909`) passed schema 1→7 through two
launches with distinct PID/token acknowledgments. It preserved 22 value-digested
tables, eight protected settings and five catalog rows. Its database-readiness
mode does not establish application-window behavior.

These CI artifacts use an ad-hoc debug macOS package, an unsigned debug Windows
MSI and a historical database fixture. They do not establish Developer ID
notarization, a signed Universal 2 release, Windows Authenticode signing,
prior-release database compatibility, or live Login Items identity and
permission behavior. The signed local checks above provide the native identity
and permission evidence separately.

### Merge Confirmation

PR #113 was merged as `133e3185b8737651a64daee1fce410ac26661b3c`. Its Git tree is
identical to the verified PR head `5a810689`, so the merge introduced no content
changes. The subsequent main-branch [CI run 34713771470](https://github.com/bliatun-code/Filament-Manager/actions/runs/34713771470)
passed shared contracts, macOS Smoke, database migration integrity and Windows
Smoke. [CodeQL run 34713771495](https://github.com/bliatun-code/Filament-Manager/actions/runs/34713771495)
passed all three analyses on that same merge commit.

The final CI and native-login evidence updates are carried together on a new
local branch from the merged main branch, ready for the next grouped push.
No additional CI run was requested for these documentation-only updates.

### Verification Scope

Disabled/absent and customized legacy migration variants are covered by isolated
policy tests; they were not created in the user's real account. The completed
login test used the local signed candidate and required no new release. The user
performed logout/login; no logout or reboot was initiated automatically.
Apple's API establishes explicit app association but does not promise to erase
every stale publisher-history row on every Mac. No global background-task reset
is used, and this machine's observed cleanup is not a general cache guarantee.
