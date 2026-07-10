# Filament Manager - brukerveiledning

English version: [USER_GUIDE.md](USER_GUIDE.md)

Filament Manager er et desktop-first lagerprogram for 3D-printerfilament. Programmet samler lagerstatus, utlån, printerspor, filamentforbruk, ønskeliste, bestillinger, katalogdata og Bambu AMS live-data i ett lokalt bibliotek.

Målet er at du skal kunne svare raskt på fire spørsmål:

- Hva har vi på lager?
- Hvor ligger hver rull, og hvem eier den?
- Hvilke printerspor er lastet med hvilket filament?
- Hvor mye filament er brukt, lånt ut eller på vei inn?

## Hovedide

Programmet bruker en lokal SQLite-database som hovedlager. Det finnes ingen ekstern skyavhengighet i normal bruk. En maskin kan kjøre helt alene, eller fungere som vert for andre desktop-klienter og nettlesere på samme lokale nettverk.

De viktigste delene er:

- Desktop-appen: hovedprogrammet, bygget med Tauri og React.
- Lokal database: lagrer katalog, ruller, historikk, utlån, printere, live-observasjoner og innstillinger.
- Companion/webapp: en lokal nettleserflate som kan deles på LAN når webapp er aktivert.
- Host/client-synk: en desktop kan være vert, andre desktop-installasjoner kan kobles som klienter.
- Bambu Live-integrasjon: valgfri lokal MQTT-lesing fra Bambu-printere for AMS-spor, RFID, vekt og jobbstatus.

## Driftsmoduser

Programmet kan kjøres i tre bibliotekroller: Kun lokal, Vert og Klient.

### Kun lokal

Kun lokal er standard og tryggeste enkeltmaskinmodus.

- Denne maskinen bruker sin egen lokale database.
- Alle endringer gjøres direkte i lokal database.
- Desktop-appen kan fortsatt servere webapp fra maskinen dersom webapp er aktivert.
- Dette passer når én Mac eller PC er hovedmaskinen for verkstedet.

Velg Kun lokal når du ikke trenger at andre desktop-installasjoner skal dele samme bibliotek.

### Vert

Vert betyr at denne desktop-installasjonen eier biblioteket og kan dele det.

- Vertens lokale database er kilden til sannhet.
- Andre desktop-klienter kan pares mot verten.
- Nettlesere kan pares mot webappen på lokalt nettverk.
- Skriveoperasjoner fra klienter går mot verten når klienten er riktig paret.
- Bambu Live bør konfigureres på verten, siden live-data og automatisering da hører til samme bibliotek.

Velg Vert når én maskin skal være felles lager for flere enheter.

### Klient

Klient betyr at desktop-appen kobler seg til en Vert.

- Klienten leser bibliotek, lager, utlån, printere og ønskeliste fra verten.
- Når verten er tilgjengelig og klienten er paret, kan klienten utføre støttede endringer mot verten.
- Når verten ikke er tilgjengelig, kan klienten vise en lokal cache som lesbar fallback.
- Klientens lokale database er ikke hovedbiblioteket.

Velg Klient når denne maskinen skal bruke et bibliotek som allerede eies av en annen desktop.

### Webapp og nettlesere

Webappen er en lokal companion-flate som serveres fra desktop-appen.

- Den kjøres fra maskinen som har webapp aktivert.
- Nettlesere pares med kortvarig lenke eller QR.
- Paret nettleser får en tryggere lokal økt med CSRF-beskyttelse.
- Webappen er laget for rask bruk på mobil, iPad eller annen verkstedmaskin.
- Vertsmaskinen kan trekke tilbake nettleserøkter fra innstillingene.

Webappen er nyttig for raske operasjoner ved printeren: sjekke lager, se printerspor, låne ut, returnere, legge til ruller og oppdatere vekt.

## Hovedsidene

### Oversikt

Oversikt er et dashboard for lagerhelse og aktivitet.

Den viser blant annet:

- totalt antall filamenter
- aktive printere
- lav beholdning
- forbruk siste periode
- eierskapsoversikt
- nylig aktivitet
- lagerhelse
- fremdriftsmål og statusblokker når relevant

Oversikt er ment som en rask temperaturmåling, ikke som stedet for detaljstyring.

### Lager

Lager er hovedbildet for filamentruller.

Her kan du:

