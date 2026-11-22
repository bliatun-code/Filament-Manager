import assert from "node:assert/strict";
import test from "node:test";

import { DASHBOARD_PURCHASE_CLIENT_PAIRING_REQUIRED, DASHBOARD_PURCHASE_HOST_TARGET_REQUIRED, DASHBOARD_PURCHASE_TARGET_CHANGED, type DashboardPurchaseCandidate } from "./dashboard_action_model";
import {
  createDashboardLowStockPurchaseCoordinator,
  resolveDashboardPurchaseDataSourceOptions,
} from "./dashboard_low_stock_purchase";
import type {
  CreateWishlistItemInput,
  LibrarySyncSettings,
  WishlistPurchaseTarget,
  WishlistItemRow,
} from "./tauri_client";
import type { WishlistDataSourceOptions } from "./wishlist_data_source";

const candidate: DashboardPurchaseCandidate = {
  colorName: " Gray ",
  filamentName: " Basic ",
  masterId: "master-gray",
  material: " PLA ",
  productKey: "master:master-gray",
  vendor: " Bambu Lab ",
};

function settings(
  overrides: Partial<LibrarySyncSettings> = {},
): LibrarySyncSettings {
  return {
    client_auth_paired: false,
    device_name: "Desktop",
    library_id: "library-local",
    mode: "STANDALONE",
    target_generation: 1,
    ...overrides,
  };
}

const local: WishlistPurchaseTarget = { mode: "STANDALONE", library_id: "library-local", host_base_url: null, target_generation: 1 };
const host: WishlistPurchaseTarget = { mode: "CLIENT", library_id: "library-host", host_base_url: "http://host.local:4278", target_generation: 7 };
const hostStatus = () => ({ ...host, client_auth_paired: true });

function wishlistItem(
  id: string,
  overrides: Partial<WishlistItemRow> = {},
): WishlistItemRow {
  return {
    color_name: "Gray",
    created_at: "2026-08-01 10:00:00",
    filament_name: "Basic",
    id,
    master_id: "master-gray",
    material: "PLA",
    note: null,
    quantity: 1,
    status: "WISHLIST",
    updated_at: "2026-08-01 10:00:00",
    vendor: "Bambu Lab",
    ...overrides,
  };
}

test("low-stock purchase coordinator creates exactly one local wishlist entry under concurrency", async () => {
  const creates: Array<{
    input: CreateWishlistItemInput;
    options: WishlistDataSourceOptions;
  }> = [];
  let releaseCreate!: () => void;
  const createGate = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });
  const coordinator = createDashboardLowStockPurchaseCoordinator({
    createEntry: async (input, options) => {
      creates.push({ input, options });
      await createGate;
    },
    createId: () => "wish-dashboard-1",
    loadItems: async () => [],
    loadStatus: async () => settings(),
  });

  const first = coordinator.enqueue(candidate, local);
  const second = coordinator.enqueue({ ...candidate }, local);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(creates.length, 1);
  releaseCreate();
  assert.deepEqual(await Promise.all([first, second]), [
    { itemId: "wish-dashboard-1", kind: "CREATED", status: "WISHLIST" },
    { itemId: "wish-dashboard-1", kind: "CREATED", status: "WISHLIST" },
  ]);
  assert.deepEqual(creates, [
    {
      input: {
        color_name: "Gray",
        filament_name: "Basic",
        id: "wish-dashboard-1",
        master_id: "master-gray",
        material: "PLA",
        note: null,
        quantity: 1,
        vendor: "Bambu Lab",
      },
      options: { clientReadOnly: false, reviewedTarget: local },
    },
  ]);
});

test("low-stock purchase coordinator rechecks the queue and reuses an open duplicate", async () => {
  let creates = 0;
  const coordinator = createDashboardLowStockPurchaseCoordinator({
    createEntry: async () => {
      creates += 1;
    },
    createId: () => "must-not-be-used",
    loadItems: async (options) => {
      assert.deepEqual(options, {
        clientHostBaseUrl: host.host_base_url,
        reviewedTarget: host,
        clientLibraryId: "library-host",
        clientReadOnly: true,
      });
      return [wishlistItem("existing", { status: "ON_ORDER" })];
    },
    loadStatus: async () => hostStatus(),
  });

  assert.deepEqual(await coordinator.enqueue(candidate, host), {
    itemId: "existing",
    kind: "REUSED",
    match: "MASTER_ID",
    status: "ON_ORDER",
  });
  assert.equal(creates, 0);
});

