# Uavhengig UI-kritikk – runde 4 / sluttvurdering

Fjerde og siste kritiker-/forbedringsrunde, 19.september2026. Samme syv kriterier og vekter: oppgave25%, informasjon20%, navigasjon15%, tilbakemelding15%, visuelt10%, tilgjengelighet10%, robusthet5%. Kriteriene er ikke endret for å nå målet. Ingen samlet produktscore som skjuler utestede områder.

Datatilkoblet test: macOS native testbundle og Chromium Companion mot faktisk Rust/SQLite-backend, egen enriched.db.190+syntetiske ruller, flere produsenter/materialer/lokasjoner,20%+manglende priser, EUR/NOK, lange navn, lowstock, lån/historikk, printerspor og nylige jobber. Telefonbredder320/390 og tablet768 simulert. Separate klientforsøk var ikke fullt tilkoblet; se begrensninger. Ingen produksjonsendringer, fysisk printerkjøring eller ny release.

## Siste retest

- C9 korrekt søkefelt: fullbredde, egen label, synlig fokus og stor kontroll. Bokstavvis søk beholder input/fokus;1/167, nulltreff, referansesøk ogvalg fungerer.
- C10 printervekt: loading700−200=500, update650−200=450, clear600−200=400 synlig og faktisk lagret; label Utgående totalvekt inkl.spole; runtimeerrors[].
- Ugyldig1e3 gir synlig vektvalidering. Submit gir0POST og ingenDBendring. Deretter gyldig700 fungerer. Ingen påstand om at dette alene dekker alle numeriske randverdier.
- Mobilkort320/390/768 fortsatt uten overflow, Valgt inne i rammen.
- NativeN4: CriticRoundTwo viser CriticR2Shelf både i kandidat og selectionpreview, naturlig kompakt korthøyde ved1treff.600−200=400 nettopreview fortsatt korrekt.
- R1 blockerC1 ogC2/C3 var uavhengig rettet/retestet R2; ingen nye regresjoner sett i R3/R4-flytene, men heleR2offlineløpet ble ikke gjentatt R4.

Bevis: evidence/critic-r4/results.json og PNG. Native visuelle observasjoner finnes i oppgavens CUA-resultater. Påstå ikke at screenshots alene beviser lagring: Companion-mutasjonene ble også lest fra samme isolerte SQLite.

## Restfunn og målrettet avslutningskontroll

**C11 P2 – Companion lokasjonsnavn mangler enkelte steder.** Etter UI-clear av rull med hjemmelokasjon vises location_9f401e478fe95a3f8f6f6a564037d6e3 i lånevelger og incoming printerkort. SQLite har aktivt navn CriticR2Shelf; native viser nå navnet. Bevis loan-picker-searched.png og printer-load-valid.png. Dette trekker informasjonspoeng ned; rawID er lite nyttig ved valg mellom like ruller. Akseptanse er samme eksisterende navneoppslag i låne-/printersammendrag og søk på hjemmelokasjon. **Avsluttende målrettet R4-retest: løst.** loan-picker-location-fixed.png og printer-summary-location-fixed.png viser Critic R2 Shelf og kompakt lesbar layout. location-retest.json bekrefter navn og ingen rawID i både lånerad og printerkort. Ingen ny generell kritikkrunde ble startet; dette avslutter samme navnefunn. Poengene nedenfor er oppdatert etter denne faktiske visuelle kontrollen.

**Lavprioritet:** prognosen viser14,522.833dager og et2066tidspunkt med lite faktisk forbruk. Tydelig forutsetning reduserer risiko, men en grovere horisont hadde vært mer ærlig enn tre desimaler. Ikke blocker og ikke et krav om redesign.

## Sluttmatrise for faktisk observerte flyter

Alle tall nedenfor bygger på de avgrensede oppgavene i R1–R4. «8+» betyr tilfredsstillende lokal observert flyt, ikke at utestede underfunksjoner eller plattformer er godkjent. Bibliotekfullgodkjenning og Client er ikke nådd.

