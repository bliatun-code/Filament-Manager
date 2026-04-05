import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFilamentLabelHtml,
  buildFilamentLabelQrDataUrl,
} from "./filament_label_print";

test("buildFilamentLabelQrDataUrl requests high-redundancy print options", async () => {
  let capturedPayload = "";
  let capturedOptions: Record<string, unknown> | null = null;
  const fakeEncoder = {
    async toDataURL(text: string, options?: Record<string, unknown>) {
      capturedPayload = text;
      capturedOptions = options ?? null;
      return "data:image/png;base64,qr";
    },
  };

  const dataUrl = await buildFilamentLabelQrDataUrl("v1:QR-22", fakeEncoder);

  assert.equal(dataUrl, "data:image/png;base64,qr");
  assert.equal(capturedPayload, "v1:QR-22");
  assert.equal(capturedOptions?.errorCorrectionLevel, "H");
  assert.equal(capturedOptions?.margin, 2);
  assert.equal(capturedOptions?.width, 512);
});

test("buildFilamentLabelHtml includes QR image and required filament details", () => {
  const html = buildFilamentLabelHtml({
    vendor: "Bambu",
    material: "PLA",
    filamentName: "Basic",
    colorName: "White",
    reference: "QR-22",
    qrPayload: "v1:QR-22",
    qrDataUrl: "data:image/png;base64,abc123",
    labels: {
      vendor: "Vendor",
      material: "Material",
      filament: "Filament",
      color: "Color",
      reference: "Reference",
      qrPayload: "QR payload",
    },
  });

  assert.match(html, /data:image\/png;base64,abc123/);
  assert.match(html, /Vendor:\<\/strong\> Bambu/);
  assert.match(html, /Filament:\<\/strong\> Basic/);
  assert.match(html, /Color:\<\/strong\> White/);
  assert.doesNotMatch(html, /Material:\<\/strong\>/);
  assert.doesNotMatch(html, /Reference:\<\/strong\>/);
  assert.doesNotMatch(html, /QR payload:\<\/strong\>/);
});
