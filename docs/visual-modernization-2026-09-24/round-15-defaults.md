# Native standarder og prisoppdatering — runde15

Isolert Review Dark856. Åpnet Bambu Lab→ABS. Før retting: native blå radio/checkbox F/K8 og separate pilrader L8. `defaults-controls-dark856-r15.png` individuelt sett. Etter retting: hvite avkryssinger/radio, pil+tittel samme rad, god plass til antall/prisstatus; `defaults-controls-fixed-dark856-r15.png`. Konkrete F/K/L8 lukkes i denne tilstanden. Andre temaer og full fokus-/radio-keyboard gjenstår.

Faktisk Save group default245NOK ga synlig ABS245NOK Saved. `defaults-group-saved-dark856-r15.png`. Only missing prices,7selected,1willupdate: anvendt og backend oppdaterte bare den nye batchrullen. SQLite: #bed58f245NOK, #9000_1 fortsatt219NOK, #w_0022239NOK, låst#w_0150 fortsattNULL/NOK/locked1. Ingen øvrige prisoverskrivinger i observerte kontroller.

Nytt I8: etter anvending vises ingen kvittering ved handlingen; Latest pricing receipt ligger nedenfor alle øvrige grupper. `defaults-missing-price-receipt-dark856-r15.png` er faktisk viewport rett etter klikk, uten kvittering. Manuell3siders scroll viser 1updated6notupdated (`defaults-receipt-manual-scroll-dark856-r15.png`).

Nytt I/D8: fire like ABSWhite40100 kvitteringsrader uten rollref/ID, også låst rull uten identitet utover navn. Data er faktisk riktige, men presentasjonen gjør rullene uidentifiserbare. Root varslet om begge kvitteringsfunn.

| Tilstand | H | T | L | F | K | V | I | R | D | A |
|---|---|---|---|---|---|---|---|---|---|---|
| Dark856 rettede gruppevalg |9|9|9|9|9|9|9|9|9|IE|
| Dark856 lagret gruppestandard |9|9|9|9|9|9|9|9|9|IE|
| Dark856 missing-price receipt før retting |9|9|9|9|9|9|8|9|8|IE|

Gjenstår retest lokal kvittering+ID, overwrite review/Cancel, negativevalidation, threshold/currencyforløp, øvrige temaer og smal/keyboardstøtte.
