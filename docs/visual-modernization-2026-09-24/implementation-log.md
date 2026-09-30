# Visual modernization — implementation record

The independent critic's inventory and round reports are the approval authority.
An uninspected state is not approved. There is no preset iteration limit.

## Isolation and baseline

- Branch: `codex/visual-modernization`.
- Fresh committed synthetic fixture generated with `create-visual-qa-fixture.mjs`, copied with `prepareVisualQaDatabase`, then migrated by the current native build.
- Local working database: `tmp/visual-modernization/review.db`; 168 synthetic spools, including assigned, borrowed, loaned, empty and lost stock; 24 additional print jobs across twelve months. No production library copied or opened.
- Separate native identity `no.bliatun.filamentmanager.visualmodernization`; Companion restricted to loopback port 4285. Simulated printer observations have no host or credentials and cannot contact hardware.
- SQLite `quick_check`: ok; no foreign-key violations after enrichment.
- Initial UI build passed; 2,063 UI tests passed; Companion tests passed.
- Six main pages rendered using the repository's read-only fixture bridge in Light, Dark, Bambu, Prusa, Auto/light and Auto/dark: no automatically reported axe violations. This bridge is not native functionality evidence; gradient contrast produces incomplete results requiring separate analysis.
- White filament surface top at alpha .34 on RGB(13,21,39), with secondary text RGB(148,163,184), has a worst-case contrast of approximately 2.29:1. The .28 inset reaches only 2.85:1. A .10 overlay gives approximately 5.42:1. This confirms VM-F02 independently of axe's incomplete gradient scan.

## Design direction

Preserve recognizable navigation, useful density and all physical filament swatches. Use quieter tinted data surfaces with predictable text contrast, semantic theme colors for actions, and consistent surface depth across desktop and Companion. Bring dashboard metrics into the initial viewport, compress setup and task chrome, and keep mobile task forms reachable without unnecessary nested scrolling. Render estimates at a precision justified by their data.

## Evidence

Baseline captures, axe output and test logs are local under `tmp/visual-modernization/`. Reviewed, representative sanitized images will be copied into this report directory when changes stabilize. The critic records exact inspected surfaces, sizes, languages and themes separately; these test results do not imply full visual approval.

## First implementation package (awaiting round 2 verdict)

- Dashboard metrics now precede action/setup panels; pending setup groups share a compact responsive grid.
- Inventory and printer text surfaces use bounded tint (dark maximum alpha .10) while opaque swatches remain unchanged. A regression check covers every dark/brand base and the worst-case white gradient stop against secondary text.
- Filament actions use semantic theme colors. Companion's brand bottom navigation now consumes brand surface/selection tokens.
- Mobile stock-entry catalog height is bounded; catalog text no longer reserves the generic wide action column. Return metadata no longer repeats the counterparty, and return metrics use a compact readable scale.
- General settings remove nested presentation frames and avoid stretching the language card; immediate theme selection no longer inserts a layout-shifting banner.
- Forecast coverage uses approximate whole days/months/years and the depletion display reduces date precision as its horizon increases; numerical forecast calculations remain intact.
- Validation: UI build, native build, 2,065 UI tests, 401 Companion tests, ESLint, shared modal keyboard/zoom checks, CSS variable contracts and `git diff --check` passed. Thirty-six main-page theme scans reported no axe violations; gradient INCOMPLETE results remain explicitly outside that automated conclusion.
- Native bundle signed outside Documents in `/private/tmp/filament-modernization-20260924/` because the macOS File Provider reintroduces FinderInfo into workspace `.app` bundles. This changes only the isolated test executable location.

The critic's first retest confirms improved dashboard hierarchy and white-swatch readability, but records a new inconsistent setup counter (VM-F08) and further density/chart questions. These are open, not approved by this package.

### Runde 2 – supplerende verifikasjon og neste pakke

