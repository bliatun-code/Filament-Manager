# Sletting fra rulldetaljer – 13. september 2026

## Problem og endring

Vanlig sletting og permanent sletting brukte React-state som eneste innsendinglås. To bekreftede kall i samme hendelse kunne sende to kommandoer. Et sent svar kunne dessuten nullstille valget etter at brukeren hadde åpnet en annen rull eller byttet Host. Skrivefeil lukket bekreftelsen, og feil ved oppfriskning ble presentert som feil ved selve slettingen.

En felles handlingshook eier nå bekreftelse, feil og synkron innsendinglås for valgt rull, åpen detaljvisning, bibliotek, Host og målgenerasjon. Avbryt og ny bekreftelse ugyldiggjør gamle callbacks. Et aktivt inn- eller utlån avvises før bekreftelse, med den eksisterende forklaringen om retur. Backend håndhever fortsatt låneregelen dersom lånet endres etter at dialogen åpnes.

Et bekreftet skriv registreres før visningen oppdateres. Den opprinnelige detaljvisningen lukkes, og ruller, printere og lån hentes på nytt. Kastede lesefeil og rapportert ERROR/OFFLINE/CACHED gir en egen oppfriskingsfeil; de åpner ikke slettingen for automatisk gjentakelse. Oppfriskingsresultatet kan følge den automatiske lukkingen, men kan ikke overta en ny rulldialog eller Host. Feil før kvittering blir i bekreftelsen, slik at brukeren kan vurdere et eksplisitt nytt forsøk.

## Host og database

Client sender den gjennomgåtte målgenerasjonen til native-kallet. Samme mål beholdes gjennom helsesjekk, autentisering og POST; et A→B→A-bytte får ny generasjon og avvises. Manglende generasjon avvises ved deserialisering. Svaret må ha `ok: true`. Hurtigbuffer- og statusfeil etter kvittering endrer ikke en fullført sletting til en skrivefeil.

De eksisterende `/spools/{id}/delete`- og `/purge`-rutene og JSON-formatet mot Host beholdes. Dette krever ingen ny Host-kapasitet. Printerhurtigbufferen oppfriskes også, siden sletting frigjør printerspor.

Den eksisterende transaksjonelle slettingen i kjernen beholdes: vanlig sletting bevarer rull og historikk, mens permanent sletting fjerner rullen og tilhørende historikk. Begge avviser aktive lån. Ingen migrering, avhengighetsoppdatering eller release inngår.

Et allerede sendt HTTP-kall kan fullføres på sitt opprinnelige mål selv om brukeren bytter visning. Manglende eller ugyldig kvittering er ikke bevis på at Host rullet tilbake; klienten sender derfor ikke automatisk på nytt. Dette arbeidet innfører ikke en ny protokoll for gjenfinning av tapte kvitteringer.

## Verifisering

- Før rettelsen bestod de to vanlige klikkflytene i Chromium; 20 av de øvrige scenarioene avdekket manglende beskyttelse eller tilbakemelding i den gamle hooken. Den midlertidige baseline-adapteren er fjernet fra den ferdige testen.
- 27 scenarioer rendrer nå produksjonens hook og faresonepanel i Chromium. De dekker begge handlinger, dobbeltkall, avbryt/ny bekreftelse, eksplisitt retry, sene svar, overlappende A→B→A-kall, automatisk lukking, fire typer oppfriskingsfeil, aktivt lån og Host-generasjon.
- Fem native tester bruker loopback-TCP, produksjonens transport og Companion-tjeneste, isolerte databaser og minnebasert legitimasjon. De kontrollerer kompatibel Host uten nye kapasiteter, én POST, uendrede Client-domenedata, ugyldig autoritet og paring, målbytte, positiv kvittering, hurtigbufferfeil og avvist innlån.
- SQLite-testen fremprovoserer feil ved siste slettehistorikk, sletting av historikk og til slutt sletting av rullraden. Hvert avbrudd må etterlate et identisk snapshot av de kontrollerte domenetabellene, inkludert printerspor, vekter, historikk og revisjoner. De eksisterende testene for vanlig sletting etterfulgt av purge og avvist utlån beholdes.

Alle lokale verifiseringstrinn er bestått: UI-bygg/lint, 1 780 UI-tester, 896 skripttester, 392 Companion-tester, begge tilgjengelighetsporter, utlånsdialogscenarioene, 23 ytelsestester, kontrakter og doctor. Rust bestod 717 desktop-tester, 15 native tjenestetester, 302 kjernetester og tre generatortester, samt fmt og Clippy i dev/release. Første `npm run verify` stoppet fordi den nye rapporten ikke var sporet i Git; etter staging bestod de gjenstående kontrakt-, doctor- og Rust-trinnene separat. De siste hook-/wrapperkontrollene bestod også (43 tester). PR #118 er merget som `7ea604a0` etter én push og åtte grønne kontroller på `26393966`: [CI](https://github.com/bliatun-code/Filament-Manager/actions/runs/34779392215) og [CodeQL](https://github.com/bliatun-code/Filament-Manager/actions/runs/34779392274). Begge plattformloggene bekrefter de nye testene. macOS bestod installert DMG og skjema 1→7 over to starter; Windows bestod MSI-livssyklus, pakket backup/gjenoppretting med 1 643 rader og Host/Client (760 g/333 g). Testene bruker syntetiske biblioteker og er automatiserte regresjoner, ikke en moderert brukertest.

Oppfølging: Lagerets aktive lånefeed viste seg å være bare for utlån. [Statuspakken](INVENTORY_STATUS_2026-09-13.md) supplerer derfor UI-kontrollen med BORROWED_IN-merket. Databasens avvisning av innlån var allerede dekket og gjaldt også i #118.
