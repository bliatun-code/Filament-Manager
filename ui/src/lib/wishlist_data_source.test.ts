import assert from "node:assert/strict";
import test from "node:test";

import {
  createWishlistEntry,
  deleteWishlistEntry,
  loadWishlistItems,
  updateWishlistEntryStatus,
} from "./wishlist_data_source";
import type { CreateWishlistItemInput, WishlistItemRow } from "./tauri_client";

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

test("loadWishlistItems falls back to local loading when client host details are incomplete", async () => {
  const rows = await loadWishlistItems(
    { clientReadOnly: true, clientHostBaseUrl: "", clientLibraryId: "library-1" },
    {
      listLocalWishlist: async () => [wishlistItem("local-fallback")],
    },
  );

  assert.deepEqual(rows.map((row) => row.id), ["local-fallback"]);
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
    /Client host base URL/,
  );
});
