# Batchkvitteringer i installerte appkontroller – 6. september 2026

De installerte macOS- og Windows-kontrollene er utvidet for
[atomisk Bambu-batchregistrering](BAMBU_BATCH_FOLLOWUP_2026-09-06.md).
En kandidat må nå bevise at samme forespørsel etter omstart returnerer de
opprinnelige rull-ID-ene uten ekstra ruller, lån eller historikk. Kontrollene
bruker appens vanlige Tauri-kommandoer og egne syntetiske databaser.

## Lokal desktop

Første prosess registrerer to innlånte ruller fra samme katalogpost. Gjentatte
katalog-ID-er skal gi to forskjellige fysiske ruller. Den private
fasekvitteringen bevarer forespørselen og den ordnede listen med rull-ID-er.

En ny prosess åpner samme database og sender den opprinnelige forespørselen
med samme batch-ID. Resultatet må være identisk. Node-verifikatoren leser
SQLite uavhengig av appens egen suksessrapport og sammenligner ruller, lån,
historikk, revisjoner, alle innstillinger og batchjournal mellom prosessene.

Den eksisterende kontrollen av enkeltregistrering, vektendring, utlån/retur,
printerspor og full backup er beholdt. Den portable backupen skal inneholde
batchrullene og innlånene, mens installasjonens kvitteringsjournal utelates.

## Paret Host og Client

Den parede Clienten registrerer to innlånte ruller på Host med samme
katalog-ID. Etter at første Host-prosess er avsluttet, lagres et uavhengig
førbilde i testprosessens private minne. Det inneholder batchrullene, lånene,
historikken, hele kvitteringen og Clientens lokale lagerrader.

Etter Host-omstart og sesjonsfornyelse gjentar Clienten samme batch.
De opprinnelige ID-ene og databaseverdiene må være bevart, og domenerevisjonene
må være uendret gjennom gjentakelsen. Clientens lokale skyggerull skal fortsatt
veie 333 g, uten lokale batchruller, innlån eller kvitteringer.

Det sanitiserte sluttsammendraget krever to batchruller, to innlån, fire
historikkhendelser og én kvittering på Host, med eksplisitt bekreftet
gjentakelse og null batchrader på Client. Eksisterende kontroller av frakobling,
Host-autoritet, katalogjobber og sletting av testlegitimasjon gjelder fortsatt.

## Skjema og oppgradering

En felles, skrivebeskyttet kontroll krever den faktiske tabellen
`catalog_spool_batches`, dens fem kolonner, primærnøkkel, JSON-krav og
tidsstempelstandard. Tabellen skal ikke ha fremmednøkler som kan slette en
kvittering når en rull slettes. Et skjema-7-tall alene er utilstrekkelig.

Historiske fixturer beholder sin opprinnelige versjon. Den SHA-pinnede
v0.28.0-fixturen har skjema 5, og CI-baseline har skjema 1. Oppgradering til
skjema 7 skal opprette en tom journal. En allerede eksisterende journal skal
bevares med alle verdier gjennom begge starter og etter at prosessene er
avsluttet. Oppgraderingskontrollen sammenligner også hver start med resultatet
fra forrige start, slik at en nylig innført tabell ikke kan forsvinne senere.

Ved klargjøring av en privat fixture med eksisterende batcher sanitiseres
eier, kontakt, merknad, lokasjon og bibliotekidentitet i kopien.
Batch-ID-er og ordnede rull-ID-er bevares. Ukjent forespørselsformat avvises.
Kildedatabasen åpnes skrivebeskyttet og skal være uendret.

## Verifisering

| Kontroll | Resultat |
| --- | --- |
| Fokuserte plattform- og skjemakontroller | Bestått, inkludert avvisning av manglende journal og feil kolonner, standardverdier og JSON-krav. |
| Desktop-scenario og faseprotokoll | Bestått i UI, Rust og Node, inkludert avvisning av endrede innstillinger etter omstart. |
| Host/Client-scenario og databasekontroll | Bestått i UI, Rust og Node, inkludert 13 korrumperte starttilstander som skal avvises. |
| Full smoke | Bestått: 792 skripttester, 1 652 UI-tester, 392 Companion-tester og 23 ytelsestester; build, lint, kontrakter, doctor og tilgjengelighetskontroller er grønne. |
| Rust-verifisering | Bestått: 630 desktop-, 289 core-, 15 mDNS- og 3 generatortester. Tre eksisterende ignorerte tester. Format og begge Clippy-profiler er grønne etter retting av én overflødig referanse i testkoden. |
| Installert lokal macOS-DMG | Bestått på arm64: begge batchscenarioer, synlig appvindu, skjema 7 og 27 tabeller; v0.28.0-fixturen bevares gjennom 5→7 og to starter. |
| Native Windows-MSI | Bestått i etterfølgende CI på `d3c0b96d`; se CI-oppfølgingen nedenfor. |

