# Import og full gjenoppretting: UI- og datakontroll

Oppfølging av den brede UI-vurderingen og Host/Client-rundene i PR #132.
Denne avgrensningen dekker eksport, validering, lagerimport, full gjenoppretting,
avbrudd og korrigert forsøk etter ugyldig fil. Karakterene er en uavhengig
agents ekspertvurdering av observerte oppgaver, ikke målinger fra sluttbrukere.

## Miljø og metode

- Egen signert native macOS-utviklingsapp, separat appidentitet og isolert
  Standalone-database. Ingen produksjonsdata, reelle printere eller globale
  sikkerhets-/nettverksinnstillinger ble endret.
- Befolkede syntetiske data: 9 ruller, 1613 katalograder, 2 printere, 4 AMS-enheter,
  11 slot-rader, 2 utlån, 9 historikkrader, 1 utskriftsjobb, 2 ønskelisterader og
  2 lokasjoner. Dashboard viser 7 tilgjengelige ruller og 4 tildelte; alle
  statusene inngår i de 9 lagrede rullene.
- Full backup ble faktisk eksportert gjennom UI og brukt ved gjenoppretting.
  UI rapporterte 24/24 tabeller og 1660 rader. CSV importerer en ny rull og
  oppdaterer en eksisterende kontrollrull med stabil ID.
- Kritikeren brukte appens vanlige filvelger, knapper og dialoger. Produktkoden
  var fryst under hver runde. Implementeringsagenten rettet funn mellom rundene.
- Skrivebeskyttede SQLite-kontroller sammenlignet antall og SHA256 av kanonisk
  sorterte rader i de ti tabellene ovenfor, kontrollvekter, `quick_check` og
  fremmednøkler. [Evidens](data-import-review-2026-09-20/evidence/README.md) inneholder
  resultater fra den syntetiske databasen, ikke eksport av bibliotekinnholdet.

Kriterier/vekter: oppgaveløsning 25 %, informasjon 20 %, navigasjon 15 %,
tilbakemelding 15 %, visuelt 10 %, tilgjengelighet 10 % og robusthet 5 %.
Målet var minst 8/10 for hver av fire observerte hovedflyter, innen fire runder.

## Funn og rettelser

**DS-F1:** Etter vellykket validering og deretter avvisning av en annen fil ble
forrige «Fully compatible»-oppsummering beholdt uten filidentitet. Oppsummeringen
fjernes nå når en ny valgt fil begynner å behandles, både ved validering og import.
Godkjent oppsummering viser filnavnet, også ved automatisk validering av en
nyeksportert full backup. Avbrutt filvelger starter ingen behandling.

**DS-F2:** Tom CSV, ødelagt JSON, uvedkommende dokument, ustøttet backupversjon og
ugyldige lagerrader ga alle samme interne standardfeil. Forventede parser- og
valideringsfeil har nå egne stabile feilkoder. Meldingen viser valgt filnavn og
konkret veiledning: velg en fil med data, eksporter/last ned på nytt, bruk en støttet
full backup eller kontroller lagerformat, obligatoriske felt og ikke-negative
heltallsvekter. Rå parser-, dokument- og SQL-detaljer sendes ikke til UI.
Faktiske databasefeil beholder behandlingen som intern feil.

Før import forklarer siden at lager-CSV/JSON oppretter eller oppdaterer ruller
med samme ID, mens full backup erstatter biblioteket etter bekreftelse. Den
anbefaler å eksportere en full backup først for å kunne gjenopprette.
Alle seks nye tekster finnes i de 21 desktopkatalogene. Dette er teknisk
lokaliserings-QA; ingen ny morsmåls-/oversettergodkjenning er påstått.

## Observerte dataresultater

Runde 1 etablerte følgende gjennom faktiske handlinger:

- Validering, avbrutt gjenoppretting og seks avviste filer beholdt identiske
  digester i alle ti kontrollerte tabeller. Ingen delvis import ble lagret.
- Negativ vekt ble avvist før skriving. En separat fil med gyldig første rad
  og manglende materiale i neste rad prøvde transaksjonens rollback etter at
  importløkken var startet. Disse er forskjellige bevis, ikke samme test.
- Gyldig CSV ga 1 ny / 1 oppdatert rull: kontrollrull 800 → 650 g og ny rull
  275 g. Begge beholdt 200 g tare. Antall ble 10 ruller / 1614 katalograder.
- Samme CSV på nytt ga 0 nye / 2 oppdaterte, samme antall og vekter. Ingen
  duplikater; oppdateringstidspunkter gjør at dette ikke er byte-identisk import.
