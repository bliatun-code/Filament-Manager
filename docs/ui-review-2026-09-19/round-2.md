# Uavhengig UI-kritikk – runde 2

19. september 2026. Kjøregrunnlag: faktisk HTTP/backend på 127.0.0.1:4279 og native Filament UI Review.app, isolert enriched.db. Omtrent 190 ruller, over 150 utlånbare, 41 uten pris, NOK/EUR, nylige jobber, lav beholdning, tomme/tapte/lånte/tildelte ruller. Nye critic-ruller kommer i tillegg under prøvene. Ingen produksjonsdata eller fysisk printerkommunikasjon.

Poengrekkefølge og vekting er uendret: oppgave25%, informasjon20%, navigasjon15%, tilbakemelding15%, visuelt10%, tilgjengelighet10%, robusthet5%. Poengene gjelder observerte oppgaver, ikke full dekning av alle funksjoner, plattformer eller feiltilstander. R1-scorer står urørt i forrige rapport. Ingen menneskelige brukertester er utført.

## Retest av første runde

| Funn | Resultat | Bevis |
|---|---|---|
| C1 tomvekt lagres ikke | Bestått: én request, 200g lagret og beholdt ved reload; ingen runtimefeil | critic-r2/results.json + tare/weight screenshots |
| C2 gammelt låne-/returregnestykke | Bestått: 850−200=650 ut; 800−200=600 retur; brukt50. Blankt og −1 viser validering. Backend samme verdier | results-continued.json, loan-preview-*, return-preview-* |
| C3 frakoblet vises tilkoblet | Bestått: virkelig browser-offline gir Frakoblet og lokal handlingsrettet advarsel om gamle data; reconnect reparerer. Separat simulert HTTP500 gir feil/utdatert-varsel uten falsk nettverksdiagnose; recovery virker | offline, reconnected, http500, http500-recovered PNG/JSON |
| C4 Generisk brytes midt i ord | Bestått på 320/390/768px; ny separat C8 nedenfor | add-tabs-* |
| C5 printerstatus gjentas | Visuelt bestått: én Lastet/Tom, vekt og oppgaveknapper beholdt | compact-printers.png |
| C6 manglende ordinær nettopreview | Bestått: målt900−tomvekt200=700 og faktisk700 lagret | weight-preview/result |
| N1 intern slot-ID | Bestått i native lager: både Slot2 og tidligere UI-tildelt Slot4 har AMS1+Slot-tekst | native CUA: Atlas QA · AMS 1 · Slot 4 #39162e |
| N2 uriktig eksportløfte om rollebytte | Kode endret av implementeringsagent; fersk eksportbanner-retet gjenstår. Ikke godkjent bare på koden | R1 backupfunn |

Companion-rull spool_companion_1789852610984_a86acd14 ble registrert med start1000g og tomvekt200g. Målt900→700, ut850→650, retur800→600, ett RETURNED-lån med50g brukt. Browser runtimeerrors=[] i fortsettelsestesten. Etterpå gjennomførte native enda et lån på samme rull: total750→550ut, total700→500retur,50brukt, eget notat. Endelig500g og begge lån avsluttet.

## Nye funn med større datamengde

### C7 – P2: Utlånsvelger har ingen søk ved over150 ruller

Åpne Companion Utlån→Lån ut spole med167 utlånbare. Velger viser første150 alfabetisk; ingen søk. Ny Critic Round Two ligger etter grensen og krever lang rulling til Vis flere før den kan velges. Kontrasten er native lånevelger som faktisk tilbyr søk og fant samme rull med ett treff.

Akseptanse: Søk etter navn/materiale/produsent/referanse/plassering i hele tilgjengelige listen før paginering; bevare fokus og tekst under skriving; tydelig treffantall og nulltreff; søk kan tømmes. Velg en rull som opprinnelig ligger etter150 uten å måtte vise flere først. Backend må fortsatt lage ett lån.

Status ved slutten av R2: implementeringsagent har laget endring, Companion rebuild/retet gjenstår.

