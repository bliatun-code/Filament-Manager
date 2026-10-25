# Theme refresh and official printer artwork — 2026-10-25

The accepted theme concepts are the visual reference for surface hierarchy,
contrast, blue actions, restrained outlines, and consistent line icons.

## Themes

- `auto`: follows the operating system between Gray · Soft and Light · Clean.
- `dark`: Gray · Soft, the default dark appearance.
- `dark-deep`: Gray · Deep.
- `blue`: Blue · Night.
- `light`: Light · Clean.

Existing `bambu` and `prusa` preferences resolve to `dark`. Other stored choices
are preserved. Filament colors, swatches, and semantic status colors are not
reassigned by the theme. Desktop window backgrounds follow explicit choices.
Desktop and browser Companion share the theme names and neutral surface intent.

## Printer configuration

The model picker supports search, manufacturer filtering, picture cards,
keyboard selection, Escape, focus restoration, and custom names when editing.
It changes the existing model draft; saving still uses the existing printer
configuration workflow. Model selection does not create printers or enable
live integrations by itself.

The catalog now contains 40 choices (previously 32): CORE One L, CORE One L+,
CORE One+ (Gen 2), XL+, and four CORE One+/L+ INDX configurations (4 or 8 tools).
CORE One L without INDX has a single-material profile rather than inheriting
MK-series MMU3 settings. INDX configurations use the existing toolhead workflow,
with 4/8 default tools and a maximum of 8. This is manual inventory tracking;
no new Prusa live-data protocol is implied.

Sources checked:

- https://connect.prusa3d.com/
- https://www.prusa3d.com/p/3d-printers/3d-printers-for-small-business/prusa-core-one/
- https://blog.prusa3d.com/prusa-core-one-gen-2-indx-shipping-has-started-complete-printers-open-for-orders_137623/
- https://github.com/bambulab/BambuStudio/tree/79df7ae309be398ed30c9f397c13c9911c2edc57/resources/profiles/BBL

All 14 current Bambu Studio model codes were already represented in the catalog.
Existing Creality, Anycubic, legacy Prusa, and custom entries are retained.

## Artwork and icons

31 unmodified official thumbnails are bundled locally. `sources.json` records
each upstream URL, revision/tag, license and SHA-256. The model mapping is explicit,
case-insensitive and trim-tolerant; unknown names do not receive a guessed photo.
Prusa MMU and XL toolhead variants have separate artwork where available.

Some closely related revisions share a family image: CORE One/+/Gen 2,
CORE One L/L+, MK4S/MK3.9S, MK3.5/MK3.5S, and XL/XL+. The new INDX variants and
unrepresented manufacturers use the neutral illustration until suitable licensed
artwork is available. The thumbnails are equipment identifiers, not exact visual
proof of accessories, connectivity or live-data support. Upstream backgrounds
and Input Shaper markings remain intact.

Lucide supplies the common outline icons. Copyright, ISC/Feather notices, both
upstream AGPL texts, application notices and image provenance are emitted into
`ui/dist/licenses/` during production builds, and are therefore bundled offline.

## Validation

`node scripts/run-theme-visual-qa.mjs` renders production components with isolated
test data. It covers all five choices on Inventory, Printers, General settings,
Printer settings, model selection and spool properties; checks image loading,
WCAG AA findings, narrow-window overflow, expanded diagnostics, confirmation
controls, model selection, custom names, focus and operating-system changes.
Screenshots and machine-readable evidence are in
`release-artifacts/visual-qa/themes/` (ignored local review artifacts).

The installed release is not replaced by this preview workflow. No commit or
push is part of this review step.

The new theme labels and model picker were also rendered in all 21 published
locales at 1440px and 390px, with no runtime errors, missing labels, fallback
review rows or page overflow. Evidence and 84 screenshots are in the `locales/`
subdirectory. The localization audit records only machine catalog/runtime QA;
it does not claim native-language approval.
