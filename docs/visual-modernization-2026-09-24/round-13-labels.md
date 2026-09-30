# Faktisk native etiketteksport — runde 13

Ikke sluttgodkjent. Isolerte Review/Host-bundler, syntetiske ruller. Alle nevnte UI-bilder er individuelt sett.

Review QA-loopback ga generisk PDF-feil både for alle og én rull. Root fant faktisk frontend-prerequisitefeil: stabil Companion-adresse mangler. Dette er et produktkrav; ikke en påvist canvas-/mengdefeil. Forklaring/sted for retting må være synlig i dialogen. Root har en oppfølgingspatch; aktuell retest gjenstår.

Normal Host har stabil Bonjour-adresse. Faktisk 156 etiketter bygget med 30 per side, seks sider. A4-side1–6 ble sett ved paging; side2–6 er lagret. Paging beholdt bunnscroll, slik at øverste rad lå bak fast dialogoverskrift til oppscroll. Det er preview-scrolltilstand, ikke bevis for klippet PDF. Dark valgt papir og Save PDF var fortsatt cyan (F/K8), varslet root.

A4 Save viste Saving PDF, lukket deretter dialogen og viste vedvarende konkret filsti i Inventory. US Letter ble valgt i ny preview; papirformat/marger endret seg synlig og 30-ruters arket fikk korrekt kortere form. Letter Save viste også Saving PDF, deretter lukket dialog og konkret filsti. Ingen feil eller duplisert bekreftelse i observerte forløp.

Faktiske filer (syntetiske QR-ark; ikke publiser):
- `/Users/bliatun/Downloads/filament-inventory-labels-a4-1790212597148275000.pdf`
- `/Users/bliatun/Downloads/filament-inventory-labels-letter-1790212838821227000.pdf`

Root har renderet og individuelt sett alle seks A4-sider: 595.276×841.89pt, 30×5+6 etiketter; ingen overlapping/sideklipping, lange navn bruker ellipsis. Dette er roots selvstendige PDF-bevis, ikke kritikers egen inspeksjon av filrender. Letter-fil sendt root for tilsvarende kontroll.

Bilder under `tmp/visual-modernization/critic-r4-interactive/`: `label-all-stock-failure-dark856-r13.png`, `label-a4-save-result-host-dark-r13.png`, `label-letter-host-dark-r13.png`, `label-letter-save-result-host-dark-r13.png`, samt A4 pagingcaptures.

| Tilstand | H | T | L | F | K | V | I | R | D | A |
|---|---|---|---|---|---|---|---|---|---|---|
| Host Dark A4/Letter preview |9|9|9|8|8|9|9|IE|9|IE|
| Host Dark faktisk lagring/bekreftelse |9|9|9|9|9|9|9|IE|9|IE|
| Review manglende QR-forutsetning før retting |9|9|9|9|9|9|8|9|9|IE|

Øvrige temaer, smal preview, komplett tastaturkontroll, ny lokal prerequisitefeil og temaknapper må retestes konkret. Native PDF-lagring i Dark er nå faktisk utført for begge formater.

## R15 retester

- Faktisk Review Dark856 viser nå lokal konkret QR-forutsetning og Settings-sti uten falskt tomt ark; Close har initialfokus. Bilde `label-prerequisite-fixed-dark856-r15.png`. I8 lukket. Bunnspacing var flush og er deretter justert av root; ny spacing ikke sett ennå.
- Host Dark vellykket preview: Save/valgt Letter nå hvit primær, K8 lukket. Men valgt Letters dimensjonstekst forblir lys grå på hvitt (konkret F8, root varslet). `label-paper-primary-fixed-host-dark-r15.png`. Ingen ny eksport nødvendig for ren stilretast; begge filer allerede faktisk lagret.
- Root har også individuelt sett alle seks Letter-PDF-sider med samme156 etiketter og uten overlapping/klipping. Dette er roots filrenderbevis.

Valgt papir-hint faktisk retestet i Host Dark: `label-selected-hint-fixed-host-dark-r15.png` individuelt sett, mørk dimensjonstekst på hvitt, tydelig Close-fokus. F8 lukket til9 for denne previewtilstanden. Resttemaer/keyboard/smalbredde fortsatt eksplisitt utestet.
