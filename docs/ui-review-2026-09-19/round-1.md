# Uavhengig UI-kritikk – runde 1 (historisk protokoll)

19. september 2026. Observerte flyter kjørt i Chromium mot faktisk Companion HTTP/backend på `127.0.0.1:4279`, med isolert `tmp/ui-review/review.db`. Norsk, mørkt tema, 390×844; første orienteringsbilde også engelsk/lyst. Databasen er syntetisk. Ingen produksjonsdata eller fysiske printerhandlinger.

Karakterrekkefølge: oppgave (25%), informasjon (20%), navigasjon (15%), tilbakemelding (15%), visuelt (10%), tilgjengelighet (10%), robusthet (5%). Score er ekspertvurdering av observerte oppgaver, ikke menneskelige brukermålinger. Utestede matriser skal ikke få oppdiktet score.

## Første baseline (senere native observasjoner nedenfor)

| Område | Oppg. | Info | Nav | Tilb. | Vis. | Tilg. | Rob. | Vektet | Godkjent? |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Companion lager, registrering og detalj | 6 | 7 | 8 | 5 | 7 | 8 | 6 | 6,65 | Nei – tomvektlagring feiler |
| Companion utlån, retur og historikk | 8 | 6 | 8 | 7 | 7 | 8 | 7 | 7,30 | Nei – beregning stemmer ikke med input |
| Companion innstillinger og tilkobling | 8 | 6 | 8 | 5 | 8 | 8 | 6 | 7,05 | Nei – misvisende tilkoblingsstatus ved nettfeil |

Printere er inspisert visuelt, men ikke endret i runde 1 ennå. Desktop og alle desktopinnstillinger venter dokumenterte interaksjoner/skjermbilder fra native operatør. Ingen scores for disse på dette tidspunktet.

## Funn

### C1 – P1: Lagre rullens tomvekt utfører ikke lagring

Reproduksjon: Registrer egen generisk rull → detalj → Rullens tomvekt = 200 → Lagre rullens tomvekt. Ingen request, ingen synlig feil og ingen databasemutasjon. Nettleserfeil `handlers.submitTareWeightUpdate is not a function`. SQLite `spool_tare_weight_g` forble null. Gjentatt på gjenåpnet detalj med 500 ms ro etter klikk.

Årsak bekreftet etter UI-observasjon: `handleCompanionSubmitEvent` videresender ikke `submitTareWeightUpdate` til submit-router, selv om app-installasjonen og routeren støtter den.

Akseptanse: Lagring sender én request; 200 g beholdes etter reload; tydelig bekreftelse; etterfølgende målt total 900 gir netto 700. Ingen runtimefeil. Test via installert DOM-håndtering, ikke bare direkte kall til mutation-helper.

Bevis: `evidence/critic-r1/tare-save-result.png`, `tasks.json` (`errors` og `persisted`), `focused.json`.

### C2 – P2: Låne- og returberegning viser gamle verdier

Reproduksjon: åpne utlån på rull med 800 g, endre Utgående totalvekt til 750, flytt fokus til lånerfelt og vent 600 ms. Beregning viser fortsatt `800 g totalvekt − 0 g ... = 800 g filament lånes ut`. Tilsvarende retur viste 850/0g forbruk etter feltet ble endret til 800. Backend lagret korrekt 850 ut, 800 retur, 50 brukt i fullført forsøk; presentasjonen er feil.

Akseptanse: Beregning oppdateres fra de gjeldende inntastede verdiene uten å miste fokus/utkast, inkludert tomt/ugyldig felt og tomvekt. Innsending og synlig regnestykke må samsvare.

Bevis: `loan-preview-settled.png`, `loan-filled.png`, `return-filled.png`, `tasks.json` og `focused.json`.

### C3 – P2: Frakoblet Companion sier «Tilkoblet» og viser rå engelsk feil

Reproduksjon: Innstillinger → simuler offline kun i browserkontekst → Oppdater kompanjongdata. Banneret viser `Failed to fetch`, mens kortet sier `Tilkoblet · 9 spoler · 2 printere · 1 aktivt utlån`. Reload ble ikke brukt, så de synlige dataene var cachede. Nett på igjen og Oppdater gjenoppretter data.

