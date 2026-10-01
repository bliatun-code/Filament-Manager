# Aktuell kritikerledger — sluttføring 1. oktober 2026

Uavhengig kritiker: `visual_critic_final`. Denne filen avløser den historiske
restlisten som aktuell arbeidsstatus; den endrer ikke tidligere observasjoner.
Sluttgodkjenning gjelder produktkode **05a05d0f**. Native batch, pris, re-pair og
siste mekanismepakke er ferdige. 61 native matrixbilder, 174 aktuelle browserbilder
og 24 korrigerte 200 %-vindusbilder er individuelt inspisert, i tillegg til
interaktive native bevis.
Tabellene nedenfor er den opprinnelige kontrollplanen; aktuell beslutning står i
sluttmatrisen og critic-final-inspection.md. Den endelige matrisen supersederer innledende IE-status.

## Oppdatert kritikerføring

- Filamentenes faktiske swatcher, flerfargeinformasjon og de gjenopprettede sterke
  filament-/printerkortfargene er en verdsatt del av produktidentiteten. Bevar dem.
- Generell nedtoning er ikke et godkjenningskrav. Eventuell målt utilstrekkelig
  kontrast løses lokalt med lesbare tekstfelt, bakgrunn eller tekstfarge uten å
  redusere swatchenes informative verdi. Skill subjektive forslag fra reelle feil.
- Gjenbruk konkret tidligere inspeksjon for forhold som fortsatt er uendret.
  Tauri 2.12, fargerestaureringen og tittellinjefiksen krever fersk delta-kontroll.
- De ti opprinnelige kriteriene og karakterankrene gjelder uendret. Hvert relevant
  kriterium må nå minst 9. IE er manglende evidens, aldri en skjult 9 eller 8.
- Faktisk native WebKit, systemdialog og vert/klient er egne bevisflater.
  Chromium-fixturebro og automatiske tester er støtte, ikke native-erstatning.
- Produktkode fryses under hver inspeksjonsrunde. Bare syntetiske isolerte
  biblioteker; ingen produksjonsdata eller ekte printerkommandoer.

## Reconciliert status for tidligere konkrete funn

| Familie / tidligere forhold | Aktuell status før fersk kontroll |
|---|---|
| Bulk-review med skjult/lang identitet og cyan hovedhandling | Lukket i faktisk Dark856 retest, R13-notat i round-10-bulk. Andre temaer og stor liste er evidenshull. |
| Ønskeliste komprimert ved 856 | Lukket i faktisk Dark856 R11. Andre temaer/NB/keyboard er evidenshull. |
| Gradientdetalj med vekt under QR | Lukket i faktisk Dark856 R15. Andre temaer/native smal utforming er evidenshull. |
| Detaljslider uten fokus / inkonsistent aksent | Lukket i faktisk Dark856 R15. Seks R17 frontendtema-bilder er støtte; bred tilgjengelighet er fortsatt IE. |
| Companion duplisert suksess, strukket historikk, klippet returfokus | Individuelt inspisert og lukket i R12–14, dokumentert i round-12-companion-focus. Ingen gjenåpning uten ny regresjon. |
| Companion Add320 disclosure | Lukket i 16 EN/NB R14-bilder. Ny AA-/zoom-/Auto-kontroll er evidenshull. |
| Import-/restorefeil utenfor aktivt utsnitt | Faktisk Dark856 retest lukket R13; fresh backup/import/restore med dataasserts utført. Andre temaer/fokus er evidenshull. |
| Etikett valgt papirhint | Implementeringsloggen oppgir faktisk native retest som lukker kontrastfeilen. PDF A4/Letter 12 sider tidligere individuelt kontrollert. |
| Native batchkvittering altfor høy | Rettet R16, men mangler uavhengig faktisk native retest. Retestbehov, ikke påvist feil i dagens kode. |
| Priskvittering langt unna handling / like navn uten referanse | Rettet R17; lokalt Dark856-bilde finnes, men fersk inspeksjon/øvrige temaer gjenstår. Retestbehov. |
| Endelig pris-overwrite dialog | Identiteter, update/skip og Cancel-/returfokus rettet i leveranse 30.09. Ingen uavhengig native sluttkontroll ennå. |
| Revokert klient generisk feil | Re-pair-veiledning implementert; faktisk refusal tidligere verifisert. Retest veiledning og gjennomført ny paring gjenstår. |
| Restaurerte sterke filament-/printertoner | Nye AA- og leseprøver kreves; muted-kontrastmålinger gjenbrukes ikke på disse bakgrunnene. Ingen subjektiv stilfeil føres. |
| Native tittellinje i mørk modus | Commit d57a97ed oppgir fix; uavhengig eksplisitt/Auto bytte og native titlebar retest gjenstår. |

