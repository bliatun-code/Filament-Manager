import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFilamentQrPayload,
  buildCompanionSpoolQrPayload,
  decodeFilamentQrPayload,
  deriveCompanionShellUrl,
  encodeVersionedFilamentQrRef,
  isStableLocalCompanionBaseUrl,
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
  for (const invalid of [
    "ftp://host.local:4278/companion",
    "http://user:secret@host.local:4278/companion",
    "http://host.local:4278/not-companion",
    "http://host.local:4278/companion?old=1",
    "http://host.local:4278/companion#fragment",
  ]) {
    assert.throws(
      () => buildFilamentQrPayload("QR-22", { companionShellUrl: invalid }),
      /Companion QR link is invalid/,
      invalid,
    );
  }
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
  assert.equal(deriveCompanionShellUrl("ftp://host.local:4278"), null);
  assert.equal(
    deriveCompanionShellUrl("http://user:secret@host.local:4278"),
    null,
  );
});

test("stable companion addresses require a local hostname instead of a numeric IP", () => {
  assert.equal(
    isStableLocalCompanionBaseUrl(
      "http://filament-manager-0123456789abcdef01234567.local:4278",
    ),
    true,
  );
  assert.equal(isStableLocalCompanionBaseUrl("http://192.168.1.50:4278"), false);
  assert.equal(isStableLocalCompanionBaseUrl("https://host.example:4278"), false);
});

test("resolvePreferredCompanionShellUrl prefers the host companion link in client mode", () => {
  assert.equal(
    resolvePreferredCompanionShellUrl({
      clientReadOnly: true,
      clientHostBaseUrl: "http://filament-manager-a1b2.local:4278",
      trustedLanShellUrl: "http://127.0.0.1:4278/companion",
    }),
    "http://filament-manager-a1b2.local:4278/companion",
  );
  assert.equal(
    resolvePreferredCompanionShellUrl({
      clientReadOnly: true,
      clientHostBaseUrl: "http://192.168.1.50:4278",
      trustedLanShellUrl: "http://127.0.0.1:4278/companion",
    }),
    null,
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
