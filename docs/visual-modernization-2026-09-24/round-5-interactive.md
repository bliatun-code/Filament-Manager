# Independent interactive review, continuation after unlock

Status: NOT APPROVED. Actual native CUA interaction, synthetic databases only. Dark appearance (Auto follows restored system Dark); Review window 856 × 995 logical pixels. Host/Client windows 1200 × 900. Root continues fixes and mDNS investigation. This is additional evidence, not replacement of the full matrix.

Evidence directory: `tmp/visual-modernization/critic-r4-interactive/`.

| Actual state | H | T | L | F | K | V | I | R | D | A | Evidence / limitation |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Inventory 856, compact primary actions |9|9|9|9|9|9|9|9|9|8|inventory-half-window-fixed.png; actions share row, cards start ~482 logical px, all filters reachable; full keyboard traversal pending |
| Wishlist 856, one Add |9|9|8|9|9|9|8|9|9|8|wishlist-half-single-add.png; duplicate resolved, still generous full-width controls |
| Gradient detail, long title 856 |9|9|8|9|9|9|9|9|9|8|detail-gradient-half.png; wraps completely, stable single-column body; full keyboard traversal pending |
| Populated usage chart, before latest fix |8|9|7|9|9|8|8|9|7|8|detail-chart-half.png; unlabeled graphic, only latest timestamp and numeric range below; root implements real time scale next |
| Loan missing borrower, before inline fix |8|9|8|9|9|8|5|7|8|6|loan-missing-borrower-submit.png and loan-missing-borrower-error-top.png; error exists above selector but remains invisible from submit position, no invalid field indication, focus parent |
| Loan creation with 9999 g measurement |8|9|8|9|9|9|8|9|7|8|loan-max-available-accepted.png; updates measured weight despite previous Max available 525 g label. Root confirms deliberate measurement update; wording corrected, not artificial cap |
| Host guided backup flow |9|9|9|9|9|9|9|8|9|8|host-role-backup-required.png; actual export automatically validates, Done states, two-click role confirmation; narrow/keyboard not yet tested |
| Host stable-address failure |8|9|8|9|9|9|7|8|8|8|host-stable-address-timeout.png; server on but mDNS local service registration times out, pairing appropriately disabled; no recovery action at error itself |
| Client invalid pairing link |8|9|8|9|9|8|5|7|8|6|client-invalid-pairing-no-inline.png; helpful error text exists above viewport, no inline field indication; parent focus |

Host and Client were started without QA environment, with `host-interactive.db` and `client-interactive.db`. Both guided role transitions completed after exporting and automatically validating synthetic backups. Host server uses en0 and port 4287. Stable-name registration failed repeatedly, so no successful pairing, authority switch, offline fallback, or revoke coverage is claimed. System Settings Local Network read-only inspection showed Filament Manager enabled, but no separately named Visual Host/Client/Review entries; no permission settings changed.

The Review test intentionally created a loan on synthetic `visual_edge_1` with borrower Visual critic QA borrower and measured weight 9999 g, to test the stated maximum. The root confirmed measured outgoing weight may revise recorded stock; the misleading maximum label is the issue. This state is confined to interactive-r4.db.

## Actual Companion E2E image review

All nine `tmp/visual-modernization/companion-e2e-r4/01-response.png` through `09-response.png` were individually opened. These are Light, 1200 × 900 screenshots. Response callback labels drift into later UI states; functional database assertions do not establish visual feedback for the corresponding request.

1. Inventory finds Precision Flow QA at 913 g, purple swatch, search focus.
2. Detail shows empty spool weight updated, measured 1113 g minus tare 200 g = 913 g.
3. Printer slot assigned feedback, Atlas fourth slot contains Precision 913 g.
4. Printer slot cleared feedback; inventory shown, empty slot itself not shown.
5. Weight updated feedback, measured 777 g minus tare 0 g = 777 g.
6. Add modal Wishlist before receipt, Ocean Teal Qty 3 / stock now 1. This is not weight feedback.
7. Inventory contains Ocean Teal 1000 g, Wishlist spool added feedback; remaining quantity not shown.
8. Inventory already contains returned Precision 900 g; not a new active-loan image.
9. Returned loans tab shows Precision returned, borrower and separate loan/return notes. The row shows outgoing 730 g, not returned 900 g.

Root was asked for settled active-new-loan and remaining-quantity-2 images. New `companion-settled-r5` files exist but were not yet inspected when this report was written. No all-theme or phone feedback coverage is inferred from these nine pictures.

## Immediate retest of fixes

- `detail-chart-half-axes-fixed.png`: actual 856px chart now has 1000/500/0 g scale, both complete timestamp endpoints, compact height, no overlap. Data clarity now 9 for this visible state; other themes/single-point/chart interaction remain uninspected.
- `loan-missing-borrower-inline-fixed.png`: actual invalid submit focuses borrower, displays visible blue ring and pink inline message below it, scrolls to field; recovery feedback 9 for this state. Changed text now says Remaining: 525 g rather than Max available.
- `client-invalid-pairing-inline-fixed.png`: actual invalid pairing focuses field and displays recovery text directly underneath; feedback 9 for malformed-input case. Network/expired-token cases remain uninspected.
- Host relaunch via LaunchServices `open -n --env` still produced registration timeout and disabled pairing. General→Library navigation did not recover it. One bounded OS Local Network Add attempt was canceled because chooser navigation failed to resolve the exact bundle reliably. No permission change or unrelated file open occurred.

