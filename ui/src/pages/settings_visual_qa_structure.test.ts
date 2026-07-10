import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./settings.tsx", import.meta.url), "utf8");
const printersSectionSource = readFileSync(
  new URL("./use_settings_printers_section.ts", import.meta.url),
  "utf8",
);

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
