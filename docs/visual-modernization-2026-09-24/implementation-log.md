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
