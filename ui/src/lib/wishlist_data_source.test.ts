import assert from "node:assert/strict";
import test from "node:test";

import { loadWishlistItems } from "./wishlist_data_source";
import type { WishlistItemRow } from "./tauri_client";

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
