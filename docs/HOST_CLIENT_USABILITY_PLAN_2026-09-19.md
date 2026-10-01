# Plan: datatilkoblet Host/Client-vurdering

**Historisk dokument.** Planen eller vurderingen nedenfor beskriver denne daterte runden. Senere kontroller og rettinger er fullført og merget gjennom PR #142–143. Dagens visuelle status og konkrete evidensarv står i [sluttmatrisen 1. oktober](visual-modernization-2026-10-01/critic-current-ledger.md); reelle restoppgaver står i [forbedringsplanen](IMPROVEMENT_PLAN.md). Tidligere karakterer og dekningshull beholdes som historikk.

Utgangspunkt: UI-pakken i PR #132, etter den brede gjennomgangen med fire runder.
Dette er en ny, avgrenset oppfølging av bibliotek/webapp (7,95) og manglende
manuell vurdering av en faktisk tilkoblet skrivebordsklient.

1. Opprett separate syntetiske Host- og Client-biblioteker med ulike identiteter,
   synlige kontrollruller og egne credential-profiler. Bruk to tydelig navngitte
   testapper og vanlig støttet `.local`-parring på privat grensesnitt. Ingen
   produksjonsdata, fysisk printer eller endring av sikkerhetsregler.
2. La en uavhengig kritiker gjennomføre parring, navigasjon, skrivehandlinger,
   rollebegrensede innstillinger og kontroll av riktig bibliotek. Dokumenter
   faktiske lagringer i Host og at Client-biblioteket ikke endres utilsiktet.
3. Test kontrollert stopp av bare test-Host, cached data, skriveforsøk uten
   forbindelse, gjenoppkobling, feil bibliotek og fjerning av testparring.
4. Prioriter konkrete hindringer, rett en sammenhengende pakke og kjør relevante
   regresjonstester. Gjenta de samme oppgavene med kritikeren. Start med to
   runder; bruk inntil fire ved konkrete funn. Siste rettelser skal observeres.
5. Lever kriteriescore, dekningsmatrise, før/etter og dokumenterte begrensninger,
   signerte commits og én samlet PR. Ikke merge eller lage release.

Kriterier og vekter er uendret: oppgave 25 %, informasjon 20 %, navigasjon 15 %,
feedback 15 %, visuelt 10 %, tilgjengelighet 10 % og robusthet 5 %. Målet er minst
8/10 per verifisert hovedflyt uten feil bibliotek, misvisende lagringsstatus eller
annen alvorlig gjenværende feil. Uverifiserte funksjoner får ingen antatt score.
Dette er agentbasert ekspertvurdering, ikke måling av faktiske sluttbrukere.

Masseoperasjoner og import/gjenoppretting er senere avgrensede oppgaver; denne
pakken prioriterer det største dekningshullet først.
