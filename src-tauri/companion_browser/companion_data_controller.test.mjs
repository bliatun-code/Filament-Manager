import test from "node:test";
import assert from "node:assert/strict";

import {
  createCompanionDataController,
  createLatestAsyncCommitter,
  fetchAllSpoolRows,
} from "./companion_data_controller.js";
import { createInitialCompanionState } from "./session_state.js";

function createDataHarness(overrides = {}) {
  const state = {
    ...createInitialCompanionState(),
    apiReady: true,
    ...overrides.state,
  };
  const statusCalls = [];
  const busyCalls = [];
  const renderCalls = [];
  const openDetailModalCalls = [];
  let ensureActivePrinterSelectionCount = 0;

  const controller = createCompanionDataController({
    state,
    pairSession: overrides.pairSession ?? (async () => {}),
    renewSession: overrides.renewSession ?? (async () => {}),
    fetchJson: overrides.fetchJson ?? (async () => ({})),
    render: () => {
      renderCalls.push("render");
    },
    setBusy: (nextBusy) => {
      state.busy = nextBusy;
      busyCalls.push(nextBusy);
    },
    setStatus: (message, tone = "default") => {
      state.statusMessage = message;
      state.statusTone = tone;
      statusCalls.push({ message, tone });
    },
    setDetailReturnContext: (rootFlow) => {
      state.detailReturnRootFlow = rootFlow;
    },
    openDetailModal: (rootFlow) => {
      openDetailModalCalls.push(rootFlow);
      state.detailOpen = true;
    },
    ensureActivePrinterSelection: () => {
      ensureActivePrinterSelectionCount += 1;
      if (typeof overrides.ensureActivePrinterSelection === "function") {
        overrides.ensureActivePrinterSelection(state);
      }
    },
    selectionClearedAfterBorrowedInHandBack:
      overrides.selectionClearedAfterBorrowedInHandBack ?? (() => false),
    readLocationHref: overrides.readLocationHref,
    replaceLocationHref: overrides.replaceLocationHref,
  });

  return {
    controller,
    state,
    statusCalls,
    busyCalls,
    renderCalls,
    openDetailModalCalls,
    get ensureActivePrinterSelectionCount() {
      return ensureActivePrinterSelectionCount;
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("latest async committer ignores a locale load that resolves after a newer selection", async () => {
  const commitLatest = createLatestAsyncCommitter();
  const first = deferred();
  const second = deferred();
  const commits = [];
  const rejections = [];

  const select = (locale, pending) =>
    commitLatest(() => pending.promise, {
      commit: () => commits.push(locale),
      reject: () => rejections.push(locale),
    });

  const firstSelection = select("de", first);
  const secondSelection = select("fr", second);
  second.resolve();
  assert.equal(await secondSelection, true);
  first.resolve();
  assert.equal(await firstSelection, false);

  assert.deepEqual(commits, ["fr"]);
  assert.deepEqual(rejections, []);
});

test("latest async committer ignores a stale locale load failure", async () => {
  const commitLatest = createLatestAsyncCommitter();
  const first = deferred();
  const second = deferred();
  const commits = [];
  const rejections = [];

  const firstSelection = commitLatest(() => first.promise, {
    commit: () => commits.push("de"),
    reject: () => rejections.push("de"),
  });
  const secondSelection = commitLatest(() => second.promise, {
    commit: () => commits.push("fr"),
    reject: () => rejections.push("fr"),
  });
  second.resolve();
  await secondSelection;
  first.reject(new Error("late failure"));
  await firstSelection;

  assert.deepEqual(commits, ["fr"]);
  assert.deepEqual(rejections, []);
});

test("refreshOverview selects the first spool and loads its detail when nothing is selected", async () => {
  const harness = createDataHarness({
    fetchJson: async (path) => {
      if (path.startsWith("/api/v1/inventory/spools")) {
        return [{ spool: { id: "spool-1" }, master: {} }];
      }
      if (path.startsWith("/api/v1/catalog/masters")) {
        return [{ id: "master-1", vendor: "Bambu" }];
      }
      if (path.startsWith("/api/v1/wishlist")) {
        return [{ id: "wish-1", status: "WISHLIST" }];
      }
      if (path === "/api/v1/printers/overview") {
        return [{ printer: { id: "printer-1" } }];
      }
      if (path.startsWith("/api/v1/loans")) {
        return [
          { loan: { id: "loan-1", returned_at: null } },
          { loan: { id: "loan-2", returned_at: null }, spool_status: "DELETED" },
        ];
      }
      if (path.startsWith("/api/v1/spools/spool-1")) {
        return { spool: { spool: { id: "spool-1" } } };
      }
      throw new Error(`unexpected path ${path}`);
    },
  });

  await harness.controller.refreshOverview();

  assert.equal(harness.state.selectedSpoolId, "spool-1");
  assert.equal(harness.state.selectedDetail?.spool?.spool?.id, "spool-1");
  assert.equal(harness.state.activeLoans.length, 1);
  assert.equal(harness.state.activeLoans[0].loan.id, "loan-1");
  assert.equal(harness.state.catalogMasters.length, 1);
  assert.equal(harness.state.wishlistItems.length, 1);
  assert.equal(harness.ensureActivePrinterSelectionCount, 1);
  assert.equal(harness.state.statusTone, "success");
});

test("refreshOverview loads all spool pages from the host", async () => {
  const paths = [];
  const firstPage = Array.from({ length: 250 }, (_, index) => ({
    spool: { id: `spool-${index}` },
    master: {},
  }));
  const secondPage = [{ spool: { id: "spool-250" }, master: {} }];
  const harness = createDataHarness({
    fetchJson: async (path) => {
      paths.push(path);
      if (path === "/api/v1/inventory/spools?limit=250&offset=0") {
        return firstPage;
      }
      if (path === "/api/v1/inventory/spools?limit=250&offset=250") {
        return secondPage;
      }
      if (path.startsWith("/api/v1/catalog/masters")) {
        return [];
      }
      if (path.startsWith("/api/v1/wishlist")) {
        return [];
      }
      if (path === "/api/v1/printers/overview") {
        return [];
      }
      if (path.startsWith("/api/v1/loans")) {
        return [];
      }
      if (path.startsWith("/api/v1/spools/spool-0")) {
        return { spool: { spool: { id: "spool-0" } } };
      }
      throw new Error(`unexpected path ${path}`);
    },
  });

  await harness.controller.refreshOverview();

  assert.equal(harness.state.spools.length, 251);
  assert.equal(harness.state.selectedSpoolId, "spool-0");
  assert.ok(paths.includes("/api/v1/inventory/spools?limit=250&offset=0"));
  assert.ok(paths.includes("/api/v1/inventory/spools?limit=250&offset=250"));
  assert.equal(paths.includes("/api/v1/inventory/spools?limit=250&offset=500"), false);
});

test("fetchAllSpoolRows rejects duplicate ids from unstable pagination", async () => {
  const paths = [];
  await assert.rejects(
    () =>
      fetchAllSpoolRows(
        async (path) => {
          paths.push(path);
          return paths.length === 1
            ? [
                { spool: { id: "spool-1" }, master: {} },
                { spool: { id: "spool-2" }, master: {} },
              ]
            : [
                { spool: { id: "spool-2" }, master: {} },
                { spool: { id: "spool-3" }, master: {} },
              ];
        },
        { pageSize: 2, maxPages: 4 },
      ),
    /pagination repeated id spool-2/,
  );

  assert.deepEqual(paths, [
    "/api/v1/inventory/spools?limit=2&offset=0",
    "/api/v1/inventory/spools?limit=2&offset=2",
  ]);
});

test("fetchAllSpoolRows stops after a bounded number of full pages", async () => {
  const paths = [];
  await assert.rejects(
    () =>
      fetchAllSpoolRows(
        async (path) => {
          paths.push(path);
          const offset = Number(new URL(path, "http://companion.local").searchParams.get("offset"));
          return [
            { spool: { id: `spool-${offset}` }, master: {} },
            { spool: { id: `spool-${offset + 1}` }, master: {} },
          ];
        },
        { pageSize: 2, maxPages: 2 },
      ),
    /pagination did not finish/,
  );

  assert.deepEqual(paths, [
    "/api/v1/inventory/spools?limit=2&offset=0",
    "/api/v1/inventory/spools?limit=2&offset=2",
  ]);
});

test("loadSpoolDetail ignores stale response races and keeps the latest detail", async () => {
  const resolvers = new Map();
  const harness = createDataHarness({
    fetchJson: (path) =>
      new Promise((resolve) => {
        resolvers.set(path, resolve);
      }),
  });

  const firstRequest = harness.controller.loadSpoolDetail("spool-1");
  const secondRequest = harness.controller.loadSpoolDetail("spool-2");

  resolvers
    .get("/api/v1/spools/spool-2?history_limit=24&usage_limit=48")({ spool: { spool: { id: "spool-2" } } });
  await secondRequest;

  resolvers
    .get("/api/v1/spools/spool-1?history_limit=24&usage_limit=48")({ spool: { spool: { id: "spool-1" } } });
  await firstRequest;

  assert.equal(harness.state.selectedSpoolId, "spool-2");
  assert.equal(harness.state.selectedDetail?.spool?.spool?.id, "spool-2");
});

test("pairAndLoad cleans a pairing URL token after a successful trusted-LAN pairing", async () => {
  const pairingCalls = [];
  const replacedUrls = [];
  const harness = createDataHarness({
    pairSession: async (token) => {
      pairingCalls.push(token);
      harness.state.apiReady = true;
    },
    fetchJson: async (path) => {
      if (path.startsWith("/api/v1/inventory/spools")) {
        return [];
      }
      if (path.startsWith("/api/v1/catalog/masters")) {
        return [];
      }
      if (path.startsWith("/api/v1/wishlist")) {
        return [];
      }
      if (path === "/api/v1/printers/overview") {
        return [];
      }
      if (path.startsWith("/api/v1/loans")) {
        return [];
      }
      throw new Error(`unexpected path ${path}`);
    },
    readLocationHref: () => "http://192.168.1.50:4278/companion?pairing=secret&foo=1",
    replaceLocationHref: (nextUrl) => {
      replacedUrls.push(nextUrl);
    },
  });

  await harness.controller.pairAndLoad("secret", { fromUrl: true });

  assert.deepEqual(pairingCalls, ["secret"]);
  assert.equal(replacedUrls.length, 1);
  assert.equal(replacedUrls[0].includes("pairing="), false);
  assert.equal(replacedUrls[0].includes("foo=1"), true);
  assert.equal(harness.state.statusTone, "success");
});

test("pairAndLoad treats pairing URL cleanup as best-effort", async () => {
  const pairingCalls = [];
  const harness = createDataHarness({
    pairSession: async (token) => {
      pairingCalls.push(token);
      harness.state.apiReady = true;
    },
    fetchJson: async (path) => {
      if (path.startsWith("/api/v1/inventory/spools")) {
        return [];
      }
      if (path.startsWith("/api/v1/catalog/masters")) {
        return [];
      }
      if (path.startsWith("/api/v1/wishlist")) {
        return [];
      }
      if (path === "/api/v1/printers/overview") {
        return [];
      }
      if (path.startsWith("/api/v1/loans")) {
        return [];
      }
      throw new Error(`unexpected path ${path}`);
    },
    readLocationHref: () => "not a valid url",
    replaceLocationHref: () => {
      throw new Error("history denied");
    },
  });

  await harness.controller.pairAndLoad("secret", { fromUrl: true });

  assert.deepEqual(pairingCalls, ["secret"]);
  assert.equal(harness.state.statusTone, "success");
});
