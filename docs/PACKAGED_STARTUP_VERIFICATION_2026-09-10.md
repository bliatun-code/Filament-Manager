# Pakket databaseoppstart — 10. september 2026

Status: **Oppstartsbekreftelsen bestod på macOS og Windows. Hele
kandidatkjøringen feilet ved senere Windows-opprydding.**

## Kandidat og kjøring

Manuell [kandidatkjøring 34409459177](https://github.com/bliatun-code/Filament-Manager/actions/runs/34409459177)
fra `main`, kildecommit `b95aa69322d6c4c1960b454701c36e59e1f70d5b`, med
`platform=both` og Mac-notarisering. Kjøringen startet 9. september UTC og ble
kontrollert 10. september norsk tid. Kandidaten har appversjon 0.30.0 og schema 7;
den er en separat testbygging etter den publiserte v0.30.0-releasen.

[Ordinær CI](https://github.com/bliatun-code/Filament-Manager/actions/runs/34409322016)
og [CodeQL](https://github.com/bliatun-code/Filament-Manager/actions/runs/34409322028)
bestod på samme commit. Publisering og offentlige attestasjoner ble hoppet over
i kandidatkjøringen. Den publiserte releasens metadata, asset-ID-er, digester og
oppdateringstider var identiske før og etter kjøringen.

## Kontrollerte oppstarter

De originale fixturene ble lastet ned og kontrollert lokalt med hver sin
manifestvalidator. Begge hadde gyldig SQLite-integritet, fremmednøkler og
sanitiserte data. De installerte kandidatene kjørte deretter to ganger mot hver
fixture. Logger og oppstartsbekreftelser ble lastet ned fra samme kjøring.

| Plattform | Datagrunnlag | Oppstarter | Resultat |
| --- | --- | ---: | --- |
| macOS Apple Silicon | v0.28.0, schema 5 → 7 | 2 | Bestått migrasjon og databevaring |
| macOS Apple Silicon | v0.30.0, schema 7 → 7 | 2 | Bestått kompatibilitet og databevaring |
| Windows x64 | v0.28.0, schema 5 → 7 | 2 | Bestått migrasjon og databevaring |
| Windows x64 | v0.30.0, schema 7 → 7 | 2 | Bestått kompatibilitet og databevaring |

Alle åtte bekreftelser hadde riktig token i filnavn og innhold, positiv
prosess-ID og korrekt kanonisk fixturebane. Hver omstart hadde nytt token og ny
prosess-ID. Den kjørende testdriveren kontrollerte dessuten prosess-ID mot den
faktiske barneprosessen. Begge schema-7-prøvene bevarte 24 tabeller med
verdiavtrykk, to fysiske spoler og én batchkvittering.

Mac-pakkens signatur, notarisering, installasjon og vanlige appflyter bestod på
Apple Silicon og Intel. Intel brukte samme checksum-kontrollerte Universal
2-DMG og bestod desktop- og Host–Client-flytene; databasefixturene inngår ikke i
Intel-jobben. Windows beholdt `UnsignedRequired`.

## Windows-feilen etter oppstartstestene

Desktop-E2E bestod med 1 637 backuprader. Host–Client-sammendraget viste beståtte
scenarioer og `auth_cleanup: pass`, inkludert batchgjentakelse, sesjonsfornyelse
og slettet autentisering. Deretter feilet rekursiv sletting av det private
arbeidstreet med `EPERM` etter avgrensede forsøk.

Slettingen hadde allerede fjernet arbeidsmarkøren. Wrapperens forsøk på å
gjenoppta credential-opprydding feilet derfor med `ENOENT`. En lokal,
deterministisk test reproduserte delvis sletting etterfulgt av denne feilen.
Den konkrete årsaken til den vedvarende `EPERM`-feilen kan ikke fastslås fra
loggene. Kjøringen dokumenterer ikke bestått etterfølgende Windows-vindus- og
avinstallasjonskontroll.

Oppfølgingsrettelsen bevarer en separat slettingskvittering utenfor arbeidstreet,
bundet til kjøringen og mappeidentiteten, etter bekreftet legitimasjonsrydding og
prosessavslutning. Den lar filrydding gjenopptas selv om markør og databaser er
borte. Kvitteringen gjør ikke et feilet scenario grønt. Den oppdaterte testdriveren bestod også en lokal Host–Client-kjøring mot appen
fra den checksum-kontrollerte DMG-en: legitimasjonen ble ryddet, kvitteringen
ble skrevet, og arbeidsmappen ble fjernet. Native Windows-verifisering
av denne oppfølgingsrettelsen gjenstår.

## Kontrollsummer

Pakkene ble lastet ned og kontrollert mot kjøringens checksum-filer. Fixturhashene
gjelder originalene før appoppstart; de sammenlignes ikke med databaser som appen
har migrert eller oppdatert.

| Artefakt | SHA-256 |
| --- | --- |
| `Filament-Manager_0.30.0_universal.dmg` | `7b81467652cfe3301e0c0b6bfea9225ecce7bd25b1c23d0fb4f0e1d45d3c44db` |
| `Filament-Manager_0.30.0_x64_en-US.msi` | `52a42ce014d268c6f9c8f9cf9269c116e1a4da77c47c5729c18c4b82cb7aef55` |
| Original v0.28-fixture | `350dee5d5d241ba4a4d9b8d9920b2c77840dcc5b0839ff476f0651647c73843a` |
| Original v0.30-fixture | `e2939ac070b290ad0520563b81c1e0e75b38596ab470bdb34f482cc189a35c4f` |
| Kildens SPDX 2.3-SBOM, 644 pakker | `0d0c6ef8e1d9465e42e56400e71a320d45456af2f6cf9715748fde7ccccd6fbf` |

Rålogger, oppstartsbekreftelser og databaser oppbevares utenfor repoet.
Ingen reelle brukerbiblioteker eller menneskelige brukertestmålinger inngår.
