# Host/Client: datatilkoblet brukervennlighetsgjennomgang

Arbeidet startet 19. september og fortsatte 20. september 2026, på toppen av
UI-pakken i PR #132. Dette er en avgrenset oppfølging av bibliotek/webapp og den
native skrivebordsklienten. Masseoperasjoner og import/gjenoppretting er ikke
utvidet til egne vurderingsrunder her.

## Metode og testmiljø

En uavhengig kritiker bruker faktiske native apper gjennom skjerm og
tilgjengelighetstre. Implementeringsagenten retter kode og kontrollerer
lagringer med skrivebeskyttede SQLite-spørringer. Karakterene er agentbasert
ekspertvurdering, ikke brukerstudier med rekrutterte sluttbrukere.

Tre separate testbundler bruker syntetiske, befolkede biblioteker og egne
credential-profiler. Host A har ti aktive ruller og en kontrollrull på 800 g ved
start. Klientens lokale bibliotek har sju aktive ruller og en kontrollrull på
333 g. Host B har seks aktive ruller og kontrollvekt 444 g. Kjente navn og
ulike bibliotekidentiteter gjør utilsiktet datakryssing synlig.

Testappene bruker produktets vanlige private nettverksgrensesnitt og `.local`-
parring. De er signert med eksisterende Apple Development-identitet og har
produktets Info.plist-nøkler for lokalnett/Bonjour og nettverksentitlements.
Dette er egenbygde utviklingsapper, ikke en signert releasepakke. Ingen
produksjonsdatabase, fysisk printer eller global nettverkspolicy er endret.

To oppsettsavvik må holdes atskilt fra produktfunn:

- De første håndlagde testbundlene manglet produktets Bonjour-/lokalnettmetadata.
  Host A annonserte normalt etter riktig pakking/signering og omstart.
- Den opprinnelige Prusa-fixturen brukte en `_mmu_1`-identitet, mens produktet
  oppretter `_ams_1`. Navneendring erstattet derfor fixture-enheten og lastet av
  rullen. Kritikeren lastet rullen gjennom vanlig UI til en produktgenerert
  plass og gjentok navneendringen; tilordningen og vekten ble bevart. Dette er
  ikke dokumentasjon på at normal navneredigering mister tilordninger.

Frontend ble fryst under ny vurdering. Tidlige observasjoner mens HMR endret
appen er ikke brukt som bevis for ren gjenoppkobling. En midlertidig udefinert
variabel under implementering ble fanget av TypeScript-kontrollen, rettet og
etterfulgt av nye appstarter før den fryste vurderingen.

## Kriterier

Oppgaveløsning 25 %, informasjon 20 %, navigasjon 15 %, tilbakemelding 15 %,
visuell utforming 10 %, tilgjengelighet 10 % og robusthet 5 %. Målet er minst
8/10 per observert hovedflyt. Manglende dekning får ingen antatt bestått-score.
AX-observasjoner og automatiske tilgjengelighetskontroller erstatter ikke en
full VoiceOver-prøve.

| Hovedflyt | Runde 1 | Runde 2 | Sluttvurdering etter runde 3 |
| --- | ---: | ---: | ---: |
| Parring og identitet | 7,50 | 8,15 | 8,15 |
| Klientnavigasjon og skriving | 7,55 | 8,15 | 8,15 |
| Lokale og vertsstyrte innstillinger | 8,05 | 8,05 | 8,05 |
| Nettbrudd og gjenoppkobling | 7,20 | 8,15 | 8,15 |
| Feilparring, fjerning og tilbakekalling | Ikke ferdig dekket | 7,35 | 8,00 |

Målet er nådd for de fem observerte hovedflytene. Runde 3 retestet autorisasjon
og nettbrudd; øvrige vurderinger er videreført fra siste faktisk observerte
oppgaver. Tilgjengelighet som enkeltkriterium står fortsatt på 7, med begrenset
manuell dekning. Dette er ikke en samlet godkjenning av alle funksjoner.

Kritikerens observasjoner og kriterievektorer:
[runde 1](host-client-review-2026-09-19/round-1.md),
[runde 2](host-client-review-2026-09-19/round-2.md) og
[runde 3](host-client-review-2026-09-19/round-3.md).

## Konkrete funn og rettelser

| Funn | Endring |
| --- | --- |
| HC-F1: Aktiv webapp uten stabilt navn ble omtalt som deaktivert | Nettverksdetaljene bruker den faktiske statusforklaringen |
| HC-F2: Samme lenke støtter skrivebordsklient, men Host sa «Browser-only» | Parringsinstruksjoner forklarer begge klienttypene; navn, lister og tilbakekalling bruker klientbegrepet i alle 21 språk |
| HC-F3: Første oversikt viste null ruller og lokalt bibliotek før Host-data ankom | Første uavklarte last viser lastestatus eller feil med ny prøve; eksisterende vellykket snapshot beholdes ved oppdatering |
| HC-F5: Vertens navn forsvant ved nettbrudd, med rå transportdiagnose som hovedtekst | Kjent navn beholdes til målbytte; offlineforklaring og Oppdater vises direkte, diagnosen ligger i avanserte detaljer |
| HC-F6: Rulldialog mistet offlinekontekst og hevdet tom historikk | Dialogen forklarer forbindelsesstatus, tilbyr oppdatering og skiller utilgjengelig historikk fra null hendelser; lagringsbekreftelse skjules ved feil |
| HC-F7: Manglende parring ble omtalt som nettbrudd | Cache-fallback kontrollerer parring mot forventet bibliotek; bare en eksplisitt avvisning gir beskjed om ny parring. Rene nettbrudd beholder parringen |
| Brukt parringslenke beholdt grønn melding fra mellomsteg | Feilet parring fjerner mellomstegsmeldingen og viser den faktisk lagrede, uparrede verten |

