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

- Klienten leser bibliotek, lager, utlån, printere og ønskeliste fra verten gjennom en autentisert desktop-paring.
- Når verten er tilgjengelig og klienten er paret, kan klienten utføre støttede endringer mot verten.
- Når verten ikke er tilgjengelig, kan klienten vise en lokal cache som lesbar fallback.
- Oversikt viser den sist fungerende, bufrede vertsvisningen først, inkludert
  bufret forbruk, og oppdaterer deretter fra verten i bakgrunnen.
- Én midlertidig oppdatering der alle kjernelesinger fra verten feiler, beholder
  den sist fungerende visningen i stedet for å markere verten utilgjengelig med
  én gang. Gjentatte feil viser fortsatt avbruddet, mens en autorisasjonsfeil ber
  om reparasjon av paringen umiddelbart.
- Vertslesinger, skrivinger, katalogoppdateringer og beskyttet arbeid mot
  Keychain/Credential Manager kjører utenfor UI-kallestien, slik at appen kan
  forbli responsiv mens et tregt LAN- eller nøkkelringkall fullføres.
- Klientens lokale database er ikke hovedbiblioteket.

Velg Klient når denne maskinen skal bruke et bibliotek som allerede eies av en annen desktop.

### Webapp og nettlesere

Webappen er en lokal companion-flate som serveres fra desktop-appen.

- Den kjøres fra maskinen som har webapp aktivert.
- Nettlesere pares med kortvarig lenke eller QR.
- Paret nettleser får en tryggere lokal økt med CSRF-beskyttelse.
- Å åpne LAN-adressen gir ikke tilgang til lageret: lesing og skriving av bibliotekdata krever en autentisert, paret økt.
- Webappen er laget for rask bruk på mobil, iPad eller annen verkstedmaskin.
- Vertsmaskinen kan trekke tilbake nettleserøkter fra innstillingene.

Webappen er nyttig for raske operasjoner ved printeren: sjekke lager, se printerspor, låne ut, returnere, legge til ruller og oppdatere vekt.

#### Stabil lokal Companion-adresse

På macOS og Windows annonserer verten én stabil `.local`-adresse for Companion
via mDNS. Nye paringer av nettlesere og desktop-klienter og nye QR-etiketter
bruker denne adressen, slik at de fortsetter å virke hvis DHCP senere gir verten
en annen IP-adresse. Det korte bibliotekbundne navnet ser ut som
`fm-7k3m9pwx.local`. Du kan skrive `http://fm-7k3m9pwx.local:4278` uten
`/companion`; verten videresender til webappen. Filament Manager aktiverer paring og permanente QR-lenker
først når det stabile navnet kan løses til den valgte private LAN-adressen. Hvis
registrering eller navneoppløsning feiler, kan webappen fortsatt være tilgjengelig
på sin nåværende numeriske IP for diagnostikk, men appen presenterer ikke denne
midlertidige adressen som en permanent lenke.

Verten og enheten som kobler til, må være på samme lokale nettverk, og nettverket
må tillate mDNS/Bonjour-trafikk. Gjestenettverk og klientisolasjon kan hindre
oppdagelse. På Windows tillater du Filament Manager på private nettverk hvis
Windows Defender-brannmuren spør; ikke åpne for offentlige nettverk. Innstillinger
viser fortsatt vertens eksakte numeriske IP-adresse som
diagnostisk reserve, men den kan endres og bør ikke brukes til nye paringer eller
etiketter.

Desktop-klienter bruker det samme stabile lokalnavnet for den parede verten.
Filament Manager løser `.local`-navnet gjennom den lokale mDNS-tjenesten før
klienten kontakter verten, slik at desktop-paring ikke er avhengig av at ruteren
videresender navnet gjennom vanlig DNS. Samtidige lesinger deler oppslaget og
gjenbruker den sist fungerende private ruten i opptil fem minutter. Hvis et
periodisk oppslag feiler midlertidig, beholdes den kjente ruten kortvarig og mDNS
prøves igjen etter omtrent 30 sekunder. En gjenfunnet adresse godtas bare når en
legitimasjonsfri helsesjekk rapporterer den eksakte forventede
bibliotek-ID-en; lesinger og skrivinger med legitimasjon spilles ikke automatisk
av på nytt mot en nyoppløst adresse etter en transportfeil.

Etter oppgradering må en nettleser eller desktop-klient som ble paret via den
gamle IP-adressen, pares én gang på nytt med en ny lenke. QR-etiketter som ble
skrevet ut med den gamle IP-adressen, må skrives ut på nytt.

Kjør bare én aktiv Companion-vert for et bibliotek. Hvis en annen vert startes
fra en kopi av den samme portable sikkerhetskopien, får den det samme stabile
navnet; vert nummer to nekter da å publisere paringslenker og permanente
QR-lenker i stedet for å endre navnet automatisk.

Hvis macOS viser at det stabile lokalnavnet allerede er i bruk, eller en eldre
testversjon viser `local service registration failed (-65548)`, publiserer en
annen enhet allerede bibliotekets stabile navn. På maskinen som ikke skal eie
det delte biblioteket, bytter du rollen til **Klient** eller slår av webappen.
La den tiltenkte bibliotekeieren være eneste **Vert**, og vent deretter opptil
omtrent 30 sekunder på automatisk nytt forsøk, eller slå webappen av og på én
gang.

Hvis den stabile adressen fortsatt er utilgjengelig på Windows, kontrollerer du
at den valgte tilkoblingen bruker nettverksprofilen **Privat**, at Filament
Manager er tillatt gjennom Windows Defender-brannmuren på private nettverk, og
at LAN-et tillater mDNS. Filament Manager kontrollerer at den nøyaktige
`.local`-adressen løses til denne verten før paring eller QR-lenker aktiveres;
en adresse som nettleseren ikke kan løse, regnes derfor ikke som klar.

