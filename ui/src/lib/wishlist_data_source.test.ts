import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWishlistDraft,
  createWishlistEntry,
  deleteWishlistEntry,
  filterWishlistCatalogMasters,
  filterWishlistItems,
  listWishlistCatalogMastersByVendor,
  loadWishlistItems,
  normalizeWishlistStatus,
  selectWishlistCatalogMaster,
  summarizeWishlistQueue,
  updateWishlistEntryStatus,
} from "./wishlist_data_source";
import type { CreateWishlistItemInput, MasterCatalogRow, WishlistItemRow } from "./tauri_client";

function wishlistItem(id: string): WishlistItemRow {
  return {
    id,
    master_id: "master-1",
    status: "WISHLIST",
    desired_quantity: 1,
    note: null,
    created_at: "2026-04-01 10:00:00",
    updated_at: "2026-04-01 10:00:00",
    material: "PLA",
    filament_name: "Basic",
    color_name: "Gray",
    hex_color: "#808080",
    default_weight: 1000,
    vendor: "Generic",
  };
}

test("loadWishlistItems uses host wishlist in client mode", async () => {
  const calls: Array<{ baseUrl: string; libraryId: string | null | undefined; limit: number }> = [];
  const rows = await loadWishlistItems(
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      fetchHostWishlist: async (baseUrl, libraryId, limit) => {
        calls.push({ baseUrl, libraryId, limit });
        return [wishlistItem("host-item")];
      },
    },
  );

  assert.deepEqual(calls, [{ baseUrl: "http://host", libraryId: "library-1", limit: 500 }]);
  assert.deepEqual(rows.map((row) => row.id), ["host-item"]);
});

test("filterWishlistItems applies the queue status filter", () => {
  const wishlist = wishlistItem("wishlist");
  const onOrder = { ...wishlistItem("order"), status: "ON_ORDER" };
  const received = { ...wishlistItem("received"), status: "RECEIVED" };

  assert.deepEqual(
    filterWishlistItems([wishlist, onOrder, received], "ALL").map((item) => item.id),
    ["wishlist", "order", "received"],
  );
  assert.deepEqual(
    filterWishlistItems([wishlist, onOrder, received], "ON_ORDER").map((item) => item.id),
    ["order"],
  );
});

test("summarizeWishlistQueue counts known queue states", () => {
  assert.deepEqual(
    summarizeWishlistQueue([
      wishlistItem("wishlist"),
      { ...wishlistItem("order"), status: "ON_ORDER" },
      { ...wishlistItem("received"), status: "RECEIVED" },
      { ...wishlistItem("unknown"), status: "ARCHIVED" },
    ]),
    { all: 4, wishlist: 1, onOrder: 1, received: 1 },
  );
});

test("normalizeWishlistStatus keeps known queue states and falls back to wishlist", () => {
  assert.equal(normalizeWishlistStatus("WISHLIST"), "WISHLIST");
  assert.equal(normalizeWishlistStatus("ON_ORDER"), "ON_ORDER");
  assert.equal(normalizeWishlistStatus("RECEIVED"), "RECEIVED");
  assert.equal(normalizeWishlistStatus("ARCHIVED"), "WISHLIST");
});

function catalogMaster(overrides: Partial<MasterCatalogRow> = {}): MasterCatalogRow {
  return {
    id: "master-1",
    material: "PLA",
    filament_name: "PLA Basic",
    color_name: "Gray",
    hex_color: "#808080",
    product_url: null,
    default_weight: 1000,
    vendor: "Bambu",
    is_discontinued: false,
    discontinued_at: null,
    ...overrides,
  };
}

test("buildWishlistDraft maps selected catalog masters", () => {
  assert.deepEqual(
    buildWishlistDraft({
      source: "bambu",
      selectedBambuMaster: catalogMaster({ id: "bambu-1", vendor: "Bambu" }),
    }),
    {
      master_id: "bambu-1",
      vendor: "Bambu",
      material: "PLA",
      filament_name: "PLA Basic",
      color_name: "Gray",
    },
  );
  assert.deepEqual(
    buildWishlistDraft({
      source: "esun",
      selectedEsunMaster: catalogMaster({ id: "esun-1", vendor: "eSUN" }),
    }),
    {
      master_id: "esun-1",
      vendor: "eSUN",
      material: "PLA",
      filament_name: "PLA Basic",
      color_name: "Gray",
    },
  );
});

test("buildWishlistDraft maps manual details with defaults", () => {
  assert.equal(
    buildWishlistDraft({
      source: "manual",
      manualFilamentName: " ",
      manualColorName: "Blue",
    }),
    null,
  );
  assert.deepEqual(
    buildWishlistDraft({
      source: "manual",
      manualVendor: " ",
      manualMaterial: " ",
      manualFilamentName: " Tough ",
      manualColorName: " Blue ",
    }),
    {
      master_id: null,
      vendor: "Generic",
      material: "PLA",
      filament_name: "Tough",
      color_name: "Blue",
    },
  );
});

test("listWishlistCatalogMastersByVendor filters vendor and keeps active rows first", () => {
  const masters = [
    catalogMaster({
      id: "discontinued-a",
      color_name: "Amber",
      is_discontinued: true,
    }),
    catalogMaster({
      id: "active-z",
      color_name: "Zinc",
    }),
    catalogMaster({
      id: "other-vendor",
      vendor: "Generic",
    }),
    catalogMaster({
      id: "active-a",
      color_name: "Aqua",
    }),
  ];

  assert.deepEqual(
    listWishlistCatalogMastersByVendor(masters, "bambu").map((master) => master.id),
    ["active-a", "active-z", "discontinued-a"],
  );
});

