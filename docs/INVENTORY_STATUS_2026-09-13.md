# Mistet, funnet og reaktivering – 13. september 2026

## Problem og endring

«Merk som mistet» frigjorde først printersporet og skrev deretter rullstatus i en egen operasjon. En feil i statussteget kunne etterlate en delvis endret rull. Statuskallet brukte også den gamle visningens lokasjon, selv om frigjøring hadde tilbakeført rullen til hjemmelokasjonen.

Mistet, funnet og eksplisitt reaktivering bruker nå én `ROLL_STATUS`-operasjon gjennom den eksisterende transaksjonelle lagerkommandoen. Samme umiddelbare SQLite-transaksjon kontrollerer rullstatus, lokasjon, hjemmelokasjon, aktivt lån og nøyaktig printerspor før den frigjør sporet og skriver status, prisbeskyttelse og historikk. Et skiftet spor kan ikke tømmes gjennom en gammel visning. Vekt, tare, QR og innlån bevares; frigjøring beholder hjemmelokasjonen i stedet for å skrive tilbake en gammel printerplassering. Reaktivering fra EMPTY krever positiv restvekt i databasen. Funnet gjenoppretter LOST til IN_STOCK som tidligere.

UI-et har en synkron innsendinglås som følger den åpne rullen og Host-autoriteten, samt en egen identitet for hvert gjennomgått rullgrunnlag. Gamle callbacks og svar kan ikke overta en ny visning eller en nyere operasjon, heller ikke etter A→B→A. En bekreftet statusendring registreres før oppfriskning; lesefeil utløser ikke et nytt skriv. Oppfriskingsfeil kan fortsatt vises når samme rull får sin nye status. Nye handlinger på et oppdatert grunnlag er mulig.

## Lån og Host

Lagerets aktive lånefeed er bare for utlån. En felles kontroll tar derfor også hensyn til eierskapsmerket BORROWED_IN for aktive lagerruller. Retur av innlån fjerner rullen fra aktivt lager. Mistet/tom/reaktivering sender dermed forventet aktivt innlån til transaksjonskontrollen; sletting av innlånte ruller avvises allerede i dialogen. Backend verifiserer alltid den faktiske låneraden og avviser avvik, blant annet eldre inkonsistente importdata.

Client krever `inventory-roll-status-v1` og den gjennomgåtte målgenerasjonen. Samme mål beholdes fra helsesjekk til POST. En eldre Host avvises før skriving med en egen, oversatt oppdateringsmelding; ingen sekvensiell eller lokal reservevei brukes. Kvitteringen må bekrefte 0–1 ruller med samsvarende historikkantall. Hurtigbufferfeil etter kvittering endrer ikke resultatet til en skrivefeil. Et allerede sendt kall kan fullføres på sitt opprinnelige mål selv om UI-et skifter visning.

Dette krever oppdatert Host for de tre statusknappene. Arbeidet har ingen migrering eller avhengighetsendring. Veiing med automatisk reaktivering bruker fortsatt sin eksisterende flyt og er et separat mulig oppfølgingsområde.

## Verifisering

- Baseline-kjøringen mot den gamle hooken viste blant annet separat sporfrigjøring som første kommando, dobbeltkall og sene oppfriskinger. Etter rettelsen rendrer Chromium produksjonens mistet/funnet-panel og faresonepanel og kontrollerer én kommando, riktig snapshot, retry, ugyldig kvittering, fire oppfriskingsfeil, A→B→A og nye handlinger etter oppdatert status.
- Lånetestene bruker den faktiske felles modellen og dekker innlån med tom utlånsfeed i status-, merk-tom- og slettedialogene.
- Fem SQLite-tester dekker mistet/funnet med bevart vekt og hjemmelokasjon, uendret ny beboer i et skiftet spor, full rollback ved siste historikkskriv, reaktivering med innlån og avviste utlån/fjernede ruller/ugyldige målstatuser.
- Fire native tester bruker loopback-TCP og produksjonens transport og Companion-tjeneste. De kontrollerer én POST, uendrede Client-domenedata, gammel Host, feil/manglende generasjon, målbytte, paring, sen historikkfeil og ugyldige kvitteringer. Endret mål under hurtigbufferoppfriskning bevarer kvitteringen.

UI-bygg, lint, 392 Companion-tester, 896 skripttester, tilgjengelighets- og lånedialogkontrollene, 1 805 UI-tester og 23 ytelsestester besto i den samlede lokale kjøringen. Lokaliseringsporten krevde deretter en ny QA-oppføring for den oversatte Host-meldingen. Alle 21 kataloger ble generert og kontrollert på nytt; 54 lokaliserings-/lastetester, 44 Companion-språktester og 26 desktop-språktester besto med testoppsettet for hver suite. Ledgeren binder dette til de beregnede kilde-, katalog- og runtime-fingeravtrykkene. Det er automatisk katalog-/runtime-QA; ingen ny språklig ekspertgodkjenning eller skjermbildematrise er påstått. Etter denne oppføringen besto `npm run check:contracts`, `npm run doctor` og hele `npm run test:rust`: 721 desktop-, 15 native-service-, 307 kjerne- og 3 generatortester, samt formatering og Clippy i debug- og releaseprofil. Det gir 1 046 beståtte Rust-tester; de eksisterende plattform-/miljøavhengige ignorerte testene er uendret. CI på den signerte committen dokumenteres i PR-en etter kjøring. Testene bruker syntetiske biblioteker og er automatiserte regresjoner, ikke en moderert brukertest.
