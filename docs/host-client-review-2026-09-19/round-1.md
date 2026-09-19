# Host/Client – uavhengig kritikk, runde 1

Ny avgrenset oppfølgingsvurdering, startet 19. september 2026. To egne native testbundler, `Filament Review Host.app` og `Filament Review Client.app`, separate syntetiske databaser. Ingen produksjonsdata. Kriterier og vekter følger critic-plan.md.

Runde 1 er avsluttet før samlet retting og kontrollert restart. Karakterene nedenfor gjelder observerte baselineoppgaver i faktisk tilkoblet native Client. Noen tekstrettelser kom via HMR underveis; de regnes ikke som en full retest.

## Observerte starttilstander og oppgaver

- Host Dashboard viste 10 totalruller og 4 assigned. Client Dashboard viste 7 totalruller og 4 assigned. Begge startet Standalone med webapp av. Separate appidentiteter gjør at native CUA-klikk fungerer i begge vinduer; forrige oppdrags targetingproblem er dermed ikke reprodusert.
- HC01: Åpnet Host-veiviser og avbrøt. Standalone og webapp av ble beholdt. Dialogen beskrev Host-konsekvensen, backup/validering var Pending, og Switch var deaktivert.
- HC02: Åpnet veiviseren igjen, utførte full eksport. Begge steg ble Done, med eksplisitt automatisk validering. Eksport har ingen filvelger i denne flyten og bruker vanlig Downloads; dette er notert slik at implementeringsagenten kan flytte den egne syntetiske filen til testmappen etterpå. Første Switch viste én ekstra bekreftelse; andre utførte rollebyttet.
- Under lagring forsvant backupstegene og knappen viste Saving. Etter venting ble Host aktiv. Ingen datatap eller blanding av bibliotek observert.
- Navnet «This device» ble redigert til «UI Review Host A», med Unsaved changes, aktiv Save device name, og til slutt Saved + Device name saved.
- Client ble åpnet og navigert til Library & web app; den er fortsatt Standalone og har ikke vært endret eller parret.

## HC-F1 – P2: Nettverksdetaljer beskriver aktiv vert som deaktivert

Etter Host-bytte viste hovedbanneret «Web app server turned on». Webapp-status ble «Check» fordi registrering av stabil lokal adresse feilet. Advarselen forklarte korrekt at tjenesten kjørte på sin direkte IP og at parring ventet på stabilt navn.

Åpne Network details: Direct address viste den valgte private adressen med port 4291, interface en0. Samtidig viste Stable local address-delen teksten «No LAN URL is exposed while trusted-LAN mode stays disabled». Det motsier både aktiv Host/webapp og adressen like under.

Akseptanse: Når webapp er aktiv men stabilt navn ikke er tilgjengelig, skal teksten forklare den tilstanden. Den må ikke si at trusted-LAN er deaktivert. Direkte diagnostikkadresse og manglende stabil adresse må holdes språklig atskilt. En synlig, trygg neste handling eller forklaring på automatisk retry bør gjøre tilstanden mulig å komme videre fra uten unødvendig portendring.

Bevis: Native CUA-visning i oppgaven, Settings → Library & web app → Network details og Edit network. Edit network var deaktivert for uendrede verdier; ingen egen Retry-kontroll ble observert. Produktkode for tekstvalget ble deretter bekreftet av implementeringsagenten.

## Miljøavvik – ikke produktfeil uten videre

Første mDNS-registrering ga «local service registration timed out», og Create pairing link ble deaktivert. Implementeringsagenten fant at de håndlagde testbundlene manglet de faktiske produktnøklene NSLocalNetworkUsageDescription og NSBonjourServices i Info.plist og bare hadde lenkerens ad-hoc-signatur. Begge testbundler klargjøres nå med produktets normale metadata/signering før ny start.

Parringsfeilen poengsettes derfor ikke som produktsvikt på dette grunnlaget. HC-F1 er derimot en konkret motsigelse i den observerte feiltilstanden, uavhengig av hva som utløste registreringsfeilen. Ingen OS-nettverksbeskyttelse eller sikkerhetspolicy ble omgått.

## Videre faktisk tilkoblet gjennomgang

Etter korrekt signering og produktmetadata startet Host med Running og aktiv parringsknapp. Client ble deretter byttet til Client gjennom den samme backup-/valideringsgaten. Et ufullstendig «not-a-link» ga forståelig instruks om å lime inn full lenke; Not paired ble beholdt. Fersk `.local`-lenke paret klienten korrekt. Current host viste «UI Review Host A», korrekt adresse og Paired. Tokenfeltet forsvant etter suksess.