## Full produktdekning og minste sluttkontroll

Alle 51 native D-scenarier har tidligere R6 breddeinspeksjon i Light, Dark,
Bambu og Prusa. Den arven gjelder uendret synlig innhold, ikke alle interaksjoner,
smale tilstander eller tilgjengelighet. Tabellen nedenfor omfatter alle X-grupper
og tilordner manglende bevis. Det kreves ikke 204 identiske komplette oppgaveforløp.

| Område | Gjenbrukbar konkret evidens | Fersk sluttpakke |
|---|---|---|
| X01–03 / D01–05 appskall, lager, bulk | R6 bred firetema; faktisk Dark filterutvalg/status/review; smal fixturestøtte | Alle fire tema hovedflater, restored lys/mørk/flerfargekort; faktisk filter/reset/sort/null/tomt; smal stor bulk-review, flytting og beskyttet rull; nav/fokus. |
| X04 / D11–15 detalj og etikett | Native vekt/feil/retry, gradient856, sliderfocus; eksportert etikett | Fersk restored detalj firetema; native smal tare/status/location/invalid/danger cancel; tom/enkel/lang historikk; label feilmelding/fokus. |
| X05 lokasjoner | R6 liste og faktisk opprettet mottakslokasjon | Befolket editor/review ved smal bredde; edit/archive/restore/merge-preview/cancel, lokal validering. |
| X06 / D06/08 registrering og batch | Native faktisk ambiguous→ready→created Dark, Companion faktisk add | Batch kompakt kvittering og lang rulleliste, fyra tema; manual/borrowed/native create, ugyldige felt og full keyboard med dataassert. |
| X07 / D07 ønskeliste | Native bestilling/mottak og Dark856; Companion delmottak dataassert | Smal fyra tema/NB, delmottak >1 native, quantity invalid/remove cancel/null/tomt. |
| X08 / D09/10/16/17 lån | Native invalid focus/lån; Companion create/return/error/draft | Native vanlig retur og innlåntretur med vedvarende data, feil/søk; representative smale temaer og tastatur. |
| X09 / D18–26/38–40 printer/RFID/diagnostikk | R6 alle dialoger; native Dark graf; backend RFID-regresjoner | Restored board/status/slots fyra tema og AA; syntetisk assign/replace/clear/weight/override/offline/error; befolket graf pause/resume og søk; native keyboard. |
| X10 / D48–51 statistikk | R6 firetema; keyboard månedtooltip | Smal fyra tema, custom period/filter/tomt/currency/missingprice; aktiv tooltip og tabell ved kant, modal keyboard. |
| X11 / D28 standarder/priser | Faktisk default-save/missing-only DBassert; rettede kontroller | Lokal identifiserbar kvittering og endelig overwrite-review/Cancel/confirm firetema; threshold/currency invalid og focus. |
| X12 / D44–45 katalog | R6 liste/swatchreview; faktisk katalogvalg | Swatchreview firetema/keyboard/smal; invalid color/preview/cancel/isolert save, søk/error uten ekstern update. |
| X13 / D12/29/30/46 import/backup/labels | Faktisk backup, validCSV, negativefamilier, restoreassert, PNG og A4/Letter save | Gjenbruk eksportbevis; fersk smal review/error/result firetema og keyboard filechooser return. |
| X14–15 / D31–37 bibliotek/HostClient | Faktisk pairing/hostauthority/write/cache/offline/recovery/revoke | Revoked→lokal guidance→full re-pair, cold first load, restricted settings; actual Host/Client fyra tema/smal/fokus; network draft cancel. |
| D27/41–43/47 øvrige innstillinger | R6 firetema; Auto/system og språk eldre | NB etter toastfix, dirty editor/discard/invalid, diagnostic copy/export/result, updates noavailable state; fersk native titlebar/Auto. |
| X16–17 Companion | Firetema/fourwidth roots/tasks, 32keyboardcycles, create/tare/slots/wishlist/lendreturn/errors dataasserts | Fersk restored root/detail/printer AA; uinspisert NB/Auto/noresults/error støtte, faktisk paired/revoked/read-only; 200% reflow/aria. |
| X18 felles feedback/modal/menu | Faktisk Dark Escape/return, invalidfocus, family tests og Companion focusmatrise | Tydelig fokus/hover/selected/disabled alle tema; 200% shared families; feil inne i hvert relevant shell og ingen stale feil ved ny oppgave. |

