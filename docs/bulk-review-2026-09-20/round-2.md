# Massehandlinger i lageret – uavhengig kritikk, runde 2

Faktisk native retest i den samme isolerte «Filament Review Data Safety», database tmp/bulk-review/review.db. Nytt bygg, produktkode fryst under gjennomføringen. Samme syntetiske bibliotek med 72 ruller. Ingen direkte databaseskriving eller produksjons-/printerhandlinger.

## Oppsett og nullgrams reaktivering

R1 hadde etterlatt Alpha06 IN_STOCK med 0 g. Jeg satte den tilbake til Empty gjennom vanlig bulk-UI, observerte lesbar målstatus «Empty» og kvittering «Updated rolls: 1.», og tok deretter critic-r2-before.json. Oppsettet inngår ikke i sammenligningen før/etter avvisning.

Empty-filter og søket BULK Alpha viste nå Alpha05 EMPTY 505 g og Alpha06 EMPTY 0 g. Select 2 visible rolls valgte begge. Målet In stock ble avvist ved Review med:

«Set measured total weight above empty spool weight before reactivating. PETG · BULK Alpha 06 · Green (#ew_006)»

Ingen gyldig review eller Confirm ble vist. Begge valgene ble beholdt. critic-r2-after-zero-rejection.json er byte-identisk med critic-r2-before.json i alle ti kontrollerte kjernetabeller, kontrollrullfelter og integritetsresultater. Den gyldige Alpha05 ble heller ikke delvis reaktivert, og ingen historikk ble lagt til. **BULK-F1 er rettet i denne faktisk observerte flyten.**

Jeg åpnet Alpha06 fra kortet, satte målt totalvekt til 700 g med tare 200 g og brukte vanlig Save for veiing. Detaljen viste In stock og 500 g; kvitteringen forklarte at rullen ble reaktivert fra ny målt vekt. Etter lukking var de samme to rullene fortsatt valgt, men bare Alpha05 lå i Empty-visningen. UI forklarte «2 selected total · 1 in this view».

Nytt Review viste 2 selected, 1 affected, 1 unchanged og «Change status target: In stock». Bekreftelse ga «Updated rolls: 1.» og ingen flere treff i Empty-filteret. Under All viste alle seks Alpha-rullene seg, inklusive Alpha05 505 g og Alpha06 500 g. Snapshotene critic-r2-after-weight-correction.json og critic-r2-after-reactivate.json viser at den siste bulkhandlingen bare endret Alpha05 fra EMPTY til IN_STOCK; Alpha06 var korrekt uendret etter sin separate veiing. Øvrige kontrollerte tabeller utenom spool/history var uendret.

## Lesbare tekster og målrettet flytteretest

Begge statusmål ble faktisk sett som lesbare navn, «Empty» og «In stock», i stedet for rå enumverdier. Review bruker nå «All selected changes are saved together. If any change fails, nothing is saved.» Dette fungerte grammatisk for både én og flere endringer. Kvitteringen «Updated rolls: 1.» er forståelig uten ordet atomically. **BULK-F2 er rettet i observert engelsk UI.** Andre oversettelser er ikke manuelt vurdert.

Alpha01 på hylle A og Alpha02 på hylle B ble valgt med mål Bulk Shelf B. Review viste 2 selected, 1 affected og 1 unchanged. Tastaturfokus startet på reviewoverskriften; Tab til Confirm og neste Tab til Cancel, Return avbrøt og returnerte fokus til Move. critic-r2-after-move-cancel.json er byte-identisk med snapshot før forsøket.

Ny review og bekreftelse flyttet bare Alpha01 til B. UI viste «Updated rolls: 1.». critic-r2-after-move.json bekrefter bare Alpha01 endret location_id/home_location_id, med uendret nettovekt; ingen annen kontrollrull endret seg.

## Navngitte beskyttelsesfeil og korrigert nytt forsøk

Jeg samlet Alpha01, aktivt utlån #100008 og printertildelt #100001 gjennom vanlige søk/statusfiltre. Flyttemål Bulk Shelf A ville endret den ubeskyttede kontrollrullen.

Første review ble avvist med både forklaring og den konkrete rullen: «1 affected roll has an active loan. Return it before changing placement or status. PETG+HS · Deep Blue (#100008)». Etter at bare utlånet ble fjernet fra utvalget, viste nytt review «1 affected roll is loaded in a printer. Use printer-slot actions instead. PLA Basic · Black (#100001)».

critic-r2-after-loan-rejection.json og critic-r2-after-printer-rejection.json er byte-identiske med critic-r2-after-move.json. Begge beskyttelsene avviste hele utvalget uten delvis flytting eller historikk. Den tidligere informasjonsmangelen om hvilken rull som blokkerer er dermed rettet for disse observerte utvalgene.

Etter at printerrullen også ble fjernet, viste review én berørt rull. Bekreftelse lyktes og flyttet bare Alpha01 fra B tilbake til A. critic-r2-after-corrected-move.json bekrefter dette. Ingen lån eller slottilordning endret seg, og korrigering krevde ingen omstart eller full tømming av utvalget.

## Karakterer og videreført dekning

Kriterier/vekter: oppgaveløsning 25 %, informasjon 20 %, navigasjon 15 %, tilbakemelding 15 %, visuelt 10 %, tilgjengelighet 10 %, robusthet 5 %.

| Flyt | Oppgave | Informasjon | Navigasjon | Tilbakemelding | Visuelt | Tilgjengelighet | Robusthet | R1 | R2 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Utvalg, søk/filter og valgt eksport | 9 | 8 | 8 | 8 | 8 | 7 | 9 | 8,20 | 8,20 = |
| Masseflytting, review og avbryt | 9 | 8 | 8 | 9 | 8 | 8 | 9 | 8,30 | 8,45 |
| Tomstatus, All og reaktivering | 9 | 8 | 8 | 9 | 8 | 7 | 9 | 6,55 | 8,35 |
| Beskyttede valg og korrigert nytt forsøk | 9 | 8 | 8 | 9 | 8 | 7 | 9 | 8,05 | 8,35 |

= Eksportkarakteren er videreført fra de faktiske CSV-/JSON-eksportene og eksakte ID-kontrollene i R1; ingen nye eksportfiler ble laget i R2. Utvalg gjennom filtre ble også brukt og observert på nytt i R2, men dette er ikke en ny eksportverifikasjon. De tre øvrige flytene ble gjennomført på nytt.

Alle fire hovedflyter når målet innen denne avgrensningen. Ingen nye funksjonelle funn krever en tredje runde. Enkelte knappetekster som «Confirm Change status for 1» kan fortsatt få språkvask, og checkboxnavnene bruker forkortet rullreferanse fremfor filamentnavn. Dette er mindre forbedringer; det begrenser også hvor høyt tilgjengelighet kan vurderes uten en full skjermleserprøve.

## Bevis, grenser og sluttstatus

Bevis er critic-r2-before.json, after-zero-rejection, after-weight-correction, after-reactivate, after-move-cancel, after-move, after-loan-rejection, after-printer-rejection og after-corrected-move i evidence. Alle ble laget med den eksisterende skrivebeskyttede snapshot-hjelperen. Skjermbilder av navngitt feil og lesbar review er faktisk observert i CUA-loggen, men ikke lagret via en udokumentert PNG-API.

Ikke manuelt testet: samtidige eksterne vektendringer etter review, manglende/negativ lagret vekt, mer enn tre blokkerende ruller og +N-oppsummering, Lost-status, Host/Client-bulk over nett, fysisk etikettutskrift, faktisk printer, full VoiceOver og Windows/Linux. Disse er ikke implisitt godkjent gjennom scoren. Backend/frontend-regresjoner rapportert av implementeringsagenten holdes adskilt fra den observerte UI-dekningen. Full massehandling på alle 72 ruller er heller ikke prøvd.

Sluttstatus: alle seks Alpha-rullene er IN_STOCK; 01 på Bulk Shelf A, 02–06 på B, nettovekter 501/502/503/504/505/500 g. Lån og printertilordninger er bevart. Appen står på Assigned-filteret uten aktive massevalg. Ingen nye eksportfiler i R2. UI er frigitt til implementeringsagenten etter avsluttet observasjon.
