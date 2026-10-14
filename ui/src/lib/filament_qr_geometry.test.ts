import assert from "node:assert/strict";
import test from "node:test";
import QRCode from "qrcode";
import { findFilamentQrLogoPlate } from "./filament_qr_geometry";

test("logo plates leave every functional QR module and its buffer intact", () => {
  const urls = [
    "http://fm-demo.local:4278/companion?spool_qr=v1%3Aspool_demo_001",
    "http://filament-manager-0123456789abcdef01234567.local:4278/companion?spool_qr=v1%3Aspool_1775592053186",
    "https://filament-manager-0123456789abcdef01234567.local:4278/companion?spool_qr=v1%3Aspool_01234567-89ab-cdef-0123-456789abcdef",
    `https://fm-demo.local/companion?spool_qr=v1%3A${"x".repeat(600)}`,
  ];
  for (const url of urls) {
    const modules = QRCode.create(url, { errorCorrectionLevel: "H" }).modules;
    const plate = findFilamentQrLogoPlate(modules);
    assert.ok(plate);
    assert.ok(plate.size <= 11 && plate.size <= modules.size * 0.21);
    for (let row = plate.y - 1; row <= plate.y + plate.size; row++) {
      for (let column = plate.x - 1; column <= plate.x + plate.size; column++) {
        assert.ok(!modules.isReserved(row, column));
      }
    }
  }
});

test("no logo is drawn when there is no safe data-only window", () => {
  assert.equal(findFilamentQrLogoPlate({ size: 45, isReserved: () => true }), null);
  assert.equal(findFilamentQrLogoPlate({ size: 21, isReserved: () => false }), null);
});