- søke etter materiale, farge, eier, lokasjon eller QR
- filtrere på status som På lager, Tildelt, Utlånt, Tom og Tapt
- se lav beholdning
- åpne detaljer for hver rull
- oppdatere vekt
- endre status og plassering
- skrive QR/etiketter
- registrere RFID
- låne ut filament
- legge til nye ruller
- håndtere ønskeliste og bestillinger

Lagerkort grupperer like filamenttyper og farger, men viser fortsatt individuelle ruller og plasseringer. Dette gjør at lageret er lett å skanne uten å miste sporbarhet.

Panelet Ønskeliste og bestillinger har egne statusfiltre og søkefelt. Det viser
antall treff, lar deg flytte kjøp mellom Ønskeliste, Bestilt og Mottatt, lagerføre
en ankommet vare som fysisk rull og fjerne planer som ikke lenger er aktuelle.

### Utlån

Utlån samler alt som er lånt ut eller lånt inn.

Programmet skiller mellom:

- Utlånt: våre ruller som er lånt ut til andre.
- Innlånt: ruller vi har fått låne fra andre.

Du kan:

- opprette utlån
- returnere utlån
- håndtere innlånte ruller
- søke på person, materiale eller filament-id
- filtrere på retning og status
- eksportere utlån til CSV

Utlån påvirker lagerstatus, slik at en rull ikke behandles som ordinært tilgjengelig mens den er utlånt.

#### Utlånt til andre

Bruk Utlånt når en rull som eies av oss fysisk forlater lageret, eller når en annen person skal disponere den en periode.

Typisk flyt:

1. Finn rullen i Lager eller åpne Utlån.
2. Velg Lån ut filament.
3. Velg person eller skriv inn låntaker.
4. Angi hvor mange gram som lånes ut hvis det ikke er hele gjenværende rull.
5. Legg inn kontakt eller notat ved behov.
6. Bekreft utlånet.

Når rullen er utlånt:

- rullen vises som Utlånt
- den skjules fra vanlig tilgjengelig lager
- den kan ikke behandles som ordinært printerklart lager før den er returnert
- historikken viser hvem som lånte den, når den gikk ut og hvor mye som gikk ut

Ved retur registrerer du hvor mye som kommer tilbake. Programmet kan da beregne differansen som utlånsforbruk dersom mindre kommer tilbake enn det som ble lånt ut. Dette gjør at utlån kan bidra til reelt materialforbruk uten at det blandes sammen med printerforbruk.

#### Innlånt fra andre

Bruk Innlånt når en rull tilhører noen andre, men skal ligge hos oss midlertidig.

Typisk flyt:

1. Velg Legg til filament.
2. Velg riktig katalogelement eller manuell registrering.
3. Velg eierskap Innlånt.
4. Skriv inn eier/långiver og eventuell kontakt eller notat.
5. Angi vekt og plassering.
6. Legg rullen inn.

Innlånte ruller kan brukes i lageret, lastes i printerspor og følges opp med vekt, men de holdes separat i eierskapsoversikter. Når rullen leveres tilbake, brukes returflyten for innlånt filament. Da lukkes innlånsrelasjonen og rullen forsvinner fra aktivt lager.

#### Aktiv, returnert og fullført historikk

Utlånssiden har filtre for retning og status.

- Retning skiller mellom Utlånt og Innlånt.
- Status skiller mellom Aktive og Returnerte poster.
- Søk kan brukes på person, materiale, farge eller rull-id.
- Eksport til CSV gir en ryddig historikk for avstemming eller deling.

Det er bevisst at returnerte utlån fortsatt er søkbare. De er ikke lenger aktive lagerbevegelser, men de er verdifulle som historikk og som grunnlag for forbruksoversikt.

### Printere

Printere viser konfigurerte printere og spor.

Her kan du:

- legge til printer
- velge modell og multi-material-konfigurasjon
- se lastede spor
- tildele filament manuelt til spor
- tømme spor
- oppdatere vekt manuelt
- se live-status for Bambu AMS når live-integrasjon er aktiv

Alle printere får minst ett eksternt spor (`EXT`). Bambu-printere kan få AMS-profiler med AMS-enheter og spor per enhet. Prusa MMU3 og Prusa XL har egne profiler for MMU-kanaler eller toolheads.

Når den detaljerte sporoversikten er minimert, viser printerkortet fortsatt en
kompakt swatch og materialetikett for hvert tildelte spor. Sammendragene bruker
lagrede tildelinger og virker derfor også for manuelt konfigurerte printere uten
live-data. Bambu-printere med live-data viser i tillegg jobbstatus, fremdrift,
nozzle- og bedtemperatur, AMS-fuktighet og AMS-temperatur på en kompakt rad.

