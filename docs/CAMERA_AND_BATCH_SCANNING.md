# Camera And Batch Scanning

Filament Manager can add several Bambu rolls from the `Filament Code` printed
on each box label. The desktop app accepts typed or pasted codes, barcode values
from an image, and a continuous webcam feed in the same batch workflow.

## Scan With The Webcam

1. Open **Inventory**, choose **Add filament**, select **Bambu**, and open
   **Batch add from boxes**.
2. Choose **Use webcam** and allow camera access when the operating system asks.
3. Hold the barcode area of one Bambu box inside the guide in the preview.
4. Wait for the confirmation, then move the label out of view before presenting
   the next box.
5. Review the batch and choose **Add ready matches**.

The scanner keeps running until you stop it or close the dialog. It suppresses
repeat reads while the same label remains in view and accepts the same Filament
Code again after the label has been moved away. If a label is difficult to
read, keep it steady and adjust its distance until the bars are sharp.

## Other Inputs

- **Add from image** reads barcode values from a photo or screenshot.
- **Scan or type one code** supports a hardware scanner that types like a
  keyboard, as well as normal keyboard entry.
- **Codes in this batch** accepts one or more pasted five digit Filament Codes.

All inputs use the same catalog matching rules. A clear catalog match is marked
ready. Ambiguous, discontinued, invalid, or unknown values remain visible for
review and are never silently added as stock.

## Supported Surfaces

Webcam and image scanning are available in the desktop app. Companion supports
manual Filament Code lookup and entry. Camera capture is not exposed in
Companion because ordinary workshop HTTP pages do not receive reliable browser
camera access.

The scanner reads barcodes and Filament Codes; it does not use OCR to interpret
arbitrary printed label text.

## Camera Troubleshooting

- If access was denied, allow camera access for Filament Manager in the
  operating system privacy settings, then choose **Use webcam** again.
- Use even light and avoid glare across the barcode.
- Move closer or farther away until the barcode is sharp in the preview.
- Use **Add from image** or type the five digit code if the camera cannot read a
  damaged label.

## Verification Coverage

Automated checks cover camera availability, permission-ready stream requests,
continuous focus and exposure hints, native and fallback barcode decoding,
Bambu box barcode mapping, instruction-QR filtering, mixed scan results,
duplicate suppression, and the shared ready/review batch rules. The desktop
visual QA scenario opens the batch workflow against a production-like database
copy so catalog matches and review states are rendered with real data shapes.
