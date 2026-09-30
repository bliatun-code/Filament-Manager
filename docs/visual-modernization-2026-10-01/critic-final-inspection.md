# Visuell sluttgodkjenning — 05a05d0f

**Gjennomgangen er ferdig: alle relevante kriterier når 9/10 per vurdert familie
og tema.** Endelig matrise og avgrensning står i [kritikerledgeren](critic-current-ledger.md).
VM-FINAL-01 og VM-FINAL-02 er lukket, og ingen kontrollerbare IE-hull gjenstår
innen oppdraget. Fargerestaureringen er bevart.

Avsnittene nedenfor dokumenterer inspeksjonen i rekkefølge og beholder tidligere
funn og midlertidig IE-status som historikk; de er ikke dagens sluttstatus.
Første baseline var produktkode `d57a97ed`. Isolert `Filament Visual Final` med syntetiske
kopier av rik review.db; Vite 5173. Dette er ny uavhengig bildeinspeksjon av
kjørende native-app. Capture-JSON registrerer 1440×960 native vindu og 2880×1920
retinabilde, engelsk. Bildestier er lokale testbevis under
`tmp/visual-final-2026-10-01/native-wide/native-en-{theme}/{scenario}.png`.

## Bred native delta, første inspeksjon

Følgende **20 bilder er individuelt åpnet og vurdert**, ti i Light og ti i Dark:
dashboard-overview, inventory-overview, selected-roll, loans-overview,
printer-board, settings-general, settings-filament-defaults, bambu-batch-add,
statistics-overview og settings-inventory-label-sheet.

Kriterierekkefølge: H hierarki, T typografi, L layout, F farge/kontrast/tema,
K konsistens, V visuell finish, I interaksjon, R responsivitet, D krevende data,
A praktisk tilgjengelighet. IE betyr manglende bevis på dette kriteriets fulle
omfang; bare synlig visuell delpoengsum føres fra et stillbilde.

| Flate, Light og Dark bred | H | T | L | F | K | V | I | R | D | A |
|---|---|---|---|---|---|---|---|---|---|---|
| Dashboard |9|9|9|9|9|9|IE|IE|9|IE|
| Inventory, Light |9|9|9|9|9|9|IE|IE|9|IE|
| Inventory, Dark |9|IE|9|IE|9|9|IE|IE|9|IE|
| Selected roll, Light |9|9|9|9|9|9|IE|IE|9|IE|
| Selected roll, Dark |9|IE|9|IE|9|9|IE|IE|9|IE|
| Loans |9|9|9|9|9|9|IE|IE|9|IE|
| Printer board |9|9|9|9|9|9|IE|IE|9|IE|
| General settings, synlig scrollet utsnitt |9|9|9|9|9|9|IE|IE|9|IE|
| Filament defaults, åpen ABS-gruppe |9|9|9|9|9|9|IE|IE|9|IE|
| Batch, tre tvetydige koder |9|9|9|9|9|9|IE|IE|9|IE|
| Statistics |9|9|9|9|9|9|IE|IE|9|IE|
| Label sheet, A4 preview |9|9|9|9|9|9|IE|IE|9|IE|

Konkrete observasjoner:

- Appskallet, sterke filamentkort og printerenes merkegradienter fungerer som
  tydelig og konsistent produktidentitet. Hvit/oransje/svart/grå swatch beholder
  faktisk filamentfarge. Ingen generell nedtoning anbefales.
- Dashboardets fire metrikker ligger før oppfølging og oppstart, og 3 of 4 teller
  samsvarer med én gjenstående oppgave. Oppfølging beskrives med tekst/handling.
- Lange detailnavn brytes over to linjer uten kollisjon med Close/status. Save
  weight og tare er lett å finne. Hvit Dark-slider og Close-fokus er synlige.
- Prisgruppen har identifiserbare rullreferanser, lokal forskjell mellom missing
  og overwrite, synlig årsak til disabled oppdatering og valutakonsekvens. Dette
  bildet er ikke den nye overwrite-dialogen eller kvitteringsretasten.
- Batchfelt har ensartede select-kontroller, tre klart avgrensede tvetydigheter
  og disabled handling med ready0. Dette bildet beviser ikke resultatdialogen.
- Valgt A4-hint er lesbart på valgt overflate i begge temaer. PDF-exportens
  tidligere faktiske fil-/sidekontroll står separat fra denne forhåndsvisningen.
