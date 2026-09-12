# Utlånsdialoger: avgrensede reproduksjoner

Kilde: `d85b4721`, printerkandidaten i PR #110. Undersøkelsen ble gjort mens
PR-kontrollene kjørte. Ingen utlånskode er endret i denne kandidaten.

## Feil skjules bak returdialogen

Den faktiske `LoansPage`, `LoanReturnModal` og appens CSS ble kjørt i Chromium,
med bare Tauri-kallene simulert. Fire tilfeller ble kontrollert: retur av
utlånt rull og tilbakelevering av innlånt rull, begge med blank vekt og med
avvisning fra backend.

Alle beholdt dialog, vekt og notat. Ingen hadde feiltekst eller alert inne i
dialogen. Sidevarselet lå utenfor dialogen, og modaloverlegget dekket varselets
skjermposisjon. Blank vekt sendte ingen skrivekommando; en simulert avvisning
kom etter én riktig returkommando. Skjermleserannonsering er ikke undersøkt.

## Gammelt rullvalg kan sendes etter mislykket oppfriskning

Den faktiske `LoansPage` og `LoanOutModal` ble kjørt på samme måte:

1. Rull A lå i Dry box med 500 g filament og 200 g tara. Totalvekten ble
   endret fra 700 til 600 g, og dialogen ble lukket.
2. De simulerte autoritative dataene ble endret: A var nå tilordnet et
   printerspor med 300 g filament. Ved gjenåpning returnerte spole- og
   printeroppslag nye data, mens innlesing av printerinnstillinger feilet.
3. Dialogen viste lastefeilen, men beholdt A, gammel lokasjon, 500 g og
   kladden på 600 g. Innsending var fortsatt aktiv. Etter utfylling av låntaker
   sendte den `lend_spool` for A med `grams_out: 400`.

Den virkelige kandidatfunksjonen returnerte ingen lånbare ruller for de nye
testdataene. Reproduksjonen viser derfor at den gamle kandidatlisten brukes
etter lastefeilen. Dette er et UI-bevis med simulerte Tauri-svar; ingen native
utlånsendring ble kjørt.

Kodegjennomgang viser at backend kontrollerer eksistens og aktive lån, og
tømmer printerspor som peker på rullen når utlånet opprettes. Konsekvensen i
en faktisk database må verifiseres separat før det hevdes som et native funn.

## Anbefaling ved den opprinnelige revisjonen

Vis returfeil inne i dialogen. Bind utlånsvalg og vektkladd til en vellykket,
aktuell kandidatinnlesing; en lastefeil må hindre innsending fra en tidligere
åpning. Bevar brukerens kladd ved en vanlig avvisning innen samme gyldige
dialog. Verifiser begge retningene og gjenåpning med endrede printerdata i
rendrede regresjonstester før neste samlede PR.

## Rettelse og regresjonsport 2026-09-13

Utlånsdialogen oppretter en ny tilstand ved hver åpning og ved endret Host-mål
eller foretrukket rull. Kandidatinnlesing nullstiller rullvalg og vekt før
lasting; mislykket lasting gir et synlig feilvarsel og en oppfriskingsknapp.
En feil presenteres ikke som tomt lager. Innsending krever en vellykket aktuell
innlesing. Utlånsvelgeren bruker ikke bufrede spoler eller printertilordninger
som grunnlag for nye utlån. Vanlig lesing fra buffer andre steder er bevart.

Retur og tilbakelevering har nå feilvarsel med `role="alert"` inne i dialogen.
Vekt og notat beholdes ved valideringsfeil og avvisning. Innsending låses
synkront mot gjentatte klikk; felter, kryss, lukkeknapp, Escape og bakgrunnsklikk
er blokkert mens skriving pågår. En bekreftet lagring lukker dialogen før
sideoppfriskning, slik at en etterfølgende lastefeil ikke vises som en avvist
lagring. Begge vektfeltene og returforhåndsvisningen krever hele, ikke-negative,
sikre heltall. Blank tekst, desimaler, eksponentnotasjon og delvis tolkbare
verdier blir ikke sendt; null gram støttes.

`npm run test:loans:dialogs` kjører appens faktiske React-visninger i Chromium
med en syntetisk database som kilde og styrte Tauri-svar. Fem scenarioer dekker:

- gammel kladd etter mislykket gjenåpning, oppfrisking med ny printertilordning
  og avvisning av den nye rullens utlån;
- et gammelt svar som ankommer etter lukking og ny åpning;
- ugyldig utlånsvekt, dobbelklikk, sperret lukking og feilet oppfrisking etter lagring;
- retur av utlånt rull: feil inne i dialogen, bevart kladd og én innsending;
- tilbakelevering av innlånt rull med de samme kontrollene.

Den nye porten inngår i `smoke` og dermed `verify` i begge plattformjobbene.
En kontroll mot koden før rettelsen (`8f36c147`) feilet i fire scenarioer;
vern mot et sent svar etter lukking var allerede grønt. Alle fem passerer med
rettelsen. Dette er automatisert nettleserevidens, ikke en måling med
skjermleser eller en moderert brukertest.

Den eksisterende Rust-testen
`active_outbound_loan_blocks_printer_resize_and_delete_atomically` har fått
uttrykkelige kontroller av tilstanden rett etter utlån: innsendte 850 g er
lagret, status er `BORROWED`, og ingen printerspor peker lenger på rullen.
Testen bruker en egen midlertidig SQLite-base. Den dokumenterer hvorfor en
foreldet UI-kladd ikke kan overlates til backend for validering. Backend-API,
schema og selve utlånstransaksjonen er uendret; denne rettelsen innfører ingen
atomisk sammenligning med en tidligere vekt eller printertilordning ved skriving.

Lokalt er 1 726 UI-tester, 891 skripttester, 392 Companion-tester, begge
nettleserportene for tilgjengelighet, 23 ytelsestester, produksjonsbygg,
UI-lint og kontraktkontroller bestått. Språkbeviset er fornyet for alle 21
kataloger etter kompilering og runtime-/formatkontroller fordi registreringen
av den nye obligatoriske porten endrer QA-kontraktens fingerprint. Det er ikke
registrert ny språklig godkjenning eller en ny full skjermbildematrise.

Hele Rust-suiten bestod 1 020 tester, inkludert den utvidede databasekontrollen.
Rust-formattering og Clippy i både utviklings- og releaseprofil bestod også.
