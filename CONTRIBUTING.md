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
```

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
