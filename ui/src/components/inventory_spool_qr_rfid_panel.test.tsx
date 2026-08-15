import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import type { InventorySpool } from "../lib/inventory_list_model";
import { InventorySpoolQrRfidPanel } from "./inventory_spool_qr_rfid_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "") => fallback,
};

const spool: InventorySpool = {
  id: "spool_custom_label",
  masterId: "master_custom_label",
  vendor: "Bambu Lab",
  material: "PLA",
  filamentName: "Basic",
  colorName: "Cobalt Blue",
  initialWeightGrams: 1_000,
  status: "IN_STOCK",
  ownershipType: "OWNED",
};

function renderPanel(deterministicLabelPreferences: boolean): string {
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue },
      React.createElement(InventorySpoolQrRfidPanel, {
        companionAvailable: true,
        dataUrl: "https://filament-manager.local/spools/custom",
        deterministicLabelPreferences,
        initialLabelPanelOpen: true,
        loading: false,
        onPrintLabel: async () => {},
        onStartRfidCapture: () => {},
        resolvedTheme: "dark",
        runtimeAvailable: true,
        spool,
        supportsRfidCapture: false,
        target: "https://filament-manager.local/spools/custom",
      }),
    ),
  );
}

test("label builder exposes an accessible deterministic custom-size form", () => {
  const html = renderPanel(true);

  assert.match(html, /aria-pressed="true"[^>]*><span[^>]*>Custom/);
  assert.match(html, /role="group" aria-label="Label size"/);
  assert.match(html, /role="group" aria-label="Custom"/);
  assert.match(html, />Width<\/span><span[^>]*> mm/);
  assert.match(html, />Height<\/span><span[^>]*> mm/);
  assert.match(html, /type="number"[^>]*min="45"[^>]*max="150"[^>]*step="0\.5"[^>]*value="70"/);
  assert.match(html, /type="number"[^>]*min="24"[^>]*max="80"[^>]*step="0\.5"[^>]*value="30"/);
  assert.match(html, /Landscape · width 45–150 mm · height 24–80 mm · 0\.5 mm steps\./);
  assert.match(html, /aria-describedby="filament-label-custom-size-message"/);
});

test("normal label builder starts from the existing P-Touch preset", () => {
  const html = renderPanel(false);

  assert.match(html, /aria-pressed="true"[^>]*><span[^>]*>P-Touch 24 mm/);
  assert.doesNotMatch(html, /role="group" aria-label="Custom"/);
});
