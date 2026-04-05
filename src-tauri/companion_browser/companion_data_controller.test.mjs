import test from "node:test";
import assert from "node:assert/strict";

import { createCompanionDataController } from "./companion_data_controller.js";
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
        return [{ loan: { id: "loan-1", returned_at: null } }];
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
  assert.equal(harness.state.catalogMasters.length, 1);
  assert.equal(harness.state.wishlistItems.length, 1);
  assert.equal(harness.ensureActivePrinterSelectionCount, 1);
  assert.equal(harness.state.statusTone, "success");
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
