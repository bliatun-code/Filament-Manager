import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./settings.tsx", import.meta.url), "utf8");
const inventorySource = readFileSync(new URL("./inventory.tsx", import.meta.url), "utf8");
const printersSectionSource = readFileSync(
  new URL("./use_settings_printers_section.ts", import.meta.url),
  "utf8",
);
const labelSheetModalSource = readFileSync(
  new URL("../components/settings_inventory_label_sheet_modal.tsx", import.meta.url),
  "utf8",
);
const diagnosticsPanelSource = readFileSync(
  new URL("../components/settings_application_diagnostics_panel.tsx", import.meta.url),
  "utf8",
);
const maintenanceSectionSource = readFileSync(
  new URL("./use_settings_maintenance_section.ts", import.meta.url),
  "utf8",
);
const generalTabSource = readFileSync(
  new URL("../components/settings_general_tab.tsx", import.meta.url),
  "utf8",
);

test("update-check visual QA reveals the real automatic and manual update controls", () => {
  assert.match(source, /desktopVisualQaScenarioRef\.current !== "settings-updates"/);
  assert.match(source, /getElementById\("settings-update-check"\)/);
  assert.match(source, /target\.scrollIntoView\(\{ behavior: "auto", block: "center" \}\)/);
  assert.match(source, /window\.addEventListener\("resize", revealUpdateCheck\)/);
  assert.match(generalTabSource, /id="settings-update-check"/);
  assert.match(generalTabSource, /settings\.automaticUpdateChecks/);
  assert.match(generalTabSource, /updateCheck\.checkManually\(\)/);
});

test("general settings visual QA waits for and reveals background controls", () => {
  assert.match(source, /desktopVisualQaScenarioRef\.current !== "settings-general"/);
  assert.match(source, /desktopLifecycle\.loading/);
  assert.match(source, /!desktopLifecycle\.settings/);
  assert.match(source, /getElementById\("settings-background-operation"\)/);
  assert.match(
    source,
    /target\.scrollIntoView\(\{ behavior: "auto", block: "center" \}\)/,
  );
  assert.match(source, /new ResizeObserver\(revealBackgroundOperation\)/);
  assert.match(generalTabSource, /id="settings-background-operation"/);
});

test("inventory label sheet visual QA opens the real data-backed modal from Inventory", () => {
  assert.match(
    inventorySource,
    /desktopVisualQaScenario !== "settings-inventory-label-sheet"/,
  );
  assert.match(inventorySource, /void openInventoryLabelSheet\(\)/);
  assert.doesNotMatch(source, /inventoryLabelSheetModalProps/);
  assert.match(labelSheetModalSource, /id="inventory-label-sheet-builder"/);
  assert.match(labelSheetModalSource, /visibleItems\.map/);
});

