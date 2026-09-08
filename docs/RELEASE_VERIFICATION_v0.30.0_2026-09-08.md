# Release-verifisering av v0.30.0 — 8. september 2026

## Kandidat og omfang

Status: **Bestått.** Seks release-jobber er grønne. De to taggstyrte jobbene
for offentlige attestasjoner og publisering er hoppet over.

PR #99 er merget. Kontrollen gjelder hovedgrenens kildecommit
`7d2eb3a45fc78a60ad31cb88e178ba266d044c5b`, med appversjon `0.30.0` og schema 7.
[Release Build Artifacts, kjøring 34248691674](https://github.com/bliatun-code/Filament-Manager/actions/runs/34248691674)
ble startet manuelt med `platform=both` og `confirm_macos_notarization=true`.

Den [tidligere rapporten](RELEASE_VERIFICATION_2026-09-08.md) gjelder
`aee8d23e` og pakker merket `0.29.0`. Den bevares som historisk bevis;
dens resultater og pakkehasher erstatter ikke kontrollene av denne kandidaten.

## Resultater

Hovedgrenens ordinære CI og CodeQL er bestått på den oppgitte kandidaten.
Den separate release-kjøringen bestod de seks portene nedenfor. De nedlastede
pakkene, metadataene og native sammendragene er også kontrollert lokalt.

| Kontroll | Status |
| --- | --- |
| [Hovedgrenens CI](https://github.com/bliatun-code/Filament-Manager/actions/runs/34238181880) | Bestått på `7d2eb3a4`. |
| [Hovedgrenens CodeQL](https://github.com/bliatun-code/Filament-Manager/actions/runs/34238181784) | Bestått på `7d2eb3a4`. |
| Releaseforespørsel — `Validate release request` | Bestått: v0.30.0 fra `main`, begge plattformer og Mac-notarisering. |
| Historisk fixture — `Prepare v0.28 database fixture` | Bestått; også kontrollert etter lokal nedlasting: manifest og hash samsvarer, schema 5, `quick_check=ok` og null fremmednøkkelfeil. |
| SBOM — `Generate source dependency SBOM` | Bestått; nedlastet SPDX 2.3 for v0.30.0 har gyldig checksum, 642 pakker og 3 170 relasjoner. |
| DMG og macOS arm64 — `Build signed macOS DMG` | Bestått: Developer ID, notarisering/stapling, Universal 2, checksum, installasjon, schema 5→7 og desktop-/Host/Client-flyter. |
| Native Intel — `Smoke Universal 2 DMG on Intel` | Bestått etter avgrenset omkjøring: samme Universal 2-DMG, native x86_64, signatur, installasjon, synlig vindu og desktop-/Host/Client-flyter. Historisk oppgradering ble ikke kjørt på Intel. |
| Windows x64 — `Build Windows MSI` | Bestått: checksum, installasjon, schema 5→7, desktop-/Host/Client-flyter og avinstallasjon med bevart database. `UnsignedRequired` er beholdt. |

De to taggstyrte jobbene `Attest public release installers` og
`Publish verified GitHub release` ble hoppet over i denne manuelle main-kjøringen.
Publisering og offentlige attestasjoner krever en separat kjøring fra eksakt
versjonstagg. Denne kontrollen opprettet ingen tagg eller publisert release.

Intel-jobbens første forsøk stoppet ved nedlasting: GitHubs artefakttjeneste
returnerte `ListArtifacts` HTTP 403 fra et mellomledd. Appen ble ikke startet.
Bare Intel-jobben ble kjørt om, og bestod i forsøk 2 på samme kildecommit.
De fem tidligere beståtte jobbene har identiske steg og start-/sluttider;
eksisterende artefakt-ID-er, digester og oppdateringstider er uendret.
Installasjonspakkene ble ikke bygget på nytt.

## Oppgradering og native bevis

Oppgraderingsgrunnlaget er den syntetiske, sanitiserte v0.28.0-fixturen fra
`76cba513eadd5137d6703f9abd1c0452531ef788`, med schema 5. Dette er en historisk
kompatibilitetsbaseline, ikke en påstand om siste publiserte release.

Den nedlastede, umigrerte fixturens SHA-256 er
`c3d8ae5a63cb05e0e569fe8d5cc002def807ac5b8b1b638fed5ccb31e20e1a02`.

På macOS arm64 og Windows x64 bestod schema 5→7 gjennom to starter. Begge
bevarte 22 domenetabeller med verdiavtrykk, åtte beskyttede innstillinger og fem
beskyttede katalograder. Sluttbildet har åtte ruller, to printere, ni
historikkhendelser og én printer-live-hendelse. Batchjournalens struktur er
validert og journalen er tom. Oppgraderingsstartene bruker databaseklarhet;
synlig vindu og normal app-livssyklus kontrolleres separat i installasjonstestene.

Intel-jobben brukte samme Universal 2-DMG og bestod signatur, installasjon,
synlig vindu, desktop-batch, backup og Host/Client. Den mottok ikke den
historiske fixturen og dokumenterer derfor ikke schema 5→7 på Intel.

Desktopflyten på macOS arm64, Intel og Windows bestod med 1 637 backuprader og
gjentakelse av en batch med to innlånte ruller etter omstart. Host/Client bestod
med to batchruller, to lån, fire historikkhendelser og én kvittering; gjentakelse
endret ikke revisjonene og Client hadde null lokale batchruller, lån eller
kvitteringer. Katalogjobber, sesjonsfornyelse og rydding av testlegitimasjon
bestod. Windows-avinstallasjonen bevarte databasehashen og fjernet
appregistrering, snarveier, autostart og PATH-oppføring.

## Pakker og hasher

Begge pakkene er lastet ned fra denne kjøringen og SHA-256-kontrollert lokalt
mot deres checksum-manifester. Hashene nedenfor gjelder disse v0.30.0-pakkene.

| Verifisert pakke | SHA-256 |
| --- | --- |
| `Filament-Manager_0.30.0_universal.dmg` | `2c52071efc6c01444997c05cfe0f3832f1fa9c60a36f3e2c0cddecf7e43e2612` |
| `Filament-Manager_0.30.0_x64_en-US.msi` | `8449c3f1aa76113c0b078a1ccf2228e154a1890bf83420b3a2a2a33416c9a98b` |

## Avgrensninger

Bevisene er bundet til kildecommit, kjøring og faktiske pakkehasher. Den
publiserte v0.29.0-releasens metadata og pakker er uendret etter kontrollen. Rålogger
og native sammendrag oppbevares privat utenfor repoet; ingen reelle
brukerbiblioteker inngår. Dette er ingen menneskelig brukertestmåling.
Windows beholder `UnsignedRequired`; Authenticode er fortsatt uttrykkelig utsatt.
