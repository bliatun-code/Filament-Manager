# AI-utført evaluering av brukervennlighet – 6. september 2026

Alle fem faste oppgaver ble gjennomført i den native kandidatappen. Uavhengig
kontroll av før-/etterdata godkjenner **5 av 5 utfall**. Evalueringen fant to
konkrete forbedringspunkter i mottak og bekreftelse av printerlasting, samt en
hypotese om risiko for dobbeltregistrering. Ingen feil rull, ekstra mottak,
datatap eller endring av uvedkommende rader ble funnet i de kontrollerte utfallene.

## Oppsett og bevis

- Kandidat: v0.29.0, commit `189511f7afae859b17e61657b638fe13c5200930`.
  Produktkoden er uendret frem til arbeidsgrenens `1595af07`; mellomliggende
  endringer gjelder studieopplegget og analyseverktøyet.
- Miljø: macOS, Apple M4/arm64, English og Dark; automatiske
  oppdateringssjekker slått av ved hver start.
- Avledet releasebygg med separat kompilert app-ID, incognito-webview og
  ad-hoc-signatur. Bygg, programfil, metadata og startfixture er hashverifisert.
- Hver oppgave brukte en ny privat kopi av schema-2-fixturen, oppgaveoppsett 2.
  Oppstart migrerte til schema 6 og ga 1 612 katalograder. Førbildet ble tatt
  etter oppstart og etablering av oppgavens startvisning.
- Fixture SHA-256:
  `674360a09de0ba090d65ddf9581c03f48396c2a56a75a659c27cf0425fea2586`.
- Kandidatarkiv SHA-256:
  `26f5d958c1590c725441a89599b0c269b68f165ea5f17d2eb24496b68ab633ff`.

AI-operatøren brukte appens tilgjengelighetstre og native UI-handlinger.
SQLite ble bare lest for dokumentasjon og kontroll etter klargjøring; oppgavene
ble utført gjennom appen. Alle fem appprosesser ble avsluttet mellom oppgavene.
Private før-/etterbilder, startlogger, kildeverifikasjon og kontrollrapporter er
bevart i evalueringsmappen `2026-09-06-agent-evaluation`, utenfor Git.

## Oppgaveutfall

| Oppgave | Observert arbeidsflyt og resultat | Datakontroll |
| --- | --- | --- |
| Registrere | Inventory → Add spool → Marine Blue/ASA → QA Dry box → registrer. Forhåndsvisningen viste ASA og 1 000 g. Kvitteringen viste riktig filament, og detaljen viste Owned, In stock og begge lokasjonene. | Én ny rull med riktig master, 1 000 g og begge lokasjoner QA Dry box; 8 → 9 ruller. |
| Finne | Dashboard → Inventory → Deep Blue → rullen med 780 g på QA Shelf A. Treffene viste vekt, lokasjon og låntaker for den innlånte rullen. Riktig detalj `100003` ble åpnet. | Før- og etterdata er identiske. |
| Laste | Detalj `100003` → Load in printer → Atlas QA, AMS 1, Slot 4 → bekreft. Detaljen viste Assigned, 780 g og Atlas QA. | Bare det ønskede sporet fikk den valgte rullen. Andre tildelinger og ruller ble bevart. |
| Låne ut | Detalj `100004` → Loan out → Sample maker space → bekreft 450 g. Detaljen viste Loaned out, riktig låntaker og 450 g. | Én ny aktiv OUTBOUND-lånerad på riktig rull; tidligere lån og øvrige ruller bevart. |
| Motta | Inventory → Wishlist & orders → On order → Jade White → Stock roll now → Receive 1 roll. Deretter Inventory → ny rull → HOME LOCATION → QA Dry box → Save roll changes. | Én ny rull på 1 000 g med begge lokasjoner QA Dry box; bestillingen forble ON_ORDER med antall 1. |

