import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseDesktopVisualQaSpoolId,
  DESKTOP_VISUAL_QA_SCENARIOS,
  desktopVisualQaScenarioDefinition,
  desktopVisualQaInitialPage,
  desktopVisualQaInitialSettingsTab,
  normalizeDesktopVisualQaScenario,
  resolveDesktopVisualQaScenario,
} from "./desktop_visual_qa_scenario";
import type { InventorySpool } from "./inventory_list_model";

function spool(overrides: Partial<InventorySpool>): InventorySpool {
  return {
    colorName: "Black",
    filamentName: "Matte",
    hexColor: "#000000",
    id: "spool-1",
    initialWeightGrams: 1000,
    material: "PLA",
    masterId: "master-1",
    ownershipType: "OWNED",
    remainingGrams: 800,
    status: "IN_STOCK",
    vendor: "Bambu",
    ...overrides,
  };
}

test("desktop visual QA scenario parser accepts stable aliases in dev only", () => {
  assert.deepEqual(DESKTOP_VISUAL_QA_SCENARIOS, [
    "dashboard-overview",
    "inventory-overview",
    "add-filament",
    "bambu-batch-add",
    "loans-overview",
    "loan-out",
    "selected-roll",
    "rfid-capture",
    "return-loan",
    "printer-board",
    "printer-slot-assignment",
    "printer-slot-onboarding",
    "printer-rfid-override",
    "printer-slot-replacement",
    "printer-slot-clear",
    "settings-general",
    "settings-library",
    "settings-library-network-details",
    "settings-printer-diagnostics",
    "settings-printer-diagnostics-fields",
    "settings-printer-diagnostics-paused",
    "settings-catalog",
    "settings-catalog-swatch-review",
    "settings-maintenance",
    "statistics-overview",
  ]);
  assert.equal(normalizeDesktopVisualQaScenario("dashboard"), "dashboard-overview");
  assert.equal(normalizeDesktopVisualQaScenario("inventory"), "inventory-overview");
  assert.equal(normalizeDesktopVisualQaScenario("inventory-add"), "add-filament");
  assert.equal(normalizeDesktopVisualQaScenario("loan-history"), "loans-overview");
  assert.equal(normalizeDesktopVisualQaScenario("DETAIL"), "selected-roll");
  assert.equal(normalizeDesktopVisualQaScenario("inventory-rfid"), "rfid-capture");
  assert.equal(normalizeDesktopVisualQaScenario("loan-return"), "return-loan");
  assert.equal(normalizeDesktopVisualQaScenario("printers"), "printer-board");
  assert.equal(normalizeDesktopVisualQaScenario("slot-assignment"), "printer-slot-assignment");
  assert.equal(normalizeDesktopVisualQaScenario("ams-onboarding"), "printer-slot-onboarding");
  assert.equal(normalizeDesktopVisualQaScenario("rfid-override"), "printer-rfid-override");
  assert.equal(normalizeDesktopVisualQaScenario("slot-swap"), "printer-slot-replacement");
  assert.equal(normalizeDesktopVisualQaScenario("slot-unload"), "printer-slot-clear");
  assert.equal(normalizeDesktopVisualQaScenario("batch-add"), "bambu-batch-add");
  assert.equal(normalizeDesktopVisualQaScenario("general-settings"), "settings-general");
  assert.equal(normalizeDesktopVisualQaScenario("companion-settings"), "settings-library");
  assert.equal(
    normalizeDesktopVisualQaScenario("trusted-lan-details"),
    "settings-library-network-details",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("bambu-live-diagnostics"),
    "settings-printer-diagnostics",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("bambu-live-diagnostics-fields"),
    "settings-printer-diagnostics-fields",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("bambu-live-diagnostics-paused"),
    "settings-printer-diagnostics-paused",
  );
  assert.equal(normalizeDesktopVisualQaScenario("filament-catalog"), "settings-catalog");
  assert.equal(
    normalizeDesktopVisualQaScenario("missing-swatches"),
    "settings-catalog-swatch-review",
  );
  assert.equal(normalizeDesktopVisualQaScenario("program-maintenance"), "settings-maintenance");
  assert.equal(normalizeDesktopVisualQaScenario("usage-statistics"), "statistics-overview");
  assert.equal(normalizeDesktopVisualQaScenario("unknown"), null);

  assert.equal(resolveDesktopVisualQaScenario("?bfm_visual_qa=loan-out", true), "loan-out");
  assert.equal(resolveDesktopVisualQaScenario("?bfm_visual_qa=loan-out", false), null);
});

