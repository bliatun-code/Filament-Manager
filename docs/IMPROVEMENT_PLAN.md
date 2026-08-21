# Forbedringsplan for Filament Manager

| Felt | Verdi |
| --- | --- |
| Planstatus | Påbegynt |
| Planperiode | 12 uker |
| Oppstart | 2026-08-21 |
| Sist oppdatert | 2026-08-21 |
| Eier | Prosjektteamet |

## Mål

Filament Manager skal bli raskere og enklere i daglig bruk, gi konsistente svar på tvers av desktop, Client og Companion, og ha et sterkere sikkerhetsnett for data, oppgraderinger og distribusjon. Eksisterende arkitektur skal forbedres trinnvis; planen legger ikke opp til en full omskriving.

De viktigste resultatmålene er:

- Minst 90 % fullføring uten hjelp i fem faste brukertester: registrere, finne, laste, låne ut og motta en spole.
- Minst 30 % kortere median gjennomføringstid for de samme oppgavene.
- Identiske lager-, status- og terskelresultater i desktop, Client og Companion.
- Alle støttede v0.27-backuper kan oppgraderes og gjenopprettes uten datatap.
- Ingen regresjon mot eksisterende ytelsesbudsjett for 10 000 spoler eller gjeldende bundlebudsjetter.

## Statusnøkkel

- `Ikke startet`: Arbeidet er ikke påbegynt.
- `Pågår`: Arbeidet er aktivt.
- `Blokkert`: Arbeidet venter på en avklaring eller ekstern avhengighet.
- `Ferdig`: Ferdigkriteriene er dokumentert og verifisert.

## Fase 0 – korrekthet og sikkerhetsnett (uke 1)

**Mål:** Fjerne kjente inkonsistenser i lagerberegninger og etablere nødvendige kvalitets- og sikkerhetsporter før større produktendringer.

| Prioritet | Arbeid | Status | Start | Ferdigkriterium |
| --- | --- | --- | --- | --- |
| P0 | Samle regelen for lav beholdning i én domenedefinisjon og rette tellingen slik at Dashboard ikke begrenser totalen til de fem viste elementene. Avklar også om 200 g er lav eller sunn beholdning. | Ferdig | 2026-08-21 | Grensene 0, 1, 199, 200 og 201 g samt mer enn fem lave spoler er dekket av automatiske tester, og alle flater viser samme resultat. |
| P0 | Legge oppgradering fra forrige støttede release inn som obligatorisk CI- og release-gate. | Ferdig | 2026-08-21 | En representativ v0.27-database oppgraderes, åpnes og gjenopprettes automatisk uten tap eller endring av forretningsdata. |
| P1 | Styrke Companion med CSP, sikkerhetsheadere, body-grense, request-timeout og rate limiting. | Ferdig | 2026-08-21 | Sikkerhetskontroller er testet, dokumentert og kjører i CI. |
| P1 | Beholde og tydeliggjøre eksisterende porter for ytelse, backup, tilgjengelighet og lokalisering. | Ferdig | 2026-08-21 | Alle porter har navngitt eier, dokumentert terskel og gir blokkerende CI-feil ved regresjon. |

### Faseport 0

Fasen er ferdig når lav-beholdning gir samme resultat overalt, oppgradering fra v0.27 er automatisk verifisert, og de nye Companion-kontrollene er aktive uten regresjon i eksisterende porter.

## Fase 1 – raskere daglige arbeidsflyter (uke 2–4)

**Mål:** Redusere antall klikk, gjentatte søk og risikoen for tapte endringer i de vanligste arbeidsflytene.

| Prioritet | Arbeid | Status | Ferdigkriterium |
| --- | --- | --- | --- |
| P0 | Gjøre Innkjøp til en synlig visning under Inventory og skille registrering fra innkjøpskø. | Ferdig | Innkjøpskøen nås med ett klikk fra Inventory, og Add spool-dialogen inneholder ikke skjult køadministrasjon. |
| P0 | Legge kontekstuelle handlinger på spoledetaljen: Lån ut, Last i skriver og Skriv etikett. | Ferdig | Valgt spole er forhåndsutfylt, og brukeren trenger ikke søke opp samme spole igjen mellom steg. |
| P1 | Flytte etikettark fra Settings til Inventory. | Ferdig | Etikettark er tilgjengelig der spolene velges, uten tap av eksisterende funksjonalitet. |
| P0 | Samle vanlige detaljendringer i én lagre-handling og varsle om ulagrede endringer. | Ferdig | Lukking, navigasjon og avbryt beskytter ulagrede data; lagring er atomisk og gir tydelig tilbakemelding. |
| P1 | La filteret All vise alle statuser, eller gi det et navn som samsvarer med faktisk innhold. | Ferdig | Filternavn og resultat samsvarer og er dekket av test. |
| P1 | Skille mellom tomt lager og null treff i tomtilstander. | Ferdig | Brukeren får riktig forklaring og relevant neste handling i begge situasjoner. |