## Utførelsesrekkefølge

1. Registrer fryst commit, bundle- og isolerte databaseidentiteter. Verifiser riktig
   kjørende bygg før poeng. Ingen eldre produksjons-/QA-app startes uten avtale.
2. Kjør fersk delta i native og Companion: fire tema, restored farger, faktisk
   kontrast, Tauri titlebar/controls og Auto light→dark. Registrer faktisk viewport.
3. Lukk mest konkrete retestbehov først: batchresultat, priskvittering/overwrite,
   revoke→re-pair. Lever funn tidlig hvis faktisk avvik, uten å vente på matriseslutt.
4. Utfør resterende syntetiske funksjonsgrener én gang per faktisk mekanisme,
   kontrollér hver distinkt visuell familie i alle tema. Dekk NB lange tekster,
   native smal størrelse, tastatur og 200% gjennom dokumentert familiebevis.
5. Før ti-kriterievektor per flate/tema med eksplisitte arvede og nye kilder.
   Uavklart kontrast eller uinspisert område forblir IE og hindrer sluttgodkjenning.

## Kilder og fersk status

- [Opprinnelig kartlegging](../visual-modernization-2026-09-24/critic-inventory.md)
- [Historisk restliste](../visual-modernization-2026-09-24/remaining-evidence-r12.md)
- [Implementerte runder, inkludert R16–17](../visual-modernization-2026-09-24/implementation-log.md)
- [Leveringsstatus og fargerestaurering](../visual-modernization-2026-09-24/delivery-status-2026-09-30.md)
- [Native batch R15](../visual-modernization-2026-09-24/round-15-batch.md)
- [Native standarder R15](../visual-modernization-2026-09-24/round-15-defaults.md)
- [Native detalj R15](../visual-modernization-2026-09-24/round-15-detail.md)

Ferske observasjoner, bilder, målinger og karaktervektorer tilføyes i separat
sluttinspeksjonsrapport etter faktisk inspeksjon. Denne første ledgeren er en
presis kontrollplan, ikke ferdig inspeksjon.


## Endelig kriteriematrise — godkjent på 05a05d0f

**Sluttbeslutning: gjennomgangen er ferdig. Alle relevante kriterier når 9/10 i
familiene nedenfor. Ingen åpne produktfunn eller kontrollerbare IE-hull gjenstår
innen det avtalte visuelle oppdraget.** Dette erstatter den innledende planen og
løpende IE-vurderinger ovenfor. Baseline var d57a97ed; lokal kontrast ble rettet i
f3eed3ce og navn/søk i sporvelgeren ble rettet og faktisk retestet i 05a05d0f.

Vektor følger **H/T/L/F/K/V/I/R/D/A**. Karakter 9 betyr svært god, sammenhengende
utforming og etterprøvd praktisk bruk i avtalt omfang; det betyr ikke feilfrihet
eller universell tilgjengelighetssertifisering. Ingen 10-tall eller gjennomsnitt
brukes til å skjule svakere temaer. **L/D/B/P betyr Light, Dark, Bambu og Prusa;
vektoren gjelder hvert av disse fire temaene separat**, med grunnlag angitt per
familie. R6 er tidligere individuelt vurderte 51 native scenarier i alle fire
temaer. Ny firetema delta, faktisk native mekanisme og felles form-/fokusbevis
begrunner samme karakter der struktur og mekanisme deles.

