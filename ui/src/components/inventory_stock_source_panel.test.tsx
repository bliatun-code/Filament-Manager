import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildBambuFilamentCodeBatch,
  buildBambuFilamentCodeBatchCreateState,
} from "../lib/bambu_filament_code_batch";
import { buildBambuFilamentCodeLookup } from "../lib/bambu_filament_code_lookup";
import {
  dictionaries,
  I18nContext,
  lookup,
  type I18nContextValue,
  type Locale,
} from "../lib/i18n";
import type { InventoryCreateMode } from "../lib/inventory_create_model";
import type { MasterCatalogRow } from "../lib/tauri_client";
import { InventoryStockSourcePanel } from "./inventory_stock_source_panel";

function i18nValue(locale: Locale = "en"): I18nContextValue {
  return {
    locale,
    setLocale: () => {},
    t: (key, fallback = "") => lookup(dictionaries[locale], key) ?? fallback,
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
  batchInput?: string;
  selectedMasterId?: string | null;
  locale?: Locale;
}) {
  const masters = options.masters ?? [master()];
  const catalogQuery = options.catalogQuery ?? "";
  const batchInput = options.batchInput ?? "";
  const selectedMasterId =
    "selectedMasterId" in options ? options.selectedMasterId : masters[0]?.id ?? null;
  const bambuCodeBatch = buildBambuFilamentCodeBatch({
    masters,
    rawInput: batchInput,
  });
  const bambuBatchCreateState = buildBambuFilamentCodeBatchCreateState({
    batch: bambuCodeBatch,
    tauriAvailable: true,
    busy: false,
    isBambuMode: options.mode === "bambu",
    borrowedOwnerRequired: false,
  });

  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue(options.locale ?? "en") },
      React.createElement(InventoryStockSourcePanel, {
        activeCatalogMasters: masters,
        bambuBatchInput: batchInput,
        bambuBatchCreateState,
        bambuCodeBatch,
        bambuCodeLookup: buildBambuFilamentCodeLookup(masters, catalogQuery),
        catalogQuery,
        createMode: options.mode,
        disabledBambuBatchCreate: bambuBatchCreateState.disabled,
        isCatalogCreateMode: options.mode !== "manual",
        manualColorName: "",
        manualFilamentName: "",
        manualHexColor: "",
        manualMaterial: "PLA",
        manualVendor: "Generic",
        onBambuBatchInputChange: () => {},
        onCatalogQueryChange: () => {},
        onCreateBambuCodeBatch: () => {},
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

test("InventoryStockSourcePanel keeps Bambu Filament Code help and batch entry inside Bambu mode", () => {
  const html = renderPanel({
    mode: "bambu",
    catalogQuery: "Filament Code: 53400",
    batchInput: "53400",
  });

  assert.match(html, /Search Bambu material\/color or filament code/);
  assert.match(html, /Filament Code/);
  assert.match(html, /Box label/);
  assert.match(html, /One active Bambu catalog entry matched and is selected/);
  assert.match(html, /TPU for AMS/);
  assert.match(html, /Batch Filament Codes/);
  assert.match(html, /Scan or type one code/);
  assert.match(html, /Add to batch/);
  assert.match(html, /All pasted codes are ready/);
  assert.match(html, /Add ready matches/);
  assert.doesNotMatch(html, /camera/i);
  assert.doesNotMatch(html, /webcam/i);
});

test("InventoryStockSourcePanel localizes Bambu batch controls in Norwegian", () => {
  const html = renderPanel({
    mode: "bambu",
    catalogQuery: "53400",
    batchInput: "53400",
    locale: "nb",
  });

  assert.match(html, /Filament Code-batch/);
  assert.match(html, /Skann eller skriv én kode/);
  assert.match(html, /Legg til i batch/);
  assert.match(html, /1 kan legges til/);
  assert.match(html, /Alle innlimte koder er klare/);
  assert.match(html, /Legg til klare treff/);
  assert.doesNotMatch(html, /1 klare/);
  assert.doesNotMatch(html, /Batch Filament Codes/);
  assert.doesNotMatch(html, /Add ready matches/);
});

test("InventoryStockSourcePanel previews the active Bambu code match when discontinued history exists", () => {
  const html = renderPanel({
    mode: "bambu",
    masters: [
      master({
        id: "old-yellow",
        material: "PLA",
        filament_name: "PLA Basic",
        color_name: "Old Yellow (53400)",
        is_discontinued: true,
        discontinued_at: "2024-01-01T00:00:00Z",
      }),
      master({
        id: "active-yellow",
        material: "TPU",
        filament_name: "TPU for AMS",
        color_name: "Yellow (53400)",
      }),
    ],
    catalogQuery: "53400",
  });

  const lookupSegment = html.slice(
    html.indexOf("One active Bambu catalog entry matched"),
    html.indexOf("Batch Filament Codes"),
  );

  assert.match(html, /One active Bambu catalog entry matched and is selected/);
  assert.match(lookupSegment, /TPU for AMS · Yellow \(53400\)/);
  assert.doesNotMatch(lookupSegment, /PLA Basic · Old Yellow \(53400\)/);
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
    batchInput: "53400",
  });
  const manualHtml = renderPanel({
    mode: "manual",
    catalogQuery: "53400",
    batchInput: "53400",
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

  assert.match(
    html,
    /This code is used by several active Bambu catalog entries\. Choose the correct row\./,
  );
  assert.match(html, /PETG HF · Black \(65103\)/);
  assert.match(html, /PLA Basic · Black \(65103\)/);
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

  assert.match(html, /Only discontinued Bambu catalog entries use this code\./);
  assert.match(html, /TPU for AMS · Old Red \(12345\)/);
  assert.match(html, /Discontinued/);
  assert.doesNotMatch(html, /Selected/);
});

test("InventoryStockSourcePanel renders no-match Bambu code guidance", () => {
  const html = renderPanel({
    mode: "bambu",
    catalogQuery: "99999",
  });

  assert.match(html, /No Bambu catalog entry uses this filament code yet\./);
  assert.match(html, /You can still search by material, series, or color name\./);
});