| Område | Oppg | Info | Nav | Tilb | Vis | Tilg | Rob | Vektet | Observerte oppgaver og viktig grense |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Dashboard |8|8|8|8|8|8|8|8,00|Rik oversikt, checklistdismiss, lavstock→rettfilter; fysisklive utestet|
| Lager/søk/plassering |8|8|8|8|8|8|8|8,00|190+gruppevisning, ref-søk, menneskeligslotnavn, Empty skjultAll og synligEmpty|
| Native registrering |8|8|8|9|8|8|8|8,15|Bambu+lokasjon+receipt+korrektnyrull; bulk/inbound ikke kjørt|
| Native detalj/etikettpreview |9|7|8|9|7|8|8|8,10|Vekt/pris/tare, fysisklabelpreview, EMPTY; ingen print/PDFeksport|
| Native lån/retur/historikk |8|8|8|8|8|8|8|8,00|Stor søkbarvelger, livegross/net, låne-/returpersistens, humanlocation; inboundhandback ikke kjørt|
| Lokasjoner |8|8|8|9|8|8|8|8,15|Create/rename/archive/restore og faktiskbruk vedregistrering|
| Ønskeliste/bestilling/mottak |8|8|8|8|8|8|8|8,00|Qty2order→receive1, pris/EUR/lokasjon/receipt/SQLite; bulk/failure utestet|
| Native printerlasting |8|8|8|9|8|8|8|8,15|UIassign ledig simulertAMSslot medpersistens, navnet rettes; fysiskRFID/swap utestet|
| Statistikk/økonomi |8|8|8|8|8|8|8|8,00|12m/customrange, forbrukssøk/reset, flervaluta, prisdekning ogkosttrace; overpresisprognose|
| Generelt |8|8|9|8|8|8|8|8,15|Lys/mørk/språkskifte; autostart/updaterinstallasjon/andreOS utestet|
| Filamentstandarder |8|9|8|9|8|8|8|8,35|Valuta,250gthreshold,22.5EURgruppe, Onlymissing énrull, persistens; overwrite/Client utestet|
| Bibliotek/webapp, lokale guideflyter |8|8|8|8|8|8|7|7,95|Backupguide/avbryt, ferskgate og faktiskHostrolle; QAloopbackconfigbegrensning/fullClient uverifisert|
| Printerinnstillinger |8|8|8|9|8|8|8|8,15|Rename→cancelwarn→keepdraft→save; firmware/MMU/fysiskintegrasjon utestet|
| Filamentkatalog |8|8|8|9|8|8|8|8,15|Missingcolor invalid→validhex→save; eksternimport utestet|
| Vedlikehold/backup |8|9|8|8|8|8|8|8,20|Fulleksport ogautomatisk/manuellfilvalidering, freshreceipt; restore/repair/reset utestet|
| Companion lager/registrering/detalj |8|9|8|8|8|8|8|8,20|Genericlongname, tare/persist/reload, netvekt, mobilmodal/labels; kamera utestet|
| Companion lån/retur/historikk |8|8|8|8|8|8|8|8,00|Korrekteregnestykker+persistens,167search; C11navn verifisert i avsluttendeR4-kontroll|
| Companion printeroppgaver |8|8|8|8|8|8|8|8,00|Søk/load/update/clear +persistens/validering; C11incomingnavn visuelt verifisert|
| Companion innstillinger/tilkobling |8|8|8|9|8|8|9|8,20|Reellbrowseroffline/HTTP500/recovery, preferanser; expiredsession utestet|
| Tilkoblet native Client |—|—|—|—|—|—|—|—|Separatapp startet, men ikke fullstendig tilkoblet/operert; ikke kunstig8|

## Hva som hindrer full godkjenning

