# Transaksjoner ved oppretting av syntetiske testdatabaser

## Problem og målegrunnlag

[PR #114](https://github.com/bliatun-code/Filament-Manager/pull/114) er merget som `e726860e`. Den grønne [CI-kjøringen 34723423979](https://github.com/bliatun-code/Filament-Manager/actions/runs/34723423979) på `04312c70` gir følgende utgangspunkt fra nedlastede jobblogger:

| Måling | macOS | Windows |
| --- | ---: | ---: |
| Hele skriptsuiten, 891 tester | 29,24 s | 264,44 s |
| Eksakt bevaring av installasjonens journal og historikk ved restore | 1,16 s | 98,94 s |
| Studie-fixture med felles brukerdefinert dry-box-type | 0,30 s | 19,88 s |
| Avvisning av delvis katalogimport, foreldet kvittering og Client-fallback | 0,22 s | 44,78 s |

En eldre grønn main-kjøring, [34713771470](https://github.com/bliatun-code/Filament-Manager/actions/runs/34713771470), brukte omtrent 366 sekunder på Windows-skriptsuiten. Variasjonen betyr at én før/etter-kjøring ikke gir en stabil ytelsesgaranti. Individuelle testtider inkluderer konkurranse mellom parallelle testprosesser og skal ikke summeres.

Flere hjelpere opprettet hvert skjemaobjekt med en egen SQLite-autocommit. Den delte visuelle QA-fixturen hadde 41 slike skrivinger for schema 1 og 81 for schema 2, i tillegg til transaksjonen som satte inn seed-radene. Dette gjentas i mange tester og er en konkret kilde til unødvendige diskoperasjoner.

## Endringen

- `createVisualQaFixture` samler skjema, eventuell schema-2-migrering, seed, `user_version` og helsekontroll i én transaksjon. `foreign_keys = ON` settes før transaksjonen, ettersom SQLite ignorerer denne endringen inne i en aktiv transaksjon.
- Private byggere i testene for pakket desktop, Host/Client og Windows-/macOS-databaseverifikatorer samler også initialisering i transaksjoner. Host og Client har hver sin database og hver sin transaksjon; de publiseres til verifikatorene først etter at begge er lukket.
- De etterfølgende mutasjonene, korrupsjonene, gjenopprettingene og kontrollene fra separate forbindelser beholder sine opprinnelige transaksjonsgrenser.
- Frosne SQL-filer, migrasjonsmanifest, seed, produksjonsdatabaser, journalmodus og durability-innstillinger endres ikke. Hver test beholder egne filer, og studiens separate oppgavedatabaser beholdes.

## Regresjoner og måling

`create-visual-qa-fixture-transactions.test.mjs` kjøres automatisk som del av eksisterende `test:scripts` på begge CI-plattformer:

1. En uavhengig referanse bygger schema 1 og 2 med tidligere transaksjonsgrenser. Kandidatens samtlige skjemaobjekter og alle tabellrader sammenlignes med referansen, inkludert revisjoner og tidsstempler. Bare SQL-klokken i disse testforbindelsene er fastsatt slik at standardverdier kan sammenlignes eksakt.
2. SQLite-sporing krever null autocommit-skrivinger og én commit for kandidaten. Referansen må fremdeles vise autocommit-skrivingene. Begge schema-versjoner kontrolleres for integritet og fremmednøkler.
3. Faktisk SQL-syntaksfeil etter skjemaoppretting, faktisk fremmednøkkelfeil under innsetting og injisert feil i avsluttende helsekontroll skal rulle tilbake alle skjemaobjekter og `user_version` før forbindelsen lukkes. Databasen og sidefilene skal deretter være fjernet. Eksisterende tester beholder kontrollen av private rettigheter og primærfeil ved samtidig close-/cleanup-feil.
4. Referanse og kandidat rapporterer lokal varighet i samme testprosess, uten en ustabil tidsgrense. Kandidattiden inkluderer også generatorens ordinære preflight- og helsekontroller. Disse enkeltmålingene er diagnostikk, ikke et benchmark med statistisk sikkerhet.

Alle fem nye regresjoner feilet mot tidligere byggemåte og passerer med endringen. Den fokuserte kjøringen av berørte byggere og verifikatorer bestod 129 tester. Den lokale samlede kontrollen bestod UI-bygg, lint, 392 Companion-tester, 896 skripttester, begge tilgjengelighetsporter, fem utlånsdialogscenarioer, 1 726 UI-tester og 23 ytelsestester. Dokumentasjonsporten ble kjørt på nytt etter staging av den nye rapporten; alle kontrakter og doctor er grønne. Ingen native implementasjon er endret; full Rust-verifisering og installerte pakker kjøres i eksisterende CI.

## Verifisert resultat og merge

[PR #115](https://github.com/bliatun-code/Filament-Manager/pull/115) bestod alle åtte kontroller etter én push på `aa47b5ca` og er merget som `627fdba2`. Nedlastede logger fra [CI 34725647963](https://github.com/bliatun-code/Filament-Manager/actions/runs/34725647963) bekrefter 896 skripttester og installerte DMG-/MSI-tester på begge plattformer.

Windows-skriptsuiten gikk fra 264,44 til 36,03 sekunder, 86,4 % kortere i denne sammenligningen. Restore-testen gikk fra 98,94 til 8,26 sekunder. I samme Windows-prosess målte schema-2-referansen 10 823,2 ms mot 83,4 ms for den samlede transaksjonen, med identiske snapshots. macOS-suiten gikk fra 29,24 til 30,63 sekunder; det hevdes ingen samlet macOS-gevinst. Enkeltkjøringer påvirkes fortsatt av konkurranse om kjørerressurser.

Ingen ny release er nødvendig for denne testinfrastrukturendringen.