- Faktisk Companion-backend på separat syntetisk `edges.db`, port 4289: 64 rotvisninger (4 temaer × 320/390/834/1440 × lager/lån/printere/innstillinger), 64 oppgavevisninger (legg til/lån ut/retur/detalj), og 32 norske rotvisninger (390/834). Ingen horisontal dokumentoverflyt. Dette utelukker ikke lokal komprimering: kritikeren fant en nesten kollapset swatch ved lange navn.
- Axe fant ugyldig `aria-label` på dekorative bokstavmarkører i printerens fuktighetsskala. Oppgavevisningene rapporterte ingen automatiske brudd; uavklarte gradientkontraster regnes fortsatt ikke som godkjent AA.
- Companion normaliserer bare enkelt-HEX før visning, mens desktop støtter `multi(...)` og `gradient(...)`. Gyldige sammensatte testfarger ble grå: bekreftet produktfeil, ikke fixturefeil.
- Datagrunnlaget for neste runde er korrigert: 172 ruller, 1056 historikkhendelser med faktiske felt `grams`/`previous_grams`, gyldige lånedatoer og syntetisk observert/lagret RFID. Den forrige databasen og bildene beholdes som evidens.
- Neste endringspakke er forberedt separat mens kritikeren tar uendrede native-bilder. Ingen bilder godkjennes ved antakelse fra scenarionavn eller fra et annet tema.

### Runde 3–4 – faktiske rettinger og funksjonskontroll

Felles kontroller har tydeligere kanter, og native select bruker nå egen pil og `appearance: none`: macOS ignorerte minimumshøyden med den opprinnelige kontrolltegningen. Kritikeren bekreftet faktisk 40 px høyde i runde 4. Lagerets faner, antall og sekundærhandlinger er samlet; søk/status følger i samme arbeidsområde. Ønskelistens hovedhandling er flyttet til sideoverskriften, status/søk er samlet og mottaksantallet har synlig etikett. En duplisert hovedhandling som kritikeren fant i første runde-4-bilde, er rettet etterpå.

Dashboardets fremdriftsteller bruker samme grunnlag som oppgavelisten. Forbruksdiagrammet har merket y-akse og bedre tooltip-plass ved kantene. Generelt-innstillinger samler språk og utseende. Vedlikehold bruker roligere varselflater. Statistikken gjentar ikke rapportperioden i hvert tallkort. Detaljnavn brytes over linjer, og forbruksdiagram/historikk ligger i full bredde etter redigeringsfeltene.

Companion viser alle fargestopp i `multi(...)`/`gradient(...)`, bevarer en fast swatch-størrelse og flytter vekten under lange navn på små skjermer. Lyse datatint-overstyringer er redusert; handlingsfarger er semantiske. Den dekorative fuktighetsskalaen har ikke lenger ugyldige ARIA-navn. «Vis alle lån» beholdes når den kan tilbakestille søk/valg, men gjentas ikke ved en ufiltrert liste.

Verifikasjon:
- Runde-3 smoke passerte: bygg, lint, 402 Companion-tester, script-tester, modal/data-tilgjengelighet, lånedialoger, 2065 UI-tester, ytelse, kontrakter og doctor. Senere native minipakke: bygg, lint og 2065 UI-tester passerte; énlinjeretting for duplisert ønskelistehandling ble kontrollert med målrettede tester.
- Companion runde 3: 64 rotbilder + 64 oppgavebilder ved fire bredder, fire temaer; ingen automatiske AA-brudd eller horisontal dokumentoverflyt. Uavhengig bildeinspeksjon dokumenteres i kritikerens rapporter.
- Supplerende måling skjuler tekstfyll midlertidig (uten overganger), tar nettleserens faktisk tegnede bakgrunn og beregner tekstkontrast med opasitet. 16 Companion-rotvisninger ved 834 px, fire temaer, 22–56 synlige tekstnoder per visning: ingen under AA. Dette gjelder de målte tekstene, ikke uinspiserte underflater.
- Faktisk Companion E2E mot en ny generert database: opprettelse, gjenlasting/søk, tara, virtuell printerplassering og tømming, vektendring til 777 g, delvis varemottak (3→2), utlån og retur (900 g). Ni lagringskall returnerte 200; vedvarende data og hendelser ble kontrollert. Ingen reell printer ble kontaktet. Ni responsbilder er tilgjengelige for separat visuell inspeksjon.
- Kritikerens datasett har nå også 1032 syntetiske vektmålinger, i tillegg til gyldige lånedatoer, 172 ruller og befolket hendelseshistorikk.

