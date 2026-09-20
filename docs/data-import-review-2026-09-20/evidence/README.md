# Datakontroller

Disse filene inneholder bare kontrollrader og antall/digester fra den syntetiske
review-databasen. De er ikke fullstendige backupfiler.

For hver av ti navngitte tabeller ble alle rader lest med en SQLite-tilkobling
åpnet med `readonly: true`. Hver rads felter ble sortert etter feltnavn med
JavaScripts `localeCompare`, serialisert med `JSON.stringify`, deretter ble de
serialiserte radene sortert, sammenføyd med LF og SHA256-hashet. Hvert snapshot
inneholder også `PRAGMA quick_check`, `PRAGMA foreign_key_check` og de to
kontrollrullenes ID, nettovekt, tare og status. Avlesningen ble gjort mellom
ferdige UI-operasjoner, uten import i bakgrunnen.

- `baseline.json`: før manuell validering og import.
- `after-validation-rejection.json`, `after-cancel.json`: etter avvisning/avbrudd.
- `critic-after-invalid-imports.json`: seks ugyldige filer prøvd gjennom UI.
- `critic-after-valid-csv.json`: 1 ny og 1 oppdatert rull.
- `critic-after-repeat-csv.json`: samme CSV igjen; ingen duplikater.
- `critic-after-restore.json`: full backup gjenopprettet gjennom UI.
- `critic-r2-*`: tilsvarende kontrollpunkter etter rettelsene.

R2 sammenlignes med sin egen `critic-r2-before.json`, siden første restore
normaliserte lånenes `counterparty_name` fra `borrower_name`. Normaliseringen er
beskrevet i hovedrapporten. Sammenligning kun av antall ville ikke være nok til
å bekrefte uendrede data; digestene kontrollerer også verdiene.

Testfilene var avgrensede: tom CSV, syntaktisk ødelagt JSON, et JSON-objekt med
kun `note`, backup deklarert som `filament-manager-backup-v999`, CSV med negativ
vekt, og CSV med gyldig første rad men manglende materiale i neste. Gyldig CSV
brukte `review_import_control` (800 → 650 g) og `review_import_added` (ny, 275 g),
begge med tare 200 g. Fullbackupen ble laget med appens eksportknapp fra baseline.
