import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSettingsPageDataModel,
  buildSettingsPageChromeLabels,
  buildSettingsPageDesktopOnlyMessage,
  buildSettingsPageLoadErrorMessage,
  buildSettingsPageTabButtons,
  buildSettingsPageTabLabels,
  buildSettingsPageTabs,
  isSettingsTabKey,
  SETTINGS_PAGE_TAB_ORDER,
  normalizeSettingsInitialTab,
  resolveSettingsPagePrinters,
} from "./settings_page_model";
import type {
  LibrarySyncSettings,
  MasterCatalogRow,
  PrinterOverviewRow,
  PrinterRow,
  PrinterSettingsSnapshot,
  SpoolWithMasterRow,
} from "../lib/tauri_client";

test("settings page load error message returns stable fallback copy", () => {
  const labels = {
    desktopOnly: "Settings are only available in the desktop app build.",
    loadFailed: "Failed to load settings.",
  };

  assert.equal(buildSettingsPageLoadErrorMessage(labels), labels.loadFailed);
  assert.equal(
    buildSettingsPageDesktopOnlyMessage(labels),
    labels.desktopOnly,
  );
});

test("settings page chrome labels keep the page header copy explicit", () => {
  const labels = {
    desktopOnly: "Settings are only available in the desktop app build.",
    subtitle:
      "Configure trusted-LAN browser access, printers, catalogue updates and maintenance actions.",
    title: "Settings",
  };

  assert.deepEqual(buildSettingsPageChromeLabels(labels), labels);
});

test("settings page tab labels keep all primary tabs explicit", () => {
  const labels = buildSettingsPageTabLabels({
    CATALOG: "Filament catalogue",
    FILAMENT_DEFAULTS: "Filament defaults",
    GENERAL: "General",
    LIBRARY: "Library & web app",
    MAINTENANCE: "Program maintenance",
    PRINTERS: "3D printers",
  });

  assert.deepEqual(labels, {
    CATALOG: "Filament catalogue",
    FILAMENT_DEFAULTS: "Filament defaults",
    GENERAL: "General",
    LIBRARY: "Library & web app",
    MAINTENANCE: "Program maintenance",
    PRINTERS: "3D printers",
  });
});

test("settings page tabs keep the intended navigation order", () => {
  assert.deepEqual(SETTINGS_PAGE_TAB_ORDER, [
    "GENERAL",
    "FILAMENT_DEFAULTS",
    "LIBRARY",
    "PRINTERS",
    "CATALOG",
    "MAINTENANCE",
  ]);

  assert.deepEqual(
    buildSettingsPageTabs({
      CATALOG: "Filament catalogue",
      FILAMENT_DEFAULTS: "Filament defaults",
      GENERAL: "General",
      LIBRARY: "Library & web app",
      MAINTENANCE: "Program maintenance",
      PRINTERS: "3D printers",
    }),
    [
      { id: "GENERAL", label: "General" },
      { id: "FILAMENT_DEFAULTS", label: "Filament defaults" },
      { id: "LIBRARY", label: "Library & web app" },
      { id: "PRINTERS", label: "3D printers" },
      { id: "CATALOG", label: "Filament catalogue" },
      { id: "MAINTENANCE", label: "Program maintenance" },
    ],
  );
});

test("settings page tab buttons mark only the active tab", () => {
  const tabs = buildSettingsPageTabs({
    CATALOG: "Filament catalogue",
    FILAMENT_DEFAULTS: "Filament defaults",
    GENERAL: "General",
    LIBRARY: "Library & web app",
    MAINTENANCE: "Program maintenance",
    PRINTERS: "3D printers",
  });

  assert.deepEqual(
    buildSettingsPageTabButtons(tabs, "PRINTERS").map((tab) => ({
      active: tab.active,
      id: tab.id,
    })),
    [
      { active: false, id: "GENERAL" },
      { active: false, id: "FILAMENT_DEFAULTS" },
      { active: false, id: "LIBRARY" },
      { active: true, id: "PRINTERS" },
      { active: false, id: "CATALOG" },
      { active: false, id: "MAINTENANCE" },
    ],
  );
});