Godkjenning gjenstår. Interaktiv native/Host/Client, systemtema, responsivitet og de øvrige tilstandene skal fortsatt dokumenteres uten å overføre karakterer fra uinspiserte flater.

### Runde 5 – smale vinduer, validering og diagrammenes datagrunnlag

Kritikeren kontrollerte faktisk native-app i et 856 px bredt vindu. Lagerets to hovedhandlinger deler nå en rad når tekstene får plass; kortene begynner omtrent 46 px tidligere. Språkbytte fjerner den overflødige bekreftelsen som brukte forrige språk. Temperaturenes etiketter har sterkere tekstkontrast i lyst tema. Companion Bambu/Prusa bruker samme merkegrunnlag også under filamentflatene; de faktiske swatch-fargene er bevart.

En ugyldig låneinnsending viste tidligere feilen over en lang rullvelger, utenfor synsfeltet. Feil for låntaker, vekt og dato står nå ved feltet, beskriver kontrollen med ARIA og flytter fokus og rulling til den. Ugyldig paringslenke får tilsvarende lokal tilbakemelding. Den misvisende «Maks tilgjengelig» i utlån er erstattet med faktisk registrert restvekt: en ny måling kan bevisst korrigere lagervekten, og er ikke begrenset av det gamle tallet.

Rulldetaljens og diagnostikkens diagrammer viser skala og begge ender av tidsintervallet. Bredden mellom målinger følger faktisk medgått tid. En enkelt måling tegnes på riktig vertikal verdi. Kompakt grafhøyde bevarer plass til forklaringer og øvrige detaljer.

Supplerende verifikasjon:
- 402 Companion-tester passerte. 16 nye Bambu/Prusa-rotbilder ved 390/834 px hadde ingen axe-brudd eller horisontal dokumentoverflyt. Måling mot faktisk tegnet bakgrunn passerte for synlige tekster i 16 Companion-rotflater, fire temaer.
- Desktop-måling etter etikettendringen passerte for synlige tekster på lager, utlån, printere, statistikk og innstillinger i fire temaer. Dashboard-utvalget viste bare lasting og er uttrykkelig utelatt fra den konklusjonen.
- Lånedialogenes seks regresjonsforløp passerte, inkludert ny kontroll av fokus, synlig feilmelding og manglende lagringskall ved ugyldig innsendelse i smalt vindu. To nye diagramtester kontrollerer ujevne tidsintervaller og korrekt enkeltpunkt.
- Kritikeren bekreftet grafens skala/tidsintervall og paringsfeltets lokale feil i kjørende native-app. Fullt oppdatert temamatrise og øvrige funksjonsgrenser gjenstår.
- Separate normale Host/Client-prosesser fullførte veiledet rollebytte med faktisk eksport og automatisk validering av syntetisk sikkerhetskopi. Bonjour-registrering feilet foreløpig med tidsavbrudd, også etter oppstart via Launch Services. Dette er et åpent testmiljøproblem; ingen vellykket paring påstås.

De ni automatiske E2E-responsbildenes tidsmerking viste seg å ligge foran senere UI-tilstander. Kritikerens rapport bruker derfor faktisk synlig innhold, ikke navn på HTTP-kallet. Egen oppfølgingskjøring bekreftet «Qty 2» etter delvis mottak og opprettet et nytt aktivt lån, ventet på de synlige radene og tok egne bilder. Funksjonell databaseverifikasjon fra første kjøring står separat fra bildebeviset.

