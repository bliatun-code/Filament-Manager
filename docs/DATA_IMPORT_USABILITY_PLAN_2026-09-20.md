# Plan: import og gjenoppretting med befolkede testdata

Denne oppfølgingen tar de manuelle import- og gjenopprettingsflytene som ikke
inngikk i den brede UI- og Host/Client-gjennomgangen. PR #132 er fortsatt åpen
ved oppstart; ingen release eller merge inngår.

1. Bruk en egen native utviklingsapp, separat credential-profil og en syntetisk
   Standalone-database med ni ruller, printere, utlån og historikk. Ingen
   produksjonsdatabase eller fysisk printer brukes.
2. La en uavhengig kritiker prøve full eksport/validering, avbrutt og bekreftet
   gjenoppretting, CSV med både ny og eksisterende rull, ugyldige filer og
   korrigert nytt forsøk. Prøv tastatur/fokus i bekreftelsen der mulig.
3. Kontroller faktiske data med skrivebeskyttede databasespørringer og digest
   av sentrale tabeller før/etter. Skill additiv import fra full erstatning,
   og kontroller at feil eller avbrudd ikke gir delvis lagring.
4. Rett observerte hindringer og kjør relevante regresjoner. Gjenta berørte
   oppgaver med fryst kode, inntil fire runder. Mål: minst 8/10 for de fire
   observerte områdene uten alvorlig gjenværende feil. En god score erstatter
   ikke manglende manuell dekning.
5. Dokumenter funn, kriterier, dataresultater og grenser, rydd egne testfiler
   og prosesser, og lever signert commit med samlet push når pakken er klar.

Kriterier: oppgaveløsning 25 %, informasjon 20 %, navigasjon 15 %,
tilbakemelding 15 %, visuelt 10 %, tilgjengelighet 10 %, robusthet 5 %.
Scorene er agentbasert ekspertvurdering, ikke målinger fra sluttbrukere.
Full VoiceOver, andre operativsystemer, ekstern katalogimport og generelle
masseoperasjoner inngår ikke i denne avgrensede pakken.
