import assert from "node:assert/strict";
import test from "node:test";

import type { DashboardPurchaseCandidate } from "./dashboard_action_model";
import {
  createDashboardLowStockPurchaseCoordinator,
  DASHBOARD_PURCHASE_CLIENT_PAIRING_REQUIRED,
  DASHBOARD_PURCHASE_HOST_TARGET_REQUIRED,
  resolveDashboardPurchaseDataSourceOptions,
} from "./dashboard_low_stock_purchase";
import type {
  CreateWishlistItemInput,
  LibrarySyncSettings,
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
    ...overrides,
  };
}

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
    loadSettings: async () => settings(),
  });

  const first = coordinator.enqueue(candidate);
  const second = coordinator.enqueue({ ...candidate });
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
      options: { clientReadOnly: false },
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
        clientHostBaseUrl: "http://host.local:4278/",
        clientLibraryId: "library-host",
        clientReadOnly: true,
      });
      return [wishlistItem("existing", { status: "ON_ORDER" })];
    },
    loadSettings: async () =>
      settings({
        client_auth_paired: true,
        host_base_url: " http://host.local:4278/ ",
        library_id: " library-host ",
        mode: "CLIENT",
      }),
  });

  assert.deepEqual(await coordinator.enqueue(candidate), {
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
    loadSettings: async () =>
      settings({
        client_auth_paired: true,
        host_base_url: "http://host.local:4278",
        library_id: "library-host",
        mode: "CLIENT",
      }),
  });

  await assert.rejects(
    () => coordinator.enqueue(candidate),
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