Hele smoke-pakken etter runde-5-rettingene passerte: bygg, lint, Companion, scripts, tilgjengelighet, lånedialoger, 2067 UI-tester, ytelse, kontrakter og doctor. Rust-portene kjører separat. Første forsøk avdekket en foreldreløs preferansemodul etter fjerning av språk-toast; temavelgeren gjenbruker nå modulens eksisterende tematekster, og den fulle kontraktkontrollen passerte etterpå.

### Runde 6 – synlig eksportresultat i aktive dialoger

Kritikeren lagret en PNG-etikett fra native-dialogen, fant filen, men så ingen bekreftelse i dialogen. Etikettens lagringshandling returnerer nå det faktiske resultatet til den åpne dialogen. Den viser lokal suksess eller feil, knyttet til den eksporterte etikettutformingen. Tilsvarende beholder PDF-arket en synlig feil ved mislykket eksport, slik at forhåndsvisningen kan brukes til et eksplisitt nytt forsøk.

Bygg, lint, 39 målrettede etikett-/verktøytester og 23 arkeksporttester passerte. Arkeksportens feiltest kontrollerer nå også at meldingen faktisk finnes som et alert-element inne i dialogen. Native kontroll av PNG-bekreftelsen gjenstår etter siste HMR-oppdatering.

32 oppdaterte Companion-oppgavebilder i Bambu/Prusa ved 320/390/834/1440 px: ingen axe-brudd, opptaksfeil eller horisontal dokumentoverflyt. Kritikeren har separat inspisert de to bildene som viser et nytt aktivt lån og restmengde 2 etter delvis mottak.

### Companion-oppfølging etter runde 6

Nye 320 px-bilder bekreftet at «Borrowed-in» ble brutt over flere linjer, og at et langt rullnavn ble gjentatt i både fast dialogoverskrift og innhold. Eierskapsknappene fordeler nå plassen etter tekstbehov, med minst 44 px høyde. Dialogens fulle tilgjengelige navn er bevart, mens det synlige, lange navnet står én gang sammen med swatch og metadata. «Spool» og «Done» deler en kompakt rad. Ved 320 px er nå begge vektlagringshandlingene synlige i det kontrollerte eksemplet.

Companion-innstillingene bruker én kolonne på mobil, utseende til venstre og tilkobling/lisens til høyre ved mellomstor bredde, og tre kolonner på store skjermer. Dette fjerner det kunstig høye, nesten tomme tilkoblingskortet.

402 Companion-tester passerte etter siste justering. 32 nye Add/Detail-bilder dekker fire temaer og fire bredder; 16 norske bilder dekker fire temaer ved 320/390 px. Ingen axe-brudd eller horisontal dokumentoverflyt. Uavhengig vurdering av de siste bildene pågår.

Hele Rust-porten passerte: `cargo test` (plattformspesifikke ignorerte tester forblir oppgitt som ignorert), formatering samt Clippy i debug og release med advarsler som feil. Diagnostikkens syntetiske datakilde oppdaterer nå også printerrevisjonen, slik at vanlig 15-sekunders polling faktisk henter nye målinger. Kritikeren har sett en befolket graf i native-app. Matrisehjelperen bruker samme mekanisme på hver genererte databasekopi; ingen printertransport eller produktkode ble lagt til for dette.

### Runde 9 – Companion-feil i aktive skjemaer

Faktisk innsending av tom låntaker og et avbrutt lagringskall viste at feilen bare ble tegnet bak den modale oppgaven. Kritikeren bekreftet begge bildene uavhengig. Den felles dialogoverskriften viser nå oppgavens status over det rullbare innholdet. Meldingen bruker eksisterende temafarger og skjermleserannonsering. Konteksten følger den aktive oppgaven; gjenåpning får ikke med seg en gammel oppgavefeil.

