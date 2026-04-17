Filament Manager - Installasjon og data (macOS)

Nedlasting
- Siste release: https://github.com/bliatun-code/Filament-Manager/releases/latest
- Gjeldende release: se `latest`-lenken over

Installering
1. Apne .dmg-filen.
2. Dra "Filament Manager.app" til Applications.
3. Start appen fra Applications.

Hvis macOS sier at appen er "skadet" eller blokkerer apning
1. Prove hoyreklikk pa appen i Applications -> Open.
2. Hvis den fortsatt blokkeres, kjør:
   xattr -dr com.apple.quarantine "/Applications/Filament Manager.app"
3. Start appen pa nytt.

Forste oppstart
- Appen oppretter automatisk lokal database ved forste start.
- Du trenger ikke installere Node, Rust, SQLite eller andre avhengigheter manuelt.

Hvor data lagres
- Database:
  ~/Library/Application Support/com.bambu.filament.manager/bambu.db
- Genererte etiketter/PDF:
  ~/Library/Application Support/com.bambu.filament.manager/labels/

Backup
- Lukk appen.
- Ta kopi av:
  ~/Library/Application Support/com.bambu.filament.manager/
- For restore: legg mappen tilbake samme sted for appstart.

Ny maskin
- Installer app fra DMG.
- Start appen en gang (oppretter struktur).
- Lukk appen, kopier backup-mappen inn til:
  ~/Library/Application Support/com.bambu.filament.manager/
- Start appen igjen.

Merk
- Data er lokale pa maskinen.
- Hvis appen flyttes/slettes, beholdes data sa lenge Application Support-mappen ikke slettes.
