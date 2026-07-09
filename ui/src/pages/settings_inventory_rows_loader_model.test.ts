import assert from "node:assert/strict";
import test from "node:test";

import { loadSettingsInventoryRowsForExport } from "./settings_inventory_rows_loader_model";
import { normalizeSpoolWithMasterRows } from "../lib/spool_row_normalization";
import type { SpoolWithMasterRow } from "../lib/tauri_client";

function row(id: string, status = "IN_STOCK", ownershipType = "OWNED"): SpoolWithMasterRow {
  return {
    spool: { id, ownership_type: ownershipType, status },
    master: {},
  } as SpoolWithMasterRow;
}

test("loadSettingsInventoryRowsForExport uses loaded settings rows when client refresh fails", async () => {
  const fallbackRows = [row("loaded-spool", "IN_USE", "borrowed-in")];
  const rows = await loadSettingsInventoryRowsForExport({
    fallbackRows,
    loadAllSpoolRows: async () => {
      throw new Error("host unavailable");
    },
    options: {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
    },
    pageLimit: 200,
  });

  assert.deepEqual(rows.map((entry) => entry.spool.id), ["loaded-spool"]);
  assert.equal(rows[0]?.spool.status, "IN_USE");
  assert.equal(rows[0]?.spool.normalized_status, "ASSIGNED");
  assert.equal(rows[0]?.spool.ownership_type, "BORROWED_IN");
});

test("loadSettingsInventoryRowsForExport prefers refreshed rows when available", async () => {
  const rows = await loadSettingsInventoryRowsForExport({
    fallbackRows: [row("loaded-spool")],
    loadAllSpoolRows: async (options, pageLimit) => {
      assert.equal(options.clientReadOnly, true);
      assert.equal(pageLimit, 200);
      return normalizeSpoolWithMasterRows([row("fresh-spool", "loaned out", "OWNED")]);
    },
    options: {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
    },
    pageLimit: 200,
  });

  assert.deepEqual(rows.map((entry) => entry.spool.id), ["fresh-spool"]);
  assert.equal(rows[0]?.spool.status, "loaned out");
  assert.equal(rows[0]?.spool.normalized_status, "BORROWED");
  assert.equal(rows[0]?.spool.ownership_type, "OWNED");
});

test("loadSettingsInventoryRowsForExport keeps local export failures visible", async () => {
  await assert.rejects(
    () =>
      loadSettingsInventoryRowsForExport({
        fallbackRows: [row("loaded-spool")],
        loadAllSpoolRows: async () => {
          throw new Error("local export failed");
        },
        options: {
          clientReadOnly: false,
          clientHostBaseUrl: null,
          clientLibraryId: null,
        },
        pageLimit: 200,
      }),
    /local export failed/,
  );
});
