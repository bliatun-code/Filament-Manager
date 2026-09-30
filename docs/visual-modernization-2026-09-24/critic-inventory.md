# Uavhengig visuell kartlegging — 24. september 2026

Dette er kartlegging før visuell inspeksjon, ikke godkjenning. Kritikeren implementerer ikke produktendringer. Ingen tidligere karakterer arves. Vurderingsankrene og de ti kriteriene i brukeroppdraget gjelder enkeltvis; 9 i gjennomsnitt godkjenner ikke et kriterium under 9.

## Tema- og skjermmatrise

Desktop og Companion har fem valgbare modus: Auto, Light, Dark, Bambu og Prusa. Auto må observeres med både lyst og mørkt systemutfall og ved faktisk bytte. Bambu (`#00AE42`) og Prusa (`#FD5000`) er egne mørkbaserte temaer. Ingen separat brukerdefinert aksentvelger er identifisert i temaregistrene. Hver eksplisitt modus får separat visuell inspeksjon; automatisk modus dokumenteres for begge utfall. Tekst, grenseflater, handlinger, fokus/hover/valg/deaktivert, semantisk status, diagrammer og ekte filamentfarger sjekkes.

Målbredder: desktop 1440 og ca. 1024–1280 etter faktisk native skjermbegrensning, Companion 1440, 834, 390 og 320 piksler. 200 % zoom prøves for modal og arbeidsflater. Norsk bokmål og engelsk dekker utfordrende tekstlengder. Målt viewport skal alltid registreres; ønsket størrelse er ikke bevis for faktisk størrelse.

## Eksisterende desktop-scenarier

Det eksisterende manifestet er et startpunkt. Rutenavnene nedenfor er ikke bevis for at tilstanden er åpnet eller har relevante data.

| ID | Scenario | Type | Status |
|---|---|---|---|
| D01 | `dashboard-overview` | overview | Ikke evaluert |
| D02 | `dashboard-onboarding` | workflow | Ikke evaluert |
| D03 | `dashboard-consumption` | overview | Ikke evaluert |
| D04 | `inventory-overview` | overview | Ikke evaluert |
| D05 | `inventory-locations` | overview | Ikke evaluert |
| D06 | `add-filament` | modal | Ikke evaluert |
| D07 | `wishlist-queue` | modal | Ikke evaluert |
| D08 | `bambu-batch-add` | modal | Ikke evaluert |
| D09 | `loans-overview` | overview | Ikke evaluert |
| D10 | `loan-out` | modal | Ikke evaluert |
| D11 | `selected-roll` | modal | Ikke evaluert |
| D12 | `selected-roll-label` | modal | Ikke evaluert |
| D13 | `selected-roll-history` | modal | Ikke evaluert |
| D14 | `selected-roll-danger-zone` | modal | Ikke evaluert |
| D15 | `rfid-capture` | modal | Ikke evaluert |
| D16 | `return-loan` | modal | Ikke evaluert |
| D17 | `return-inbound-loan` | modal | Ikke evaluert |
| D18 | `printer-board` | overview | Ikke evaluert |
| D19 | `printer-overview` | overview | Ikke evaluert |
| D20 | `add-printer` | modal | Ikke evaluert |
| D21 | `printer-slot-assignment` | workflow | Ikke evaluert |
| D22 | `printer-slot-onboarding` | modal | Ikke evaluert |
| D23 | `printer-rfid-override` | modal | Ikke evaluert |
| D24 | `printer-ams-weight-estimate` | modal | Ikke evaluert |
| D25 | `printer-slot-replacement` | modal | Ikke evaluert |
| D26 | `printer-slot-clear` | modal | Ikke evaluert |
| D27 | `settings-general` | settings | Ikke evaluert |
| D28 | `settings-filament-defaults` | settings | Ikke evaluert |
| D29 | `settings-updates` | workflow | Ikke evaluert |
| D30 | `settings-inventory-label-sheet` | modal | Ikke evaluert |
| D31 | `settings-library` | settings | Ikke evaluert |
| D32 | `settings-library-role-change` | modal | Ikke evaluert |
| D33 | `settings-library-network-details` | settings | Ikke evaluert |
| D34 | `settings-library-network-editor` | settings | Ikke evaluert |
| D35 | `settings-library-pairing` | settings | Ikke evaluert |
| D36 | `settings-library-browsers` | settings | Ikke evaluert |
| D37 | `settings-library-browsers-history` | settings | Ikke evaluert |
| D38 | `settings-printer-diagnostics` | settings | Ikke evaluert |
| D39 | `settings-printer-diagnostics-fields` | settings | Ikke evaluert |
| D40 | `settings-printer-diagnostics-paused` | settings | Ikke evaluert |
| D41 | `settings-printer-editor` | settings | Ikke evaluert |
| D42 | `settings-printer-editor-dirty` | settings | Ikke evaluert |
| D43 | `settings-printer-editor-discard` | settings | Ikke evaluert |
| D44 | `settings-catalog` | settings | Ikke evaluert |
| D45 | `settings-catalog-swatch-review` | settings | Ikke evaluert |
| D46 | `settings-maintenance` | settings | Ikke evaluert |
| D47 | `settings-application-diagnostics` | settings | Ikke evaluert |
| D48 | `statistics-overview` | overview | Ikke evaluert |
| D49 | `statistics-consumption` | modal | Ikke evaluert |
| D50 | `statistics-borrower` | modal | Ikke evaluert |
| D51 | `statistics-loans` | workflow | Ikke evaluert |

## Tilleggsflater og tilstander som skal spores

