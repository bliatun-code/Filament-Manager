# UI Polish TODO

Current browser terminology note:
- the browser companion calls the stock root `Storage`; the desktop app still says `Inventory` / `Lager`
- browser intake is a real `Add spool` sheet now, even though some older notes below still say `Add filament`

## Webapp / Small Screens
- Current active track:
  - keep the trusted-LAN backend/security/workflow baseline frozen
  - work only on webapp/browser-shell UI unless a real reproduced UI blocker requires deeper changes
- Highest-priority cleanup targets now:
  - iPhone first-viewport hierarchy:
    - shared topbar + root-header duplication is calmer now; keep the next passes focused on any remaining stacked helper surfaces rather than bringing back large repeated headings
    - root-level refresh duplication is gone too; keep refresh/session management anchored to `Settings` → `Connection` instead of letting utility actions drift back into every root
    - reduce stacked chrome before real work starts in `Storage`, `Loans`, `Printers`, and `Settings`
  - utility sheets and modal calmness:
    - phone task sheets are now scrollable and top-anchored; keep the next passes focused on calmer inner content and action rhythm instead of basic popup reachability
    - make the restored add-spool, return, and detail/task surfaces feel more like compact operational tools and less like stacked admin panels
  - touch rhythm and primary-action clarity:
    - preserve obvious main actions while helper chips, warnings, and secondary controls stop fighting for the same visual weight
  - paired-browser and Browser access density:
    - keep the cleaner desktop Settings baseline, but continue reducing timestamp/log-like noise if screenshots still show clutter
  - printer-board overflow on phone:
    - keep slot cards readable and action-focused when long references, warnings, or chooser state appear together
  - small-screen visual hierarchy:
    - prefer fewer louder surfaces, shorter copy, calmer empty states, and clearer section order over more decorative wrappers
  - locale follow-through where it helps the same UI pass:
    - keep English/Norwegian browser copy short, human, and consistent while polishing the same surface
- Latest cleanup pass done (2026-04-05):
  - closeout/tech-debt note:
    - Bambu catalog refresh is now runtime-self-contained in Rust (no Node/npm dependency in packaged desktop refresh path)
    - QR/reference UI now favors canonical spool-id based flow (legacy/manual QR-reference exposure is reduced in UI surfaces)
    - remaining frontend technical debt is bundle splitting: `settings` chunk currently exceeds the 500 kB warning threshold in production build
  - inventory overview print pipeline hardening:
    - switched from HTML print surface to generated A4 landscape PDF output for predictable page layout
    - print layout now uses explicit PDF pagination, 2-column row distribution, and material-group sections
    - swatch + QR + filament info rows remain in the output, but layout control no longer depends on browser print CSS behavior
  - webapp i18n hardening:
    - removed hardcoded English fallback strings from recovery/detail shell paths
    - added missing localized recovery/detail keys used by `companion_logic.js`, `companion_app_shell.js`, and `shell_chrome.js`
    - localized detail fallback copy (`Spool`, `Spool details`, no-selection states)
  - stale-status cleanup:
    - success status auto-clear reduced from `20s` to `8s` to avoid stale banners across tabs
  - companion dictionary cleanup:
    - removed no-longer-used manual detail QR edit labels (`detail.qrCode`, `detail.qrPlaceholder`, `detail.saveCode`)
- Latest pass done (2026-04-04):
  - companion QR behavior pass:
    - QR deep-link payloads now auto-open spool detail on companion load (`spool_qr` / `qr_code` URL params)
    - QR exposure is now constrained to spool detail editing and label output; Storage QR lookup button/sheet, list QR metadata, and add-sheet QR input are removed
    - spool detail popup now shows a generated QR preview image for the selected spool (`/api/v1/spools/:spool_id/qr-image.svg`) so printed and on-screen scans use the same companion destination pattern
    - label printing now includes a real QR image and required filament text (vendor, material, filament name, color if present)
    - compatibility remains for legacy reference values plus versioned payloads
  - detail modal + task-sheet backdrops now follow explicit app theme mode (light/dark/auto) instead of relying only on OS dark preference
  - dense card stacks in browser shell (`loan`, `slot`, `metric`) now use calmer depth to reduce visual noise
  - cross-flow CTA hierarchy is clearer in `Loans` (`Return loan` is now the primary action on active rows)
  - copy on `Storage` add-sheet, `Printers`, and `Settings` was shortened to reduce admin-like wording
  - detail modal now uses a calmer single-edit-path setup:
    - removed duplicate top reference chip and duplicate weight chip
    - removed detail status/location edit pane
    - removed redundant loan-lock helper block in detail edit section
  - add-spool sheet now starts directly with source selector (removed duplicate intro block)
  - return task sheet no longer stretches metadata cards vertically
  - dark mode consistency fix:
    - `Auto` + dark now uses the same background/glow/text-muted palette as explicit dark mode


