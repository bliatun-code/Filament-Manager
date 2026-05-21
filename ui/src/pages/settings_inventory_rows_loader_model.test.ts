import assert from "node:assert/strict";
import test from "node:test";

import { loadSettingsInventoryRowsForExport } from "./settings_inventory_rows_loader_model";
import type { SpoolWithMasterRow } from "../lib/tauri_client";

function row(id: string): SpoolWithMasterRow {
  return {
    spool: { id },
    master: {},
  } as SpoolWithMasterRow;
}

test("loadSettingsInventoryRowsForExport uses loaded settings rows when client refresh fails", async () => {
  const fallbackRows = [row("loaded-spool")];
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

  assert.equal(rows, fallbackRows);
});

test("loadSettingsInventoryRowsForExport prefers refreshed rows when available", async () => {
  const rows = await loadSettingsInventoryRowsForExport({
    fallbackRows: [row("loaded-spool")],
    loadAllSpoolRows: async (options, pageLimit) => {
      assert.equal(options.clientReadOnly, true);
      assert.equal(pageLimit, 200);
      return [row("fresh-spool")];
    },
    options: {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
    },
    pageLimit: 200,
  });

  assert.deepEqual(rows.map((entry) => entry.spool.id), ["fresh-spool"]);
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
