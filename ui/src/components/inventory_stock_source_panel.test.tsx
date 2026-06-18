import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildBambuFilamentCodeBatch,
  buildBambuFilamentCodeBatchCreateState,
} from "../lib/bambu_filament_code_batch";
import { buildBambuFilamentCodeLookup } from "../lib/bambu_filament_code_lookup";
import { I18nContext, type I18nContextValue } from "../lib/i18n";
import type { InventoryCreateMode } from "../lib/inventory_create_model";
import type { MasterCatalogRow } from "../lib/tauri_client";
import { InventoryStockSourcePanel } from "./inventory_stock_source_panel";

const t = (_key: string, fallback = "") => fallback;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t,
};

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
}) {
  const masters = options.masters ?? [master()];
  const catalogQuery = options.catalogQuery ?? "";
  const batchInput = options.batchInput ?? "";
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
      { value: i18nValue },
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
        selectedCatalogMasterId: masters[0]?.id ?? null,
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
  assert.match(html, /All pasted codes are ready/);
  assert.match(html, /Add ready matches/);
  assert.doesNotMatch(html, /camera/i);
  assert.doesNotMatch(html, /webcam/i);
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