test("filterWishlistCatalogMasters applies state and search filters", () => {
  const active = catalogMaster({ id: "active", color_name: "Blue" });
  const discontinued = catalogMaster({
    id: "discontinued",
    color_name: "Red",
    is_discontinued: true,
  });

  assert.deepEqual(
    filterWishlistCatalogMasters([active, discontinued], "ACTIVE", "").map(
      (master) => master.id,
    ),
    ["active"],
  );
  assert.deepEqual(
    filterWishlistCatalogMasters([active, discontinued], "DISCONTINUED", "red").map(
      (master) => master.id,
    ),
    ["discontinued"],
  );
});

test("selectWishlistCatalogMaster prefers selected id and falls back to first row", () => {
  const first = catalogMaster({ id: "first" });
  const second = catalogMaster({ id: "second" });

  assert.equal(selectWishlistCatalogMaster([first, second], "second")?.id, "second");
  assert.equal(selectWishlistCatalogMaster([first, second], "missing")?.id, "first");
  assert.equal(selectWishlistCatalogMaster([], "missing"), null);
});

test("loadWishlistItems uses local wishlist outside client host mode", async () => {
  const calls: Array<{ limit: number }> = [];
  const rows = await loadWishlistItems(
    { clientReadOnly: false, limit: 25 },
    {
      listLocalWishlist: async (limit) => {
        calls.push({ limit });
        return [wishlistItem("local-item")];
      },
    },
  );

  assert.deepEqual(calls, [{ limit: 25 }]);
  assert.deepEqual(rows.map((row) => row.id), ["local-item"]);
});

test("loadWishlistItems avoids local fallback when client host details are incomplete", async () => {
  const rows = await loadWishlistItems(
    { clientReadOnly: true, clientHostBaseUrl: "", clientLibraryId: "library-1" },
    {
      fetchHostWishlist: async () => {
        throw new Error("host wishlist should not load without a complete target");
      },
      listLocalWishlist: async () => {
        throw new Error("local wishlist should not load in client mode");
      },
    },
  );

  assert.deepEqual(rows, []);
});

function wishlistInput(overrides: Partial<CreateWishlistItemInput> = {}): CreateWishlistItemInput {
  return {
    id: "wish-1",
    master_id: "master-1",
    vendor: "Generic",
    material: "PLA",
    filament_name: "Basic",
    color_name: "Gray",
    quantity: 1,
    note: null,
    ...overrides,
  };
}

test("createWishlistEntry routes client writes to the host", async () => {
  const calls: Array<{
    baseUrl: string;
    libraryId: string | null | undefined;
    input: CreateWishlistItemInput;
  }> = [];
  const input = wishlistInput();

  await createWishlistEntry(
    input,
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      createHostWishlistItem: async (baseUrl, libraryId, createInput) => {
        calls.push({ baseUrl, libraryId, input: createInput });
      },
    },
  );

  assert.deepEqual(calls, [{ baseUrl: "http://host", libraryId: "library-1", input }]);
});

test("createWishlistEntry uses local writes outside client mode", async () => {
  const calls: CreateWishlistItemInput[] = [];
  const input = wishlistInput({ id: "local-wish" });

  await createWishlistEntry(
    input,
    { clientReadOnly: false },
    {
      createLocalWishlistItem: async (createInput) => {
        calls.push(createInput);
      },
    },
  );

  assert.deepEqual(calls, [input]);
});

test("updateWishlistEntryStatus routes status changes to the host", async () => {
  const calls: Array<{ baseUrl: string; itemId: string; status: string }> = [];

  await updateWishlistEntryStatus(
    { item_id: "wish-1", status: "RECEIVED" },
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      updateHostWishlistItemStatus: async (baseUrl, _libraryId, input) => {
        calls.push({ baseUrl, itemId: input.item_id, status: input.status });
      },
    },
  );

  assert.deepEqual(calls, [{ baseUrl: "http://host", itemId: "wish-1", status: "RECEIVED" }]);
});

test("deleteWishlistEntry routes deletes to the host", async () => {
  const calls: Array<{ baseUrl: string; itemId: string }> = [];

  await deleteWishlistEntry(
    "wish-1",
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      deleteHostWishlistItem: async (baseUrl, _libraryId, itemId) => {
        calls.push({ baseUrl, itemId });
      },
    },
  );

  assert.deepEqual(calls, [{ baseUrl: "http://host", itemId: "wish-1" }]);
});

test("wishlist host mutations reject missing client host details", async () => {
  await assert.rejects(
    () => createWishlistEntry(wishlistInput(), { clientReadOnly: true, clientHostBaseUrl: "" }),
    /Host connection details/,
  );
  await assert.rejects(
    () =>
      updateWishlistEntryStatus(
        { item_id: "wish-1", status: "RECEIVED" },
        { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: " " },
      ),
    /Host connection details/,
  );
  await assert.rejects(
    () =>
      deleteWishlistEntry("wish-1", {
        clientReadOnly: true,
        clientHostBaseUrl: "http://host",
        clientLibraryId: "",
      }),
    /Host connection details/,
  );
});
