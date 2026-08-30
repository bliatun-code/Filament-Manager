import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("./printers.tsx", import.meta.url),
  "utf8",
);
const workflowSource = readFileSync(
  new URL("./use_add_printer_workflow.ts", import.meta.url),
  "utf8",
);
const addPrinterModalSource = readFileSync(
  new URL("../components/add_printer_modal.tsx", import.meta.url),
  "utf8",
);

test("printer page keeps its header action aligned until the compact card breakpoint", () => {
  assert.match(pageSource, /page-header min-\[900px\]:flex-row/);
  assert.match(pageSource, /page-header-actions min-\[900px\]:w-auto/);
  assert.match(pageSource, /page-header-tools min-\[900px\]:w-auto/);
  assert.match(
    pageSource,
    /<PageHeaderButton[\s\S]*responsive=\{false\}[\s\S]*openAddPrinterModal/,
  );
});

test("client printer fallback waits for settled data and stays retryable", () => {
  assert.match(
    pageSource,
    /shouldShowClientSnapshotWarning\(\{[\s\S]*initialLoadSettled: librarySyncReady && !loading/,
  );
  assert.match(
    pageSource,
    /clientHostWarningVisible && !librarySyncError && !loadError/,
  );
  assert.match(pageSource, /<PageDataFallbackBanner/);
  assert.match(pageSource, /onRetry=\{\(\) => void reloadData\(\)\}/);
});

test("add-printer visual QA waits for loaded desktop data and opens the real modal", () => {
  assert.match(pageSource, /desktopVisualQaScenario === "add-printer"/);
  assert.match(
    pageSource,
    /desktopVisualQaScenario !== "add-printer" \|\|[\s\S]*loading \|\|[\s\S]*!tauri/,
  );
  assert.match(
    pageSource,
    /openAddPrinterModalForVisualQa\(\{ showBambuLiveStep: true \}\)/,
  );
  assert.match(pageSource, /setDesktopVisualQaApplied\(true\)/);
  assert.match(pageSource, /showAddPrinterModal \? \([\s\S]*<AddPrinterModal/);
  assert.match(pageSource, /DESKTOP_VISUAL_QA_ADD_PRINTER_READINESS_TOKEN/);
  assert.match(pageSource, /data-testid="add-printer-bambu-live-step"/);
  assert.match(pageSource, /signalDesktopVisualQaReadiness/);
});

test("add-printer visual QA initializes the optional Bambu Live step with synthetic local state", () => {
  const previewStart = workflowSource.indexOf(
    "const openAddPrinterModalForVisualQa",
  );
  const regularOpenStart = workflowSource.indexOf(
    "const openAddPrinterModal =",
    previewStart,
  );
  const previewBlock = workflowSource.slice(previewStart, regularOpenStart);
  assert.match(previewBlock, /options\?: \{ showBambuLiveStep\?: boolean \}/);
  assert.match(previewBlock, /"Bambu Lab P1S"/);
  assert.match(previewBlock, /"Atlas QA"/);
  assert.match(previewBlock, /setNewBambuLiveEnabled\(showBambuLiveStep\)/);
  assert.match(previewBlock, /setShowAddPrinterModal\(true\)/);
  assert.match(
    pageSource,
    /openAddPrinterModalForVisualQa\(\{ showBambuLiveStep: true \}\)/,
  );
  assert.match(
    pageSource,
    /initialStep=\{\s*desktopVisualQaScenario === "add-printer" \? "LIVE" : "PRINTER"\s*\}/,
  );
  assert.match(
    workflowSource,
    /const openAddPrinterModal = useCallback\(\(\) => \{[\s\S]*openAddPrinterModalForVisualQa\(\);/,
  );
  assert.doesNotMatch(
    previewBlock,
    /createManagedPrinter|handleAddPrinter|reloadData/,
  );
});

test("Bambu printer onboarding exposes Live as an explicit optional second step", () => {
  assert.match(addPrinterModalSource, /initialStep = "PRINTER"/);
  assert.match(
    addPrinterModalSource,
    /useState<"PRINTER" \| "LIVE">\(initialStep\)/,
  );
  assert.match(
    addPrinterModalSource,
    /data-testid="add-printer-bambu-live-step"/,
  );
  assert.match(addPrinterModalSource, /SettingsBambuLiveSecurityControls/);
  assert.match(addPrinterModalSource, /newBambuLiveEnabled[\s\S]*onAddPrinter/);
  assert.match(workflowSource, /createManagedPrinterWithBambuLive/);
});

test("slot-onboarding visual QA retries until the real modal opens", () => {
  assert.match(
    pageSource,
    /desktopVisualQaScenario !== "printer-slot-onboarding"/,
  );
  assert.match(
    pageSource,
    /master &&[\s\S]*createLiveBambuCatalogSpool\([\s\S]*\)[\s\S]*\{[\s\S]*setDesktopVisualQaApplied\(true\)/,
  );
});

test("AMS weight-estimate visual QA opens the real weight dialog and waits for its card", () => {
  assert.match(
    pageSource,
    /desktopVisualQaScenario !== "printer-ams-weight-estimate"/,
  );
  assert.match(
    pageSource,
    /tray\.matched_inventory_mode !== "exact_rfid"/,
  );
  assert.match(
    pageSource,
    /openIncomingWeightDialog\(printer\.printer\.id, slot, row\)/,
  );
  assert.match(
    pageSource,
    /incomingWeightPrompt\?\.amsWeightEstimate/,
  );
  assert.match(
    pageSource,
    /data-testid="printer-ams-weight-estimate"/,
  );
  assert.match(
    pageSource,
    /DESKTOP_VISUAL_QA_PRINTER_AMS_WEIGHT_ESTIMATE_READINESS_TOKEN/,
  );
});
