# Massehandlinger i lageret – uavhengig kritikk, runde 1

Faktisk native UI-vurdering i «Filament Review Data Safety», ny isolert Standalone-database tmp/bulk-review/review.db med 72 syntetiske ruller. Produktkode var fryst på baseline 217d3333. Ingen direkte databaseskriving, produksjonsdata, fysisk printerstyring eller etikettutskrift ble brukt. Samme kriterier og vekter som tidligere vurderinger.

## Utvalg gjennom søk, filtre og eksport

Start viste 72 totale lagerrader og 70 under All. Søk etter BULK Alpha ga fem ruller; Alpha06 var korrekt utelatt fordi den var EMPTY. Jeg åpnet Select multiple og valgte Alpha01 og Alpha02. Ved søk etter Alpha03 sto det «2 selected total · 0 in this view». Etter tillegg av Alpha03 ble det «3 selected total · 1 in this view». Bytte til Empty-filter ga ingen treff, men den synlige oppsummeringen beholdt «3 selected total · 0 in this view» og deaktiverte Select 0 visible rolls.

Fra denne tomme visningen eksporterte jeg CSV og JSON. Begge kvitterte med tre valgte ruller. Readonly kontroll av de eksporterte filene bekrefter eksakt bulk_review_001, bulk_review_002 og bulk_review_003, ingen ekstra eller manglende ID-er. Utvalget var dermed globalt på tvers av gjeldende søk/filter, slik UI forklarte.

Implementeringsagenten identifiserte og flyttet kun disse syntetiske eksportene fra Downloads til evidence:
- filament-manager-selected-inventory-1789863354198.csv
- filament-manager-selected-inventory-1789863360875.json

Kvitteringen oppgir format og antall, men ikke filnavnet. Checkbox-tilgjengelighetsnavn bruker forkortet rull-ID, eksempel Select #ew_001; filamentnavnet står i kortet, men er ikke inkludert i checkboxnavnet. Dette begrenser komforten ved tastatur/skjermleser uten å utgjøre dokumentasjon på feil utvalg. Full VoiceOver er ikke prøvd.

## Masseflytting med uendrede ruller og avbryt

De samme tre kontrollrullene ble flyttet mot Bulk Shelf B: Alpha01/02 lå på A, mens Alpha03 allerede lå på B. Forhåndsvisningen viste 3 selected, 2 affected, 1 unchanged, riktig målnavn og forklaring om at endringer/historikk lagres samlet. Confirm Move for 2 viste antallet som faktisk ville endres.

Fokus ble satt på Review Move-overskriften. Tab gikk til Confirm og neste Tab til Cancel; Return avbrøt og returnerte fokus til Move-knappen. critic-r1-after-move-cancel.json er byte-identisk med critic-r1-before.json. Ny gjennomføring ga to oppdaterte ruller, avsluttet utvalgsmodus og satte fokus på Select multiple. UI viste Alpha01/02 på Bulk Shelf B. Snapshot critic-r1-after-move.json bekreftet endrede location_id/home_location_id for bare disse to, uendrede nettovekter og ingen endring i de øvrige kontrollerte kjernetabellene utenom spool/history.

## Tomstatus og reaktivering – BULK-F1

Alpha04/05 ble valgt og masseendret til Empty. Review viste to berørte og null uendrede; etter bekreftelse forsvant begge fra All, slik ønsket standardvisning tilsier. Empty-filteret viste Alpha04 på 504 g, Alpha05 på 505 g og den opprinnelige Alpha06 på 0 g. Snapshot critic-r1-after-empty.json bekreftet EMPTY og bevarte nettovekter for 04/05.

**BULK-F1, P1: bulk omgår positiv-nettovektkravet ved reaktivering.** Jeg åpnet Alpha06 og brukte dens individuelle Refill / Reactivate roll. UI avviste med «Set measured total weight above empty spool weight before reactivating». Deretter valgte jeg Alpha04 og Alpha06 i massehandling, mål In stock. Review viste to berørte, ingen advarsel og aktiv Confirm. Bekreftelse ga «2 rolls updated atomically». Snapshot critic-r1-after-zero-reactivate.json viser Alpha04 IN_STOCK med 504 g og Alpha06 IN_STOCK med 0 g. Begge forsvant fra Empty-filteret. Samme konkrete rull ble altså avvist individuelt, men lagret som aktiv gjennom bulk uten korrigert vekt.

Akseptanse: Bruk den samme positive-nettovektregelen i bulk som i individuell reaktivering. Forklar hvilke ruller som må få riktig målt total/tare først. Et blandet utvalg med én ugyldig rull må avvises uten å lagre den gyldige delen eller historikk. Korrigert nytt forsøk med positive lagrede vekter skal lykkes. Regelen må vurderes igjen ved bekreftelse hvis data har endret seg etter review; dette siste er et regresjonskrav, ikke en allerede observert UI-race.