### C8 – P3: Valgt-merke presses utenfor katalogkort på320px

Legg til Bambu på320px, valgt ABS Azure. Tittelen brytes over to linjer og Valgt-pillen ligger utenfor nederkant av kortet. Fanenavnene er nå fine. Ingen horisontal side-overflow.

Akseptanse: Kortet vokser med innholdet og holder valgtmerke og flerlinjet navn innenfor rammen på320px, også større tekst. Status implementert men trenger ferske assets/visuell retest.

### N3 – P2: Native utlån mangler tydelig total/nettoforklaring

Lån ut valgt Critic Round Two: detaljen har600g netto/tomvekt200. Låneskjemaet viste bare Max available800g/Outg, uten at brukeren ser at feltet er målt totalvekt inkludert rull.750 ble riktig lagret som550. Returskjemaet har derimot tydelig totalvekt og netto-/forbrukspreview.

Akseptanse: Eksplisitt totalvekt inkl. rull samt oppdatert750−200=550-forhåndsvisning; tomt/ugyldig felt gir tydelig validering, ikke plausibelt feil netto. Implementert via HMR; uavhengig retest gjenstår.

Et rått ISO-tidsstempel på Expected return ble undersøkt, men skyldtes feil i enriched-fixturen: denne kontrakten er YYYY-MM-DD, mens fixturen injiserte timestamp. Ikke klassifisert som produktfeil eller trukket fra karakteren. UI-opprettet gyldig dato må vurderes separat.

## Flere faktisk utførte native oppgaver

- Dashboard: rikere beholdning viser41lavstatus og28grupperte innkjøpsforslag. Etter at oppstartssjekkliste ble lukket, var prioritering rolig og handlingslenken åpnet korrekt41-rullers lavbeholdningsutvalg. Ingen grunn til en generell ombygging funnet.
- Lager: 192ruller totalt/180iAll etter siste test, fordi12EMPTY er skjult. Nyregistrert ASA MarineBlue fikk1000g/tare250 og riktig hjem-/gjeldende lokasjon. Markerte den EMPTY, bekreftelse forklarte0g og eventuell avlasting; søk#b6be88 ga0iAll og1iEmpty med0g. Tilbud Refill/Reactivate gjør status reversibel.
- Lokasjoner: opprettet Critic Location R2, omdøpt Critic Location Renamed, arkiverte med forklaring, fant under Previous locations og gjenopprettet. Fire aktive lokasjoner og navnet brukt ved registrering.
- Native utlån/retur: søk i167-valg ga1/167, korrekt spool; navn Native Critic R2,750total→550netto; retur700total→500netto,50brukt. Returpreview og lagret historikk var tydelig. N3 gjelder opprettelsesfasen.
- Native registrering: Bambu-katalogsøk Marine Blue, ASA-valg, hjemmelokasjon, Add→kvittering Openroll/Registeranother; korrekt ny rull åpnet. Deretter EMPTY-prøven over.

## Matrise og kriteriescore etter R2

R1 videreført betyr at dokumenterte faktiske oppgaver fra R1 fortsatt er evidensen; ikke at de ble utført på nytt eller at mer dekning er oppnådd. «Avgrenset» betyr at scorer ikke dekker alle modus/plattformer.

