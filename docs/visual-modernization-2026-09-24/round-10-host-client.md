# R10: faktisk Host/Client, 24. september 2026

Uavhengig kritiker betjente to isolerte native testbundler gjennom CUA. Host/Client hadde separate bibliotek-ID-er og samme kontrollrull med henholdsvis800g og333g. Ingen ekte printertilgang. Kun Dark er visuelt kontrollert i denne familien; de tre øvrige temaene gjenstår.

## Faktisk forløp og bevis

Alle bilder ligger i `tmp/visual-modernization/critic-r4-interactive/` og er åpnet/inspisert av kritikeren.

| Bilde | Observert resultat |
|---|---|
| host-pairing-ready-r10.png | Ordinær Create pairing link gir navngitt, tidsbegrenset lenke og QR. |
| client-paired-r10.png | Client viser Paired, korrekt Host-navn og grønn reachable-status. |
| client-host-authority-800-r10.png | Client viser Host sin grønne kontrollrull og800g, ikke lokal333g. |
| client-host-singlepoint-777-r10.png | Client lagrer977g gross/777g net på Host. Ett grafpunkt ligger korrekt mellom500/1000g med samme tidspunkt i begge ender. |
| client-fallback-dashboard-r10.png | Etter avsluttet Host vises cached snapshot med klokkeslett og gul tilkoblingsstatus. |
| client-offline-weight-error-r10.png | Detalj beholder777g, viser Host unavailable/Refresh. Avvist966gross gir lokal feil, utkast966 består. |
| client-recovered-retry-766-r10.png | Host gjenstart, Refresh og ordinært nytt Save gir766g og grønn Host-bekreftelse. |
| host-authorized-client-r10.png | En autorisert klient, navn/opprinnelse/paringsdato/sist sett og Revoke. |
| host-revoke-confirm-r10.png | Navngitt inlinebekreftelse forklarer stenging av sesjoner. |
| host-revoked-history-r10.png |0Authorized/1Revoked, lesbar historikk med tidspunkt og opprinnelse. |
| client-revoked-write-refused-r10.png |955gross avvises etter revoke,800net og utkast955 består. |
| client-repair-required-r10.png | Settings viser Re-pair required, Renew pairing og forklaring om ny paring. |

Read-only SQLite-kontroll etter første lagring viste Host777/Client333. Etter recovery og UI-restaurering var Host800/Client333. Resultat i `tmp/visual-modernization/client-host-authority-r10.json`. Kontrollrullens historikk har tre tilsiktede testhendelser. Paringen er tilbakekalt ved avslutning; Host kjører fortsatt.

## Vurdering, ti kriterier

H=hierarki,T=typografi,L=layout,F=farge/kontrast,K=konsistens,V=finish,I=interaksjon,R=responsivitet,D=data,A=tilgjengelighet. IE betyr utilstrekkelig bevis og er ikke bestått.

| Flate/state, Dark | H | T | L | F | K | V | I | R | D | A |
|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| Host lenke/QR |9|9|9|9|9|9|9|IE|9|IE|
| Client paired/Host-authority |9|9|9|9|9|9|9|IE|9|IE|
| Client enkeltpunktgraf |9|9|9|9|9|9|9|IE|9|IE|
| Cached dashboard/detalj og recovery |9|9|9|9|9|9|9|IE|9|IE|
| Host revoke/bekreftelse/historikk |9|9|9|9|9|9|9|IE|9|IE|
| Tilbakekalt Client: lagringsfeil |9|9|9|9|9|9|8|IE|9|IE|
| Client Re-pair required i Settings |9|9|9|9|9|9|9|IE|9|IE|

Konkret I8: etter at Host tilbakekaller tilgang mens detaljen er åpen, får lagringsforsøket bare «Failed to update weight». Feilen forklarer verken tapt paring eller hvordan brukeren kommer videre. Settings har korrekt re-pair-forklaring, men brukeren må finne den selv. Root varslet. Ingen feilaktig dataskriving observert.

Gjenstående: Light/Bambu/Prusa-bilder av disse faktiske statene; smal bredde/tastatur; Renew pairing/re-pair fullført; browser QR-direkteinngang. Native51×4-bildene med tom klientliste dekker ikke disse statene. Tidligere856-layout8 og andre A/R8 beholdes åpne til eksplisitt retest. Ingen sluttgodkjenning.

## R12 actual guidance retest

After the localized re-pair patch, the same actually revoked Client still showed Re-pair required in Settings. Inventory then loaded its cached host control800g. A fresh955gross Save failed with **“Pair this desktop client with the host before running protected sync actions.”** in both the amber banner and local red error. No Settings→Library route was shown. Draft955 and persisted800 remained intact. This is a different settled pairing-required path than the originally generic failure; I8 remains open until the actual path guides recovery. R12 actual image (lokalt bevis: `tmp/visual-modernization/critic-r4-interactive/client-revoked-guidance-retest-r12.png`). Root notified to include this mapping. No new pairing or backend write occurred in this retest.


## R12 guard rettet – faktisk retest

Ny avvist Save955 etter kjent tilbakekalling viser nå lokal Settings → Library & web app og instruksjon om kortlivet pairinglenke. Draft955 beholdes, persistert800 fortsatt i header. Bildet critic-r4-interactive/client-revoked-guidance-fixed-r12.png er individuelt inspisert. Øvre amberbanner i detaljen har fortsatt gammel korttekst uten sti; inventory authority banner har korrekt sti. Re-pair etter denne tilbakekallingen gjenstår.

Lokale bevisfiler i `tmp/` følger ikke den publiserte rapporten. Referansene identifiserer historiske lokale opptak, ikke nedlastbare vedlegg.
