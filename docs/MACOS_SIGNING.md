# macOS Signing and Notarization

This document is the operations runbook for distributing Filament Manager with
Apple Developer ID signing, hardened runtime, notarization, and a stapled
notarization ticket. Tagged releases and manual release-candidate builds use the
same protected macOS workflow; ordinary local development remains independent
of Apple credentials.

Apple's current background material is available in
[Developer ID](https://developer.apple.com/support/developer-id/),
[Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution),
and
[Create Developer ID certificates](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/).
The Tauri environment variable contract is documented in
[Tauri macOS code signing](https://v2.tauri.app/distribute/sign/macos/).

## Current Status

- Ordinary local macOS builds remain ad-hoc signed. Tagged macOS artifacts are
  Developer ID signed, notarized, stapled, and verified before upload.
- `.github/workflows/release-build.yml` delegates its macOS job to the reusable
  `.github/workflows/macos-signed-release.yml`. The latter also remains directly
  dispatchable for release candidates with an explicit confirmation input.
- The signing job uses the protected `macos-release` environment and does not
  expose Apple credentials to Windows builds, normal CI, or publication steps.
- The Tauri wrapper keeps this behavior unless signing is explicitly requested.
  Existing local development and Windows MSI builds therefore continue without
  Apple credentials; the tagged macOS job sets the fail-closed signing flag.
- `FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING=1` is an opt-in, fail-closed release
  guard. On a macOS build it rejects identities other than Developer ID
  Application, `--no-sign`, or missing notarization credentials.
- `scripts/verify-macos-release.mjs` is a macOS-only post-build verifier for a
  signed and notarized DMG. Every tagged or manual signed build runs it before
  artifact upload.
- No Apple certificate, private key, password, or notarization credential should
  be committed to this repository.

A local sign-only pilot completed on July 17, 2026 with stable Xcode 26.6. The
arm64 app and DMG passed strict Developer ID verification, contained the expected
Apple certificate chain and secure timestamp, enabled hardened runtime, and
carried the required camera and local-network entitlements. App Store Connect
Team Key authentication also succeeded. The protected CI pilot then completed
successfully in run `29603626061`: Apple accepted the app and final DMG, both
were stapled, the strict verifier and checksum gate passed, and GitHub uploaded
only the verified artifact. The downloaded artifact independently passed its
checksum and the complete release verifier. The downloaded pilot also installed
and ran successfully on an Apple Silicon Mac without a Gatekeeper workaround.
This does not by itself claim a macOS 11 runtime test.

The separation between signing, Windows packaging, and later release publication
is intentional. A failed macOS signing gate produces no fallback DMG.

## Stable Xcode and Xcode Beta

Using a macOS beta or Xcode beta for normal development does not block this
work. GitHub-hosted release runners use their own selected Xcode installation
and are independent of a developer's local `xcode-select` setting.

Use a current stable Xcode for the signing pilot and public release builds. A
beta Xcode can remain installed for development and compatibility testing. When
both are installed, select the stable toolchain for one command without
changing the global developer directory:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  npm run tauri -- build --bundles dmg
```

The signed workflow pins the Apple Silicon `macos-15` runner label and
records the exact macOS, architecture, Xcode, and SDK versions in every run. Do
not replace it with `macos-latest` or move it to a new runner image without a
release-candidate pass.

## Signing and Notarization Inputs

The release needs two independent Apple credentials:

1. A **Developer ID Application** certificate and its private key, exported as
   a password-protected PKCS #12 (`.p12`) file for CI.
2. Notarization credentials. Prefer an App Store Connect API key (`.p8`) over a
   personal Apple ID app-specific password.

Tauri's standard signing identity variable is:

- `APPLE_SIGNING_IDENTITY`

The repository wrapper also accepts the older project-specific variable:

- `FILAMENT_MANAGER_MACOS_SIGNING_IDENTITY`

Prefer `APPLE_SIGNING_IDENTITY` for new setup. For App Store Connect API-key
notarization, Tauri expects the complete group:

- `APPLE_API_ISSUER`
- `APPLE_API_KEY` (the API key ID)
- `APPLE_API_KEY_PATH` (the path to the temporary `.p8` file)

The supported fallback group is `APPLE_ID`, `APPLE_PASSWORD`, and
`APPLE_TEAM_ID`. Do not configure a partial group; the opt-in guard treats it as
missing notarization credentials.

## Protected GitHub Environment

Do not add Apple credentials as repository files or ordinary workflow values.
Create a protected GitHub environment named `macos-release`; the signed workflow
is scoped to it. Its selected-ref policies must allow branch `main` for manual
candidates and tags matching `v*` for releases. Add a required reviewer or tag
ruleset if the repository plan supports those protections. Until then, release
tag creation is a maintainer-only operation and acts as the release approval.

Use these environment secrets:

| Secret | Purpose |
| --- | --- |
| `APPLE_CERTIFICATE` | Base64-encoded password-protected Developer ID `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | Exact `Developer ID Application: ... (TEAMID)` identity |
| `APPLE_API_PRIVATE_KEY` | Contents of the App Store Connect `.p8` private key |
| `APPLE_API_KEY` | App Store Connect API key ID |
| `APPLE_API_ISSUER` | App Store Connect API issuer ID |
| `APPLE_TEAM_ID` | Expected Apple Developer team ID used by verification |

`APPLE_API_PRIVATE_KEY` is a GitHub secret name, not a Tauri variable. The
signed workflow writes it to a file under `$RUNNER_TEMP` and exposes that
path as `APPLE_API_KEY_PATH` only for the build.

Treat every identifier in the table as sensitive workflow configuration even
when Apple does not classify the identifier itself as a private key. Limit API
key access to what notarization requires, rotate credentials deliberately, and
remove revoked material immediately.

## Secret-handling Rules

- Never store `.p12`, `.p8`, certificate requests, passwords, or temporary
  keychains in Git, build artifacts, caches, or diagnostic bundles.
- Import the `.p12` into a new, randomly password-protected temporary keychain
  on the GitHub runner. Never use or modify the runner's login keychain.
- Write the `.p8` only below `$RUNNER_TEMP`, with restrictive permissions.
- Do not echo decoded credentials, shell-trace secret-bearing steps, or pass a
  private key as a command-line argument.
- Delete the temporary keychain and `.p8` in an `if: always()` cleanup step.
- Upload only the verified DMG and intentionally generated release metadata.
- Keep the signing job's `GITHUB_TOKEN` permissions at `contents: read` while it
  only builds artifacts. If release publication is later automated, use a
  separate, narrowly scoped publish job.

The repository ignores common Apple key and keychain file extensions as a
second line of defense. That does not replace careful secret handling.

## Activation Runbook

### 1. Release compatibility contract

The first signed release contract is:

- architecture: Apple Silicon (`arm64`);
- minimum system version: macOS 11.0 Big Sur;
- CI image: the Apple Silicon `macos-15` runner, with the exact Xcode and SDK
  versions recorded in every workflow log.

`src-tauri/tauri.conf.json` sets `minimumSystemVersion` to `11.0`. This is also
the minimum supported deployment target of Rust's
[`aarch64-apple-darwin` target](https://doc.rust-lang.org/rustc/platform-support.html),
and it matches the `LC_BUILD_VERSION` value observed in the local signed pilot.
The release verifier requires both `LSMinimumSystemVersion` in the app bundle
and the main app executable's Mach-O deployment target to match this contract.

Intel or universal artifacts require a separate compatibility decision,
verifier expectation, and clean-machine test. Do not infer support from whichever
runner or SDK happens to compile successfully.

### 2. Prepare Apple credentials

1. Create a Developer ID Application certificate in the correct Apple Developer
   team.
2. Export the certificate and private key from Keychain Access as a
   password-protected `.p12`.
3. Create a narrowly scoped App Store Connect API key and download its `.p8`
   file. Apple only permits downloading that private key once.
4. Record the certificate's exact identity and Team ID. Check the local identity
   with `security find-identity -v -p codesigning`.
5. Store the originals in the team's approved password or secrets manager, not
   in the repository workspace.

### 3. Run a local stable-Xcode pilot

Set variables in a private shell session or load them from a secrets manager;
do not place them in a checked-in `.env` file:

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
export CARGO_TARGET_DIR="${TMPDIR%/}/filament-manager-signing-target"
export APPLE_SIGNING_IDENTITY="Developer ID Application: Example (TEAMID)"
export APPLE_API_ISSUER="issuer-id"
export APPLE_API_KEY="key-id"
export APPLE_API_KEY_PATH="$HOME/private/AuthKey_key-id.p8"

FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING=1 \
  npm run tauri -- build --bundles dmg

EXPECTED_APPLE_TEAM_ID="TEAMID" \
  npm run verify:macos-release -- \
  "$CARGO_TARGET_DIR"/release/bundle/dmg/Filament\ Manager_*.dmg \
  --architectures=arm64
```

Replace `arm64` after the architecture decision. The fail-closed flag is
required for the pilot so an expired or missing credential cannot silently
produce an ad-hoc build.

Keep signed bundle output outside macOS Documents, Desktop, and other File
Provider-managed folders. File Provider can attach Finder metadata while Tauri
is assembling the app, which causes `codesign` to reject the bundle before it is
packaged. When `FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING=1` is set, the Tauri
wrapper defaults an otherwise unset `CARGO_TARGET_DIR` to a private temporary
directory; an explicit value still takes precedence. GitHub-hosted runners do
not place this target under a File Provider folder, and the signed workflow uses
`$RUNNER_TEMP` explicitly.

### 4. Operate the protected release workflow

1. Keep all seven environment secrets current and retain the `main` branch plus
   `v*` tag deployment policies.
2. Bump every version source and the README release target together, then let
   `npm run check:version` pass before creating a release tag.
3. Push an annotated tag matching the package version exactly. The release
   validator also requires the tagged commit to be on `main`.
4. For a non-tagged candidate, open **Actions → Release Build Artifacts**, choose
   `macos` or `both`, and enable the notarization confirmation. The standalone
   **Signed macOS DMG** workflow remains available for focused
   macOS diagnostics.
5. Confirm that the workflow records an arm64 `macos-15` runner and a stable
   Xcode, imports the certificate into an ephemeral keychain, and completes both
   the app and final-DMG notarization steps.
6. Download the artifact only after the strict verifier has passed. Keep the
   normalized DMG and `SHA256SUMS.txt` from that same run, verify the checksum,
   and only then attach them to a draft GitHub release.

The reusable workflow writes `APPLE_API_PRIVATE_KEY` below `$RUNNER_TEMP`,
exposes its path as `APPLE_API_KEY_PATH`, and builds with
`FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING=1`. Tauri signs, notarizes, and staples
the app before packaging it. The workflow then normalizes the public filename,
submits the finished signed DMG to Apple, staples and validates the DMG ticket,
verifies the result against the protected `APPLE_TEAM_ID`, generates its
checksum, and removes the temporary keychain and keys with an `if: always()`
cleanup step.

The tag path has no ad-hoc fallback. If signing, Apple notarization, stapling,
verification, or checksum generation fails, do not publish a macOS installer
for that release. Diagnose with a new candidate run rather than weakening the
gate.

### 5. Validate a release candidate on clean machines

- Download the artifact exactly as a user would.
- Confirm Gatekeeper opens it without quarantine workarounds.
- Confirm Local Network and Camera permission prompts use the expected app
  identity and descriptions.
- Confirm Bambu Live, Companion access, label export, updates, and file dialogs.
- Test on macOS 11.0 and a current macOS release on Apple Silicon.
- Confirm the release page contains the same DMG digest that was verified in CI.

## What the Verifier Checks

Run on macOS:

```bash
EXPECTED_APPLE_TEAM_ID="TEAMID" \
  npm run verify:macos-release -- path/to/Filament-Manager.dmg \
  --architectures=arm64
```

The verifier checks the DMG structure, stapled notarization ticket, Gatekeeper
assessment, Developer ID authority, Team ID, secure timestamp, hardened runtime,
bundle identifier, required entitlements and privacy strings, forbidden debug
or App Sandbox entitlements, `LSMinimumSystemVersion`, the main app executable's
Mach-O deployment target, and expected executable architectures. Team ID and an
exact architecture set are mandatory; any mismatch fails the command.

This is a post-build release gate, not a substitute for testing the installed
app on a clean Mac.

## Entitlements and App Sandbox

Developer ID signing, hardened runtime, notarization, and App Sandbox are
separate decisions. Filament Manager currently needs camera access and inbound
and outbound local-network behavior for Bambu Live and Companion. The existing
entitlements and privacy descriptions are verified as part of the signed build.

**Do not enable App Sandbox as part of the signing change.** Sandboxing can alter
local-network, file-dialog, export, and database behavior and therefore requires
its own design, entitlement audit, and data-backed regression pass. Signing and
notarization do not require turning it on for direct Developer ID distribution.
The release verifier also rejects `com.apple.security.get-task-allow=true`, so a
debug entitlement cannot reach a published artifact.

## Rollback

If signed CI fails before publication, keep the failure logs, revoke or rotate
credentials if exposure is suspected, and use the manual candidate path to
diagnose the problem. Reverting the promotion requires a reviewed workflow
change; never bypass the verifier or publish an ad-hoc artifact under a release
that promises Developer ID signing. Ordinary local ad-hoc builds remain
available for development only while the failure is investigated.
