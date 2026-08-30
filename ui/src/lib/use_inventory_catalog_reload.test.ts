import assert from "node:assert/strict";
import test from "node:test";

import type { MasterCatalogRow } from "./tauri_client";
import {
  runInventoryCatalogReload,
  type InventoryCatalogLoadState,
} from "./use_inventory_catalog_reload";

function master(): MasterCatalogRow {
  return {
    id: "bambu-pla-basic-black",
    material: "PLA",
    filament_name: "PLA Basic",
    color_name: "Black",
    hex_color: "#000000",
    product_url: null,
    default_weight: 1000,
    vendor: "Bambu Lab",
    is_discontinued: false,
    discontinued_at: null,
  };
}

test("failed lazy catalog loads can retry to a ready result without closing the modal", async () => {
  let attempts = 0;
  const states: InventoryCatalogLoadState[] = [];
  const readyRows: MasterCatalogRow[][] = [];

  const reload = () =>
    runInventoryCatalogReload({
      load: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("Host unavailable");
        }
        return [master()];
      },
      onError: () => states.push("ERROR"),
      onLoading: () => states.push("LOADING"),
      onReady: (rows) => {
        readyRows.push(rows);
        states.push("READY");
      },
    });

  assert.equal(await reload(), false);
  assert.deepEqual(states, ["LOADING", "ERROR"]);
  assert.deepEqual(readyRows, []);

  assert.equal(await reload(), true);
  assert.deepEqual(states, ["LOADING", "ERROR", "LOADING", "READY"]);
  assert.deepEqual(readyRows, [[master()]]);
});

test("a successful empty catalog is ready rather than a load error", async () => {
  const states: InventoryCatalogLoadState[] = [];

  const successful = await runInventoryCatalogReload({
    load: async () => [],
    onError: () => states.push("ERROR"),
    onLoading: () => states.push("LOADING"),
    onReady: () => states.push("READY"),
  });

  assert.equal(successful, true);
  assert.deepEqual(states, ["LOADING", "READY"]);
});

test("a superseded catalog response cannot replace the current target", async () => {
  let currentRequest = 1;
  let resolveOldRequest: ((rows: MasterCatalogRow[]) => void) | undefined;
  const states: InventoryCatalogLoadState[] = [];

  const oldRequest = runInventoryCatalogReload({
    isCurrent: () => currentRequest === 1,
    load: () =>
      new Promise<MasterCatalogRow[]>((resolve) => {
        resolveOldRequest = resolve;
      }),
    onError: () => states.push("ERROR"),
    onLoading: () => states.push("LOADING"),
    onReady: () => states.push("READY"),
  });

  currentRequest = 2;
  resolveOldRequest?.([master()]);

  assert.equal(await oldRequest, false);
  assert.deepEqual(states, ["LOADING"]);
});
