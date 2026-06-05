import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFilamentQrPayload,
  buildCompanionSpoolQrPayload,
  decodeFilamentQrPayload,
  deriveCompanionShellUrl,
  encodeVersionedFilamentQrRef,
  parseFilamentQrPayload,
  resolvePreferredCompanionShellUrl,
} from "./filament_qr_payload";

test("encodeVersionedFilamentQrRef builds versioned references", () => {
  assert.equal(encodeVersionedFilamentQrRef("QR-22"), "v1:QR-22");
  assert.equal(encodeVersionedFilamentQrRef("A-1", "v2"), "v2:A-1");
});

test("parseFilamentQrPayload supports legacy, versioned, and URL payloads", () => {
  assert.deepEqual(parseFilamentQrPayload("QR-22"), {
    raw: "QR-22",
    version: "legacy",
    ref: "QR-22",
  });
  assert.deepEqual(decodeFilamentQrPayload("v1:QR-22"), {
    raw: "v1:QR-22",
    version: "v1",
    ref: "QR-22",
  });
  assert.deepEqual(parseFilamentQrPayload("https://host/companion?spool_qr=v1:QR-22"), {
    raw: "https://host/companion?spool_qr=v1:QR-22",
    version: "v1",
    ref: "QR-22",
  });
});

test("buildCompanionSpoolQrPayload prefers companion deep-link when shell URL is available", () => {
  assert.equal(
    buildCompanionSpoolQrPayload("QR-22", "http://192.168.1.50:4278/companion"),
    "http://192.168.1.50:4278/companion?spool_qr=v1%3AQR-22",
  );
  assert.throws(
    () => buildCompanionSpoolQrPayload("QR-22", null),
    /Companion QR link is unavailable/,
  );
});

test("buildFilamentQrPayload returns only companion deep-link payloads", () => {
  assert.throws(
    () => buildFilamentQrPayload("QR-22"),
    /Companion QR link is unavailable/,
  );
  assert.deepEqual(
    buildFilamentQrPayload("QR-22", {
      companionShellUrl: "http://192.168.1.50:4278/companion",
    }),
    {
      payload: "http://192.168.1.50:4278/companion?spool_qr=v1%3AQR-22",
      target: "http://192.168.1.50:4278/companion?spool_qr=v1%3AQR-22",
    },
  );
});

test("deriveCompanionShellUrl normalizes a host base URL to the companion shell", () => {
  assert.equal(
    deriveCompanionShellUrl("http://192.168.1.50:4278"),
    "http://192.168.1.50:4278/companion",
  );
  assert.equal(
    deriveCompanionShellUrl("http://192.168.1.50:4278/companion"),
    "http://192.168.1.50:4278/companion",
  );
  assert.equal(deriveCompanionShellUrl(""), null);
});

test("resolvePreferredCompanionShellUrl prefers the host companion link in client mode", () => {
  assert.equal(
    resolvePreferredCompanionShellUrl({
      clientReadOnly: true,
      clientHostBaseUrl: "http://192.168.1.50:4278",
      trustedLanShellUrl: "http://127.0.0.1:4278/companion",
    }),
    "http://192.168.1.50:4278/companion",
  );
  assert.equal(
    resolvePreferredCompanionShellUrl({
      clientReadOnly: false,
      clientHostBaseUrl: "http://192.168.1.50:4278",
      trustedLanShellUrl: "http://127.0.0.1:4278/companion",
    }),
    "http://127.0.0.1:4278/companion",
  );
});
