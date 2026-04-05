Filament Manager - Installasjon og data (macOS)

Installering
1. Apne .dmg-filen.
2. Dra "Filament Manager.app" til Applications.
3. Start appen fra Applications.

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
