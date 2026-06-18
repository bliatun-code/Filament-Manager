# Camera And Batch Scanning Plan

This is the working plan for future Bambu Filament Code intake from barcode,
camera, image, or OCR sources.

## Scope

- Desktop/client only. Companion runs over HTTP on workshop browsers, so camera
  and media-device access is intentionally out of scope there.
- Do not assume a hardware barcode scanner. A scanner that acts like a keyboard
  should keep working through the existing manual batch input.
- Start with five digit Bambu Filament Code detection. OCR for full labels is a
  later, separate batch.
- Never auto-create stock from ambiguous input. Reuse the existing catalog
  decision rules: one active match can be created, multiple active matches and
  discontinued-only matches require user review, and no-match stays manual.

## Current Foundation

- Single-code lookup uses the shared Bambu catalog matching rules.
- Desktop/client Bambu batch input accepts one code per line or scanner-style
  pasted input.
- Companion has manual Bambu Filament Code lookup, but no camera flow.
- Batch create already applies ownership, borrowed-in owner/contact, weight, and
  location consistently to all ready rows.

## Recommended Implementation Order

1. Keep manual batch input as the baseline and improve copy only where users get
   stuck.
2. Add a desktop/client "scan into batch" adapter that appends detected five
   digit codes to the same batch textarea/model.
3. Prefer browser-native barcode detection when available, with a clear manual
   fallback when it is not.
4. Add still-image import before live webcam if the UI needs a lower-risk
   stepping stone.
5. Treat OCR as a later review-first workflow: detect possible codes, show the
   source image and candidate list, and require explicit confirmation before
   stock creation.

## Acceptance Checks

- Detected codes must flow through `extractBambuFilamentCodes` and
  `buildBambuFilamentCodeBatch`.
- The UI must show ready, review, and blocked rows exactly like manual batch
  input.
- Borrowed-in batch creation must remain blocked until owner name is present.
- Tests must cover one active match, multiple active matches, discontinued-only,
  no match, duplicate scans, and invalid non-code barcode values.
- Companion tests must continue to assert that camera/webcam wording and flows
  are absent.