### Statistikk

Statistikk viser aggregert bruk.

Den dekker blant annet:

- totalt forbruk
- loggførte jobber
- aktive lastede spor
- feilede jobber
- forbruk per printer
- forbruk per materiale
- utlånsforbruk per person
- eierskapsstatus for beholdning og lav beholdning

Forbruk bygges fra manuelle vektoppdateringer og automatiske live-observasjoner når reglene for live-forbruk er oppfylt.

### Innstillinger

Innstillinger er delt i flere områder.

Generelt:

- programversjon
- tema: Auto, Lys, Mørk
- språk
- A4-lageroversikt

Bibliotek og webapp:

- bibliotekrolle: Kun lokal, Vert eller Klient
- lokalt enhetsnavn som identifiserer denne installasjonen
- webapp-server
- nettverksgrensesnitt og port
- paring av nettlesere
- tilkoblede nettlesere og tilbakekalling
- desktop client-paring mot vert

3D-printere:

- printerliste
- modell og sporprofil
- Bambu Live-konfigurasjon
- live-diagnostikk og capture
- beskyttet rekonfigurering med bekreftelse før ulagrede endringer forkastes

Filamentkatalog:

- katalogoversikt
- katalogoppdatering for Bambu og eSUN
- separat leverandøraudit og oppdatering av valgte materialer
- farge-/swatch-data
- håndtering av katalogelementer som ikke lenger finnes i import

Programvedlikehold:

- sikkerhetskopi
- import/eksport
- reset/vedlikeholdsfunksjoner
- validering av data før større flytting mellom roller

## Legg til filament

Legg til filament er laget for flere praktiske flyter, ikke bare én enkel registreringsform.

### Direkte på lager

Bruk denne når rullen fysisk finnes i hyllen nå.

Typisk flyt:

1. Velg leverandørkilde: Bambu, eSUN eller generisk/manuell.
2. Søk eller velg riktig filament fra katalogen.
3. Velg eierskap: Eid eller Innlånt.
4. Angi startvekt eller gjenstående vekt.
5. Angi hjemmeplassering hvis du vil.
6. Legg rullen på lager.

For katalogbaserte ruller fyller programmet ut materiale, farge, leverandør, standardvekt og swatch der data finnes. For manuelle ruller skriver du inn dette selv.

### Bambu Filament Code

Bambu-esker har en femsifret `Filament Code` på eskeetiketten, for eksempel `53400`.

I Bambu-flyten:

- skriv eller lim inn koden i katalogsøket for å velge én aktiv katalogmatch
- velg manuelt hvis samme kode finnes på flere aktive katalogelementer
- legg inn ett entydig utgått treff som old stock, eller velg riktig rad når en utgått kode har flere katalogtreff
- bruk manuell registrering hvis ingen katalogelementer bruker koden ennå

Desktop/client har også en Filament Code-batchmodal i Bambu-flyten. Lim inn én kode per linje, bruk det lille skann/skriv-feltet for å legge til én oppdaget kode om gangen, legg til strekkodeverdier fra et stillbilde, eller la webkameraet stå på mens du viser Bambu-eskeetiketter én etter én. Live-skanning gir tilbakemelding i video-overlayet når en kode legges til, fortsetter å skanne etter neste etikett og unngår å gjenta samme synlige etikett før du flytter den bort. Hvis en strekkode inneholder en femsifret Filament Code, legges koden inn som en klar rad eller vurderingsrad; hvis den bare inneholder en annen strekkodeverdi, blir råverdien stående synlig for manuell vurdering. Programmet viser hvilke rader som er klare og oppretter rader med et klart katalogtreff, inkludert ett entydig utgått old-stock-treff. Tvetydige aktive treff, utgåtte koder med flere mulige katalograder, ugyldige koder eller manglende koder blir stående for manuell vurdering.

Batch-opprettede Bambu-ruller bruker lagerdetaljene på høyre side av modalen, inkludert eierskap, eier/kontakt for Innlånt, vekt og plassering. Companion/webapp bruker samme kataloglogikk for manuelt kodeoppslag, men bruker ikke kamera eller webcam-scanning.