## Selected Filament Popup
- Information-first cleanup is done
  - Duplicated status and remaining presentation removed from the popup body
  - Header and overview restyled to match the rest of the app
  - QR, metadata editing, weight update, chart, history, and danger zone kept in place
  - Verified in light and dark mode
- Smaller-width hardening is done
  - Reference summary now gives long spool IDs more room
  - Summary grid is less rigid at the app's practical minimum width
- History cleanup is done
  - Repetitive printer-slot assignment rows are hidden from the visible history list
  - A short hint and better filtered-empty state keep the popup understandable
- Keep an eye on close button visibility, spacing, and sticky behavior during longer real-world usage

## Add Spool / Add Filament
- Cleanup is done
  - Sticky header and shared selection preview now match the selected-filament popup language
  - Stock-entry and wishlist sections now share the same surface hierarchy and swatch-tinted action styling
  - Vendor, catalogue-status, and wishlist-order filtering now use the same calmer segmented-control language instead of loose chip clusters
  - The right-side queue area now reads as one `Wishlist & orders` section with clearer counts and less competing micro-chrome
  - Ownership selection and per-row wishlist status controls now follow the same segmented-control baseline, so the modal no longer mixes several unrelated toggle styles
  - Queue rows now separate status choice from actions, which makes `Wishlist`, `On order`, `Received`, `Stock roll now`, and `Remove` read more like one workflow
  - Redundant headings/helper text were reduced and the layout was rebalanced for narrower widths
  - Verified in light and dark mode
- Browser-shell baseline is restored too
  - `Storage` now exposes a real `Add spool` sheet again instead of a borrowed-in-only shortcut
  - Bambu/eSUN/manual source selection, vendor-backed or manual owned-stock entry, borrowed-in stock entry, and wishlist queue actions now live in the same phone-first task sheet
- Smaller-width hardening is done
  - Modal width constraints and small form grids are more forgiving at the app's practical minimum width

## Inventory
- Grouped filament card cleanup is done
  - Header duplication reduced
  - Row hierarchy simplified
  - The `Loaned out rolls` side panel was removed from `Inventory` to avoid duplicating the dedicated `Loans` tab
  - Verified in light and dark mode
- Header action cleanup is done
  - Action buttons are more prominent and behave better at narrower widths
- Borrowed-filament side panel cleanup is done
  - Side panel now stays visually balanced with the main grid at the normal app width
  - Active-loan rows and empty state now match the rest of the app more closely
  - Verified in light and dark mode

## Loans
- Loans page cleanup is done
  - Search/filter controls and top actions are aligned with `Lager` and `Printere`
  - Compact loan cards are more readable and the usage panel is more cohesive
  - The `Usage by person` side panel was removed from `Loans` to avoid duplicating the dedicated analytics in `Statistikk`
  - The top summary now skips the redundant `Returned records` tile, so the page rhythm matches the simplified `Inventory` baseline better
  - The remaining top summary strip was removed, so `Loans` now goes directly from filters to `Loan history`
  - Spool references on loan cards and return dialogs now use the same short `#xxxxxx` format as `Inventory`
  - Active loan rows now put `Return loan` first as the primary CTA; `Open spool` remains secondary for context-first drilldown
  - History cards and the return dialog now use denser summary slabs instead of multiple equally weighted mini-cards
  - Long filament references now collapse into calmer human-readable labels instead of dominating the card
  - Verified in light and dark mode
- Loan-out dialog cleanup is done
  - Available-roll list and selected-roll form now read as balanced companion panels instead of a loose list plus a large slab
  - List rows now show human placement labels instead of raw internal printer-slot ids
  - The selected-roll preview now gives placement more space and keeps reference/remaining metadata calmer
  - Light mode now keeps the same white modal baseline as `Legg til filament`, with tinting focused on the selected roll instead of the whole popup shell
  - Verified in light and dark mode

## Printers
- Slot and selected-slot cleanup is done
  - Vendor tinting is stronger and more controlled in dark mode
  - Slot cards and selected-slot panels no longer fall back to white/washed surfaces
  - Status presentation is more human-readable
  - Verified in light and dark mode
- Header action and usage-summary cleanup is done
  - Page-top action area now reads as a cohesive control cluster instead of a lone button
  - Compact usage stats now use summary tiles that better match `Lager` and `Utlån`
  - Verified in light and dark mode
- Browser-shell copy pass is done
  - subtitle is shorter and more action-oriented
  - roster heading now uses the simpler `Printers` label
- Shared weight prompt cleanup is done
  - Save-only modal now uses the same stronger header/body/footer language as the rest of the app's polished dialogs
  - Verified in light and dark mode
- Add-printer dialog cleanup is done
  - The popup now follows the same white light-mode modal baseline as `Legg til filament` instead of reading as a separate gray sheet
  - Model, name, and capacity inputs now have visible labels, so the capacity step no longer depends on unlabeled bare number fields
  - Verified with `npm run smoke`; real Mac-app review is still recommended for native blur and live `Auto` theme switching

