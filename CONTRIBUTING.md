# Contributing

Thanks for taking the time to improve Filament Manager.

## License

By contributing, you agree that your contribution is provided under the same
license as the project: GNU Affero General Public License v3.0 or later
(`AGPL-3.0-or-later`). See [LICENSE](LICENSE).

## Development Setup

Development uses the Node.js major in `.nvmrc`, npm 10 or newer, and the
Rust release in `rust-toolchain.toml`. The workspace also checks compatibility
with Rust 1.90. On macOS, install Xcode and its command-line tools.

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

Preview and apply the repository's local cleanup policy with these commands.
Stop local builds and test app instances before applying it.

```bash
npm run cleanup:local
npm run cleanup:local -- --apply
```

The default policy selects inactive Cargo profiles after 14 days, QA runs after
14 days while keeping the newest five, and local versioned release artifacts
after 90 days while keeping the newest three. It checks `target/` and
`release-artifacts/` in this checkout and leaves loose files in QA output alone.
Place an empty `.cleanup-keep` file in a directory to retain it. Use
`npm run cleanup:local -- --help` for other retention and scope options.

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

Use the [translation correction form](https://github.com/bliatun-code/Filament-Manager/issues/new?template=translation.yml)
for focused corrections. Include the locale, screen, expected wording and a
screenshot if the issue affects layout.

## Dependency Changes

For dependency updates, include the reason for the update and run relevant
tests. Scanner-related dependency updates should include at least one manual
camera/image scan check before release.

## Project Documentation

- [Architecture and workspace layout](docs/development/ARCHITECTURE.md)
- [English user guide](docs/USER_GUIDE.md) and [Norwegian user guide](docs/BRUKERVEILEDNING.md)
- [Quality gates](docs/development/QUALITY_GATES.md) and [localization](docs/development/LOCALIZATION.md)
- [macOS distribution](docs/development/MACOS_DISTRIBUTION.md) and [Windows distribution](docs/development/WINDOWS_DISTRIBUTION.md)
- [Release integrity and SBOM](docs/development/SUPPLY_CHAIN.md)
- [Security policy](SECURITY.md) and [community standards](CODE_OF_CONDUCT.md)

## Documentation and working evidence

Keep the README focused on downloads, the user guides and current product
images. Public documentation describes supported behavior and repeatable
maintenance procedures. Update the existing document when a contract changes.
Keep task plans, dated QA reports, review rounds and superseded screenshots in
ignored local working storage; summarize validation in the pull request and
GitHub Actions instead of adding another report under `docs`. The ignored
`docs/internal/` directory is available for local notes and archives.

## Recent Release Notes

- [v0.36.4](docs/releases/RELEASE_NOTES_v0.36.4.md)
- [v0.36.3](docs/releases/RELEASE_NOTES_v0.36.3.md)
- [v0.36.2](docs/releases/RELEASE_NOTES_v0.36.2.md)

The three newest release-note files stay in the working tree. Older source and
checked-in notes remain available through their published Git tags. Archive
older release downloads and metadata locally before removing release entries;
preserve the tags used by historical links and upgrade tests.
