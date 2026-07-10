import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./printers.tsx", import.meta.url), "utf8");
const workflowSource = readFileSync(
  new URL("./use_add_printer_workflow.ts", import.meta.url),
  "utf8",
);

test("add-printer visual QA waits for loaded desktop data and opens the real modal", () => {
  assert.match(pageSource, /desktopVisualQaScenario === "add-printer"/);
  assert.match(
    pageSource,
    /desktopVisualQaScenario !== "add-printer" \|\|[\s\S]*loading \|\|[\s\S]*!tauri/,
  );
  assert.match(pageSource, /openAddPrinterModalForVisualQa\(\)/);
  assert.match(pageSource, /setDesktopVisualQaApplied\(true\)/);
  assert.match(pageSource, /showAddPrinterModal \? \([\s\S]*<AddPrinterModal/);
});

test("add-printer visual QA initializes only local form state", () => {
  assert.match(
    workflowSource,
    /const openAddPrinterModalForVisualQa = useCallback\(\(\) => \{[\s\S]*setNewPrinterModel\(""\);[\s\S]*setShowAddPrinterModal\(true\);/,
  );
  assert.match(
    workflowSource,
    /const openAddPrinterModal = useCallback\(\(\) => \{[\s\S]*openAddPrinterModalForVisualQa\(\);/,
  );
  const previewStart = workflowSource.indexOf("const openAddPrinterModalForVisualQa");
  const regularOpenStart = workflowSource.indexOf("const openAddPrinterModal =", previewStart);
  const previewBlock = workflowSource.slice(previewStart, regularOpenStart);
  assert.doesNotMatch(previewBlock, /createManagedPrinter|handleAddPrinter|reloadData/);
});