Akseptanse: Lokaliserte, handlingsrettede nettfeil og tydelig frakoblet/ikke oppdatert status. Cached data kan bevares, men må ikke presenteres som en vellykket fersk forbindelse. Status gjenopprettes ved faktisk vellykket refresh. Test både nettfeil og vanlig HTTP-feil uten å forveksle dem.

Bevis: `offline-settings.png`, `offline-settled.png`, `reconnected-settings.png`.

### C4 – P3: Fanen Generisk brytes midt i ord på telefon

390×844, Legg til filament: tre produsentfaner viser `Generis` / `k`. Dette tar ekstra høyde og gjør det kompakte skillet urolig.

Akseptanse: Hele norske fanenavnet er leselig ved 390 px og 320 px, uten midtordsbrytning eller horisontal sideoverflow. Behold minst 44 px berøringshøyde.

Bevis: `phone-add-spool.png`.

### C5 – P3: Printerstatus gjentas unødvendig

Lastet spor viser Lastet to ganger. Tomt spor viser Åpent spor / Tom / Tom / Åpent spor før forklaring og knapp. På telefon betyr dette mye repetisjon før brukeren kommer til neste spor.

Akseptanse: Én tydelig status per spor, med identitet, vekt og oppgaveknapp. Bevar tekstlig status i tillegg til farge, og distingver tomt spor fra en TOM rull.

Bevis: `phone-printers.png`.

### C6 – P3/hypotese: Nettoresultat mangler ved ordinær veiing

Vektfelt heter Målt totalvekt, mens Nå er nettofilament og tomvekt er et separat felt. Det er ingen synlig nettoforhåndsvisning. Ved kjent tomvekt på fixture #100003 vises 1004 total, 224 tomvekt, 780 Nå, men sammenhengen må regnes ut selv. Dette er en friksjonshypotese, ikke påvist brukerfeil.

Akseptanse: Kort forklaring eller oppdatert beregning viser hva som lagres som filamentvekt. Bør gjenbruke den korrekte beregningen fra C2.

## Det som fungerer og bør beholdes

- Store berøringsmål og leselige filamentfarger, tekstlige lånestatuser og tydelige rullreferanser.
- Registrering åpner riktig ny rull og viser kvittering.
- Lange navn brytes innenfor tilgjengelig bredde, uten sideoverflow i undersøkte skjermbilder.
- Søk uten treff gir konkret melding; søk på location og identitet er lett tilgjengelig.
- Låner er påkrevd; ugyldig innsending ble stoppet. Gyldig låne- og returflyt lagret akkurat ett lån og korrekte notater/vekter i SQLite.
- Modal fokus løper fra siste kontroll tilbake til lukking med Shift+Tab/Tab.
- Språk- og temavalg er tydelige og frakobling ødelegger ikke eksisterende inventardata.

## Databevis

Ny isolert testspole: `spool_companion_1789851631725_2e39162e`. Generisk PLA, start 1000 g, langt navn/fargenavn, Critic Shelf. Etter fullført UI-flyt: nå 800 g, IN_STOCK, én RETURNED loan, grams_out850, returned_grams800, consumed_grams50. Bare denne nye spolen/lånet ble mutert; eksisterende printertildelinger/ruller ble ikke endret av kritikeren.

Alle noter, kontroller og skjermbilder ligger `tmp/ui-review/evidence/critic-r1/`. DOM-tekst inneholder skjulte live-regioner og select-options; disse regnes ikke automatisk som synlige feil. Fullpagebilder med fixed navigasjon skal ikke tolkes som at bunnenav skjuler umulig tilgjengelig innhold; viewportbilder brukes for konkrete layoutfunn.

## Native gjennomgang (tillegg samme runde)

Kritikeren samhandlet selv gjennom native tilgjengelighetstre i `Filament UI Review.app`, English/dark, etter at implementeringsagenten hadde laget oversiktsbilder. Native vinduet ble begrenset av skjermflaten (bilder 1229×768); ikke påstå 1440×900 som observert skjermflate selv om konfigurert størrelse var dette.