test("settings initial tab normalizer preserves valid tab keys", () => {
  assert.equal(normalizeSettingsInitialTab("GENERAL"), "GENERAL");
  assert.equal(normalizeSettingsInitialTab("FILAMENT_DEFAULTS"), "FILAMENT_DEFAULTS");
  assert.equal(normalizeSettingsInitialTab("LIBRARY"), "LIBRARY");
  assert.equal(normalizeSettingsInitialTab("PRINTERS"), "PRINTERS");
  assert.equal(normalizeSettingsInitialTab("CATALOG"), "CATALOG");
  assert.equal(normalizeSettingsInitialTab("MAINTENANCE"), "MAINTENANCE");
  assert.equal(normalizeSettingsInitialTab("library"), "GENERAL");
  assert.equal(normalizeSettingsInitialTab(null), "GENERAL");
  assert.equal(isSettingsTabKey("LIBRARY"), true);
  assert.equal(isSettingsTabKey("FILAMENT_DEFAULTS"), true);
  assert.equal(isSettingsTabKey("library"), false);
  assert.equal(isSettingsTabKey(null), false);
});

test("settings page printers prefer host overview rows in client mode", () => {
  const localPrinter = { id: "local" };
  const hostPrinter = { id: "host" };

  assert.deepEqual(
    resolveSettingsPagePrinters({
      overviewRows: [{ printer: hostPrinter }],
      snapshot: { printers: [localPrinter] },
      syncMode: "CLIENT",
    }),
    [hostPrinter],
  );
  assert.deepEqual(
    resolveSettingsPagePrinters({
      overviewRows: [{ printer: hostPrinter }],
      snapshot: { printers: [localPrinter] },
      syncMode: "HOST",
    }),
    [localPrinter],
  );
});

test("settings page data model prepares reload state in one place", () => {
  const localPrinter: PrinterRow = {
    created_at: "2026-05-15T10:00:00Z",
    id: "local",
    model: "MK4",
    name: "Local",
    updated_at: "2026-05-15T10:00:00Z",
  };
  const hostPrinter: PrinterRow = {
    created_at: "2026-05-15T10:00:00Z",
    id: "host",
    model: "X1C",
    name: "Host",
    updated_at: "2026-05-15T10:00:00Z",
  };
  const catalogRows: MasterCatalogRow[] = [
    {
      id: "master-1",
      material: "PLA",
      filament_name: "Basic",
      color_name: "Black",
      hex_color: "#111",
      default_weight: 1000,
      vendor: "Bambu",
      is_discontinued: false,
    },
  ];
  const snapshot: PrinterSettingsSnapshot = {
    active_printer_id: null,
    printers: [localPrinter],
    printer_models: [],
    bambu_live_integrations: [],
  };
  const syncSettings: LibrarySyncSettings = {
    mode: "CLIENT",
    device_name: "Desk",
    library_id: "library-1",
    host_base_url: "http://host.local",
    host_device_name: "Host",
    client_auth_paired: true,
    client_auth_paired_at: null,
    client_auth_expires_at: null,
  };
  const overviewRows: PrinterOverviewRow[] = [
    {
      printer: hostPrinter,
      slots: [],
      usage: {
        failed_jobs: 0,
        last_job_at: null,
        successful_jobs: 0,
        total_jobs: 0,
        total_used_g: 0,
      },
    },
  ];
  const spoolRows: SpoolWithMasterRow[] = [];
  const model = buildSettingsPageDataModel({
    bambuLiveIntegrations: { host: { enabled: true } },
    catalogRows,
    catalogRowsAvailable: true,
    librarySyncSnapshot: null,
    overviewRows,
    revisionPollComplete: true,
    snapshot,
    spoolRows,
    syncSettings,
  });

  assert.deepEqual(model.printers, [hostPrinter]);
  assert.equal(model.librarySyncModeDraft, "CLIENT");
  assert.equal(model.librarySyncDeviceNameDraft, "Desk");
  assert.equal(model.librarySyncHostBaseUrlDraft, "http://host.local");
  assert.equal(model.swatchDraftById["master-1"], "#111");
  assert.equal(model.catalogRowsAvailable, true);
  assert.equal(model.revisionPollComplete, true);
});
