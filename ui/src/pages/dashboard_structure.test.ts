import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./dashboard.tsx", import.meta.url),
  "utf8",
);
const actionPanelSource = readFileSync(
  new URL("../components/dashboard_action_panel.tsx", import.meta.url),
  "utf8",
);
const lowStockPanelSource = readFileSync(
  new URL("../components/dashboard_low_stock_panel.tsx", import.meta.url),
  "utf8",
);
const lowStockPreferencesSource = readFileSync(
  new URL("../lib/dashboard_low_stock_preferences.ts", import.meta.url),
  "utf8",
);
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const inventorySource = readFileSync(
  new URL("./inventory.tsx", import.meta.url),
  "utf8",
);
const dashboardDataHookSource = readFileSync(
  new URL("./use_dashboard_page_data.ts", import.meta.url),
  "utf8",
);
const settingsSource = readFileSync(
  new URL("./settings.tsx", import.meta.url),
  "utf8",
);
const settingsPrintersSource = readFileSync(
  new URL("./use_settings_printers_section.ts", import.meta.url),
  "utf8",
);

test("Dashboard header action button keeps shared focus treatment", () => {
  assert.match(source, /PageHeaderButton/);
  assert.match(source, /variant="soft"/);
  assert.match(source, /responsive=\{false\}/);
  assert.doesNotMatch(
    source,
    /inline-flex items-center gap-2 rounded-lg border border-slate-300\/70 bg-white\/86 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-300\/25 backdrop-blur transition hover:bg-white dark:border-slate-700\/70/,
  );
});

test("Dashboard shows headline data in two columns in compact desktop windows", () => {
  assert.match(source, /min-\[720px\]:grid-cols-2 xl:grid-cols-4/);
  assert.doesNotMatch(source, /gap-4 md:grid-cols-2 xl:grid-cols-4/);
});

test("empty dashboard action opens the real add-spool workflow", () => {
  assert.match(source, /onAddFirstSpool=\{onAddFirstSpool\}/);
  assert.match(appSource, /kind: "ADD_SPOOL"/);
  assert.match(inventorySource, /navigationIntent\.kind === "ADD_SPOOL"/);
  assert.match(inventorySource, /openAddModal\(\)/);
});

test("Bambu Live attention opens the affected printer in Settings", () => {
  assert.match(source, /<DashboardActionPanel/);
  assert.match(
    actionPanelSource,
    /onOpenBambuLiveSettings\?\.\(item\.printerId\)/,
  );
  assert.match(appSource, /setSettingsInitialTab\("PRINTERS"\)/);
  assert.match(appSource, /setSettingsInitialPrinterId\(printerId\)/);
  assert.match(settingsSource, /initialPrinterId/);
  assert.match(
    settingsPrintersSource,
    /sortedPrinters\.find\(\(candidate\) => candidate\.id === initialPrinterId\)/,
  );
  assert.match(settingsPrintersSource, /handleStartEditPrinter\(printer\)/);
  assert.match(settingsPrintersSource, /settings-printer-editor/);
});

test("annual consumption visual QA scrolls the real populated panel into view", () => {
  assert.match(source, /desktopVisualQaScenario !== "dashboard-consumption"/);
  assert.match(source, /buildDesktopVisualQaUsageMonths\(\)/);
  assert.match(source, /displayedUsageTotal12m <= 0/);
  assert.match(
    source,
    /consumptionPanelRef\.current\?\.scrollIntoView\(\{ block: "center" \}\)/,
  );
  assert.match(
    source,
    /DESKTOP_VISUAL_QA_DASHBOARD_CONSUMPTION_READINESS_TOKEN/,
  );
  assert.match(source, /signalDesktopVisualQaReadiness/);
  assert.match(source, /data-testid="dashboard-consumption-panel"/);
});

test("dashboard overview visual QA waits for the rendered Bambu Live attention action", () => {
  assert.match(source, /desktopVisualQaScenario !== "dashboard-overview"/);
  assert.match(source, /item\.kind === "BAMBU_TRUST"/);
  assert.match(source, /!hasBambuLiveAction/);
  assert.match(source, /DESKTOP_VISUAL_QA_DASHBOARD_ATTENTION_READINESS_TOKEN/);
  assert.match(actionPanelSource, /data-testid="dashboard-action-required"/);
});

test("dashboard separates advisory low stock from mandatory actions below the headline stats", () => {
  assert.match(
    source,
    /item is DashboardLowStockAction => item\.kind === "LOW_STOCK"/,
  );
  assert.match(
    source,
    /Exclude<DashboardActionItem, DashboardLowStockAction>[\s\S]*item\.kind !== "LOW_STOCK"/,
  );
  assert.match(source, /items=\{priorityActionItems\}/);
  assert.match(source, /items=\{lowStockActionItems\}/);
  assert.ok(
    source.indexOf("min-[720px]:grid-cols-2 xl:grid-cols-4") <
      source.indexOf("<DashboardLowStockPanel"),
  );
  assert.match(lowStockPanelSource, /defaultExpanded = false/);
  assert.match(lowStockPanelSource, /aria-expanded=\{expanded\}/);
  assert.match(lowStockPanelSource, /hidden=\{!expanded\}/);
  assert.doesNotMatch(lowStockPanelSource, /aria-live=/);
  assert.doesNotMatch(lowStockPanelSource, /amber/);
  assert.doesNotMatch(actionPanelSource, /item\.kind === "LOW_STOCK"/);
});

test("dashboard stores low-stock visibility locally per library and bypasses it for visual QA", () => {
  assert.match(source, /libraryId,/);
  assert.match(
    source,
    /readDashboardLowStockPreferences\(\{[\s\S]*deterministic: deterministicDashboardPreferences,[\s\S]*libraryId/,
  );
  assert.match(
    source,
    /addHiddenDashboardLowStockProductKey\([\s\S]*item\.candidate\.productKey/,
  );
  assert.match(
    source,
    /removeHiddenDashboardLowStockProductKey\([\s\S]*item\.candidate\.productKey/,
  );
  assert.match(
    source,
    /const deterministicDashboardPreferences = desktopVisualQaScenario != null/,
  );
  assert.match(
    lowStockPreferencesSource,
    /DASHBOARD_LOW_STOCK_PREFERENCES_STORAGE_KEY_PREFIX/,
  );
  assert.match(lowStockPreferencesSource, /if \(deterministic \|\| !key\)/);
});

test("dashboard purchase actions use an explicit guard-preserving inventory intent", () => {
  assert.match(source, /onOpenPurchases=\{onOpenPurchases\}/);
  assert.match(appSource, /kind: "PURCHASES"/);
  assert.match(inventorySource, /navigationIntent\.kind === "PURCHASES"/);
  assert.match(inventorySource, /resetPurchaseQueue\(navigationIntent\.status\)/);
  assert.match(inventorySource, /openPurchaseQueue\(\)/);
  assert.match(inventorySource, /navigationIntent\.notice === "REUSED"/);
  assert.match(inventorySource, /dashboard\.actionPurchaseReused/);
  assert.match(source, /await refreshDashboard\(\)/);
  assert.match(
    dashboardDataHookSource,
    /LIBRARY_REVISION_DOMAINS\.wishlist/,
  );
});
