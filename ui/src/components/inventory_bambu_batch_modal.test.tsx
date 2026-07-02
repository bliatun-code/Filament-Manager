import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildBambuFilamentCodeBatch,
  buildBambuFilamentCodeBatchCreateState,
} from "../lib/bambu_filament_code_batch";
import { I18nContext, type I18nContextValue, type Locale } from "../lib/i18n";
import type { MasterCatalogRow } from "../lib/tauri_client";
import { InventoryBambuBatchModal } from "./inventory_bambu_batch_modal";

const source = readFileSync(
  new URL("./inventory_bambu_batch_modal.tsx", import.meta.url),
  "utf8",
);

const norwegianMessages: Record<string, string> = {
  "inventory.bambuBatchModalEyebrow": "Bambu-esker",
  "inventory.bambuBatchModalTitle": "Batch legg inn fra esker",
  "inventory.bambuBatchTitle": "Filament Code-batch",
  "inventory.bambuBatchScanTitle": "Skann eller legg inn koder",
  "inventory.bambuBatchAppendScan": "Legg til i batch",
  "inventory.bambuBatchImageAction": "Legg til fra bilde",
  "inventory.bambuBatchCameraAction": "Bruk webkamera",
  "inventory.bambuBatchAllReady": "Alle innlimte koder er klare.",
  "inventory.bambuBatchAddReady": "Legg til klare treff",
  "inventory.bambuBatchReadyShort": "kan legges til",
};

function i18nValue(locale: Locale = "en"): I18nContextValue {
  return {
    locale,
    setLocale: () => {},
    t: (key, fallback = "") => (locale === "nb" ? norwegianMessages[key] ?? fallback : fallback),
  };
}

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("InventoryBambuBatchModal portals above the add modal and preserves camera aspect", () => {
  assert.match(source, /createPortal\(modal, document\.body\)/);
  assert.match(source, /object-contain/);
  assert.match(source, /inventoryWideModalPanelClassName/);
  assert.match(source, /inventoryTwoColumnModalGridClassName/);
  assert.doesNotMatch(source, /w-\[min\(96vw,86rem\)\]/);
  assert.doesNotMatch(source, /object-cover/);
});

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

function renderBatchModal(options: {
  input?: string;
  locale?: Locale;
  masters?: MasterCatalogRow[];
}) {
  const masters = options.masters ?? [master()];
  const input = options.input ?? "";
  const batch = buildBambuFilamentCodeBatch({
    masters,
    rawInput: input,
  });
  const createState = buildBambuFilamentCodeBatchCreateState({
    batch,
    tauriAvailable: true,
    busy: false,
    isBambuMode: true,
    borrowedOwnerRequired: false,
  });

  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue(options.locale ?? "en") },
      React.createElement(InventoryBambuBatchModal, {
        batch,
        createState,
        disabledCreate: createState.disabled,
        input,
        onClose: () => {},
        onCreateBatch: () => {},
        onInputChange: () => {},
        open: true,
        tauriAvailable: true,
      }),
    ),
  );
}

test("InventoryBambuBatchModal owns batch controls without stock workflow side panels", () => {
  const html = renderBatchModal({
    input: "53400",
  });

  assert.match(source, /loadBambuBatchCameraScanModule/);
  assert.match(source, /loadBambuBatchImageScanModule/);
  assert.doesNotMatch(
    source,
    /import\s+[\s\S]*from "\.\.\/lib\/bambu_filament_code_(?:camera|image)_scan"/,
  );
  assert.match(source, /bambuBatchCodeFieldClassName/);
  assert.match(source, /bambuBatchSecondaryButtonClassName/);
  assert.match(source, /<ModalActionButton/);
  assert.match(source, /variant="solid"/);
  assert.match(source, /size="roomy"/);
  assert.match(source, /fullWidth/);
  assert.match(source, /focus-visible:border-sky-300/);
  assert.doesNotMatch(source, /modalActionButtonClassName/);
  assert.doesNotMatch(source, /focus:border-slate-400/);
  assert.doesNotMatch(source, /rounded-xl border border-slate-900 bg-slate-900 px-3 py-2\.5/);
  assert.match(html, /Batch add from boxes/);
  assert.match(html, /Bambu boxes/);
  assert.match(html, /Batch Filament Codes/);
  assert.match(html, /Ready matches use the stock details from Add filament/);
  assert.match(html, /Scan or enter codes/);
  assert.match(html, /Use the webcam, image import, or type one code at a time/);
  assert.match(html, /Scan or type one code/);
  assert.match(html, /Add to batch/);
  assert.match(html, /Add from image/);
  assert.match(html, /Use webcam/);
  assert.match(html, /All pasted codes are ready/);
  assert.match(html, /Add ready matches/);
  assert.match(html, /TPU for AMS · Yellow \(53400\)/);
  assert.match(html, /w-\[min\(100%,72rem\)\]/);
  assert.match(html, /xl:w-\[min\(80vw,72rem\)\]/);
  assert.match(html, /min-\[900px\]:grid-cols-\[minmax\(0,1.08fr\)_minmax\(20rem,0.92fr\)\]/);
  assert.doesNotMatch(html, /Box label/);
  assert.doesNotMatch(html, /One active Bambu catalog entry matched and is selected/);
  assert.doesNotMatch(html, /Wishlist &amp; orders/);
  assert.doesNotMatch(html, /Ownership/);
  assert.doesNotMatch(html, /Add current selection to wishlist/);
  assert.doesNotMatch(html, /Add spool to inventory/);
});

test("InventoryBambuBatchModal localizes batch controls in Norwegian", () => {
  const html = renderBatchModal({
    input: "53400",
    locale: "nb",
  });

  assert.match(html, /Batch legg inn fra esker/);
  assert.match(html, /Bambu-esker/);
  assert.match(html, /Filament Code-batch/);
  assert.match(html, /Skann eller legg inn koder/);
  assert.match(html, /Legg til i batch/);
  assert.match(html, /Legg til fra bilde/);
  assert.match(html, /Bruk webkamera/);
  assert.match(html, /1 kan legges til/);
  assert.match(html, /Alle innlimte koder er klare/);
  assert.match(html, /Legg til klare treff/);
  assert.doesNotMatch(html, /Finn dette feltet på eskeetiketten/);
  assert.doesNotMatch(html, /Batch Filament Codes/);
  assert.doesNotMatch(html, /Add ready matches/);
});

test("InventoryBambuBatchModal keeps review rows visible before batch creation", () => {
  const html = renderBatchModal({
    input: "53400\n65103\n99999",
    masters: [
      master(),
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
  });

  assert.match(html, /1 ready/);
  assert.match(html, /2 review/);
  assert.match(html, /Choose manually/);
  assert.match(html, /No match/);
  assert.match(html, /Only ready rows will be added; review rows are skipped/);
});
