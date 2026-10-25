import assert from "node:assert/strict";
import test from "node:test";
import QRCode from "qrcode";
import { filamentQrModuleLayout } from "./filament_label_print";
import { findFilamentQrLogoPlate } from "./filament_qr_geometry";

test("logo plates leave every functional QR module and its buffer intact", () => {
  const urls = [
    "http://fm-tfbb9pbv.local:4278/companion?spool_qr=v1%3Aspool_592e99a56bc81250c588e1100aa44954",
    "http://fm-demo.local:4278/companion?spool_qr=v1%3Aspool_demo_001",
    "http://filament-manager-0123456789abcdef01234567.local:4278/companion?spool_qr=v1%3Aspool_1775592053186",
    "https://filament-manager-0123456789abcdef01234567.local:4278/companion?spool_qr=v1%3Aspool_01234567-89ab-cdef-0123-456789abcdef",
    `https://fm-demo.local/companion?spool_qr=v1%3A${"x".repeat(600)}`,
  ];
  for (const url of urls) {
    const modules = filamentQrModuleLayout(url);
    const plate = findFilamentQrLogoPlate(modules);
    assert.ok(plate);
    assert.equal(plate.x * 2 + plate.size, modules.size);
    assert.equal(plate.y * 2 + plate.size, modules.size);
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

test("a central alignment pattern is never covered or avoided by offsetting", () => {
  const modules = QRCode.create("x", { version: 7, errorCorrectionLevel: "H" }).modules;
  assert.equal(findFilamentQrLogoPlate(modules), null);
});

test("already centered encodings keep their density and tiny codes remain plain", () => {
  for (const payload of ["x", "http://192.168.1.50:4278/companion?spool_qr=v1%3AQR-22"]) {
    const smallest = QRCode.create(payload, { errorCorrectionLevel: "H" }).modules;
    assert.equal(filamentQrModuleLayout(payload).size, smallest.size);
  }
});