16 nye bilder dekker de to feiltilstandene i fire temaer ved 390/834 px, uten axe-brudd. Utfylt låntaker beholdes ved nettverksfeil. POST-kallene ble avbrutt i testnettleseren før backend; ingen lån ble opprettet i denne feiltesten. En innledende opptaksversjon ventet på lagerrader etter sidegjenlasting til en lagret lånevisning; den ferdige kjøringen bruker ordinær navigasjon mellom scenariene.

En tilsvarende detaljtest fant at innskrevet vekt 321 g ble tilbakestilt til tidligere 525 g ved mislykket lagring. Felles bevaring av endrede felt hoppet over kontroller som var midlertidig deaktivert under venting. Verdiene bevares nå også da; deaktiverte kontroller får fortsatt ikke fokus. Nye tester dekker både dialogens feilplassering/oppgaveavgrensning og feltets venting→feil→lagret-forløp. Alle 404 Companion-tester passerte. Faktisk retur-/detaljretest og kritikerens resterende temakontroller pågår.

Retur og detalj er deretter kontrollert i 16 faktiske feilbilder: fire temaer × 390/834 px, ingen axe-brudd, alle innskrevne 321 g bevart. En egen Dark390-sekvens gjentok feil→prøv igjen: faktisk HTTP 200 og SQLite 321 g, deretter gjenoppretting av opprinnelige 525 g gjennom samme UI og HTTP 200/SQLite 525 g. Dette gjelder bare syntetisk `visual_edge_3` i `edges-r3.db`. To egne bilder viser ferdig lagring og gjenoppretting; kritikerens individuelle inspeksjon står separat.

### Runde 10 – native kontroller og gjenopprettet serverstatus

Etter at alle 204 native-bilder var tatt uten kildeendringer, ble batchens små native select-kontroller erstattet med felles lagerkontroll. Massehandlingers to select-felt bruker samme stil, pil, minimumshøyde, temafarger og fokusmarkering.

Bibliotekets eksisterende klientpoll henter nå også runtime-status. Den oppdaterer visningen uten å synkronisere nettverksutkast. En faktisk frontend-regresjon gjennom fixturebroen viste før rettingen at runtime ble frisk, men paring forble deaktivert etter 6,5 sekunder; bare remount hjalp. Etter rettingen aktiveres paring automatisk, mens et ulagret portutkast på 4499 består. Reproduserbar kontroll: `node docs/visual-modernization-2026-09-24/verify-runtime-recovery.mjs` med review-fixture og Vite på 5173. Dette er frontendbevis, ikke erstatning for ekte paring.

Kritikeren har deretter opprettet faktisk lenke/QR i normal Host og paret normal Client, med «Paired», korrekt vertnavn og «Host is reachable». Den tidligere Bonjour-feilen regnes derfor ikke som en fortsatt blocker. Autoritet, frakobling, gjenoppretting og revoke kontrolleres separat.

Hele smoke-pakken passerte etter endringene: bygg, lint, 404 Companion-tester, 896 script-tester, tilgjengelighet, lånedialoger, 2067 UI-tester, ytelse, kontrakter og doctor. 22 målrettede eksisterende tester passerte også. Ingen Rust-logikk er endret siden den tidligere komplette Rust-porten.

Companion fikk i tillegg 32 komplette tastatursykluser: fire temaer × 320/834 px × Add/Lend/Return/Detail. Detaljseksjoner ble åpnet med Enter. Henholdsvis 26/5/4/21 fokusstopp ble traversert uten skjulte/navnløse mål eller flukt fra dialogen; Shift+Tab nådde siste kontroll og Escape returnerte synlig fokus. Siste-fokusbilder og besøkslogger er tilgjengelige for uavhengig inspeksjon. 16 norske feilbilder ved 320/390 px hadde ingen axe-brudd. Disse kontrollene gir ikke alene full produktgodkjenning.

### Runde 11 – tettere ønskeliste, reparasjon av paring og Companion-fokus

Ønskelistekort deler nå status og mengdehandlinger på samme rad når det er plass. Ved 856 px viser fixturebroen to hele kort i alle fire temaer, både norsk og engelsk; alle åtte opptak hadde ingen axe-brudd eller horisontal overflyt. Native kontroll står separat.