| ID | Flate/tilstand | Status |
|---|---|---|
| X01 | Appskall: alle hovedruter, smalt vindu, fokus, navigasjon og oppdateringsbanner | Ikke evaluert |
| X02 | Lager: søk, filter, sortering, mange treff, ett treff, null treff, tomt bibliotek | Ikke evaluert |
| X03 | Massehandlinger: utvalg på tvers av filtre, flytting, status, review, beskyttet rull, kvittering | Ikke evaluert |
| X04 | Filamentdetaljer/redigering: vekt, tare, status, validering, lokasjon, eierskap, lange historikker | Ikke evaluert |
| X05 | Lokasjoner: opprett/rediger/arkiver/gjenopprett/slå sammen/slettebekreftelse | Ikke evaluert |
| X06 | Registrering: katalog/manuell/lånt inn, Bambu-batch, tvetydig match, manglende pris/farge, feil | Ikke evaluert |
| X07 | Ønskeliste/bestilling: fylt kø, mottak/delmottak, sletting, tom og null treff | Ikke evaluert |
| X08 | Utlån: aktive/avsluttede/innlånte, søk, utlån/retur, ugyldig vekt, lange navn | Ikke evaluert |
| X09 | Printere: tom/ledig/lastet, online/offline/utrustet/feil, slotmenyer, vekt, RFID og syntetisk diagnostikk | Ikke evaluert |
| X10 | Statistikk: perioder/custom, filtre, diagrammer/tabeller, detaljer, prognose, valuta og datamangler | Ikke evaluert |
| X11 | Filamentstandarder: terskler, prisgrupper, manglende/overwrite, review/kvittering | Ikke evaluert |
| X12 | Katalog: kildeliste/materialvalg, oppdagelse, fremdrift/feil, swatchvedlikehold og validering | Ikke evaluert |
| X13 | Import/eksport/backup: fil valgt, gyldig/ugyldig, kvittering, restorebekreftelse, avbryt og resultat | Ikke evaluert |
| X14 | Bibliotek: Standalone/Host/Client, rolleveiviser, nettverk, parring, aktive/tilbakekalte klienter | Ikke evaluert |
| X15 | Datatilkoblet native Client: identitet, første last, varm cache, frakobling/gjenoppretting, begrensede innstillinger | Ikke evaluert |
| X16 | Companion: oversikt, lager, registrering/katalog, detaljer, status/veiing/tare, utlån/retur, printere, kø/mottak, innstillinger | Ikke evaluert |
| X17 | Companion: parring, uparret/tilbakekalt, skrivebeskyttet, offline/HTTP-feil, lasting/tomt, fokus/zoom | Ikke evaluert |
| X18 | Felles: dialoger, menyer, tooltip, toasts, bekreftelser, validering, disabled og lasting | Ikke evaluert |

## Lærdom fra tidligere gjennomganger

- Den brede UI-runden 19. september vurderte primært oppgaveløsning med vektet score og 8-mål, bare Light/Dark. Den dekker ikke dagens krav om alle ti visuelle kriterier på minst 9 i hvert tema.
- Rikere realistisk fixture avdekket flere problemer. Tidligere feil med slot-ID og kalenderdato kom fra testdata; fixturefeil skal ikke gis produktfunn eller poenggevinst.
- Companion har tidligere mistet informasjon ved 320 px og under lange søkeresultat. Tekstbryting, valgt-piller, beregnede vekter og nettverksfeil må kontrolleres på nytt.
- Bulk-review avdekket reaktivering med 0 g og rå status-/implementasjonstekst. Bevar utvalg og full avvisning av beskyttede ruller; dette er konkrete regresjonspunkter.
- Importreview avdekket gammel kompatibilitetsmelding etter filbytte og generiske parserfeil. Filidentitet, tom/ødelagt/ustøttet fil og separat validering/restore er sentrale tilstander.
- Native Host/Client krevde korrekt pakket/signert app med Bonjour-/lokalnettmetadata og støttet privat nettverk. Vanlig usikret loopback-parring avvises tilsiktet. Tidligere evaluering hadde fortsatt hull i kald første last, og manglende snarvei til ny parring var et restpunkt.
- Produktkode skal være fryst under hver vurderingsrunde. HMR-overgangstilstand regnes ikke som produktfunn.

## Evidens og kvalitetsporter

Hvert funn får stabil `VM-Fnn`-ID, type (funksjon/visuell inkonsistens/subjektivt forslag), reproduksjon, berørt tema/viewport, bilde og kriterium. Hver evaluert flate får en ti-tallsvektor i oppdragets rekkefølge. Uinspiserte flater får «ikke evaluert» og ingen tall. Runder viser hva som er nytt inspisert og hva som videreføres fra konkret tidligere evidens.

`docs/QUALITY_GATES.md` krever blant annet null axe-brudd for seks datadrevne hovedsider, modalens fokus/Escape/fokusretur/200 % zoom, ytelses- og bundlegrenser, lokaliseringskontrakter og reelle Client/Companion-dataflyter. Maskinelle tester supplerer visuell inspeksjon; de beviser ikke i seg selv at en flate når 9. Fysiske printerhandlinger og produksjonsdata skal aldri brukes i denne oppgaven.

Kilder: [tidligere bred review](../UI_USABILITY_REVIEW_2026-09-19.md), [Host/Client](../HOST_CLIENT_USABILITY_REVIEW_2026-09-19.md), [bulk](../BULK_ACTIONS_USABILITY_REVIEW_2026-09-20.md), [import](../DATA_IMPORT_USABILITY_REVIEW_2026-09-20.md), [programbilder](../SCREENSHOTS.md), [kvalitetsporter](../QUALITY_GATES.md).