| Område | Oppg | Info | Nav | Tilb | Vis | Tilg | Rob | Vektet | Grunnlag / status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Companion lager/registrering/detalj | 8 | 9 | 8 | 8 | 7 | 8 | 8 | 8,10 | C1/C4/C6 retest, faktisk persistens; C8 kosmetisk320px gjenstår |
| Companion utlån/retur/historikk | 7 | 8 | 6 | 8 | 8 | 8 | 8 | 7,45 | Beregninger korrekte, C7 hindrer raskt valg i reell stor liste |
| Companion innstillinger/tilkobling | 8 | 8 | 8 | 9 | 8 | 8 | 9 | 8,20 | Offline/HTTP500/recovery, lokale preferanser; expiredsession egen test gjenstår |
| Companion printeroppgaver | — | — | — | — | 8 | — | — | — | Bare fersk visuell status; load/unload/update ikke gjennomført uavhengig ennå |
| Dashboard | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8,00 | Nytt rikere datasett, lavbeholdning→riktig filter; live hardware ikke testet |
| Lager/søk/plassering | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8,00 | N1 løst, stor gruppert liste, søk og EMPTY/All |
| Native registrering | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8,15 | Først observert R2: Bambu+lokasjon+receipt+åpne; bulk/borrowed ikke dekket |
| Native detalj/etikettpreview | 9 | 7 | 8 | 9 | 7 | 8 | 8 | 8,10 | R1 videreført + reversibel EMPTY; fysisk print/pdfeksport ikke testet |
| Native utlån/retur/historikk | 8 | 6 | 8 | 8 | 8 | 8 | 8 | 7,60 | Først observert R2; N3 uklar utgående vekt, riktig retur/persistens |
| Lokasjonsadministrasjon | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8,15 | Først observert R2: create/rename/archive/restore, ingen permanent sletting |
| Ønskeliste/bestilling/mottak | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8,00 | R1 videreført: delmottak, pris, lokasjon og én ny rull |
| Native printerlasting | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8,15 | R1 lasting simulert Slot4 + R2 menneskelig slotnavn; fysiske signaler ikke testet |
| Statistikk/økonomi | 8 | 9 | 8 | 8 | 8 | 8 | 8 | 8,20 | R1 faktisk12m/søk/reset/verdispor; nyere flervaluta/prognose/customrange fortsatt hull |
| Generelt | 8 | 8 | 9 | 8 | 8 | 8 | 8 | 8,15 | R1 faktisk språk/lys/mørk; OS-autostart/updaterinstallasjon ikke testet |
| Filamentstandarder | 8 | 9 | 8 | 9 | 8 | 8 | 8 | 8,35 | R1 faktisk valuta/terskel/gruppe/apply/persistens; Client og overwrite ikke testet |
| Bibliotek/webapp | 7 | 8 | 8 | 6 | 8 | 8 | 8 | 7,45 | R1 guidet preview+cancel og Companion; N2 retest/fullClient gjenstår |
| Printerinnstillinger | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8,15 | R1 navn/draftcancel/keep/save; firmware/MMUendring ikke testet |
| Filamentkatalog | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8,15 | R1 faktisk swatchvalidering/save; ekstern import krever egen kontroll |
| Vedlikehold/backup | 8 | 9 | 8 | 8 | 8 | 8 | 8 | 8,20 | R1 faktisk export+manualvalidation; restore/restart/repair/reset ikke testet |
| Faktisk native Client-modus | — | — | — | — | — | — | — | — | Ikke startet/observert: kan ikke godkjennes gjennom Host-skjermbilder |

## Gjenstående for en ærlig sluttevaluering

1. Retest C7, C8, N3 med implementerte endringer og gjenta N2 eksportbanner.
2. Gjennomfør Companion printerlasting/vekt/tømming mot de simulerte slotene. Ingen fysisk printer kreves for UI-arbeidsflyten.
3. Start en separat isolert native Client til review-Host; vurder datatilkobling, begrensede settings, språk, error/offline og navigasjon. Ikke bytt eller slett brukerens bibliotek.
4. Fullfør ferskere statistikk med flere valutaer og endret periode, og eksplisitt markér ikke-observert ekstern import, restore og fysisk funksjonalitet i sluttrapporten.
5. Windows/Linux, faktiske mobile nettlesere/kamera/RFID/VoiceOver og ekstern utgivelse er dekningshull. Chromium390/320/768 og macOS native er faktisk observert. AX-navn, tastatur/modalfokus og tekstlige statuser støtter en avgrenset tilgjengelighetsvurdering, ikke en full WCAG-sertifisering.

Bevis: tmp/ui-review/evidence/critic-r2/*.png, results.json, results-continued.json og native CUA-observasjonene i oppgaven. Ingen utestet område gis8 for å oppnå terskelen.
