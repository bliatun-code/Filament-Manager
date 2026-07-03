# Camera And Batch Scanning Status

This document records the current Bambu Filament Code intake status and the
remaining plan for OCR-style work.

As of `v0.19.0`, desktop/client code lookup, manual batch entry, still-image
barcode import, and live webcam scanning are implemented. Companion/webapp keeps
manual code lookup only.

## Scope

- Desktop/client only. Companion runs over HTTP on workshop browsers, so camera
  and media-device access is intentionally out of scope there.
- Do not assume a hardware barcode scanner. A scanner that acts like a keyboard
  should keep working through the existing manual batch input.
- Five digit Bambu Filament Code detection is the implemented baseline. OCR for
  full labels is a later, separate batch.
- Never auto-create stock from ambiguous input. Reuse the existing catalog
  decision rules: one active match or one discontinued-only old-stock match can
  be created, multiple possible catalog rows require user review, and no-match
  stays manual.

## Current Foundation

- Single-code lookup uses the shared Bambu catalog matching rules.
- Desktop/client Bambu batch input accepts one code per line or scanner-style
  pasted input.
- A desktop/client scan/type row uses the scan-input adapter to append detected
  five digit codes, keep duplicate scans as separate rows, and keep invalid
  non-code values visible for review through the same batch model.
- Desktop/client can also add barcode values from a still image when the browser
  provides native barcode detection or the bundled ZXing fallback can decode the
  image. Detected five digit codes and raw non-code barcode values stay separate
  in the batch model, so mixed image results can add ready rows while keeping
  other barcode values visible for review.
- Desktop/client can run a live webcam session from the Bambu batch modal. The
  camera preview scans continuously, gives overlay feedback when a code or
  review value is added, and suppresses repeats while the same label stays in
  view. Moving the label away resets the repeat guard so another box with the
  same Filament Code can still be added.
- Companion has manual Bambu Filament Code lookup, but no camera flow.
- Batch create already applies ownership, borrowed-in owner/contact, weight, and
  location consistently to all ready rows.

## Remaining Implementation Order

1. Keep manual batch input as the fallback baseline and improve copy only where
   users get stuck.
2. Keep still-image import and live webcam as explicit batch tools outside the
   regular catalog search flow.
3. Reuse the desktop/client scan-input adapter in future capture UI without
   changing the batch decision rules.
4. Treat OCR as a later review-first workflow: detect possible codes, show the
   source image and candidate list, and require explicit confirmation before
   stock creation.
5. Add real label fixtures before expanding beyond barcode/Filament Code
   capture.

## Acceptance Checks

- Detected codes must flow through `extractBambuFilamentCodes` and
  `buildBambuFilamentCodeBatch`.
- The UI must show ready, review, and blocked rows exactly like manual batch
  input.
- Borrowed-in batch creation must remain blocked until owner name is present.
- Tests cover one active match, multiple active matches, single and multiple
  discontinued-only matches, no match, duplicate scans, native and fallback
  barcode decoding, mixed image scans, and invalid non-code barcode values. Add
  new fixtures when OCR work starts.
- Companion tests must continue to assert that camera/webcam wording and flows
  are absent.