**Auto:** faktisk native system Dark og NB-bytte er kontrollert. Companion har
16 ferske Auto-bilder med emulert system Light/Dark. Native Auto Light arver det
uendrede Light-temaet og systemvalgmekanismen; global macOS Light ble ikke endret.
Auto er dermed kildevalg til vurderte temaer, ikke et femte selvstendig fargedesign.

**Felles R/A-grunnlag:** faktisk native smal utforming fra R5 og senere retester,
24 ferske NB-bilder ved 856 × 550, native dialoger ved 856 × 750 og faktisk
keyboard-/returfokus. Alle 24 korrigerte Chrome-vindusbilder ved Zoom 200 % er
individuelt inspisert: fire tema × detalj, batchkvittering og priskvittering,
før/etter keyboard eller rulling. CSS-utsnitt 720 × 436, DPR 4. Dette er faktiske
appkomponenter med syntetisk fixturebro i Chrome, ikke native WebKit-zoom.
Detaljens vektfelt har synlig keyboardfokus i D/B/P; Light viser lesbart felles
skall og feiltilstand. Delte felt, footer, scrollområde og fokus arves uttrykkelig
fra disse kontrollerte familiene. Alle innledende defekte CDP-bilder er avvist.
Axe og composite-pixel-prøver støtter vurderingen; de erstatter ikke inspeksjon.

