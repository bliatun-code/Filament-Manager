import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SPOOL_PAGE_SIZE,
  loadAllSpoolRows,
  loadAllSpoolRowsWithPageLoader,
  loadSpoolRowsPage,
} from "./spool_data_source";
import type { SpoolWithMasterRow } from "./tauri_client";

function row(id: string, status = "IN_STOCK", ownershipType = "OWNED"): SpoolWithMasterRow {
  return {
    spool: { id, ownership_type: ownershipType, status },
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
        return [row("spool-1", "IN_USE", "borrowed-in"), row("spool-2")];
      }
      return [row("spool-3", "loaned out")];
    },
    4,
  );

  assert.deepEqual(calls, [
    { limit: 2, offset: 0 },
    { limit: 2, offset: 2 },
  ]);
  assert.deepEqual(rows.map((entry) => entry.spool.id), ["spool-1", "spool-2", "spool-3"]);
  assert.equal(rows[0]?.spool.status, "IN_USE");
  assert.equal(rows[0]?.spool.normalized_status, "ASSIGNED");
  assert.equal(rows[0]?.spool.ownership_type, "BORROWED_IN");
  assert.equal(rows[2]?.spool.status, "loaned out");
  assert.equal(rows[2]?.spool.normalized_status, "BORROWED");
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
        async (_options, _limit, offset) => [
          row(`spool-${offset + 1}`),
          row(`spool-${offset + 2}`),
        ],
        2,
      ),
    /pagination did not finish/,
  );
});

test("loadAllSpoolRowsWithPageLoader rejects duplicate ids across unstable pages", async () => {
  await assert.rejects(
    () =>
      loadAllSpoolRowsWithPageLoader(
        { clientReadOnly: false },
        2,
        async (_options, _limit, offset) =>
          offset === 0
            ? [row("spool-1"), row("spool-2")]
            : [row("spool-2"), row("spool-3")],
        4,
      ),
    /pagination repeated id spool-2/,
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

for (const rowCount of [1_201, 5_000, 10_000]) {
  test(`loadAllSpoolRows loads all ${rowCount.toLocaleString("en-US")} rows without truncation`, async () => {
    const sourceRows = Array.from({ length: rowCount }, (_, index) => row(`spool-${index}`));
    const calls: Array<{ limit: number; offset: number }> = [];
    const rows = await loadAllSpoolRows(
      { clientReadOnly: false },
      DEFAULT_SPOOL_PAGE_SIZE,
      {
        loadPage: async (_options, limit, offset) => {
          calls.push({ limit, offset });
          return sourceRows.slice(offset, offset + limit);
        },
      },
    );

    assert.equal(rows.length, rowCount);
    assert.equal(rows[0]?.spool.id, "spool-0");
    assert.equal(rows.at(-1)?.spool.id, `spool-${rowCount - 1}`);
    assert.equal(calls[0]?.offset, 0);
    assert.equal(calls.at(-1)?.offset, Math.floor(rowCount / 1000) * 1000);
  });
}

test("loadAllSpoolRows saves one complete client cache after all pages load", async () => {
  const cachedRowIds: string[][] = [];
  const rows = await loadAllSpoolRows(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
    },
    2,
    {
      loadPage: async (_options, limit, offset) =>
        [row("spool-1"), row("spool-2"), row("spool-3")].slice(offset, offset + limit),
      saveClientCache: async (loadedRows) => {
        cachedRowIds.push(loadedRows.map((entry) => entry.spool.id));
      },
    },
  );

  assert.deepEqual(rows.map((entry) => entry.spool.id), ["spool-1", "spool-2", "spool-3"]);
  assert.deepEqual(cachedRowIds, [["spool-1", "spool-2", "spool-3"]]);
});

test("loadAllSpoolRows keeps live client rows when refreshing the cache fails", async () => {
  const cacheErrors: unknown[] = [];
  const rows = await loadAllSpoolRows(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
    },
    2,
    {
      loadPage: async () => [row("spool-1")],
      saveClientCache: async () => {
        throw new Error("cache unavailable");
      },
      onCacheError: (error) => cacheErrors.push(error),
    },
  );

  assert.deepEqual(rows.map((entry) => entry.spool.id), ["spool-1"]);
  assert.equal(cacheErrors.length, 1);
});

test("loadAllSpoolRows never replaces the client cache after an incomplete page sequence", async () => {
  let saveCount = 0;
  await assert.rejects(
    () =>
      loadAllSpoolRows(
        {
          clientReadOnly: true,
          clientHostBaseUrl: "http://host",
          clientLibraryId: "library-1",
        },
        2,
        {
          loadPage: async (_options, _limit, offset) => {
            if (offset === 0) {
              return [row("spool-1"), row("spool-2")];
            }
            throw new Error("second page unavailable");
          },
          saveClientCache: async () => {
            saveCount += 1;
          },
        },
      ),
    /second page unavailable/,
  );
  assert.equal(saveCount, 0);
});