Kontrollene sammenligner alle tabeller og avviser uvedkommende endringer.
For søkeoppgaven beviser datalikhet fravær av mutasjoner; riktig åpen detalj
ble bekreftet separat av UI-operatøren.

## Tilleggskontroller

- Søk uten treff viste en forklaring om aktive filtre og en Reset filters-handling.
  Et korrigert søk viste de fire Deep Blue-rullene igjen.
- Innsending av utlån uten låntakernavn ble avvist med «Borrower name is
  required.». Etter utfylling ble akkurat ett lån opprettet.
- Cancel i mottaksdialogen beholdt synlig bestillingsantall 2 og lagertall 8.
  Etter nytt mottak viste appen én mottatt rull og bestillingsantall 1.
- Lukking med ulagret hjemmelokasjon viste advarsel om tap av endringer.
  Keep editing bevarte utkastet; Save roll changes lagret lokasjonen og viste
  «All changes are saved.».

Disse utforskende kontrollene inngikk i AI-kjøringen. De skal ikke sammenlignes
med en deltakertidsmåling som bare følger hovedoppgaven.

## Prioriterte funn

### 1. Sett lokasjon under mottak – prioritet P2

**Observert:** Mottaksdialogen tilbyr antall og kjøpsmetadata, men ingen
lokasjon. Den nye rullen vises som Unassigned. For å fullføre oppgavekortet
må operatøren bytte til Inventory, finne den nye rullen, åpne detaljen og
lagre hjemmelokasjon. Kvitteringen gir ingen direkte handling til rullen.

**Anbefaling:** Tilby valgfri hjemmelokasjon i mottaket og lagre den sammen
med de mottatte rullene. Vis en kvittering med mottatt antall, gjenstående
antall og en handling som åpner de nye rullene. Bevar delmottak og valgfri
lokasjon; en manglende lokasjon skal fortsatt være et bevisst gyldig valg.

### 2. Vis nøyaktig printerspor i bekreftelsen – prioritet P2

**Observert:** Valgdialogen viste Atlas QA, AMS 1 og Slot 4. Etter innsending
viste kvitteringen «Roll loaded in printer slot.» og detaljen bare printerens
navn. Datakontrollen bekreftet riktig spor, men sluttvisningen gjorde ikke
spornummeret tilgjengelig for brukerens kontroll.

**Anbefaling:** Vis printer, enhet og spornummer i kvitteringen eller i detaljen,
gjerne sammen med rullreferansen. Brukeren skal kunne kontrollere tildelingen
uten å gå videre til Printers.

### 3. Tydeliggjør neste steg etter registrering – prioritet P3, hypotese

**Observert:** Etter vellykket registrering blir Add spool-dialogen stående
åpen, filamentet er fortsatt valgt, og hjemmelokasjonen tømmes. Kvitteringen
viser at registreringen lyktes. Det ble ikke opprettet noe duplikat i testen.

**Hypotese og anbefaling:** Det kan være uklart om et nytt trykk vil opprette
enda en rull. Vurder tydelige handlinger for «åpne rullen» og «registrer en til»
som bevarer effektiv registrering av flere ruller. Risikoen er ikke målt hos
mennesker og skal ikke omtales som en påvist brukerfeil.

## Tolkning

Dette er én AI-operatørs gjennomgang av kandidaten med kjennskap til
oppgavekort, tidligere gjennomkjøring og fasit. Baseline ble ikke kjørt på
nytt denne dagen; den tidligere native gjennomkjøringen er bevart separat.
Det ble ikke samlet inn deltakertider, hjelpeskårer eller menneskelige
fullføringsrater, og ingen deltakermålinger er simulert.

Resultatet gir konkrete utviklingsoppgaver og verifiserer at de fem flytene
kan fullføres med riktige data. Målene om 90 % uhjulpet fullføring og 30 %
kortere median tid i [deltakerprotokollen](USABILITY_TEST_PROTOCOL.md) er
fortsatt umålte; denne rapporten endrer ikke akseptgrensene.
