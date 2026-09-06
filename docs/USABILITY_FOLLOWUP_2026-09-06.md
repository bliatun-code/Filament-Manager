# Oppfølging av AI-evalueringen – 6. september 2026

De to konkrete forbedringspunktene fra
[AI-evalueringen](USABILITY_AGENT_EVALUATION_2026-09-06.md) er implementert:
hjemmelokasjon kan velges under mottak, og lastingsbekreftelsen navngir det
valgte printersporet. En ekstra regresjonsrettelse skiller et bekreftet mottak
fra feil ved etterfølgende oppfriskning av visningen.

## Endret atferd

- **Mottak med valgfri lokasjon:** Mottaksdialogen bruker den eksisterende
  lokasjonslisten. Client bruker Host-bundne lokasjoner. Antall, kjøpsmetadata
  og hjemmelokasjon sendes samlet; backend oppretter rullene med både hjemme-
  og nåværende lokasjon i samme transaksjon. Det gjøres ingen separat
  lokasjonsoppdatering etter mottaket. Tomt felt beholder tidligere atferd.
  En eldre Host avviser mottak med lokasjon dersom den mangler støtte.
- **Utkast og kvittering:** Lokasjon og kjøpsmetadata nullstilles når en
  mottaksdialog åpnes eller lukkes etter avbrudd eller suksess. Ved skrivefeil
  beholdes utkastet. Kvitteringen viser faktisk mottatt og gjenstående antall
  fra backendens svar.
- **Bekreftet mottak ved lesefeil:** Når backend har bekreftet mottaket,
  returnerer handlingen fortsatt suksess dersom oppfriskning av lageret eller
  kjøpskøen avvises. Utkastet lukkes, riktig mottaksantall beholdes og lesefeilen
  meldes separat. Oppfriskningsfeilen utløser ingen ny mottaksskriving.
- **Nøyaktig printerspor:** Kvitteringen bruker printer-, enhets- og spornavnet
  som ble fanget ved innsending. Omlasting av printerlisten endrer dermed ikke
  hvilket spor kvitteringen navngir. Foreldede svar etter målbytte skal ikke
  publiseres i den nye konteksten.

## Verifisering

`npm run smoke` og `npm run test:rust`, de to delene av `npm run verify`,
passerte på den ferdige koden. Dette omfatter bygging, ESLint, 1 557 UI-tester,
392 Companion-tester, 774 skripttester, 23 ytelsestester, begge
tilgjengelighetsportene, kontrakter, formattering, Rust-tester og Clippy i dev-
og release-profil. De tre ordinært ignorerte Rust-testene er ikke regnet som
kjørte. Ingen ny CI-/Windows-kjøring er utført for denne oppfølgingen.

Regresjonene dekker atomisk mottak ved både tidlig valideringsfeil og sen
transaksjonsfeil, eksisterende/ny/tom lokasjon, del- og sluttmottak, metadata
på alle mottatte ruller, Companion HTTP og reell TCP mellom Host og Client.
En eldre Host med utfylt lokasjon får bare en health-lesing, uten autentisering
eller mottaksskriving; tomt felt beholder én legacy-forespørsel. Host-testen
verifiserer også lokasjonscachen etter mottaket. En faktisk React-hook i
Chromium dekker foreldede lastingssvar ved Host A→B→A og bytte av valgt rull.

Native kontroll avdekket at kjøpskortets bakgrunnsuskarphet bandt modalens
faste plassering til kortet. Ved 1200 × 800 lå panelets bunn på y=890.
Mottaksdialogen rendres nå via en portal til `document.body`. Den eksisterende
browserharnessen bekrefter korrekt plassering, rulling, tastaturinnsending og
fokusretur ved 1200 × 800, 1200 × 600 og 600 × 400.

I den ad-hoc-signerte macOS arm64-appen ble følgende gjennomført mot tre nye,
isolerte kopier av den syntetiske studie-fixturen:

- Avbryt beholdt ruller, kjøpskø, lokasjoner og historikk uendret.
- Delmottak la én rull direkte i «QA Dry box» og viste ett gjenstående eksemplar.
  Sluttmottak opprettet «Receipt shelf», la den andre rullen der og viste null
  gjenstående. Begge lokasjonspekere og mottakshistorikken stemte.
- Rull #100004 ble lastet i «Atlas QA · AMS 1 · Slot 4». Bekreftelsen og
  databasen viste samme spor; vekt og hjemmelokasjon var bevart.
- Mottaksflyten ble gjentatt etter portalrettelsen. Tab flyttet fokus til en
  synlig mottaksknapp, og Return gjennomførte delmottaket. Sluttmottaket
  opprettet også riktig lokasjon i dette siste bygget.

Tre uavhengige før-/etterkontroller passerer. Uvedkommende rader er bevart,
SQLite-integritetskontrollene er grønne, og dataene samsvarer med snapshotene
etter at testappene er avsluttet. Kildedifferanser, bygg, skjermbilder og
kontrollresultater er bevart utenfor Git i `2026-09-06-usability-followup`.
Tidligere deltakerbaser er ikke brukt i denne oppfølgingen.

[Ny mottaksdialog med lokasjon og tilgjengelig knapp](screenshots/usability-receipt-location.png)
og [bekreftelse med nøyaktig printerspor](screenshots/usability-load-confirmation.png)
viser syntetiske testdata i engelsk mørkt tema ved 1200 × 800.
Alle 21 språkkataloger passerte bygg- og runtimekontroller; dette er registrert
mot gjeldende fingeravtrykk i QA-ledgeren. Full visuell språkmatrise og ny
språklig morsmålsvurdering er ikke utført.

Det er ikke samlet inn nye menneskemålinger eller kjørt en ny sammenligning
mot baseline. Målene om 90 % uhjulpet fullføring og 30 % kortere median tid i
[deltakerprotokollen](USABILITY_TEST_PROTOCOL.md) er fortsatt umålte.
Registreringsdialogens mulige risiko for dobbeltregistrering er fortsatt en
hypotese; denne oppfølgingen endrer ikke den flyten eller innfører en egen
handling for å åpne mottatte ruller fra kvitteringen.
