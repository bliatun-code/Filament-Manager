import { invoke } from "./tauri_invoke";

export type InventoryLocationRow = {
  id: string;
  name: string;
  location_type: string;
  parent_id?: string | null;
  x?: number | null;
  y?: number | null;
  z?: number | null;
  archived_at?: string | null;
  can_delete?: boolean;
  created_at: string;
  reference_count?: number | null;
  updated_at: string;
};

export type InventoryLocationMergeResult = {
  source_id: string;
  target_id: string;
  affected_spools: number;
  moved_current_references: number;
  moved_home_references: number;
  moved_parent_references: number;
};

export type InventoryLocationListResponse = {
  rows: InventoryLocationRow[];
  mutations_supported: boolean;
  captured_at?: string | null;
};

type HostTarget = {
  baseUrl: string;
  expectedLibraryId?: string | null;
};

function hostTargetInput(target: HostTarget) {
  return {
    base_url: target.baseUrl,
    expected_library_id: target.expectedLibraryId ?? null,
  };
}

export function listInventoryLocations(includeArchived = false) {
  return invoke<InventoryLocationRow[]>("list_inventory_locations", {
    includeArchived,
  });
}

export function fetchLibrarySyncLocations(target: HostTarget) {
  return invoke<InventoryLocationListResponse>("fetch_library_sync_locations", {
    input: hostTargetInput(target),
  });
}

export function fetchCachedLibrarySyncLocations() {
  return invoke<InventoryLocationListResponse | null>(
    "fetch_cached_library_sync_locations",
  );
}

export function createInventoryLocation(name: string, parentId?: string | null) {
  return invoke<InventoryLocationRow>("create_inventory_location", {
    input: { name, parent_id: parentId ?? null },
  });
}

export function createLibrarySyncHostLocation(
  target: HostTarget,
  name: string,
  parentId?: string | null,
) {
  return invoke<InventoryLocationRow>("create_library_sync_host_location", {
    input: {
      ...hostTargetInput(target),
      name,
      parent_id: parentId ?? null,
    },
  });
}

export function renameInventoryLocation(locationId: string, name: string) {
  return invoke<InventoryLocationRow>("rename_inventory_location", {
    input: { location_id: locationId, name },
  });
}

export function renameLibrarySyncHostLocation(
  target: HostTarget,
  locationId: string,
  name: string,
) {
  return invoke<InventoryLocationRow>("rename_library_sync_host_location", {
    input: {
      ...hostTargetInput(target),
      location_id: locationId,
      name,
    },
  });
}

export function archiveInventoryLocation(locationId: string) {
  return invoke<InventoryLocationRow>("archive_inventory_location", {
    input: { location_id: locationId },
  });
}

export function archiveLibrarySyncHostLocation(target: HostTarget, locationId: string) {
  return invoke<InventoryLocationRow>("archive_library_sync_host_location", {
    input: { ...hostTargetInput(target), location_id: locationId },
  });
}

export function restoreInventoryLocation(locationId: string) {
  return invoke<InventoryLocationRow>("restore_inventory_location", {
    input: { location_id: locationId },
  });
}

export function restoreLibrarySyncHostLocation(target: HostTarget, locationId: string) {
  return invoke<InventoryLocationRow>("restore_library_sync_host_location", {
    input: { ...hostTargetInput(target), location_id: locationId },
  });
}

export function deleteInventoryLocation(locationId: string) {
  return invoke<InventoryLocationRow>("delete_inventory_location", {
    input: { location_id: locationId },
  });
}

export function deleteLibrarySyncHostLocation(target: HostTarget, locationId: string) {
  return invoke<InventoryLocationRow>("delete_library_sync_host_location", {
    input: { ...hostTargetInput(target), location_id: locationId },
  });
}

export function mergeInventoryLocations(sourceId: string, targetId: string) {
  return invoke<InventoryLocationMergeResult>("merge_inventory_locations", {
    input: { source_id: sourceId, target_id: targetId },
  });
}

export function mergeLibrarySyncHostLocations(
  target: HostTarget,
  sourceId: string,
  targetId: string,
) {
  return invoke<InventoryLocationMergeResult>("merge_library_sync_host_locations", {
    input: {
      ...hostTargetInput(target),
      source_id: sourceId,
      target_id: targetId,
    },
  });
}
