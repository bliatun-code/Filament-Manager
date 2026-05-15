import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSettingsAppResetSuccessMessage,
  buildSettingsCatalogResetMessage,
  buildSettingsResetConfirmMessage,
} from "./settings_maintenance_model";

test("settings catalog reset message formats reset counts", () => {
  assert.equal(
    buildSettingsCatalogResetMessage(
      {
        reactivated_count: 2,
        remaining_count: 12,
        removed_count: 4,
      },
      {
        catalogResetDone: "Catalog reset done",
        reactivated: "reactivated",
        remaining: "remaining",
        removed: "Removed",
      },
    ),
    "Catalog reset done. Removed 4, remaining 12, reactivated 2.",
  );
});

test("settings reset confirm messages follow the requested action", () => {
  const labels = {
    confirmResetAppTapAgain: "Click Reset app data again to confirm.",
    confirmResetCatalogsTapAgain: "Click Reset catalogs again to confirm.",
  };

  assert.equal(buildSettingsResetConfirmMessage("app", labels), labels.confirmResetAppTapAgain);
  assert.equal(
    buildSettingsResetConfirmMessage("catalog", labels),
    labels.confirmResetCatalogsTapAgain,
  );
});

test("settings app reset success message returns stable copy", () => {
  assert.equal(
    buildSettingsAppResetSuccessMessage({
      appResetDone: "App data reset completed.",
    }),
    "App data reset completed.",
  );
});
