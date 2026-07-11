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
  screenshots containing sensitive personal data.

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

## Dependency Changes

For dependency updates, include the reason for the update and run relevant
tests. Scanner-related dependency updates should include at least one manual
camera/image scan check before release.