Lange lager- og utlånslister vises i håndterlige bolker. Når flere treff
gjenstår, viser Companion størrelsen på neste bolk og vist/totalt; bruk **Vis
mer** på nytt for å fortsette gjennom resultatene.

## Hovedsidene

### Oversikt

Oversikt er et dashboard for lagerhelse og aktivitet.

Den viser blant annet:

- totalt antall filamenter
- aktive printere
- lav beholdning
- et eget kort for forbruk de siste 30 dagene
- en rullerende forbruksgraf for tolv måneder
- eierskapsoversikt
- nylig aktivitet
- lagerhelse
- fremdriftsmål og statusblokker når relevant

Oversikt er ment som en rask temperaturmåling, ikke som stedet for detaljstyring.
Når biblioteket ennå ikke har ruller, viser lagerhelsen **Ikke nok data** i
stedet for en misvisende prosent. Bruk **Legg til filament** i panelet for å
åpne den vanlige registreringsflyten i Lager.

Den avvisbare sjekklisten **Fullfør oppsettet** vises etter at programmet har
lastet et brukbart bibliotek. Den peker til første rull eller import, valgfritt
printer- og nettleseroppsett, og første komplette sikkerhetskopi. Obligatorisk
arbeid med lager og sikkerhetskopi vises separat fra valgfrie printer- og
Companion-steg. Fullførte punkter flyttes til ett sammenfoldet sammendrag, og
fremdriften teller bare de obligatoriske stegene. Statusen hentes fra
biblioteket og denne enhetens historikk for validerte sikkerhetskopier. En
midlertidig nettverks- eller vertsfeil vises derfor ikke som om hele oppsettet
mangler.

Panelet **Krever handling** er for forfalte utlån, bestilte varer som kan
mottas, og printere der Bambu Live-identiteten må kontrolleres. Lav beholdning
ligger ikke lenger som store handlingskort i dette panelet. Den vises i stedet i
det kompakte, sammenfoldede panelet **Forslag ved lav beholdning** og er fortsatt
tilgjengelig som måltall og lagerfilter.

Velg **Vis forslag** for å åpne panelet. Der kan du bruke **Legg til i
ønskeliste / bestilling**, **Åpne lager med lav beholdning** eller **Skjul
forslag** for en enkelt produktgruppe. Skjuling lagres bare for dette biblioteket
på denne enheten; den endrer verken beholdningen, grensen for lav beholdning
eller lagerfilteret. Bruk **Angre** rett etter skjuling, eller åpne **Skjulte
forslag** og velg **Vis igjen** senere.

Kortet **Månedlig forbruk** måler nøyaktig de siste 30 dagene og viser
gjennomsnittlig antall gram per dag. Den større grafen **Filamentforbruk** er en
annen visning: Den dekker inneværende lokale kalendermåned og de elleve
foregående kalendermånedene, sortert fra eldst til nyest. Måneder uten
registrert forbruk vises fortsatt som null. Totalen over grafen er summen av de
samme tolv månedene, og inneværende måned er ufullstendig frem til månedsslutt.

Begge visningene bruker registrerte printerknyttede printjobber og Bambu
Live-forbruksøkter. Tolvmånedersgrafen er ikke en total for all tid, og
filamentbruk uten en registrert jobb eller Live-økt kan ikke rekonstrueres. En
klient beholder den sist fungerende bufrede grafen mens den oppdaterer. Oppdater
både vert og klient for å få den nye grafen: En oppdatert klient mot en eldre
vert ber om at verten oppdateres i stedet for å vise manglende historikk som
null, mens en eldre klient beholder den gamle visualiseringen til klienten
oppdateres.

Når en aktiv Bambu Live-integrasjon ennå ikke har godkjent TLS-identiteten,
eller observert identitet har endret seg, viser Oversikt **Bambu Live trenger
oppfølging**. Velg **Åpne Live-innstillinger** for å åpne akkurat denne
printeren under **Innstillinger -> 3D-printere** og kontrollere identiteten.

### Lager

Lager er hovedbildet for filamentruller.

Arbeidsområdet er delt i **Lager**, **Lokasjoner** og **Ønskeliste og
bestillinger**, slik at rullelisten beholder hovedplassen mens administrasjon
åpnes ved behov.

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

Store filtrerte lager vises trinnvis for å holde visningen responsiv.
Resultattelleren viser hvor mange ruller som vises av alle treffene; velg **Vis
mer** for å fortsette. Søk og filtre gjelder fortsatt hele lageret.

Velg **Velg flere** ved resultattelleren når du vil bruke massehandlinger.
Avkrysningsboksene og den kompakte handlingslinjen vises bare i denne
valgmodusen. Velg enkeltruller eller alle rullene i det filtrerte resultatet, og
åpne deretter flytting, status, etiketter eller eksport. Bare den valgte
flytte- eller statushandlingen åpner innstillingene sine. Velg **Ferdig** for å
avslutte og tømme utvalget.

Flytting og statusendring viser først en gjennomgang med separate tall for
valgte, berørte og uendrede ruller. Ved bekreftelse skrives alle berørte ruller
og historikken deres samlet. Hvis en gjennomgått rull er endret, utlånt, lastet
i en printer eller fjernet, blir ingen av endringene skrevet. Etikettark og
CSV-/JSON-eksport bruker nøyaktig de valgte rullene, også når du uttrykkelig har
valgt en status utenfor lagerbeholdningen. Hvis filtre skjuler deler av
utvalget, viser handlingslinjen både totalt antall valgte og antallet i den
gjeldende visningen.

Lagerets CSV-/JSON-format tar med leverandør, nominell/nåværende/gjenstående
vekt, spolevekt, egne lagersteder, eierskap/eierkontakt og
innkjøps-/prisbeskyttelse. Det er en lettvektsutveksling av ruller, ikke en full
sikkerhetskopi: printerspor og den opprinnelige utlånshistorikken følger ikke
med. Ved import til et annet bibliotek blir en rull som var lastet eller lånt ut
normalisert til **På lager**, uten å opprette tekniske lokasjoner. En innlånt
rull beholder derimot eierskap og motpart som en ny, aktiv innlånsrelasjon. Bruk
full sikkerhetskopi når hele biblioteket med relasjoner og historikk skal flyttes.