test("network visual QA keeps summary and editor states bounded", () => {
  assert.match(source, /scenario === "settings-library-network-details"/);
  assert.match(source, /scenario === "settings-library-network-editor"/);
  assert.match(
    source,
    /setShowTrustedLanNetworkEditor\(scenario === "settings-library-network-editor"\)/,
  );
  assert.match(source, /setShowTrustedLanNetworkSummary\(isNetworkScenario\)/);
  assert.match(source, /setShowLibraryClientAdvanced\(false\)/);
  assert.match(
    source,
    /setShowTrustedLanRevokedBrowsers\(\s*scenario === "settings-library-browsers-history"/,
  );
});

test("library detail visual QA scrolls only after settings and Trusted LAN data load", () => {
  assert.match(source, /if \(loading \|\| trustedLanLoading\)/);
  assert.match(source, /"trusted-lan-network-editor"[\s\S]*"trusted-lan-network-details"/);
  assert.match(source, /"trusted-lan-pairing-panel"/);
  assert.match(source, /"trusted-lan-browsers-panel"/);
  assert.match(source, /const scrollBlock = isBrowsersScenario \? "start" : "center"/);
  assert.match(source, /scrollIntoView\(\{ behavior: "auto", block: scrollBlock \}\)/);
  assert.match(source, /window\.addEventListener\("resize", revealTarget\)/);
  assert.match(source, /new ResizeObserver\(revealTarget\)/);
  assert.match(source, /\[150, 450, 900\]\.map/);
  assert.doesNotMatch(source, /desktopVisualQaScrollAppliedRef/);
});

test("pairing and browser visual QA only toggle local disclosure state", () => {
  assert.match(source, /scenario === "settings-library-pairing"/);
  assert.match(source, /scenario === "settings-library-browsers"/);
  assert.match(source, /scenario === "settings-library-browsers-history"/);
  assert.doesNotMatch(
    source,
    /settings-library-pairing"[\s\S]{0,500}handleCreateTrustedLanPairingLink/,
  );
});

test("library role visual QA opens a real role-change modal without confirming it", () => {
  assert.match(source, /scenario === "settings-library-role-change"/);
  assert.match(source, /desktopVisualQaRoleChangeAppliedRef = useRef\(false\)/);
  assert.match(
    source,
    /librarySyncSavedMode === "CLIENT" \? "STANDALONE" : "CLIENT"/,
  );
  assert.match(source, /handleRequestLibraryRoleChange\(targetMode\)/);
  assert.match(source, /desktopVisualQaRoleChangeAppliedRef\.current = true/);
  assert.doesNotMatch(
    source,
    /settings-library-role-change"[\s\S]{0,900}handleConfirmLibraryRoleChange\(/,
  );
});

test("printer editor visual QA opens a loaded draft without invoking a save", () => {
  assert.match(
    printersSectionSource,
    /visualQaScenario === "settings-printer-editor" \|\|[\s\S]*visualQaScenario === "settings-printer-editor-dirty" \|\|[\s\S]*visualQaScenario === "settings-printer-editor-discard"/,
  );
  assert.match(printersSectionSource, /if \(!isPrinterEditorVisualQaScenario \|\| loading\)/);
  assert.match(printersSectionSource, /chooseSettingsPrinterEditorVisualQaPrinter/);
  assert.match(printersSectionSource, /setExpandedBambuDetailsPrinterId\(null\)/);
  assert.match(printersSectionSource, /startPrinterEdit\(\{/);
  assert.match(
    printersSectionSource,
    /data-desktop-visual-qa-target='settings-printer-editor'/,
  );
  assert.match(
    printersSectionSource,
    /data-desktop-visual-qa-target='settings-printer-editor-actions'/,
  );
  assert.match(printersSectionSource, /\[150, 450, 900\]/);
  assert.match(printersSectionSource, /window\.addEventListener\("resize", scheduleReveal\)/);
  assert.doesNotMatch(
    printersSectionSource,
    /settings-printer-editor-dirty"[\s\S]{0,1200}handleSavePrinterReconfigure\(/,
  );
});

test("dirty printer editor visual QA changes only the local draft name", () => {
  assert.match(printersSectionSource, /visualQaScenario === "settings-printer-editor-dirty"/);
  assert.match(printersSectionSource, /visualQaScenario === "settings-printer-editor-discard"/);
  assert.match(printersSectionSource, /const dirtyPrinterName = `\$\{editorPrinter\.name\} \(draft\)`/);
  assert.match(printersSectionSource, /setEditPrinterName\(dirtyPrinterName\)/);
  assert.doesNotMatch(
    printersSectionSource,
    /settings-printer-editor-dirty"[\s\S]{0,1000}onSavePrinterReconfigure/,
  );
});

test("discard printer editor visual QA clicks the real cancel action once after dirty render", () => {
  assert.match(printersSectionSource, /const printerEditorDiscardAppliedRef = useRef\(false\)/);
  assert.match(
    printersSectionSource,
    /visualQaScenario !== "settings-printer-editor-discard"[\s\S]*!editPrinterDirty/,
  );
  assert.match(
    printersSectionSource,
    /data-desktop-visual-qa-target='settings-printer-discard-confirmation'/,
  );
  assert.match(
    printersSectionSource,
    /data-desktop-visual-qa-action='settings-printer-cancel'/,
  );
  assert.match(printersSectionSource, /!cancelButton \|\| cancelButton\.disabled/);
  assert.match(printersSectionSource, /printerEditorDiscardAppliedRef\.current = true/);
  assert.match(printersSectionSource, /cancelButton\.click\(\)/);
  assert.match(printersSectionSource, /\[150, 450, 900, 1_400\]/);
  assert.match(printersSectionSource, /window\.addEventListener\("resize", scheduleReveal\)/);
  assert.doesNotMatch(
    printersSectionSource,
    /settings-printer-editor-discard"[\s\S]{0,1400}handleSavePrinterReconfigure\(/,
  );
});

test("captured diagnostics visual QA waits for fields and re-reveals them after resize", () => {
  assert.match(
    printersSectionSource,
    /diagnosticCaptureByPrinterId\[expandedBambuDetailsPrinterId\]\?\.fields\.length \?\? 0/,
  );
  assert.match(printersSectionSource, /if \(capturedFieldCount === 0\)/);
  assert.match(printersSectionSource, /\[150, 450, 900\]\.map/);
  assert.match(printersSectionSource, /window\.addEventListener\("resize", scheduleReveal\)/);
  assert.match(
    printersSectionSource,
    /scrollIntoView\(\{ behavior: "auto", block: "start" \}\)/,
  );
  assert.match(
    printersSectionSource,
    /window\.removeEventListener\("resize", scheduleReveal\)/,
  );
});

test("application diagnostics visual QA waits for real data and centers the stable panel", () => {
  assert.match(
    source,
    /desktopVisualQaScenarioRef\.current !== "settings-application-diagnostics"[\s\S]*applicationDiagnosticsStatus !== "success"/,
  );
  assert.match(
    source,
    /getElementById\("settings-application-diagnostics-panel"\)/,
  );
  assert.match(
    source,
    /target\.scrollIntoView\(\{ behavior: "auto", block: "center" \}\)/,
  );
  assert.match(source, /\[150, 450, 900\]\.map/);
  assert.match(source, /window\.addEventListener\("resize", revealDiagnostics\)/);
  assert.match(source, /new ResizeObserver\(revealDiagnostics\)/);
  assert.match(
    diagnosticsPanelSource,
    /id="settings-application-diagnostics-panel"/,
  );
  assert.match(maintenanceSectionSource, /return \{[\s\S]*applicationDiagnosticsStatus/);
});
