# Innkjøpsflyt: innsending og Host-bytte

Utgangspunkt: `e750978a` etter merge av PR #100. v0.30.0 er allerede publisert;
denne oppfølgingen endrer kildekandidaten til neste release.

## Funn og rettelse

En nettleserreproduksjon med den ekte React-hooken viste at to mottakskall i
samme render sendte to identiske `receive_wishlist_item`-kommandoer. Et utsatt
svar fra Host A kunne dessuten velge As rull og vise mottakskvitteringen etter
at Client hadde byttet til Host B.

Mottak, oppretting, statusendring og sletting i innkjøpskøen deler nå den
synkrone innsendinglåsen med vanlig registrering og Bambu-batch. Hver handling
eier sin aktive mål-/registreringsgenerasjon. Etter bytte eller avmontering
kan et gammelt svar ikke starte oppfriskning, vise suksess eller feil, eller
frigjøre en nyere handlings lås. En allerede sendt forespørsel kan fortsatt
fullføres på den opprinnelige Hosten; UI-beskyttelsen avbryter ikke transaksjonen.

Innkjøpspanelet får en ny komponentinstans ved bytte av autoritet. Mengder,
kjøpsmetadata og lokasjon fra en gammel mottakskladd følger derfor ikke en
vare med samme ID på den nye Hosten. Dialogen har også en synkron lås og
avviser ny innsending av en fullført kladd frem til et nytt mottak åpnes.

Et bekreftet mottak på gjeldende mål regnes fortsatt som gjennomført dersom
oppfriskningen feiler. Kvitteringen bruker Hostens antall og rull-ID-er;
oppfriskning sender ingen ny skriveforespørsel.

## Verifisering

- Før-reproduksjonen viste både to identiske skrivekommandoer og publisering
  av en gammel Hosts kvittering i den nye visningen.
- Regresjonene kjører den ekte hooken og innkjøpspanelet i React/Chromium.
  De dekker lokal/Host-transport, lokasjon og kjøpsmetadata, samtidige
  innsendinger, avvisning, oppfriskningsfeil og A→B→A med utsatte svar.
- Lokal kontroll bestod: 1 687 UI-tester, 800 skripttester, 23 ytelsestester,
  begge tilgjengelighetsporter, kontraktskontrollene, TypeScript-/UI-bygg
  og ESLint. Uavhengig gjennomgang av produksjonsendringene hadde ingen funn.
- Native macOS-/Windows-kontroller kjøres på PR-kandidaten i CI; tidligere
  releaseresultater regnes ikke som verifisering av disse endringene.
- Dette er automatiserte funksjonskontroller med syntetiske data. De måler
  ikke menneskelig fullføringsgrad, assistanse eller tidsbruk.
