# Import og full backup – uavhengig kritikk, runde 2

Vurderingen er gjennomført i den kjørende, separat signerte «Filament Review Data Safety» på macOS, med samme isolerte syntetiske database. Produktkode var fryst under retesten. Ingen produksjonsdata eller fysiske printere ble brukt. Dette er andre runde i den avgrensede import-/backupvurderingen.

## Observerte rettelser

**DS-F1 er rettet i den observerte flyten.** Manuell validering av baseline-backup.json ga Fully compatible, 24/24 tabeller og 1660 rader, nå med kildefilnavnet i oppsummeringen. Neste validering av invalid-backup.json fjernet den forrige oppsummeringen. Feilen oppga valgt filnavn, at backupversjonen ikke støttes, og at brukeren kan oppdatere appen eller velge backup fra denne versjonen. Ingen gammel grønn godkjenning sto igjen sammen med feilen.

**DS-F2 er vesentlig forbedret.** Seks faktiske importforsøk ga følgende synlige meldinger. Ingen ga suksess eller fullbackupbekreftelse:

| Fil | Observert forklaring |
|---|---|
| invalid-backup.json | Backupversjonen støttes ikke; oppdater appen eller velg en kompatibel eksport. |
| malformed.json | JSON-filen er ødelagt eller ufullstendig; eksporter eller last ned på nytt. |
| wrong-document.json | Ugyldige lagerdata; bruk eksportert CSV/JSON, med påkrevde felter og ikke-negative heltallsgram. |
| empty.csv | Filen er tom; velg en eksport med data. |
| inventory-invalid.csv | Ugyldige lagerdata; de påkrevde feltene og vektformatet forklares. |
| inventory-invalid-late-row.csv | Samme konkrete formatkrav, også når en gyldig rad kommer før raden med manglende material. |

Alle meldingene hadde valgt filnavn. Restforbedring: de to CSV-feilene identifiserer fortsatt ikke den konkrete raden eller hvilket felt som feilet. Dette gjør retting av en stor håndredigert CSV langsommere, men brukeren får nå et relevant formatkrav fremfor et nytteløst gjentaksråd. Jeg vurderer dette som et mindre informasjonsfunn, ikke som urettet generisk feil eller lagringssvikt.

Før filvalg står nå forklaringen om at lager-CSV/JSON oppretter eller oppdaterer ruller med samme ID, mens full backup erstatter biblioteket etter bekreftelse. Eksport som gjenopprettingsmulighet nevnes på samme sted. Teksten var lesbar og logisk plassert i importgruppen.

## Databevis og faktisk recovery

Skrivebeskyttede snapshots ble tatt med den eksisterende snapshot.mjs-hjelperen. critic-r2-after-invalid-imports.json er byte-identisk med critic-r2-before.json. Dermed ble heller ikke første gyldige rad i rollback-fixturen stående igjen. Alle ti kontrollerte tabellers antall og digester, kontrollrull 800 g og integritetsresultater var uendret.

Etter feilene importerte jeg inventory-valid.csv gjennom den vanlige filvelgeren. UI viste 2 rader, 1 opprettet og 1 oppdatert. Lageret viste IMPORT kontrollrull 650 g og CSV ny kontrollrull 275 g. critic-r2-after-valid-csv.json bekreftet ti ruller, 1614 katalogposter, begge forventede vekter og tare 200 g, integritet OK og null fremmednøkkelfeil. Ingen omstart var nødvendig for å komme videre fra feil til gyldig import.

Deretter valgte jeg baseline-backup.json og bekreftet full gjenoppretting i kun testappen. Dialogen viste filnavnet og at lager, historikk, printeroppsett og vedlikeholdsdata erstattes. UI kvitterte med 1660 importerte rader. critic-r2-after-restore.json er byte-identisk med R2-start for samtlige ti kontrollerte tabeller og kontrollverdier. Lageret viste igjen kontrollrull 800 g og ingen ny CSV-rull. Dashboard viste 7 on-hand, 4 assigned, to printere og 4/9 slots loaded. Dette er faktisk datagjenoppretting, ikke bare en vellykket dialogtest.

