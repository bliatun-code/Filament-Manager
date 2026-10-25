# Balanced overview localization QA — 25 October 2026

The balanced Dashboard keeps inventory, outbound loans and rolling 30-day usage
as headline values. Printer and low-stock details share the first row; annual
consumption and loan activity share the second. Purchase suggestions start
collapsed inside low stock. Progress goals and the inventory-health score are
removed. Printer job totals are shown in their printer cards, not as timeline
events. Loan activity retains individual roll identity and color.

## Catalog and runtime evidence

- English source: `sha256:818795bab9fa9e9667af23236c8dfb5dd54f1fa00ff0884f8a8b827df7edd033`
- Complete catalog set: `sha256:299f9cc85a90ba8379c0ec7ea2642baa7d50acba29b0e3f259f9ae47cb81ddc1`
- Shared runtime contract: `sha256:6da02cf630aa26f06ae08d75e0a97cfe9b7ad7c2bc3c589f322186661916c4ee`

The desktop fallback, locale-parity, static-copy and Companion catalog gates
pass. Sixty localization contract tests, 26 UI localization runtime tests and
407 Companion tests pass. The six new Dashboard keys have exact translator
context; the previously reviewed uncovered-key baseline was not increased.

The new browser regression gate uses the production Dashboard, stylesheet,
I18nProvider, lazy dictionary loader, message formatter and low-stock disclosure.
Only data reads are replaced with synthetic, isolated library data. No live
library credentials or inventory data enter these artifacts. The gate runs all
21 published locales at 1200px/dark, 390px/dark and 1200px/light:

- 63 rendered views with zero JavaScript errors, horizontal document overflow
  or clipped button text, including expanded purchase suggestions.
- Purchase suggestions are verified closed before expansion.
- The new printer-usage message formats counts 0, 1, 2, 5 and 21 in each locale.
- Screenshots wait for fonts and completed rendering; software rendering avoids
  transient headless compositor capture gaps.

Reproduce with:

```sh
node --import tsx --test ui/src/pages/dashboard_locale_qa.browser.test.ts
```

Screenshots and the machine-readable per-view report are written to the ignored
`release-artifacts/visual-qa/balanced-dashboard-locales/` directory. The
fingerprint-bound `releaseQaAudits` record in `localization/locale-status.json`
records the completed artifact and runtime gates.

## Final integration checks

The production build, UI lint, bundle-size budgets, accessibility checks,
2,198 UI tests, 407 Companion tests, 23 performance tests and project contract
checks pass. Rust formatting, tests (1,098 passed; three intentionally ignored)
and debug/release Clippy checks pass. The local environment doctor reports ok.
Activity is loaded in a separate chunk to keep Dashboard navigation within its
existing size budget.

## Scope

These are browser-rendered production React views and automated localization
checks, not a new native OS screenshot matrix or a packaged Windows application
test. Existing community/maintained classification and native-review records
are unchanged; this audit does not claim native-language reviewer approval.