Status for kamera- og batch-scanning ligger i [Camera And Batch Scanning Status](CAMERA_BATCH_SCANNING_PLAN.md). Kortversjonen er at desktop/client holder kode-, bilde- og webcam-basert strekkodeinput i samme vurderingsbaserte batchmodell, mens OCR fortsatt er en senere eksplisitt batch.

### Eid filament

Eid betyr at rullen tilhører vårt bibliotek.

Eide ruller:

- teller i vanlig lagerbeholdning
- kan lånes ut
- kan tildeles printerspor
- kan inngå i automatisk Bambu Live-forbruk
- vises i lagerhelse og lav beholdning

### Innlånt filament

Innlånt betyr at rullen tilhører noen andre, men brukes midlertidig hos oss.

Innlånte ruller:

- får en innlånsrelasjon
- holdes separat i statistikk og eierskap
- kan håndteres og returneres
- bør ha eier/kontakt/notat når det er nyttig

### Ønskeliste og bestillinger

Ønskelisteflyten brukes når rullen ikke nødvendigvis er fysisk på lager ennå.

Statusene brukes slik:

- Ønskeliste: noe vi vurderer eller ønsker å kjøpe.
- Bestilt: noe som er bestilt, men ikke ferdig håndtert.
- Mottatt: noe som er mottatt eller lukket i ønskeliste-/bestillingsflyten.

Du kan legge gjeldende katalogvalg i ønskelisten fra Legg til filament. Når varen senere faktisk skal inn i lageret, registrerer du den som en fysisk rull med riktig vekt og plassering. Ønskelisten er planlegging og innkjøpsoppfølging; lageret er beholdningen du faktisk kan bruke.

Bruk statusfanene for å avgrense køen, søkefeltet for å finne et planlagt kjøp
etter navn, farge eller leverandør, og **Lagerfør rull nå** når en bestilt vare
kommer. **Fjern** sletter bare ønskeliste-/bestillingsraden; den sletter ikke en
lagerrull.

### Mangler filamentet?

Hvis filamentet ikke finnes i katalogen, kan du legge det inn manuelt. Dette er nyttig for spesialfilament, eldre ruller, leverandører uten katalogimport eller ruller der etiketten ikke matcher katalogdata.

## QR og RFID

Hver rull kan ha QR og RFID-data.

### QR

QR brukes for robust identifikasjon av en rull.

Programmet kan lage en QR med spool-referanse. Den kan brukes på etiketter og i companion/webapp for å åpne riktig rull raskt.

### RFID

RFID brukes spesielt sammen med Bambu AMS.

Når en Bambu AMS rapporterer en RFID-identitet, kan programmet matche den mot en lagret rull. Når RFID er registrert på riktig rull, kan programmet velge riktig filament automatisk når AMS-sporet observeres live.

RFID-registrering er derfor en nøkkel til god automatikk. Uten RFID kan programmet ofte se materiale, farge og spor, men det kan ikke alltid vite hvilken fysisk rull som ligger der. Med lagret RFID blir identiteten mye sterkere, og automatisk tildeling blir tryggere.

Typisk RFID-flyt for en rull som allerede ligger i Lager:

1. Legg rullen i en AMS-slot på en Bambu-printer med Live Bambu status aktivert.
2. Åpne rullens detaljpanel i Lager.
3. Gå til QR/RFID-panelet.
4. Velg riktig live-slot hvis programmet ikke allerede foreslår den.
5. Refresh/les live-data fra printeren.
6. Kontroller at observert RFID, farge og spor ser riktig ut.
7. Lagre RFID på rullen.

Fra et printerslot kan en ukjent Bambu-RFID også håndteres direkte i slotkortet:

- Hvis nøyaktig én lagerrull ser ut som live-rullen, bruk **Lagre RFID** for å registrere observert identitet på den rullen.
- Hvis flere lagerruller matcher, velg riktig rull fra kortlisten før du lagrer RFID.
- Hvis ingen lagerrull matcher, men Bambu-katalogen har et sannsynlig treff, bruk **Legg til + lagre RFID**, velg om den nye rullen er eid eller innlånt, og bekreft ny rull og RFID-registrering samlet.

Slotflyten erstatter aldri en allerede tildelt rull i det stille. Hvis sporet allerede har en annen rull, må du først rydde eller endre tildelingen med en tydelig handling. Programmet ber også om ny bekreftelse hvis live-RFID forsvinner, sporet tømmes eller den observerte identiteten endrer seg mens du vurderer valget.

