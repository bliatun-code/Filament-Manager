import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseDesktopVisualQaLoanSpool,
  chooseDesktopVisualQaSpoolId,
  DESKTOP_VISUAL_QA_BORROWER_NAME,
  DESKTOP_VISUAL_QA_INBOUND_SPOOL_ID,
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
  assert.equal(DESKTOP_VISUAL_QA_BORROWER_NAME, "Sample maker space");
  assert.equal(DESKTOP_VISUAL_QA_INBOUND_SPOOL_ID, "visual_qa_spool_inbound_lagoon");
  assert.deepEqual(DESKTOP_VISUAL_QA_SCENARIOS, [
    "dashboard-overview",
    "dashboard-onboarding",
    "inventory-overview",
    "add-filament",
    "wishlist-queue",
    "bambu-batch-add",
    "loans-overview",
    "loan-out",
    "selected-roll",
    "selected-roll-label",
    "selected-roll-history",
    "selected-roll-danger-zone",
    "rfid-capture",
    "return-loan",
    "return-inbound-loan",
    "printer-board",
    "printer-overview",
    "add-printer",
    "printer-slot-assignment",
    "printer-slot-onboarding",
    "printer-rfid-override",
    "printer-slot-replacement",
    "printer-slot-clear",
    "settings-general",
    "settings-updates",
    "settings-inventory-label-sheet",
    "settings-library",
    "settings-library-role-change",
    "settings-library-network-details",
    "settings-library-network-editor",
    "settings-library-pairing",
    "settings-library-browsers",
    "settings-library-browsers-history",
    "settings-printer-diagnostics",
    "settings-printer-diagnostics-fields",
    "settings-printer-diagnostics-paused",
    "settings-printer-editor",
    "settings-printer-editor-dirty",
    "settings-printer-editor-discard",
    "settings-catalog",
    "settings-catalog-swatch-review",
    "settings-maintenance",
    "settings-application-diagnostics",
    "statistics-overview",
    "statistics-consumption",
    "statistics-borrower",
    "statistics-loans",
  ]);
  assert.equal(normalizeDesktopVisualQaScenario("dashboard"), "dashboard-overview");
  assert.equal(normalizeDesktopVisualQaScenario("getting-started"), "dashboard-onboarding");
  assert.equal(normalizeDesktopVisualQaScenario("inventory"), "inventory-overview");
  assert.equal(normalizeDesktopVisualQaScenario("inventory-add"), "add-filament");
  assert.equal(normalizeDesktopVisualQaScenario("wishlist-orders"), "wishlist-queue");
  assert.equal(normalizeDesktopVisualQaScenario("loan-history"), "loans-overview");
  assert.equal(normalizeDesktopVisualQaScenario("DETAIL"), "selected-roll");
  assert.equal(normalizeDesktopVisualQaScenario("qr-label"), "selected-roll-label");
  assert.equal(normalizeDesktopVisualQaScenario("roll-history"), "selected-roll-history");
  assert.equal(
    normalizeDesktopVisualQaScenario("inventory-danger-zone"),
    "selected-roll-danger-zone",
  );
  assert.equal(normalizeDesktopVisualQaScenario("inventory-rfid"), "rfid-capture");
  assert.equal(normalizeDesktopVisualQaScenario("loan-return"), "return-loan");
  assert.equal(
    normalizeDesktopVisualQaScenario("hand-back-borrowed-in"),
    "return-inbound-loan",
  );
  assert.equal(normalizeDesktopVisualQaScenario("printers"), "printer-board");
  assert.equal(
    normalizeDesktopVisualQaScenario("printers-static"),
    "printer-overview",
  );
  assert.equal(normalizeDesktopVisualQaScenario("printer-add"), "add-printer");
  assert.equal(normalizeDesktopVisualQaScenario("slot-assignment"), "printer-slot-assignment");
  assert.equal(normalizeDesktopVisualQaScenario("ams-onboarding"), "printer-slot-onboarding");
  assert.equal(normalizeDesktopVisualQaScenario("rfid-override"), "printer-rfid-override");
  assert.equal(normalizeDesktopVisualQaScenario("slot-swap"), "printer-slot-replacement");
  assert.equal(normalizeDesktopVisualQaScenario("slot-unload"), "printer-slot-clear");
  assert.equal(normalizeDesktopVisualQaScenario("batch-add"), "bambu-batch-add");
  assert.equal(normalizeDesktopVisualQaScenario("general-settings"), "settings-general");
  assert.equal(normalizeDesktopVisualQaScenario("update-check"), "settings-updates");
  assert.equal(
    normalizeDesktopVisualQaScenario("inventory-label-sheet"),
    "settings-inventory-label-sheet",
  );
  assert.equal(normalizeDesktopVisualQaScenario("companion-settings"), "settings-library");
  assert.equal(
    normalizeDesktopVisualQaScenario("library-role-dialog"),
    "settings-library-role-change",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("trusted-lan-details"),
    "settings-library-network-details",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("trusted-lan-editor"),
    "settings-library-network-editor",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("trusted-lan-pairing"),
    "settings-library-pairing",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("trusted-lan-browsers"),
    "settings-library-browsers",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("trusted-lan-browser-history"),
    "settings-library-browsers-history",
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
  assert.equal(normalizeDesktopVisualQaScenario("printer-editor"), "settings-printer-editor");
  assert.equal(
    normalizeDesktopVisualQaScenario("printer-editor-dirty"),
    "settings-printer-editor-dirty",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("printer-editor-discard"),
    "settings-printer-editor-discard",
  );
  assert.equal(normalizeDesktopVisualQaScenario("filament-catalog"), "settings-catalog");
  assert.equal(
    normalizeDesktopVisualQaScenario("missing-swatches"),
    "settings-catalog-swatch-review",
  );
  assert.equal(normalizeDesktopVisualQaScenario("program-maintenance"), "settings-maintenance");
  assert.equal(
    normalizeDesktopVisualQaScenario("settings-diagnostics"),
    "settings-application-diagnostics",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("application-diagnostics"),
    "settings-application-diagnostics",
  );
  assert.equal(normalizeDesktopVisualQaScenario("usage-statistics"), "statistics-overview");
  assert.equal(normalizeDesktopVisualQaScenario("total-consumption"), "statistics-consumption");
  assert.equal(
    normalizeDesktopVisualQaScenario("borrower-usage-breakdown"),
    "statistics-borrower",
  );
  assert.equal(normalizeDesktopVisualQaScenario("loan-usage-statistics"), "statistics-loans");
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
    desktopVisualQaScenarioDefinition("onboarding")?.requiresDatabaseFixture,
    true,
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("update-check")?.requiresDatabaseFixture,
    true,
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("ams-onboarding")?.requiresDatabaseFixture,
    true,
  );
  assert.deepEqual(desktopVisualQaScenarioDefinition("printers")?.readiness, {
    timeoutMs: 35_000,
    token: "printer-live-telemetry",
  });
  assert.equal(
    desktopVisualQaScenarioDefinition("printer-summary")?.requiresDatabaseFixture,
    true,
  );
  assert.equal(desktopVisualQaScenarioDefinition("printer-summary")?.readiness, undefined);
  assert.equal(desktopVisualQaScenarioDefinition("add-printer")?.readiness, undefined);
  assert.equal(desktopVisualQaScenarioDefinition("order-queue")?.requiresDatabaseFixture, true);
  assert.equal(
    desktopVisualQaScenarioDefinition("settings-diagnostics")?.requiresDatabaseFixture,
    true,
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("application-diagnostics")?.settingsTab,
    "MAINTENANCE",
  );
  assert.equal(desktopVisualQaScenarioDefinition("trusted-lan-details")?.settingsTab, "LIBRARY");
  assert.equal(
    desktopVisualQaScenarioDefinition("inventory-label-sheet")?.settingsTab,
    "GENERAL",
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("library-role-change")?.settingsTab,
    "LIBRARY",
  );
  assert.equal(desktopVisualQaScenarioDefinition("trusted-lan-editor")?.settingsTab, "LIBRARY");
  assert.equal(desktopVisualQaScenarioDefinition("trusted-lan-pairing")?.settingsTab, "LIBRARY");
  assert.equal(desktopVisualQaScenarioDefinition("trusted-lan-browsers")?.settingsTab, "LIBRARY");
  assert.equal(
    desktopVisualQaScenarioDefinition("trusted-lan-browser-history")?.settingsTab,
    "LIBRARY",
  );
  assert.equal(desktopVisualQaScenarioDefinition("printer-editor")?.settingsTab, "PRINTERS");
  assert.equal(
    desktopVisualQaScenarioDefinition("printer-editor-dirty")?.settingsTab,
    "PRINTERS",
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("printer-editor-discard")?.settingsTab,
    "PRINTERS",
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("printer-editor")?.requiresDatabaseFixture,
    undefined,
  );
  assert.equal(desktopVisualQaScenarioDefinition("statistics")?.page, "statistics");
  assert.equal(
    desktopVisualQaScenarioDefinition("statistics-consumption")?.requiresDatabaseFixture,
    undefined,
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("statistics-borrower")?.requiresDatabaseFixture,
    true,
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("hand-back-borrowed-in")?.requiresDatabaseFixture,
    true,
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("statistics-loans")?.requiresDatabaseFixture,
    undefined,
  );
  assert.equal(desktopVisualQaScenarioDefinition("unknown"), null);
});

