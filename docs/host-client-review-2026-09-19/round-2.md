# Host/Client – uavhengig kritikk, runde 2

Runde 2 for den avgrensede Host/Client-oppfølgingen. Ingen nye poeng er satt før faktisk retest. Runde 1 og dens funn beholdes i egen rapport.

## Fast testrekkefølge

1. Uparret Client: riktig forklaring i innstillinger, lager og detaljdialog; intet nytt skriveforsøk før tilstand er lest.
2. Host A: fersk lenke etter tidligere ugyldig forsøk, riktig navn på klienttypen, ny parring og første Dashboard-innlasting.
3. Tilkoblet Client: kontrollrull 700 g, kjent Host-navn, samme bibliotek og historikk. Ingen sammenblanding med lokal Client-rull 333 g.
4. Kontrollert Host-brudd med frontend frosset: innstillinger, cache, rullhistorikk og konkret skrivefeil. Start samme Host igjen og gjenopprett med synlig handling. Et avvist utkast skal ikke spilles av.
5. Tilbakekall bare gjeldende navngitte testklient på Host A. Kontroller autorisasjonsfeil, cache og reparringsinstruks på Client.
6. Separat Host B hvis klar: bekreft annet navn og bibliotek, prøv støttet bevisst vertsskifte og sjekk kontrollmarkører. Skill forventet nytt bibliotek fra en faktisk mismatch.
7. Én samlet vurdering med samme sju kriterier og tydelig dekning. Full tilgjengelighetsgodkjenning krever mer enn de tilgjengelighetstrærne og feltene som er observert.

## Observerte resultater

Nybygd Client ble åpnet i uparret tilstand. Settings viste Not paired og deaktivert tom parringsknapp. Dashboard viste ærlig cached Host-snapshot og gamle korrekte 10/4, uten falske nullverdier i denne observerte oppstarten. Dette er en varm-cache-observasjon; første ferske snapshot er ennå ikke testet.

Lagerlisten viste fortsatt «UI Review Host A. Host is unavailable. Showing the last cached inventory snapshot», selv etter besøk i Settings med Not paired, mens A kjørte. Modal for kontrollrullen på 700 g viste derimot korrekt «Pair this desktop client with the host before running protected sync actions». Falske nullhendelser var erstattet med «The request could not be completed». HC-F7 er derfor bare delvis rettet ved dette punktet. En egen Refresh-knapp i modal gir ikke en direkte vei til parring.

Host A, som ennå ikke var omstartet etter tidligere HMR-feil, fikk blank innholdsside ved Dashboard → Web app running. Nybygd Client kunne åpne Settings normalt. Implementeringsagenten er bedt om kontrollert omstart av A for å avklare gammel runtime-tilstand før testen fortsetter. Ingen scoring av denne uavklarte mellomtilstanden.


Etter kontrollert omstart av A fungerte Settings normalt. Den gamle blanke siden var ikke reprodusert i ren prosess. Host-panelet viste «Client pairing», forklaring for både desktop og browser, CLIENT NAME, Paired clients og Revoke client access. Fersk lenke merket «UI Review Client renewed» paret Client til A etter det tidligere ugyldige forsøket. Tokenfeltet forsvant og Current host viste UI Review Host A + Paired. HC-F2 er observert rettet i normalflyten.

Dashboard etter reparring viste 10 ruller / 4 assigned, Connected to UI Review Host A og Live host snapshot. Skjermbildet viste toppen av siden og riktig status; ingen falske nuller ble observert. Siden dette var varm cache, er helt ny førstegangsinnlasting fortsatt en separat begrensning for HC-F3.


Det rene R2-nettbruddet stoppet bare A; Client og frontend var uendret. Settings beholdt UI Review Host A, viste Paired i nøytral grå og «Host is unavailable. Changes cannot be saved until it reconnects. Check the host and network, then refresh.» En vanlig Refresh-knapp var tilgjengelig uten Advanced. Direkte screenshot viste hele denne tilstanden. HC-F5 er rettet i den observerte bruddflyten.

Lager beholdt timestampet cache. Rullmodal viste samme tydelige nettverksvarsel og utilgjengelig historikk som feil, uten «0 events», «No weight samples yet» eller «All changes are saved». Forsøk med 850 g total ble avvist med «Failed to update weight»; tittelen beholdt 700 g. Den generiske skrivefeilen blir fortsatt tydeliggjort av modalens nettverksvarsel. Escape lukket modal og utkast uten lagring. HC-F6 er forbedret gjennom faktisk brudd, med recovery-kontroll igjen.


## Gjenoppretting, tilbakekalling og faktisk Host B

Etter at A ble startet med samme database, trykket jeg den vanlige Refresh-knappen i Client Settings. Feilbanneret ble erstattet av «Host snapshot refreshed» og «Host is reachable on UI Review Host A». Ingen ny parring, HMR eller appomstart på Client. Kontrollrullen hadde fortsatt 700 g og to hendelser. Deretter ga et nytt eksplisitt 850 g total-forsøk 650 g netto og tre hendelser. Det tidligere avviste forsøket ble ikke køet.

