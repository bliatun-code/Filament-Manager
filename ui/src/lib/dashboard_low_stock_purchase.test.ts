import assert from "node:assert/strict";
import test from "node:test";

import { DASHBOARD_PURCHASE_CLIENT_PAIRING_REQUIRED, DASHBOARD_PURCHASE_HOST_TARGET_REQUIRED, DASHBOARD_PURCHASE_TARGET_CHANGED, type DashboardPurchaseCandidate } from "./dashboard_action_model";
import {
  createDashboardLowStockPurchaseCoordinator,
  resolveDashboardPurchaseDataSourceOptions,
} from "./dashboard_low_stock_purchase";
import type {
  LibrarySyncSettings,
  WishlistPurchaseTarget,
} from "./tauri_client";

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

const host: WishlistPurchaseTarget = { mode: "CLIENT", library_id: "library-host", host_base_url: "http://host.local:4278", target_generation: 7 };
const hostStatus = () => ({ ...host, client_auth_paired: true });

test("concurrent clicks share one authoritative purchase and its returned ID", async () => {
  const reply = Promise.withResolvers<{kind:"REUSED";status:"ON_ORDER";itemId:string;match:"MASTER_ID"}>();
  let calls = 0;
  const coordinator = createDashboardLowStockPurchaseCoordinator({
    ensurePurchase: async (input, target) => {
      calls++;
      assert.deepEqual(target,host);
      assert.equal(input.filament_name,"Basic");
      return reply.promise;
    },
    loadStatus: async () => hostStatus(),
  });
  const first = coordinator.enqueue(candidate,host);
  assert.equal(first,coordinator.enqueue(candidate,host));
  const existing = {kind:"REUSED",status:"ON_ORDER",itemId:"existing",match:"MASTER_ID"} as const;
  reply.resolve(existing);
  assert.deepEqual(await first,existing);
  assert.equal(calls,1);
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

test("a lost purchase acknowledgement is surfaced without replay", async () => {
  let calls = 0;
  const coordinator = createDashboardLowStockPurchaseCoordinator({
    loadStatus:async () => hostStatus(),
    ensurePurchase:async () => { calls++; throw Error("connection lost"); },
  });
  await assert.rejects(coordinator.enqueue(candidate,host), /connection lost/);
  assert.equal(calls,1);
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
      ensurePurchase: () => assert.fail("must not create an entry"),
    });
    await assert.rejects(coordinator.enqueue(candidate, host), { message: DASHBOARD_PURCHASE_TARGET_CHANGED });
    await assert.rejects(coordinator.enqueue(candidate, undefined), { message: DASHBOARD_PURCHASE_TARGET_CHANGED });
  }
});

test("an A–B–A switch while a click awaits status prevents the write", async () => {
  const status = Promise.withResolvers<LibrarySyncSettings>();
  const coordinator = createDashboardLowStockPurchaseCoordinator({
    loadStatus: () => status.promise,
    ensurePurchase: () => assert.fail("must reject the stale click"),
  });
  const clicked = coordinator.enqueue(candidate,host);
  status.resolve(settings({...host, target_generation:9, client_auth_paired:true}));
  await assert.rejects(clicked,{message:DASHBOARD_PURCHASE_TARGET_CHANGED});
});