Dashboard lastet Hostens 10 ruller / 4 assigned i stedet for klientens opprinnelige 7. Lager viste «HOST kontrollrull» 800 g og fant `host_review_control_0`. Målt totalvekt 950 med tare 200 ble lagret som 750 g, med eksplisitt «Weight updated on the host library». SQLite bekreftet Host 750 g og klientens lokale `client_review_control_0` uendret 333 g, uten lokal Host-rull. Host UI viste også 750 g etter normal navigasjon.

Filamentstandarder på Client forklarte at valuta/terskler styres på Host og hadde deaktivert lagring. Vedlikehold forklarte at full backup kommer fra Host, mens import/reset/repair er deaktivert. Faktisk Client-eksport inneholdt Host-kontrollrullen på 750 g og ikke klientens lokale kontrollrull. Filen er kopiert til `tmp/host-client-review/client-export-of-host.json`. Katalogpanelet i gjeldende kjørende versjon sier at både swatch-retting og katalogoppdatering sendes til Host; dette er videre funksjonalitet enn den tidlige kodehypotesen i planen. Ingen ekstern katalogimport ble utført.

Client fikk Light-tema; Host beholdt Dark. Begge appene kunne navigeres uavhengig. Host viste én autorisert «UI Review Client» etter parringen.

## HC-F2 – P2: Host omtaler en fungerende native parring som kun nettlesertilgang

Host-siden har Browser access pairing, «one browser at a time», «Browser-only access», feltet BROWSER NAME, Paired browsers og «Revoke browser access» selv når den opprettede lenken brukes til en native desktop Client. Den normale lenken fungerte faktisk i Desktop client pairing på klienten. Dette er ikke bare en hypotese basert på kildekode.

Akseptanse: Host forklarer at samme flyt støtter browser og desktop Client, med konsistent enhetsnavn og tilbakekalling. Behold eventuelle reelle skiller i tillatelser uten å bruke misvisende browser-only-tekst.

## HC-F3 – P2: Første Client-dashboard fremstiller uavklart Host-innlasting som tom lokal database

Rett etter vellykket parring åpnet jeg Dashboard uten samtidig HMR. Før Host-data kom, viste siden 0 ruller, «Synced from local DB», «Add rolls» og «Update the host to show 12-month history». Neste observasjon viste korrekte 10 ruller, Connected to UI Review Host A og Live host snapshot. Dette er en kort, men konkret feil i innlastingspresentasjonen; ingen vedvarende datamangel.

Akseptanse: Uavklart første snapshot vises som innlasting, ikke et ekte tomt lokalt bibliotek eller en påstand om gammel Host-versjon. Et allerede lastet gyldig snapshot kan beholdes under refresh med ærlig status. Navigasjon bør ikke arve en så langt nedrullet posisjon at sidens nye status og tittel skjules.

## HC-F4 – fixtureavvik under undersøkelse: Navneendring avlastet en rull

På Client: Settings → 3D printers → Reconfigure «Nova QA». Endret bare PRINTER NAME til «Nova QA Client review». Modell Prusa MK4S, MMU3 units 1 og filaments per MMU3 5 ble ikke endret. Save ga «Updated printer ...» uten advarsel om slotendringer.

Før handlingen viste Client lager `spool_demo_100005` som «Nova QA · MMU3 · Channel 1», 900 g. Etter lagring viste Host lager samme rull i «QA Dry box». SQLite bekreftet status IN_STOCK og location_id QA Dry box. Dette oppsto på datatilkoblede, syntetiske data gjennom vanlig UI.

Akseptanse: En ren navneendring bevarer alle slot-ID-er, tildelinger og rullstatus. Bare en faktisk kapasitetsendring som krever det kan endre slotoppsettet, og må ha presis forklaring/bekreftelse. Retest både fra Client og Host, med minst én lastet rull, og kontrollér faktisk lagring. Ingen fysisk maskin må kjøres.


Etter analyse fant implementeringsagenten at fixture-enheten het `qa_printer_prusa_mmu_1`, mens vanlig produkt-oppretting bruker `_ams_1` også for Prusa. Oppdateringen erstattet denne ikke-kanoniske enheten. Derfor er dette **ikke et bekreftet produktfunn** for normal navneendring. Etter nettbruddsprøven skal en rull tildeles det vanlige nye slotet gjennom UI, og deretter skal ren navneendring gjentas. Først dette avgjør produktklassifisering.