Etter dette kan programmet bruke RFID som sterk identitet. Hvis flere ruller har samme eller uklare data, vil programmet være mer forsiktig og be om manuell vurdering før det lagrer eller oppretter noe.

#### Før du registrerer RFID

Sjekk dette først:

- Printeren må være en Bambu-printer med Live Bambu status aktivert.
- Printeren må være lagt inn med riktig AMS-oppsett.
- Rullen bør være registrert i Lager, med mindre du bruker slotkortets **Legg til + lagre RFID**-flyt for å opprette en ny Bambu-katalogrull fra live AMS-signalet.
- Rullen må stå i en AMS-slot der live-panelet faktisk ser en observert RFID/AMS-identitet.
- Hvis du bruker Vert/Klient, bør RFID registreres mot vertens bibliotek, ikke en frakoblet klientcache.

#### Hva du bør kontrollere

Når du åpner RFID-panelet på en rull, kan programmet vise mulige live-spor og observerte data. Kontroller at signalet stemmer med den fysiske situasjonen:

- riktig printer
- riktig AMS og spor
- riktig farge eller materialhint
- observert RFID/AMS-id finnes
- programmet viser riktig kandidat eller ingen farlig konflikt

Hvis flere ruller kan være samme kandidat, er det bedre å stoppe og rydde manuelt enn å lagre feil RFID. Feil RFID på en rull kan føre til at AMS-automatikken senere velger feil rull.

#### Når RFID er lagret

Når RFID er lagret på en rull:

- live AMS-spor kan matche rullen direkte
- printervisningen kan vise riktig rull uten manuell tildeling
- automatisk forbruk kan knyttes sikrere til riktig rull
- ukjente live-spor kan bli kjent så snart samme RFID dukker opp igjen
- manuelle sporendringer får mindre risiko for å bli overstyrt av gamle live-data

RFID bør registreres én gang per fysisk rull når du har sikker observasjon. Hvis en rull byttes, rebobines eller får ny spool-kjerne på en måte som endrer AMS-identiteten, bør RFID kontrolleres på nytt.

## Live Bambu-printere

Bambu Live er en valgfri lokal integrasjon for Bambu-printere med AMS.

Viktig: En live-printer må først legges inn som vanlig printer. Etter at printeren finnes i programmet, må Live Bambu status konfigureres på printerkortet i Innstillinger -> 3D-printere.

### Konfigurasjon

Typisk oppsett:

1. Gå til Innstillinger -> 3D-printere.
2. Legg til printer med riktig Bambu-modell.
3. Velg AMS-oppsett, for eksempel 1 AMS x 4 spor.
4. Lagre printeren.
5. Åpne printerkortet igjen.
6. Aktiver Live Bambu status.
7. Fyll inn printerens IP/host.
8. Fyll inn access code.
9. Fyll inn printerens serial hvis nødvendig.
10. Åpne live-detaljer og kontroller at AMS-spor vises.

Live Bambu status er lokal og leser printerdata fra samme nettverk. Den bør konfigureres på host-maskinen når du bruker Vert/Klient-oppsett.

### Hva live-integrasjonen observerer

Når den er aktiv, kan programmet observere:

- AMS-slot som er lastet eller tom
- materiale, farge og leverandørdata som printeren rapporterer
- RFID/AMS-identitet når tilgjengelig
- Bambu Studio-filamentinnstillingsprofil som `tray_info_idx`, `tray_id_name` og anbefalt nozzle-område når printeren sender dette
- beregnet gjenværende vekt fra AMS
- printerens jobbstatus og AMS-statuskoder når de finnes i MQTT-strømmen
- subtask/jobbid og navn når printeren sender dette
- fremdrift og resterende tid
- nozzle-temperatur
- rå MQTT-data for diagnostikk/capture

Bambu Studio-filamentinnstillinger er ikke det samme som RFID. `tray_info_idx` og `tray_id_name` peker på printinnstillinger for et materiale/en profil, ikke en fysisk rull eller en komplett produktkatalograd. Programmet viser dette som diagnostikk og kan bruke det som svakt materialhint, men det skal ikke erstatte registrert RFID på rullen.

Anbefalt nozzle-område fra en innstillingsprofil er også diagnostikk. Det beskriver profilens temperaturvindu, mens live nozzle-temperatur beskriver hva printeren faktisk gjør akkurat nå.

