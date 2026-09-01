import assert from "node:assert/strict";
import test from "node:test";
import type { MasterCatalogRow } from "../lib/tauri_client";
import {
  buildSettingsCatalogDataSourceIdentity,
  commitResolvedSettingsCatalogData,
  createSettingsCatalogDataState,
  reduceSettingsCatalogData,
} from "./settings_catalog_data_state";

function catalogRow(id: string): MasterCatalogRow {
  return {
    id,
    material: "PLA",
    filament_name: "PLA Basic",
    color_name: id,
    hex_color: "#00AE42",
    product_url: null,
    default_weight: 1000,
    vendor: "Bambu",
    is_discontinued: false,
    discontinued_at: null,
  };
}

test("same-target catalog failures retain the last authoritative rows", () => {
  const targeted = reduceSettingsCatalogData(createSettingsCatalogDataState(), {
    type: "target",
    dataSourceIdentity: "client:host-a:library-a:1:paired",
  });
  assert.equal(targeted.loadStatus, "pending");
  assert.deepEqual(targeted.rows, []);

  const loaded = reduceSettingsCatalogData(targeted, {
    type: "reload",
    available: true,
    dataSourceIdentity: "client:host-a:library-a:1:paired",
    rows: [catalogRow("a")],
  });
  const partialFailure = reduceSettingsCatalogData(loaded, {
    type: "reload",
    available: false,
    dataSourceIdentity: "client:host-a:library-a:1:paired",
    rows: [],
  });

  assert.strictEqual(partialFailure, loaded);
  assert.equal(partialFailure.loadStatus, "available");
  assert.deepEqual(partialFailure.rows.map((row) => row.id), ["a"]);
});

test("an authoritative empty response is distinct from an unavailable catalog", () => {
  const targeted = reduceSettingsCatalogData(createSettingsCatalogDataState(), {
    type: "target",
    dataSourceIdentity: "client:host-a:library-a:1:paired",
  });
  const authoritativeEmpty = reduceSettingsCatalogData(targeted, {
    type: "reload",
    available: true,
    dataSourceIdentity: "client:host-a:library-a:1:paired",
    rows: [],
  });

  assert.equal(authoritativeEmpty.loadStatus, "available");
  assert.deepEqual(authoritativeEmpty.rows, []);
});

test("the first failed load becomes unavailable without pretending the catalog is empty", () => {
  const targeted = reduceSettingsCatalogData(createSettingsCatalogDataState(), {
    type: "target",
    dataSourceIdentity: "client:host-a:library-a:1:paired",
  });
  const unavailable = reduceSettingsCatalogData(targeted, {
    type: "reload",
    available: false,
    dataSourceIdentity: "client:host-a:library-a:1:paired",
    rows: [],
  });

  assert.equal(unavailable.loadStatus, "unavailable");
  assert.deepEqual(unavailable.rows, []);
});

test("target changes clear old rows and reject stale in-flight responses", () => {
  const hostA = reduceSettingsCatalogData(
    reduceSettingsCatalogData(createSettingsCatalogDataState(), {
      type: "target",
      dataSourceIdentity: "client:host-a:library-a:1:paired",
    }),
    {
      type: "reload",
      available: true,
      dataSourceIdentity: "client:host-a:library-a:1:paired",
      rows: [catalogRow("a")],
    },
  );
  const hostBPending = reduceSettingsCatalogData(hostA, {
    type: "target",
    dataSourceIdentity: "client:host-b:library-b:2:paired",
  });

  assert.equal(hostBPending.loadStatus, "pending");
  assert.deepEqual(hostBPending.rows, []);

  const staleHostA = reduceSettingsCatalogData(hostBPending, {
    type: "reload",
    available: true,
    dataSourceIdentity: "client:host-a:library-a:1:paired",
    rows: [catalogRow("stale-a")],
  });
  assert.strictEqual(staleHostA, hostBPending);

  const failedHostB = reduceSettingsCatalogData(hostBPending, {
    type: "reload",
    available: false,
    dataSourceIdentity: "client:host-b:library-b:2:paired",
    rows: [],
  });
  assert.equal(failedHostB.loadStatus, "unavailable");
  assert.deepEqual(failedHostB.rows, []);

  const loadedHostB = reduceSettingsCatalogData(hostBPending, {
    type: "reload",
    available: true,
    dataSourceIdentity: "client:host-b:library-b:2:paired",
    rows: [catalogRow("b")],
  });
  assert.equal(loadedHostB.loadStatus, "available");
  assert.deepEqual(loadedHostB.rows.map((row) => row.id), ["b"]);
});

test("a resolved first load atomically replaces the unresolved render target", () => {
  const unresolvedIdentity = buildSettingsCatalogDataSourceIdentity({
    clientReadOnly: true,
    hostBaseUrl: null,
    hostWritePaired: false,
    libraryId: null,
    targetGeneration: null,
  });
  const resolvedIdentity = buildSettingsCatalogDataSourceIdentity({
    clientReadOnly: true,
    hostBaseUrl: "https://host-a.local:4278",
    hostWritePaired: true,
    libraryId: "library-a",
    targetGeneration: 4,
  });
  const pending = reduceSettingsCatalogData(createSettingsCatalogDataState(), {
    type: "target",
    dataSourceIdentity: unresolvedIdentity,
  });
  const resolved = commitResolvedSettingsCatalogData(pending, {
    type: "reload",
    available: true,
    dataSourceIdentity: resolvedIdentity,
    rows: [catalogRow("host-a")],
  });

  assert.equal(resolved.dataSourceIdentity, resolvedIdentity);
  assert.equal(resolved.loadStatus, "available");
  assert.deepEqual(resolved.rows.map((row) => row.id), ["host-a"]);

  const laterFailure = reduceSettingsCatalogData(resolved, {
    type: "reload",
    available: false,
    dataSourceIdentity: resolvedIdentity,
    rows: [],
  });
  assert.strictEqual(laterFailure, resolved);
});
