# Webapp UI-Only Prompt

Use this when the next thread should work solely on UI elements in the trusted-LAN webapp/browser shell.

## Read First
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/DEVELOPER_BRIEF.md`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/SESSION_STATE.md`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/NEXT_STEPS.md`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/WEBAPP_BRIEF.md`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/UI_POLISH_TODO.md`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/OPEN_QUESTIONS.md`

## Scope
- Work only on webapp/browser-shell UI.
- Prioritize iPhone and other small-screen layouts first.
- Tablet and desktop cleanup is fine only when it helps the same UI batch feel more coherent.

## Hard Constraints
- Do not widen browser workflow scope.
- Do not change Rust backend, Tauri commands, SQLite schema, pairing/session model, trusted-LAN security rules, or browser-service behavior unless a real reproduced UI blocker cannot be solved without it.
- Desktop app + SQLite remain the only source of truth.
- Trusted-LAN stays the only supported browser path.
- LAN mode stays explicit opt-in and desktop-controlled.
- Keep human browser auth separate from any future device-ingestion routes.
- Preserve the current root IA:
  - `Storage`
  - `Loans`
  - `Printers`
  - `Settings`
  - modal detail stays in-app instead of becoming a top-level route again
- Do not regrow `src-tauri/companion_browser/app.js` or reintroduce localhost assumptions.

## Preferred Edit Areas
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/app.css`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/shell_chrome.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/storage_shell.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/loans_shell.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/printers_shell.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/printer_workspace.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/settings_shell.js`
- `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/detail_content.js`
- Browser-shell tests under `/Users/bliatun/Documents/Codex/bambu-filament-manager/src-tauri/companion_browser/*.test.mjs`
- Narrow desktop Settings UI polish only when part of the same visual cleanup:
  - `/Users/bliatun/Documents/Codex/bambu-filament-manager/ui/src/pages/settings.tsx`
  - `/Users/bliatun/Documents/Codex/bambu-filament-manager/ui/src/pages/settings_companion_model.ts`
  - `/Users/bliatun/Documents/Codex/bambu-filament-manager/ui/src/lib/i18n.ts`

## Current UI Goals
- Make the iPhone/small-screen experience calmer and more human-readable.
- Reduce stacked chrome before the main task starts.
- Simplify modal, utility-sheet, and action-block hierarchy.
- Keep the strongest action obvious and secondary controls quieter.
- Make list rows, boards, cards, and task sheets feel touch-first instead of hover-first.
- Preserve the stronger visual language without letting tinted surfaces become noisy.

## Good Working Prompt
Use something like this in a new thread:

> Continue work on `/Users/bliatun/Documents/Codex/bambu-filament-manager`.
> Start by reading:
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/DEVELOPER_BRIEF.md`
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/SESSION_STATE.md`
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/NEXT_STEPS.md`
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/WEBAPP_BRIEF.md`
> - `/Users/bliatun/Documents/Codex/bambu-filament-manager/UI_POLISH_TODO.md`
> Work solely on UI elements in the trusted-LAN webapp/browser shell.
> Focus first on iPhone and other small-screen layouts.
> Do not widen workflow scope or change backend/security behavior unless a real reproduced UI defect requires it.
> First:
> 1. identify the noisiest small-screen surfaces,
> 2. choose one cohesive UI batch,
> 3. implement that batch,
> 4. update the docs if the UI baseline changes.
> Prioritize:
> - iPhone/small-screen hierarchy
> - modal and utility-sheet calmness
> - touch rhythm and button clarity
> - tablet/desktop consistency only where it helps the same batch
> Validate with:
> - `cd /Users/bliatun/Documents/Codex/bambu-filament-manager && npm run test:companion`
> - `cd /Users/bliatun/Documents/Codex/bambu-filament-manager && npm run smoke`

## Output Expectations
- Prefer one meaningful UI batch over many tiny speculative tweaks.
- Explain what changed in terms of user-visible outcome, not just CSS edits.
- If no code change is needed, say why and point to the blocking screenshot or surface clearly.