## HC-F5 – P2: Offline bibliotekinnstillinger mister kjent Host-navn og gir teknisk feil

Da implementeringsagenten stoppet bare test-Host, viste Client Library & web app Current host «Unknown», selv om UI Review Host A var kjent før bruddet. Grønn Paired ble beholdt. Feilbanneret viste en lang transportdiagnose med health-endepunkt i stedet for tydelig forklaring om at Host må startes eller bli tilgjengelig igjen.

Advanced viste derimot korrekt CACHED og tidspunkt for sist innlastet snapshot. Akseptanse: Behold kjent vertsnavn ved midlertidig nettbrudd; skill autorisasjon («parret») fra faktisk nettverkstilgang; vis forståelig neste handling, og legg tekniske detaljer i avansert diagnostikk.

## HC-F6 – P2: Offlinekontekst forsvinner i rullmodalen

Lagerlisten viste korrekt «Host is unavailable. Showing the last cached inventory snapshot» med tidspunkt og Refresh. Åpnet kontrollrullen på 750 g: modalens Save var aktiv, og offlinevarslet var ikke videreført. Historikk viste «0 events» og «No weight samples yet» selv om rullen nettopp hadde én lagret vektendring. Bunnteksten viste «All changes are saved».

Forsøk på å lagre målt total 900 g ga «Failed to update weight», mens overskriften beholdt 750 g. Ingen falsk bekreftelse på vektlagring. Utkastet ble lukket før Host-start, slik at vi kan kontrollere at et avvist forsøk ikke senere spilles av.

Akseptanse: Den cachede rullmodalen beholder tydelig offline-/utdatert-kontekst. Ikke tilgjengelig detaljhistorikk må ikke fremstilles som sikkert tom. Skriveknapper kan enten blokkeres med forklaring eller gi konkret «ikke lagret, Host utilgjengelig, prøv igjen etter tilkobling». Ingen lokal autoritativ lagring og ingen uannonsert kø.

## Recovery og avklaring av fixtureavvik

Host ble startet igjen med samme database. Samtidig remountet HMR Client fra Inventory til Dashboard. Etterpå var tilkoblingen live uten ny parring. Dette beviser beholdt autorisasjon, men ikke en helt ren refresh-recovery uten frontendendring; den prøven gjentas under frosset frontend i R2.

Kontrollrullen var fortsatt 750 g og hadde én historikkhendelse før et nytt, bevisst skriveforsøk. Målt total 900 g ble så lagret som 700 g, og UI viste to hendelser. Offlineforsøket var altså ikke køet eller utført senere.

HC-F4 normal flyt ble retestet i R1: Tildelte `spool_demo_100005` gjennom Client UI til det nye vanlige `qa_printer_prusa_ams_1_slot_1`, og endret deretter bare navnet til «Nova QA renamed safely». Rullen beholdt ASSIGNED, 900 g og samme slot. UI viste nytt navn og MMU3 Channel 1. Første avlasting var derfor knyttet til den ikke-kanoniske fixturen, og teller ikke som produktfeil i vurderingen.

## HC-F7 – P2: Uparret Client blir omtalt som nettverksfeil

Remove pairing ga korrekt «removed from this device», Not paired og nytt lenkefelt. I lageret ble Add spool deaktivert. Cached data kunne fortsatt leses.

Åpnet kontrollrullen og forsøkte 850 g total uten parring. Handlingen ble riktig avvist med beskjed om å pare desktopklienten før beskyttede handlinger; 700 g ble beholdt. Men cached-banner og det nye modalvarslet kalte dette Host unavailable og anbefalte å sjekke nettverk/Refresh, enda Host kjørte normalt. Dette er en autorisasjonstilstand med annet neste steg.

Akseptanse: Manglende/fjernet parring vises som «Pairing required» med vei til Library & web app. Reell utilgjengelig Host beholder nettverksforklaring. Historikk og skrivefeil følger samme skille. Ikke slå av lagringsbeskyttelsen for å forbedre teksten.

En allerede brukt engangslenke ble deretter avvist med «Invalid pairing link. Create a new pairing link on the host and try again.» Den samme innsendingen viste også grønn «Web app server turned off» fra et teknisk mellomsteg; dette er lavere prioritert forvirring ved mislykket sluttoppgave, ikke tegn på vellykket parring. Ny fersk lenke og vertsrevokering gjenstår ved dette tidspunktet.


## Baselinekarakterer og dekning ved avsluttet runde 1

