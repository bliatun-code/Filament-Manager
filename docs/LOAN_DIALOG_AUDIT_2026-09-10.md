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

## Neste avgrensede rettelse

Vis returfeil inne i dialogen. Bind utlånsvalg og vektkladd til en vellykket,
aktuell kandidatinnlesing; en lastefeil må hindre innsending fra en tidligere
åpning. Bevar brukerens kladd ved en vanlig avvisning innen samme gyldige
dialog. Verifiser begge retningene og gjenåpning med endrede printerdata i
rendrede regresjonstester før neste samlede PR.
