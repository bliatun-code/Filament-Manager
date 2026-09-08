# Release-verifisering etter dependency-runden — 8. september 2026

## Kandidat og omfang

Dependency-runden i PR #94–98 er merget. Denne kontrollen gjelder kildekandidaten
`aee8d23eeef1684150491fef8823589f58d388a5`, med appversjon `0.29.0` og schema 7.
Det er en ny byggkandidat fra hovedgrenen, ikke den allerede publiserte
v0.29.0-pakken fra 30. august. Ingen versjon, tagg eller publisert release endres
av denne kontrollen.

[Release Build Artifacts, kjøring 34227965780](https://github.com/bliatun-code/Filament-Manager/actions/runs/34227965780)
ble startet manuelt fra `main` med `platform=both` og Mac-notarisering aktivert.
Workflowen bygger en Developer ID-signert og notarisert Universal 2-DMG og en
Windows x64-MSI med prosjektets eksisterende `UnsignedRequired`-policy. De
opplastede pakkene lastes ned igjen og SHA-256-kontrolleres før installasjon.
Publisering og offentlige attestasjoner krever en separat kjøring fra eksakt
versjonstagg og ble hoppet over i denne manuelle kjøringen.

Oppgraderingsgrunnlaget er den syntetiske og sanitiserte v0.28.0-fixturen fra
`76cba513eadd5137d6703f9abd1c0452531ef788`, med schema 5. Navnet på denne
historiske kompatibilitetsbaselinen betyr ikke at v0.28.0 er siste publiserte
release. Kontrollene skal bevare data gjennom oppgradering til schema 7 og to
starter, og krever den faktiske, tomme batchjournalen etter migreringen.

## Resultater

Den manuelle release-kjøringen er bestått: seks jobber er grønne, og de to
taggstyrte jobbene for publisering og attestasjoner er hoppet over. Den separate
ordinære CI-kjøringen og CodeQL på hovedgrenen er også bestått på samme
kildecommit. Resultatnotatene ble bevart i dokumentasjonscommiten `cd8b5db6`,
uten endring av appkode, avhengigheter eller workflow. Den senere klargjøringen
av v0.30.0 endrer versjonsmetadata og må få egne kandidatkontroller; pakkene og
hashene i denne rapporten gjelder fortsatt den oppgitte 0.29.0-kandidaten.

| Kontroll | Status |
| --- | --- |
| [Hovedgrenens CI](https://github.com/bliatun-code/Filament-Manager/actions/runs/34227436481) | Bestått på `aee8d23e`: macOS Smoke, Windows Smoke, migrasjonsintegritet og delte kontrakter. |
| [Hovedgrenens CodeQL](https://github.com/bliatun-code/Filament-Manager/actions/runs/34227436487) | Bestått på `aee8d23e`: Rust, JavaScript/TypeScript og Actions. |
| Lokal kontrakt-/oppgraderingskontroll | Bestått: 38 tester i release-workflow-, previous-release-fixture- og database-upgrade-testene. |
| Releaseforespørsel, historisk fixture og SBOM | Bestått i den manuelle kjøringen. |
| Nedlastet fixture og SBOM | Bestått lokalt: fixture-manifest og hash samsvarer, schema 5, SQLite `quick_check=ok`, null fremmednøkkelfeil; SBOM-checksum og format er godkjent med 642 pakker og 3 170 relasjoner. |
| Signert DMG, macOS arm64 og schema 5→7 | Bestått: Developer ID, notarisering/stapling, Universal 2 og checksum, installasjon, schema 5→7 gjennom to starter og desktop-/Host/Client-batch. |
| Samme Universal 2-DMG på native Intel-Mac | Bestått: native x86_64, signatur og checksum, installasjon, desktop-/Host/Client-batch, backup og synlig vindu. Historisk oppgradering ble ikke kjørt på Intel. |
| Windows x64-MSI og schema 5→7 | Bestått: nedlastet MSI og checksum, installasjon, schema 5→7 gjennom to starter, desktop-/Host/Client-batch og avinstallasjon. `UnsignedRequired` er beholdt. |

Begge oppgraderingene (macOS arm64 og Windows x64) bevarte 22 domenetabeller med verdiavtrykk, åtte
beskyttede innstillinger og fem beskyttede katalograder. Sluttbildet har åtte
ruller, to printere, ni historikkhendelser og én printer-live-hendelse. Den nye
batchjournalen er strukturelt validert og tom. Oppgraderingskontrollene bruker
databaseklarhet for de to startene; synlig vindu og vanlig app-livssyklus
kontrolleres separat i de installerte pakkene.

Desktopflyten på begge plattformer ga 1 637 backuprader og to innlånte batchruller
med samme kvittering etter omstart. Host/Client bekreftet to batchruller, to lån, fire
historikkhendelser, én kvittering og uendrede revisjoner ved gjentakelse. Client
har null lokale batchruller, lån eller kvitteringer. Sesjonsfornyelse og sletting
av testlegitimasjon bestod. Windows-avinstallasjonen bevarte databasen og ryddet
appregistrering, snarveier, autostart og PATH-oppføring. Mac-smoken bekreftet et
synlig appvindu via LaunchServices, schema 7 og 27 tabeller. Intel-kjøringen ga
også 1 637 backuprader og bestått batchgjentakelse i både desktop og Host/Client.

## Bevis og avgrensninger

Resultatene samles fra den oppgitte kjøringen og bindes til dens kildecommit og
pakkehasher. PR #98 hadde 11 grønne kontroller på `abaa76e5`; de er tidligere
PR-bevis og erstatter ikke denne kandidatens separate release-kontroll.

Den nedlastede, umigrerte fixturens SHA-256 er
`d31a2f4618c80e00a7a5bbd87640e7c8a93e47d0f55a0b1dfa66460c544a27d6`.

Begge pakkechecksummene er også kontrollert etter lokal nedlasting fra samme
kjøring:

| Pakke | SHA-256 |
| --- | --- |
| `Filament-Manager_0.29.0_universal.dmg` | `b6d12c633ce3b3780b08a7c27de747a72b0d369280283c68237e323f1c1da124` |
| `Filament-Manager_0.29.0_x64_en-US.msi` | `af46c38d8612889bb8971699b3c38fe49f8e37f7683c2ffcadeef3b6dcb7da4b` |

Den publiserte v0.29.0-releasens ID, publiseringsstatus og asset-ID-er, navn,
digester og oppdateringstidspunkter var identiske før og etter kjøringen.

Den eksisterende Intel-jobben prøver signatur, installasjon, desktop-batch og
Host/Client med den samme Universal 2-DMG-en. Den mottar ikke v0.28.0-fixturen
og dokumenterer derfor ikke schema 5→7 på Intel. Oppgraderingskontrollen i denne
workflowen kjører på macOS arm64 og Windows x64.

Native sammendrag og artefaktmetadata oppbevares privat utenfor repoet. Rapporten
skal bare inneholde nødvendige resultater, kildehenvisninger og pakkehasher.
Ingen reelle brukerbiblioteker inngår. Kontrollene tilfører ingen menneskelige
brukertestmålinger; Authenticode for Windows er fortsatt uttrykkelig utsatt.