- Full gjenoppretting fjernet den nye rullen og satte kontrollrullen tilbake
  til 800 g. De samme tildelingene og aktivt lån på 640 g var synlige i UI.
- Ni av ti tabeller var identiske med opprinnelig baseline etter gjenoppretting.
  Utlån fikk kun `counterparty_name` utfylt fra eksisterende `borrower_name`.
  Dette er den eksisterende legacy-normaliseringen i
  `database_backup_import.rs` → `ensure_borrowed_in_schema` i
  `database_borrowed_schema.rs`, utført før commit. Ingen øvrige lånefelt avvek.
- Alle kontrollpunkter hadde integritet OK og ingen fremmednøkkelfeil.

## Vurderingsrunder

| Hovedflyt | Runde 1 | Runde 2 |
|---|---:|---:|
| Eksport og validering | 7,45 | 8,50 |
| Lagerimport og kvittering | 8,15 | 8,35 |
| Full gjenoppretting og avbryt | 8,40 | 8,45 |
| Ugyldige filer og nytt forsøk | 6,90 | 8,00 |

Alle fire observerte hovedflyter nådde målet etter to runder. Se
[runde 1](data-import-review-2026-09-20/round-1.md) og
[runde 2](data-import-review-2026-09-20/round-2.md) for rå observasjoner,
kriteriescorer og konkret retestdekning. Eksporthandlingen videreføres fra R1;
filidentitet og validering er retestet. Import, feilfiler og restore ble prøvd på nytt.

R2 bekreftet at seks avviste filer og tastaturavbryt lot alle ti tabeller være
identiske med R2-start. Gyldig CSV etter feil ga igjen 650/275 g og 10 ruller.
Faktisk full gjenoppretting ga deretter identiske digester og kontrollverdier med
R2-start i alle ti tabeller, integritet OK og null fremmednøkkelfeil. R2 startet
med allerede normaliserte lånenavn, som forklarer eksakt samsvar denne gangen.

Kritikeren anbefalte ingen ekstra runde for de mindre restpunktene. Testappen
og Vite-prosessen ble stoppet etter vurderingen. Den identifiserte syntetiske
lager-CSV-eksporten ble flyttet fra Downloads til ignorert testmappe; fullbackupen
var allerede identifisert med testbibliotekets ID og flyttet dit.

## Dekning og begrensninger

Mac-native utviklingsbygg og syntetiske data er brukt. Dette er ikke en test av
produksjonsrestore, fysisk printer, Windows/Linux, prosesskrasj under transaksjon,
svært store filer eller samtlige historiske backupversjoner. Ekstra/manglende
valgfrie tabeller var ikke prøvd manuelt. De ti kontrollerte tabelldigestene er
ikke en semantisk gjennomgang av alle 24 fullbackuptabeller.

Tastaturprøven dekker trygg initial fokus på Avbryt, Tab inne i dialogen, Escape
og tilbakeført fokus når import startes med tastatur. Automatisk axe og denne
avgrensede prøven er ingen full VoiceOver-godkjenning. Ugyldige lagerdata får
veiledning om format/felt/vekter, men meldingen markerer ikke den konkrete raden
eller cellen i filen. CSV-suksesskvitteringen viser format og antall, men ikke
filnavnet. Gyldig lager-JSON som egen importflyt er heller ikke manuelt prøvd.

## Automatisk verifikasjon

- UI-produksjonsbygg og ESLint besto. 2058 UI-tester besto, inkludert 35
  browser-scenarier for import, bekreftelse, avbryt, filbytte, scopebytte og ny
  validering. To nye regresjoner feilet før rettelsen og besto etterpå.
- 315 core-tester og 3 kontraktgenerator-tester besto i full core-kjøring.
  En påfølgende ny målrettet test av backup-feilkoder besto (316 core-tester
  samlet). Fire native feilenvelope-tester besto, inkludert at private
  dokument-/parserdetaljer ikke slipper ut i meldingene.
- 401 Companion-tester, 896 skripttester og 23 ytelsestester besto.
- Modaltilgjengelighet og seks datadrevne hovedsider besto automatisk axe.
- Prosjektkontrakter, lokaliseringsnøkler, UI-tekst, bundlegrenser og doctor
  besto. Teknisk lokaliserings-QA er bundet til de nye katalogenes fingerprint.
- Rust-format og core Clippy med advarsler som feil besto.

Kontrollene ble kjørt som separate komponenter, ikke rapportert som en ny
samlet `npm run smoke`-kjøring. CI-status må leses fra PR-ens siste commit.