### Faseport 1

Fasen er ferdig når innkjøpskøen nås direkte, spolekontekst følger hele arbeidsflyten, og brukeren ikke kan miste detaljendringer uten varsel.

## Fase 2 – proaktiv lagerstyring (uke 5–8)

**Mål:** Gjøre lageret handlingsrettet og robust for større samlinger, flere lokasjoner og oppfølging av lån og innkjøp.

| Prioritet | Arbeid | Status | Ferdigkriterium |
| --- | --- | --- | --- |
| P0 | Gjøre lokasjoner til egne objekter med stabil ID, oppretting, autofullføring, endring, sammenslåing og arkivering. | Ferdig | Lokasjonsendringer synkroniseres, er med i backup og bryter ikke eksisterende spolehistorikk. |
| P1 | Legge til massehandlinger for flytting, status, etiketter og eksport. | Ferdig | Operasjonene er atomiske, viser berørt antall før bekreftelse og skriver historikk per spole. |
| P0 | Gjøre lav-beholdningsgrensen konfigurerbar globalt, med valgfritt avvik per materiale. | Ferdig | Inventory, Dashboard, Statistics, Host, Client og Companion bruker samme effektive terskel. |
| P1 | Legge kontakt og forventet returdato på utlån. | Ferdig | Forfalte lån kan identifiseres og fullført retur fjerner oppgaven umiddelbart. |
| P0 | Lage Krever handling på Dashboard for lav beholdning, forfalte lån, mottaksklare bestillinger og Bambu Live-problemer. | Ferdig | Hvert kort viser årsak, alder og direkte handling; løste forhold forsvinner uten manuell oppfriskning. |
| P1 | Tillate ett klikk fra lav beholdning til innkjøpskø med duplikatkontroll. | Ferdig | Eksisterende åpne ønsker eller bestillinger gjenbrukes eller varsles før et duplikat opprettes. |

### Faseport 2

Fasen er ferdig når lokasjoner og massehandlinger er sporbare, alle flater deler samme lagergrense, og Dashboard-oppgaver blir opprettet og ryddet automatisk.

## Fase 3 – beslutningsstøtte og v1-kvalitet (uke 9–12)

**Mål:** Gi pålitelig kostnads- og forbruksinnsikt og verifisere den pakkede desktop-opplevelsen før v1.

| Prioritet | Arbeid | Status | Ferdigkriterium |
| --- | --- | --- | --- |
| P1 | Registrere pris, kjøpsdato, batch og leverandørreferanse ved mottak. | Ferdig | Feltene valideres, kan redigeres og eksporteres, og eldre data håndteres uten tvungen utfylling. |
| P1 | Legge til periodene 30 dager, 90 dager, 12 måneder og egendefinert intervall i Statistics. | Ferdig | Alle nøkkeltall bruker valgt periode konsekvent og har tester for tids- og datogrenser. |
| P1 | Vise lagerverdi og materialkostnad per periode med sporbarhet tilbake til spolen. | Ferdig | Summer kan spores til underliggende spoler og transaksjoner, med tydelig valuta- og manglende-datahåndtering. |
| P2 | Lage en enkel, deterministisk forbruksprognose med synlig datagrunnlag. | Ferdig | Samme input gir samme prognose, antakelser vises, og funksjonen bestiller aldri automatisk. |
| P0 | Authenticode-signere Windows MSI og programfil før bredere distribusjon. | Ikke startet | Installer og binær validerer korrekt signatur i støttede Windows-miljøer. |
| P0 | Kjøre muterende pakket desktop-E2E på macOS og Windows. | Pågår | Testen oppretter en spole, endrer vekt, låner ut, returnerer, tilordner printerspor, restarter og validerer backup i den pakkede appen. |

### Faseport 3

Fasen er ferdig når kostnader og prognoser er sporbare, Windows-artifakter er signert, og den komplette muterende desktop-flyten passerer på både macOS og Windows.

## Parallelt teknisk spor

Dette sporet går gjennom alle fasene og leverer små, kompatible forbedringer uten å blokkere produktarbeidet.

