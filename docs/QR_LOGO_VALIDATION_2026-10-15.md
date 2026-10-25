# Filament QR logo validation — 15 October 2026

This change applies the approved cropped reel motif without the app icon's
background rectangles. Filament QR images on desktop and in the Companion
use color, as do A4 and US Letter PDF sheets. Individual label PNGs from spool
details use the same motif in black and white for label printers.

The encoded spool link is unchanged. Both encoders use H error correction,
four quiet-zone modules and integer source module scaling. The logo's white
plate is at most 11 modules and 21% of the matrix width. Placement preserves
every finder, timing, alignment, format and version module, with an additional
one-module buffer. When a central alignment pattern is present, the logo moves
to the closest safe position, preferring below center. If necessary the plate
shrinks; if no safe position exists, the plain QR remains available.

Desktop QR artifacts are keyed to the current spool and Host source. Switching
spools or Hosts hides the old image and target before effects run; canceled
requests cannot publish a result into a newer label session.

## Decoder evidence

- 84 paired ZXing scenarios cover three realistic Companion URLs, color and
  monochrome, the actual 138-pixel screen image, four label presets, minimum and
  maximum custom dimensions, rotation, grayscale, blur and simulated 203-DPI
  sampling of the 300-DPI label PNG.
- 74 scenarios decode directly. Ten raster sampling misses also occur with
  the identical plain QR control. Both recover the exact original payload
  under the same bounded 0.8/1.2 scale or two-degree tilt. Tests reject a
  branded-only miss; the actual screen-size cases must decode directly.
- The actual RGB image streams embedded in A4 and US Letter PDFs retain the
  color logo and decode the original payload. Monochrome label images contain
  no colored pixels.
- Actual Rust-generated Companion SVGs decode directly in 12 cases across
  the same three payloads at native, 138-, 192- and 256-pixel render sizes.
- Apple's Vision barcode reader independently decodes the longest test link
  from the native desktop color, monochrome and plain PNGs, and the rasterized
  Companion SVG. These checks use generated files, not a camera or live library.
- Geometry tests protect reserved QR modules, including all 40 normal QR
  versions in the Rust renderer. Rendered lifecycle tests cover stale spool/
  Host results and late export/generation completions.

## Limits

These are digital decoding and export checks. No physical tape, printer or
phone-camera capture was used. Simulated DPI, blur and tilt do not establish
universal printing or camera performance. Print a sample at its intended size,
preserve the quiet zone and confirm it with a phone before printing a batch.
Pairing QR flows and their credentials are outside this filament-label change.


## Centered-logo update — 25 October 2026

The offset placement described above is superseded. Desktop PNGs and Companion
SVGs now select the smallest H-correction QR version with a centered data-only
logo window, including the existing one-module buffer around every functional
pattern. The plate remains at most 11 modules / 21% of matrix width. A central
alignment pattern therefore causes a larger encoding, not an offset logo or an
obscured functional pattern. Version-1 codes stay plain; if no centered window is
available through version 40, the original smallest plain code is retained.
Payloads, quiet zones and source scaling are unchanged.

Validation for this update:

- 112 paired ZXing scenarios across four realistic URLs, including the URL from
  the reported screenshot: 99 decode directly; 13 require the same bounded
  camera adjustment as their identical plain controls. All actual 138-pixel
  screen scenarios decode directly. No branded-only decoding misses are allowed.
- The recovery diagnostics retain 0.8/1.2 scaling and two-degree tilt and now
  also try five-degree tilt. The denser version-14 encoding at minimum custom
  label size / simulated 203 DPI can fail the earlier diagnostics even without
  a logo; both branded and plain images recover at five degrees. This is a
  digital sampling limitation, not evidence of physical printer reliability.
- Four browser tests pass, covering screen color and monochrome, all four label
  presets, minimum/maximum custom labels, 203-DPI simulation, rotation/blur and
  actual RGB image streams embedded in A4 and Letter PDFs.
- Fourteen label/geometry unit tests and five Rust spool-QR tests pass. Rust
  geometry checks cover all 40 versions and assert exact centering whenever a
  plate exists. Changed JavaScript/TypeScript files pass lint.
- The full UI production build passes after removing 21 pre-existing untracked
  duplicate files with ` 2` in their filenames, each verified byte-identical to
  its tracked original. No physical print or phone-camera test was performed.

The earlier Apple Vision and rasterized Rust SVG decoding evidence applies to
that earlier implementation; those decoder checks were not repeated for this
update. The new Rust checks validate encoding structure and reserved modules.
