# Tomme ruller og atomisk «Merk som tom»

Utgangspunkt: `ad3aac5c`, etter merget PR #116.

## Oppførsel

Standardfilteret «Alle» i lageret skjuler nå ruller med normalisert status EMPTY. «Tom» viser dem fortsatt, og rullene, historikken og muligheten for reaktivering beholdes. Valget bygger på status, ikke på at beregnet restvekt tilfeldigvis er null. Filtreringen skjer før gruppering, telling av synlige ruller og utvalg til massehandlinger.

«Merk som tom» gjorde tidligere tre separate operasjoner: frigjør printerspor, endre status, og sett vekt til null. Feil etter første eller andre operasjon kunne etterlate delvis endring. Den gamle tømmingen brukte dessuten bare printer- og spor-ID, uten å kontrollere om en annen rull hadde overtatt sporet.

Nå sendes én MARK_EMPTY-operasjon gjennom den eksisterende beskyttede inventory-mutasjonsruten. SQLite kontrollerer forventet status, hjemmeplassering, nåværende plassering, aktivt lån, printertilordning og konkret spor-ID innen én umiddelbar transaksjon. Rullen frigjøres bare fra det kontrollerte sporet. Status EMPTY, begge lagrede vektfelt på 0 gram, historisk prislås og historikkhendelser lagres sammen. Hjemmeplassering, metadata og tare beholdes; etter frigjøring går plasseringen tilbake til hjemmelokasjonen. Ingen kunstig veiing eller printjobb opprettes. USED_UP-hendelsen bevarer tidligere vektfelt.

Utlånte og fjernede ruller avvises. Innlån avsluttes ikke av at rullen brukes opp. Et gammelt forventningsgrunnlag avvises uten delvis skriving. En fersk forespørsel for en allerede tom, frigjort rull med begge vektfelt på null er en ren nulloperasjon.

## Dialog og Client/Host

Handlingen har en synkron innsendinglås som følger valgt rull, status, åpen detaljvisning, bibliotek, Host og målgenerasjon. Dobbeltklikk før React oppdaterer skjermen sender én kommando. Sene svar og gamle callbacks kan ikke overta en ny visning eller frigjøre en nyere handlingslås.

Kvittering registreres før oppfriskning. Kastede lesefeil og rapportert ERROR/OFFLINE/CACHED behandles som oppfriskingsfeil; en bekreftet handling kan ikke sendes om igjen fra det samme uoppdaterte grunnlaget. Vanlig visningsoppfriskning og ny åpning er fortsatt mulig.

Client krever Host-kapasiteten `inventory-mark-empty-v1` og riktig målgenerasjon. Eldre Host avvises før POST med eksisterende oppgraderingsmelding for printerspor/vekt. Det finnes ingen lokal eller sekvensiell reservevei. Transporten beholder samme mål fra helsesjekk til skriving, og feil i hurtigbuffer/status etter kvittering endrer ikke kvitteringen til en skrivefeil. Allerede innsendte forespørsler kan fullføres på det opprinnelige målet.

Dette krever oppdatert Host ved Client-bruk, men ingen skjemaendring, migrering eller ny release for å teste endringen.

## Verifisering

- React/Chromium rendrer den faktiske handlingshooken, faresonebekreftelsen og lagerets filterhook. Scenarioene dekker standard «Alle», «Tom», vellykket tømming, lokal og Host-payload, dobbeltklikk, avvisning og eksplisitt nytt forsøk, fire oppfriskingsfeil, rull-/Host-/generasjonsbytte, lukking og A→B→A med overlappende svar.
- SQLite-regresjoner dekker lagerrull og tilordnet rull, vekt/tare/hjemmelokasjon, prisbeskyttelse, gjentakelse, endret spor og uendret ny beboer. Feil ved vektoppdatering og siste USED_UP-hendelse krever identisk snapshot av alle kontrollerte tabeller etter rollback. Innlån bevares; utlån og fjernede ruller avvises.
- Client-testene bruker virkelig loopback-TCP, produksjonens transport og tjeneste, isolerte databaser og minnebasert legitimasjonslager. De kontrollerer én POST, atomisk Host-resultat, uendrede Client-domenedata, avvist foreldet plassering og ingen POST ved eldre Host, feil/manglende generasjon, målbytte under helsesjekk eller manglende paring. Oppfriskingsfeil og målbytte etter kvittering bevarer et bekreftet resultat.

Samlet `npm run verify` er grønn: UI-bygg/lint, 1 752 UI-tester, 896 skripttester, 392 Companion-tester, begge tilgjengelighetsporter, utlånsdialogscenarioene, 23 ytelsestester, alle kontrakter og doctor. Rust bestod 712 desktop-tester, 15 native tjenestetester, 301 kjernetester og tre generatortester, samt fmt og Clippy i dev/release. De siste presiseringene i rollback-/fjernet-rull-testen og browserens venting er også kontrollert separat. CI-resultater føres i PR-en etter én samlet push. Ingen test bruker brukerens bibliotek eller printere. Dette er automatiserte regresjoner, ikke en moderert brukertest.
