# Publisering av v0.30.0 — 8. september 2026

## Publisert kandidat

[Filament Manager v0.30.0](https://github.com/bliatun-code/Filament-Manager/releases/tag/v0.30.0)
ble publisert 8. september 2026 kl. 18:05:52 UTC. GitHub bekrefter release-ID
`384953911`, `draft=false`, `prerelease=false` og `immutable=true`.
Endepunktet for nyeste release returnerer samme ID.

Den annoterte taggen `v0.30.0` peker på commit
`7d2eb3a45fc78a60ad31cb88e178ba266d044c5b`, som ble merget gjennom PR #99.
[Taggkjøring 34259186312](https://github.com/bliatun-code/Filament-Manager/actions/runs/34259186312)
bestod alle åtte jobber i første forsøk, inkludert offentlige attestasjoner
og publisering. Hovedgrenens [CI](https://github.com/bliatun-code/Filament-Manager/actions/runs/34238181880)
og [CodeQL](https://github.com/bliatun-code/Filament-Manager/actions/runs/34238181784)
var allerede grønne på samme commit.

Den [manuelle verifiseringen](RELEASE_VERIFICATION_v0.30.0_2026-09-08.md)
beholdes som egen historisk kontroll. Taggkjøringen bygget nye pakker;
hashene i denne rapporten gjelder de faktisk publiserte filene.

## Publiserte filer og proveniens

Releasen har nøyaktig sju filer: DMG, MSI, kilde-SBOM, tre checksumfiler og
`Filament-Manager_0.30.0_provenance.sigstore.json`. Alle er lastet ned fra
releasesiden. Filstørrelser og beregnede SHA-256 samsvarer med GitHub-API-ets
digester og artefaktene fra taggkjøringen. De tre checksum-manifestene er også
kontrollert. Releaseteksten samsvarer med releasenotatet på taggen.

| Publisert fil | SHA-256 |
| --- | --- |
| `Filament-Manager_0.30.0_universal.dmg` | `536327d277ee3e11b1c50b1b91ee5d88a6aad50c983ddfe9fb5983d7d661a040` |
| `Filament-Manager_0.30.0_x64_en-US.msi` | `b8918167a8fc4c7deaffa09782bb6e65973f55d061d3d51897107d770421f44a` |
| `Filament-Manager_0.30.0_source.spdx.json` | `0c43cf8c3a17cc0f2855df6a5476297f0861a8385af73aa1ee327e806d572158` |

SPDX 2.3-filen er validert for `bambu-filament-manager@0.30.0`, med 642 pakker
og 3 170 relasjoner. Begge installatørene bestod `gh attestation verify` både
med attestasjoner hentet fra GitHub og med den publiserte Sigstore-filen.
Verifiseringen krevde eksakt repo, `.github/workflows/release-build.yml`,
`refs/tags/v0.30.0`, kildecommiten ovenfor og en GitHub-hostet runner.
Det verifiserte sertifikatet binder resultatet til forsøk 1 av kjøring
`34259186312`; begge pakkers digester samsvarer med de signerte objektene.

## Installerte kontroller

| Plattform | Resultat fra taggkjøringen |
| --- | --- |
| macOS arm64 | Developer ID, notarisering/stapling, Universal 2, checksum, installasjon, schema 5→7 og desktop-/Host/Client-flyter bestått. |
| Native Intel | Samme signerte Universal 2-DMG, installasjon, synlig vindu og desktop-/Host/Client-flyter bestått. Historisk oppgradering ble ikke kjørt. |
| Windows x64 | MSI, checksum, installasjon, schema 5→7, desktop-/Host/Client-flyter og avinstallasjon bestått. `UnsignedRequired` er beholdt. |

Begge historiske oppgraderinger brukte v0.28.0-fixturen fra `76cba513` med
schema 5. Gjennom to starter ble 22 domenetabeller med verdiavtrykk, åtte
beskyttede innstillinger og fem katalograder bevart. Batchjournalen er
strukturelt validert og tom. Oppgraderingsstartene bruker databaseklarhet;
synlig vindu kontrolleres separat i installasjonstestene.

Alle tre plattformer bestod desktop-batch etter omstart med to innlånte ruller
og 1 637 backuprader. Host/Client bekreftet to batchruller, to lån, fire
historikkhendelser, én kvittering og uendrede revisjoner ved gjentakelse.
Client hadde null lokale batchruller, lån og kvitteringer. Katalogjobber,
sesjonsfornyelse og rydding av testlegitimasjon bestod. Windows-avinstallasjon
bevarte databasehashen og ryddet appregistrering, snarveier, autostart og PATH.

## Oppfølging og avgrensninger

Etter bekreftet publisering flyttes migrasjonsmanifestets publiserte grense
til sekvens 008 med referanse til denne taggen og kildecommiten. Schema 7,
migrasjons-SQL, baseline-/helperhashes og den historiske v0.28-fixturen beholdes.
Manifestoppfølgingen endrer ikke de publiserte pakkene.

Den tidligere v0.29.0-releasens metadata og pakker er kontrollert uendret.
Rålogger, testdatabaser og nedlastede bevis oppbevares utenfor repoet.
Ingen reelle brukerbiblioteker inngår. Disse kontrollene tilfører ikke
menneskelige brukertestmålinger; Authenticode for Windows er fortsatt utsatt.
