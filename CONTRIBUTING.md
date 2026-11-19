# Contributing

By contributing, you agree to license your contribution under the project's
[AGPL-3.0-or-later license](LICENSE). For the code layout and rules for
changes to each subsystem, see [AGENTS.md](AGENTS.md).

## Development Setup

Development uses the Node.js major in `.nvmrc`, npm 10 or newer, and the
Rust release in `rust-toolchain.toml`. The workspace also checks compatibility
with Rust 1.90. On macOS, install Xcode and its command-line tools.

Run commands from the repository root. If you use nvm, run `nvm use` there
first. Install the locked dependencies and the browser used by the test suite.

```bash
npm ci
npm --prefix ./ui ci
node ./node_modules/playwright/cli.js install chromium
npm run doctor
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
secrets. Later runs reuse that copy. Local development and visual QA each use a
dedicated Tauri identifier so the installed app can stay open. The copied
inventory and history are private. Never commit, publish, or attach this
database to an issue or pull request.

### After moving the checkout

From the new directory, run `git rev-parse --show-toplevel`,
`git status --short --branch` and `git worktree list` to check the root, branch
and any linked checkouts. If a linked checkout still refers to the old
location, run `git worktree repair` from the main checkout. Pass the new paths
of any linked checkouts that also moved. Re-run the setup above if local
dependencies are missing or incompatible.

The installed app uses its platform data directory. An explicit
`FILAMENT_MANAGER_DB_PATH` overrides it, so check any saved override that
points into the former checkout. The `dev:local` command resolves its own
database relative to this checkout.

### Stable macOS Development Signing

The default ad-hoc signature changes after a Rust rebuild and can trigger
repeated Keychain prompts. To keep a stable development identity, select a
local code-signing identity from the login Keychain.

```bash
security find-identity -v -p codesigning
export FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY='Apple Development: Your Name (TEAMID)'
npm run tauri -- dev
```

Create an `Apple Development` certificate in Xcode under Accounts → Manage
Certificates, or create a self-signed Code Signing certificate named exactly
`Filament Manager Development` in Keychain Access. The wrapper rejects
release, distribution, hash-only, ad-hoc and arbitrary identities.

Keep only the identity name in a local shell profile. The first credential
access can require approval. Rebuilds reuse the designated requirement for
`no.bliatun.filamentmanager.dev`. The wrapper signs only the
`bambu-filament-manager` executable inside a Cargo target directory, respects
an existing Cargo runner and is disabled in CI. Keep certificates, keys,
Keychains and local environment files private. Preserve Keychain access
controls and credential storage when troubleshooting prompts.

## Verification

Run `npm run verify` for the full suite. For a focused run, use
`npm run test:ui`, `npm run test:companion` or `npm run test:rust`.
`npm run smoke` builds the production UI and runs the browser, script and
contract checks. When running `npm run check:contracts` separately, build the
UI first to include the production bundle checks.
Run `npm run check:public-readiness` before sharing a branch.

The [quality-gate contract](docs/development/QUALITY_GATES.md) lists thresholds,
owners and focused commands, including the Host/Client resilience tests.
Update the contract and its executable test together when a gate changes.

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

- [English user guide](docs/USER_GUIDE.md) and [Norwegian user guide](docs/BRUKERVEILEDNING.md)
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

- [v0.36.5](docs/releases/RELEASE_NOTES_v0.36.5.md)
- [v0.36.4](docs/releases/RELEASE_NOTES_v0.36.4.md)
- [v0.36.3](docs/releases/RELEASE_NOTES_v0.36.3.md)

The three newest release-note files stay in the working tree. Older source and
checked-in notes remain available through their published Git tags. Archive
older release downloads and metadata locally before removing release entries;
preserve the tags used by historical links and upgrade tests.
