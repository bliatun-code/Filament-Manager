import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SPOOL_PAGE_SIZE,
  loadAllSpoolRows,
  loadAllSpoolRowsWithPageLoader,
  loadSpoolRowsPage,
  loadSpoolSnapshot,
} from "./spool_data_source";
import type { SpoolWithMasterRow } from "./tauri_client";

function row(id: string, status = "IN_STOCK", ownershipType = "OWNED"): SpoolWithMasterRow {
  return {
    spool: { id, ownership_type: ownershipType, status },
    master: {},
  } as SpoolWithMasterRow;
}

const stableRevision = async () => ({ inventory: 1, catalog: 1 });

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
    4, stableRevision,
  );

  assert.deepEqual(calls, [
    { limit: 2, offset: 0 },
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
        2, stableRevision,
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
        4, stableRevision,
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
    3, stableRevision,
  );

  assert.deepEqual(calls, [
    { limit: 1, offset: 0 },
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
        readRevision: stableRevision,
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

const paired = { clientReadOnly: true, clientHostBaseUrl: " http://host ", clientLibraryId: " library ", clientTargetGeneration: 7 };

test("paired clients get the complete normalized snapshot and SQLite timestamp in one native call", async () => {
  for (const captured_at of ["2026-04-01 10:00:00", null]) {
    const calls: unknown[] = [];
    const result = await loadSpoolSnapshot(paired, 1, {
      fetchHostSnapshot: async (...target) => {
        calls.push(target);
        return { rows: [row("one", "IN_USE", "borrowed-in"), row("two")], captured_at };
      },
      loadPage: async () => assert.fail("paired reads must not page through the UI"),
    });
    assert.deepEqual(calls, [["http://host", "library", 7]]);
    assert.deepEqual(result.rows.map(item => item.spool.id), ["one", "two"]);
    assert.equal(result.rows[0].spool.normalized_status, "ASSIGNED");
    assert.equal(result.rows[0].spool.ownership_type, "BORROWED_IN");
    assert.equal(result.capturedAt, captured_at);
  }
});

test("a rejected native snapshot propagates to the caller without retrying with unscoped pages", async () => {
  const error = new Error("Host changed or disconnected");
  await assert.rejects(loadAllSpoolRows(paired, DEFAULT_SPOOL_PAGE_SIZE, {
    fetchHostSnapshot: async () => { throw error; },
    loadPage: async () => assert.fail("unexpected page read"),
  }), error);
});

test("a client without a generation can read live pages without touching the saved snapshot", async () => {
  const result = await loadSpoolSnapshot({ ...paired, clientTargetGeneration: null }, 10, {
    fetchHostSnapshot: async () => assert.fail("unexpected cache write"),
    loadPage: async () => [row("live")],
  });
  assert.deepEqual(result.rows.map(item => item.spool.id), ["live"]);
  assert.equal(result.capturedAt, null);
});

for (const domain of ["inventory", "catalog"] as const) {
  test(`a change to ${domain} between local spool pages restarts from page zero`, async () => {
    let source = ["a", "b", "c", "d"];
    const revision = { inventory: 1, catalog: 1 };
    const result = await loadAllSpoolRows(
      { clientReadOnly: false },
      2,
      {
        loadPage: async (_options, limit, offset) => {
          if (offset === 2 && source[0] === "a") {
            source = source.slice(1);
            revision[domain]++;
          }
          return source.slice(offset, offset + limit).map(id => row(id));
        },
        readRevision: async () => ({ ...revision }),
      },
    );
    assert.deepEqual(result.map(r => r.spool.id), ["b", "c", "d"]);
  });
}

test("local pagination rejects a continually changing inventory", async () => {
  let revision = 0;
  await assert.rejects(loadAllSpoolRows(
    { clientReadOnly: false },
    2,
    {
      loadPage: async (_options, _limit, offset) => offset ? [] : [row("a"), row("b")],
      readRevision: async () => ({ inventory: ++revision, catalog: 1 }),
    },
  ), /changed during pagination/);
  assert.equal(revision, 3);
});

test("requested pages above the Host limit still read the final spools", async () => {
  const source = Array.from({ length: 2501 }, (_, index) => row(String(index)));
  const rows = await loadAllSpoolRowsWithPageLoader(
    { clientReadOnly: true }, 3000,
    async (_options, limit, offset) => source.slice(offset, offset + Math.min(2500, limit)),
    5, stableRevision,
  );
  assert.equal(rows.length, source.length);
  assert.equal(rows.at(-1)?.spool.id, "2500");
});
