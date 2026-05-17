import assert from "node:assert/strict";
import test from "node:test";

import { loadAllSpoolRowsWithPageLoader, loadSpoolRowsPage } from "./spool_data_source";
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

test("loadSpoolRowsPage uses host spools in client mode", async () => {
  const calls: Array<{ baseUrl: string; libraryId?: string | null; limit: number; offset: number }> = [];
  const rows = await loadSpoolRowsPage(
    {
      clientReadOnly: true,
      clientHostBaseUrl: " http://host ",
      clientLibraryId: " library-1 ",
    },
    25,
    50,
    {
      fetchHostSpools: async (baseUrl, libraryId, limit, offset) => {
        calls.push({ baseUrl, libraryId, limit, offset });
        return [row("host-spool")];
      },
      listLocalSpools: async () => {
        throw new Error("local spools should not load in client mode");
      },
    },
  );

  assert.deepEqual(calls, [
    { baseUrl: "http://host", libraryId: "library-1", limit: 25, offset: 50 },
  ]);
  assert.deepEqual(rows.map((entry) => entry.spool.id), ["host-spool"]);
});

test("loadSpoolRowsPage rejects incomplete client host targets instead of reading local spools", async () => {
  await assert.rejects(
    () =>
      loadSpoolRowsPage(
        { clientReadOnly: true, clientHostBaseUrl: " ", clientLibraryId: "library-1" },
        25,
        0,
        {
          fetchHostSpools: async () => {
            throw new Error("host spools should not load without a complete target");
          },
          listLocalSpools: async () => {
            throw new Error("local spools should not load in client mode");
          },
        },
      ),
    /Host connection details/,
  );
});

test("loadSpoolRowsPage uses local spools outside client mode", async () => {
  const calls: Array<{ limit: number; offset: number }> = [];
  const rows = await loadSpoolRowsPage(
    { clientReadOnly: false },
    30,
    60,
    {
      listLocalSpools: async (limit, offset) => {
        calls.push({ limit, offset });
        return [row("local-spool")];
      },
    },
  );

  assert.deepEqual(calls, [{ limit: 30, offset: 60 }]);
  assert.deepEqual(rows.map((entry) => entry.spool.id), ["local-spool"]);
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
