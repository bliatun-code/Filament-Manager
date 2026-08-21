# Blocking quality gates

This document is the release contract for Filament Manager's performance,
backup and upgrade, accessibility, and localization gates. A gate is blocking
when a failure makes either `macOS Smoke` or `Windows Smoke` fail; the release
workflow requires both checks before publishing artifacts.

The named owner is accountable for the threshold and for reviewing any proposed
exception. Contributors may implement fixes in every area, but a threshold must
not be weakened merely to make a change pass.

| Gate | Named owner | Blocking threshold | Local command | Required CI path |
| --- | --- | --- | --- | --- |
| Performance | `@bliatun-code` (performance gate owner) | The deterministic 10,000-spool, concurrency, timeout, render-window, lazy-loading, and bundle contracts pass with zero failures. Production JavaScript chunks remain within the committed byte budgets in [PERFORMANCE_BASELINE.md](PERFORMANCE_BASELINE.md). | `npm run test:performance:bundle` and `npm run test:performance` | `npm run verify` on macOS and Windows |
| Backup and database upgrade | `@bliatun-code` (data and release gate owner) | Backup validation and restore tests pass with zero failures; SQLite `quick_check` is `ok`, `foreign_key_check` is empty, unsupported future schemas are rejected before mutation, and device-local credentials never enter portable backups. The historical upgrade smoke must reach the current schema on two consecutive launches without changing protected business data. | `cargo test` and `npm run smoke:release:database-upgrade -- ...` | `npm run verify`, plus the database-upgrade/package smoke in required platform jobs |
| Accessibility | `@bliatun-code` (accessibility gate owner) | All six data-backed main pages have zero axe violations for WCAG 2.0 A/AA, 2.1 A/AA, and 2.2 AA and emit zero browser errors. The shared modal passes keyboard focus, Escape/focus return, and 200% zoom without page-level horizontal overflow. | `npm run test:a11y:app-modal` and `npm run test:a11y:data-backed` | `npm run verify` on macOS and Windows |
| Localization | `@bliatun-code` (localization gate owner) | Published catalogs keep 100% key and placeholder coverage, zero unknown literal keys, and at least 95% translation signal. A locale described as maintained also needs a named native reviewer and a reviewed fingerprint matching the current English source. | `npm run check:i18n-readiness` and `npm run check:contracts` | `npm run verify` on macOS and Windows |

## Performance authority

The exact production chunk limits, render-window limits, network budgets, and
10,000-spool scenarios live in [PERFORMANCE_BASELINE.md](PERFORMANCE_BASELINE.md)
and their executable tests. Wall-clock probes are advisory because shared CI
runner timings are not stable; deterministic work and bundle limits are the
blocking authority.

Changing a committed performance limit requires all of the following in the
same pull request:

1. before-and-after production bundle or model measurements;
2. an explanation of why the additional startup or navigation work is needed;
3. updated executable tests and documentation; and
4. approval from the named performance gate owner.

## Backup and upgrade authority

The Rust backup suite is the authority for validation, atomic restore,
credential exclusion, supported-schema handling, and rollback behavior. The
release-upgrade smoke adds process-level evidence: it starts the application
twice against a sanitized historical database, verifies migration to the
current schema, and compares row identities and preserved values before and
after both launches.

A fixture used in CI must be synthetic or explicitly sanitized, content-locked,
owner-only on disk, and rejected if it is not older than the current schema.
Raw user databases, credentials, printer addresses, pairing state, and other
private values must never become CI artifacts.

## Accessibility authority

The data-backed browser gate runs axe against Dashboard, Inventory, Loans,
Printers, Statistics, and Settings with realistic synthetic data. Its threshold
is zero violations, not a severity-filtered allowance. The focused modal gate
covers behavior that a static scan cannot prove: initial focus, wrapped tab
order, Escape, focus restoration, scroll reachability, and layout at 200% zoom.

An accessibility exception must identify a standards-based reason, include a
bounded removal date, and be approved by the named accessibility gate owner.
There are currently no committed exceptions.

## Localization authority

English is the canonical source. The detailed publication, stale-fingerprint,
native-review, and string-freeze rules are in
[LOCALIZATION.md](LOCALIZATION.md). Completeness and translation signal do not
substitute for native review: an unowned locale may remain a community-review
candidate, but it cannot be labelled maintained.

## Wiring and change control

`npm run verify` includes the production UI build, UI lint, Companion and script
tests, both browser accessibility gates, the complete UI suite, deterministic
performance checks, localization contracts, Rust tests, formatting, and Clippy
in development and release profiles. Both required platform jobs execute this
command. Release publication separately verifies the successful `macOS Smoke`
and `Windows Smoke` check runs for the exact commit.

The executable contract in `scripts/quality-gates-contract.test.mjs` fails if a
required command is removed from `npm run smoke`, a platform stops running
`npm run verify`, release publication stops requiring both platform checks, or
the documented ownership and core thresholds disappear.
