# Host/Client – målrettet kritikk, runde 3

Denne runden retester bare HC-F7 etter samlet rettelse: skille mellom uparret, tilbakekalt og reelt utilgjengelig Host i cached lagerliste og detaljdialog. Ingen nye poeng før faktisk kjørende UI er observert.

## Kontrollrekkefølge

1. Bruk gjeldende B-parring og tilbakekall bare UI Review Client B fra Host B.
2. Les lagerliste og modal direkte, uten først å besøke Settings; riktig parringstilstand må ikke kreve at brukeren vet om diagnosepanelet.
3. Følg neste steg til ny parring og bruk en fersk B-lenke.
4. Fjern parring lokalt og kontroller samme liste-/modaltilstand, deretter gjenopprett med fersk B-lenke.
5. Stopp bare Host B og kontroller at et faktisk nettbrudd fortsatt beskrives som nettbrudd, uten å slette gyldig parring. Start B igjen og gjenopprett uten ny parring.

## Observerte resultater

Host B tilbakekalte bare gjeldende UI Review Client B. Client ble deretter åpnet og navigert direkte Dashboard → Inventory, uten først å besøke Settings. Dashboard viste Re-pair required. Lagerliste viste UI Review Host B + «Pair this desktop client with the host before running protected sync actions» og tidspunkt, med Add spool deaktivert. Modal viste samme riktige parringsforklaring og utilgjengelig historikk som feil, ikke tomme data.

Forsøk på 610 g total ble avvist med samme presise parringsmelding. Tittel beholdt 420 g; ingen falsk lagret-status. Escape lukket utkastet. Renew pairing i Settings og ny B-lenke gjenopprettet Paired og riktig Host-navn.

Deretter ble parringen fjernet lokalt gjennom Remove pairing. Både cached liste og modal viste korrekt parringpåkrevd, ikke nettbrudd. Enda en fersk B-lenke gjenopprettet gyldig parring. HC-F7 er nå observert rettet for både lokal fjerning og vertsrevokering. En reell nettverksregresjon gjenstår før avslutning.

Lavere prioritert rest: Liste- og modalbanneret tilbyr Refresh, men ingen direkte knapp til parring. Brukeren må gå via Settings → Library & web app eller Dashboard-knappen. Forklaringen er riktig, men navigasjonen er mindre direkte enn den kunne vært.


Regresjonsprøven stoppet bare Host B mens gyldig parring var aktiv. Lagerliste viste kjent B-navn, cached snapshot og timestamp. Modal viste korrekt Host unavailable / cannot save / check network, og historikken viste utilgjengelig forespørsel, ikke falskt tomt datasett. Settings beholdt UI Review Host B og Paired med nettverksvarsel og Refresh. Dermed ble en ren nettverksfeil ikke feilaktig gjort til manglende parring. Ingen skriveendring ble forsøkt i dette siste bruddet; det var allerede dekket med faktisk avvist vekt og ren recovery i R2.


Etter B-start trykket jeg én vanlig Refresh i Client Settings. «Host snapshot refreshed» og «Host is reachable on UI Review Host B» erstattet bruddvarslet. Paired og riktig Host-navn ble beholdt uten ny lenke. Den målrettede regresjonskontrollen besto.

## Avsluttende matrise for det avgrensede oppdraget

Samme kriterier og vekter gjennom alle tre runder: oppgaveløsning 25 %, informasjon 20 %, navigasjon 15 %, tilbakemelding 15 %, visuelt 10 %, tilgjengelighet 10 %, robusthet 5 %. Siste kriterievektor står i samme rekkefølge.

| Område | Runde 1 | Runde 2 | Runde 3 / siste | Siste kriterievektor |
|---|---:|---:|---:|---|
| Parring og bibliotekidentitet | 7,50 | 8,15 | 8,15 = | 9 / 8 / 8 / 8 / 8 / 7 / 8 |
| Client-navigasjon og skrivehandlinger | 7,55 | 8,15 | 8,15 = | 9 / 8 / 8 / 8 / 8 / 7 / 8 |
| Lokale og vertsstyrte innstillinger | 8,05 | 8,05 = | 8,05 = | 8 / 8 / 8 / 9 / 8 / 7 / 8 |
| Nettbrudd og gjenoppretting | 7,20 | 8,15 | 8,15 | 9 / 8 / 8 / 8 / 8 / 7 / 8 |
| Feilparring, fjerning og tilbakekalling | — | 7,35 | 8,00 | 9 / 8 / 7 / 8 / 8 / 7 / 8 |

«=» betyr videreført vurdering fra sist faktisk dekkede oppgaver, ikke en påstått ny fullgjennomgang. «—» betyr området ennå ikke var fullført i runde 1. Nettbrudd ble retestet i runde 3 og beholder sin karakter. Feil-/tilbakekallingsområdet når 8,00 fordi normal fornying, lokal fjerning, revokering og skrivebeskyttelse nå fungerer med riktig forklaring. Navigasjon får fortsatt 7: ingen direkte parringssnarvei i banneret. Dette er en konkret forbedringsmulighet, men hindret ikke oppgavene.

Alle fem observerte hovedområder i dette avgrensede native Host/Client-oppdraget er dermed på minst 8. Det betyr ikke at hvert enkelt kriterium eller enhver plattform er minst 8. Tilgjengelighet står fortsatt på foreløpig 7, med begrenset AX-/felt-/Escape-prøving og uten full VoiceOver- eller tastaturgjennomgang.

## Gjenstående grenser og mindre forbedringer

- HC-F1 sin aktive Host med mislykket stabil lokal adresse er ikke gjenskapt etter rettelsen. Vanlig aktiv mDNS/Host fungerte; dette er ikke visuell retest av selve feiltilstanden.
- HC-F3 er retestet med varm cache, reparring og bytte til annet bibliotek uten falske nuller. En helt ny Client uten noen cache under kontrollert treg førsteinnlasting ble ikke prøvd etter rettelsen.
- Host B-skiftet var bevisst og støttet. En fremprovosert identitetsmismatch/sen feilrespons er ikke en manuell UI-test her; eventuelle automatiske sikkerhetskontroller må rapporteres separat.
- Ekstern katalogimport, destruktivt vedlikehold, full skjermleserprøve, Windows/Linux og fysisk printerbruk er utenfor denne gjennomførte retesten.
- En direkte «Åpne parring»-knapp fra authbanneret ville gjøre gjenoppretting lettere. Nå må brukeren navigere via vanlige innstillinger eller Dashboard-status.
- Feil ved detaljhistorikk er ærlig, men fortsatt generisk «The request could not be completed»; konteksten over forklarer årsaken.

Ingen ny alvorlig feil er observert i de kontrollerte oppgavene. Bibliotekautoriteten og avvist skriving er faktisk kontrollert mot separate syntetiske data, ikke bare utledet fra kode.

## Opprydding

Etter siste beståtte Refresh fjernet jeg parringen lokalt på Client. Host A sin siste testgrant ble tilbakekalt, og UI viste 0 Authorized / 2 Revoked. B sine to gjenværende testgrants ble tilbakekalt etter at listen bekreftet at begge var egne UI Review-grants; B viste 0 Authorized / 3 Revoked. Prosessene ble ikke lukket av kritikeren.

Kjent syntetisk Client-eksport: `filament-manager-backup-1789855037809.json`, med kontrollkopi i testmappen. Rollebytteeksportene ble også laget i Downloads i R1; deres eksakte filnavn ble ikke notert i UI-loggen. De må identifiseres mot syntetisk bibliotekinnhold før eventuell opprydding. Ingen tilfeldig eller produksjonsrelatert eksport skal fjernes.
