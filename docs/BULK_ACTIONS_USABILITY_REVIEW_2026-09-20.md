# Massehandlinger i lageret: vurdering med data

Denne avgrensede oppfølgingen av PR #132 undersøker utvalg, flytting,
statusendring og beskyttede ruller. Den bruker en separat native macOS-app med
ny syntetisk Standalone-database: 72 ruller, egne lokasjoner, tildelte
printerruller og aktive utlån. Ingen produksjonsdata eller fysisk printer ble
brukt. Agentbasert ekspertvurdering er ikke målinger fra sluttbrukere.

## Påvist feil og rettelse

**BULK-F1:** Individuell reaktivering av en tom rull med 0 g ble avvist, mens
samme rull kunne settes til På lager gjennom massehandling. Kritikeren
bekreftet faktisk lagring av Alpha06 som IN_STOCK med 0 g. En separat backendtest
viste også at hele utvalget ble godkjent med manglende nettovekt.

Rettelsen kontrollerer tomme rullers nettovekt både før review i UI og på nytt
mot vertens faktiske data inne i transaksjonen. En tom rull uten positiv
nettovekt avviser hele utvalget før første skriv. Ingen gyldig del av utvalget
eller historikk lagres alene. Endret vekt på en valgt rull ugyldiggjør en gammel
review i UI. Kommandoskjemaet og databasen trenger ingen migrering.

**BULK-F2:** Review viste rå statusverdier som EMPTY/IN_STOCK, og kvitteringen
brukte «updated atomically». Review viser nå de lokaliserte statusnavnene.
Kvitteringen sier hvor mange ruller som er oppdatert, og forklaringen før
bekreftelse sier enkelt at alle endringer lagres samlet eller ingen ved feil.
Formuleringen fungerer også for én rull.

Feil ved utvalget viser nå opptil tre berørte filamentnavn med rullreferanse,
samt antall øvrige berørte ruller. Det gjør det lettere å finne dem gjennom
søk/filtre uten å tømme resten av utvalget. Dette er ikke en ny «vis bare
blokkerende ruller»-funksjon.

## Faktiske oppgaver og databevis

Kritikeren brukte vanlig UI og skrivebeskyttede snapshots mellom operasjoner.
Ti tabeller ble kontrollert med antall/SHA256, og alle 72 rullers ID, status,
netto/tare og nåværende/hjemmelokasjon ble sammenlignet. `quick_check` og
fremmednøkler ble kontrollert ved hvert punkt.
[Komprimert evidens](bulk-review-2026-09-20/evidence.json) bevarer filhasher,
endrede tabelldigester, endrede kontrollrader og eksportenes eksakte ID-er.
Første steg i hver runde viser alle tabelldigester og åtte relevante
kontrollruller. Uendrede tabeller arves fra forrige steg; komplette lokale
snapshots og eksportfiler er beholdt i ignorert testmappe.

Runde 1 viste at utvalget overlevde søk og filtre som skjulte alle valgte ruller,
med korrekt «3 totalt / 0 i visningen». CSV og JSON inneholdt nøyaktig Alpha01,
02 og 03. Flyttepreview viste 3 valgte / 2 berørte / 1 uendret. Avbryt beholdt
identiske data; bekreftelse flyttet bare Alpha01/02 og skrev riktig historikk.
Tommerking skjulte Alpha04/05 fra All og beholdt dem i Empty. Den påviste
reaktiveringsfeilen er dokumentert før rettelsen, ikke skjult av senere score.

Blandet utvalg med en vanlig rull, et aktivt utlån og en printerrull ble avvist
uten delvis lagring. Etter at de beskyttede rullene ble fjernet fra utvalget,
lyktes samme flytting for den vanlige rullen. Ingen omstart var nødvendig.

## Kriterier og runder

Oppgaveløsning 25 %, informasjon 20 %, navigasjon 15 %, tilbakemelding 15 %,
visuelt 10 %, tilgjengelighet 10 %, robusthet 5 %. Maks fire runder, mål minst
8/10 for hver observert hovedflyt. Produktkode ble fryst under kritikerrundene;
rettelser ble gjort mellom rundene.

