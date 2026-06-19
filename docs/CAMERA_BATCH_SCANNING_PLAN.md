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
- A desktop/client scan/type row uses the scan-input adapter to append detected
  five digit codes, keep duplicate scans as separate rows, and keep invalid
  non-code values visible for review through the same batch model.
- Desktop/client can also add barcode values from a still image when the browser
  provides native barcode detection. Detected five digit codes and raw non-code
  barcode values stay separate in the batch model, so mixed image results can add
  ready rows while keeping other barcode values visible for review. Unsupported
  browsers fall back to manual paste/type input.
- Companion has manual Bambu Filament Code lookup, but no camera flow.
- Batch create already applies ownership, borrowed-in owner/contact, weight, and
  location consistently to all ready rows.

## Recommended Implementation Order

1. Keep manual batch input as the baseline and improve copy only where users get
   stuck.
2. Reuse the desktop/client scan-input adapter in future capture UI without
   changing the batch decision rules.
3. Prefer browser-native barcode detection when available, with a clear manual
   fallback when it is not.
4. Keep still-image import as the lower-risk stepping stone before live webcam.
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
  no match, duplicate scans, mixed image scans, and invalid non-code barcode
  values.
- Companion tests must continue to assert that camera/webcam wording and flows
  are absent.