Printermodell-listen deles mellom desktop-app, webapp og host. For Bambu Lab-modeller lagres også Bambu Studio-printerprofilkoden, slik at diagnostikk kan vise kjente upstream-navn som `BBL P1S` uten at printermodellvalg blandes med rull-/RFID-identitet.

`job_state` og `ams_status` vises som diagnosekoder. De kan hjelpe oss å forstå printerens interne tilstand, men de brukes ikke alene til å telle jobber eller registrere forbruk. Automatisk forbruk bygger fortsatt på en kombinasjon av jobbidentitet, `gcode_state`, fremdrift, nozzle-temperatur, aktivt AMS-spor og sane AMS-vektendringer.

Når du eksporterer capture til CSV, legger programmet inn egne `tray_snapshot`-rader før råfelt- og sample-loggen. Disse radene samler AMS/spor, lastet-status, fysisk spor-tilstedeværelse, RFID-lesestatus, Bambu-tag-bit, materiale, farge, AMS-vektestimat, RFID/tray UUID, innstillingsprofil og nozzle-område slik at en capture kan analyseres raskere uten å miste rådata.

### Automatisk sporvalg

Automatisk valg er sterkest når RFID er registrert.

Prioritet i praksis:

- Eksakt RFID på rull gir beste match.
- Tidligere kjent rull i samme spor kan brukes når signalet er stabilt.
- Materiale/farge kan gi kandidater, men er svakere enn RFID.
- Uklart eller konfliktfylt grunnlag krever manuell bekreftelse.

Målet er å automatisere det trygge, og stoppe før programmet gjør selvsikre feil.

## Automatisk vekt og forbruk

Bambu AMS-vekt er ikke en fysisk vekt. Den er en beregning basert på rullens geometri/omkrets og printerens AMS-data. Derfor kan målingene svinge noen prosent, og enkelte målinger kan være åpenbart usannsynlige.

Programmet behandler live-vekt forsiktig.

### Hva som kan registreres automatisk

Når en live-printer har et matchet AMS-spor og en aktiv print, kan programmet:

- registrere fall i gjenværende vekt som filamentforbruk
- koble forbruket til printer
- koble forbruket til rull
- koble forbruket til en live print-session
- telle jobber når en session har nok signaler til å regnes som fullført
- skille ferdige, avbrutte og usikre observasjoner så langt datagrunnlaget tillater

### Støyfilter

Programmet forkaster eller ignorerer målinger som ikke bør bli forbruk.

Eksempler:

- vektøkning behandles ikke som negativt forbruk
- store hopp kan avvises som usannsynlige
- små rebound-målinger fra AMS kan korrigeres
- kald nozzle brukes som sterkt signal på at ekstrudering ikke pågår
- lave temperaturer under ekstruderbar grense brukes for å hindre falske forbruk etter jobbslutt
- tail-målinger etter en nylig fullført jobb kan knyttes til riktig session bare innenfor trygge rammer

En nyttig tommelfingerregel i programmet er at nozzle under 180 grader betyr at printeren ikke lenger kan ekstrudere. Stabil temperatur over normal printtemperatur er et sterkt signal om at en jobb faktisk kjører.

### Jobbregistrering

Automatisk jobbregistrering bruker flere signaler sammen:

- printerens jobbfelt
- subtask/jobbid
- fremdrift og resterende tid
- AMS-slot og matchet rull
- vektfall
- nozzle-temperatur
- fullført/avbrutt tilstand fra printeren

En jobb bør ikke telles bare fordi AMS-vekt endret seg. Den bør ha en rimelig print-session rundt seg. Dette er spesielt viktig fordi AMS-data kommer i burst og kan inneholde gamle eller delvise felter.

## Manuell vekt og manuelt forbruk

Du kan alltid oppdatere vekt manuelt.

Manuelle vektoppdateringer er nyttige når:

- printeren ikke har live-integrasjon
- rullen brukes utenfor AMS
- live-data mangler eller er uklare
- du vil korrigere en fysisk kontrollmåling

Manuell oppdatering kan påvirke rullens gjenværende vekt og forbruksstatistikk når den er knyttet til riktig printer/spor.

## Printerspor og tildeling

Printerspor kan styres manuelt eller via live-data.

Manuelt:

- Velg printer og spor.
- Velg rull fra lageret.
- Last inn rullen i sporet.
- Oppdater vekt ved behov.
- Tøm sporet når rullen fjernes.