Den lokale kandidaten ble bygget fra `78c96503403f20f59e91444520b63d2ed6eb95cb`
med denne oppfølgingens staged kodeendringer. Før bygg ble patch og filhasher
lagret privat. Alle 1 460 ikke-dokumentasjonsfiler hadde identiske hasher ved
sluttkontrollen. Dokumentasjonen ble deretter ferdigstilt med måleresultatene.

- DMG SHA-256: `b34fce3e93c2a8222f77667de210c109936c3c6a17f01d81bba037e615e14b94`.
- Pakket programfil SHA-256: `8779172816ddb54236b1a982ab542dc44aaffaf1e48f933d47e16e336b5740b4`.
- Den SHA-pinnede v0.28.0-kilden var `76cba513eadd5137d6703f9abd1c0452531ef788`.
  Oppgraderingen brukte en egen kopi; den opprinnelige fixturens hash er uendret.

Desktop-sammendraget bekrefter to batchruller, to innlån, identisk tilstand
etter gjentakelsen og 1 637 rader i full backup. Host/Client-sammendraget
bekrefter to batchruller, to innlån, fire historikkhendelser, én kvittering,
uendrede revisjoner ved gjentakelsen og null Client-batchrader.
Sesjonsfornyelse og sletting av testlegitimasjon bestod. Den oppgraderte
v0.28.0-kopien har en tom journal etter begge prosessavslutningene.

Installert staging, testprosesser og DMG-mount ble ryddet opp. Native logger
og sammendrag er private med 0700/0600-rettigheter. Pakken er lokalt
ad-hoc-signert; kontrollen dokumenterer verken Developer ID/notarisering,
Intel-Mac eller native Windows.

Begge CI-plattformjobber og begge macOS-arkitekturer i release-jobben bruker
allerede de utvidede kontrollene. Windows-wrapperen krever nå batchbevis i
begge sammendragene. De eksisterende kravene til tidligere release, installasjon,
avinstallasjon og opprydding er beholdt. Oppgradering fra v0.28.0 er en separat
release-kontroll og følger ikke automatisk av grønn ordinær Windows Smoke.
Denne lokale verifiseringen ble senere fulgt av CI-kjøringen nedenfor.

Dette er automatiserte app- og databasekontroller. De tilfører ingen
menneskelige tids- eller fullføringsmålinger fra brukertestprotokollen.

## CI-oppfølging