Under **Lager → Lokasjoner** administrerer du bare egne lagersteder. Tekniske
printer- og utlånslokasjoner håndteres automatisk og vises ikke i denne listen.
Hvert lagersted viser hvor mange ruller som fortsatt er knyttet til det, og kan
gis nytt navn uten at koblinger eller historikk endres.

Når antallet tilknyttede ruller vises som en lenke, åpner den **Lager** med et
eksakt filter for lokasjonens uforanderlige ID. Resultatet tar med både ruller
som står der nå, og ruller som har stedet som hjemmeplassering, selv om en utlånt
rull for øyeblikket står på en teknisk utlånslokasjon. Filterbrikken viser navnet
på lagerstedet og kan fjernes for å gå tilbake til resten av lageret. Det vanlige
søket finner også lokasjonsnavn, men denne lenken unngår tvetydige treff mellom
steder med lignende navn.

**Arkiver** fjerner lagerstedet fra nye lokasjonsvalg, men sletter det ikke.
Rullene beholder både nåværende plassering og hjemmeplassering mot den samme
uforanderlige lokasjons-ID-en. Arkiverte steder ligger derfor sammenfoldet
under **Tidligere lokasjoner**. **Gjenopprett** gjør nøyaktig den samme
lokasjonen valgbar igjen; en ny lokasjon med samme navn er et annet objekt og
overtar ikke de gamle koblingene. Bruk den sammenfoldede avanserte
sammenslåingen når alle koblinger faktisk skal flyttes til et annet lagersted.

**Slett** vises bare når databasen bekrefter at lagerstedet ikke har noen
nåværende plasseringer, hjemmeplasseringer eller underlokasjoner. Kontrollen
omfatter også skjulte eller mykt slettede ruller som fortsatt har lagerstedet
som hjemmeplassering. Sletting kan brukes direkte på både aktive og arkiverte
egne lagersteder, kan ikke angres og fjerner lagerstedet permanent. Eksisterende
historikkhendelser beholdes som historiske spor. Hvis en ny kobling oppstår før
bekreftelsen, avviser databasen slettingen uten å endre lageret.

Programmet husker kort-/listevisning og om avanserte filtre er åpne på denne
enheten. Nullstilling av filtre endrer ikke valgt visning. Når du åpner lav
beholdning fra Oversikt kan listevisning brukes midlertidig uten å erstatte den
lagrede innstillingen.

Slik lager du en etikett for én rull:

1. Åpne detaljene for rullen i Lager og finn QR-panelet.
2. Velg **Lag QR-etikett**.
3. Velg P-Touch 24 mm, Kompakt, Standard, Utvidet eller **Egendefinert**.
4. For en egendefinert etikett angir du bredde og høyde og kontrollerer
   forhåndsvisningen.
5. Velg **Lagre PNG i Nedlastinger** for å lagre det utskriftsklare bildet med
   300 DPI.

P-Touch-profilen bruker et liggende arbeidsområde på 60 × 24 mm med QR-kode i
nesten full høyde og stor, lesbar identitetstekst. Egendefinerte etiketter støtter
bredde fra 45 til 150 mm og høyde fra 24 til 80 mm i trinn på 0,5 mm. De må være
liggende: Bredden må være minst 20 mm større enn høyden og minst 1,6 ganger
høyden. Valgt størrelse og de sist gyldige egendefinerte målene huskes lokalt på
denne enheten, slik at de brukes igjen for andre ruller og i senere økter.

For flere ruller samtidig velger du **Velg flere** under **Lager**, merker
rullene og bruker **Lag etikettark for valgte ruller**. Bruk **Lag etikettark
for hele lageret** i lagerkontrollene når alle tilgjengelige ruller skal med.
Etikettark bruker alltid 60 × 24 mm og påvirkes ikke av de lagrede egendefinerte
målene.

Arbeidsområdet **Lager → Ønskeliste og bestillinger** har egne statusfiltre og
søkefelt. Det viser antall treff, lar deg flytte kjøp mellom Ønskeliste, Bestilt
og Mottatt, lagerføre en ankommet vare som fysisk rull og fjerne planer som ikke
lenger er aktuelle.

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
6. Angi en valgfri forventet returdato.
7. Bekreft utlånet.

Når rullen er utlånt:

- rullen vises som Utlånt
- den skjules fra vanlig tilgjengelig lager
- den kan ikke behandles som ordinært printerklart lager før den er returnert
- historikken viser hvem som lånte den, når den gikk ut og hvor mye som gikk ut

En forventet returdato må være en gyldig kalenderdato og kan ikke ligge før
dagens dato når utlånet opprettes. Aktive utlån viser **Forventet retur** og
merkes **Forfaller i dag** eller **Forfalt** når det er aktuelt. Forfalte utgående
utlån vises også under **Krever handling** på Oversikt og åpner Utlån for videre
oppfølging. Returdatoen og kontaktopplysningene beholdes i den returnerte
historikken.

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

**Rapporteringsperiode** står som standard på **Siste 30 dager**. Du kan velge
90 dager, **Siste 12 måneder** eller et egendefinert intervall der både start- og
sluttdatoen er med. Perioden styrer printerknyttet totalforbruk, loggførte og
feilede jobber, registrert forbruk fordelt på eierskap, detaljer per printer og
filament og materialkostnad. **Aktive lastede spor** og **Lagerverdi** er derimot
nåbilder. Utlånspanelene og forbruksprognosen bruker sine egne datagrunnlag og
endres ikke av periodevelgeren. Hvis en Client er koblet til en eldre Host som
ikke kan levere perioderapporten, viser programmet en oppdaterings- eller
tilkoblingsmelding i stedet for å konstruere tall lokalt.

