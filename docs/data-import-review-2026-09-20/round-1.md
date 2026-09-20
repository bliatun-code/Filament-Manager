# Import og full backup – uavhengig kritikk, runde 1

Ny avgrenset vurdering i «Filament Review Data Safety», separat syntetisk Standalone-database `tmp/data-safety-review/review.db`. Produktkode er fryst under observasjon. Ingen karakterer er satt før oppgavene er tilstrekkelig gjennomført.

## Start og eksport

Dashboard viste 7 on-hand-ruller og 4 assigned, to printere og webapp av. Ni rader i databasen inkluderer andre statuser; dette er ikke en observert antallsfeil. Dashboard sin Backup-knapp åpnet direkte Program maintenance.

Vedlikehold hadde tydelige grupper for Backup and export og Import and validation. Full backup var fremhevet. Eksport av full backup ga «Full backup exported (inventory, history and printers). Backup validation completed», ny siste-eksportdato og summary Fully compatible, format v1, 24/24 tabeller, 1660 rader, ingen manglende/ekstra tabeller. Ingen filbane eller konkret filnavn ble vist i kvitteringen. Implementeringsagenten identifiserer den syntetiske filen i Downloads og lager kopi i inputmappen.

Åpnet Import backup/data file og avbrøt native filvelger med Cancel uten å velge fil. Ingen importmelding eller dataendring ble observert. Fokus kom til vedlikeholdscontaineren, ikke en eksplisitt importknapp i tilgjengelighetstreet. Modalavbryt og tastatur skal undersøkes separat.

## DS-F1 – P2: Feilet filvalidering beholder umarkert grønn godkjenning

Manuell validering av baseline-backup.json ga igjen 24/24 tabeller og 1660 rader. Neste validering av invalid-backup.json (erklært ukjent backupformat) ga bare «Something went wrong. Try again». Forrige summary beholdt Fully compatible, format v1 og de samme tabelltallene. Oppsummeringen har ikke filnavn som skiller gammelt resultat fra den avviste filen.

Akseptanse: Vis konkret årsak og neste steg for ugyldig/ustøttet format. Fjern forrige oppsummering mens ny fil kontrolleres, eller merk kildefil/status så den ikke kan misforstås som godkjenning av ny fil. Ingen data må endres gjennom ren validering.

## Faktisk avbryt og tastatur

Importvalg av baseline-backup.json åpnet en egen modal før dataskriving. Den viste filnavn og at full import erstatter inventory, history, configured printers og maintenance data. Cancel hadde initialt fokus. Tab gikk til Import og deretter Close, uten å gå til bakgrunnskontroller. Escape lukket uten import.

Etter muse-/AX-initiert åpning kom fokus til vedlikeholdscontaineren. Dette er ikke alene et tastaturbrudd: Egen retest brukte Tab til importknappen, Return for filvelger, samme backupvalg og Return på dialogens fokuserte Cancel. Da ble fokus faktisk returnert til importknappen. Den rene tastaturflyten besto. Ingen full skjermleserprøve er gjort.

Implementeringsagentens kontroll etter validering og avbryt viste kontrollrull 800 g og identiske antall/digester i ti sentrale tabeller, med integritet OK og null fremmednøkkelfeil.

## DS-F2 – P2: Alle avviste importfiler gir samme generiske feil

Faktisk UI-import ble forsøkt med invalid-backup.json, malformed.json, wrong-document.json, empty.csv, inventory-invalid.csv (negativ vekt) og inventory-invalid-late-row.csv (gyldig første rad, deretter manglende material). Alle seks ga «Something went wrong. Try again.» og gjenaktiverte import/valideringsknappene. Ingen bekreftelsesdialog eller suksesskvittering ble vist for disse avviste filene. Den gamle Fully compatible-summary ble samtidig beholdt, som i DS-F1.

Akseptanse: Forklar forskjellen mellom tom fil, ødelagt JSON, ustøttet backupformat og ugyldig CSV-rad. Når tilgjengelig skal fil/rad/felt og praktisk retting være tydelig, uten å tvinge brukeren til å gjette eller bare prøve samme fil igjen. Behold eksisterende avvisning og transaksjonsbeskyttelse. Ikke bruk rå intern stack/SQL som løsning.

Den native filvelgerens «Open Finder item»-handling ble brukt på nøyaktig observerte syntetiske filnavn. Vanlige AX-klikk på filrad markerte ikke alltid raden i dette verktøyet; dette behandles som automasjonsbegrensning, ikke produktfeil.

## Faktisk CSV-import og rollback

Før gyldig import ble den eksisterende skrivebeskyttede `snapshot.mjs` kjørt til `evidence/critic-after-invalid-imports.json`. Filen er byte-identisk med baseline.json, inkludert antall og SHA256 for ti sentrale tabeller, kontrollrull 800 g og integritetsresultater. De seks avviste importforsøkene ga dermed ingen delvis lagring, heller ikke fixturen med gyldig første rad og feil i neste.

Gyldig inventory-valid.csv ga umiddelbart «Inventory import completed. Source: Inventory CSV. Rows: 2 (created 1, updated 1).» Gamle feil og validation-summary ble ryddet. Lager viste den nye «CSV ny kontrollrull» på 275 g og «IMPORT kontrollrull» oppdatert til 650 g. Detalj viste målt total 850 g og beholdt tare 200 g. Snapshot ble tatt i critic-after-valid-csv.json før ny import.

