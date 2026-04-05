import assert from "node:assert/strict";
import test from "node:test";

import { buildTrustedLanPairingQrDataUrl } from "./trusted_lan_pairing_qr";

test("buildTrustedLanPairingQrDataUrl trims the URL and forwards stable options", async () => {
  const calls: Array<{ text: string; options?: Record<string, unknown> }> = [];
  const encoder = {
    async toDataURL(text: string, options?: Record<string, unknown>) {
      calls.push({ text, options });
      return "data:image/png;base64,qr";
    },
  };

  const dataUrl = await buildTrustedLanPairingQrDataUrl(
    "  http://192.168.1.50:4278/companion?pairing=abc123  ",
    encoder,
  );

  assert.equal(dataUrl, "data:image/png;base64,qr");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.text, "http://192.168.1.50:4278/companion?pairing=abc123");
  assert.deepEqual(calls[0]?.options, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
    color: {
      dark: "#0f172a",
      light: "#ffffffff",
    },
  });
});

test("buildTrustedLanPairingQrDataUrl rejects empty input", async () => {
  await assert.rejects(
    () => buildTrustedLanPairingQrDataUrl("   ", { toDataURL: async () => "unused" }),
    /Trusted-LAN pairing URL is required/,
  );
});