test("desktop visual QA scenario manifest describes routing and fixture states", () => {
  assert.deepEqual(desktopVisualQaScenarioDefinition("inventory-add"), {
    aliases: ["inventory-add"],
    category: "modal",
    id: "add-filament",
    page: "inventory",
  });
  assert.equal(
    desktopVisualQaScenarioDefinition("ams-onboarding")?.requiresDatabaseFixture,
    true,
  );
  assert.equal(desktopVisualQaScenarioDefinition("trusted-lan-details")?.settingsTab, "LIBRARY");
  assert.equal(desktopVisualQaScenarioDefinition("statistics")?.page, "statistics");
  assert.equal(desktopVisualQaScenarioDefinition("unknown"), null);
});

test("desktop visual QA scenarios resolve to the page they exercise", () => {
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=dashboard-overview"), "dashboard");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=inventory-overview"), "inventory");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=add-filament"), "inventory");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=rfid-capture"), "inventory");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=loans-overview"), "loans");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=return-loan"), "loans");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=printer-board"), "printers");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=printer-slot-assignment"), "printers");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=printer-slot-onboarding"), "printers");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=printer-rfid-override"), "printers");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=printer-slot-replacement"), "printers");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=printer-slot-clear"), "printers");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=settings-general"), "settings");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=settings-library"), "settings");
  assert.equal(
    desktopVisualQaInitialPage("?bfm_visual_qa=settings-library-network-details"),
    "settings",
  );
  assert.equal(
    desktopVisualQaInitialPage("?bfm_visual_qa=settings-printer-diagnostics"),
    "settings",
  );
  assert.equal(
    desktopVisualQaInitialPage("?bfm_visual_qa=settings-printer-diagnostics-fields"),
    "settings",
  );
  assert.equal(
    desktopVisualQaInitialPage("?bfm_visual_qa=settings-printer-diagnostics-paused"),
    "settings",
  );
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=settings-catalog"), "settings");
  assert.equal(
    desktopVisualQaInitialPage("?bfm_visual_qa=settings-catalog-swatch-review"),
    "settings",
  );
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=settings-maintenance"), "settings");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=statistics-overview"), "statistics");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=bambu-batch-add"), "inventory");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=unknown"), null);
});

test("desktop visual QA settings scenarios resolve to the intended tab", () => {
  assert.equal(desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-general"), "GENERAL");
  assert.equal(desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-library"), "LIBRARY");
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-library-network-details"),
    "LIBRARY",
  );
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-printer-diagnostics"),
    "PRINTERS",
  );
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-printer-diagnostics-fields"),
    "PRINTERS",
  );
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-printer-diagnostics-paused"),
    "PRINTERS",
  );
  assert.equal(desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-catalog"), "CATALOG");
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-catalog-swatch-review"),
    "CATALOG",
  );
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-maintenance"),
    "MAINTENANCE",
  );
  assert.equal(desktopVisualQaInitialSettingsTab("?bfm_visual_qa=add-filament"), null);
  assert.equal(desktopVisualQaInitialSettingsTab("?bfm_visual_qa=unknown"), null);
});

test("desktop visual QA spool chooser prefers assigned RFID rolls for RFID capture", () => {
  const spools = [
    spool({ id: "empty", status: "EMPTY" }),
    spool({ id: "stock", rfidTag: "stock-rfid" }),
    spool({ id: "assigned", rfidTag: "assigned-rfid", status: "ASSIGNED" }),
  ];

  assert.equal(
    chooseDesktopVisualQaSpoolId(spools, new Set(["assigned"]), "rfid-capture"),
    "assigned",
  );
  assert.equal(chooseDesktopVisualQaSpoolId(spools, new Set(), "selected-roll"), "stock");
});

test("desktop visual QA spool chooser prefers non-Bambu detail examples", () => {
  const spools = [
    spool({ id: "bambu", vendor: "Bambu" }),
    spool({ id: "esun", vendor: "eSUN" }),
  ];

  assert.equal(chooseDesktopVisualQaSpoolId(spools, new Set(), "selected-roll"), "esun");
});
