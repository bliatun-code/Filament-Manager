# Lasting i printer fra lageret

Utgangspunkt: `627fdba2`, etter merget PR #115. Oppfølgingen gjelder «Last i printer» fra rullens detaljvisning.

## Funn og endret oppførsel

- En ny printerliste nullstilte valgt spor til første ledige spor, også når brukerens valg fortsatt fantes. Dialogen beholder nå gyldig valg. Forsvinner sporet, må brukeren velge eksplisitt på nytt; et annet spor velges aldri automatisk ved oppfriskning.
- Skrivefeil ble sendt til detaljvisningen bak lastedialogen. Feilen vises nå som `role="alert"` inne i lastedialogen, med bevart sporvalg. Ny åpning starter uten gammel feil eller gammelt valg.
- Dialogen ble stående ved skifte av Host, målgenerasjon eller rull. Åpning, bekreftelse og lukking bindes nå til samme dialogøkt. Et gammelt bekreftelseskall kan ikke sende en handling etter lukking og gjenåpning. En synkron lås sperrer også lukking i samme hendelse som innsending, før React har oppdatert `busy`.
- Kvittering og lukking skjedde først etter oppfriskning. En bekreftet skriving gir nå kvittering og lukker dialogen før lesing. Kastede lesefeil og rapportert ERROR/OFFLINE/CACHED gir separat oppfriskingsfeil. Vanlige datalastere rapporterer slike utfall gjennom sin eksisterende reporter; de kaster normalt ikke. Dermed forveksles ikke en bekreftet skriving med en avvist handling.
- Den gamle generelle tilordningskommandoen kunne erstatte innholdet i et spor som var blitt opptatt etter at dialogen åpnet. Lagerflyten bruker nå `operate_printer_slot` og tilsvarende Host-operasjon, med eksplisitt forventning om tomt spor og uten innsendt vekt. Client sender også forventet målgenerasjon.

## Atomisk lasting uten veiing

Den eksisterende printeroperasjonen tillater nå manglende innkommende måling bare ved lasting til et tomt spor uten utgående måling. Vekten som finnes i databasen beholdes. Veiing, tømming og bytte med en utgående rull beholder sine målingskrav.

I samme transaksjon kontrolleres målsporet og at den innkommende rullen ikke allerede er tilordnet et annet spor eller har status ASSIGNED. Sperrene for utilgjengelige og utlånte ruller beholdes. Tilordningen og én historikkhendelse lagres sammen; ingen ny vektmåling eller printjobb opprettes. En sen historikkfeil ruller tilbake hele operasjonen. Gjentatt lasting med forventning om tomt spor avvises uten nye endringer.

Ingen skjemaendring eller migrering er nødvendig. Client krever en oppdatert Host som støtter denne operasjonen. En Host uten `printer-slot-operations-v1` avvises med eksisterende oppgraderingsmelding; en mellomliggende utviklingsversjon som fortsatt krever målt vekt avviser forespørselen. Det finnes ingen fallback til den gamle ubeskyttede tilordningen. Allerede sendte forespørsler kan fortsatt fullføres på sitt opprinnelige mål.

## Regresjoner

Den eksisterende React/Chromium-testen er utvidet til å rendre både handlingshooken og den faktiske lastedialogen. Seks opprinnelige feilscenarioer feilet før rettelsen og passerer etterpå. Ytterligere scenarioer dekker rapportert ERROR/OFFLINE/CACHED og lokal lasting med samme tomt-spor-kontrakt. Eksisterende kontroller av sene Host-svar og rullbytte er beholdt. Testen inngår automatisk i ordinær `test:ui` på begge CI-plattformer; ingen ekstra workflow er lagt til.

To nye SQLite-tester dekker bevart lagret vekt, opptatt mål, gjentakelse, allerede flyttet rull og full tilbakerulling ved historikkfeil. Begge feilet før utvidelsen av kjerneoperasjonen. De ti fokuserte printeroperasjonstestene passerer med endringen.

En ny test gjennom den virkelige Client-transporten og en syntetisk Host over loopback-TCP bekrefter én operasjons-POST med eksplisitte nullfelt, bevart Host-vekt på 437 gram, ingen nye målinger og urørte lokale Client-rader. Den bruker midlertidige databaser og minnebasert credential-lagring. Dette er automatisert funksjons- og dataintegritetsevidens, ikke en moderert brukertest eller skjermlesergodkjenning.

Samlet `npm run verify` er grønn: UI-bygg/lint, 1 738 UI-tester, 896 skripttester, 392 Companion-tester, begge tilgjengelighetsporter, fem utlånsdialogscenarioer, 23 ytelsestester, alle kontrakter og doctor. Rust bestod 708 desktop-tester, 15 native annonsetester, 297 kjernetester og 3 generatortester, samt formatering og Clippy i både dev- og releaseprofil. CI-resultater føres i PR-en før merge. Versjonen er uendret; testene krever ingen ny publisert release.