| Arbeid | Status | Målbart ferdigkriterium |
| --- | --- | --- |
| Innføre en Rust-basert `ActiveLibraryGateway` som velger lokal database eller Host. Start med én komplett spoleflyt og behold eksisterende kommandoer som kompatibilitetslag. | Ferdig | Én ende-til-ende-spoleflyt bruker gatewayen i begge moduser, med kontraktstester og uendret offentlig oppførsel. |
| Generere TypeScript- og Companion-kontrakter fra én Rust-kilde. | Ferdig | Status, eierskap og valgte DTO-er genereres i CI; håndredigert duplisering for den valgte flyten er fjernet. |
| Gjøre migrasjoner append-only med én autoritativ migrasjonsrekke. | Ferdig | CI avviser endring eller omnummerering av publiserte migrasjoner og verifiserer både tom installasjon og oppgradering. |
| Flytte kritiske tester fra kildekodelesing til reell atferd. | Ferdig | Kritiske akseptansekriterier kjøres mot funksjoner, API eller pakket app; tekststrukturtester brukes ikke som eneste vern. |
| Vurdere sammenslåing av React- og Companion-kodebasene først etter at gateway og kontrakter er stabile. | Ferdig | [ADR-en](ADR_REACT_COMPANION_CONSOLIDATION.md) beholder separate presentasjonslag og fastsetter målte terskler for ny vurdering av en dedikert React-Companion. |

## Avgrensning

Følgende prioriteres ikke i denne 12-ukersperioden:

- skyplattform
- native mobilapp
- flere språk utover nødvendig vedlikehold av eksisterende lokalisering
- full offline-skrivesynkronisering
- integrasjon med vekthardware

Disse temaene vurderes på nytt etter fase 3, når kjerneflyter, kontrakter og datakvalitet er stabilisert.

## Neste arbeid

1. Avklar utgiveridentitet og signeringstjeneste for Windows-signering.
2. Fullfør og dokumenter muterende pakket desktop-E2E på gjeldende schema 4-artifakt for Windows; den lokale macOS-kjøringen er bestått.

## Fremdriftslogg

### 2026-08-21

