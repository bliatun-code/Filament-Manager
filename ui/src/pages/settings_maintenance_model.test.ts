import assert from "node:assert/strict";
import test from "node:test";

import { buildSettingsCatalogResetMessage } from "./settings_maintenance_model";

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