## Labels and settled Companion follow-up

Actual single label at 856px: `label-long-name-preview.png`; exported file `/Users/bliatun/Downloads/filament-label-edge_0-ptouch-24-1790206814041105000.png` was opened independently. It preserves full QR, material and reference; long family name ellipsized. Custom width 1 mm produced visible inline constraints and disabled Save (`label-custom-invalid.png`), correction to45 restored preview and enabled Save (`label-custom-recovered.png`). Tab from height reached Save and next Tab wrapped to Close. Escape dismissed nested label dialog. Initial Save succeeded but gave no visible feedback inside active modal; root subsequently patches, retest pending.

Both `companion-settled-r5/active-loan.png` and `wishlist-remaining-2.png` individually inspected. Actual390px Dark view shows outgoing-loan-created feedback, Active badge, borrower, note, Return loan; second shows Ocean Teal Qty2 on-order state. Title is partly above inner-list viewport, quantity visible. These establish only those exact states/theme/width.

## Current brand roots and populated diagnostic follow-up

All sixteen `companion-brands-r5/{bambu,prusa}-{390,834}-{storage,loans,printers,settings}.png` were individually opened. Storage maintains distinct black, white, gradient and dual-color swatches; 390px weight wraps below metadata, 834px weight aligns right. Brand bases now match their green/brown shell. Loans have one count/filter set with clear Active and Return actions. Printer telemetry wraps without overlap and slot cards preserve material identities. Settings selected appearance and language are clear. Concrete remaining layout issue: at834px Connection stretches to Appearance's roughly460px height although its contents use roughly170px, and License is pushed below left; recommend Connection and License as an independent right-hand stack. Other visible brand root visual criteria score9; Settings834 layout remains8. This image-only review does not establish additional keyboard or action behavior.

| Surface/theme/width | H | T | L | F | K | V | I | R | D | A |
|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---|
| storage/Bambu/390 | 9 | 9 | 9 | 9 | 9 | 9 | IE | 9 | 9 | IE |
| loans/Bambu/390 | 9 | 9 | 9 | 9 | 9 | 9 | IE | 9 | 9 | IE |
| printers/Bambu/390 | 9 | 9 | 9 | 9 | 9 | 9 | IE | 9 | 9 | IE |
| settings/Bambu/390 | 9 | 9 | 9 | 9 | 9 | 9 | IE | 9 | 9 | IE |
| storage/Bambu/834 | 9 | 9 | 9 | 9 | 9 | 9 | IE | 9 | 9 | IE |
| loans/Bambu/834 | 9 | 9 | 9 | 9 | 9 | 9 | IE | 9 | 9 | IE |
| printers/Bambu/834 | 9 | 9 | 9 | 9 | 9 | 9 | IE | 9 | 9 | IE |
| settings/Bambu/834 | 9 | 9 | 8 | 9 | 9 | 9 | IE | 9 | 9 | IE |
| storage/Prusa/390 | 9 | 9 | 9 | 9 | 9 | 9 | IE | 9 | 9 | IE |
| loans/Prusa/390 | 9 | 9 | 9 | 9 | 9 | 9 | IE | 9 | 9 | IE |
| printers/Prusa/390 | 9 | 9 | 9 | 9 | 9 | 9 | IE | 9 | 9 | IE |
| settings/Prusa/390 | 9 | 9 | 9 | 9 | 9 | 9 | IE | 9 | 9 | IE |
| storage/Prusa/834 | 9 | 9 | 9 | 9 | 9 | 9 | IE | 9 | 9 | IE |
| loans/Prusa/834 | 9 | 9 | 9 | 9 | 9 | 9 | IE | 9 | 9 | IE |
| printers/Prusa/834 | 9 | 9 | 9 | 9 | 9 | 9 | IE | 9 | 9 | IE |
| settings/Prusa/834 | 9 | 9 | 8 | 9 | 9 | 9 | IE | 9 | 9 | IE |

Actual Dark856 diagnostic session populated after synthetic printer revisions were incremented. `diagnostics-populated-chart.png` shows five samples, scale205/212/219, full timestamp endpoints01:46:47–01:48:14 and latest219/range205–219. Time spacing reflects the longer initial interval. Chart and selector are legible without overlap; chart data clarity9 for this exact state. Capture uses synthetic DB observations via normal Settings polling, no physical printer connection. Earlier unchanged capture was a fixture-delivery limitation, not a product defect. Other themes and table keyboard horizontal scrolling remain uninspected.

Retest: `label-save-feedback-fixed.png` shows actual Custom45×24 PNG save success in a green local message immediately below the Save button, fully visible at856px. The dialog remains open, preview remains intact. Success-feedback criterion now9 for this state; save-failure behavior relies on root regression tests and is not native visually inspected.

Historical supplemental review only: eight `companion-tasks-r3/{light,dark}-320-phone-{add-spool,detail,lend-spool,return-loan}.png` opened. Add's Borrowed-in label splits across3 lines; detail repeats the same long title in tall modal header and card. These packages precede current tint changes, so current recapture requested before classifying as current regression. Four `companion-nb-r4/light-390-{storage,loans,printers,settings}.png` opened: Norwegian visible navigation, forms and telemetry labels wrap legibly, but package predates loans cleanup and Light tint refinement; historical language fit evidence only. No current all-theme approval inferred.
