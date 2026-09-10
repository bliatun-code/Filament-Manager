# Backup-gjenoppretting i installert app – 10. september 2026

Den pakkede desktop-kontrollen omfatter nå faktisk gjenoppretting gjennom
appens vanlige `import_full_backup_json`-kommando. Den kjører i samme private,
syntetiske database som de eksisterende testene av registrering, vekt,
utlån/retur, skriverplassering og batchgjentakelse.

## Fire appstarter

1. `mutate` oppretter og endrer testbiblioteket, inkludert to innlånte ruller.
2. `verify` åpner biblioteket på nytt, gjentar den opprinnelige batchen og
   validerer full backup. Den eksisterende kontrollen av uendret databasetilstand,
   historikk, innstillinger og revisjoner gjelder fortsatt mellom disse startene.
3. Testdriveren oppretter én avsluttet, syntetisk katalogjobb mens appen er
   stoppet. `restore` eksporterer backup, endrer testspolen fra 760 g til 123 g
   og leser tilbake begge vektfeltene før import. Appen importerer den eksporterte
   backupen og kontrollerer gjenopprettede data og den opprinnelige batchkvitteringen.
4. `verify-restored` åpner biblioteket i enda en ny appprosess. Backupens
   normaliserte tabellinnhold, spoler, lån, skriverplassering og batchgjentakelse
   må fortsatt stemme med resultatet fra gjenopprettingen.

Backupens tidspunkt og rekkefølgen på tabeller, rader og JSON-nøkler påvirker ikke
sammenligningen av tabellinnholdet. Rå eksport beholder en egen SHA-256 i
fasekvitteringen. Verken `catalog_refresh_jobs` eller `catalog_spool_batches`
kan finnes som tabellnøkkel i den portable backupen, heller ikke som tom liste.

## Uavhengig kontroll av SQLite

Etter at hver appprosess er avsluttet, kontrollerer Node-driveren schema,
SQLite-integritet, fremmednøkler og de faktiske domenedataene. Etter import må
den syntetiske katalogjobben være borte, mens installasjonens batchjournal skal
være identisk, inkludert bibliotek-ID, tidsstempel og de opprinnelige JSON-verdiene.

På tvers av import sammenlignes domenedata og portable innstillinger separat fra
maskinlokale data. Katalogjobber, domenerevisjoner, paringer, synkroniseringskø,
maskinlokale innstillinger og skriverlegitimasjon følger sine eksisterende
importregler. Testen krever ikke at disse importeres fra backup. Alle katalograder,
inkludert katalogversjon og tidsstempler, inngår i både Node-projeksjonen og
appens sammenligning av eksportert tabellinnhold.

Mellom `restore` og `verify-restored` sammenlignes alle tabeller og kolonner,
med én eksplisitt oppstartsovergang: `secure_credential_storage_migration_v1`
skal være borte etter import og gjenopprettes som nøyaktig `complete` ved neste
oppstart. Dette følger den eksisterende legitimasjonsmigreringen; markøren er
ikke portable brukerdata. Manglende eller feil markør feiler testen. Alle andre
innstillinger, historikk og revisjoner må være uendret gjennom den siste
omstarten og batchgjentakelsen. Den opprinnelige `mutate` → `verify`-kontrollen
er uendret.

Den siste fasen får bare gjenopprettingens opprinnelige, kjøringsbundne kvittering.
Rust og Node avviser manglende eller ugyldig bevis, feil hash, feil vektendring,
annen låneidentitet og feil fase. Fasefiler forblir private og størrelsesbegrensede.
Testgrensesnittet krever fortsatt eksplisitt aktivering og den merkede testdatabasen.

## Katalogrettelse

Arbeidet avdekket at startkatalogen sammenlignet en utgått posts opprinnelige
`discontinued_at` med et nygenerert tidspunkt, selv når det opprinnelige
tidspunktet ble beholdt. Det kunne endre `updated_at` på hver innlesing uten
endring av katalogdata. Sammenligningen bruker nå verdien som faktisk skal lagres.
Regresjonstester skiller uendrede utgåtte poster fra reell utfasing og reaktivering.

## Verifisering

