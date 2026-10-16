import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import { I18nContext, lookup, type Locale } from "../lib/i18n";
import { enDictionary } from "../lib/i18n_locales/locales/en";
import { nbDictionary } from "../lib/i18n_locales/locales/nb";
import { SettingsCatalogRefreshPanel } from "./settings_catalog_refresh_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderPanel(
  catalogState: "pending" | "available" | "unavailable",
  overrides: Partial<React.ComponentProps<typeof SettingsCatalogRefreshPanel>> = {},
  locale: Locale = "en",
): string {
  const dictionary = locale === "nb" ? nbDictionary : enDictionary;
  const t = (key: string, fallback = "", params = {}) =>
    formatMessage(lookup(dictionary, key) ?? fallback, params, locale);
  return renderToStaticMarkup(
    <I18nContext.Provider value={{ locale, setLocale: () => {}, t }}>
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
        catalogRefreshKind="REFRESH"
        catalogRefreshUnavailable={false}
        catalogRefreshMaterial={null}
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
        {...overrides}
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


test("catalog phase and primary progress are localized without raw backend copy", () => {
  const cases = [
    ["PREPARE", "Forbereder", "Forbereder Bambu-katalogoppdatering..."],
    ["DISCOVER", "Sjekker...", "Finner tilgjengelige materialtyper"],
    ["FETCH", "Laster...", "Laster..."],
    ["IMPORT", "Lagrer...", "Lagrer..."],
    ["RUNNING", "Oppdaterer", "Oppdaterer"],
    ["SUCCEEDED", "Fullført", "Fullført"],
    ["FAILED", "Feilet", "Forespørselen kunne ikke fullføres."],
    ["FUTURE_INTERNAL_PHASE", "Laster...", "Laster..."],
  ];
  for (const [phase, phaseLabel, message] of cases) {
    const html = renderPanel("available", {
      catalogRefreshBusy: true,
      catalogRefreshPhase: phase,
      catalogRefreshMaterial: "PLA",
    }, "nb");
    assert.ok(html.includes(phaseLabel), `${phase} should have a localized phase`);
    assert.ok(html.includes(`aria-label="${message}"`), `${phase} should have localized accessible progress`);
    assert.ok(!html.includes(`>${phase}<`), `${phase} must not be visible as a backend enum`);
    assert.match(html, /Bambu.*katalog.* · PLA/);
  }
});

test("audit preparation stays a read-only material check and follows the current language", () => {
  const progress = {
    catalogRefreshBusy: true,
    catalogRefreshKind: "AUDIT" as const,
    catalogRefreshPhase: "PREPARE",
  };
  const english = renderPanel("available", progress, "en");
  const norwegian = renderPanel("available", progress, "nb");
  assert.match(english, /aria-label="Discovering available materials"/);
  assert.match(norwegian, /aria-label="Finner tilgjengelige materialtyper"/);
  assert.doesNotMatch(norwegian, /Preparing|Discovering|PREPARE/);
  assert.doesNotMatch(norwegian, /Forbereder Bambu-katalogoppdatering/);
});

test("uncertain job progress is localized while raw receipt diagnostics stay in the log", () => {
  const diagnostic = "Fetching one Bambu material family...\nNSURLErrorDomain: source unavailable";
  const html = renderPanel("available", {
    catalogRefreshBusy: true,
    catalogRefreshPhase: "RUNNING",
    catalogRefreshUnavailable: true,
    catalogRefreshLog: diagnostic,
    showCatalogRefreshLog: true,
  }, "nb");
  assert.match(html, /aria-label="Tjenesten er midlertidig utilgjengelig\."/);
  const diagnosticBlock = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/)?.[1];
  assert.equal(diagnosticBlock, diagnostic);
  assert.ok(!html.replace(/<pre[^>]*>[\s\S]*?<\/pre>/, "").includes(diagnostic));
});

test("a successful receipt shows its summary without an unfinished progress indicator", () => {
  const html = renderPanel("available", {
    catalogRefreshBusy: false,
    catalogRefreshPhase: "SUCCEEDED",
    catalogRefreshSummary: {
      imported: 17, reactivated_count: 0, discontinued_count: 0,
      output: "Imported 17 entries",
    },
  }, "nb");
  assert.doesNotMatch(html, /role="progressbar"/);
  assert.match(html, />17</);
});
