# Thread Bootstrap

## Start Here
Read these files first:
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/DEVELOPER_BRIEF.md`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/SESSION_STATE.md`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/NEXT_STEPS.md`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/WEBAPP_BRIEF.md`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/OPEN_QUESTIONS.md`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/DOMAIN_MODEL_EXPANSION.md`

## Current Focus
- Primary work is now webapp/browser-shell UI-only polish on top of the trusted-LAN baseline
- Highest-priority areas:
  - iPhone/small-screen hierarchy, density, touch rhythm, and modal/sheet calmness
  - calmer visual hierarchy across Storage, Loans, Printers, Settings, and detail surfaces
  - keeping trusted-LAN/service/backend scope frozen unless a real UI defect exposes a blocker

## Upcoming Planning Track
- Keep the desktop app and SQLite as the source of truth
- Keep trusted-LAN as the only supported browser access path
- Only widen browser scope again if QA proves a real missing workflow

## Important Decisions Already Made
- Project name is `Filament Manager`
- Terms in Norwegian:
  - `Printer/Printere`
  - `Filament/Filamenter`
- Catalog refresh controls live in `Innstillinger` → `Filamentkatalog`
- Printer-slot assignment belongs on `Printere`, not in the selected filament popup
- Inventory cards and printer cards use controlled swatch/brand tinting
- The browser companion already has a broad enough Phase-1 workflow surface; the next step is validation, issue capture, and Step-2 prep rather than another chain of tiny recovery-only tweaks

## Useful Commands
- Dev app:
  - `cd /Users/bliatun/Documents/Codex/bambu-filament-manager && npm run tauri -- dev`
- Smoke:
  - `cd /Users/bliatun/Documents/Codex/bambu-filament-manager && npm run smoke`

## Current Best Prompt
- For the active UI-only webapp pass, start from:
  - `/Users/bliatun/Documents/Codex/bambu-filament-manager/WEBAPP_UI_ONLY_PROMPT.md`

## Good Resume Prompt
Use something like this in a new thread:

> Continue work on `/Users/bliatun/Documents/Codex/bambu-filament-manager`.
> Start by reading:
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/DEVELOPER_BRIEF.md`
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/SESSION_STATE.md`
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/NEXT_STEPS.md`
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/WEBAPP_BRIEF.md`
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/OPEN_QUESTIONS.md`
> We are working solely on UI elements in the trusted-LAN webapp/browser shell.
> Assume the current browser scope and trusted-LAN backend/security model are already broad enough.
> Do not widen workflow scope or touch Rust/Tauri/auth/session behavior unless a real UI defect requires it.
> First:
> 1. identify the noisiest iPhone/small-screen browser-shell surfaces,
> 2. turn that into one cohesive UI batch,
> 3. implement the batch without widening product scope,
> 4. update the docs if the UI baseline changes.
> Prioritize, in order:
> - iPhone/small-screen simplification,
> - modal/sheet rhythm,
> - touch feedback and action clarity,
> - broader tablet/desktop consistency only where it helps the same UI batch.
> Keep desktop + SQLite as the source of truth, preserve trusted-LAN behavior, and validate with:
> - `cd /Users/bliatun/Documents/Codex/bambu-filament-manager && npm run test:companion`
> - `cd /Users/bliatun/Documents/Codex/bambu-filament-manager && npm run smoke`

## Best Practice For New Threads
- Start from one concrete focus area, not the whole app at once
- Prefer one meaningful batch over dozens of tiny speculative browser-shell tweaks
- Keep one source of truth for architecture (`DEVELOPER_BRIEF.md`)
- Keep one short queue for current work (`NEXT_STEPS.md`)
- Keep one separate list for visual cleanup (`UI_POLISH_TODO.md`)