1. Ingen gjenstående blocker eller P2-funn i de gjennomførte flytene etter den målrettede C11-kontrollen. Ingen datatap observert. Dette er avgrenset godkjenning av disse oppgavene, ikke en erstatning for hullene nedenfor.
2. Bibliotek/webapp får ikke full godkjenning uten observert tilkoblet Client og brukerrettet oppførsel vedforbindelsestap/rollebegrensedeinnstillinger. Dedikert Host/Clientautomatisertgate må rapporteres separat; grønn integration er ikke en visueltbedømt8.
3. Windows/Linux, faktisktelefonbrowser/kamera/RFID/VoiceOver, fysiskeprintere og eksterncatalogimport er eksplisitte observasjonshull. Ikke start en femte iterasjon for å skjule dem.
4. Restore/repair/reset var ikke nødvendig for å rette de påviste UI-feilene og ble ikke utført. Backup/validering er testet og sikkerhetsgaten beholdt.

Tilgjengelighetspoeng gjelder tydelige AX-navn, tekstlige statuser, observerte kontraster, storekontroller og modalTab/ShiftTab-fokus, ikke fullWCAG-sertifisering eller skjermleserstudie.

Anbefaling: lever den dokumenterte rettelsespakken og behold eksplisitt restliste. Gjennomfør kontrollert datatilkoblet Client-evaluering og resterende eksterne/fysiske arbeidsflyter som neste avgrensede aktivitet. Ingen generell redesign eller release kreves kun for å øke en karakter.


## Konsolidert utvikling gjennom rundene

«=» betyr eksplisitt videreført fra forrige observerte vurdering, ikke utført på nytt. «—» betyr ingen samlet karakter fordi oppgaver ennå ikke var observert. Tabellen bruker vektet score; siste fullstendige kriterievektor står i sluttmatrisen over. R3/R4 endringer kan også skyldes ny datarikere dekning, ikke bare kodeendringer. Tallene er ikke en statistisk effektmåling av menneskelige brukere.

| Område | R1 | R2 | R3 | R4 slutt |
|---|---:|---:|---:|---:|
| Dashboard |8,00|8,00|=8,00|=8,00|
| Lager/søk/plassering |7,60|8,00|=8,00|=8,00|
| Native registrering |—|8,15|=8,15|=8,15|
| Native detalj/etikettpreview |8,10|8,10|=8,10|=8,10|
| Native lån/retur/historikk |—|7,60|7,70|8,00|
| Lokasjoner |—|8,15|=8,15|=8,15|
| Ønskeliste/bestilling/mottak |8,00|=8,00|=8,00|=8,00|
| Native printerlasting |8,15|8,15|=8,15|=8,15|
| Statistikk/økonomi |8,20|=8,20|8,00|=8,00|
| Generelt |8,15|=8,15|=8,15|=8,15|
| Filamentstandarder |8,35|=8,35|=8,35|=8,35|
| Bibliotek/webapp lokale guideflyter |7,45|=7,45|7,95|=7,95|
| Printerinnstillinger |8,15|=8,15|=8,15|=8,15|
| Filamentkatalog |8,15|=8,15|=8,15|=8,15|
| Vedlikehold/backup |8,20|=8,20|=8,20|=8,20|
| Companion lager/registrering/detalj |6,65|8,10|8,20|=8,20|
| Companion lån/retur/historikk |7,30|7,45|7,80|8,00|
| Companion printeroppgaver |—|—|7,60|8,00|
| Companion innstillinger/tilkobling |7,05|8,20|=8,20|=8,20|
| Tilkoblet native Client |—|—|—|—|

Sluttkonklusjon: 18 av19 vurderte lokale områder er minst8, bibliotek/webapp7,95, og ett ytterligere hovedområde (datatilkoblet nativeClient) er uten score. Oppdragets brede mål om minst8 i alle områder er derfor **ikke fullt dokumentert oppnådd**. De konkrete observerte feilene er rettet; full Client-UI og de nevnte eksterne/fysiske kontrollene er naturlige neste aktiviteter. Ikke omregn18/19 til et kvalitetsprosenttall.