- Dark native tittellinje er mørk på alle ti bilder; Light er lys. Dette støtter
  eksplisitt temarendering, men faktisk temabytte/Auto må fortsatt kontrolleres.
- General settings er bevisst scrollet, med delvis H1 under sticky navbar; dette
  er capture-utsnitt, ingen påvist feil i normal navigasjon.

### AA-kandidater som må måles før karakter

På restaurert hvit/grå Dark Inventory-kort: sekundær Rolls/Total rett på den
lyse toppgradienten, og REMAINING-etikett øverst på hvit inset. På restaurert
hvit Dark-detail: MEASURED TOTAL WEIGHT, EMPTY SPOOL WEIGHT og HOME LOCATION.
De fremstår svakere enn tilgrensende primærtekst. Uavhengig måling av faktisk
tegnet bakgrunn kreves; IE gis til T/F/A inntil resultat foreligger. Eventuell
retting skal være lokal tekstlesbarhet og beholde de sterke filamentflatene.

Ingen andre ferske reelle regresjoner er identifisert i disse 20 brede bildene.
Dette er ikke samlet produktgodkjenning; videre arbeid føres i aktuell ledger.

## Bambu og Prusa delta / VM-FINAL-01

Ytterligere 18 native bilder er individuelt sett: de samme ti scenariene i
Bambu, og de første åtte i Prusa (uten statistics-overview og labels foreløpig).
Visuelt hierarki/layout/konsistens/finish og krevende data opprettholder 9 på
disse konkrete brede utsnittene. I/R og bred A forblir IE. Dark/Bambu/Prusa
native tittellinjer er mørke og appskallet bruker riktig merke-/mørkutfall.

**VM-FINAL-01 — lokal sekundærtekst på restaurerte lyse filamentflater.**
Reell AA-/lesbarhetsmangel, ikke stilpreferanse. Rootens ferske probe i
`painted-detail/results.json` måler samme rendrende frontendkomponent mot
faktisk bakgrunn. Bildene viser de berørte native overskriftene, og støttemåling
bekrefter normal tekst under 4.5:1:

| Tekst, selected-roll | Dark | Bambu | Prusa |
|---|---|---|---|
| Measured total weight (g) |3.67|3.56|3.41|
| Empty spool weight (g) |4.19|4.08|3.89|
| Ownership |3.94|3.83|3.67|
| QR |3.30|3.21|3.10|
| Companion link |3.98|3.88|3.75|
| Home location |ikke registrert som feil|4.48|4.28|

Selected-roll T/F/A settes til **8/8/8** på dette konkrete grunnlaget i de tre
mørkbaserte temaene. Øvrige hovedkriterier står som ovenfor; samlet detaljfamilie
er ikke godkjent. Root måler dessuten loan-out Selection preview til
2.62/2.54/2.45 i Dark/Bambu/Prusa. Denne tilstanden må også vises i fersk native
retast før lukking. Anbefalt tiltak er lokal tekststyrke/lesbar tekstbakgrunn;
swatch, tint, gradient og skyggeverdi skal beholdes.

Light-probens Need labels… er nederst ved y934.9 og kan være dekket av modalens
footers klipping; den føres ikke som reell feil uten clip-aware kontroll.
Printer-slot-assignment sin dekorative separator ·4.39 er ikke selvstendig
informasjon og er ikke en AA-blokkering. Inventory-kandidatene måles separat.

## Konsolidert etterkontroll på f3eed3ce

Alle 40 brede beforebilder (10 scenarier × Light/Dark/Bambu/Prusa) er nå
individuelt inspisert, inkludert Prusa Statistics og Label sheet. Alle 12
native etterbilder er individuelt inspisert: Inventory, Selected roll og Loan
out × fire temaer, under `native-contrast-fixed/native-en-{theme}/`.

VM-FINAL-01 er **lukket for den konkrete lokale tekstmangelen**. Etterbildene
bevarer sterke kort-/printertoner, swatches, gradienter og skygger. Lokal
sekundærtekst er tydeligere uten tap av filamentidentitet. Etterproben har 0
informative målte tekstfeil på 40 rader; minste Selected roll-kontrast er
Light 4.72, Dark 7.60, Bambu 5.45, Prusa 5.96; Loan preview er Dark 6.13,
Bambu 5.45, Prusa 5.74. Konkrete berørte T/F får 9 etter retest. Bred A krever
fortsatt familiespesifikke fokus/reflow-/AA-bevis; null probe-/axe-feil alene
innebærer ikke samlet tilgjengelighetsgodkjenning. `painted-*/results.json`
er overskrevet med etterresultatet; førverdier over finnes også i de første
loggene, etterverdier i `*-after.log`.