- Filament defaults: EUR lagret, lokalt bekreftet; terskel250g lagret med synlig kvittering; Critic-gruppe22.5EUR lagret; Only missing på én rull ga1updated0notupdated. Ved ny åpning av rullen var pris22.5EUR synlig. Default EUR dukket automatisk opp i mottak når pris ble skrevet. Ingen duplikat eller datatap sett.
- Lager: søk39162e ga korrekt én rull. Etter detalj/label/laste-dialoger ble søk og utvalg beholdt. Native prisdetalj har hjelpetekst og individuell prisbeskyttelse.
- Label-preview: langt navn avkortes i kontrollert fysisk preview; størrelsevalg og QR synlig, ingen layoutoverflow. Eksport/utskrift ikke utført.
- Printerlasting: valgte AtlasQA AMS1 Slot4 som var tomt. Tydelig bekreftelse med faktisk slotnavn og Assigned status. SQLite viser korrekt spool/slot. Ingen fysisk printerhandling.
- Ønskeliste: JadeWhite qty2 ble flyttet til Onorder; mottok1 med hjemmelokasjon CriticShelf og pris25EUR. Kvittering viste1mottatt/1igjen, inventartall9→10. SQLite viser én ny rull1000g, pris25EUR, hjemmelokasjon og faktisk lokasjon samme. Dette er forbruk av isolert testbestilling, ikke reelt kjøp.

### N1 – P2: Intern slot-ID vises som brukerens plassering

Etter korrekt UI-lasting ble lagerknappen `Atlas QA · qa_bambu_slot_4 #39162e REMAINING800g`, mens kvitteringen var `Atlas QA · AMS1 · Slot4`. Dette er et observérbart grensesnittproblem også når slot er tildelt gjennom UI, ikke bare fixturedrift.

Akseptanse: Lagerets rullplassering viser samme menneskeleselige enhet/slot som kvittering/printerbord, ingen intern `qa_bambu_slot_4`/UUID. Ukjente legacy-slots må ha forståelig fallback. Verifiser flere enhetstyper.

### Native foreløpige karakterer (avgrenset til observerte flyter)

| Område | Oppg. | Info | Nav | Tilb. | Vis. | Tilg. | Rob. | Vektet | Dekning |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Filament defaults | 8 | 9 | 8 | 9 | 8 | 8 | 8 | 8,35 | Valuta/terskel/gruppe/apply/receipt/persistens; overwrite/failure/Client ikke kjørt her |
| Ønskeliste/bestilling/mottak | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8,00 | Ordre→delmottak/pris/lokasjon/kvittering/SQLite; failure og bulk ikke kjørt |
| Lager/søk/plassering | 8 | 6 | 8 | 8 | 8 | 8 | 8 | 7,60 | Intern slot-ID trekker ned; stor datamengde og ekstra filtre venter |

Dette er ikke full godkjenning av hovedområdene: de dokumenterte hullene og tverrplattformdekningen må vurderes i sluttrapporten. Andre native områder er fortsatt kun visuell/dekkende navigasjonsinspeksjon og får ingen samlet områdescore før oppgavene er undersøkt.

Databevis: `evidence/critic-r1/native-persisted.json`.

## Native videre oppgaver / første runde avsluttet

- Statistikk: Last12months ga Sep20,2025–Sep19,2026, 2jobber og160g/0.16kg. Forbruksmodalen viste PLA Basic Black160g/2jobber; no-such-filament ga0/1 og tydelig no-match; Reset gjenopprettet raden. Verdiforklaring viste vår Critic-rull800/1000×22.5=EUR18 og ny JadeWhite1000/1000×25=EUR25, totalEUR43. Manglende pris/valuta var «Not valued», ikke nullkostnad. Prognose forklarte at30dagersforbruk manglet.
- Vedlikehold: full backup eksportert og automatvalidert24/24tabeller1685rader. Deretter validerte jeg eksakt egen syntetisk eksportfil via native filepicker, med samme Fullycompatible-resultat. Datadiagnostikk Healthy, FKcheckPassed og schema7/7. Gjenoppretting/sletting ikke kjørt.
- Printerinnstillinger: NovaQA navn redigert til NovaQA review draft. Cancel viste discardwarn; Keepediting beholdt draft; Savechanges ga synlig oppdatering. Modell/MMUkapasitet ble ikke endret. Ingen fysisk kommunikasjon.
- Katalog: én manglende swatch etter mottak. Ugyldig tekst ga Invalid value+hjelpetekst og deaktivert Save; korrekt #F8FAFC lagret og listen ble0missing. Discover/import mot ekstern butikk ikke kjørt i denne runden.
- Generelt: Light og Dark ga umiddelbart ryddig render uten feil layout. EN→NB skiftet hele hovednavigasjonen og Settings. Bekreftelsen var formulert på forrige språk («Language selected: Norsk...»), liten detalj, ikke blokkering.
- Dashboard: Dismiss av fullført sjekkliste ryddet visningen. To konkrete handlingsvarsler og fire hovedtall var da synlige samtidig. Ingen nødvendig generell redesign funnet; gammel historikk/liten fixture begrenser evaluering av store aktivitetslister.

