import test from "node:test";
import assert from "node:assert/strict";

import { buildFilamentLabelQrDataUrl } from "./filament_label_print";
import {
  FILAMENT_LABEL_PROFILES,
  filamentLabelPixelSize,
  filamentLabelProfile,
} from "./filament_label_profiles";

test("filament label profiles include a full-height 24 mm P-Touch default", () => {
  assert.deepEqual(
    FILAMENT_LABEL_PROFILES.map(({ id, widthMm, heightMm }) => ({
      id,
      widthMm,
      heightMm,
    })),
    [
      { id: "ptouch-24", widthMm: 60, heightMm: 24 },
      { id: "compact", widthMm: 50, heightMm: 25 },
      { id: "standard", widthMm: 60, heightMm: 30 },
      { id: "expanded", widthMm: 75, heightMm: 40 },
    ],
  );
  assert.equal(filamentLabelProfile("ptouch-24").title, "P-Touch 24 mm");
  assert.deepEqual(filamentLabelPixelSize("ptouch-24"), {
    width: 709,
    height: 283,
  });
});

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
