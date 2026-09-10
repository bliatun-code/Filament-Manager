# Printerspor: riktig rull og atomisk vektoppdatering

Utgangspunkt: `be184e9c` etter merge av PR #109. Dette er en avgrenset
rettelse av lasting, bytte, tømming og veiing i printervisningen.

## Funn og rettelse

Reproduksjoner med den ekte React-hooken i Chromium og simulerte Tauri-svar
viste to feil: En åpen vektkladd kunne brukes på feil rull etter at en
bakgrunnsoppdatering endret sporets innhold. Et avbrudd mellom separate
skrivekommandoer kunne dessuten etterlate registrert forbruk som ble gjentatt
ved nytt forsøk. Dette var kontrollerte UI-reproduksjoner, ikke native kjøringer.

Kladden beholder nå ID-en til rullen som var i sporet da dialogen ble åpnet.
Bekreftelse sender én atomisk operasjon med forventet rull og absolutte
målte totalvekter. Kjernen kontrollerer sporet på nytt i samme transaksjon
som vekt, forbruk, tilordning og historikk skrives. Feil gir ingen delvise
skrivinger. Ved veiing av samme rull brukes gjeldende databasevekt og tara;
tilordningen og RFID-/live-metadata beholdes. Identisk gjentakelse registrerer
ikke mer forbruk eller historikk.

En synkron lås hindrer samtidig innsending. Kladd, gamle handlingsreferanser
og utsatte svar avgrenses til samme Host, bibliotek, målgenerasjon og
dialogåpning, også ved A→B→A. En bekreftet skriving lukkes før oppfriskning;
lesefeil gjør den ikke til en ny innsending. En allerede sendt forespørsel
kan fortsatt fullføres på sitt opprinnelige mål.

Feil vises inne i vektdialogen, og en ny dialog tømmer gammel tilbakemelding.
De to nye meldingene for endret rull og eldre Host er oversatt i alle 21 språk
i desktop og Companion.

Client krever at Host annonserer `printer-slot-operations-v1`. En eldre Host
må oppgraderes for disse handlingene; Client faller ikke tilbake til separate
skrivekommandoer. Databaseskjema, backupformat, appversjon og publisert release
er uendret.

## Lokal verifisering

| Fokusert kontroll | Resultat |
| --- | --- |
| React-/Chromium-regresjoner for dialog og livssyklus | 19 bestått |
| Relaterte modell- og komponenttester | 25 bestått |
| TypeScript-transport og kommandodata | 13 bestått |
| Pakket desktop-scenario og bootstrap, enhetstester | 20 bestått |
| Atomiske printeroperasjoner i core | 8 bestått |
| Host-transport | 10 bestått |
| Health-/kapabilitetsannonsering | 1 bestått |

Core-testene bekrefter blant annet 500 g filament og 200 g tara målt til
600 g totalt: 400 g gjenstår og 100 g forbruk registreres én gang. Identisk
gjentakelse bevarer hele radinnholdet for jobber, vektavlesninger, historikk,
revisjoner og tilordning. Feil sent i historikkskrivingen ruller alt tilbake;
foreldede spor, ugyldige vekter og aktive utlån avvises.

Den eksisterende pakkede desktop-testen bruker nå den lokale atomiske
Tauri-kommandoen: last til returvekt +100 g, les begge vektfeltene tilbake,
vei samme rull til returvekten og gjenta målingen. Sluttkontrollen krever
100 g forbruk og én jobb, også etter omstart og gjenoppretting. De fire
appfasene, resultatfeltene og backuphash-protokollen er beholdt.

Hele Rust-workspacet bestod med 652 desktop-, 295 core-, 15
tjenesteannonserings- og 3 generatortester. Tre eksisterende tester er ignorert.
Clippy bestod i både dev- og releaseprofil. UI-bygg og lint, 1 719 UI-tester,
884 skripttester, 392 Companion-tester, 23 ytelsestester og begge
tilgjengelighetskontrollene er grønne.

En fersk optimalisert, lokalt ad-hoc-signert arm64-DMG bestod
LaunchServices-start, alle fire desktop-faser og separat Host/Client-flyt.
Den installerte appen bekreftet 100 g forbruk og én jobb etter den gjentatte
målingen, gjennom omstart og backup-gjenoppretting. Backupen inneholdt
1 643 rader; katalogjobben ble fjernet, batchjournalen bevart og den nøyaktige
legitimasjonsmarkøren gjenopprettet ved siste start. Host/Client bestod
offline-fasen, omstart, sesjonsfornyelse og opprydding av legitimasjon.
Dette er lokal arm64-installasjonstesting, uten notarisering eller historiske
oppgraderingsporter.

Språkkontrollen er kjørt på nytt mot de faktiske 21 kompilerte språkpakkene og
21 genererte Companion-modulene. 66 språkrelaterte kontrakttester, 26 desktop-
og 44 Companion-runtime-tester bestod, sammen med 84 oppslag av de nye
meldingene på begge flater. Oversetterkontekst er lagt til for begge meldingene,
og eksisterende terskler og baseline er uendret. Beviset i språkregisteret er
bundet til de nye kilde- og kataloghashene; dette er ikke en ny menneskelig
språk- eller visuell godkjenning.

Alle kontraktskontroller, public-readiness, bundlebudsjett og `doctor` er grønne
etter at språkbeviset og dokumentasjonen ble inkludert i den samlede endringen.

## CI og installerte pakker

[PR #110](https://github.com/bliatun-code/Filament-Manager/pull/110) bestod alle
åtte kontroller på `d85b4721023a68f0de9d010ff1b5dc2d92464637` i første samlede
CI-runde. [CI](https://github.com/bliatun-code/Filament-Manager/actions/runs/34427152784)
og [CodeQL](https://github.com/bliatun-code/Filament-Manager/actions/runs/34427152865)
er grønne. Kandidatens Git-tre er `da5bba8611ce7f3c6fa9847e8dfc0d56446152ea`.

Loggartefaktene fra både macOS og Windows er lastet ned og kontrollert:

| Kontroll | macOS DMG | Windows x64 MSI |
| --- | --- | --- |
| Atomisk lasting, måling og identisk gjentakelse | Bestått | Bestått |
| Nøyaktig 100 g forbruk og én jobb gjennom alle fire appfaser | Bestått | Bestått |
| Backup-gjenoppretting, også etter omstart | 1 643 rader | 1 643 rader |
| Katalogjobb fjernet, batchjournal og legitimasjonsmarkør kontrollert | Bestått | Bestått |
| Host/Client, sesjonsfornyelse og legitimasjonsopprydding | Bestått | Bestått |

Dette er ordinære debug-pakker fra PR-CI, med lokal ad-hoc-policy på Mac og
`UnsignedRequired` på Windows. Den optimaliserte lokale Mac-pakken er dokumentert
separat ovenfor. Ingen offentlig release eller tagg ble opprettet.
Resultatoppfølgingen committes lokalt og tas med i neste samlede push.

En separat [undersøkelse av utlånsdialogene](LOAN_DIALOG_AUDIT_2026-09-10.md)
ga konkrete reproduksjoner til neste kodejobb. Den endrer ikke printerkandidaten.