Gjentatt import av samme stabile ID-er ga created 0 / updated 2. Antall var fortsatt ti ruller og 1614 katalograder; begge kontrollvektene var uendret, og ingen andre av de åtte kontrollerte tabellene endret digest. Spool-/katalogdigest endret seg ved den nye oppdateringen, så dette omtales som ingen dupliserte ruller, ikke som byte-identisk database. Bevis: critic-after-repeat-csv.json.

Lager-CSV ble også eksportert gjennom UI og bekreftet med «Inventory CSV exported». Eksakt filnavn ble ikke vist. En mindre informasjonsmangel er at startsiden ikke forklarer at CSV/vanlig lager-JSON oppretter/oppdaterer ruller, mens full backup erstatter biblioteket. I den observerte CSV-flyten starter importen ved filvalg; kvitteringen etterpå er derimot presis. Dette er en forbedringsmulighet for forklaring før handling, ikke dokumentasjon på feil lagring.

## Faktisk full restore

Etter de dokumenterte CSV-endringene valgte jeg baseline-backup.json på nytt. Den samme tydelige erstatningsdialogen ble vist med Cancel som initialt fokus. Jeg bekreftet full restore kun i den isolerte testappen. UI ga «Full backup imported successfully. Rows: 1,660», og vedlikeholdstallene kom tilbake til 1613 katalograder og én manglende swatch etter vanlig innlasting.

Bevis i critic-after-restore.json viste kontrollrull tilbake på 800 g, ny CSV-rull borte, integritet OK og null fremmednøkkelfeil. Ni av ti kontrollerte tabeller var digest-identiske med baseline. En direkte sammenligning av de to låneradene viste eneste avvik: counterparty_name ble utfylt fra borrower_name («Sample maker space») der baseline hadde null. Alle øvrige lånefelt samsvarte. Dette er en legacy-normalisering, ikke et observert datatap; endelig kontraktsforklaring bekreftes av implementeringsagenten.

Faktisk etterkontroll i UI: Dashboard viste igjen 7 on-hand / 4 assigned. Lager viste 9 totale rader, kontrollrull 800 g og ingen CSV-nyrull. Printers viste de samme tre Bambu-slotene og én Prusa-kanal. Loans viste aktivt lån til Sample maker space på 640 g. Ingen stale CSV-kontrollverdi ble observert etter restore.

## Baselinekarakterer

Kriterier/vekter: oppgaveløsning 25 %, informasjon 20 %, navigasjon 15 %, tilbakemelding 15 %, visuelt 10 %, tilgjengelighet 10 %, robusthet 5 %.

| Hovedflyt | Oppgave | Informasjon | Navigasjon | Tilbakemelding | Visuelt | Tilgjengelighet | Robusthet | Vektet R1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Eksport og validering | 9 | 6 | 8 | 6 | 8 | 7 | 8 | 7,45 |
| Additiv lagerimport og kvittering | 9 | 7 | 8 | 9 | 8 | 7 | 9 | 8,15 |
| Full restore med konsekvens og avbryt | 9 | 8 | 8 | 9 | 8 | 8 | 8 | 8,40 |
| Ugyldige filer og recovery | 8 | 5 | 8 | 5 | 8 | 7 | 9 | 6,90 |

Restore-karakteren bygger på faktisk erstatning, kontrollert resultat og separat avbryt-/tastaturprøve, ikke bare en bekreftelsesdialog. Tilgjengelighet 8 der gjelder den avgrensede dialogflyten: trygg fokus, Tab-sløyfe, Escape og tilbakeført fokus ved tastaturstart. Dette er ingen full skjermlesergodkjenning. Øvrige områder har mer begrenset tilgjengelighetsdekning og står på 7.

Eksport/validering og feilfiler når ikke målet. DS-F1 sin umarkerte gamle godkjenning og DS-F2 sine handlingsfattige feil forklarer nedtrekket. Det er positivt at alle feilfilene ble atomisk avvist og etterfølgende gyldig import/restore fungerte uten omstart; dette gir høy robusthet, men kan ikke oppheve informasjonsproblemet.

## Neste retest og grenser

Runde 2 bør reteste gyldig → ugyldig validering, filidentitet og konkrete feil for tom CSV, ødelagt JSON, feil dokumenttype, ukjent fullbackupversjon og ugyldig rad. Kontroller at gamle sammendrag ikke feilaktig brukes for ny fil, og at gyldig import fortsatt kan gjøres etter feil. Gjenta målrettet avbryt/fokus dersom kontrollene endres. Selve restore trenger ny gjennomføring dersom rettelsen berører import-/restoregrenen; ellers kan den observerte karakteren videreføres med tydelig merking.

Mac-native utviklingsbygg og syntetiske filer er testet. Ingen produksjonsrestore, fysisk printer, Windows/Linux, full VoiceOver, svært store filer, prosesskrasj under transaksjon eller backup fra alle historiske versjoner er prøvd. Fullbackup med varsler om ekstra/manglende tabeller var ikke del av de leverte fixturefilene. Aktuelle datakontroller gjelder de ti navngitte tabellene; UI rapporterte 24 fullbackuptabeller, og dette er ikke automatisk en semantisk kontroll av samtlige 24.
