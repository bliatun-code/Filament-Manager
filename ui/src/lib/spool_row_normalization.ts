import {
  normalizeOwnershipType,
  parseSpoolStatus,
  type OwnershipType,
  type SpoolStatus,
} from "./inventory_domain";
import type { SpoolWithMasterRow } from "./tauri_client";

export type NormalizedSpoolRow = Omit<SpoolWithMasterRow["spool"], "ownership_type"> & {
  normalized_status: SpoolStatus | null;
  ownership_type: OwnershipType;
};

export type NormalizedSpoolWithMasterRow = Omit<SpoolWithMasterRow, "spool"> & {
  spool: NormalizedSpoolRow;
};

export function normalizeSpoolWithMasterRow(
  row: SpoolWithMasterRow,
): NormalizedSpoolWithMasterRow {
  return {
    ...row,
    spool: {
      ...row.spool,
      normalized_status: parseSpoolStatus(row.spool.status),
      ownership_type: normalizeOwnershipType(row.spool.ownership_type),
    },
  };
}

export function normalizeSpoolWithMasterRows(
  rows: SpoolWithMasterRow[],
): NormalizedSpoolWithMasterRow[] {
  return rows.map(normalizeSpoolWithMasterRow);
}
