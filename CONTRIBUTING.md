# Contributing

Thanks for taking the time to improve Filament Manager.

## License

By contributing, you agree that your contribution is provided under the same
license as the project: GNU Affero General Public License v3.0 or later
(`AGPL-3.0-or-later`). See [LICENSE](LICENSE).

## Development Setup

The workspace supports Rust 1.90 and newer. A checked-in toolchain file selects
the reviewed Rust release, including Clippy and rustfmt, for normal local
commands. Install it with `rustup` if your environment does not resolve it
automatically.

Install dependencies:

```bash
npm ci
npm --prefix ./ui ci
```

Run the desktop app:

```bash
npm run tauri -- dev
```

For realistic standalone testing without changing the installed app's saved
Host or Client role, use the persistent isolated development database:

```bash
npm run dev:local
```

The first run copies an available local library or standalone recovery snapshot
to `tmp/dev-local/filament-manager.db`, gives the copy separate library and
credential identities, and removes pairing, Trusted LAN, and printer connection
secrets. Later runs reuse that copy; they do not refresh it automatically. This
is still a local development database containing copied inventory and history,
not a public synthetic fixture. Never commit, publish, or attach it to an issue
or pull request.

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
[the publication checklist](docs/development/PUBLIC_REPOSITORY.md) before its first push.

Useful focused checks:

```bash
npm run smoke
npm run test:ui
npm run test:companion
npm run test:rust
npm run check:contracts
cargo test -p bambu-filament-manager library_sync_resilience_tests -- --nocapture
```

The blocking performance, Host/Client resilience, backup/upgrade,
accessibility, and localization thresholds—and the maintainer accountable for
each—are listed in
[the quality-gate contract](docs/development/QUALITY_GATES.md). Update that contract and its
executable test in the same change whenever a gate or threshold changes.

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
- Use the committed sanitized visual-QA fixture for repeatable QA. Public
  product screenshots may use a separate, de-identified library copy with real
  stock and live printer readings after every visible private field is reviewed
  and removed. Never publish the library copy or its connection settings.
- Use English screenshots in the README and English guide, and Norwegian
  screenshots in the Norwegian guide. Device frames may surround real captures;
  do not synthesize app content or printer readings.

Participation is also covered by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Areas That Need Extra Care

- Read [the architecture guide](docs/development/ARCHITECTURE.md) before moving Rust
  modules or changing startup, database, or Bambu Live boundaries.
- Bambu Live/AMS matching and RFID onboarding must be conservative. A weak hint
  should not overwrite a deliberate slot assignment or RFID identity.
- Companion and Trusted-LAN changes must preserve browser session and CSRF
  safeguards.
- Host/Client changes must preserve the exact Host, library, and target
  generation as the authority. Never add a local Client write fallback or
  transparently replay a credential-bearing write after a transport failure.
- Scanner changes should remain usable without specialized hardware.
- UI changes should keep desktop modal sizing, mobile Companion behavior, and
  localization in mind.

## Localization

Read [the localization workflow](docs/development/LOCALIZATION.md) before changing source
copy or adding a language. Run `npm run report:i18n` after English source-string
changes; maintained locales must be translated and natively reviewed against
the new source fingerprint before release.

The app currently publishes complete catalogs for 21 languages. Most of the
new catalogs are community-review candidates rather than translations with a
named native reviewer. Use the [translation correction form](https://github.com/bliatun-code/Filament-Manager/issues/new?template=translation.yml)
for focused corrections: identify the locale,
message or screen, expected wording, and—when layout is involved—include a
screenshot. Run the locale checks and the relevant data-backed screenshot
scenario before submitting the change.

## Dependency Changes

For dependency updates, include the reason for the update and run relevant
tests. Scanner-related dependency updates should include at least one manual
camera/image scan check before release.

## Project Documentation

Filament Manager uses a Tauri desktop shell, a React interface and a Rust core.
The core owns library rules and SQLite data; the desktop shell also serves the
paired Companion browsers. Start with these references for technical work:

- [Architecture and workspace layout](docs/development/ARCHITECTURE.md)
- [English user guide](docs/USER_GUIDE.md) and [Norwegian user guide](docs/BRUKERVEILEDNING.md)
- [Quality gates](docs/development/QUALITY_GATES.md)
- [Localization](docs/development/LOCALIZATION.md)
- [macOS distribution and verification](docs/development/MACOS_DISTRIBUTION.md)
- [Release integrity and SBOM](docs/development/SUPPLY_CHAIN.md)
- [Security policy](SECURITY.md) and [community standards](CODE_OF_CONDUCT.md)

The workspace contains `src/backend/` for the shared core, `src-tauri/` for the
native shell and Companion service, `ui/` for the desktop interface, and
`scripts/` for builds and validation. Node.js 24, npm 10 or newer and the checked-in
Rust toolchain are required for development. macOS builds also need Xcode and
its command-line tools. End users can install the published DMG or MSI without
these development tools.

## Documentation and working evidence

Keep the README focused on downloads, the user guides and current product
images. Public documentation describes supported behavior and repeatable
maintenance procedures. Update the existing document when a contract changes.
Keep task plans, dated QA reports, review rounds and superseded screenshots in
ignored local working storage; summarize validation in the pull request and
GitHub Actions instead of adding another report under `docs`. The ignored
`docs/internal/` directory is available for local notes and archives.

Current follow-up work includes testing the main workflows with human users,
physical label/camera validation and Windows installer signing. Automated
checks do not stand in for those remaining checks; their repeatable procedures
belong in the maintained quality and distribution documentation.

## Recent Release Notes

- [v0.35.1](docs/releases/RELEASE_NOTES_v0.35.1.md)
- [v0.35.0](docs/releases/RELEASE_NOTES_v0.35.0.md)
- [v0.34.0](docs/releases/RELEASE_NOTES_v0.34.0.md)

The three newest release-note files stay in the working tree. Older source and
checked-in notes remain available through their published Git tags. Archive
older release downloads and metadata locally before removing release entries;
preserve the tags used by historical links and upgrade tests.