**BULK-F2, mindre språkfunn:** review bruker rå statusverdier EMPTY og IN_STOCK, mens velgeren viser lesbare navn. Kvitteringen «updated atomically» og formuleringen «committed together» bruker tekniske begreper. For én rull blir teksten «All 1 changes ...». Bruk lesbare lokaliserte statusnavn og enkelt språk om at alle endringer ble lagret eller at ingenting ble endret ved feil.

## Blandet utvalg, beskyttelse og korrigert nytt forsøk

Et nytt utvalg kombinerte Alpha01, det aktive utlånet #100008 og den printertildelte rullen #100001. Dette ble samlet gjennom søk og statusfiltre; UI viste konsekvent totalvalgte og synlige valgte. Mål for flytting var Bulk Shelf A.

Første Review move ble avvist: «1 affected roll has an active loan. Return it before changing placement or status.» Ingen bekreftelse ble tilbudt. Etter at utlånet ble fjernet fra utvalget, ble neste Review avvist med «1 affected roll is loaded in a printer. Use printer-slot actions instead.» Statusreview med samme gjenværende printerutvalg beholdt den samme beskyttelsen. critic-r1-after-loan-rejection.json og critic-r1-after-printer-rejection.json er begge byte-identiske med snapshot før forsøkene. Ingen delvis flytting eller historikk ble lagret.

Jeg fjernet deretter printerrullen, beholdt bare Alpha01 og prøvde samme flytting på nytt. Review viste én berørt rull med korrekt målnavn. Etter bekreftelse viste kvitteringen én oppdatert rull; critic-r1-after-corrected-move.json bekrefter bare Alpha01 flyttet fra B til A. Utlån, slottilordninger, nettovekter og øvrige kontrollruller var uendret. Korrigering krevde ingen omstart eller tømming av hele utvalget.

Mindre forbedring: feilene oppgir antall og årsak, men ikke rull-ID/navn eller en direkte måte å vise bare de blokkerende valgene. Med tre kjente ruller var det håndterbart via Loaned out/Assigned-filtrene; store blandede utvalg vil kreve mer leting. Dette trekker navigasjon ned til 7.

## Baselinekarakterer

Vekter: oppgaveløsning 25 %, informasjon 20 %, navigasjon 15 %, tilbakemelding 15 %, visuelt 10 %, tilgjengelighet 10 %, robusthet 5 %.

| Flyt | Oppgave | Informasjon | Navigasjon | Tilbakemelding | Visuelt | Tilgjengelighet | Robusthet | R1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Utvalg, søk/filter og valgt eksport | 9 | 8 | 8 | 8 | 8 | 7 | 9 | 8,20 |
| Masseflytting, review og avbryt | 9 | 8 | 8 | 8 | 8 | 8 | 9 | 8,30 |
| Tomstatus, All og reaktivering | 6 | 6 | 8 | 6 | 8 | 7 | 5 | 6,55 |
| Beskyttede valg og korrigert nytt forsøk | 9 | 8 | 7 | 8 | 8 | 7 | 9 | 8,05 |

Statusflyten når ikke målet: review presenterer en ugyldig nullgrams reaktivering som en normal gyldig endring, og handlingen lagres faktisk. At tommerking og filtrering fungerte, oppveier ikke denne inkonsistensen. De øvrige tre flytene når målet innen observert omfang.

## Runde 2 og grenser

Retest nullgrams/positiv blandet reaktivering, avvisning uten delvis lagring, korrigert vekt gjennom vanlig rull-UI og gyldig nytt forsøk. Kontroller lesbare lokaliserte statusnavn, antallsbøyning og kvittering. Flytting og beskyttede utvalg bør få en målrettet ny kontroll dersom felles bulklogikk/tekster endres. De uendrede eksportene kan videreføres eksplisitt fra R1.

Mac-native utviklingsbygg, engelsk/mørkt tema og en liste på 72 syntetiske ruller er observert. Utvalgene var to/tre ruller; ikke alle 72 samtidig. Lost-status, fysisk etikettutskrift, faktiske printere, Host/Client-bulk over nett, full VoiceOver, Windows/Linux og samtidige endringer fra en annen klient er ikke manuelt testet. Ingen karakter innebærer dekning av disse hullene. Readonly snapshotene omfatter ti navngitte kjernetabeller og alle kontrollrullfelter som hjelperen eksponerer.

Sluttstatus: Alpha01 på Shelf A; Alpha02/03 på B; Alpha04 aktiv med 504 g; Alpha05 EMPTY med 505 g; Alpha06 feilaktig IN_STOCK med 0 g etter den dokumenterte feilen. Lån og printertilordninger er bevart. Testappen står på Assigned-filteret uten aktive bulkvalg. Skjermbilder ble observert via CUA; varige bevis er rapport, snapshots og de to konkrete eksportfilene.
