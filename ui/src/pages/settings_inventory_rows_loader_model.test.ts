import assert from "node:assert/strict";
import test from "node:test";

import { loadSettingsInventoryRowsForExport, settingsInventoryExportContent } from "./settings_inventory_rows_loader_model";
import { normalizeSpoolWithMasterRows } from "../lib/spool_row_normalization";
import type { LibrarySyncSettings, SpoolWithMasterRow } from "../lib/tauri_client";

const options = { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library", clientTargetGeneration: 4 };
const original: LibrarySyncSettings = {
  mode: "CLIENT", host_base_url: options.clientHostBaseUrl, library_id: options.clientLibraryId,
  target_generation: 4, client_auth_paired: true, device_name: "Client",
};
const row = { spool: { id: "spool", status: "IN_USE", ownership_type: "borrowed-in" }, master: {} } as SpoolWithMasterRow;
const cached = { captured_at: "saved", rows: [row] };
const offline = async () => { throw new Error("Host unavailable"); };

test("inventory export reads only the matching complete offline copy after an interrupted Host read", async () => {
  for (const snapshot of [cached, { ...cached, rows: [] }, null]) {
    const result = loadSettingsInventoryRowsForExport(options, {
      loadRows: offline,
      loadCache: async (host, library, generation) => {
        assert.deepEqual([host, library, generation], ["http://host", "library", 4]);
        return snapshot;
      },
      loadStatus: async () => original,
    });
    if (snapshot) assert.deepEqual(await result, normalizeSpoolWithMasterRows(snapshot.rows));
    else await assert.rejects(result, /Host unavailable/);
  }
});

test("inventory export accepts a complete live list including an empty one without reading cached rows", async () => {
  for (const rows of [normalizeSpoolWithMasterRows([row]), []]) {
    const actual = await loadSettingsInventoryRowsForExport(options, {
      loadRows: async (source, limit) => {
        assert.deepEqual(source, options);
        assert.equal(limit, 200);
        return rows;
      },
      loadCache: async () => assert.fail("successful read requested cached rows"),
      loadStatus: async () => original,
    });
    assert.deepEqual(actual, rows);
  }
});

test("an export cannot publish live or cached rows after a Host, library, role or A–B–A switch", async () => {
  for (const changed of [{ host_base_url: "http://other" }, { library_id: "other" }, { mode: "HOST" }, { target_generation: 6 }]) {
    for (const interrupted of [true, false]) {
      let current = original;
      const finishRead = () => { current = { ...original, ...changed }; };
      await assert.rejects(loadSettingsInventoryRowsForExport(options, {
        loadRows: async () => {
          if (interrupted) return offline();
          finishRead();
          return normalizeSpoolWithMasterRows([row]);
        },
        loadCache: async () => { finishRead(); return cached; },
        loadStatus: async () => current,
      }), /connection changed/);
    }
  }
});

test("local export failures stay visible and a Client without a target cannot use local rows", async () => {
  await assert.rejects(loadSettingsInventoryRowsForExport({ clientReadOnly: false }, { loadRows: offline }), /Host unavailable/);
  await assert.rejects(loadSettingsInventoryRowsForExport({ clientReadOnly: true }, { loadRows: async () => assert.fail() }), /details are missing/);
});

test("standalone CSV and JSON exports use their native format and propagate database errors", async () => {
  const previousWindow = globalThis.window;
  const calls: string[] = [];
  globalThis.window = { __TAURI__: { invoke: async (command: string) => {
    calls.push(command);
    if (command === "export_inventory_csv") return { content: "CSV contents" };
    throw new Error("database unavailable");
  } } } as unknown as Window & typeof globalThis;
  try {
    const local = { clientReadOnly: false };
    assert.equal(await settingsInventoryExportContent("csv", local), "CSV contents");
    await assert.rejects(settingsInventoryExportContent("json", local), /database unavailable/);
    assert.deepEqual(calls, ["export_inventory_csv", "export_inventory_json"]);
  } finally {
    globalThis.window = previousWindow;
  }
});