Tilbakekalt desktop-paring ble korrekt avvist, men vektfeilen var generisk. Det eksakte, kjente legacy-svaret for ugyldig paring oversettes nå til eksisterende lokalisert reparasjonsbeskjed med stien Innstillinger → Bibliotek og webapp. Andre ukjente feil forblir kontrollert fallback. Målrettede tester verifiserer at 955 g-utkastet beholdes og at ingen lokal skriving skjer.

Companion viste både en midlertidig og en vedvarende lagringsbekreftelse samtidig. Én vedvarende bekreftelse vises nå i dialogens faste topp, også etter at den midlertidige statusen utløper. Faktisk feil→nytt forsøk lagret 321 g og gjenopprettet 525 g gjennom UI, HTTP 200 og separat SQLite-kontroll.

Kritikeren fant strukket vektlogg ved 834 px og klippet fokus ved retur på 320 px. Historikkolonnene bruker nå naturlig innholdshøyde. Felles fokusregel gir 8 px rullemargin, slik at nettleseren kan vise hele ringen. Nye tastaturopptak åpner bare lukkede detaljseksjoner og venter på overgang mellom fokusstopp. Alle 405 Companion-tester passerte med repoets testkjører. Direkte kjøring av testfilene uten repoets locale-bootstrap feilet og regnes ikke som en produktregresjon; den korrekte standardkommandoen passerte.

### Runde 12 – kontrollerbart utvalg før masseendringer

Faktisk native-kontroll bekreftet at utvalg beholdes over søk, at aktive lån beskyttes og at Lost→In stock beholder registrert vekt. Bekreftelsen viste imidlertid bare antall når en valgt rull var skjult av filteret. Den viser nå alle faktisk berørte ruller med filamentnavn, referanse og opprinnelig swatch. Listen henter fra hele lageret, har begrenset høyde og kan rulles med tastatur. Handlingsknappene bruker samme solide primærvariant som øvrige lagerhandlinger.

Bygg, lint og 56 målrettede bulk-tester passerte, inkludert to nye forløp som bekrefter at filtrerte ruller fortsatt navngis uten at en backend-kommando sendes. Kritikerens native retest pågår; disse testene erstatter ikke visuell godkjenning.

### Runde 13 – første tastaturfokus og kjent tilbakekalt paring

En direkte Shift+Tab fra lukkeknappen avslørte en forskjell fra den tidligere komplette tastatursyklusen: fokusfellen brukte `preventScroll`, slik at siste kontroll kunne bli stående utenfor det synlige området ved første besøk. Tastaturens ombryting lar nå nettleseren rulle frem målet. Rullemarginen gjelder før fokus flyttes, og summary-kontroller bruker samme tematilpassede ring. Renderrestaurering bevarer derimot rulleposisjonen. Et senere detaljforløp fant at nytegning erstattet den rullbare kroppen og kunne skjule det fokuserte feltet. Rulleposisjonen bevares nå innen samme oppgave, men overføres ikke til en annen rull/oppgave.

16 direkte-fokusbilder viser begge sider av ringen ved Lend/Return i fire temaer, 320/834 px. Kontrast målt i skjermbildets faktiske piksler er minst 6,3:1, også ved nederste scrollkant. Åtte nye detaljforløp i fire temaer ved 320/834 px traverserte alle 21 fokusstopp. 406 Companion-tester passerte. Kritikeren lukket separat de tidligere funnene for dobbelt suksessbudskap, strukket History834 og klippet Return320-ring etter individuell bildeinspeksjon.

Kjent manglende klientparing stoppes av frontend før en ny backend-feil. Denne grenen fikk derfor samme lokaliserte Settings → Library-veiledning i sperren og varselbanneret. 79 målrettede tester passerte, inkludert virkelig rendret sperre med 955 g bevart og null backend-kall. Kritikeren bekreftet lokal veiledning i native Client, uendret vertsvekt 800 g og bevart utkast.