test("client purchase routing fails closed for missing pairing or host identity", () => {
  assert.throws(
    () =>
      resolveDashboardPurchaseDataSourceOptions(
        settings({ mode: "CLIENT", host_base_url: "http://host.local" }),
      ),
    new RegExp(DASHBOARD_PURCHASE_CLIENT_PAIRING_REQUIRED),
  );
  assert.throws(
    () =>
      resolveDashboardPurchaseDataSourceOptions(
        settings({
          client_auth_paired: true,
          host_base_url: "http://host.local",
          library_id: " ",
          mode: "CLIENT",
        }),
      ),
    new RegExp(DASHBOARD_PURCHASE_HOST_TARGET_REQUIRED),
  );
});

test("a failed fresh duplicate check never falls through to a client write", async () => {
  let creates = 0;
  const coordinator = createDashboardLowStockPurchaseCoordinator({
    createEntry: async () => {
      creates += 1;
    },
    loadItems: async () => {
      throw new Error("host wishlist unavailable");
    },
    loadStatus: async () => hostStatus(),
  });

  await assert.rejects(
    () => coordinator.enqueue(candidate, host),
    /host wishlist unavailable/,
  );
  assert.equal(creates, 0);
});

test("standalone and host modes both retain local wishlist writes", () => {
  assert.deepEqual(
    resolveDashboardPurchaseDataSourceOptions(settings({ mode: "STANDALONE" })),
    { clientReadOnly: false },
  );
  assert.deepEqual(
    resolveDashboardPurchaseDataSourceOptions(settings({ mode: "HOST" })),
    { clientReadOnly: false },
  );
});

const other = { ...host, host_base_url: "http://host-b.local", library_id: "library-b", target_generation: 8 };

test("a suggestion is bound to the displayed mode, Host, library and generation before the click", async () => {
  for (const current of [
    other, { ...host, mode: "HOST" }, { ...host, host_base_url: other.host_base_url },
    { ...host, library_id: other.library_id }, { ...host, target_generation: 9 },
  ]) {
    const coordinator = createDashboardLowStockPurchaseCoordinator({
      loadStatus: async () => ({ ...current, client_auth_paired: true }),
      loadItems: () => assert.fail("must reject before reading the replacement queue"),
      createEntry: () => assert.fail("must not create an entry"),
    });
    await assert.rejects(coordinator.enqueue(candidate, host), { message: DASHBOARD_PURCHASE_TARGET_CHANGED });
    await assert.rejects(coordinator.enqueue(candidate, undefined), { message: DASHBOARD_PURCHASE_TARGET_CHANGED });
  }
});

test("switching Hosts during the duplicate check invalidates both empty and duplicate replies, including A–B–A", async () => {
  for (const back of [false, true]) {
    for (const rows of [[], [wishlistItem("old-duplicate")]]) {
      let current = host;
      const started = Promise.withResolvers<void>();
      const reply = Promise.withResolvers<WishlistItemRow[]>();
      const coordinator = createDashboardLowStockPurchaseCoordinator({
        loadStatus: async () => ({ ...current, client_auth_paired: true }),
        loadItems: async () => { started.resolve(); return reply.promise; },
        createEntry: () => assert.fail("a delayed reply cannot authorize a write"),
      });
      const purchase = coordinator.enqueue(candidate, host);
      await started.promise;
      current = other;
      if (back) current = { ...host, target_generation: other.target_generation + 1 };
      reply.resolve(rows);
      await assert.rejects(purchase, { message: DASHBOARD_PURCHASE_TARGET_CHANGED });
    }
  }
});

test("double clicks share one Host create, and a new generation has its own duplicate check", async () => {
  let current = host;
  const started = Promise.withResolvers<void>();
  const reply = Promise.withResolvers<WishlistItemRow[]>();
  const calls: number[] = [];
  const writes: number[] = [];
  const coordinator = createDashboardLowStockPurchaseCoordinator({
    loadStatus: async () => ({ ...current, client_auth_paired: true }),
    loadItems: async options => {
      calls.push(options.reviewedTarget!.target_generation);
      if (options.reviewedTarget!.target_generation === host.target_generation) {
        started.resolve();
        return reply.promise;
      }
      return [];
    },
    createEntry: async (_input, options) => { writes.push(options.reviewedTarget!.target_generation); },
  });
  const old = coordinator.enqueue(candidate, host);
  assert.equal(coordinator.enqueue({ ...candidate }, { ...host }), old);
  await started.promise;
  current = other;
  const fresh = coordinator.enqueue(candidate, other);
  assert.equal(coordinator.enqueue(candidate, other), fresh);
  assert.equal((await fresh).kind, "CREATED");
  reply.resolve([]);
  await assert.rejects(old, { message: DASHBOARD_PURCHASE_TARGET_CHANGED });
  assert.deepEqual(calls, [7, 8]);
  assert.deepEqual(writes, [8]);
});