### Faktisk interaktiv native batch og pris, Auto→Dark

Isolert DB `/private/tmp/filament-final-interactive-20261001.db`, ingen aktive
printerintegrasjoner. Native vindu viser systemets mørke Auto-utfall; egne
interaktive bevis i `tmp/visual-final-2026-10-01/critic-interactive/`.
Screenshot er 2400×1864 piksler, tilsvarende 1200×932 native punkter.

- Batch: 40500 ga to katalogtreff; native meny valgt med Return ga Ready 1.
  Registrering ga Registered 1, en kompakt sentrert kvittering og faktisk
  autofokus på Open roll. Return åpnet korrekt ny ABS Bambu Green-rull med
  Close-fokus. `batch-receipt-dark.png`. R16s reelle L8 er lukket L9, konkret
  batchhandling/fokus I9; alltheme/minimum-size familiesjekk føres separat.
- Prisstandard: ABS-gruppe 6 ruller, 2 uten pris. 245 NOK lagret; missing-only
  oppdaterte 2 og beholdt fire 239 NOK-priser. Receipt ble faktisk scrollet inn
  og fokusert, 2 updated/4 not updated med ulike korte #referanser og årsak
  Already had a price. `price-receipt-dark.png`. R17s receipt/disambiguering
  I/D8 er lukket I/D9 i dette native tilfellet.
- Overwrite: 6 existing, 4 individually set, 0 skip, tydelig tekst om at locks
  ikke endres. Startfokus på Affected, første Tab på Cancel. Return avbrøt
  uten prisendring og returnerte fokus til Review and confirm overwrite.
  Return gjenåpnet; Tab×2 fokuserte explicit Confirm. Bekreftelse ga 6 updated,
  receipt-fokus og synlig kvittering. `price-overwrite-dark.png`. Reell native
  keyboard/returfokus for siste overwriteendring er nå observert I9.
- Etterbekreftelse kontrollert read-only i DB: de fem ABS White-rullene og ny
  ABS Bambu Green har alle 245 NOK, STANDARD_BATCH, lock0. Det samsvarer med
  receipt og ingen produksjonsdata er berørt.

Ingen nye reelle funn fra disse to interaktive flytene. Receipt Dismiss flytter
fokus til Filament defaults-panelet; det er ikke falskt beskrevet som returfokus
til en nå disabled missing-only-knapp. Overwrite Cancel returnerer derimot til
sin faktiske trigger og holder eksisterende pris uendret.

## Faktisk native Host/Client — full re-pair, 01.10 kl. 00:52

Unike Hostfinal/Clientfinal-bundler med separate syntetiske DB-er, uten VISUAL_QA og uten printerintegrasjoner. Ingen produksjonsdata, engangslenker, QR eller privat adresse publiseres. Faktisk macOS WebKit/UI via CUA, ikke fixturebro.

Host-role wizard krevde og validerte full backup før dobbel bekreftelse. Første serviceadvertisement ga timeout; isolert DNS-SD-probe og senere restart av samme Hostfinal ga Running/stabil adresse. Dette var en midlertidig testmiljøtilstand som ble løst uten produktpatch; ikke en uavklart produktfeil.

Klienten ble paret med engangslenke og viste kontrollrullen 800 g fra verten, mens lokal klient-DB hadde 333 g. En usendt kladd på 977 g målt vekt ble beholdt mens verten revokerte klienten. Save ble avvist med synlig «Re-pair required» og konkret Settings → Library & web app-veiledning. Read-only DB-kontroll viste fortsatt Host 800 / Client 333. Renew pairing åpnet nytt paringsfelt; ny lenke ga Paired og Host check passed. Kontrollrullen viste igjen 800 g. Save 977 ga 777 g med 200 g tare og «Weight updated on the host library». Read-only sluttassert: Host current_weight_g/remaining_g 777/777, Client 333/333, begge tare 200. Dette bekrefter faktisk ny paring, avvist stale draft og fortsatt vertautoritet. I/D9 for denne mekanismen. Ikke påstått at Renew pairing autofokuserer feltet; fokus lå i panelet. Begge isolerte apper ble avsluttet etter kontrollen.