En mistenkt CSV-aksept viste seg å være et annet filvalg: SQLite identifiserte raden fra den gyldige filen. Korrekt valgt fil med tomt materialfelt på rad 2 ble avvist i native-app. En ny in-memory Rust-regresjon bekrefter at den gyldige første radens 525→500-endring rulles tilbake og at den ugyldige andre raden aldri opprettes. Ingen importlogikk ble endret. Fersk UI-sikkerhetskopi ble gjenopprettet og databaseinnholdet kontrollert separat av kritikeren.

### Runde 14 – synlige filresultater og lesbar Companion-ønskeliste

Native importfeil lå tidligere bare øverst på en lang innstillingsside. Backup/import/validering/eksport viser nå en lokal, vedvarende tilbakemelding ved filhandlingene. Feil får fokus og rulles frem; nytt filarbeid erstatter forrige resultat. Fullbackup og supportnedlasting bruker den eksisterende primærknappen. 44 backup-regresjonstester passerte, inkludert at et feilresultat 1400 px utenfor utsnittet faktisk blir fokusert og synlig. Bygg og lint passerte. Kritikeren bekreftet rettet native Dark856-feil med korrekt filnavn, synlig Import/Validate og hvit primærknapp.

Åtte supplerende frontendbilder viser samme feil i fire temaer på norsk/engelsk, 856×750, uten axe-brudd. De bruker en eksplisitt syntetisk kommandofeil, og erstatter ikke native-backendbevis. 24 andre frontendbilder ved 856×550 dekker seks familier i fire temaer på norsk. Ingen dokumentoverflyt eller axe-brudd, men `color-contrast` er fortsatt maskinelt INCOMPLETE. Dette er et begrenset innholdsutsnitt i Chromium, ikke faktisk 200 % nettleserzoom eller native WebKit. En innledende feilkonfigurert QA-kjøring ga bare Dark og er ikke temadekning.

Kritikeren fant at Companion-ønskelistens disclosure presset tittel og hjelpetekst inn i to svært smale kolonner ved 320 px. Registreringsseksjonenes disclosure viser nå tittel og pil øverst og hjelpeteksten i full bredde under. Nye EN/NB-opptak og individuell retest pågår.

Full smoke etter commit 70801258 passerte: bygg/lint, 405 Companion, 896 scripts, AppModal/data-tilgjengelighet, lånedialoger, 2071 UI-tester, 23 ytelsestester, kontrakter og doctor. De senere rettingene ovenfor har målrettede tester; en avsluttende samlet port gjenstår når neste vurdering er stabil.

### Runde 15 – vekt før etikettmetadata, og lokal PDF-feil

Native rulldetaljer viser vekt og vedlikehold før QR/metadata i smale vinduer. DOM-rekkefølgen følger oppgaven; ved bredde fra 900 px beholder skjema og metadata sine høyre/venstre kolonner. Feil og lagringskvittering står over begge kolonnene.

Etikettforhåndsvisning som mangler stabil Companion-adresse beholder dialogen og forklarer forutsetningen samt hvor den endres. Den viser ikke et falskt tomt lagerark. Feil står øverst også ved lagring, mens en allerede generert forhåndsvisning beholdes. Papirvalg og hovedhandling bruker felles temakontroller.

Verifikasjon: 35 målrettede etikett-/detaljtester passerte, UI-bygg passerte. Åtte NB-visninger ved 856×550 i Chromium med eksplisitt fixturebro hadde ingen axe-brudd eller horisontal dokumentoverflyt. Alle åtte er individuelt inspisert: vekt synlig også med varsel, etikettfeil lesbar i alle fire temaer. Dette er supplerende reflowbevis, ikke native WebKit eller faktisk 200 % zoom; axe har fortsatt ufullstendige kontrastkontroller. Bunnluft ved feilmeldingen ble rettet etter denne bildeserien.