### N2 – P2: Eksportbanner lover gjenbruk som rolleflyten avviser

Etter full backup og separat vellykket validering av den samme filen sier eksportbanneret at den er «ready to use in the guided role-change flow». Library→Client åpner likevel Export Pending / Validate Pending og deaktivert Switch. Implementeringsagenten har forklart at ny rolleguide med vilje krever fersk eksport inne i flyten. Kritikken retter seg mot den motsigende lovnaden; å bevare den sikkerhetsgaten er rimelig.

Akseptanse: Vanlig eksportbekreftelse lover bare eksport/validering, og rolleflyten forklarer sitt ferske krav. Ikke svekk backupkravet for å øke score.

### Tilleggsscore, kun observerte lokale arbeidsflyter

| Område | Oppg. | Info | Nav | Tilb. | Vis. | Tilg. | Rob. | Vektet | Særlig begrensning |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Dashboard | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8,00 | Stor aktivitetsliste/nyere datoer venter; hardwaresignaler simulerte |
| Statistikk og økonomi | 8 | 9 | 8 | 8 | 8 | 8 | 8 | 8,20 | Flere valutaer, prognose med ferske hendelser og customrange venter |
| Native detalj og etikettpreview | 9 | 7 | 8 | 9 | 7 | 8 | 8 | 8,10 | Metadata/risikohandlinger og fysisk etikettutskrift ikke testet |
| Native printerlasting | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8,15 | Bare ledig simulert slot; fysisk/RFID/swap/unload ikke verifisert |
| Generelle innstillinger | 8 | 8 | 9 | 8 | 8 | 8 | 8 | 8,15 | Autostart, updaterinstallasjon og andre OS ikke kjørt |
| Bibliotek/webapp | 7 | 8 | 8 | 6 | 8 | 8 | 8 | 7,45 | N2 copy-mismatch; guidet preview+avbryt og ekte Companionforbindelse, ingen full Host/Clientbytte |
| Printerinnstillinger | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8,15 | Dirtydraft/Keepediting/save av navn; fysiskeintegrasjoner utestet |
| Filamentkatalog | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8,15 | Faktisk lokal swatchvalidering/lagring; ekstern oppdatering utestet |
| Vedlikehold/backup | 8 | 9 | 8 | 8 | 8 | 8 | 8 | 8,20 | Ekte export/manualvalidation; restore/restart og repair/reset utestet |

Kriterium robusthet her gjelder normal observerbar respons under gjennomførte lokale oppgaver, ikke påstått dekning av alle feiltyper. Disse scoreverdiene kan beholdes ved uendret kode, men større data og nye tilstander kan trekke ned i R2. Native lån/lokasjonsadmin/native registrering/Client og Companionprinteroppgaver har fortsatt dekningshull; tildel ikke8 uten å gjennomføre dem.

Viktige testforhold: Native initial/etterHMR viste kort0verdier før riktige data. Dette ble ikke klassifisert som produktfeil ettersom implementeringsagentens samtidige HMR kunne utløse remount; krever separat reproduksjon uten endringer hvis undersøkt videre. Fiktiv fixturestatusIN_STOCK på allerede lastede ruller er kjent datakonsistensproblem i fixturen; score skal ikke straffe produktet for den inkonsistensen.