Området **Verdi og kostnad** viser to beslektede, men bevisst adskilte tall:

- **Lagerverdi** er et nåbilde av aktive spoler. For hver spole brukes
  `gjenværende vekt × innkjøpspris ÷ startvekt`.
- **Materialkostnad** gjelder valgt rapporteringsperiode. For hver manuelle eller
  automatiske forbruksrad brukes `brukt vekt × innkjøpspris ÷ startvekt`.

Summer holdes alltid adskilt etter innkjøpsvaluta og mellom eid og innlånt
beholdning. Filament Manager konverterer ikke valutaer og lager ikke en
misvisende totalsum på tvers av dem. Rader uten tilstrekkelig pris- eller
vektgrunnlag behandles ikke som null: dekningspanelet viser hvor mange rader og
gram som kunne verdsettes, og hvilke felt som mangler eller er ugyldige.

Åpne sporingen for å følge en sum tilbake til spolen og, for materialkostnad,
forbruks- og printerreferansen. Av hensyn til responsivitet returnerer sporingen
maksimalt 2 000 deterministisk sorterte rader, som grensesnittet viser i mindre
bolker. Summer og dekning inkluderer likevel alle aktuelle rader. Når en Client
er koblet til en Host fra før denne rapporten ble innført, ber den om
Host-oppgradering i stedet for å anslå verdier lokalt.

**Forbruksprognose** er et deterministisk estimat som alltid bruker eid
beholdning og registrert forbruk av eget filament de siste 30 dagene, uavhengig
av valgt rapporteringsperiode. Den viser estimert antall dager med dekning,
mulig tomdato, forventet forbruk de neste 30 dagene, estimert beholdning etter
30 dager, antatt dagsforbruk og hvor mange eide ruller som inngår. Innlånte,
tomme, tapte og fjernede ruller er utelatt. Hvis det ikke finnes nok registrert
forbruk, vises ingen tomdato. Prognosen er bare veiledende og oppretter aldri
ønskelisteposter eller bestillinger automatisk.

### Innstillinger

Innstillinger er delt i flere områder.

Generelt:

- programversjon
- automatiske oppdateringsvarsler og beholdt manuell oppdateringssjekk
- valgfri bakgrunnskjøring ved lukking og oppstart ved innlogging
- tema: Auto, Lys, Mørk, Bambu, Prusa
- språk, valgt fra én kompakt liste