R1 hadde én legacy-normalisering i spool_loans: counterparty_name ble fylt fra borrower_name. Denne er bekreftet i database_backup_import.rs → ensure_borrowed_in_schema i database_borrowed_schema.rs. R2 startet fra den allerede normaliserte baselinen, og restore ga derfor eksakt samsvar i alle ti kontrollerte tabeller.

## Målrettet tastatur og avbryt

Importknappen ble fokusert med tastatur og aktivert med Return. Etter valg av fullbackup hadde Cancel initialt fokus. Tab flyttet til importbekreftelsen. Escape lukket dialogen uten lagring og returnerte fokus til importknappen. En ny åpning av den native filvelgeren ble avbrutt med Escape, og fokus kom igjen tilbake til importknappen. critic-r2-after-cancel.json er byte-identisk med start.

R1 sin fullstendige Tab-kontroll i den samme modalens sløyfe og Return på Cancel videreføres; R2 gjorde den beskrevne målrettede Escape-/returfokustesten. Filvalg benyttet den observerte native tilgjengelighetshandlingen Open Finder item. Ingen full VoiceOver-prøve er gjort.

## Karakterer

Samme kriterier og vekter: oppgaveløsning 25 %, informasjon 20 %, navigasjon 15 %, tilbakemelding 15 %, visuelt 10 %, tilgjengelighet 10 %, robusthet 5 %.

| Hovedflyt | Oppgave | Informasjon | Navigasjon | Tilbakemelding | Visuelt | Tilgjengelighet | Robusthet | R1 | R2 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Eksport og validering | 9 | 9 | 8 | 9 | 8 | 7 | 8 | 7,45 | 8,50 |
| Additiv lagerimport og kvittering | 9 | 8 | 8 | 9 | 8 | 7 | 9 | 8,15 | 8,35 |
| Full restore med konsekvens og avbryt | 9 | 8 | 8 | 9 | 8 | 8 | 9 | 8,40 | 8,45 |
| Ugyldige filer og recovery | 9 | 7 | 8 | 8 | 8 | 7 | 9 | 6,90 | 8,00 |

Eksportdelen av første rad bygger på faktisk eksport i R1 og er videreført; kildefil, ny validering og feilet validering er retestet i R2. De øvrige tre hovedflytene er gjennomført på nytt. Informasjon 7 ved feil beholdes på grunn av manglende konkret rad/felt i CSV-feilen. Oppgaveløsning 9 der bygger på at feil blir tydelig avvist uten delvis lagring, og at riktig fil deretter kan importeres og gjenopprettes uten omstart. Dette er ikke en generell karakter for alle tenkelige importfeil.

Alle fire observerte hovedflyter når målet i denne avgrensningen. Det er ikke nødvendig med en ny kritikkrunde for de mindre restpunktene.

## Restpunkter og avgrensninger

- CSV-feil kan med fordel vise radnummer og nøyaktig felt, særlig for store filer.
- CSV-suksess viser kildeformat og antall, men ikke det konkrete filnavnet. Dette er mindre kritisk enn feilet validering, men ville øke etterprøvbarheten.
- macOS-native utviklingsbygg, engelsk tekst, mørkt tema og syntetiske filer er observert. Windows/Linux, full skjermleser, svært store filer, prosesskrasj midt under restore, lager-JSON som selvstendig gyldig import, alle historiske backupversjoner og manglende/ekstra tabellvarianter er ikke manuelt prøvd.
- UI rapporterer 24 fullbackuptabeller. De semantiske snapshotkontrollene omfatter ti navngitte kjernetabeller og skal ikke omtales som full innholdsverifikasjon av alle 24.
- Skjermbilder av kildefil/feil og restoremodal er faktisk observert i CUA-verktøyloggen. Det er ikke brukt en udokumentert filsystem-API for å arkivere PNG-er; varige bevis her er de navngitte JSON-snapshotene og denne observasjonsrapporten.

Testappen står til slutt på gjenopprettet baseline, Dashboard, med webapp av. Ingen nye eksportfiler ble laget i R2.
