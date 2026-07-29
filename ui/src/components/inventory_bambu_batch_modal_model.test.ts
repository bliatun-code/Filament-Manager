import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBambuFilamentCodeBatch,
  buildBambuFilamentCodeBatchCreateState,
} from "../lib/bambu_filament_code_batch";
import type { I18nContextValue } from "../lib/i18n";
import type { MasterCatalogRow } from "../lib/tauri_client";
import {
  bambuBatchCameraOverlayClassName,
  bambuBatchCameraScanMessage,
  bambuBatchCameraStatusLabel,
  bambuBatchCreateStateMessage,
  bambuBatchImageScanMessage,
  bambuBatchRowPreview,
  bambuBatchRowStatusLabel,
  bambuBatchWorkspaceClassName,
} from "./inventory_bambu_batch_modal_model";

const t: I18nContextValue["t"] = (_key, fallback = "", params) =>
  Object.entries(params ?? {}).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    fallback,
  );

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

test("batch workspace switches only the desktop column layout for camera mode", () => {
  const reviewOnly = bambuBatchWorkspaceClassName(false);
  const withCamera = bambuBatchWorkspaceClassName(true);

  assert.match(
    reviewOnly,
    /min-\[900px\]:grid-cols-\[minmax\(17rem,0.62fr\)_minmax\(0,1.38fr\)\]/,
  );
  assert.match(
    withCamera,
    /min-\[900px\]:grid-cols-\[minmax\(0,1fr\)_minmax\(20rem,1fr\)\]/,
  );
  assert.equal(
    reviewOnly.replace(/min-\[900px\]:grid-cols-\[[^\]]+\]/, ""),
    withCamera.replace(/min-\[900px\]:grid-cols-\[[^\]]+\]/, ""),
  );
});

test("batch row presentation distinguishes ready and ambiguous matches", () => {
  const readyBatch = buildBambuFilamentCodeBatch({
    masters: [master()],
    rawInput: "53400",
  });
  const ambiguousBatch = buildBambuFilamentCodeBatch({
    masters: [
      master(),
      master({ id: "second", filament_name: "TPU 95A HF" }),
    ],
    rawInput: "53400",
  });

  assert.equal(bambuBatchRowStatusLabel(readyBatch.rows[0]!, t), "Ready");
  assert.equal(
    bambuBatchRowPreview(readyBatch.rows[0]!),
    "TPU for AMS · Yellow (53400)",
  );
  assert.equal(
    bambuBatchRowStatusLabel(ambiguousBatch.rows[0]!, t),
    "Choose manually",
  );
  assert.equal(
    bambuBatchRowPreview(ambiguousBatch.rows[0]!),
    "TPU 95A HF · Yellow (53400), TPU for AMS · Yellow (53400)",
  );
});

test("batch creation and scan feedback preserve counts and compact previews", () => {
  const batch = buildBambuFilamentCodeBatch({
    masters: [master()],
    rawInput: "53400\nunknown",
  });
  const createState = buildBambuFilamentCodeBatchCreateState({
    batch,
    tauriAvailable: true,
    busy: false,
    isBambuMode: true,
    initialWeightValid: true,
    borrowedOwnerRequired: false,
  });
  const scan = {
    appendedCodeLines: ["53400", "53600", "65103", "40200"],
    appendedReviewLines: ["serial"],
    ignoredLines: [],
  };

  assert.equal(
    bambuBatchCreateStateMessage(createState, t),
    "Only ready rows will be added; review rows are skipped.",
  );
  assert.equal(
    bambuBatchImageScanMessage(scan, t),
    "4 filament code(s) and 1 barcode value(s) for review were added to the batch.",
  );
  assert.equal(
    bambuBatchCameraScanMessage(scan, t),
    "Added 53400, 53600, 65103 +1; 1 barcode value(s) for review.",
  );
});

test("camera status presentation keeps semantic feedback tones", () => {
  assert.equal(bambuBatchCameraStatusLabel("starting", t), "Starting camera");
  assert.equal(bambuBatchCameraStatusLabel("scanning", t), "Scanning");
  assert.match(bambuBatchCameraOverlayClassName("added"), /emerald/);
  assert.match(bambuBatchCameraOverlayClassName("duplicate"), /amber/);
  assert.match(bambuBatchCameraOverlayClassName("error"), /rose/);
});
