import assert from "node:assert/strict";
import test from "node:test";

import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import { inventoryBulkActionsCopy } from "./use_inventory_bulk_actions";

test("bulk label copy names the exact selected scope and never reuses the all-stock key", () => {
  const calls: Array<{ key: string; params: Record<string, unknown> }> = [];
  const t = ((
    key: string,
    fallback = "",
    params: Record<string, unknown> = {},
  ) => {
    calls.push({ key, params });
    return formatMessage(fallback, params, "en");
  }) as Parameters<typeof inventoryBulkActionsCopy>[0];
  const copy = inventoryBulkActionsCopy(t);

  assert.equal(copy.createLabels(1), "Create label sheet for 1 selected roll");
  assert.equal(copy.createLabels(3), "Create label sheet for 3 selected rolls");
  assert.deepEqual(
    calls.filter((call) => call.key === "inventory.bulkCreateLabels"),
    [
      { key: "inventory.bulkCreateLabels", params: { count: 1 } },
      { key: "inventory.bulkCreateLabels", params: { count: 3 } },
    ],
  );
  assert.equal(
    calls.some((call) => call.key === "settings.inventoryOverviewPrintAction"),
    false,
  );
});
