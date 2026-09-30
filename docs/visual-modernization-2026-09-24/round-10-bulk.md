# Uavhengig native bulk-kontroll — runde 10

Ikke sluttgodkjent. Faktisk Review-bundle med `interactive-r4.db`, Dark, 1200×900 logisk vindu (2400×1800 screenshot). Ingen produksjonsdata. Alle nevnte PNG-er ble vist individuelt gjennom CUA før lagring.

## Faktisk forløp

1. Valgte #w_0150 (ABS White40100,325g). Move åpnet lokasjonsfelt i felles kontrollhøyde, én pil; bare QA Shelf A fantes, så ingen flytting utført.
2. Søk edge_1 beholdt førstevalg og viste «1 selected total ·0 in this view». Valgte også edge_1, aktivt utlån, og fikk2total/1view.
3. Change status→In stock→Review avviste hele utvalget med konkret navn/ID og «active loan. Return it before changing placement or status». Intet lagret.
4. Fjernet edge_1 fra utvalg. Review In stock ga korrekt no-op-melding med ABS White/#w_0150.
5. Valgte Lost. Review viste1selected/1affected/0unchanged/Lost og atomisitetsforklaring, men ingen berørt rullidentitet. Eneste synlige inventarkort var den uvalgte edge_1.
6. Bekreftet reversibel Lost-status på isolert syntetisk #w_0150. «Updated rolls:1». Søk w_0150+Lost fant rullen med325g bevart.
7. Valgte den på nytt og gjennomførte In stock-review/bekreftelse. Lost-filter ga0; In stock ga1 og325g. Opprinnelig status gjenopprettet gjennom UI.

## Funn og karakterer

- F/K8: valgt Move/Change status og Review/Confirm bruker fremdeles sterk cyan/blå handling i Dark, mens øvrige primærhandlinger er hvite. Ikke filamentdata. Root varslet for temajustering.
- I8: review identifiserer bare antall og mål, ikke skjulte berørte ruller. Ved utvalg på tvers av søk kan brukeren ikke kontrollere hva som endres. Root forbereder berørtliste.
- K/V9 for faktisk selectgeometri: både Location og Status har tydelig kant, vanlig kontrollhøyde og én pil. Dette retester bare Dark; andretemaer/keyboard/smal kontroll gjenstår.
- Dataintegritet i utført statusløp: D9. Crossfilterutvalg, beskyttet aktivt lån, no-op, kvittering, Lost→In stock og bevart325g faktisk observert.

| Tilstand | H | T | L | F | K | V | I | R | D | A |
|---|---|---|---|---|---|---|---|---|---|---|
| Dark Move/Status-kontroller |9|9|9|8|8|9|9|IE|9|IE|
| Dark beskyttet crossfiltervalg |9|9|9|8|8|9|9|IE|9|IE|
| Dark review skjult rull |9|9|9|8|8|9|8|IE|9|IE|
| Dark lagret/gjenopprettet |9|9|9|9|9|9|9|IE|9|IE|

## Bilder

- Move-kontroll (lokalt bevis: `tmp/visual-modernization/critic-r4-interactive/bulk-move-control-dark-r10.png`)
- Beskyttet crossfilterutvalg (lokalt bevis: `tmp/visual-modernization/critic-r4-interactive/bulk-protected-crossfilter-dark-r10.png`)
- Review skjult utvalg (lokalt bevis: `tmp/visual-modernization/critic-r4-interactive/bulk-hidden-selection-review-dark-r10.png`)
- Lost lagret (lokalt bevis: `tmp/visual-modernization/critic-r4-interactive/bulk-lost-saved-dark-r10.png`)
- In stock gjenopprettet (lokalt bevis: `tmp/visual-modernization/critic-r4-interactive/bulk-restored-instock-dark-r10.png`)

## Runde 13: faktisk retest ved Dark 856

Skjult katalogmottak #9000_1 ble beholdt valgt ved søk edge_2. Review Lost viste korrekt ABS Bambu Green40500, faktisk grønn swatch og ID fra hele lageret, ikke den synlige uvalgte rullen. Change og Confirm hadde nå felles hvit primærstil. Cancel returnerte fokus til Change uten mutasjon. Deretter ble edge_2 også valgt: begge identiteter og hvit/grønn swatch var synlige; det lange Spectrum2-navnet brøt lesbart over to linjer. Også dette ble avbrutt. F/K/I8 lukkes for disse konkret retestede Dark856-tilstandene. Stor rullbar liste, øvrige temaer og full tastatursyklus gjenstår.

Bilder individuelt sett: `bulk-hidden-identity-fixed-dark856-r13.png`, `bulk-long-identities-dark856-r13.png` i samme capturemappe.

| Tilstand | H | T | L | F | K | V | I | R | D | A |
|---|---|---|---|---|---|---|---|---|---|---|
| Dark856 skjult + langt utvalg, rettet |9|9|9|9|9|9|9|9|9|IE|

Lokale bevisfiler i `tmp/` følger ikke den publiserte rapporten. Referansene identifiserer historiske lokale opptak, ikke nedlastbare vedlegg.
