import assert from "node:assert/strict";
import test from "node:test";

import {
  loadInventorySpools,
  mapSpoolRowToInventorySpool,
} from "./inventory_data_source";
import type { SpoolWithMasterRow } from "./tauri_client";

function spoolRow(
  id: string,
  overrides: Partial<SpoolWithMasterRow["spool"]> = {},
  masterOverrides: Partial<SpoolWithMasterRow["master"]> = {},
): SpoolWithMasterRow {
  return {
    spool: {
      id,
      master_id: "master-1",
      qr_code: null,
      status: "IN_STOCK",
      ownership_type: "OWNED",
      owner_name: null,
      owner_contact: null,
      ownership_note: null,
      initial_weight_g: null,
      current_weight_g: null,
      remaining_g: null,
      spool_tare_weight_g: null,
      location_id: null,
      home_location_id: null,
      purchase_date: null,
      purchase_price: null,
      batch_code: null,
      rfid_tag: null,
      rfid_observed_at: null,
      created_at: "2026-04-01 10:00:00",
      updated_at: "2026-04-01 10:00:00",
      ...overrides,
    },
    master: {
      id: "master-1",
      material: "PLA",
      filament_name: "Basic",
      color_name: "Gray",
      hex_color: "#808080",
      product_url: null,
      default_weight: 1000,
      vendor: "Generic",
      ...masterOverrides,
    },
  };
}

test("mapSpoolRowToInventorySpool normalizes spool rows for the inventory page", () => {
  const mapped = mapSpoolRowToInventorySpool(
    spoolRow(
      "spool-1",
      {
        initial_weight_g: 750,
        remaining_g: 420,
        ownership_type: "BORROWED_IN",
        owner_name: "Ada",
        location_id: "Shelf A",
        rfid_tag: "rfid-1",
      },
      { default_weight: 900 },
    ),
  );

  assert.equal(mapped.id, "spool-1");
  assert.equal(mapped.initialWeightGrams, 750);
  assert.equal(mapped.remainingGrams, 420);
  assert.equal(mapped.ownershipType, "BORROWED_IN");
  assert.equal(mapped.ownerName, "Ada");
  assert.equal(mapped.location, "Shelf A");
  assert.equal(mapped.rfidTag, "rfid-1");
});

test("mapSpoolRowToInventorySpool falls back to master weight and then 1000g", () => {
  assert.equal(
    mapSpoolRowToInventorySpool(
      spoolRow("spool-master-fallback", { initial_weight_g: 0 }, { default_weight: 850 }),
    ).initialWeightGrams,
    850,
  );
  assert.equal(
    mapSpoolRowToInventorySpool(
      spoolRow("spool-default-fallback", { initial_weight_g: null }, { default_weight: 0 }),
    ).initialWeightGrams,
    1000,
  );
});

test("loadInventorySpools reports live client rows with cached snapshot timestamp", async () => {
  const result = await loadInventorySpools(
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      loadRowsPage: async () => [spoolRow("live-spool")],
      fetchCachedSpools: async () => ({
        captured_at: "2026-04-01 10:00:00",
        rows: [spoolRow("cached-spool")],
      }),
    },
  );

  assert.equal(result.source, "LIVE");
  assert.equal(result.usedFallback, false);
  assert.equal(result.updatedAt, "2026-04-01 10:00:00");
  assert.deepEqual(result.rows.map((row) => row.id), ["live-spool"]);
});

test("loadInventorySpools falls back to cached client rows when host load fails", async () => {
  const result = await loadInventorySpools(
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      loadRowsPage: async () => {
        throw new Error("host unavailable");
      },
      fetchCachedSpools: async () => ({
        captured_at: "2026-04-01 11:00:00",
        rows: [spoolRow("cached-spool")],
      }),
    },
  );

  assert.equal(result.source, "CACHED");
  assert.equal(result.usedFallback, true);
  assert.equal(result.updatedAt, "2026-04-01 11:00:00");
  assert.deepEqual(result.rows.map((row) => row.id), ["cached-spool"]);
});

test("loadInventorySpools reports offline when client host and cache are unavailable", async () => {
  const result = await loadInventorySpools(
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      loadRowsPage: async () => {
        throw new Error("host unavailable");
      },
      fetchCachedSpools: async () => null,
    },
  );

  assert.deepEqual(result, {
    rows: [],
    source: "OFFLINE",
    updatedAt: null,
    usedFallback: true,
  });
});

test("loadInventorySpools rethrows local load failures", async () => {
  await assert.rejects(
    () =>
      loadInventorySpools(
        { clientReadOnly: false },
        {
          loadRowsPage: async () => {
            throw new Error("database unavailable");
          },
        },
      ),
    /database unavailable/,
  );
});
