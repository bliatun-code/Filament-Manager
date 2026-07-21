import assert from "node:assert/strict";
import test from "node:test";

import { buildSettingsMaintenanceRouteProps } from "./settings_maintenance_route_props";

test("maintenance route props preserve backup activity and locale", () => {
  const latestFullBackupExportedAt = "2026-07-21T12:34:56.000Z";
  const input = {
    latestFullBackupExportedAt,
    locale: "de",
    onDownloadSanitizedSupportBundle() {},
    onExportFullBackup() {},
    onExportInventoryCsv() {},
    onExportInventoryJson() {},
    onImportDataFile() {},
    onResetAppData() {},
    onResetCatalogs() {},
    onRefreshApplicationDiagnostics() {},
    onValidateBackupFile() {},
  } as Parameters<typeof buildSettingsMaintenanceRouteProps>[0];

  const props = buildSettingsMaintenanceRouteProps(input);

  assert.equal(props.tab.latestFullBackupExportedAt, latestFullBackupExportedAt);
  assert.equal(props.tab.locale, "de");
});