test("desktop visual QA scenarios resolve to the page they exercise", () => {
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=dashboard-overview"), "dashboard");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=dashboard-onboarding"), "dashboard");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=inventory-overview"), "inventory");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=add-filament"), "inventory");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=wishlist-queue"), "inventory");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=selected-roll-history"), "inventory");
  assert.equal(
    desktopVisualQaInitialPage("?bfm_visual_qa=selected-roll-danger-zone"),
    "inventory",
  );
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=rfid-capture"), "inventory");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=loans-overview"), "loans");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=return-loan"), "loans");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=return-inbound-loan"), "loans");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=printer-board"), "printers");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=printer-overview"), "printers");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=add-printer"), "printers");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=printer-slot-assignment"), "printers");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=printer-slot-onboarding"), "printers");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=printer-rfid-override"), "printers");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=printer-slot-replacement"), "printers");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=printer-slot-clear"), "printers");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=settings-general"), "settings");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=settings-updates"), "settings");
  assert.equal(
    desktopVisualQaInitialPage("?bfm_visual_qa=settings-inventory-label-sheet"),
    "settings",
  );
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=settings-library"), "settings");
  assert.equal(
    desktopVisualQaInitialPage("?bfm_visual_qa=settings-library-role-change"),
    "settings",
  );
  assert.equal(
    desktopVisualQaInitialPage("?bfm_visual_qa=settings-library-network-details"),
    "settings",
  );
  assert.equal(
    desktopVisualQaInitialPage("?bfm_visual_qa=settings-library-network-editor"),
    "settings",
  );
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=settings-library-pairing"), "settings");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=settings-library-browsers"), "settings");
  assert.equal(
    desktopVisualQaInitialPage("?bfm_visual_qa=settings-library-browsers-history"),
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
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=settings-printer-editor"), "settings");
  assert.equal(
    desktopVisualQaInitialPage("?bfm_visual_qa=settings-printer-editor-dirty"),
    "settings",
  );
  assert.equal(
    desktopVisualQaInitialPage("?bfm_visual_qa=settings-printer-editor-discard"),
    "settings",
  );
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=settings-catalog"), "settings");
  assert.equal(
    desktopVisualQaInitialPage("?bfm_visual_qa=settings-catalog-swatch-review"),
    "settings",
  );
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=settings-maintenance"), "settings");
  assert.equal(
    desktopVisualQaInitialPage("?bfm_visual_qa=settings-application-diagnostics"),
    "settings",
  );
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=statistics-overview"), "statistics");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=statistics-consumption"), "statistics");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=statistics-borrower"), "statistics");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=statistics-loans"), "statistics");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=bambu-batch-add"), "inventory");
  assert.equal(desktopVisualQaInitialPage("?bfm_visual_qa=unknown"), null);
});

