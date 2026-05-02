# Filament Manager UI

React/Vite frontend for the Tauri desktop app.

## Common Commands

```bash
npm --prefix ui run lint
npm --prefix ui run build
```

Run the full project smoke test from the repository root:

```bash
npm run smoke
```

The UI talks to Tauri through `src/lib/tauri_client.ts`; browser-only development uses the same screens with desktop-only actions disabled.
