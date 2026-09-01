import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ApplicationDiagnostics, BackupValidationStats } from "../lib/tauri_client";
import type { Locale } from "../lib/i18n";
import { SettingsMaintenanceTab } from "./settings_maintenance_tab";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const source = readFileSync(
  new URL("./settings_maintenance_tab.tsx", import.meta.url),
  "utf8",
);
const diagnosticsPanelSource = readFileSync(
  new URL("./settings_application_diagnostics_panel.tsx", import.meta.url),
  "utf8",
);
const maintenanceActionsSource = readFileSync(
  new URL("../pages/use_settings_maintenance_actions.ts", import.meta.url),
  "utf8",
);

test("SettingsMaintenanceTab reset actions reuse shared settings action buttons", () => {
  assert.match(source, /settingsActionButtonClass\("warning", "comfortable"\)/);
  assert.match(source, /settingsActionButtonClass\("danger", "comfortable"\)/);
  assert.doesNotMatch(source, /rounded-xl border border-amber-400 bg-amber-200/);
  assert.doesNotMatch(source, /rounded-xl border border-rose-400 bg-rose-200/);
});

function renderMaintenanceTab(
  lastBackupValidation: BackupValidationStats | null,
  confirmResetAction: "APP" | "CATALOG" | null = null,
  applicationDiagnostics: ApplicationDiagnostics | null = null,
  applicationDiagnosticsError: string | null = null,
  latestFullBackupExportedAt: string | null = null,
  locale: Locale = "en",
  counts: { catalog: number | string; missingSwatches: number | string } = {
    catalog: 12,
    missingSwatches: 2,
  },
) {
  return renderToStaticMarkup(
    React.createElement(SettingsMaintenanceTab, {
      applicationDiagnostics,
      applicationDiagnosticsError,
      applicationDiagnosticsStatus: applicationDiagnosticsError ? "error" : "success",
      backupImportInputRef: React.createRef<HTMLInputElement>(),
      backupValidateInputRef: React.createRef<HTMLInputElement>(),
      backupValidationHasExtraTables: false,
      backupValidationHasMissingTables: false,
      backupValidationHasWarnings: false,
      busy: false,
      catalogCount: counts.catalog,
      confirmResetAction,
      lastBackupValidation,
      lastCatalogReset: null,
      latestFullBackupExportedAt,
      locale,
      missingSwatchCount: counts.missingSwatches,
      printerCount: 1,
      settingsClientHostWritePaired: false,
      settingsClientReadOnly: false,
      supportBundleError: null,
      supportBundleStatus: "idle",
      tauri: true,
      t: (_key, fallback) => fallback,
      onExportFullBackup: () => {},
      onDownloadSanitizedSupportBundle: () => {},
      onExportInventoryCsv: () => {},
      onExportInventoryJson: () => {},
      onImportDataFile: () => {},
      onCancelReset: () => {},
      onOpenBackupValidate: () => {},
      onOpenDataImport: () => {},
      onResetAppData: () => {},
      onResetCatalogs: () => {},
      onRefreshApplicationDiagnostics: () => {},
      onValidateBackupFile: () => {},
    }),
  );
}

test("SettingsMaintenanceTab renders unresolved catalog metrics as unknown", () => {
  const html = renderMaintenanceTab(
    null,
    null,
    null,
    null,
    null,
    "en",
    { catalog: "—", missingSwatches: "—" },
  );

  assert.ok((html.match(/—/g) ?? []).length >= 2);
});

const healthyDiagnostics: ApplicationDiagnostics = {
  generated_at_ms: 1_783_000_000_000,
  app_version: "0.21.2",
  database: {
    available: true,
    schema_version: 1,
    supported_schema_version: 1,
    quick_check: "ok",
    foreign_key_check: "ok",
    journal_mode: "wal",
    size_bytes: 2 * 1024 * 1024,
    local_db_path: "/Users/example/Library/Application Support/Filament Manager/data.db", // path-portability-allow: intentional display fixture
  },
};

