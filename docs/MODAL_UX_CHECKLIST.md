# Modal UX Checklist

Use this checklist whenever adding or changing dialogs/popups in the UI.

## 1) Pick the right modal type

- Use `AppModal` (`/Users/bliatun/Documents/Codex/bambu-filament-manager/ui/src/components/app_modal.tsx`) for general dialogs.
- Use `SaveOnlyModal` (`/Users/bliatun/Documents/Codex/bambu-filament-manager/ui/src/components/save_only_modal.tsx`) for critical flow steps where users must confirm data (e.g. weight-in during slot swap).

## 2) Consistent close behavior

- **Save-only flow**: no `Close` button, no backdrop close, no `Esc` close.
- **General flow**: if close is allowed, define it explicitly (`x`, backdrop, and/or `Esc`) and keep behavior consistent within the same feature.

## 3) Action buttons

- Primary action text uses i18n (`common.save`, etc.).
- Disable primary action while async operation is running.
- Avoid duplicate actions (example: remove extra “Apply” buttons when selection + save already performs the commit).

## 4) Data safety and clarity

- Validate required inputs before save (weights, slot selection, etc.).
- Show clear inline context in modal (slot label, spool identity, swatch).
- Keep one clear commit point per step.

## 5) Visual consistency

- Reuse shared modal classes/components, do not hand-roll new overlay/panel styles.
- Keep spacing/typography aligned with existing modal patterns.
- Keep contrast readable in both light and dark modes.

## 6) Accessibility and keyboard

- Ensure focus starts in first input where relevant.
- Keep keyboard behavior predictable (`Esc` policy follows modal type).
- Stop event propagation on panel content to prevent accidental backdrop interactions.

## 7) Localization

- All new labels/messages/buttons must use `useI18n()` keys.
- Add both EN and NB translations in `/Users/bliatun/Documents/Codex/bambu-filament-manager/ui/src/lib/i18n.ts`.

## 8) Final check before merge

- Build passes: `npm --prefix /Users/bliatun/Documents/Codex/bambu-filament-manager/ui run build`
- Smoke test:
  - open modal
  - enter valid/invalid input
  - save path
  - busy/disabled state
  - close behavior matches modal type