Språkoppdateringen inkluderer instruksjonene og en ny handlingsrettet
forbindelsesmelding. Katalog-/runtimekontroller er tekniske kontroller;
dette innebærer ikke at alle oversettelser har fått ny morsmålsvurdering.

## Observerte datahandlinger

- Klienten lagret totalvekt 950 g minus tare 200 g som 750 g i Host A.
  Lokal kontrollrull forble 333 g; ingen Host-rull ble opprettet i klientens
  lokale lagertabell.
- Full sikkerhetskopi eksportert fra klienten inneholdt vertens kontrollrull og
  vekt 750 g, ikke klientens lokale kontrollrull. Ingen gjenoppretting ble kjørt.
- Ved stopp av bare Host A ble et nytt vektforsøk avvist. Databasen beholdt
  750 g. Etter omstart var vekten fortsatt 750 g; ingen skjult kø ble avspilt.
  Et nytt, bevisst forsøk lagret 700 g og opprettet én ny historikkhendelse.
- En separat, fryst retest avviste 850 g total under nettbrudd. Etter omstart
  var vekten fortsatt 700 g med to hendelser. Først et nytt eksplisitt forsøk
  lagret 650 g med tre hendelser.
- Støttet bytte fra A til B viste B sitt navn og seks aktive ruller. Måling
  620 g minus tare 200 g ga 420 g på B. Samme rull-ID på A beholdt 800 g,
  A sin ekstra kontrollrull beholdt 650 g, og begge lokale Client-kontroller
  beholdt 333 g.
- Tilbakekalling på B avviste et 610 g-forsøk. Rullen beholdt 420 g, og
  både liste og dialog ba om ny parring uten at Settings måtte åpnes først.
  Lokal fjerning av parring viste samme korrekte forklaring.
- Filamentstandarder og vedlikehold som tilhører verten var forklart og
  deaktivert på klienten. Normal printeromdøping etter UI-tildeling beholdt
  rullens plassering.

## Validering og avgrensninger

| Kontroll | Resultat |
| --- | --- |
| UI | Produksjonsbygg, TypeScript, ESLint og 2054 tester bestått |
| Rust | 314 core-tester, 3 generatortester og 165 Host/Client-tester bestått; core Clippy uten advarsler |
| Companion og skript | 401 Companion-tester og 896 skripttester bestått |
| Ytelse | 23 tester bestått |
| Tilgjengelighet og dialoger | Modaltest, seks databefolkede hovedsider uten axe-brudd og fem lånedialogscenarier bestått |
| Prosjektkontrakter | Samlet kontraktskontroll, Rust-format og doctor bestått |
| Språk | 21 kataloger, generering, fallback-, kopi- og runtimekontrakter samt fingerprint-bundet teknisk QA bestått |

Komponentene i smoke-suiten ble kjørt separat i denne oppfølgingen. Den brede
UI-pakken hadde i tillegg en tidligere samlet `npm run smoke`. De 165 native
Host/Client-testene dekker blant annet feil bibliotekidentitet og beskyttelse
mot foreldede mål; det er automatisert dekning, ikke en manuell mismatch-prøve.

Gjenstående avgrensninger:

- En helt fersk Client uten cache ble ikke manuelt fanget i første datalast.
  Lastesperren har en egen render-regresjonstest; varm cache ble observert.
- Den spesielle mDNS-feiltilstanden i HC-F1 ble ikke gjenskapt etter rettelsen.
  Modelltesten dekker feilteksten, og normal aktiv Host ble observert.
- Ingen full VoiceOver-prøve, ny plattformmatrise, fysisk printertest eller
  destruktiv import/gjenoppretting inngår. Eksport ble faktisk kontrollert.
- Banneret ved manglende parring forklarer årsaken, men har bare Oppdater som
  knapp. Ny parring nås via Innstillinger eller oversikten; en direkte snarvei
  er et mindre, gjenværende forbedringspunkt.
- Kritikerens skjermbilder og tilgjengelighetstrær ble vist i verktøyloggen.
  Ingen nye PNG-filer er arkivert i denne oppfølgingen.

Dette lukker den tidligere manglende manuelle dekningen av en faktisk
nettverkstilkoblet native Client innenfor de oppgavene som er beskrevet.
Det innebærer ikke at alle klientfunksjoner eller plattformer er godkjent.
Endringene samles i den eksisterende PR #132. Ingen release inngår.

Etter siste prøve fjernet kritikeren Client-parringen og tilbakekalte alle egne
testklienter på A og B gjennom vanlig UI. Begge verter viste null autoriserte
klienter. Implementeringsagenten stoppet de tre testappene og utviklingsserveren.
Tre eksportfiler ble identifisert ved de isolerte bibliotek-ID-ene og flyttet fra
Downloads til den ignorerte testmappen. Produksjonskopier ble ikke flyttet.