Det minimerte printerkortet beholder swatcher og materialnavn for tildelte spor.
Utvid **Vis spor** bare når du trenger tildeling, vekt, RFID eller handling for å
tømme et spor.

Med Bambu Live:

- Live-data viser hva AMS rapporterer.
- Programmet forsøker å matche live-sporet med lageret.
- RFID gjør automatisk match mye sikrere.
- Manuell tildeling kan brukes for å rette opp eller overstyre.
- Ved manuell endring kan programmet undertrykke gammel live-cache slik at gammelt signal ikke umiddelbart drar sporet tilbake.

## Katalog

Katalogen brukes til å slippe manuell punching av vanlige filamentdata.

Programmet støtter:

- Bambu-katalog
- eSUN-katalog
- generisk/manuell registrering
- swatch/fargedata
- discontinued-markering når import ikke lenger finner gamle Bambu-elementer

Katalogelementer er maler. En fysisk rull er en egen lagerpost basert på en katalogmal eller manuell registrering.

Programmet leveres med en lokal seed-katalog for kjente filamenter. Den gjør at eldre ruller fortsatt er søkbare selv om produsenten ikke lenger viser dem i nettbutikken. Seed-katalogen er normalisert og ryddet for rene case-duplikater, slik at for eksempel samme eSUN-farge ikke dukker opp både som `BLACK` og `Black`.

Katalogreparasjon gjenoppretter den innebygde seed-katalogen og fjerner bare ubrukte ikke-seedede katalograder. Ruller på lager, ønskelistekoblinger, utlån, printerdata, RFID, plasseringer og historikk skal bevares.

Leverandøraudit kontrollerer hva Bambu- eller eSUN-kilden rapporterer nå.
Oppdatering av valgte materialer bruker katalogendringene du velger. Dermed kan
du vurdere leverandørendringer før lokal katalogmetadata erstattes.

## Data, historikk og sikkerhet

Programmet bevarer historikk for viktige handlinger.

Eksempler:

- opprettelse av rull
- statusendringer
- vektoppdateringer
- printertildeling
- utlån og retur
- RFID-oppdatering
- live-forbruk
- sletting og livsløp

Rulldetaljene holder historikken minimert som standard. Antall hendelser er
alltid synlig; åpne **Vis** for å se tidslinjen. Vanlige historikker vises i sin
helhet, mens lange historikker starter med et avgrenset sett nyere hendelser og
tilbyr en egen vis-mer-handling.

Sletting av rull er normalt en myk sletting fra aktiv visning, slik at historikk ikke forsvinner. Permanent purge finnes for tilfeller der rullen og relaterte data virkelig skal fjernes.

## Backup og flytting

Bruk Programvedlikehold for sikkerhetskopi, import og reset.

Ved bytte mellom Vert, Klient og Kun lokal bør du tenke gjennom hvem som skal eie biblioteket. En full backup fra gammel vert er den tryggeste måten å flytte bibliotekets historikk til en ny vert.

## Anbefalt praktisk oppsett

For én bruker:

- Bruk Kun lokal.
- Aktiver webapp hvis du vil bruke mobil/iPad i verkstedet.
- Konfigurer Bambu Live på samme maskin hvis du bruker Bambu AMS.

For flere enheter:

- Velg én stabil desktop som Vert.
- Aktiver webapp på verten.
- Par desktop-klienter mot verten.
- Konfigurer Bambu Live på verten.
- Registrer RFID på ruller som står i AMS.

For best automatikk:

- Legg inn printere med riktig AMS-oppsett.
- Aktiver Live Bambu status etter at printeren er opprettet.
- Registrer RFID på ruller som brukes i AMS.
- Hold lagerførte ruller oppdatert med realistisk startvekt.
- Bruk manuell vektkorrigering når fysisk kontroll viser at AMS-estimatet har drevet.

## Begrensninger og forventet oppførsel

Live-data fra Bambu er nyttig, men ikke perfekt.

- MQTT-data kommer ofte i burst.
- Noen payloads mangler felt som kom i forrige burst.
- AMS-vekt er estimert, ikke fysisk veid.
- RFID kan mangle eller være ukjent for tredjepartsfilament.
- Farge/materiale alene er ikke alltid nok til sikker automatisk match.
- Kald nozzle betyr at forbruk ikke bør fortsette å registreres.

Programmet er derfor laget for å være konservativt: det er bedre at en usikker situasjon krever manuell bekreftelse enn at lageret får falske jobber eller falskt forbruk.