## Individuell Companion- og frontendinspeksjon etter kontrastpatch

Alle følgende bilder er åpnet individuelt, ikke bare kontaktark, på fryst produkt f3eed3ce:

| Pakke | Antall og faktisk flate | Observasjon / bevisgrense |
|---|---|---|
| companion-main |64, 4 tema ×320/390/834/1440 ×lager/lån/printer/innstillinger, EN, faktisk QA-backend4299 |Ingen ny visuell regresjon. Lange navn brytes, informative swatcher og sterk printeridentitet beholdes. Mobil bunnavigasjon, tablet toppnav og desktop sidenav skifter kontrollert. R/D9 på synlige flater. |
| companion-tasks |32, Add/detail ×4 tema ×4 bredder |Synlig keyboardfokus, forståelig målt vekt/tare, lange identiteter og disclosure. Ingen nytt funn; historisk faktisk create/save/return og fokusmatrise arves for uendret mekanisme, ikke utledet fra stillbilder. |
| companion-auto |16, system Light/Dark emulert ×320/834 ×4 roots |Auto følger enhetens emulerte prefers-color-scheme, synlig Following device-status. Dette er browserbevis, ikke globalt macOS AutoLight-bytte. |
| companion-errors-nb |8 nettverksfeil ×4 tema ×320/390 |Synlig feil inne i aktiv låneoppgave, NB bryter uten horisontal klipping, inputkladd beholdt. Mekanismen er eksplisitt syntetisk HTTP rejection; ingen ekte nettverksfeil på produksjonsvert. |
| frontend-reflow |24, 4 tema ×6 NB-familier,856×550 |Redusert viewport, ikke faktisk200% zoom. Lager, katalogvalg, lån, tom lokasjon, detail-load-feil og label-adressefeil lesbare. Filnavnet selected-roll-history viser load-feil uten åpent history; label viser error, ikke PDFpreview. |
| import-feedback |8, 4 tema ×EN/NB,856 bred |Synlig fokusert importalert nær handling, lange CSV-valideringsord brytes. Eksplisitt syntetisk rejection; faktisk native import/backup/restore arves fra tidligere dataasserts. |
| frontend-dialog-families |15, Light/Bambu/Prusa ×5 navn |Assignment faktisk åpent søkevalg; wishlist bare tomt Ordered-filter; RFID-navnet viser selected-roll load-feil, katalog-swatch-navnet viser bare katalogstart. Ingen ny visuell feil, men disse tre navnene kvalifiserer ikke som åpnet RFID/swatchreview/befolketwishlist-bevis. Meldt parent for korrekte måltilstander. |
| pricing-themes |4 Bambu/Prusa overwrite+receipt,856×750 |Dialog tydelig advarsel,6update/4existing/0skip, unike referanser; receipt lokal og kompakt. Synthetic committed response, faktisk lagring/Cancel/Confirm er nativekontrollen ovenfor. |
| batch-themes |3 Light/Bambu/Prusa receipts856×750 |To registrerte og en gjenværende reviewrad kompakt, Open roll og Start new batch tydelig. Synthetic committed response; faktisk native flow ovenfor er mekanismebevis. |

Axe zero og overflow zero er støtte. Gradient-incomplete er ikke automatisk AA-godkjenning; de nye composite-pixel-prøvene på restaurerte farger brukes med eksplisitt sampled tekstbegrensning. Ingen generell nedtoning kreves.


## Ny faktisk native mekanismepakke etter tidligere IE

Dette er nye utførte handlinger på isolert interactiveDB, ikke karakterarv fra scenarionavn. Native vindu 1200 × 932, Auto med system Dark. Ingen produksjonsdata.

