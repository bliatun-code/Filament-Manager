# Contributing

Thanks for taking the time to improve Filament Manager.

## License

By contributing, you agree that your contribution is provided under the same
license as the project: GNU Affero General Public License v3.0 or later
(`AGPL-3.0-or-later`). See [LICENSE](LICENSE).

## Development Setup

Install dependencies:

```bash
npm ci
npm --prefix ./ui ci
```

Run the desktop app:

```bash
npm run tauri -- dev
```

### Stable macOS Development Signing

The normal macOS development executable is ad-hoc signed, so its code identity
changes after a Rust rebuild. If the local library contains credentials in
macOS Keychain, that can make Keychain ask for approval again after each
rebuild.

Maintainers can opt into stable signing for `tauri dev` with a local
`Apple Development` or self-signed Code Signing identity installed in their
login Keychain:

```bash
security find-identity -v -p codesigning
export FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY='Apple Development: Your Name (TEAMID)'
npm run tauri -- dev
```

If `security find-identity` only lists a `Developer ID Application` identity,
create a separate `Apple Development` certificate from Xcode's Accounts >
Manage Certificates screen. An offline alternative is a self-signed Code
Signing certificate in Keychain Access with the exact name
`Filament Manager Development`. Never use the Developer ID release identity
for local development; the wrapper rejects release, distribution, hash-only,
and arbitrary identities.

The identity name is not a private key and may be kept in a local shell
profile, but do not commit certificates, private keys, Keychain files, or local
environment files. The first access with a new development identity can still
require one approval. Subsequent Rust rebuilds keep the same designated
requirement and should not ask again.

This opt-in signs only the `bambu-filament-manager` executable produced inside
a Cargo target directory and uses the separate development identifier
`no.bliatun.filamentmanager.dev`. It rejects the ad-hoc `-` identity, does not
override an existing Cargo runner environment variable, is disabled in CI,
and does not change release signing or credential storage. Do not work around
Keychain prompts by allowing all applications, weakening global Keychain
policy, or storing credentials in plaintext.

Run the full verification suite:

```bash
npm run verify
```

Check the public repository surface before sharing a branch or pull request:

```bash
npm run check:public-readiness
```

The first public repository is created from a reviewed, one-commit source
mirror rather than the private development history. Maintainers must also run
`npm run audit:public-mirror` in that new repository and follow
[the publication checklist](docs/PUBLIC_REPOSITORY.md) before its first push.

Useful focused checks:

```bash
npm run smoke
npm run test:ui
npm run test:companion
npm run test:rust
npm run check:contracts
```

## Local Build And QA Cleanup

Cargo profiles and local visual-QA output can grow substantially over time.
Inspect the repository-owned cleanup plan before removing anything:

```bash
npm run cleanup:local
```

The command is a dry run by default. Its standard policy removes Cargo
`debug`/`release` profiles only after 14 inactive days, measured from the newest
modification anywhere in each profile without following symlinks. QA run
directories are removed after 14 days while retaining the newest five. For the
aggregate `release-artifacts/visual-qa/` directory, retention applies to each
immediate run directory instead of the aggregate directory itself; loose files
are left untouched. Versioned release directories are removed after 90 days
while retaining the newest three.

The cleanup only considers directories under this repository's `target/` and
`release-artifacts/` roots. It refuses cleanup when either root is a symlink,
does not follow symlinks within candidates, and verifies canonical ancestry,
retention markers, and recursive build activity again immediately before
removal.

Apply the displayed policy explicitly:

```bash
npm run cleanup:local -- --apply
```

Stop running builds and local app instances before every apply operation. To
make recent Cargo profiles eligible, preview the zero-day build policy and only
then apply it:

```bash
npm run cleanup:local -- --scope build --build-days 0
npm run cleanup:local -- --scope build --build-days 0 --apply
```

Place an empty `.cleanup-keep` file inside any build profile or artifact
directory that must never be selected. Run
`npm run cleanup:local -- --help` for the age, count, scope, and verbose
options. Do not use an external recursive-delete command as a substitute; the
repository command deliberately validates its root, candidates, markers, and
modification times.

## Pull Requests

- Keep changes focused and explain the user-facing behavior.
- Add or update tests when changing matching logic, scanner behavior, database
  contracts, Tauri commands, Companion routes, or user-visible workflows.
- Avoid broad rewrites unless they are clearly motivated and covered by tests.
- Include screenshots for meaningful UI changes.
- Do not commit local databases, logs, `.env` files, private pairing URLs, or
  screenshots containing LAN addresses, printer serials, access codes, full
  RFID values, scannable private QR targets, names, or other personal data.
- Use the committed sanitized visual-QA fixture for screenshots intended for
  documentation or a pull request. Keep captures from a real printer or live
  library local unless every private field has been reviewed and removed.

Participation is also covered by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Areas That Need Extra Care

- Read [the architecture guide](docs/ARCHITECTURE.md) before moving Rust
  modules or changing startup, database, or Bambu Live boundaries.
- Bambu Live/AMS matching and RFID onboarding must be conservative. A weak hint
  should not overwrite a deliberate slot assignment or RFID identity.
- Companion and Trusted-LAN changes must preserve browser session and CSRF
  safeguards.
- Scanner changes should remain usable without specialized hardware.
- UI changes should keep desktop modal sizing, mobile Companion behavior, and
  localization in mind.

## Localization

Read [the localization workflow](docs/LOCALIZATION.md) before changing source
copy or adding a language. Run `npm run report:i18n` after English source-string
changes; maintained locales must be translated and natively reviewed against
the new source fingerprint before release.

The app currently publishes complete catalogs for 21 languages. Most of the
new catalogs are community-review candidates rather than translations with a
named native reviewer. Focused corrections are welcome: identify the locale,
message or screen, expected wording, and—when layout is involved—include a
screenshot. Run the locale checks and the relevant data-backed screenshot
scenario before submitting the change.

## Dependency Changes

For dependency updates, include the reason for the update and run relevant
tests. Scanner-related dependency updates should include at least one manual
camera/image scan check before release.
