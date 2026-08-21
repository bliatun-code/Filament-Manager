import assert from "node:assert/strict";
import test from "node:test";

import {
  loadInventorySpoolDetail,
  loadInventorySpools,
  mapSpoolRowToInventorySpool,
} from "./inventory_data_source";
import { normalizeSpoolWithMasterRow } from "./spool_row_normalization";
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
      purchase_currency: null,
      batch_code: null,
      supplier_reference: null,
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
  const row = normalizeSpoolWithMasterRow(
    spoolRow(
      "spool-1",
      {
        status: "IN_USE",
        initial_weight_g: 750,
        remaining_g: 420,
        ownership_type: "BORROWED_IN",
        owner_name: "Ada",
        location_id: "Shelf A",
        rfid_tag: "rfid-1",
        purchase_price: 249.5,
        purchase_currency: "NOK",
        purchase_date: "2026-08-21",
        batch_code: "LOT-7",
        supplier_reference: "PO-42",
      },
      { default_weight: 900 },
    ),
  );
  row.low_stock_threshold_g = 325;
  row.spool.status = "IN_STOCK";
  const mapped = mapSpoolRowToInventorySpool(row);

  assert.equal(mapped.id, "spool-1");
  assert.equal(mapped.status, "ASSIGNED");
  assert.equal(mapped.initialWeightGrams, 750);
  assert.equal(mapped.remainingGrams, 420);
  assert.equal(mapped.ownershipType, "BORROWED_IN");
  assert.equal(mapped.ownerName, "Ada");
  assert.equal(mapped.location, "Shelf A");
  assert.equal(mapped.rfidTag, "rfid-1");
  assert.equal(mapped.purchasePrice, 249.5);
  assert.equal(mapped.purchaseCurrency, "NOK");
  assert.equal(mapped.purchaseDate, "2026-08-21");
  assert.equal(mapped.batchCode, "LOT-7");
  assert.equal(mapped.supplierReference, "PO-42");
  assert.equal(mapped.lowStockThresholdGrams, 325);
  assert.equal(mapped.lowStockThresholdLegacyFallback, false);
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
  const legacy = mapSpoolRowToInventorySpool(spoolRow("legacy-host-spool"));
  assert.equal(legacy.lowStockThresholdGrams, 200);
  assert.equal(legacy.lowStockThresholdLegacyFallback, true);
});

test("loadInventorySpools reports live client rows with cached snapshot timestamp", async () => {
  const result = await loadInventorySpools(
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      loadRowsPage: async () => [spoolRow("live-spool", { status: "IN_USE" })],
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
  assert.equal(result.rows[0]?.status, "ASSIGNED");
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
        rows: [spoolRow("cached-spool", { status: "loaned out" })],
      }),
    },
  );

  assert.equal(result.source, "CACHED");
  assert.equal(result.usedFallback, true);
  assert.equal(result.updatedAt, "2026-04-01 11:00:00");
  assert.deepEqual(result.rows.map((row) => row.id), ["cached-spool"]);
  assert.equal(result.rows[0]?.status, "BORROWED");
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

test("loadInventorySpoolDetail loads client history and usage with one host detail request", async () => {
  const calls: Array<{
    baseUrl: string;
    libraryId: string | null | undefined;
    spoolId: string | undefined;
    historyLimit: number;
    usageLimit: number;
  }> = [];
  const result = await loadInventorySpoolDetail(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
      spoolId: "spool-1",
    },
    {
      fetchHostSpoolDetail: async (baseUrl, libraryId, spoolId, historyLimit, usageLimit) => {
        calls.push({ baseUrl, libraryId, spoolId, historyLimit, usageLimit });
        return {
          spool: spoolRow("spool-1"),
          history: [
            {
              id: "history-1",
              spool_id: "spool-1",
              event_type: "CREATED",
              from_status: null,
              to_status: "IN_STOCK",
              from_remaining_g: null,
              to_remaining_g: 1000,
              note: null,
              created_at: "2026-04-01 10:00:00",
            },
          ],
          usage: [
            {
              job_id: "job-1",
              printer_id: "printer-1",
              printer_name: "Printer",
              grams: 20,
              job_name: null,
              success: true,
              used_at: "2026-04-01 10:00:00",
            },
          ],
          active_loan: null,
        };
      },
    },
  );

  assert.deepEqual(calls, [
    {
      baseUrl: "http://host",
      libraryId: "library-1",
      spoolId: "spool-1",
      historyLimit: 80,
      usageLimit: 500,
    },
  ]);
  assert.deepEqual(result.historyRows.map((row) => row.id), ["history-1"]);
  assert.deepEqual(result.usagePoints.map((row) => row.job_id), ["job-1"]);
});

test("loadInventorySpoolDetail avoids local detail fallback when client host details are incomplete", async () => {
  const result = await loadInventorySpoolDetail(
    {
      clientReadOnly: true,
      clientHostBaseUrl: " ",
      clientLibraryId: "library-1",
      spoolId: "spool-1",
    },
    {
      fetchHostSpoolDetail: async () => {
        throw new Error("host detail should not load without a complete target");
      },
      listLocalHistory: async () => {
        throw new Error("local history should not load in client mode");
      },
      listLocalUsage: async () => {
        throw new Error("local usage should not load in client mode");
      },
    },
  );

  assert.deepEqual(result, {
    historyRows: [],
    usagePoints: [],
  });
});

test("loadInventorySpoolDetail loads local history and usage together outside client mode", async () => {
  const calls: string[] = [];
  const result = await loadInventorySpoolDetail(
    { clientReadOnly: false, spoolId: "spool-1", historyLimit: 12, usageLimit: 34 },
    {
      listLocalHistory: async (spoolId, limit) => {
        calls.push(`history:${spoolId}:${limit}`);
        return [];
      },
      listLocalUsage: async (spoolId, limit) => {
        calls.push(`usage:${spoolId}:${limit}`);
        return [];
      },
    },
  );

  assert.deepEqual(calls.sort(), ["history:spool-1:12", "usage:spool-1:34"]);
  assert.deepEqual(result, {
    historyRows: [],
    usagePoints: [],
  });
});