- Lokasjon: opprettet Visual Final Shelf, renamed til Visual Final Shelf Edited med feltfokus, archive med lokal konsekvensforklaring, Previous locations → Restore. Advanced merge viste begge navn og hvilke current/home/child-referanser som ville flyttes. Cancel beholdt QA Shelf A og begge lokasjoner og returnerte fokus til Review merge. Faktisk merge ble ikke utført. `location-merge-cancel-dark.png`.
- Delmottak: bestilling med Qty 2 → Stock roll now, mottak 1, hjemlokasjon Visual Final Shelf Edited, 219 NOK. Faktisk lokal kvittering «Received 1 × PLA Basic · Jade White. Remaining: 1.», ny rull #3000_1 og Qty 1 beholdt i On order. `purchase-partial-dark.png`.
- Vanlig retur: aktivt #100008 på 640 g → measured 824 g, tare 224 g → Returned 600 g, consumed 40 g og Synthetic final return-notat. Read-only DB bekrefter RETURNED og disse verdiene.
- Innlånt retur: særskilt syntetisk INBOUND-loan seedet i isolert DB; dette er ikke påstått UI-opprettelse. #100006 med 730 g → measured 924 g, tare 224 g → Handed back 700 g / consumed 30 g. Modal forklarte at rullen fjernes fra aktivt lager mens historikken beholdes. Faktisk Returned-filter viser én Borrowed in/Handed back-rad; DB bekrefter RETURNED, 700/30, notat og soft deleted_at. `inbound-return-dark.png`.
- Spor: syntetisk ledig AMS 1 / Slot 4 → #100003, inngående gross 974 / tare 224 → 750 g. Update weight gross 964 → 740 g. Empty slot ga eksplisitt outgoing-vektdialog 964 g; Save fjernet tildelingen og returnerte rullen til QA Dry box med 740 g bevart. DB bekrefter sluttverdier.
- RFID: dagens syntetiske observasjon uten printertransport. #100001 lagret 101112… → observert 010203… i RFID-dialog; Save RFID ga «RFID tag saved on the selected roll», fersk AMS-sighting, økt history og vedvarende rfid_tag i DB.
- Overstyring: manuell tømming av live Slot 1 med outgoing 1070 g ga No spool assigned. Ny feed og nytt live-tidspunkt endret ikke manuelt tomt spor; rullen beholdt 820 g og vendte tilbake til QA Shelf A. `manual-clear{,-later}.ax.txt`, `manual-clear-dark.png`.
- Diagnostikk: sikker synthetic config mangler host/serial/credentials, dagens UTC og dummy nozzle/progress-feed. Stop capture viste «Capture is paused…session is frozen». Samples in capture window: 3 ble beholdt mens nye observasjoner kom. Start capture viste running og samplecount 4. `diagnostics-{paused,paused-later,resumed}.ax.txt`. Ingen ekte printerkommandoer.

Disse konkrete I-grenene går fra IE til 9. Ny reell finish-/identitetsfeil er separat og hindrer printerfamilienes V/D9 inntil retest:

**VM-FINAL-02, åpen på f3eed3ce:** actual native sporvelger viser nylig mottatt #3000_1 med rå `location_…` i stedet for Visual Final Shelf Edited. Tildelt #100003 vises med `Atlas QA · qa_bambu_slot_4` i stedet for menneskelig AMS-/slotnavn. Inventory viser allerede korrekte navn. Feilen gjelder lokal visning/søk, ikke vedvarende vektdata eller swatch. V/D = 8 i dette konkrete picker-tilfellet; øvrige passerte mekanismer gjenåpnes ikke. Meldt root som bygger lokal navneresolusjon og fersk retest.

## Nye faktisk native familiesupplementer

Alle ni `native-missing-families/native-en-{light,bambu,prusa}/` er individuelt inspisert: RFID capture med lagret/observert identitet, source-slot, metadata og fast Save/Cancel; faktisk swatch-review med previewfelt og Suggested not saved; befolket bestillingskø med Qty 3 og mottakshandling. 856 × 750. Ingen ny feil. Dette erstatter de feilaktig navngitte frontendbilder som ikke viste målinnhold. R/F/D9 for synlige tilstander; faktisk lagring er mekanismepakken over eller konkret historikk.

## Faktisk 200 % — evidenskorreksjon, ikke produktfeil

Alle tolv `actual-zoom/{light,dark,bambu,prusa}-{selected-roll,bambu-batch-add,settings-filament-defaults}.png` er individuelt åpnet. Browserens Zoom 200 % og metadata 1440 × 873 / DPR 2 → 720 × 436 / DPR 4 dokumenterer faktisk zoom, men screenshotserien er ubrukelig som visuell reflowgodkjenning: selected-roll og batch viser bare magnifisert øvre venstre område, med innhold kuttet ved bildets høyre kant; alle fire defaultsbilder er tom bakgrunn. Dette kan skyldes CDP clip/DPR etter zoom. Null DOMoverflow/axe korrigerer ikke bildeevidensen. Root har fått konkret beskjed om å ta faktisk native Chrome screenshot og bekrefte lastet oppgave. R/A for 200 %-delen forblir IE til korrekt bilde-/scrollkontroll; ingen R8 føres på produktet fra dette alene.