De lokale endringene ble samlet i [PR #89](https://github.com/bliatun-code/Filament-Manager/pull/89).
Første CI-kjøring avdekket to feil i testoppsettet før installasjonspakkene
ble prøvd. På Windows traff ikke Vites normaliserte modulstier mocken for
Innstillinger-oppfriskning. På macOS arvet de syntetiske HTTP-serverne en
nonblocking socket og kunne feile når forbindelsen ble akseptert før første
request-byte var sendt.

Begge feil ble gjenskapt lokalt før rettelsen. En ny Vite-byggtest prøver
Windows-stier og krever at mocken faktisk lastes. To nettverksregresjoner
venter til forbindelsen er akseptert før klienten sender HTTP-data.
Testserverne setter nå eksplisitt blocking-modus for aksepterte forbindelser.
Tre testfiler ble rettet samlet i `d3c0b96d7ae97a94006426361e8891ad6a4ab118`;
produksjonskode og tidsgrenser ble ikke endret.

Alle 1 653 UI-tester og Rust-verifiseringen bestod lokalt etter rettelsen:
632 desktop-, 289 core-, 15 mDNS- og 3 generatortester, med tre eksisterende
ignorerte tester. Format, begge Clippy-profiler og Rust 1.88-kontrollen bestod.

[Oppfølgings-CI](https://github.com/bliatun-code/Filament-Manager/actions/runs/34058558627)
bestod på den samme rettelsescommiten. Mac-jobben er bestått, inkludert
installert DMG, begge batchscenarioer og oppgradering fra den historiske
skjema-1-fixturen til skjema 7 gjennom to starter.
[CodeQL](https://github.com/bliatun-code/Filament-Manager/actions/runs/34058558579)
og [avhengighets- og lisenskontrollen](https://github.com/bliatun-code/Filament-Manager/actions/runs/34058558637)
er også grønne. Windows-jobben bestod full verifisering, MSI-bygg,
pakkeverifikasjon, ren installasjon, begge batchscenarioer og avinstallasjon.

Begge installerte appers sammendrag bekrefter skjema 7, to innlånte batchruller,
to innlån og bevart kvittering ved gjentakelse etter omstart. Host/Client har
fire batchhistorikkhendelser, én kvittering, uendrede revisjoner ved gjentakelse
og null Client-batchrader. Sesjonsfornyelse og sletting av testlegitimasjon
bestod; Windows beholder `UnsignedRequired`.

Mac-CI prøvde skjema 1→7 separat fra den installerte DMG-en. Den SHA-pinnede
v0.28.0-oppgraderingen 5→7 er dokumentert av den lokale DMG-kjøringen ovenfor.
Release-kontrollen skal fortsatt kjøres på releasekandidaten; ordinær Windows
Smoke prøver ikke denne oppgraderingen.
Disse CI-resultatene gjelder `d3c0b96d`; den etterfølgende dokumentasjonen
ble committet lokalt og tatt med i den samlede pushen av `89aca68e`, uten en egen smoke-kjøring.


## Sluttgjennomgang og ny CI 7. september 2026

Sluttgjennomgangen av PR #89 fikk rettet to feil i
`89aca68e4544e73c7b06beb69ceb8b7820d18579`: ufullstendig mottak av HTTP-body
har nå en frist før handlerstart, og Host-katalogstarter beholder den fangede
målgenerasjonen gjennom kø, forberedelse og autentisering. Påbegynt lagring
får fortsatt fullføre. En tredje syntetisk HTTP-server bruker nå eksplisitt
blokkerende lesing på macOS.

Begge regresjoner var røde før og grønne etter rettelsen. En isolert body-test
returnerer 408 uten handlerdispatch; en gammel katalogstart etter A→B→A
avvises før nettverkskall, mens en ny start mot samme Host lykkes. Full lokal
smoke og Rust-verifisering bestod, med 1 655 UI- og 634 desktop-tester,
begge Clippy-profiler og Rust 1.88-kontrollen.

Alle 11 PR-kontroller er grønne på samme commit:
[CI](https://github.com/bliatun-code/Filament-Manager/actions/runs/34063248014),
[CodeQL](https://github.com/bliatun-code/Filament-Manager/actions/runs/34063248040)
og [avhengigheter/lisenser](https://github.com/bliatun-code/Filament-Manager/actions/runs/34063248052).
Begge plattformer bestod installert desktop- og Host/Client-E2E, inkludert
katalogstarter med den nye målgenerasjonen. Katalogjobbenes sluttresultat er
én vellykket jobb, én avbrutt jobb, én importert rad og null Client-jobber.

Desktop-resultatene har 1 637 backuprader, to innlånte batchruller og samme
opprinnelige, ordnede kvittering etter omstart. Host/Client har to batchruller,
to lån, fire historikkhendelser, én kvittering og uendrede revisjoner ved
gjentakelse. Client har ingen lokale batchruller, lån eller kvitteringer;
Host-vekten er 760 g og Clientens skyggedata beholder 333 g. Sesjonsfornyelse
og sletting av testlegitimasjon bestod.

Mac-CI bevarte også den historiske skjema-1-fixturen gjennom 1→7 og to starter.
Den tidligere lokale v0.28.0-kontrollen og de separate release- og
signeringskravene gjelder fortsatt som beskrevet ovenfor. Windows beholder
`UnsignedRequired`. Dette er automatiserte kontroller, uten nye menneskelige
brukermålinger. Resultatdokumentasjonen committes lokalt uten en ekstra CI-kjøring.

PR #89 ble deretter merget som `9a92420f7288cfc694e7623bb72ae3f431ec8cd5`.
Git-treet er identisk med den verifiserte kandidaten `89aca68e`. Lokal `main`
er oppdatert, og denne resultatdokumentasjonen er bevart på den lokale
oppfølgingsgrenen `codex/post-pr89`. Hovedgrenens automatiske CI er en separat
kjøring; resultatene ovenfor gjelder de oppgitte, fullførte PR-kjøringene.
