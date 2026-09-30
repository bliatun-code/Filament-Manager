# Uavhengig kritikk — runde4 målrettet og interaktiv native

**Ikke samlet godkjent.** Åtte målrettede Dark/Light-bilder er åpnet individuelt. Interaktiv kontroll bruker egen172-rullers databasekopi `interactive-r4.db`, native WKWebView og CUA. Temaswitch bruker ekte kontroller; Auto ble testet ved ekte macOS Dark→Light→Dark og opprinnelig Dark gjenopprettet. Ingen fysiske printerkommandoer. Alle10kriterier som round-2; IE mangler bevis.

## dark

| Flate | H | T | L | F | K | V | I | R | D | A | Observasjon |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| [inventory-overview](/Users/bliatun/Documents/Codex/bambu-filament-manager/tmp/visual-modernization/critic-r4/native-en-dark/inventory-overview.png) | 9 | 9 | 8 | 9 | 9 | 9 | 8 | 8 | 9 | 8 | Toolbar consolidated; search/status adjacent. Clearly more stock visible with all controls present; calm accurate white/black/orange swatches. |
| [settings-general](/Users/bliatun/Documents/Codex/bambu-filament-manager/tmp/visual-modernization/critic-r4/native-en-dark/settings-general.png) | 9 | 9 | 9 | 9 | 9 | 9 | 8 | IE | 9 | 8 | Language select actually40px with clear arrow. Grouping coherent. Scenario scroll places title partly behind sticky navigation; interactive check needed. |
| [wishlist-queue](/Users/bliatun/Documents/Codex/bambu-filament-manager/tmp/visual-modernization/critic-r4/native-en-dark/wishlist-queue.png) | 7 | 9 | 7 | 9 | 7 | 8 | IE | IE | 8 | 8 | Regression duplicate Add CTA in page header and inner toolbar; inner action still costs row. Qty label and selected active status corrected. Root notified. |
| [selected-roll-history](/Users/bliatun/Documents/Codex/bambu-filament-manager/tmp/visual-modernization/critic-r4/native-en-dark/selected-roll-history.png) | 9 | 9 | 9 | 9 | 9 | 9 | IE | IE | 9 | 8 | Full-width six-event history removes half-empty dialog, long complete title wraps. Populated weight chart exists above viewport; not inspected yet. Footer/actions remain visible. |
## light

| Flate | H | T | L | F | K | V | I | R | D | A | Observasjon |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| [inventory-overview](/Users/bliatun/Documents/Codex/bambu-filament-manager/tmp/visual-modernization/critic-r4/native-en-light/inventory-overview.png) | 9 | 9 | 9 | 9 | 9 | 9 | IE | IE | 9 | 8 | Toolbar consolidated; search/status adjacent. Clearly more stock visible with all controls present; calm accurate white/black/orange swatches. |
| [settings-general](/Users/bliatun/Documents/Codex/bambu-filament-manager/tmp/visual-modernization/critic-r4/native-en-light/settings-general.png) | 9 | 9 | 9 | 9 | 9 | 9 | 8 | IE | 9 | 8 | Language select actually40px with clear arrow. Grouping coherent. Scenario scroll places title partly behind sticky navigation; interactive check needed. |
| [wishlist-queue](/Users/bliatun/Documents/Codex/bambu-filament-manager/tmp/visual-modernization/critic-r4/native-en-light/wishlist-queue.png) | 7 | 9 | 7 | 9 | 7 | 8 | IE | IE | 8 | 8 | Regression duplicate Add CTA in page header and inner toolbar; inner action still costs row. Qty label and selected active status corrected. Root notified. |
| [selected-roll-history](/Users/bliatun/Documents/Codex/bambu-filament-manager/tmp/visual-modernization/critic-r4/native-en-light/selected-roll-history.png) | 9 | 9 | 9 | 9 | 9 | 9 | IE | IE | 9 | 8 | Full-width six-event history removes half-empty dialog, long complete title wraps. Populated weight chart exists above viewport; not inspected yet. Footer/actions remain visible. |

## Interaktivt bekreftet

- Actual native Light/Bambu/Prusa/Dark theme clicks update whole chrome and selected state.
- Actual macOS Dark to Light to Dark with app Auto selected updates native after system settles; original Dark restored and verified.
- EN to NB mouse selection and NB to EN keyboard Up/Return work. Old-language success toast remains a confirmed minor mismatch.
- Language Tab goes checkbox with visible focus; ShiftTab returns picker. No checkbox toggled.
- Dashboard chart12 keyboard reachable data points including0g first and193g last; visible focus and nonclipped tooltip. ShiftTab works. Enter on chart header navigates Statistics.
- Statistics consumption modal: initial Close; ShiftTab wraps Reset; keyboard opener restored after Escape. AX mouse click had different initial focus, not product defect.
- Actual window menu resize856x995: Statistics2x2metrics and inventory2columns fit; More filters reveals all groups. Header CTA rows still waste space.

Bevisbilder: [interaktiv mappe](/Users/bliatun/Documents/Codex/bambu-filament-manager/tmp/visual-modernization/critic-r4-interactive/). Dashboardgrafens interaksjon9 på observert Dark/Auto, tilgjengelighet9 for den konkrete keyboardsekvensen. Settings I8 på språktoast; ellers reelle toggle- og språkbytter fungerer. Statistics-dialog I9 for keyboardåpning/fokussperre/retur på observert tilstand. Dette er ikke automatisk9 for alle flater.

## Gjenstående og avbrudd

- Window drag did not resize; statistics-narrow.png is full-size, not reflow evidence.
- language-open.png excludes OS popup; popup existence/options verified only in AX.
- Inventory Spectrum search interrupted by locked Mac before state verified.
- No200%zoom, no Host/Client pairing, no full revised51x4matrix.

CUA stoppet med «The Mac is locked and automatic unlock could not unlock it». Native videre interaksjon krever brukerens manuelle opplåsing. Lagrede bilder og øvrig read-only analyse fortsetter. Implementer fikk klarsignal til separat liten retting etter siste bilde; rapporten gjelder før disse endringene.