Se [runde 1](bulk-review-2026-09-20/round-1.md) og
[runde 2](bulk-review-2026-09-20/round-2.md) for oppgaver og kriteriescorer.

| Flyt | Før | Etter |
|---|---:|---:|
| Utvalg, søk/filter og valgt eksport | 8,20 | 8,20 |
| Masseflytting, review og avbryt | 8,30 | 8,45 |
| Tomstatus, All og reaktivering | 6,55 | 8,35 |
| Beskyttede valg og korrigert nytt forsøk | 8,05 | 8,35 |

Eksportbeviset er videreført fra runde 1; ingen ny eksport i runde 2.
De tre øvrige flytene ble gjennomført på nytt. Alle når målet, og kritikeren
anbefaler ingen tredje runde.

Runde 2 avviste Alpha05/06 samlet da Alpha06 hadde 0 g. Alle ti tabelldigester
og kontrollrader var identiske før/etter. Vanlig veiing av Alpha06 med 700 g
total og 200 g tare ga 500 g og reaktivering. Utvalget ble beholdt gjennom
filterendringen. Ny review viste to valgte, én berørt og én uendret; bekreftelse
endret bare Alpha05. Flytteavbryt og begge beskyttelsesavvisningene bevarte
data. Korrigert nytt forsøk flyttet bare Alpha01. Sluttdata og integritet er
kontrollert; ingen lån eller printertilordninger ble endret.

## Regresjoner og opprydding

Backendtesten feilet før rettelsen og er grønn for manglende, null og negativ
vekt samt gyldig positiv vekt. Browserregresjoner dekker preflight, vektendring
etter review, vertsavvisning og oversatt statusmål. En produksjonsbackend bak
en syntetisk HTTP-vert bekrefter én POST, riktig feilkode og uendrede snapshots
på både Host og Client. Dette er automatisert transportdekning, ikke en ny
manuell Host/Client-vurdering.

Verifikasjon: produksjonsbygg og lint, 2063 UI-tester, 401 Companion-tester,
896 skripttester, 23 ytelsestester, 317 kjernetester og tre generatortester
bestod. De 32 native transporttestene inkluderer fem bulk-tester. Rust-format
og kjerne-Clippy bestod. Modal og seks datatilkoblede hovedsider hadde ingen
axe-brudd; dette er ikke full skjermleserverifikasjon. Felles feilkode og alle
21 språkkataloger er kontrollert teknisk, uten ny morsmålsgodkjenning.
Prosjektets kontraktsjekker og doctor bestod.

Begge egne reviewprosesser er stoppet. Bare de to verifiserte testeksportene
ble flyttet fra Downloads til den ignorerte evidensmappen. Databasen og de
komplette lokale bevisene er beholdt for sporbarhet.

## Grenser

Native macOS, engelsk tekst, mørkt tema og syntetiske data er observert. Listen
hadde 72 ruller, men de manuelle utvalgene var på to/tre ruller. Ingen full
VoiceOver-prøve, Windows/Linux-vurdering, fysisk etikettutskrift, maskinvaretest
eller manuell Host/Client-bulk over nett inngår. Lost-status og alle
sorterings-/filterkombinasjoner ble ikke prøvd manuelt.

Checkboxnavn viser forkortet rullreferanse uten filamentnavn. Eksportkvitteringen
viser format og antall, men ikke filnavnet. Disse er mindre restpunkter.
Skjermbilder ble sett i CUA-verktøyloggen; ingen PNG-arkivering påstås.

Bulkstatus endrer status og historikk, og bevarer målt vekt. Det er forskjellig
fra den separate «Merk som tom»-handlingen som også nullstiller vekten.
Denne pakken endrer ikke dette skillet. En oppdatert Host kreves for den nye
serverkontrollen; en eldre Host får ikke en ny regel av å oppdatere Client alene.
