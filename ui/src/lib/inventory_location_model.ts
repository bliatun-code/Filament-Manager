import type { InventoryLocationRow } from "./tauri_location_client";

export type InventoryLocationActionState = InventoryLocationRow & {
  activeGeneric: boolean;
  canArchive: boolean;
  canRename: boolean;
  canRestore: boolean;
  systemOwned: boolean;
};

export function normalizeInventoryLocationName(value: string): string {
  return value.trim().split(/\s+/u).filter(Boolean).join(" ");
}

export function validInventoryLocationName(value: string): boolean {
  const normalized = normalizeInventoryLocationName(value);
  return normalized.length > 0 && [...normalized].length <= 120;
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
        row.location_type === "GENERIC" &&
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
  return rows.map((row) => {
    const systemOwned = row.location_type !== "GENERIC";
    const archived = Boolean(row.archived_at);
    return {
      ...row,
      activeGeneric: !systemOwned && !archived,
      canArchive: mutationsAvailable && !systemOwned && !archived,
      canRename: mutationsAvailable && !systemOwned,
      canRestore: mutationsAvailable && !systemOwned && archived,
      systemOwned,
    };
  });
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
    (row) => row?.location_type === "GENERIC" && !row.archived_at,
  );
}
