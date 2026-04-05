import test from "node:test";
import assert from "node:assert/strict";

import { decodeQrPayload, encodeVersionedQrRef, parseQrPayload } from "./qr_payload.js";

test("encodeVersionedQrRef builds a stable versioned payload", () => {
  assert.equal(encodeVersionedQrRef("QR-22"), "v1:QR-22");
  assert.equal(encodeVersionedQrRef("ref-1", "v2"), "v2:ref-1");
});

test("decodeQrPayload supports versioned and legacy values", () => {
  assert.deepEqual(decodeQrPayload("v1:QR-22"), {
    raw: "v1:QR-22",
    version: "v1",
    ref: "QR-22",
  });
  assert.deepEqual(decodeQrPayload("QR-22"), {
    raw: "QR-22",
    version: "legacy",
    ref: "QR-22",
  });
});

test("parseQrPayload resolves deep-link URLs and keeps compatibility", () => {
  assert.deepEqual(parseQrPayload("https://host/companion?spool_qr=v1:ABC-1"), {
    raw: "https://host/companion?spool_qr=v1:ABC-1",
    version: "v1",
    ref: "ABC-1",
  });
  assert.deepEqual(parseQrPayload("https://host/companion?qr_code=LEGACY-2"), {
    raw: "https://host/companion?qr_code=LEGACY-2",
    version: "legacy",
    ref: "LEGACY-2",
  });
  assert.deepEqual(parseQrPayload("LEGACY-2"), {
    raw: "LEGACY-2",
    version: "legacy",
    ref: "LEGACY-2",
  });
});