Kriterierekkefølge: oppgaveløsning (25 %), informasjon (20 %), navigasjon (15 %), tilbakemelding (15 %), visuell konsistens (10 %), tilgjengelighet (10 %), robusthet (5 %). Vektet score er summen av kriterium ganger vekt. Dette er kritikerens vurdering av de konkrete observerte oppgavene, ikke en statistisk brukertest.

| Område | Oppgave | Informasjon | Navigasjon | Tilbakemelding | Visuelt | Tilgjengelighet | Robusthet | Vektet | Dekningsgrense |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Parring og bibliotekidentitet | 8 | 6 | 8 | 8 | 8 | 7 | 8 | 7,50 | Faktisk førstegangsparring, rollebytte, avbryt og Host-identitet. Misvisende browser-tekst trekker ned. Fersk re-parring gjenstår. |
| Client-navigasjon og skrivehandlinger | 8 | 7 | 8 | 7 | 8 | 7 | 8 | 7,55 | Dashboard, lager, vekt, printertildeling og navneendring observert. Skriving traff riktig Host; uavklart førstesnapshot ble feilaktig vist som tomt. Ikke full oppgavegjennomgang av lån/statistikk i denne vurderingen. |
| Lokale og vertsstyrte innstillinger | 8 | 8 | 8 | 9 | 8 | 7 | 8 | 8,05 | Lokal temapreferanse, deaktiverte vertsfelt og faktisk backup av Host verifisert. Ekstern katalogimport og destruktiv vedlikeholdskjøring er ikke utført. |
| Nettbrudd og gjenoppretting | 8 | 6 | 8 | 6 | 8 | 7 | 8 | 7,20 | Varm cache, avvist skriving, beholdt data og nytt eksplisitt forsøk. Ren recovery uten HMR må retestes. Uklart Host-navn og manglende modalkontekst trekker ned. |
| Feilparring, fjerning og tilbakekalling | — | — | — | — | — | — | — | Ikke fullført | Ufullstendig og brukt lenke ble avvist, lokal fjerning stanset skriving. Fersk re-parring og Host-tilbakekalling mangler; derfor ingen samlet karakter for området. |

Tilgjengelighet er vurdert begrenset ut fra native tilgjengelighetstre, lesbare etiketter, felt og dialogkontroller som faktisk ble brukt. Ingen full VoiceOver-prøve eller systematisk tastaturgjennomgang er gjort. Sju er en foreløpig vurdering av dette begrensede grunnlaget, ikke en påstand om full tilgjengelighetsgodkjenning. Andre operativsystemer er ikke testet.

Ingen skrivehandling traff feil bibliotek, ingen avvist lagring ble bekreftet som vellykket, og det avviste offlineforsøket ble ikke spilt av senere. Det er likevel ikke grunnlag for samlet 8/10: tre av fire foreløpig vurderte områder ligger under målet, og feil-/tilbakekallingsområdet er ufullført.

## Gjenstående kontroll i runde 2

- Frosset frontend og kontrollert omstart med ferdig validerte rettelser før ny kritikk.
- Retest av HC-F2, HC-F3, HC-F5, HC-F6 og HC-F7 gjennom reelle overganger. HC-F1 kan bare erklæres visuelt retestet dersom tilsvarende aktiv-men-uten-stabil-adresse-tilstand kan fremkalles trygt; ellers merkes kodekontroll og normaltilstand hver for seg.
- Fersk lenke etter ugyldig forsøk, ny parring etter lokal fjerning og tilbakekalling av bare den navngitte testklienten fra Host.
- Ett nytt kontrollert Host-brudd med ren refresh-recovery uten HMR. Kontroller vertsnavn, cache, detaljhistorikk og at avvist utkast ikke blir en skjult kø.
- Feil Host B / bibliotekmismatch er fortsatt ikke praktisk etablert og er et eksplisitt dekningshull. En gyldig parring til en bevisst valgt ny Host må ikke feilklassifiseres som identitetsfeil.

En mellomliggende HMR-rettelse ga blank Settings på grunn av en udefinert hook-variabel. Kritikeren oppdaget og lokaliserte dette; implementeringsagenten bekreftet diagnose med compile-check og retter før runde 2. Dette føres som fanget valideringsavvik, ikke som karaktertrekk for en ferdig løsning.

Bevisene for native oppgaver er de direkte skjerm- og tilgjengelighetstreobservasjonene i agentens CUA-logg. Rapporten hevder ikke at separate PNG-filer er lagret for alle stegene. SQLite og den egne syntetiske eksportfilen ble kun brukt som kontroll av faktisk lagringsmål etter UI-handlingene.