## Dashboard
- Supporting-panel cleanup is done
  - `Nylig aktivitet` now uses clearer activity cards with helper copy and count context
  - `Lagerhelse` now uses a score + compact metric tiles instead of one dense summary line
  - `Fremdriftsmål` now uses live dashboard metrics for location coverage, logged jobs, and slot readiness instead of placeholder percentages
  - each goal card now explains what the percentage measures so the progress reads as product truth instead of decorative chrome
  - slot-related summaries now treat `EXT` and `AMS` as mutually exclusive printer paths instead of additive capacity
  - the consumption chart and lower goal-card row now adapt properly in wide/fullscreen desktop windows instead of keeping a narrower fixed plot/layout
  - the dashboard snapshot now refreshes while the page remains open, the refresh loop is now backed by native Tauri focus/resize signals, and progress goals keep their last good slot metrics while transient refresh retries settle
  - Verified in light and dark mode

## Statistics
- Supporting-panel cleanup is done
  - `Forbruk per printer` and `Utlånsforbruk per person` now use clearer companion cards with helper copy and compact metric tiles
  - `Utlånsforbruk per person` now has inline list filters (`All`, `Active`, `Completed`) and opens with `Active` as default for a more action-oriented first view
  - Breakdown modals now use stronger filter surfaces, calmer empty states, and more cohesive result cards
  - Verified in light and dark mode

## Settings
- Shell hierarchy cleanup is done
  - page header, tab row, and `General` cards now follow the calmer desktop rhythm more closely instead of reading like utility chips glued under a title
  - `Program maintenance` no longer shows the passive top-right `Validate backup file` pill; backup validation now lives only in `Import and validation` where the action actually is
  - `Browser access` now uses a lighter, more theme-aware top surface in light mode while keeping a darker operational feel in dark mode
  - the `Browser access` server and pairing blocks now use shorter copy, a calmer control card, and less repeated status chrome so dark mode reads more like one operational surface and less like stacked admin panels
  - verified with `npm run smoke`; native Mac-app review is still recommended for true window blur and live `Auto` switching
- Browser-shell copy tightening is done
  - subtitle/help/connection wording is shorter and easier to scan
  - refresh CTA label is now shorter (`Refresh data`)
- General-tab print support is extended
  - Added `Print A4 inventory overview` action under `Settings -> General`
  - Print layout now uses list rows with swatch + QR + core filament details (vendor/material/filament/color)
  - Rows are sorted by material for easier shelf/stock review
- Catalog and maintenance support-card cleanup is done
  - `Filamentkatalog` now uses clearer refresh and swatch-quality companion cards with compact metric summaries and better action grouping
  - `Programvedlikehold` now uses structured backup/export and import/validation panels that better match the rest of the app
  - Reset cards were intentionally left warning-oriented instead of being normalized into neutral cards
  - Verified in light and dark mode
- Swatch bulk-action feedback is fixed
  - Bulk autofill no longer depends on a silent browser confirm path inside Tauri
  - First click now shows an in-panel confirm state, and zero-update bulk runs now surface a real error message
  - Verified in the live app before running the second confirm click

## Shared Support Surfaces
- Feedback-banner cleanup is done
  - `Inventory`, `Loans`, `Printers`, `Statistics`, and `Settings` now use the same calmer success/warning/error banner treatment
  - dark mode no longer falls back to older light-only feedback panels on those surfaces
  - verified with `npm run smoke`
- Secondary modal chrome cleanup is done
  - `Loans`, `Printers`, `Statistics`, and the shared loan-out dialog now use a more consistent header, close affordance, panel radius, and calmer copy
  - light mode now also keeps those smaller modals on a clearer white baseline closer to `Legg til filament`
  - light, dark, and auto should now feel closer to the same product when moving between smaller operational dialogs
  - real Mac-app visual review is still recommended for native blur, titlebar, and system-theme switching behavior
- Browser-shell overlay consistency is improved
  - detail modal + task-sheet backdrops now stay consistent with explicit theme mode (`light`, `dark`, `auto`) in the trusted-LAN shell

## Themes
- Light mode:
  - Keep the softer blue/gray surfaces
  - Preserve strong text contrast
- Dark mode:
  - Prevent light-mode gradient bleed into any remaining secondary panels outside the now-polished inventory/printer areas
  - Allow slightly stronger color presence for filament/printer tinting
  - Keep panels readable and consistent with the global design language

## Global Consistency
- Align:
  - modal headers
  - card padding
  - filter groups
  - button hierarchy
  - chip styling
- Keep smaller-window behavior smooth in sticky headers, action areas, popup summaries, shared dialogs, and long reference values
- Remove unnecessary eyebrow labels where they do not add real value
- Prefer short, human-readable labels over internal/system-like strings
