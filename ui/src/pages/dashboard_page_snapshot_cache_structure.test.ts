import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardHookSource = readFileSync(
  new URL("./use_dashboard_page_data.ts", import.meta.url),
  "utf8",
);
const libraryActionsSource = readFileSync(
  new URL("./use_settings_library_sync_actions.ts", import.meta.url),
  "utf8",
);
const backupActionsSource = readFileSync(
  new URL("./use_settings_backup_file_actions.ts", import.meta.url),
  "utf8",
);
const maintenanceActionsSource = readFileSync(
  new URL("./use_settings_maintenance_actions.ts", import.meta.url),
  "utf8",
);

test("dashboard caches successful navigation-away loads before honoring cancellation", () => {
  const writeIndex = dashboardHookSource.indexOf(
    "const cacheAccepted = writeDashboardPageSnapshot",
  );
  const cancellationIndex = dashboardHookSource.indexOf(
    "if (cancelledRef?.current || !cacheAccepted)",
  );

  assert.notEqual(writeIndex, -1);
  assert.notEqual(cancellationIndex, -1);
  assert.ok(writeIndex < cancellationIndex);
  assert.match(
    dashboardHookSource,
    /updateDashboardPageSnapshot\([\s\S]*companionStatus: trustedLanResult\.value/,
  );
  assert.match(
    dashboardHookSource,
    /const snapshotRequest = beginDashboardPageSnapshotRequest\([\s\S]*writeDashboardPageSnapshot\([\s\S]*snapshotRequest/,
  );
  assert.match(
    dashboardHookSource,
    /calendarMonthChanged[\s\S]*!observation\.shouldReload && !calendarMonthChanged/,
  );
});

test("library source changes invalidate the dashboard snapshot", () => {
  const saveSource = libraryActionsSource.slice(
    libraryActionsSource.indexOf("const handleSaveLibrarySyncSettings"),
    libraryActionsSource.indexOf("const handleSaveLibrarySyncDeviceName"),
  );
  const pairingSource = libraryActionsSource.slice(
    libraryActionsSource.indexOf("const handlePairLibrarySyncHost"),
    libraryActionsSource.indexOf("const handleClearLibrarySyncClientAuth"),
  );

  assert.match(saveSource, /clearDashboardPageSnapshot\(\)/);
  assert.match(pairingSource, /clearDashboardPageSnapshot\(\)/);
});

test("desktop pairing retains actionable host-validation feedback", () => {
  const pairingSource = libraryActionsSource.slice(
    libraryActionsSource.indexOf("const handlePairLibrarySyncHost"),
    libraryActionsSource.indexOf("const handleClearLibrarySyncClientAuth"),
  );

  assert.match(
    pairingSource,
    /message: validation\.ok\s*\?\s*buildLibrarySyncPairingMessage\([\s\S]*?: validation\.message/,
  );
});

test("full restores and app resets invalidate the dashboard snapshot", () => {
  assert.match(
    backupActionsSource,
    /if \(fullBackupValidation\) \{\s*clearDashboardPageSnapshot\(\);/,
  );
  const resetSource = maintenanceActionsSource.slice(
    maintenanceActionsSource.indexOf("async function handleResetAppData"),
    maintenanceActionsSource.indexOf("async function handleResetCatalogs"),
  );
  assert.match(resetSource, /clearDashboardPageSnapshot\(\)/);
});