## Avsluttende retest på 05a05d0f

**VM-FINAL-02 er lukket.** Faktisk native sporvelger viser Visual Final Shelf
Edited for #3000_1 og Atlas QA · AMS 1 · Slot 4 for #100003. Søk på hele lagernavnet
og på AMS 1 · Slot 4 finner riktig rull; den tildelte rullen beholder 740 g.
Begge etterbilder er individuelt inspisert. Publiserbart eksempel:
[sporvelger med lesbart og søkbart spornavn](../screenshots/printer-slot-search.jpg).
Ingen raw location- eller slot-ID står i disse brukeretikettene. V/D går fra 8 til 9.

De siste faktiske native kontrollene ble gjennomført i Auto/system Dark på
1200 × 932 med isolerte syntetiske data:

- Statistikk: startdato i 2027 med slutt i 2026 ble avvist av feltets lokale
  datovalidering uten endret rapport. Gyldig 2. september–1. oktober 2025 ga tom
  periode med 0 jobber/forbruk. Completed-filter viste 90 g / 2 avsluttede lån og
  innlånt 30 g / 1 avsluttet. Nåværende lagerverdi og manglende priser var tydelig
  skilt fra periodens forbruk. Dette er ikke ny faktisk flervaluta-test; det
  uendrede visuelle valutagrunnlaget arves fra R6.
- Katalog: ugyldig farge ga eksplisitt formatforklaring og disabled Save. Gyldig
  #F8FAFC ga preview, og Save fjernet siste manglende swatch. Native etterbilde og
  read-only DB bekrefter Jade White #F8FAFC. Ingen ekstern katalogoppdatering.
- Bulk: #w_0150 ble valgt, flyttet til Visual Final Shelf Edited via Review og
  keyboard Confirm. Lokal Updated rolls: 1, returfokus til Select multiple og ny
  lokasjon i kortet. Read-only DB bekrefter location_id til navngitt lokasjon og
  uendret 325 g. Det tidligere begrensede Move-beviset er dermed supplert.
- Read-only DB bekrefter også delmottatt #3000_1 på 1 000 g, 219 NOK og samme
  navngitte lokasjon. Databaseoppslag bruker interne ID-er; synlige korte rull-
  referanser er dokumenterte brukeridentiteter, ikke SQL-primary keys.

### Korrigert faktisk 200 %-inspeksjon

Alle **24** bilder i `actual-zoom-native/` er individuelt åpnet: Light, Dark,
Bambu og Prusa × selected-roll, batchkvittering og priskvittering × initial og
keyboard/rullet utsnitt. Dette er CUA-skjermbilder av Chrome-vinduet, med faktisk
Zoom 200 % bekreftet i browsermenyen; 1440 × 873 / DPR 2 ble 720 × 436 / DPR 4.
De erstatter alle 12 avviste CDP-bilder, som ikke brukes som godkjenningsbevis.

Lang rullidentitet bryter på flere linjer uten å dekke Close eller footer.
Dark/Bambu/Prusa viser vektfelt med full synlig keyboardfokus etter rulling.
Light viser lesbar feiltilstand og felles header/footer; det ekstra Light-bildet
viser ikke et nytt vektfeltfokus, og påstås ikke å gjøre det. Batchkvitteringen
holder Open roll og Start new batch synlig, med fokus på sistnevnte etter Tab.
Priskvitteringen viser 6 updated / 0 not updated og utvidet identitetsliste som
fortsetter i vanlig vertikal rulling. Ingen observerte overlapp eller
horisontale kutt i disse korrigerte bildene.

Dette lukker de siste avgrensede R/A-hullene gjennom konkret felles familiearv,
med native smal/fokus fra tidligere og dagens mekanismer. Zoomkontrollen er
Chrome med fixturebro, ikke native WebKit-zoom eller faktiske desktop-DB-svar.
A-karakteren bygger dessuten på keyboard, returfokus, lokal validering, NB,
320-reflow i Companion og sampled composite-tekstkontrast; ikke bare axe zero.

Den endelige per-familie/per-tema matrisen er i ledgeren og supersederer samtlige
innledende IE-/8-rader i denne historiske inspeksjonsrapporten. Ingen ny generell
nedtoning av filamenter eller printere er berettiget. Ingen åpne visuelle tiltak
står igjen innen det avtalte omfanget.
