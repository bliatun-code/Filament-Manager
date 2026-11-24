import assert from "node:assert/strict";
import test from "node:test";
import {
  applyInventoryLocationNames,
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

test("autocomplete includes only active user-managed locations", () => {
  const rows = [
    location(),
    location({ id: "legacy-shelf", name: "Legacy shelf", location_type: "SHELF" }),
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
    "legacy-shelf",
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
      clientTargetGeneration: 7,
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
      clientTargetGeneration: 7,
    },
    [],
    {
      fetchHost: async () => {
        throw new Error("offline");
      },
      fetchCached: async (target) => {
        assert.deepEqual(target, {
          baseUrl: "http://host.test",
          expectedLibraryId: "library-1",
          targetGeneration: 7,
        });
        return {
          rows: [location()],
          mutations_supported: false,
          captured_at: "2026-08-21 12:00:00",
        };
      },
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

test("current Hosts and offline summaries report exact location counts without opening stock", async () => {
  const options = { clientReadOnly: true, clientHostBaseUrl: "https://a.invalid", clientLibraryId: "A", clientTargetGeneration: 9 };
  for (const online of [true, false]) {
    for (const count of [0, 10000]) {
      const response = { rows: [location({ linked_spool_count: count })], mutations_supported: true };
      const result = await loadInventoryLocations(options, undefined, {
        fetchHost: async target => {
          assert.equal(target.targetGeneration, 9);
          if (!online) throw Error("offline");
          return response;
        },
        fetchCached: async target => {
          assert.deepEqual(target, { baseUrl: "https://a.invalid", expectedLibraryId: "A", targetGeneration: 9 });
          assert.equal(online, false);
          return response;
        },
        loadStock: async () => assert.fail("opened live stock"),
        loadCachedStock: async () => assert.fail("opened offline stock"),
      });
      assert.equal(result.rows[0].linked_spool_count, count);
      assert.equal(result.mutationsSupported, online);
      assert.equal(result.source, online ? "LIVE" : "CACHED");
    }
  }
});

test("a legacy location list derives distinct counts from the available live or saved inventory", async () => {
  const options = { clientReadOnly: true, clientHostBaseUrl: "https://a.invalid", clientLibraryId: "A", clientTargetGeneration: 9 };
  const rows = [location({ id: "legacy-location-id", reference_count: 7 })];
  const stock = { rows: [spool()], source: "LIVE" as const, updatedAt: null, usedFallback: false };
  for (const online of [true, false]) {
    let reads = 0;
    const result = await loadInventoryLocations(options, undefined, {
      fetchHost: async () => {
        if (!online) throw Error("offline");
        return { rows, mutations_supported: true };
      },
      fetchCached: async () => ({ rows, mutations_supported: false }),
      loadStock: async () => { assert.ok(online); reads++; return stock; },
      loadCachedStock: async () => { assert.ok(!online); reads++; return stock; },
    });
    assert.equal(reads, 1);
    assert.equal(result.rows[0].linked_spool_count, 1);
    assert.equal(result.rows[0].reference_count, 7);
  }
  const unknown = await loadInventoryLocations(options, undefined, {
    fetchHost: async () => { throw Error("offline"); },
    fetchCached: async () => ({ rows, mutations_supported: false }),
    loadCachedStock: async () => null,
  });
  assert.equal(unknown.rows[0].linked_spool_count, undefined);
});

test("an upgraded offline Client with only a saved inventory can open even an empty location list", async () => {
  const options = { clientReadOnly: true, clientHostBaseUrl: "https://a.invalid", clientLibraryId: "A", clientTargetGeneration: 9 };
  for (const rows of [[], [spool()]]) {
    const result = await loadInventoryLocations(options, undefined, {
      fetchHost: async () => { throw Error("offline"); },
      fetchCached: async () => null,
      loadCachedStock: async () => ({ rows, source: "CACHED", updatedAt: "2026-01-02", usedFallback: true }),
    });
    assert.equal(result.source, "CACHED");
    assert.equal(result.updatedAt, "2026-01-02");
    assert.equal(result.rows.length, rows.length);
    if (rows.length) assert.equal(result.rows[0].linked_spool_count, 1);
    assert.equal(result.mutationsSupported, false);
  }
});

test("offline inventory uses a renamed current or home location by immutable ID", () => {
  const original = spool();
  const other = spool({ locationId: "other", homeLocationId: null });
  const rows = applyInventoryLocationNames([original, other], [location({ id: "legacy-location-id", name: "Renamed" })]);
  assert.equal(rows[0].location, "Renamed");
  assert.equal(rows[0].homeLocation, "Renamed");
  assert.equal(rows[1], other);
  assert.equal(original.location, "Shelf A");
});