test("desktop visual QA settings scenarios resolve to the intended tab", () => {
  assert.equal(desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-general"), "GENERAL");
  assert.equal(desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-updates"), "GENERAL");
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-inventory-label-sheet"),
    "GENERAL",
  );
  assert.equal(desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-library"), "LIBRARY");
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-library-role-change"),
    "LIBRARY",
  );
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-library-network-details"),
    "LIBRARY",
  );
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-library-network-editor"),
    "LIBRARY",
  );
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-library-pairing"),
    "LIBRARY",
  );
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-library-browsers"),
    "LIBRARY",
  );
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-library-browsers-history"),
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
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-printer-editor"),
    "PRINTERS",
  );
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-printer-editor-dirty"),
    "PRINTERS",
  );
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-printer-editor-discard"),
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
  assert.equal(
    desktopVisualQaInitialSettingsTab("?bfm_visual_qa=settings-application-diagnostics"),
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

test("desktop visual QA RFID capture falls back to an assigned Bambu roll", () => {
  const spools = [
    spool({ id: "generic", vendor: "Generic", status: "ASSIGNED" }),
    spool({ id: "bambu", vendor: "Bambu Lab", status: "ASSIGNED" }),
  ];

  assert.equal(
    chooseDesktopVisualQaSpoolId(spools, new Set(["generic", "bambu"]), "rfid-capture"),
    "bambu",
  );
});

test("desktop visual QA spool chooser prefers non-Bambu detail examples", () => {
  const spools = [
    spool({ id: "bambu", vendor: "Bambu" }),
    spool({ id: "esun", vendor: "eSUN" }),
  ];

  assert.equal(chooseDesktopVisualQaSpoolId(spools, new Set(), "selected-roll"), "esun");
  assert.equal(
    chooseDesktopVisualQaSpoolId(spools, new Set(), "selected-roll-history"),
    "esun",
  );
  assert.equal(
    chooseDesktopVisualQaSpoolId(spools, new Set(), "selected-roll-danger-zone"),
    "esun",
  );
});

test("desktop visual QA selected-roll prefers a real bright neutral edge case", () => {
  const spools = [
    spool({
      id: "colorful",
      vendor: "eSUN",
      colorName: "Fire Engine Red",
      hexColor: "#D71440",
    }),
    spool({ id: "white", colorName: "Jade White", hexColor: "#FFFFFF" }),
    spool({ id: "near-white", colorName: "Cloud", hexColor: "#F2F3F4" }),
  ];

  assert.equal(chooseDesktopVisualQaSpoolId(spools, new Set(), "selected-roll"), "white");
  assert.equal(
    chooseDesktopVisualQaSpoolId(spools, new Set(), "selected-roll-history"),
    "colorful",
  );
  assert.equal(
    chooseDesktopVisualQaSpoolId(spools, new Set(), "selected-roll-danger-zone"),
    "colorful",
  );
});

test("desktop visual QA history prefers an unassigned used owned roll", () => {
  const spools = [
    spool({
      id: "loaned",
      vendor: "eSUN",
      colorName: "Deep Blue",
      status: "BORROWED",
    }),
    spool({
      id: "assigned",
      vendor: "eSUN",
      colorName: "Signal Orange",
    }),
    spool({
      id: "borrowed-in",
      vendor: "eSUN",
      colorName: "Forest Green",
      ownershipType: "BORROWED_IN",
    }),
    spool({
      id: "history",
      vendor: "eSUN",
      colorName: "Ocean Blue",
      remainingGrams: 780,
    }),
  ];

  assert.equal(
    chooseDesktopVisualQaSpoolId(
      spools,
      new Set(["assigned"]),
      "selected-roll-history",
    ),
    "history",
  );
});

test("desktop visual QA label preview prefers repeated-material catalog data", () => {
  const spools = [
    spool({ id: "white", colorName: "Jade White", hexColor: "#FFFFFF" }),
    spool({
      id: "label-stress",
      vendor: "Bambu",
      material: "ABS",
      filamentName: "ABS",
      colorName: "ABS Tangerine Yellow (40402)",
      hexColor: "#FFC72C",
    }),
  ];

  assert.equal(
    chooseDesktopVisualQaSpoolId(spools, new Set(), "selected-roll-label"),
    "label-stress",
  );
});

test("desktop visual QA loan-out prefers the brightest real non-Bambu gray midtone", () => {
  const spools = [
    spool({ id: "peach", vendor: "eSUN", colorName: "Peach Pink", hexColor: "#F6B8B8" }),
    spool({ id: "ash", vendor: "eSUN", colorName: "Ash Gray", hexColor: "#9B9EA0" }),
    spool({ id: "grey", vendor: "eSUN", colorName: "Grey", hexColor: "#BABAB8" }),
    spool({ id: "white", vendor: "eSUN", colorName: "White", hexColor: "#FFFFFF" }),
  ];

  assert.equal(chooseDesktopVisualQaLoanSpool(spools)?.id, "grey");
});