Regresjonene dekker import og vektendring uten effekt, tapte domenedata og
historikk, beholdt katalogjobb, endret kvittering, feil kjøringsbevis og endringer
etter siste omstart. De ordinære macOS- og Windows-jobbene samt kandidatworkflowen
bruker den samme utvidede testdriveren. Windows-wrapperen krever alle fire faser
og eksplisitt bestått gjenoppretting etter omstart i sluttsammendraget.

En fersk optimalisert, lokalt ad-hoc-signert arm64-DMG bestod hele macOS-smoken:
LaunchServices-start, alle fire desktop-faser med 1 637 backuprader og separat
Host/Client-flyt med sesjonsfornyelse og legitimasjonsopprydding. Desktop-resultatet
bekrefter én slettet katalogjobb, bevart batchjournal, identisk portabelt innhold
og den nøyaktige markørovergangen etter omstart. Dette er lokal installasjonstesting;
historiske oppgraderingsporter og Developer ID/notarisering inngikk ikke i denne
kjøringen. Native CI-resultater er dokumentert nedenfor.

Lokalt bestod 884 skripttester og 1 693 UI-tester, samt 18 fokuserte UI-tester
etter den siste kontrollen av skriverstatus. Hele Rust-workspacet bestod med
643 desktop-, 291 core-, 15 tjenesteannonserings- og 3 generatortester; tre
eksisterende Rust-tester er fortsatt ignorert. Begge Clippy-profiler, UI-lint,
kontraktskontrollene, public-readiness og det ferske UI-bundlebudsjettet er grønne.

Dette endrer ikke databaseskjema, backupformat eller appversjon. Testbiblioteket
inneholder ingen reelle brukerdata.

## CI-oppfølging

[PR #109](https://github.com/bliatun-code/Filament-Manager/pull/109) bestod alle
11 kontroller på `a838631b8c73ddcfd68c15342eb8247773fe3d44` i første kjøring.
[CI](https://github.com/bliatun-code/Filament-Manager/actions/runs/34422061783),
[CodeQL](https://github.com/bliatun-code/Filament-Manager/actions/runs/34422061788)
og [avhengighets-/lisenskontrollene](https://github.com/bliatun-code/Filament-Manager/actions/runs/34422061781)
er grønne. Loggartefaktene fra begge installasjonene er lastet ned og kontrollert.

| Kontroll | macOS DMG | Windows x64 MSI |
| --- | --- | --- |
| Alle fire desktop-faser og schema 7 | Bestått | Bestått |
| Gjenopprettet backup, også etter omstart | 1 637 rader | 1 637 rader |
| Vedvarende katalogjobb fjernet ved import | 1 | 1 |
| Opprinnelig batchjournal og bibliotek-ID bevart | Bestått | Bestått |
| Nøyaktig legitimasjonsmarkør etter omstart | Bestått | Bestått |
| Host/Client, sesjonsfornyelse og legitimasjonsopprydding | Bestått | Bestått |

Fasekvitteringene har samme kjørings-, låne- og batchidentitet gjennom alle fire
starter. Begge gjenopprettingsfasene og sluttsammendraget har samme normaliserte
backuphash innen hver plattformkjøring. Windows bestod også vanlig lukking,
bakgrunnsstart, tray-/single-instance-flyt og avinstallasjon med bevart database.

Dette var ordinære debug-pakker i PR-CI med lokal ad-hoc-policy på Mac og
`UnsignedRequired` på Windows. De separate release-portene for v0.28.0 og v0.30.0,
Intel-installasjon og notarisering ble ikke kjørt på nytt. Ingen offentlig release
eller tagg ble opprettet. Denne resultatoppfølgingen committes lokalt og tas med
i neste samlede push.

## Merge-oppfølging

PR #109 ble merget 10. september som
`be184e9c10b685e22cf877f390739e32a6c21dca`. Mergecommiten og den verifiserte
PR-kandidaten `a838631b` har identisk Git-tre
(`48413e762eea9b7c3d8c1910b02392927206a1d5`). Lokal `main` er oppdatert,
og denne resultatdokumentasjonen er videreført på `codex/post-pr109` for neste
samlede push. Hovedgrenens [CI](https://github.com/bliatun-code/Filament-Manager/actions/runs/34424446340)
og [CodeQL](https://github.com/bliatun-code/Filament-Manager/actions/runs/34424446362)
er egne kjøringer; de grønne resultatene ovenfor er fra PR-kandidaten.
