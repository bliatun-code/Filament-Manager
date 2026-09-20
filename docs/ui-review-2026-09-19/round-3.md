# Uavhengig UI-kritikk – runde 3

Samme kriterier/vekter og isolerte datatilkoblede miljø som R2. Dette er tredje runde; neste er fjerde og siste. R2 er fortsatt gjeldende for uendrede områder. Bevis fra Companion: evidence/critic-r3/results.json og PNG-er. Native: faktisk CUA-interaksjon og skjermbilder i oppgaven.

## Retest og ny dekning

- C7 funksjon bestått: skrev Critic Round Two bokstavvis; input beholdt fokus og hele teksten, resultat1/167 uten Showmore. Referanse6acd14 fant samme rull. Ingenmatch ga0. Valg åpnet korrekt skjema. Ingen lån ble opprettet i denne retesten.
- C8 bestått visuelt: 320px ABS Azurekort rommer både tolinjet tittel og Valgt.390/768 kontrollerte, ingen sideoverflow.
- NativeN3 bestått: felt heter Measured total weight(g), forklarer fratrekk av tara og viser oppdatert550−200=350. Maks600total var korrekt for gjenværende400netto. Ikke lagret enda et lån; faktisk lagring var testet R2.
- N2 bestått: ny vanlig backup gir bare «Full backup exported (inventory, history and printers). Backup validation completed.» Ingen løfte om gjenbruk i ny rolleveiviser.
- Companion printere faktisk gjennomført: finn ledig AtlasQA EXT→søkCriticRoundTwo→mål700(total), lagre→ASSIGNED500netto. Update650→450netto. Clear600→IN_STOCK400netto, spor tomt. SQLite og skjermkvitteringer samsvarte.0runtimefeil. Nye50g+50g printerjobber viste seg senere korrekt i native statistikk.
- Statistikk med rikere data: customSep1–19 ga3jobber180g; to50g fra våre printerhandlinger +fixture80g. Materialkostnad NOK19.92=80/1000×249, de to utenpris var Notvalued, dekning1/3. Inventarverdi EUR852.98 ogNOK9064.56 vises separat med78%dekning. Trace viser datagrunnlaget. Prognose er eksplisitt informasjonsbasert30dagersantakelse; svært langt estimat14,522.833dager/2066 er unødig presisjon, lavprioritert forbedring.
- Guidet Host i isolert originalapp: eksport automatvalidert→beggeDone→Switch→ekstra bekreftelse. Hostrolle ble aktiv. Etterpå kom «Failed to save trusted-LAN companion settings» mens QAloopbackserver fortsattRunning. Implementeringsagent bekreftet at ordinær nettverkskonfigurasjon avviser HTTP-loopback. Klassifisert testmiljøbegrensning, ikke uten videre produktfeil.
- Separat Client-bundle ble startet med egen syntetisk DB. CUA viste riktig egen6-rullersdashboard, men klikk/Tab ga ikke side-/fokusendring selv med korrekt fullpath/AX/koordinat. Native originalapp virket. Dette er mulig targeting/identisk-binærproblem i testoppsettet, ikke dokumentert produktfeil. Vanlig Clientparring kan heller ikke bruke denne QAloopbackadressen; sikkerhetsregelen skal ikke omgås. Full datatilkoblet Client-UI forblir uverifisert; dedikert Host/Clientintegrasjonsgate fra implementeringsagent rapporteres separat og gir ikke automatisk UI-score.

## Nye funn fra faktisk UI

### C9 – P3: Ny søkeboks mangler konsistent feltlayout

Companion lånevelger search-label flyter inline inn i smal standardgrå input.390px-bildet loan-picker-searched.png viser tolinjet label og felt ved siden av siste ord, i motsetning til øvrige store søkefelt. Søk fungerer, men visuell og berøringsmessig kvalitet faller.

Akseptanse: fullbreddesøk under egen label, samme search-field-label/search-input som etablerte søk, fokus synlig, minimum44px kontrollhøyde og ingen overflow320/390.

### C10 – P2: Printervektoppgaver forklarer ikke netto/tara

Lasting og oppdatering har Målt totalvekt men viser ikke tare200 eller netto; tømming har bare Utgående vekt(g), enda det er600total som blir400netto. Brukeren kan se500/450 som kortvekt ved siden av650/600 input uten forklaring. Backend korrekt; UI gir samme usikkerhet som N3 før retting.

Akseptanse: total inkl.rull eksplisitt og oppdatert total−tare=netto i load/update/clear. Blankt/ugyldig er synlig validering; preview må samsvare medwrite.

### N4 – P2: Lokasjons-ID i native lånevelger

Etter Companion clear ble egenUI-registrerte CriticRoundTwo lagt i hjemmelokasjon CriticR2Shelf. Native lånevelger og selectionpreview viser location_9f401e478fe95a3f8f6f6a564037d6e3 i stedet for navnet. Dette er ikke seeded status-/datoavvik. Eneste søkeresultat strekkes dessuten over hele venstrepanelhøyden (P3).

Akseptanse: lokasjonsnavn i kandidat+preview, riktig søk, kompakt naturlig korthøyde ved fåtreff. Unknownlegacyfallback forståelig.

## Oppdatert score for berørte områder

| Område | Oppg | Info | Nav | Tilb | Vis | Tilg | Rob | Vektet | Begrensning |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Companion lager/registrering/detalj |8|9|8|8|8|8|8|8,20|C8 løst, fysiskQR/kamera og faktiskmobil fortsatt ikke testet|
| Companion lån/retur/historikk |8|8|8|8|7|7|8|7,80|C7funksjon løst, C9 nytt felt må styles|
| Companion printere |8|6|8|8|8|8|8|7,60|Load/update/clear faktiskpersistens; C10 uklar total/netto|
| Native lån/retur/historikk |8|7|8|8|7|8|8|7,70|N3 løst; N4 lokasjons-ID og strukketkort|
| Bibliotek/webapp, observerte lokale flyter |8|8|8|8|8|8|7|7,95|N2 løst, backupgate god; QArolle/configfeil og full Client uverifisert gjør full godkjenning urimelig|
| Statistikk/økonomi |8|8|8|8|8|8|8|8,00|Rik data/custom/trace faktisk; prognosens overpresisjon reduserer info9→8|
| Full native Client med tilkoblet data |—|—|—|—|—|—|—|—|Ingen ærlig score uten faktisktilkoblet observasjon|

Andre områder bruker eksplisitt avgrensedeR2/R1-karakterer og testdekning. Ikke sett samletprodukt8 bare fordi berørte områder blir rettet. Ingen gjenstående blocker i utførte oppgaver, men Client-hullet og utestede plattformer/eksterneintegrasjoner står igjen etter fire runder hvis miljøet ikke lar dem verifiseres.
