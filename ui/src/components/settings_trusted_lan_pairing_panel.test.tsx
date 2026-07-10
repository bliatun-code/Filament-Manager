import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SettingsTrustedLanPairingPanel } from "./settings_trusted_lan_pairing_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderPanel(pairingLink: string | null = null): string {
  return renderToStaticMarkup(
    <SettingsTrustedLanPairingPanel
      actionBusy={false}
      browserLabelDraft="Workshop iPad"
      locale="en"
      pairActionDisabled={false}
      pairingExpiresAtMs={pairingLink ? Date.UTC(2026, 6, 10, 12, 30) : null}
      pairingLabel={pairingLink ? "Workshop iPad" : null}
      pairingLink={pairingLink}
      pairingQrBusy={false}
      pairingQrDataUrl={pairingLink ? "data:image/png;base64,AA==" : null}
      pairingQrUnavailable={false}
      t={(_key, fallback) => fallback}
      onBrowserLabelChange={() => {}}
      onCopyPairingLink={() => {}}
      onCreatePairingLink={() => {}}
    />,
  );
}

test("browser pairing is a labelled submit form with a permanent optional-name hint", () => {
  const html = renderPanel();

  assert.match(html, /<section id="trusted-lan-pairing-panel"/);
  assert.match(html, /<h3 id="trusted-lan-pairing-title"/);
  assert.match(html, /<form aria-busy="false"/);
  assert.match(html, /aria-describedby="trusted-lan-pairing-label-hint"/);
  assert.match(html, /id="trusted-lan-pairing-label-hint"/);
  assert.match(html, /Optional\. This keeps the paired-browser list readable later\./);
  assert.match(html, /<button type="submit"/);
});

test("generated pairing result is announced and keeps QR beside the link at desktop width", () => {
  const pairingLink = "http://192.168.1.20:4279/pair/example";
  const html = renderPanel(pairingLink);

  assert.match(html, /md:grid-cols-\[minmax\(0,1fr\)_260px\]/);
  assert.match(html, /tabindex="-1" aria-labelledby="trusted-lan-pairing-result-title"/);
  assert.match(html, /id="trusted-lan-pairing-result-title" role="status" aria-live="polite"/);
  assert.match(html, /Pairing link ready/);
  assert.match(html, /Create another link/);
  assert.match(html, /aria-busy="false"/);
  assert.match(html, /max-w-44/);
  assert.match(html, new RegExp(pairingLink.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
