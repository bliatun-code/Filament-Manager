# Developer Start Here

If you are resuming work on this project, start with these files in this order:

1. `/Users/bliatun/Documents/Codex/bambu-filament-manager/DEVELOPER_BRIEF.md`
   - Architecture, modules, current scope, and technical context
2. `/Users/bliatun/Documents/Codex/bambu-filament-manager/SESSION_STATE.md`
   - Latest project status and what changed most recently
3. `/Users/bliatun/Documents/Codex/bambu-filament-manager/WEBAPP_BRIEF.md`
   - Planned browser/web expansion and recommended architecture direction
4. `/Users/bliatun/Documents/Codex/bambu-filament-manager/DOMAIN_MODEL_EXPANSION.md`
   - Planned domain changes for borrowing/lending and future web support
5. `/Users/bliatun/Documents/Codex/bambu-filament-manager/NEXT_STEPS.md`
   - Current implementation priorities
6. `/Users/bliatun/Documents/Codex/bambu-filament-manager/UI_POLISH_TODO.md`
   - UI cleanup and visual consistency tasks
7. `/Users/bliatun/Documents/Codex/bambu-filament-manager/OPEN_QUESTIONS.md`
   - Unresolved product and design decisions
8. `/Users/bliatun/Documents/Codex/bambu-filament-manager/THREAD_BOOTSTRAP.md`
   - Recommended prompt and startup flow for a new thread
9. `/Users/bliatun/Documents/Codex/bambu-filament-manager/WEBAPP_UI_ONLY_PROMPT.md`
   - Dedicated prompt for a webapp/browser-shell UI-only thread

## Quick Resume
- Read the files above
- Pick one concrete focus area
- Preserve existing architectural decisions unless there is a strong reason to change them
- Validate with the commands below when appropriate

## Useful Commands
- Dev app:
  - `cd /Users/bliatun/Documents/Codex/bambu-filament-manager && npm run tauri -- dev`
- Smoke:
  - `cd /Users/bliatun/Documents/Codex/bambu-filament-manager && npm run smoke`

## Current Priority
- Trusted-LAN browser access is now the only supported browser companion path
- Pairing, renewal, revoke, revoke-all, and paired-browser list refresh are behaving as intended in the current trusted-LAN baseline
- The next active implementation work is webapp UI-only polish, with extra attention on iPhone and other small-screen layouts
- Keep backend, auth/session, trusted-LAN service behavior, and workflow scope frozen unless a real UI defect exposes a blocker
- Prefer one cohesive browser-shell UI batch over a long chain of tiny speculative tweaks
- Keep existing desktop UI functionality stable while the shared service layer expands

## Planned Expansion Track
- Support borrowed-in filament, not only outbound loans
- Keep browser access trusted-LAN-first and desktop-controlled while validating the current scope on PC, Mac, iPad, and iPhone/mobile browsers

## Notes
- This file is only an entry point
- Put durable project context in `DEVELOPER_BRIEF.md`
- Put latest status in `SESSION_STATE.md`
- Put actionable work in `NEXT_STEPS.md` and `UI_POLISH_TODO.md`
- Put unresolved decisions in `OPEN_QUESTIONS.md`