- Lav-beholdningsregelen er samlet i domenefunksjoner for UI og en delt konstant i Rust. 200 g er eksplisitt lav beholdning, 0 g er ikke lav beholdning, og sunn beholdning starter ved 201 g.
- Dashboard teller nå alle lave spoler, men viser fortsatt maksimalt fem eksempler. Regresjonstester dekker 0, 1, 199, 200 og 201 g samt seks lave spoler.
- Dashboard samler lav beholdning, forfalte lån, mottaksklare bestillinger og Bambu Live-problemer under Krever handling; lav-beholdningskort gjenbruker en eksisterende åpen innkjøpspost eller oppretter én ny før Inventory åpnes med riktig køfilter.
- En obligatorisk databaseoppgraderingsgate migrerer en SHA-låst og sanitert schema-1-fixture til gjeldende skjema og kontrollerer databevaring gjennom to appstarter.
- En separat SHA-pinnet v0.27-fixture med schema 2 verifiseres mot installert binær fra både DMG og MSI i release-workflowen. Gaten dekker nå den reelle 2→3-lokasjonsmigreringen, mens schema-1-smoken dekker hele 1→2→3-rekken.
- Companion har nå CSP og øvrige sikkerhetsheadere, 64 KiB body-grense, 30 sekunders request-timeout og begrenset per-peer rate limiting, med strengere grense for paring og fornyelse.
- Ytelse, backup/oppgradering, tilgjengelighet og lokalisering har dokumenterte blokkerende terskler, navngitt eier og en kontraktstest som verifiserer CI-koblingen.
- Innkjøpskøen er flyttet til en egen ett-klikk-visning under Inventory. Lagerregistrering og kjøpsplanlegging har separate opprettingsflyter, mens statusendring, mottak og sletting er bevart.
- Hele `npm run verify` passerer etter rebase på oppdatert `origin/main`, inkludert 1 150 UI-tester, 480 desktop-Rust-tester, 144 core-Rust-tester og Clippy i både dev- og releaseprofil. Oppgraderingssmoken passerer separat fra schema 1 gjennom hele 1→2→3-rekken og to appstarter.
- `All` viser nå samtlige statuser, og tomt lager er skilt fra null filtrerte treff med egne forklaringer og handlinger.
- Spoledetaljen fører valgt spole direkte videre til utlån, printerlasting og etikettutskrift. Vanlige detaljendringer lagres atomisk, og lukking eller navigasjon beskytter ulagrede endringer.
- Etikettark er flyttet fra Settings til Inventory uten tap av utskriftsflyten.
- Statistics støtter 30 dager, 90 dager, 12 måneder og egendefinert lokalt datointervall gjennom én halvåpen UTC-kontrakt. Døgngrenser er testet over både 23- og 25-timers DST-døgn.
- En deterministisk 30-dagers forbruksprognose viser datagrunnlag og antakelser uten å opprette automatiske bestillinger.
- Publiserte databasemigrasjoner er låst i et autoritativt manifest. CI avviser endring, sletting og omnummerering, og verifiserer både tom installasjon, schema-1-oppgradering og v0.27-kompatibilitet.
- Lokasjoner er egne objekter med uforanderlig ID, redigerbart navn, arkiv/gjenoppretting og atomisk sammenslåing. Desktop, Host, Client og Companion deler kontrakten; legacy `SHELF` migreres til `GENERIC` uten å endre spole-FK-er eller historikk.
- Lageret har sporbare massehandlinger for flytting og status med en egen gjennomgang før bekreftelse. Backend validerer hele snapshotet før første skriv og committer alle endringer og historikkrader i én transaksjon; etiketter og CSV-/JSON-eksport bruker nøyaktig det valgte spolesettet. Client sender én beskyttet Host-operasjon uten lokal fallback, og eldre Host avvises eksplisitt via capability-sjekk.
- Lavlagerpolicyen har én validert standard og valgfrie materialoverstyringer. Effektiv terskel følger hver spole gjennom Inventory, Dashboard, Statistics, Host, Client og Companion; eldre Host bruker en eksplisitt 200 g-kompatibilitetsverdi.
- Utlån lagrer valgfri kontakt og forventet returdato. Ugyldige datoer stoppes før lagring, eldre Host avviser metadata før POST, og en ren datomodell identifiserer forfalte aktive lån uten å merke returnerte lån.
- Den pakkede desktop-gaten starter installert app mot en privat database, muterer hele spoleflyten, restarter og validerer full backup. En historisk kjøring før lokasjonsmigreringen passerte med schema 2, stabilt SQLite-snapshot og 1 128 backuprader; gjeldende kriterium er schema 4, og samme gate er koblet blokkerende til Windows CI.
- Gjeldende lokale arm64 debug-DMG passerer den muterende macOS-gaten med schema 4 og 25 tabeller. Testen opprettet spole og printerspor, endret sluttvekten til 760 g, fullførte utlån og retur, startet den installerte appen på nytt og validerte en full backup med 1 128 rader. Tilsvarende gjeldende Windows-kjøring gjenstår på en Windows-runner.
- Brukertestprotokollen har en deterministisk `npm run qa:usability:analyze`-kommando som avviser færre enn fem deltakere, under 90 % uhjulpet fullføring eller under 30 % median tidsforbedring.
- En Rust-basert `ActiveLibraryGateway` velger nå autoritativt mellom lokal database og paret Host for den atomiske spole-detaljflyten. Ufullstendig klientoppsett og Host-/legitimasjonsfeil stopper uten lokal fallback, mens eksisterende Tauri-kommandoer er beholdt som kompatibilitetslag.
- Status, eierskap, låneretning, lånestatus og lavlager-DTO-er har nå én faktisk Rust-kilde. Deterministiske TypeScript- og Companion-artefakter inneholder konstanter og validatorer, og både lokal kontraktsgate og CI avviser manglende eller utdaterte genererte filer.
- React-desktop og browser-Companion beholder separate presentasjonslag. [ADR-en](ADR_REACT_COMPANION_CONSOLIDATION.md) dokumenterer HEAD-målte bundle-, overlapps-, avhengighets- og testbaselines og konkrete terskler for å prøve en dedikert React-Companion på nytt.
- Mottak fra innkjøpskøen kan registrere pris med valuta, kjøpsdato, batch og leverandørreferanse per spole. Metadata kan senere endres eller tømmes atomisk i desktop, Client og Companion, skrives til historikken og rundtrippes gjennom CSV, JSON og full backup; eldre data uten valuta eller med historiske legacy-verdier bevares uten tvungen utfylling.
- Statistics beregner nå lagerverdi som et nåbilde og materialkostnad for valgt periode fra registrert innkjøpspris, vekt og valuta. Rust er autoritativ kilde; summer holdes adskilt per valuta og mellom eid og innlånt, mens rad- og vektdekning forklarer manglende data. Sporingen er deterministisk begrenset til 2 000 rader, men summer og dekning inkluderer alle rader i samme deferred SQLite-snapshot. En eldre Host gir en eksplisitt oppgraderingsmelding uten lokal reserveberegning.
