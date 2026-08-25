import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocationForInventory,
  deleteLocationForInventory,
  legacyLocationsFromSpools,
  loadInventoryLocations,
  selectableInventoryLocations,
} from "./inventory_location_data_source";
import type { InventorySpool } from "./inventory_list_model";
import type { InventoryLocationRow } from "./tauri_location_client";

function spool(overrides: Partial<InventorySpool> = {}): InventorySpool {
  return {
    id: "spool-1",
    masterId: "master-1",
    vendor: "Manual",
    material: "PLA",
    filamentName: "Basic",
    colorName: "Blue",
    initialWeightGrams: 1000,
    status: "IN_STOCK",
    ownershipType: "OWNED",
    location: "Shelf A",
    locationId: "legacy-location-id",
    homeLocation: "Shelf A",
    homeLocationId: "legacy-location-id",
    ...overrides,
  };
}

function location(overrides: Partial<InventoryLocationRow> = {}): InventoryLocationRow {
  return {
    id: "location-1",
    name: "Shelf A",
    location_type: "GENERIC",
    parent_id: null,
    archived_at: null,
    created_at: "2026-08-21 10:00:00",
    updated_at: "2026-08-21 10:00:00",
    ...overrides,
  };
}

test("autocomplete includes only active generic locations", () => {
  const rows = [
    location(),
    location({ id: "archived", name: "Old shelf", archived_at: "2026-08-21" }),
    location({
      id: "Printer:Studio:slot-1",
      name: "Printer:Studio:slot-1",
      location_type: "PRINTER_SLOT",
    }),
    location({ id: "loan", name: "Loaned to: Ada", location_type: "LOAN" }),
  ];

  assert.deepEqual(selectableInventoryLocations(rows).map((row) => row.id), [
    "location-1",
  ]);
});

test("legacy Host rows retain immutable id and fall back to id when no name exists", () => {
  const rows = legacyLocationsFromSpools([
    spool(),
    spool({
      id: "spool-2",
      location: "legacy-name-is-id",
      locationId: undefined,
      homeLocation: null,
      homeLocationId: null,
    }),
  ]);

  assert.deepEqual(
    rows.map(({ id, name }) => ({ id, name })),
    [
      { id: "legacy-name-is-id", name: "legacy-name-is-id" },
      { id: "legacy-location-id", name: "Shelf A" },
    ],
  );
});

test("older Host location endpoint becomes explicit read-only legacy capability", async () => {
  const result = await loadInventoryLocations(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host.test",
      clientLibraryId: "library-1",
    },
    [spool()],
    {
      fetchHost: async () => ({
        rows: [],
        mutations_supported: false,
        captured_at: null,
      }),
    },
  );

  assert.equal(result.source, "LEGACY_HOST");
  assert.equal(result.mutationsSupported, false);
  assert.deepEqual(result.rows.map((row) => row.id), ["legacy-location-id"]);
  assert.throws(
    () =>
      createLocationForInventory(
        {
          clientReadOnly: true,
          clientHostBaseUrl: "http://host.test",
          clientLibraryId: "library-1",
          clientHostWritePaired: true,
          mutationsSupported: false,
        },
        "New shelf",
      ),
    /does not support location objects/,
  );
});

test("restart or offline fallback keeps cached locations read-only until live support is proven", async () => {
  const result = await loadInventoryLocations(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host.test",
      clientLibraryId: "library-1",
    },
    [],
    {
      fetchHost: async () => {
        throw new Error("offline");
      },
      fetchCached: async () => ({
        rows: [location()],
        mutations_supported: false,
        captured_at: "2026-08-21 12:00:00",
      }),
    },
  );

  assert.equal(result.source, "CACHED");
  assert.equal(result.updatedAt, "2026-08-21 12:00:00");
  assert.equal(result.mutationsSupported, false);
  assert.deepEqual(result.rows.map((row) => row.id), ["location-1"]);
});

test("delete routes to the owning local database or paired Host", async () => {
  const calls: string[] = [];
  const dependencies = {
    deleteLocal: async (locationId: string) => {
      calls.push(`local:${locationId}`);
      return location({ id: locationId });
    },
    deleteHost: async (
      target: { baseUrl: string; expectedLibraryId?: string | null },
      locationId: string,
    ) => {
      calls.push(`host:${target.baseUrl}:${target.expectedLibraryId}:${locationId}`);
      return location({ id: locationId });
    },
  };

  await deleteLocationForInventory(
    {
      clientReadOnly: false,
      clientHostWritePaired: false,
      mutationsSupported: true,
    },
    "local-location",
    dependencies,
  );
  await deleteLocationForInventory(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host.test",
      clientLibraryId: "library-1",
      clientHostWritePaired: true,
      mutationsSupported: true,
    },
    "host-location",
    dependencies,
  );

  assert.deepEqual(calls, [
    "local:local-location",
    "host:http://host.test:library-1:host-location",
  ]);
});
