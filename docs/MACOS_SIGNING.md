# macOS Signing and Notarization

This document is the activation runbook for distributing Filament Manager with
Apple Developer ID signing, hardened runtime, notarization, and a stapled
notarization ticket. It deliberately does not activate signing in the current
GitHub Actions release job.

Apple's current background material is available in
[Developer ID](https://developer.apple.com/support/developer-id/),
[Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution),
and
[Create Developer ID certificates](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/).
The Tauri environment variable contract is documented in
[Tauri macOS code signing](https://v2.tauri.app/distribute/sign/macos/).

## Current Status

- Local macOS builds and the existing GitHub Actions DMG job remain ad-hoc
  signed. They are not Developer ID signed or notarized.
- The Tauri wrapper keeps this behavior unless signing is explicitly requested.
  Existing local development, Windows MSI builds, and release artifact builds
  therefore continue without Apple credentials.
- `FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING=1` is an opt-in, fail-closed release
  guard. On a macOS build it rejects identities other than Developer ID
  Application, `--no-sign`, or missing notarization credentials.
- `scripts/verify-macos-release.mjs` is a macOS-only post-build verifier for a
  signed and notarized DMG. It is not called by the current release workflow.
- No Apple certificate, private key, password, or notarization credential should
  be committed to this repository.

This separation is intentional: the repository can be hardened and tested
before any credential is created or any existing release behavior changes.

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

Before a public release, record the stable Xcode version and macOS runner image
used by CI. Do not let an automatic runner-image change silently become the
first build with a new SDK.

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

## Proposed GitHub Environment

Do not add Apple credentials as repository files or ordinary workflow values.
When activation is approved, create a protected GitHub environment named
`macos-release` and scope the signing job to it. Add a required reviewer and
restrict deployments to release tags if the repository plan supports those
protections.

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

`APPLE_API_PRIVATE_KEY` is a proposed GitHub secret name, not a Tauri variable.
The future workflow must write it to a file under `$RUNNER_TEMP` and expose that
path as `APPLE_API_KEY_PATH` only for the build step.

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

### 1. Decide the release compatibility contract

Before credentials are connected, choose and document:

- architecture: Apple Silicon (`arm64`), Intel (`x86_64`), separate artifacts,
  or a universal binary;
- minimum supported macOS version;
- the stable Xcode version and GitHub runner image used to build it.

Set the chosen minimum macOS version explicitly in the build configuration and
test on that version. Configure the verifier to require the selected
architecture set. Do not infer either decision from whichever runner happens to
be current.

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
export APPLE_SIGNING_IDENTITY="Developer ID Application: Example (TEAMID)"
export APPLE_API_ISSUER="issuer-id"
export APPLE_API_KEY="key-id"
export APPLE_API_KEY_PATH="$HOME/private/AuthKey_key-id.p8"

FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING=1 \
  npm run tauri -- build --bundles dmg

EXPECTED_APPLE_TEAM_ID="TEAMID" \
  npm run verify:macos-release -- \
  target/release/bundle/dmg/Filament\ Manager_*.dmg \
  --architectures=arm64
```

Replace `arm64` after the architecture decision. The fail-closed flag is
required for the pilot so an expired or missing credential cannot silently
produce an ad-hoc build.

### 4. Connect the protected CI environment

Only after the local pilot passes:

1. Create the `macos-release` environment and its secrets.
2. Add `environment: macos-release` to the macOS signing job.
3. Decode the certificate, create a temporary keychain, and import the identity.
4. Write `APPLE_API_PRIVATE_KEY` to `$RUNNER_TEMP/AuthKey.p8` and export its path
   as `APPLE_API_KEY_PATH`.
5. Run the build with `FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING=1`.
6. Run `npm run verify:macos-release` before artifact upload.
7. Pass the protected `APPLE_TEAM_ID` secret to the verifier as
   `EXPECTED_APPLE_TEAM_ID`.
8. Clean up the temporary files and keychain with `if: always()`.

Keep activation in a focused change that can be reviewed independently. First
exercise it with a manually dispatched release-candidate build. Do not replace
or delete the working ad-hoc path until the signed artifact has passed the full
verification and install test.

### 5. Validate a release candidate on clean machines

- Download the artifact exactly as a user would.
- Confirm Gatekeeper opens it without quarantine workarounds.
- Confirm Local Network and Camera permission prompts use the expected app
  identity and descriptions.
- Confirm Bambu Live, Companion access, label export, updates, and file dialogs.
- Test on the chosen minimum macOS version and on every published architecture.
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
bundle identifier, required entitlements and privacy strings, and expected
executable architectures. Team ID and an exact architecture set are mandatory;
any mismatch fails the command.

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

## Rollback

If signed CI fails before publication, keep the verified failure logs, revoke or
rotate credentials if exposure is suspected, and restore the previous artifact
workflow. Never bypass the verifier or publish an ad-hoc artifact under a release
that promises Developer ID signing. Because activation is opt-in, ordinary local
builds and the current ad-hoc release workflow remain available while the
failure is investigated.
