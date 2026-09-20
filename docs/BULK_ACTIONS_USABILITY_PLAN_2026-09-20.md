# Plan: massehandlinger i lageret

Følger opp den brede UI-vurderingens manglende manuelle dekning av bulkvarianter.
PR #132 er fortsatt åpen ved oppstart. Ingen release eller merge inngår.

1. Bruk en ny syntetisk Standalone-database med 72 ruller i den separate native
   review-appen. Seks tydelige kontrollruller, to lagerlokasjoner, tomme ruller,
   printertildelinger og aktive utlån gir både gyldige og beskyttede utvalg.
2. Uavhengig kritiker vurderer fire flyter: utvalg gjennom søk/filtre og eksport;
   flytting med endrede/uendrede ruller og avbryt; statusendring og synlighet av
   tomme ruller; avvisning av printer-/lånestyrte ruller og korrigert nytt forsøk.
3. Les faktiske dataverdier og historikk mellom UI-operasjoner. Ingen direkte
   databaseskriving under kritikerrundene. Kontroller at avbrudd og avvisning
   ikke gir delvis lagring, og at bare bekreftet utvalg blir endret.
4. Rett konkrete funn, kjør regresjoner og retest berørte oppgaver med fryst kode.
   Maks fire runder, mål minst 8/10 per observert flyt. Ingen karakter for
   oppgaver eller plattformer som ikke er prøvd.
5. Dokumenter bevis og begrensninger, stopp egne testprosesser og samle eventuelle
   rettelser og rapporter i én signert commit/push.

Kriterier: oppgaveløsning 25 %, informasjon 20 %, navigasjon 15 %,
tilbakemelding 15 %, visuelt 10 %, tilgjengelighet 10 %, robusthet 5 %.
Dette er agentbasert ekspertvurdering. Fysisk etikettutskrift, printere,
full VoiceOver og plattformmatrise inngår ikke.
