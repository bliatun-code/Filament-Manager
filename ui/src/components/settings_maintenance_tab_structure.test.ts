import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { BackupValidationStats } from "../lib/tauri_client";
import { SettingsMaintenanceTab } from "./settings_maintenance_tab";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const source = readFileSync(
  new URL("./settings_maintenance_tab.tsx", import.meta.url),
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
) {
  return renderToStaticMarkup(
    React.createElement(SettingsMaintenanceTab, {
      backupImportInputRef: React.createRef<HTMLInputElement>(),
      backupValidateInputRef: React.createRef<HTMLInputElement>(),
      backupValidationHasExtraTables: false,
      backupValidationHasMissingTables: false,
      backupValidationHasWarnings: false,
      busy: false,
      catalogCount: 12,
      confirmResetAction,
      lastBackupValidation,
      lastCatalogReset: null,
      missingSwatchCount: 2,
      printerCount: 1,
      settingsClientHostWritePaired: false,
      settingsClientReadOnly: false,
      tauri: true,
      t: (_key, fallback) => fallback,
      onExportFullBackup: () => {},
      onExportInventoryCsv: () => {},
      onExportInventoryJson: () => {},
      onImportDataFile: () => {},
      onCancelReset: () => {},
      onOpenBackupValidate: () => {},
      onOpenDataImport: () => {},
      onResetAppData: () => {},
      onResetCatalogs: () => {},
      onValidateBackupFile: () => {},
    }),
  );
}

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
