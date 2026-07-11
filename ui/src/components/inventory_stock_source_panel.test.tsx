import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue, type Locale } from "../lib/i18n";
import type { InventoryCreateMode } from "../lib/inventory_create_model";
import type { MasterCatalogRow } from "../lib/tauri_client";
import { InventoryStockSourcePanel } from "./inventory_stock_source_panel";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";

const norwegianMessages: Record<string, string> = {
  "inventory.catalogMatchCountPlural": "{count} treff",
  "inventory.catalogMatchCount": "{count, plural, one {# treff} other {# treff}}",
  "wishlist.searchBambu": "Søk Bambu materiale/farge eller filamentkode",
};

function i18nValue(locale: Locale = "en"): I18nContextValue {
  return {
    locale,
    setLocale: () => {},
    t: (key, fallback = "", params = {}) =>
      formatMessage(
        locale === "nb" ? norwegianMessages[key] ?? fallback : fallback,
        params,
        locale,
      ),
  };
}

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function master(overrides: Partial<MasterCatalogRow> = {}): MasterCatalogRow {
  return {
    id: "master-code",
    material: "TPU",
    filament_name: "TPU for AMS",
    color_name: "Yellow (53400)",
    hex_color: "#FACC15",
    product_url: null,
    default_weight: 1000,
    vendor: "Bambu Lab",
    is_discontinued: false,
    discontinued_at: null,
    ...overrides,
  };
}

function renderPanel(options: {
  mode: InventoryCreateMode;
  masters?: MasterCatalogRow[];
  catalogQuery?: string;
  selectedMasterId?: string | null;
  locale?: Locale;
}) {
  const masters = options.masters ?? [master()];
  const catalogQuery = options.catalogQuery ?? "";
  const selectedMasterId =
    "selectedMasterId" in options ? options.selectedMasterId : masters[0]?.id ?? null;

  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue(options.locale ?? "en") },
      React.createElement(InventoryStockSourcePanel, {
        activeCatalogMasters: masters,
        catalogQuery,
        createMode: options.mode,
        isCatalogCreateMode: options.mode !== "manual",
        manualColorName: "",
        manualFilamentName: "",
        manualHexColor: "",
        manualMaterial: "PLA",
        manualVendor: "Generic",
        onCatalogQueryChange: () => {},
        onCreateModeChange: () => {},
        onManualColorNameChange: () => {},
        onManualFilamentNameChange: () => {},
        onManualHexColorChange: () => {},
        onManualMaterialChange: () => {},
        onManualVendorChange: () => {},
        onSelectCatalogMaster: () => {},
        onUseManualFromCatalog: () => {},
        resolvedTheme: "light",
        selectedCatalogMasterId: selectedMasterId ?? null,
        tauriAvailable: true,
      }),
    ),
  );
}

test("InventoryStockSourcePanel keeps Bambu search directly above the catalog list", () => {
  const html = renderPanel({
    mode: "bambu",
    catalogQuery: "Filament Code: 53400",
  });

  assert.match(html, /Search Bambu material\/color or filament code/);
  assert.match(html, /TPU for AMS/);
  assert.ok(
    html.indexOf("Search Bambu material/color or filament code") <
      html.indexOf("TPU for AMS"),
  );
  assert.doesNotMatch(html, /Box label/);
  assert.doesNotMatch(html, /Find this field on the box label/);
  assert.doesNotMatch(html, /One active Bambu catalog entry matched/);
  assert.doesNotMatch(html, /Batch Filament Codes/);
  assert.doesNotMatch(html, /Scan or type one code/);
  assert.doesNotMatch(html, /Add from image/);
  assert.doesNotMatch(html, /Add ready matches/);
  assert.doesNotMatch(html, /camera/i);
  assert.doesNotMatch(html, /webcam/i);
});

test("InventoryStockSourcePanel localizes the regular Bambu source without batch controls", () => {
  const html = renderPanel({
    mode: "bambu",
    catalogQuery: "53400",
    locale: "nb",
  });

  assert.match(html, /Søk Bambu/);
  assert.match(html, /TPU for AMS/);
  assert.doesNotMatch(html, /Filament Code-batch/);
  assert.doesNotMatch(html, /Finn dette feltet på eskeetiketten/);
  assert.doesNotMatch(html, /Skann eller skriv én kode/);
  assert.doesNotMatch(html, /Legg til fra bilde/);
  assert.doesNotMatch(html, /Batch Filament Codes/);
  assert.doesNotMatch(html, /Add ready matches/);
});