Host viste to autoriserte testgrants. Tilbakekalte bare «UI Review Client renewed» gjennom navngitt kontroll og eksplisitt bekreftelse. Resultatet ble én Authorized og én Revoked, med navngitt historikk. Client Settings viste korrekt «Re-pair required» og «Host is reachable, but desktop client pairing must be refreshed». Forsøk på å lagre 800 g total ble avvist, og 650 g ble beholdt.

**HC-F7 gjenstår også etter vertsrevokering:** Både cached lagerliste og rullmodal forklarte nå dette som «Host is unavailable» og anbefalte nettverk/Refresh. Settings hadde samtidig korrekt kunnskap om at Host var nåbar og autorisasjonen måtte fornyes. Etter lokal fjerning var modalteksten riktig, men listebanneret feil; etter vertsrevokering er begge feil. Dette er et konkret, samlet behov for målrettet runde 3. Ingen faktisk skriving etter tilbakekalling ble tillatt.

Host B viste Running og aktiv parringsknapp ved første faktiske inspeksjon. Ingen OS-dialog eller mDNS-hinder trengte handling. «Renew pairing» på Client fjernet den tilbakekalte A-parringen og ba forståelig om fersk lenke. Jeg brukte en ny vanlig lenke fra B. Client viste Current host UI Review Host B, B-adresse og Paired. Dashboard viste B sine seks on-hand-ruller og fire assigned. Lager viste HOST B kontrollrull 444 g, færre ruller og ingen ekstra A-kontrollrull. Dette er et bevisst støttet vertsskifte; en fremprovosert library-ID-mismatch ved uventet vertsbytte er ikke testet.

På B sin `spool_demo_100001` lagret Client målt total 620 g minus tare 200 g som 420 g. UI bekreftet lagring på Host, viste tre hendelser og B-adresse i QR-målet. Implementeringsagentens separate databasekontroll bekreftet B-rullen 420 g, samme rull-ID på A fortsatt 800 g, A sin ekstra kontrollrull 650 g og begge lokale Client-kontroller 333 g. Beviset er lagret i evidence/round-2-host-switch.json.

Etter byttet ble også Loans, Printers og Statistics åpnet i den faktisk tilkoblede Client. Låneoversikten viste én aktiv 640 g-rad og forventet dato. Printerkortet viste HOST B kontrollrull og 24 g ny registrert bruk. Statistikk viste én jobb / 24 g i inneværende periode og forklarte manglende priser som manglende datadekning. Dette utvider navigasjonsdekningen, men er ikke en ny full låne-/statistikkfunksjonstest.

## Karakterer etter runde 2

Kriterierekkefølge og vekter er uendret: oppgave 25 %, informasjon 20 %, navigasjon 15 %, tilbakemelding 15 %, visuelt 10 %, tilgjengelighet 10 %, robusthet 5 %.

| Område | R1 | Oppgave | Informasjon | Navigasjon | Tilbakemelding | Visuelt | Tilgjengelighet | Robusthet | R2 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Parring og bibliotekidentitet | 7,50 | 9 | 8 | 8 | 8 | 8 | 7 | 8 | 8,15 |
| Client-navigasjon og skrivehandlinger | 7,55 | 9 | 8 | 8 | 8 | 8 | 7 | 8 | 8,15 |
| Lokale og vertsstyrte innstillinger | 8,05 | 8 | 8 | 8 | 9 | 8 | 7 | 8 | 8,05 = |
| Nettbrudd og gjenoppretting | 7,20 | 9 | 8 | 8 | 8 | 8 | 7 | 8 | 8,15 |
| Feilparring, fjerning og tilbakekalling | — | 8 | 6 | 8 | 7 | 8 | 7 | 8 | 7,35 |

«=» betyr videreført fra de observerte R1-oppgavene; ingen ny eksport eller temaprøve ble utført i R2. Feil-/tilbakekallingsområdet fikk første samlede karakter nå som oppgavene faktisk ble utført. Det er først og fremst feil nettverksforklaring ved manglende eller tilbakekalt autorisasjon som holder området under målet. Funksjonell skrivebeskyttelse fungerte.

Tilgjengelighetsgrunnlaget er fortsatt begrenset. Escape-lukking etter avvist handling ble faktisk testet og virket. Dette erstatter ikke en full tastatur- og VoiceOver-prøve. HC-F1 sin spesielle mDNS-feiltilstand ble ikke gjenskapt; normal aktiv Host-visning er observert. Helt fersk Client uten cache og en bevisst fremprovosert bibliotekmismatch gjenstår som egne grenser. Det er derfor ikke grunnlag for en ubetinget «alt bestått»-påstand.

## Målrettet neste kontroll

Kun HC-F7 krever en ny rettingsrunde etter dette: tydelig manglende/tilbakekalt parring i cached liste og modal, med neste steg som leder til ny parring. Retest både lokal Remove og vertsrevokering, samtidig som et vanlig nettbrudd fortsatt får nettverksforklaring. Behold den verifiserte skrivebeskyttelsen. Eventuelle nye karakterer må knyttes til denne retesten, ikke til kodeendringen alene.
