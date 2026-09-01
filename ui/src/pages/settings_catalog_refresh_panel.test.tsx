import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import { I18nContext } from "../lib/i18n";
import { SettingsCatalogRefreshPanel } from "./settings_catalog_refresh_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderPanel(
  catalogState: "pending" | "available" | "unavailable",
): string {
  const t = (_key: string, fallback = "", params = {}) =>
    formatMessage(fallback, params, "en");
  return renderToStaticMarkup(
    <I18nContext.Provider value={{ locale: "en", setLocale: () => {}, t }}>
      <SettingsCatalogRefreshPanel
        activeCatalogMasterCount={0}
        activeCatalogMaterialOptions={[]}
        activeCatalogRefreshMaterial={null}
        busy={false}
        catalogCount={0}
        catalogRowsAvailable={catalogState === "available"}
        catalogRowsUnavailable={catalogState === "unavailable"}
        catalogRefreshBusy={false}
        catalogRefreshElapsedSeconds={0}
        catalogRefreshLog=""
        catalogRefreshPhase="IDLE"
        catalogRefreshProgressMessage=""
        catalogRefreshSummary={null}
        catalogSourceAuditSummary={null}
        catalogRefreshVendor="Bambu"
        catalogVendor="Bambu"
        showCatalogRefreshLog={false}
        settingsClientReadOnly
        swatchBusy={false}
        tauri
        t={t}
        onAuditVendorCatalog={() => {}}
        onRefreshVendorCatalog={() => {}}
        onSetCatalogVendor={() => {}}
        onToggleCatalogRefreshLog={() => {}}
        onSelectCatalogRefreshMaterial={() => {}}
      />
    </I18nContext.Provider>,
  );
}

function renderedText(html: string): string {
  return html.replaceAll("<!-- -->", "");
}

test("a pending host catalog renders unknown counts without a premature error", () => {
  const text = renderedText(renderPanel("pending"));

  assert.match(text, /Catalog: —/);
  assert.doesNotMatch(text, /Catalog: 0/);
  assert.ok((text.match(/—/g) ?? []).length >= 3);
  assert.doesNotMatch(text, /The service is temporarily unavailable./);
});

test("an unavailable host catalog renders unknown counts and the connection error", () => {
  const text = renderedText(renderPanel("unavailable"));

  assert.match(text, /Catalog: —/);
  assert.doesNotMatch(text, /Catalog: 0/);
  assert.match(text, /The service is temporarily unavailable\./);
});

test("an authoritative empty host catalog renders a real zero", () => {
  const text = renderedText(renderPanel("available"));

  assert.match(text, /Catalog: 0/);
  assert.doesNotMatch(text, /The service is temporarily unavailable\./);
});