test("InventoryStockSourcePanel labels catalog match counts", () => {
  const masters = [
    master({ id: "yellow", filament_name: "PLA Basic", color_name: "Yellow" }),
    master({ id: "green", filament_name: "PLA Basic", color_name: "Green" }),
  ];
  const englishHtml = renderPanel({
    mode: "bambu",
    masters,
  });
  const norwegianHtml = renderPanel({
    mode: "bambu",
    masters,
    locale: "nb",
  });

  assert.match(englishHtml, /2 matches/);
  assert.match(norwegianHtml, /2 treff/);
});

test("InventoryStockSourcePanel renders the active Bambu code catalog row after search", () => {
  const html = renderPanel({
    mode: "bambu",
    masters: [
      master({
        id: "active-yellow",
        material: "TPU",
        filament_name: "TPU for AMS",
        color_name: "Yellow (53400)",
      }),
    ],
    catalogQuery: "53400",
  });

  assert.match(html, /TPU for AMS · Yellow \(53400\)/);
  assert.doesNotMatch(html, /PLA Basic · Old Yellow \(53400\)/);
  assert.doesNotMatch(html, /One active Bambu catalog entry matched/);
});

test("InventoryStockSourcePanel hides Bambu code controls outside Bambu catalog mode", () => {
  const esunHtml = renderPanel({
    mode: "esun",
    masters: [
      master({
        id: "esun-master",
        vendor: "eSUN",
        filament_name: "PLA+",
        color_name: "Cold White",
      }),
    ],
    catalogQuery: "white",
  });
  const manualHtml = renderPanel({
    mode: "manual",
    catalogQuery: "53400",
  });

  assert.match(esunHtml, /Search eSUN material\/color/);
  assert.doesNotMatch(esunHtml, /Filament Code/);
  assert.doesNotMatch(esunHtml, /Batch Filament Codes/);
  assert.match(manualHtml, /Manual details/);
  assert.doesNotMatch(manualHtml, /Filament Code/);
  assert.doesNotMatch(manualHtml, /Batch Filament Codes/);
});

test("InventoryStockSourcePanel renders ambiguous Bambu code matches for manual selection", () => {
  const html = renderPanel({
    mode: "bambu",
    masters: [
      master({
        id: "petg-black",
        material: "PETG",
        filament_name: "PETG HF",
        color_name: "Black (65103)",
        hex_color: "#111111",
      }),
      master({
        id: "pla-black",
        material: "PLA",
        filament_name: "PLA Basic",
        color_name: "Black (65103)",
        hex_color: "#000000",
      }),
    ],
    catalogQuery: "65103",
  });

  assert.match(html, /PETG HF · Black \(65103\)/);
  assert.match(html, /PLA Basic · Black \(65103\)/);
  assert.doesNotMatch(html, /This code is used by several active Bambu catalog entries/);
});

test("InventoryStockSourcePanel renders discontinued-only Bambu code matches", () => {
  const html = renderPanel({
    mode: "bambu",
    masters: [
      master({
        id: "archived-red",
        color_name: "Old Red (12345)",
        is_discontinued: true,
        discontinued_at: "2024-01-01T00:00:00Z",
      }),
    ],
    catalogQuery: "12345",
    selectedMasterId: null,
  });

  assert.match(html, /TPU for AMS · Old Red \(12345\)/);
  assert.match(html, /Discontinued/);
  assert.doesNotMatch(html, /Selected/);
  assert.doesNotMatch(html, /Only discontinued Bambu catalog entries use this code/);
});

test("InventoryStockSourcePanel renders the normal empty catalog message for no-match code filters", () => {
  const html = renderPanel({
    mode: "bambu",
    masters: [],
    catalogQuery: "99999",
    selectedMasterId: null,
  });

  assert.match(html, /No catalog entries match the current vendor filters\./);
  assert.doesNotMatch(html, /No Bambu catalog entry uses this filament code yet\./);
  assert.doesNotMatch(html, /You can still search by material, series, or color name\./);
});