| Familie | Tema | H/T/L/F/K/V/I/R/D/A | Konkret grunnlag for interaksjon, responsivitet og tilgjengelighet |
|---|---|---|---|
| X01 appskall og Dashboard / D01 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | R6 og fersk native firetema delta; faktisk navigasjon, native tittellinje, Auto Dark og NB. Felles shell er lesbart ved faktisk 200 %. |
| X02 lager, søk og filter / D02–04 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | R10 faktisk filter/reset/status med dataassert; native restored firetema etter kontrastfix; NB reflow og felles keyboard-/formbevis. |
| X03 massevalg og review / D05 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | R10 beskyttet aktivt lån, no-op og Lost → In stock; R13 skjult/lang identitet og Cancel-returfokus. Ny faktisk Move: Review → Confirm → Updated 1, 325 g og ny lokasjon bekreftet i DB. Firetema R6 og felles review-/scrollbevis. |
| X04 detalj, historikk og etikett / D11–15 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | Native vekt/tare/feil/retry og R15 sliderfokus; etterbilder i fire tema, lokal målt tekstkontrast. Faktisk 200 % lang identitet, vektfelt og footer. PNG/PDF og chooserfokus arves fra R13. |
| X05 lokasjoner | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | Ny native create/edit/archive/restore og merge-preview/Cancel, med bevart data og returfokus. Faktisk merge er ikke påstått utført. R6 firetema, smal native form og felles valideringsbevis. |
| X06 registrering og batch / D06/08 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | Native ambiguous → Ready → Registered → korrekt Open roll. Firetema batch, tre ekstra receipt-tema og 200 % firetema receipt. Manuell registrering/tare arves fra faktiske R5/R12 mekanismer. |
| X07 ønskeliste og bestilling / D07 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | R11 Dark 856 og nye befolkede native L/B/P ved 856. Ny delmottak 1 av 2, rest 1, ny rull 219 NOK og lokasjon i DB. NB reflow og felles kontrollfokus. |
| X08 lån / D09/10/16/17 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | R5 ugyldig låntaker/feltfokus/opprettelse. Ny native vanlig retur 600/40 g og innlånt retur 700/30 g med soft delete og historikk. Firetema etterbilder av preview; NB og felles modal-/formbevis. |
| X09 printer / D18–26 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | Native assign 750 → update 740 → clear/home 740 g. VM-FINAL-02 retest: lagernavn og AMS 1 · Slot 4 vises og er søkbare. R6 og fersk firetema board; smalt søkevalg og synlig fokus. |
| X09 RFID og diagnostikk / D38–40 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | Ny faktisk RFID Save, manuell overstyring ved fersk syntetisk observasjon og pause 3 → beholdt 3 → resume 4 prøver. R5 smal graf, R6 firetema og nye native L/B/P-modalbilder. Ingen ekte printertransport. |
| X10 statistikk / D48–51 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | R6 og ny firetema oversikt; tidligere keyboardtooltip. Ny native ugyldig datoperiode avvist, gyldig tom periode brukt og Completed-filter oppdatert. Prisdekning/manglende pris skilles fra valgt periodes forbruk. Felles felt-/reflowbevis. |
| X11 standarder og priser / D28 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | Native missing-only 2 oppdatert / 4 beholdt; overwrite Cancel og keyboard Confirm; seks ruller 245 NOK i DB. Lokal identifiserbar kvittering, firetema supplering og faktisk 200 % med utvidet liste. |
| X12 katalog og swatch / D44–45 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | R6 firetema og nye native L/B/P swatch-review. Ny Dark invalid color → disabled Save → gyldig preview → Save → 0 manglende; #F8FAFC i isolert DB. Felles form/validering, smal dialog og fokus. |
| X13 import, backup og etiketter / D12/29/30/46 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | R12 faktisk backup/CSV/negative filer/rollback/restore med DBassert, R13 faktisk PNG/A4/Letter og filechooserfokus. Fersk fokusert importfeil i alle tema og EN/NB; felles modal-/200 %-arv. |
| X14 bibliotek og vert / D31–34 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | R10 offline/cache/error/recovery; ny faktisk vertwizard med backup, autoritet og revoke. Lokal annonsetimeout løst ved restart, ingen gjenværende sperre. R6 firetema og tidligere smal native form. |
| X15 klient og ny paring / D35–37 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | Faktisk revoke → draft Save 977 avvist → Host 800 / Client 333 intakt → ny paring → Save 977 gross → Host 777 / Client 333. R10 cold/offline/limited settings og R5 feltfokus; felles reflowarv. |
| Øvrige innstillinger / D27/41–43/47 | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | R6 firetema; ferske General/defaults/maintenance, faktisk tema/Auto Dark/NB. Dirty/discard og lokal validering arves fra dokumenterte native editorer; settings-form ved faktisk 200 %. |
| X16 Companion hovedflater | L/D/B/P + emulert Auto L/D | 9/9/9/9/9/9/9/9/9/9 | 64 ferske backend-bilder, 16 Auto-bilder og sampled tekstmåling på 48 root/theme/width-rader ved 320/834/1440. Faktiske R5/R12 create/tare/slot/wish/loan-mekanismer, 32 keyboardsykluser og NB-feil. |
| X17 Companion Add/detail/oppgaver | L/D/B/P + felles Auto-kilde | 9/9/9/9/9/9/9/9/9/9 | 32 ferske backend-bilder med keyboard, R12 full fokusmatrise, R14 EN/NB 320 disclosure. Faktisk delmottak/retur og fersk NB-feil med bevart kladd. Kontrastmålinger er støtte på målte delområder. |
| X18 felles feedback, modal og meny | L/D/B/P + Auto | 9/9/9/9/9/9/9/9/9/9 | Faktisk native batch/priser/felt-/returfokus; R12 Escape/Cancel/validation-familier og fersk fokusert importfeil. Korrigert firetema 200 %-pakke viser footer, intern rulling og keyboardfokus uten overlapp. |

## Avslutning og avgrensning

VM-FINAL-01 og VM-FINAL-02 er lukket med retting og konkret retest. Sterke kort-
og printertoner og faktiske swatcher er bevart. Den syntetiske feeden er stanset.
Denne visuelle sluttgodkjenningen dekker hele familieinventaret med sporbar arv;
den er ikke en påstand om at alle tenkelige data, OS-versjoner, hardwarekommandoer
eller alle WCAG-suksesskriterier er uttømmende testet. Faktiske produksjonsprintere,
faktisk irreversibel lokasjonsmerge og globalt macOS Auto Light-bytte inngikk ikke.
Disse grensene er ikke åpne visuelle funn i dette oppdraget.

Detaljer og historiske observasjoner: [sluttinspeksjon](critic-final-inspection.md).