Kritikeren lagret faktisk både A4 og US Letter fra den isolerte Host-appen, 156 etiketter fordelt på seks sider per format. Alle tolv eksporterte PDF-sider er rendret og individuelt inspisert: regelmessige marger, ingen overlapping eller sideklipping, siste side har seks etiketter. Svært lange produktnavn får ellipsis, mens fargenavn og referanse beholdes. PDF-filer og QR-bilder beholdes lokalt som testbevis; de publiseres ikke i programgalleriet. Dette er visuell eksportkontroll, ikke en fysisk utskrifts-/skanningstest.

R14 full smoke fullførte grønt. Uavhengig sluttgodkjenning og resterende native funksjons-/temadekning føres fortsatt av kritikeren; disse delresultatene erstatter ikke den.

R15 etterkontroll fant ytterligere to konkrete avvik: Dark-slidersporet var cyan og manglet synlig tastaturfokus, og valgt papirformats hjelpetekst var for lys på hvitt. Native aksentkontroller i Dark bruker nå hvitt, felles `app-control-focus` overstyrer `outline-none` med tydelig lys ring, og valgt papirhint arver valgt tekstfarge. Kritikeren bekreftet begge faktiske native retester. Den generelle A-familien er fortsatt ikke sluttgodkjent på dette grunnlaget alene.

### Runde 16 – kompakte batchkvitteringer og prisgrupper

En faktisk vellykket batch viste en nesten tom helhøy dialog. Resultatdialogen bruker nå innholdstilpasset høyde, mens større resultatlister ruller med handlingsfoten tilgjengelig. Ny rendret regresjon dekker kort kvittering og femti rader ved 600×400: siste rad nås med fokus, åpner korrekt rull-ID og handlingsfoten holder seg i vinduet. Alle elleve batch-livssyklustester i denne pakken passerte.

Kritikeren fant også standard macOS-blå radio-/avkrysningskontroller og en løs pilrad i native prisgrupper. Kontrollene bruker nå felles tema og fokus; de to nivåene av åpnbare grupper har pil og tittel på samme rad. Hvit Dark-aksent omfatter også Auto når systemet er mørkt. Uavhengig retest av prisflyten pågår.

Programgalleriet har foreløpig seksten oppdaterte bilder: syv native hovedflater og ni ferske Companion-visninger. Hvert valgt bilde er individuelt kontrollert for layout og synlige opplysninger. Ny manifest fører opptaksdato per bilde slik eldre bilder ikke fremstilles som oppdaterte. Ingen pare-QR, privat LAN-adresse, serienummer eller fullt RFID-ID er med i disse nye bildene.

### Runde 17 – synlig og identifiserbar priskvittering

Etter faktisk prisoppdatering havnet kvitteringen nedenfor elleve grupper. Statusfeltet får nå fokus og rulles inn når et nytt resultat kommer. Både oppdaterte og hoppede rader viser rullreferansen, slik like produktnavn ikke skjuler hvilke ruller som ble behandlet. Rendret regresjon med 1800 px høy gruppe krever fokus og synlig kvittering allerede før etterfølgende oppdatering er fullført. Eksisterende og utvidede tester: 20 pass; lint uten feil eller advarsler.

R15 bred verifikasjon: 406 Companion-, 896 script-, 2073 UI- og 23 ytelsestester passerte, samt tilgjengelighets-/låneportene. Public-readiness stoppet først på den nye, ennå ustagede gallerimanifesten; etter staging passerte hele kontraktspakken og doctor. Runde 16/17 har i tillegg målrettede tester og bygg; sluttkjøring gjentas når produktendringene er stabile.

Seks supplerende Chromium-bilder av faktisk native-komponent-CSS er individuelt inspisert ved 856×650: Light/Dark/Bambu/Prusa samt Auto med mørkt og lyst systemtema. Sliderspor følger tema, og alle har synlig hel 2 px fokusring. Dette er eksplisitt fixturebro-bevis, ikke WebKit-kontroll.
