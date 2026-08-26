import type { InventoryLocationRow } from "./tauri_location_client";

export type InventoryLocationActionState = InventoryLocationRow & {
  activeGeneric: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canRename: boolean;
  canRestore: boolean;
  restoreBlockedByNameConflict: boolean;
};

type InventoryLocationReferenceSpool = Readonly<{
  homeLocationId?: string | null;
  id: string;
  locationId?: string | null;
}>;

export function normalizeInventoryLocationName(value: string): string {
  return value.trim().split(/\s+/u).filter(Boolean).join(" ");
}

export function validInventoryLocationName(value: string): boolean {
  const normalized = normalizeInventoryLocationName(value);
  return normalized.length > 0 && [...normalized].length <= 120;
}

export function isUserManagedInventoryLocation(row: InventoryLocationRow): boolean {
  const locationType = row.location_type.trim().toUpperCase();
  return locationType === "GENERIC" || locationType === "SHELF";
}

type ExistingInventoryLocationReference = {
  id?: string | null;
  name?: string | null;
};

function comparableLocationName(value: string | null | undefined): string {
  return normalizeInventoryLocationName(value ?? "").toUpperCase();
}

export function resolveInventoryLocationReferenceForWrite(
  rows: InventoryLocationRow[],
  draft: string | null | undefined,
  existing: ExistingInventoryLocationReference = {},
): string | null {
  const normalizedDraft = normalizeInventoryLocationName(draft ?? "");
  if (!normalizedDraft) {
    return null;
  }

  // An unchanged draft must retain the immutable ID even if another writer has
  // renamed that location since this form was opened.
  if (
    existing.id?.trim() &&
    comparableLocationName(normalizedDraft) === comparableLocationName(existing.name)
  ) {
    return existing.id.trim();
  }

  const normalizedKey = comparableLocationName(normalizedDraft);
  const activeMatches = rows
    .filter(
      (row) =>
        isUserManagedInventoryLocation(row) &&
        !row.archived_at &&
        (row.id.trim() === normalizedDraft || comparableLocationName(row.name) === normalizedKey),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  return activeMatches[0]?.id ?? normalizedDraft;
}

export function inventoryLocationActionRows(
  rows: InventoryLocationRow[],
  mutationsAvailable: boolean,
): InventoryLocationActionState[] {
  const activeUserManagedNames = new Set(
    rows
      .filter((row) => isUserManagedInventoryLocation(row) && !row.archived_at)
      .map((row) => comparableLocationName(row.name)),
  );

  return rows.filter(isUserManagedInventoryLocation).map((row) => {
    const archived = Boolean(row.archived_at);
    const restoreBlockedByNameConflict =
      archived && activeUserManagedNames.has(comparableLocationName(row.name));
    return {
      ...row,
      activeGeneric: !archived,
      canArchive: mutationsAvailable && !archived,
      canDelete: mutationsAvailable && row.can_delete === true,
      canRename: mutationsAvailable,
      canRestore: mutationsAvailable && archived && !restoreBlockedByNameConflict,
      restoreBlockedByNameConflict,
    };
  });
}

export function inventoryLocationUsageById(
  spools: readonly InventoryLocationReferenceSpool[],
): ReadonlyMap<string, number> {
  const usageById = new Map<string, number>();
  for (const spool of spools) {
    const referencedIds = new Set(
      [spool.locationId, spool.homeLocationId]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    );
    for (const locationId of referencedIds) {
      usageById.set(locationId, (usageById.get(locationId) ?? 0) + 1);
    }
  }
  return usageById;
}

export function validateLocationMerge(
  rows: InventoryLocationRow[],
  sourceId: string,
  targetId: string,
): boolean {
  if (!sourceId || !targetId || sourceId === targetId) {
    return false;
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  return [byId.get(sourceId), byId.get(targetId)].every(
    (row) => Boolean(row && isUserManagedInventoryLocation(row) && !row.archived_at),
  );
}
