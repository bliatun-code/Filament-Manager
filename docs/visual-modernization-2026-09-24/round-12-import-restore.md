# R12 – faktisk native import og gjenoppretting

Uavhengig kontroll i signert Review-app, isolert interactive-r4.db, eksplisitt Dark, 856 logiske piksler. Ingen produksjonsdata. Ikke samlet godkjenning.

Full backup ble eksportert gjennom UI til filament-manager-backup-1790211351809.json. UI rapporterte kompatibel 24/24 tabeller og 3946 rader. Gyldig CSV oppdaterte visual_edge_0 fra525 til500 og opprettet visual_import_added med275g; SQLite bekreftet begge. Filvelgeren hadde en indeks/koordinatfeil i kontrollverktøyet: et klikk på AX-feltet invalid-second-row valgte faktisk valid-two-rolls. Dette ble korrigert med Go To og eksplisitt bekreftet selected-fil før Return. Ingen produktfeil tilskrives denne feilseleksjonen.

Negative vekter og senere korrekt valgt invalid-second-row.csv ble avvist med filnavn og forklaring av påkrevde felt. Etter sistnevnte var ingen visual_import_rejected opprettet. Feilmeldingen var imidlertid utenfor skjermen øverst i Settings når importkontrollen og Application diagnostics var synlige nederst. Brukeren måtte selv rulle opp for å se utfallet (I8).

Gjenoppretting brukte den ferske UI-eksporten. Bekreftelsen viste filnavn og at inventory, history, printers og maintenance erstattes; Cancel hadde initialt fokus, Tab flyttet til Import og Return utførte. UI rapporterte 3946 rader importert. SQLite bekreftet edge0 tilbake525, begge import-ID-er fraværende, tidligere mottatt wishlist-rull1000g og RECEIVED/0 bevart; quick_check ok.

## Inspektørens ti kriterier

|Tilstand (Dark856)|H|T|L|F|K|V|I|R|D|A|
|---|---|---|---|---|---|---|---|---|---|---|
|Backup/maintenance|9|9|9|8|8|9|8|9|9|IE|
|Restore confirm|9|9|9|9|9|9|9|9|9|IE|

F/K8: Export full backup og Download support har cyan solid primær, mens felles Dark-primær ellers er hvit. I8: både importfeil og ferdig restore kvitteres kun i den øverste Settings-meldingen, uten at den gjøres synlig etter filvelger/dialog. A er IE utover konkret observert Cancel→Import-tastatursteg. Andre temaer, tom CSV, malformed/unknown JSON og unsupported backup er ennå ikke kontrollert faktisk.

## Faktisk inspiserte bilder

Alle ligger under tmp/visual-modernization/critic-r4-interactive/: backup-export-validated-dark856-r12.png, import-negative-weight-dark856-r12.png, import-second-row-accepted-dark856-r12.png (misvisende filnavn; viser vedlikehold uten kvittering etter gyldig import), import-second-row-rejected-dark856-r12.png (viser offscreen-feilproblemet), import-second-row-error-visible-dark856-r12.png (etter manuell scroll), backup-restore-confirm-dark856-r12.png og backup-restored-dark856-r12.png.

## R13 faktisk retest av lokal tilbakemelding

Dark856: korrekt valgt invalid-second-row.csv avvises nå i lokal fokusert melding ved Import/Validate. Automatisk scroll viser hele meldingen; Export full backup er hvit felles primær. I8 for importfeil er lukket til9. Deretter ble empty.csv, malformed.json, unknown-object.json og unsupported-backup.json faktisk valgt med eksaktsti/AXselected og avvist. Alle fire meldinger er lokalt synlige, har konkret filnavn, relevant utbedring og fokus på meldingscontainer. Ingen gammel feil vises sammen med den nye. SQLite etter alle forsøk: edge0=525, ingen visual_import_-ruller. De fire bildetilstandene er individuelt sett og lagret under critic-r4-interactive/import-{empty-csv,malformed-json,unknown-object-json,unsupported-backup-json}-dark856-r13.png. Retestbildet for secondrow er import-inline-error-fixed-dark856-r13.png. Ti kriterier for disse Dark856-feiltilstandene: H9 T9 L9 F9 K9 V9 I9 R9 D9 AIE (konkret fokusmekanisme sett, øvrig A ikke utledet).
