# Visual modernization — implementation record

The independent critic's inventory and round reports are the approval authority.
An uninspected state is not approved. There is no preset iteration limit.

## Isolation and baseline

- Branch: `codex/visual-modernization`.
- Fresh committed synthetic fixture generated with `create-visual-qa-fixture.mjs`, copied with `prepareVisualQaDatabase`, then migrated by the current native build.
- Local working database: `tmp/visual-modernization/review.db`; 168 synthetic spools, including assigned, borrowed, loaned, empty and lost stock; 24 additional print jobs across twelve months. No production library copied or opened.
- Separate native identity `no.bliatun.filamentmanager.visualmodernization`; Companion restricted to loopback port 4285. Simulated printer observations have no host or credentials and cannot contact hardware.
- SQLite `quick_check`: ok; no foreign-key violations after enrichment.
- Initial UI build passed; 2,063 UI tests passed; Companion tests passed.
- Six main pages rendered using the repository's read-only fixture bridge in Light, Dark, Bambu, Prusa, Auto/light and Auto/dark: no automatically reported axe violations. This bridge is not native functionality evidence; gradient contrast produces incomplete results requiring separate analysis.
- White filament surface top at alpha .34 on RGB(13,21,39), with secondary text RGB(148,163,184), has a worst-case contrast of approximately 2.29:1. The .28 inset reaches only 2.85:1. A .10 overlay gives approximately 5.42:1. This confirms VM-F02 independently of axe's incomplete gradient scan.

## Design direction

Preserve recognizable navigation, useful density and all physical filament swatches. Use quieter tinted data surfaces with predictable text contrast, semantic theme colors for actions, and consistent surface depth across desktop and Companion. Bring dashboard metrics into the initial viewport, compress setup and task chrome, and keep mobile task forms reachable without unnecessary nested scrolling. Render estimates at a precision justified by their data.

## Evidence

Baseline captures, axe output and test logs are local under `tmp/visual-modernization/`. Reviewed, representative sanitized images will be copied into this report directory when changes stabilize. The critic records exact inspected surfaces, sizes, languages and themes separately; these test results do not imply full visual approval.

## First implementation package (awaiting round 2 verdict)

- Dashboard metrics now precede action/setup panels; pending setup groups share a compact responsive grid.
- Inventory and printer text surfaces use bounded tint (dark maximum alpha .10) while opaque swatches remain unchanged. A regression check covers every dark/brand base and the worst-case white gradient stop against secondary text.
- Filament actions use semantic theme colors. Companion's brand bottom navigation now consumes brand surface/selection tokens.
- Mobile stock-entry catalog height is bounded; catalog text no longer reserves the generic wide action column. Return metadata no longer repeats the counterparty, and return metrics use a compact readable scale.
- General settings remove nested presentation frames and avoid stretching the language card; immediate theme selection no longer inserts a layout-shifting banner.
- Forecast coverage uses approximate whole days/months/years and the depletion display reduces date precision as its horizon increases; numerical forecast calculations remain intact.
- Validation: UI build, native build, 2,065 UI tests, 401 Companion tests, ESLint, shared modal keyboard/zoom checks, CSS variable contracts and `git diff --check` passed. Thirty-six main-page theme scans reported no axe violations; gradient INCOMPLETE results remain explicitly outside that automated conclusion.
- Native bundle signed outside Documents in `/private/tmp/filament-modernization-20260924/` because the macOS File Provider reintroduces FinderInfo into workspace `.app` bundles. This changes only the isolated test executable location.

The critic's first retest confirms improved dashboard hierarchy and white-swatch readability, but records a new inconsistent setup counter (VM-F08) and further density/chart questions. These are open, not approved by this package.
