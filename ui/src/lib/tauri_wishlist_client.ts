import { invoke } from "./tauri_invoke";

export type WishlistItemRow = {
  id: string;
  master_id?: string | null;
  material: string;
  filament_name: string;
  color_name: string;
  vendor: string;
  status: string;
  quantity: number;
  note?: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateWishlistItemInput = {
  id: string;
  master_id?: string | null;
  material: string;
  filament_name: string;
  color_name: string;
  vendor?: string | null;
  quantity?: number | null;
  note?: string | null;
};

export type UpdateWishlistStatusInput = {
  item_id: string;
  status: string;
};

export type ReceiveWishlistItemInput = {
  item_id: string;
  quantity: number;
};

export type WishlistReceiptResult = {
  spool_ids: string[];
  received_quantity: number;
  remaining_quantity: number;
  status: string;
};

export async function listWishlistItems(limit = 500) {
  return invoke<WishlistItemRow[]>("list_wishlist_items", { limit });
}

export async function createWishlistItem(input: CreateWishlistItemInput) {
  return invoke<void>("create_wishlist_item", { input });
}

export async function createLibrarySyncHostWishlistItem(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: CreateWishlistItemInput,
) {
  return invoke<void>("create_library_sync_host_wishlist_item", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      master_id: input.master_id ?? null,
      vendor: input.vendor,
      material: input.material,
      filament_name: input.filament_name,
      color_name: input.color_name,
      quantity: input.quantity ?? null,
      note: input.note ?? null,
    },
  });
}

export async function updateWishlistItemStatus(input: UpdateWishlistStatusInput) {
  return invoke<void>("update_wishlist_item_status", { input });
}

export async function receiveWishlistItem(input: ReceiveWishlistItemInput) {
  return invoke<WishlistReceiptResult>("receive_wishlist_item", { input });
}

export async function receiveLibrarySyncHostWishlistItem(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: ReceiveWishlistItemInput,
) {
  return invoke<WishlistReceiptResult>("receive_library_sync_host_wishlist_item", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      item_id: input.item_id,
      quantity: input.quantity,
    },
  });
}

export async function updateLibrarySyncHostWishlistItemStatus(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: UpdateWishlistStatusInput,
) {
  return invoke<void>("update_library_sync_host_wishlist_item_status", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      item_id: input.item_id,
      status: input.status,
    },
  });
}

export async function deleteWishlistItem(itemId: string) {
  return invoke<void>("delete_wishlist_item", { itemId });
}

export async function deleteLibrarySyncHostWishlistItem(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  itemId: string,
) {
  return invoke<void>("delete_library_sync_host_wishlist_item", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      item_id: itemId,
    },
  });
}

export async function fetchLibrarySyncWishlistItems(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  limit = 500,
) {
  return invoke<WishlistItemRow[]>("fetch_library_sync_wishlist_items", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      limit,
    },
  });
}