test("SettingsMaintenanceTab keeps reset confirmation inline with confirm and cancel", () => {
  const catalogHtml = renderMaintenanceTab(null, "CATALOG");
  assert.match(catalogHtml, /role="alert"/);
  assert.match(catalogHtml, /Repair the catalog\?/);
  assert.match(catalogHtml, /Confirm catalog repair/);
  assert.match(catalogHtml, /Cancel/);
  assert.doesNotMatch(catalogHtml, /Reset app data\?\s*This clears inventory/);

  const appHtml = renderMaintenanceTab(null, "APP");
  assert.match(appHtml, /role="alert"/);
  assert.match(appHtml, /Reset app data\?/);
  assert.match(appHtml, /Confirm reset app data/);
  assert.match(appHtml, /Cancel/);
  assert.doesNotMatch(appHtml, /Repair the catalog\?\s*The bundled seed catalog/);

  assert.match(source, /onCancel=\{onCancelReset\}/);
  assert.match(source, /onClick=\{onCancel\}/);
  assert.match(source, /tone="warning"/);
  assert.match(source, /tone="danger"/);
});

test("arming reset clears global feedback instead of publishing success info", () => {
  assert.doesNotMatch(maintenanceActionsSource, /buildSettingsResetConfirmMessage/);
  assert.doesNotMatch(
    maintenanceActionsSource,
    /setInfo\([^)]*confirmReset(?:App|Catalogs)TapAgain/,
  );
  assert.match(
    maintenanceActionsSource,
    /setConfirmResetAction\("APP"\);\s*setError\(null\);\s*setInfo\(null\);/,
  );
  assert.match(
    maintenanceActionsSource,
    /setConfirmResetAction\("CATALOG"\);\s*setError\(null\);\s*setInfo\(null\);/,
  );
});

test("SettingsMaintenanceTab shows the backup empty state only before validation", () => {
  const emptyHtml = renderMaintenanceTab(null);
  assert.match(emptyHtml, /Validate a backup file here to see compatibility details/);
  assert.doesNotMatch(emptyHtml, /Backup validation summary/);

  const validatedHtml = renderMaintenanceTab({
    format: "FULL_BACKUP",
    expected_tables: 8,
    present_tables: 8,
    total_rows: 42,
    missing_tables: [],
    extra_tables: [],
  });
  assert.match(validatedHtml, /Backup validation summary/);
  assert.doesNotMatch(
    validatedHtml,
    /Validate a backup file here to see compatibility details/,
  );
});

test("SettingsMaintenanceTab shows persistent full-backup activity beside restore actions", () => {
  const emptyHtml = renderMaintenanceTab(null);
  assert.match(emptyHtml, /No full-backup export recorded on this device yet/);
  assert.match(emptyHtml, /Import backup\/data file/);
  assert.match(emptyHtml, /Validate backup file/);

  const exportedHtml = renderMaintenanceTab(
    null,
    null,
    null,
    null,
    "2026-07-21T12:34:56.000Z",
    "de",
  );
  assert.match(exportedHtml, /Latest full-backup export on this device/);
  assert.match(exportedHtml, /21\.07\.2026/);
  assert.doesNotMatch(exportedHtml, /No full-backup export recorded on this device yet/);
});

test("SettingsMaintenanceTab shows compact application diagnostics and local actions", () => {
  const html = renderMaintenanceTab(null, null, healthyDiagnostics);

  assert.match(html, /Application diagnostics/);
  assert.match(html, /id="settings-application-diagnostics-panel"/);
  assert.match(html, /0\.21\.2/);
  assert.match(html, /1 \/ 1/);
  assert.match(html, /2\.0 MB/);
  assert.match(html, /Quick check/);
  assert.match(html, /Foreign-key check/);
  assert.match(html, /WAL/);
  assert.match(html, /<details class="group/);
  assert.match(html, /<summary/);
  assert.match(html, />Show</);
  assert.match(html, /\/Users\/example\/Library\/Application Support/);
  assert.match(html, /Download sanitized support file/);
  assert.match(html, /Healthy/);
  assert.match(diagnosticsPanelSource, /onClick=\{onRefreshApplicationDiagnostics\}/);
  assert.match(diagnosticsPanelSource, /onClick=\{onDownloadSanitizedSupportBundle\}/);
});

test("SettingsMaintenanceTab keeps last-good diagnostics visible beside refresh errors", () => {
  const html = renderMaintenanceTab(
    null,
    null,
    healthyDiagnostics,
    "Diagnostics refresh failed.",
  );

  assert.match(html, /Diagnostics refresh failed\./);
  assert.match(html, /The last successful result remains visible\./);
  assert.match(html, /0\.21\.2/);
  assert.match(html, /role="alert"/);
});