**Auto** følger fortsatt operativsystemet, mens **Lys** og **Mørk** beholder det
eksisterende nøytrale uttrykket. **Bambu** og **Prusa** er lekne, uoffisielle og
mørkbaserte hyllester med gjenkjennelige grønne eller oransje detaljer; de
innebærer ingen tilknytning til eller godkjenning fra produsentene. Fargene
bygger på Bambu Labs publiserte [Bambu Green
`#00AE42`](https://us.store.bambulab.com/products/abs-filament?variant=40475105460360)
og Prusas publiserte [medieressurser og
profilmanual](https://www.prusa3d.com/page/media-assets_987/), der Prusa Orange
er definert som `#FD5000`.

Desktop-appen og Companion lagrer temavalget lokalt og uavhengig på hver enhet
eller i hver nettleser. Et valg på den ene flaten endrer derfor ikke den andre.
Temafargene brukes på programskallet, kontroller, markering og fokus. Fargene
for filamenter, materialmerker, statuser og andre lagerprøver er fortsatt
datastyrte og erstattes aldri av valgt tema.

Filamentstandarder:

- grenser for lav beholdning, med standardgrense og materialspesifikke unntak
- én standard kjøpsvaluta med trebokstavskode, for eksempel NOK eller EUR
- sammenleggbare prisgrupper med antall ruller og prisdekning
- kontrollert masseprising av et selvvalgt utvalg

Prisgruppene bygges fra lagerets egne masterdata: leverandør, materiale,
produktserie og nominell rullvekt. Farge deler ikke gruppen. Dermed vises for
eksempel Bambu Lab PLA Basic og PLA Matte, eller eSUN PLA+ og PLA+HS, som egne
prisgrupper. Generic og små leverandører følger den samme regelen; en unik
produktserie blir ganske enkelt en gruppe med én rull. Programmet henter eller
gjetter ikke en nettpris.

Angi og lagre en pris på gruppen, velg deretter én av to handlinger:

- **Bare manglende priser** beholder alle eksisterende priser. Den setter pris
  og valuta der begge mangler, og kan fylle inn manglende valuta uten å endre en
  eksisterende pris. En rull uten pris som allerede har en annen valuta, krever
  manuell oppfølging.
- **Oppdater valgte priser** erstatter pris og valuta på de valgte rullene etter
  en egen gjennomgang som viser hvor mange eksisterende og individuelt satte
  priser som blir overskrevet.

Du kan fjerne enkeltruller fra utvalget før kjøring. Innlånte ruller endres
ikke. Historiske ruller, som tomme, tapte eller manglende ruller, er synlige,
men velges aldri automatisk eller via gruppevalget. I **Bare manglende priser**
kan du bevisst krysse av historiske ruller som mangler pris, én og én. Pris,
valuta og beskyttelseslås lagres da samlet; rullen kan ikke senere overskrives
fra en prisgruppe. Historiske ruller kan ikke velges i **Oppdater valgte
priser**, og en eksisterende historisk pris endres aldri gjennom denne
særregelen.

Når en rull får status Tom, Tapt, Mangler eller Arkivert, aktiveres
prisbeskyttelsen automatisk. Eldre historiske rader får den samme beskyttelsen
ved oppstart, og låsen beholdes hvis rullen senere aktiveres igjen. Dette sperrer
gruppeprising, men ikke en bevisst manuell prisendring i rulldetaljene.

Etterpå vises en kvittering med oppdaterte og uendrede ruller. Den historiske
rullen merkes som beskyttet og kan åpnes direkte i rulldetaljene. Andre rader
som krever manuell oppfølging kan også åpnes derfra. Hvis en rull endres etter
gjennomgangen, avbrytes hele operasjonen før første skriving, slik at en gammel
gjennomgang ikke overskriver nyere data.

I rulldetaljene kan du fortsatt sette en individuell pris. Aktiver **Beskytt
individuell pris mot gruppeoppdateringer** når standardfanen aldri skal
overskrive denne rullen. Låsen hindrer begge gruppehandlingene, men sperrer ikke
manuell redigering. En låst rull blir forklart og lenket i kvitteringen. De gule
radene for manglende kjøpspris eller kjøpsvaluta i **Statistikk → Verdi og
kostnad** åpner den relevante kontrollen i Filamentstandarder. En Client viser
Hostens grupper og standarder skrivebeskyttet; endringene utføres på Hosten.

Desktop-appen og Companion støtter engelsk, norsk bokmål, tysk, fransk,
spansk, brasiliansk portugisisk, italiensk, polsk, nederlandsk, tsjekkisk,
forenklet kinesisk, tradisjonell kinesisk, japansk, koreansk, tyrkisk,
ukrainsk, russisk, ungarsk, svensk, dansk og finsk. Språkvalget lagres lokalt
for hver flate. Alle valgbare språk har komplette kataloger for både desktop og
Companion og vises uten Beta-merking. Engelsk er fortsatt kanonisk kildespråk og
en siste inline-sikring ved kjørefeil, men publiserte kataloger kan ikke være
avhengige av manglende engelske rader. Korrigeringer til
community-oversettelsene kan foreslås via det egne
[skjemaet for oversettelsesfeil](https://github.com/bliatun-code/Filament-Manager/issues/new?template=translation.yml)
eller pull requests på GitHub. Språklisten holdes nå fast mens de eksisterende
ikke-engelske katalogene får community-rettelser og faktisk språkfaglig
gjennomgang.

De to valgene under **Innstillinger → Generelt → Bakgrunnskjøring** aktiveres
hver for seg. Aktiver **Fortsett å kjøre når jeg lukker vinduet** for å skjule
hovedvinduet bak Filament Manager-ikonet i menylinjen på macOS eller
systemstatusfeltet i Windows i stedet for å stoppe programmet. Dette gjelder
bare når ikonet er tilgjengelig; ellers avsluttes programmet som normalt når
vinduet lukkes.

Mens vinduet er skjult, forblir Rust-bakgrunnsoppgavene for Companion,
vertstilgang og Bambu-forbruksovervåkning aktive så lenge brukerøkten er aktiv og
maskinen er våken. Venstreklikk på ikonet eller velg **Åpne Filament Manager**
fra menyen for å hente frem vinduet. Velg **Avslutt Filament Manager** for å
stoppe prosessen; menytekstene følger valgt grensesnittspråk. Starter du
Filament Manager på vanlig måte, hentes også den eksisterende instansen frem og
får fokus i stedet for at en ny database-/serverprosess åpnes.

Aktiver **Start i bakgrunnen når jeg logger inn** for å starte programmet skjult
for den aktive brukerkontoen. Hvis ikonet i menylinjen eller systemstatusfeltet
er utilgjengelig ved oppstart, åpnes hovedvinduet i stedet, slik at prosessen ikke
blir utilgjengelig. På macOS må programmet flyttes ut av det nedlastede diskbildet
før valget aktiveres. Installasjon i **Programmer** gir innloggingsoppføringen en
stabil filsti; valget kan ikke aktiveres mens programmet kjører fra et diskbilde
eller en midlertidig App Translocation-sti. Operativsystemets egne innloggings-
eller oppstartsinnstillinger kan fortsatt deaktivere oppføringen uavhengig av
programmet.

Ingen av valgene installerer en operativsystemtjeneste. Programmet kjører ikke
videre etter utlogging, avslåing eller mens maskinen sover. En desktop
konfigurert som Klient er utformet for å pause frontend-timerne for oppdatering
fra verten mens vinduet er skjult og starte dem igjen når vinduet hentes frem;
Rust-bakgrunnsoppgavene beskrevet over forblir aktive. På macOS bruker
avslutning fra programmenyen eller statusmenyen den koordinerte
avslutningsflyten. Operativsystemets opprinnelige avslutningsveier, som
**Avslutt** fra Dock-menyen, og tvungen avslutning er best-effort og kan hoppe
over denne oppryddingen.

Release-versjoner med en konfigurert offentlig metadatakanal kan sjekke
automatisk når **Sjekk automatisk** er aktivert. Sjekken skjer etter en kort
forsinkelse ved oppstart og maksimalt én gang per 24 timer. Bare en nyere
versjon gir et banner; oppdatert versjon og feil er stille. Velg **Senere** for
å skjule banneret foreløpig, eller **Vis utgivelsen** for å åpne den faste
releasesiden for Filament Manager.

Knappen **Se etter oppdateringer** beholdes når du vil ha uttrykkelig status,
også for en deaktivert kanal eller utilgjengelige metadata. Nedlasting og
installasjon er alltid manuelle valg. `v0.22.0`-installasjonene ble bygget før
den offentlige kanalen ble konfigurert, og trenger derfor én manuell
brooppgradering før automatiske varsler kan fungere.
Innstillinger husker også sist brukte fane på denne enheten, mens direkte
snarveier fra Oversikt fremdeles åpner riktig fane.

Slik lager du etikettark for rullene som er på lager:

1. Åpne **Lager** og velg **Lag etikettark for hele lageret** i
   lagerkontrollene. For et nøyaktig delutvalg velger du **Velg flere**, merker
   rullene og bruker **Lag etikettark for valgte ruller**.
2. Velg A4 eller US Letter.
3. Kontroller forhåndsvisningen, og bruk sidekontrollene dersom lageret dekker
   flere sider.
4. Velg **Lagre PDF i Nedlastinger**.

Hver side rommer opptil 30 etiketter med samme lesbare oppsett på 60 × 24 mm som
P-Touch QR-etiketten. Dette batchoppsettet er fast og bruker ikke den
egendefinerte størrelsen som er lagret i byggeren for enkeltetiketter. For én
rull, eller for en annen etikettstørrelse, åpner du QR-panelet for rullen under
**Lager** og velger **Lag QR-etikett**.

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
- lett, skrivebeskyttet discovery som finner tilgjengelige materialtyper uten å importere noe
- oppdatering av én valgt materialtype om gangen
- ingen automatisk utgått- eller livssyklusmarkering fra discovery eller oppdatering
- farge-/swatch-data
- eldre og forhandler-tilgjengelige katalogelementer beholdes søkbare

Programvedlikehold:

- sikkerhetskopi
- import/eksport
- reset/vedlikeholdsfunksjoner
- validering av data før større flytting mellom roller
- applikasjons- og databasediagnostikk
- personvernfiltrert support-JSON

Åpne **Innstillinger → Programvedlikehold → Applikasjonsdiagnostikk** for å se
app- og databaseskjemaversjon, SQLite `quick_check`, fremmednøkkelkontroll,
journalmodus, databasestørrelse og den lokale databasebanen etter at du
uttrykkelig viser den. Bruk **Last ned
sanitert supportfil** når du trenger en kompakt JSON-fil til feilsøking.

Supportfilen inneholder ikke databaseinnhold eller lokal databasebane. Den
utelater også navn, IP-adresser, printerserienumre, tokens, QR-/RFID-verdier og
rå printertelemetri. Den inneholder bare overordnet helsestatus og
personvernfiltrerte driftshendelser, i tillegg til build-commit, target og
distribusjonskanal. URL-en til oppdateringsmetadata tas ikke med. Dette er noe
annet enn en full sikkerhetskopi, som inneholder private bibliotekdata og ikke
bør deles som diagnostikk.

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

Startvekt eller gjenstående vekt må være et positivt heltall i gram; null,
negative tall og desimaltall avvises med en synlig valideringsmelding.

For katalogbaserte ruller fyller programmet ut materiale, farge, leverandør, standardvekt og swatch der data finnes. For manuelle ruller skriver du inn dette selv.

### Bambu Filament Code

Bambu-esker har en femsifret `Filament Code` på eskeetiketten, for eksempel `53400`.

I Bambu-flyten:

- skriv eller lim inn koden i katalogsøket for å velge én aktiv katalogmatch
- velg manuelt hvis samme kode finnes på flere aktive katalogelementer
- legg inn ett entydig utgått treff som old stock, eller velg riktig rad når en utgått kode har flere katalogtreff
- bruk manuell registrering hvis ingen katalogelementer bruker koden ennå

Desktop/client har også en Filament Code-batchmodal i Bambu-flyten. Lim inn én kode per linje, bruk det lille skann/skriv-feltet for å legge til én oppdaget kode om gangen, legg til strekkodeverdier fra et stillbilde, eller la webkameraet stå på mens du viser Bambu-eskeetiketter én etter én. Live-skanning gir tilbakemelding i video-overlayet når en kode legges til, fortsetter å skanne etter neste etikett og unngår å gjenta samme synlige etikett før du flytter den bort. Hvis en strekkode inneholder en femsifret Filament Code, legges koden inn som en klar rad eller vurderingsrad; hvis den bare inneholder en annen strekkodeverdi, blir råverdien stående synlig for manuell vurdering. Programmet viser hvilke rader som er klare og oppretter rader med et klart katalogtreff, inkludert ett entydig utgått old-stock-treff. Tvetydige aktive treff, utgåtte koder med flere mulige katalograder, ugyldige koder eller manglende koder blir stående for manuell vurdering.

Batch-opprettede Bambu-ruller bruker lagerdetaljene på høyre side av modalen, inkludert eierskap, eier/kontakt for Innlånt, vekt og plassering. Companion/webapp bruker samme kataloglogikk for manuelt kodeoppslag, men bruker ikke kamera eller webkameraskanning.

Se [Camera And Batch Scanning](CAMERA_AND_BATCH_SCANNING.md) for en kort fremgangsmåte, støttede inndatametoder og kamerafeilsøking. Desktop/client samler kode-, bilde- og webkamerabasert strekkodeinput i den samme vurderingsbaserte batchflyten. Skanneren leser strekkoder og Filament Codes, ikke vilkårlig etikettekst med OCR.

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

Bruk statusfanene for å avgrense køen og søkefeltet for å finne et planlagt kjøp
etter navn, farge eller leverandør. Når en bestilling kommer, velger du hvor mange
ruller som ble mottatt og trykker **Lagerfør rull nå**. I mottaksdialogen kan du
også registrere pris per rull, valutakode med tre bokstaver, kjøpsdato, batchkode og
leverandørreferanse. De samme normaliserte opplysningene lagres på hver rull i
dette mottaket; prisen er en enhetspris, aldri totalsummen for bestillingen.
Programmet oppretter det valgte antallet fysiske ruller atomisk, reduserer
gjenstående antall og markerer ønskelisteraden som Mottatt først når ingenting
gjenstår. En validerings- eller historikkfeil lar både lager og ønskeliste være
uendret.

Åpne detaljene for en rull for å rette eller fjerne innkjøpsopplysningene senere.
Endringen inngår i den samme beskyttede lagringen som de andre rulldetaljene og
registreres i rullhistorikken. Eldre rader som allerede har pris uten valuta, kan
beholde nøyaktig samme pris mens andre mottaksfelt endres; endring av prisen krever
valuta. Lagerets CSV-/JSON-eksport og full backup tar med alle innkjøpsfeltene,
leverandør, vektdata, spolevekt og prisbeskyttelse.
Her kan du også beskytte den individuelle prisen mot gruppeoppdateringer fra
Filamentstandarder; beskyttelsen følger rullen i full backup.
**Fjern** sletter bare ønskeliste-/bestillingsraden; den sletter ikke en lagerrull.

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
5. Vent på at live-data fra printeren oppdateres automatisk.
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

For støttede Bambu-modeller kan Live settes opp som et valgfritt andre steg
mens printeren legges til fra Printere-siden. Du kan hoppe over steget og
konfigurere eller endre Live senere på printerkortet under **Innstillinger ->
3D-printere**.

### Konfigurasjon

Typisk oppsett:

1. Åpne **Printere** og velg **Legg til printer**.
2. Velg riktig Bambu-modell, navn og AMS-kapasitet, for eksempel 1 AMS x 4
   spor, og velg deretter **Fortsett**.
3. Aktiver Live-status i det valgfrie steget **Bambu Live**. Hvis du vil hoppe
   over Live, lar du funksjonen være deaktivert og legger til printeren som
   vanlig.
4. Fyll inn printerens IP/host, serienummer og tilgangskode.
5. Velg **Kontroller identitet**. Sammenlign observert serienummer og
   fingeravtrykk før du velger **Godkjenn denne identiteten**.
6. Velg **Legg til skriver med Live**, åpne deretter live-detaljene og
   kontroller at AMS-spor vises.

Hvis du ikke kjenner host eller serienummer, legger du først til printeren uten
Live og åpner deretter kortet under **Innstillinger -> 3D-printere**. Aktiver
Live og velg **Finn Bambu-printere** på det private LAN-grensesnittet som når
printeren. Den korte passive skanningen viser lokalt annonserte printernavn,
serienumre og adresser. Når søket finner nøyaktig én printer for et nytt
oppsett, fylles host og serienummer automatisk inn i det ulagrede skjemaet uten
å endre noe som allerede er skrevet i tilgangskodefeltet. Hvis flere printere
blir funnet, velger du **Bruk til oppsett** ved riktig printer. Skriv deretter
inn tilgangskoden og fullfør den samme eksplisitte identitetskontrollen før du
lagrer.

Live Bambu status er lokal og leser printerdata fra samme nettverk. Den bør konfigureres på host-maskinen når du bruker Vert/Klient-oppsett.

Den første identitetskontrollen sender ingen autentiseringsdata: programmet gjør
bare et TLS-håndtrykk for å lese printersertifikatet. Access code blir ikke lest
eller sendt før konfigurert serienummer og lokalt godkjent offentlig
nøkkelfingeravtrykk samsvarer med den samme TLS-forbindelsen. En endret
identitet stopper forbindelsen og krever eksplisitt ny paring. Access code
lagres i macOS-nøkkelringen eller Windows Credential Manager, ikke i
bibliotekdatabasen eller en flyttbar sikkerhetskopi.

### Godkjenning kreves etter oppgradering

En aktiv integrasjon som ble opprettet før godkjenning av TLS-identitet ble
innført, har ingen lagret godkjenning. Etter oppgradering forblir den offline
til printeridentiteten er kontrollert; programmet sender ikke tilgangskoden
først. Oversikt viser **Bambu Live trenger oppfølging** for hver berørt printer.
Velg meldingen for å åpne akkurat denne printerens Live-editor under
**Innstillinger -> 3D-printere**, kjør **Kontroller identitet**, sammenlign
serienummer og fingeravtrykk med printeren du forventer, godkjenn identiteten
eksplisitt og lagre.

Den samme handlingen vises på Oversikt hvis en tidligere godkjent identitet
endres. Ikke godkjenn et uventet serienummer eller offentlig
nøkkelfingeravtrykk bare for å få Live-status tilbake; kontroller printeren og
nettverket først.

### Finn printeren etter at IP-adressen har endret seg

Hvis ruteren gir en tidligere konfigurert og godkjent printer en ny adresse,
kan Live-observatøren gjenopprette den automatisk etter at den gamle
tilkoblingen feiler uten å presentere en annen TLS-identitet. Gjenoppretting i
bakgrunnen er frekvensbegrenset per printer, skanner private LAN-grensesnitt og
vurderer bare annonser med det lagrede serienummeret. Før en ny adresse lagres,
må både serienummeret og den tidligere godkjente offentlige nøkkelen (SPKI)
samsvare over TLS. Tilgangskoden blir aldri lest eller sendt.

Hvis automatisk gjenoppretting ikke finner og verifiserer printeren, åpner du
det lagrede kortet under **Innstillinger -> 3D-printere** og bruker **Finn
Bambu-printere** på det private LAN-grensesnittet. Skanningen lytter etter
lokale printerannonser i opptil tolv sekunder og viser annonsert serienummer, slik
at du kan skille ellers like printere fra hverandre.

For en lagret printer uten andre ulagrede endringer er **Gjenopprett lagret
adresse** bare tilgjengelig ved en kandidat med samme lagrede serienummer.
Før ny adresse lagres, utfører programmet en TLS-identitetskontroll: både
printersertifikatets serienummer og tidligere godkjent offentlig
nøkkelfingeravtrykk må samsvare. Access code blir ikke sendt. Hvis en av
identitetsverdiene har endret seg, skal adressen ikke gjenopprettes; kontroller
printeren og gjennomfør vanlig eksplisitt ny paring i stedet.

Oppdagelsen er et oppsetthjelpemiddel, ikke identitetsbevis. Den forutsetter at
vert og printer er på samme valgte private LAN og at printeren er våken nok til
å annonsere seg. Hvis ingen printer vises, kontroller valgt grensesnitt, lokal
brannmur/nettverksisolering og prøv igjen før du legger inn adressen manuelt.

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

Når et stort sprang avvises, står den lagrede vekten urørt. For en lastet
Bambu-rull med fersk og entydig RFID-match kan du åpne **Oppdater vekt** for å
sammenligne lagerverdien med AMS-estimatet. Dialogen viser estimert
filamentvekt, tara for tomspolen og tilhørende totalvekt. **Bruk AMS-estimat**
registrerer en eksplisitt vektkorrigering; den oppretter ikke en kunstig
printjobb eller fører hele forskjellen som dagens forbruk.

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

AMS-handlingen er med vilje snevrere enn en manuell innveiing. Den er bare
tilgjengelig for ferske live-data fra det lastede sporet, en eksakt RFID-match
og samme lagerrull. AMS-prosenten er fortsatt et estimat; bruk fysisk vekt og
feltet for målt vekt når nøyaktig vekt er viktig.

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
- bevaring av eldre katalogelementer uten automatisk utgått-markering

Katalogelementer er maler. En fysisk rull er en egen lagerpost basert på en katalogmal eller manuell registrering.

Programmet leveres med en lokal seed-katalog for kjente filamenter. Den gjør at eldre ruller fortsatt er søkbare selv om produsenten ikke lenger viser dem i nettbutikken. Seed-katalogen er normalisert og ryddet for rene case-duplikater, slik at for eksempel samme eSUN-farge ikke dukker opp både som `BLACK` og `Black`.

Katalogreparasjon gjenoppretter den innebygde seed-katalogen og fjerner bare ubrukte ikke-seedede katalograder. Ruller på lager, ønskelistekoblinger, utlån, printerdata, RFID, plasseringer og historikk skal bevares.

**Finn tilgjengelige materialtyper** gjør en liten, avgrenset og
skrivebeskyttet kontroll av nettbutikken til Bambu eller eSUN. Kontrollen
importerer ingen produkter og endrer verken katalogmetadata eller
livssyklusstatus. Hvis kilden er blokkert, tom eller ufullstendig, beholdes den
forrige listen over tilgjengelige materialtyper.

For Bambu leser dette søket bare den komplette, paginerte katalogoversikten og
åpner ingen produktsider. Når du etterpå oppdaterer én valgt materialfamilie,
leser programmet offentlig produktmetadata bare for produktene i den familien.
Forespørslene er sekvensielle, har en fast sikkerhetsgrense og gjentas ikke
automatisk ved feil eller sperre.

Etter et vellykket søk velger du nøyaktig én materialtype og oppdaterer den.
Større vedlikehold deles dermed i små, forsiktige forespørsler. Verken søket
eller materialoppdateringen markerer automatisk produkter som utgått eller
historiske; eldre produkter forblir søkbare for ruller som fortsatt finnes hos
brukeren eller i forhandlerleddet.

I Klient-modus ber desktop-appen om opptil 5 000 katalograder fra Verten i
stedet for å avkorte listen ved 1 000. Valgfritt serversøk sendes videre til
både gjeldende og kompatible eldre vertsruter, samtidig som forespørselen er
avgrenset. Dermed er den innebygde seed-katalogen og vanlige tillegg på verten
tilgjengelige i flyten for å legge til filament.

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

Sikkerhetskopipanelet viser når denne enheten sist fullførte en validert
nedlasting av en full sikkerhetskopi. Tidspunktet er bare et lokalt
aktivitetshint; appen leser ikke den nedlastede filen senere, og opplysningen
blir ikke med i den flyttbare sikkerhetskopien.

Den lokale databasen bruker skjemaversjon 5. Før appen skriver til en eksisterende
database ved oppstart, gjennomfører den en skrivebeskyttet kompatibilitetskontroll
av skjemaet og SQLite `quick_check`. En database med nyere skjema, eller en som
ikke består integritetskontrollen, stoppes i stedet for å bli overskrevet uten
varsel.

Før en eksisterende database uten registrert skjemaversjon eller med skjema v1,
v2, v3 eller v4 oppgraderes automatisk til skjema v5, oppretter og verifiserer appen
en lokal gjenopprettingskopi. En verifisert kopi opprettes også før full
gjenoppretting og før lagringsmigreringer som erstatter eller slår sammen en
eksisterende database. Hvis kopien ikke kan opprettes og verifiseres, fortsetter
ikke oppgraderingen, gjenopprettingen eller migreringen.

Fullstendige JSON-sikkerhetskopier er laget for å kunne flyttes. De tar med
bibliotekdata som lager, historikk, katalogdata og printerprofiler, men utelater
maskinlokale tilgangsopplysninger og paringstilstand. Bambu Live-tilkobling,
lokale nettverksinnstillinger, desktop-klientøkter og Companion-/nettleserparinger
må konfigureres eller pares på nytt på målmaskinen. Importen ignorerer også
maskinlokale tilgangsopplysninger eller paringer i eldre sikkerhetskopier.
Filen inneholder fortsatt lagerdata, QR-/RFID-referanser og utlånsdetaljer, så
behandle den som private data selv om den ikke inneholder brukbare
enhetslegitimasjoner.

Det flyttbare formatet heter fortsatt `filament-manager-backup-v1` og registrerer
versjonen til appen og databaseskjemaet som eksporterte filen. Eldre v1-backuper
uten denne metadataen kan fortsatt importeres. Hvis en backup uttrykkelig oppgir
en skjemaversjon som er nyere enn den installerte appen støtter, stopper
validering og import før det aktive biblioteket endres. Den registrerte
appversjonen er til informasjon og blokkerer ikke i seg selv en kompatibel
gjenoppretting.

Når du velger en gyldig full sikkerhetskopi, ber appen om bekreftelse fordi
gjenopprettingen erstatter det aktive biblioteket. Den verifiserte
gjenopprettingskopien som er beskrevet ovenfor, lagres ved siden av den aktive
databasen.

I motsetning til den flyttbare eksporten er gjenopprettingskopien en lokal kopi
av hele databasen før gjenoppretting og kan inneholde maskinens
tilgangsopplysninger og paringer. Hold appdatamappen privat.

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
- Konfigurer det valgfrie Bambu Live-steget mens du legger til en støttet
  printer, eller aktiver det senere fra printerkortet i Innstillinger.
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
