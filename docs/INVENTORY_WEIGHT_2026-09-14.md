# Målt rullvekt og automatisk reaktivering – 14. september 2026

## Endring

Etter PR #119 var veiing fortsatt en sekvens av vekt/forbruk og eventuell reaktivering. Et feilende statuskall kunne etterlate vekten lagret og rullen fortsatt tom. Printerforbruk ble dessuten beregnet fra UI-ets gamle restvekt. Vektflyten bruker nå én `ROLL_WEIGHT`-operasjon i den eksisterende umiddelbare lagertransaksjonen.

Transaksjonen verifiserer status, lokasjon, hjemmelokasjon, aktivt lån, nøyaktig printerspor, forventet restvekt og effektiv tare. Netto filament beregnes fra målt total og autoritativ tare. Endret grunnlag avvises før skriving. Utlån og fjernede ruller avvises; innlån bevares. Vekt, forbruk, prisbeskyttelse, historikk og eventuell reaktivering fullføres eller rulles tilbake samlet.

For en rull i printeren registreres reduksjon i netto filament som forbruk. Økt eller tidligere ukjent vekt er en målekorreksjon uten oppdiktet forbruk. Sporet beholdes. En tom rull med positiv måling reaktiveres til ASSIGNED hvis den fortsatt står i printeren, ellers IN_STOCK. En mistet rull blir fortsatt mistet etter veiing. En uendret måling er en no-op; et historisk prisvern oppheves ikke ved reaktivering. Felles eksisterende målelogikk er flyttet til `database_measured_weight.rs` og brukes fortsatt av printeroperasjoner og vanlig vektoppdatering.

## Dialog og Host

Dialogens innsendinglås og callbacks følger den åpne rullen, Host-målet og det gjennomgåtte målegrunnlaget. Dobbeltinnsending og gamle callbacks/svar etter A→B→A kan ikke overta en ny operasjon. En bekreftet kvittering beholdes selv om oppfriskningen feiler. Samme måling sendes ikke automatisk på nytt; en ny måleverdi kan fortsatt lagres etter en bekreftet no-op. En endret rullvekt eller tare krever nytt grunnlag. Feil vises i rullens dialog.

Client krever `inventory-roll-weight-v1` og samme gjennomgåtte målgenerasjon gjennom helsesjekk og POST. En eldre Host får en oversatt oppdateringsmelding før sending. Ingen lokal eller sekvensiell reservevei benyttes. Oppdater Host før denne Client-vektflyten brukes. Kvitteringen må bekrefte 0–1 endrede ruller med samsvarende historikkantall. Etterfølgende cachefeil endrer ikke en bekreftet skriving til skrivefeil.

## Verifisering

Baseline mot den gamle produksjonshooken avviste alle tre nye ettkommando-scenarioene: lagerrull, tom rull og rull tildelt en ekstern Host-printer. Etter rettelsen består Chromium-testene med produksjonens WeightInput og hook: målt total, forventet tare/restvekt/spor, Host-generasjon, dobbeltinnsending, retry, sene svar, grunnlagsbytte og A→B→A, fire typer oppfriskingsfeil, no-op etterfulgt av ny verdi, innlån, utlån, ugyldig kvittering og ugyldige tall.

Seks SQLite-tester verifiserer forbruk, netto vekt, bevart spor/lokasjon/QR, tom/reaktivert rull, innlån, prisvern, no-op, endret restvekt/tare/spor, fjernede ruller og full rollback ved injiserte feil i siste forbruks-, vekt- eller statushistorikk. Testdatabasene har egne serienumre slik at samtidige tester ikke deler fil når systemklokken returnerer samme tidspunkt.

Fire native loopback-TCP-tester verifiserer reell Host-skriving og uendrede Client-domenedata, gammel Host, feil/manglende generasjon, paring, målbytte, endret spor, sen historikkfeil og ugyldig kvittering uten replay.

Lokal verifisering besto bygg/lint, 392 Companion-tester, 896 skripttester, tilgjengelighets- og lånedialogkontroller, 1 827 UI-tester og 23 ytelsestester. Lokaliseringsporten krevde deretter en ny QA-oppføring for den nye teksten; alle 21 kataloger var generert/kompilert og hadde bestått lasting, formatering, nøkkel-/placeholder- og runtime-tester i disse suitene. Ledgeren er knyttet til beregnede kilde-, katalog- og runtime-fingeravtrykk. Dette er automatisk katalog-QA, ikke ny morsmålsvurdering eller skjermbildematrise. Deretter besto `npm run check:contracts`, `npm run doctor` og hele `npm run test:rust`: 725 desktop-, 15 native-service-, 313 kjerne- og 3 generatortester, totalt 1 056, samt formatering og Clippy i debug/release. Eksisterende miljøavhengige ignorerte tester er uendret. CI på den signerte committen dokumenteres i PR-en etter kjøring. Testene er automatiserte og bruker syntetiske data. Ingen release, migrering eller avhengighetsendring er del av pakken.
