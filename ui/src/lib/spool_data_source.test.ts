import assert from "node:assert/strict";
import test from "node:test";

import { loadAllSpoolRowsWithPageLoader } from "./spool_data_source";
import type { SpoolWithMasterRow } from "./tauri_client";

function row(id: string): SpoolWithMasterRow {
  return {
    spool: { id },
    master: {},
  } as SpoolWithMasterRow;
}

test("loadAllSpoolRowsWithPageLoader advances offsets until the final partial page", async () => {
  const calls: Array<{ limit: number; offset: number }> = [];
  const rows = await loadAllSpoolRowsWithPageLoader(
    { clientReadOnly: false },
    2,
    async (_options, limit, offset) => {
      calls.push({ limit, offset });
      if (offset === 0) {
        return [row("spool-1"), row("spool-2")];
      }
      return [row("spool-3")];
    },
    4,
  );

  assert.deepEqual(calls, [
    { limit: 2, offset: 0 },
    { limit: 2, offset: 2 },
  ]);
  assert.deepEqual(rows.map((entry) => entry.spool.id), ["spool-1", "spool-2", "spool-3"]);
});

test("loadAllSpoolRowsWithPageLoader rejects pagination that never finishes", async () => {
  await assert.rejects(
    () =>
      loadAllSpoolRowsWithPageLoader(
        { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
        2,
        async () => [row("spool-1"), row("spool-2")],
        2,
      ),
    /pagination did not finish/,
  );
});

test("loadAllSpoolRowsWithPageLoader coerces invalid page limits", async () => {
  const calls: Array<{ limit: number; offset: number }> = [];
  const rows = await loadAllSpoolRowsWithPageLoader(
    { clientReadOnly: false },
    0,
    async (_options, limit, offset) => {
      calls.push({ limit, offset });
      return offset === 0 ? [row("spool-1")] : [];
    },
    3,
  );

  assert.deepEqual(calls, [
    { limit: 1, offset: 0 },
    { limit: 1, offset: 1 },
  ]);
  assert.deepEqual(rows.map((entry) => entry.spool.id), ["spool-1"]);
});
