import {
  buildInventoryMetadataCandidateResult,
  type ObservedInventoryMatchInput,
} from "./inventory_match";
import type {
  BambuLiveObservedTray,
  MasterCatalogRow,
  SpoolWithMasterRow,
} from "./tauri_client";

export type BambuLiveCatalogMatchResult =
  | { kind: "catalog_single"; candidates: MasterCatalogRow[] }
  | { kind: "catalog_multiple"; candidates: MasterCatalogRow[] }
  | { kind: "none"; candidates: MasterCatalogRow[] };

function fakeCatalogSpoolRow(master: MasterCatalogRow): SpoolWithMasterRow {
  return {
    spool: {
      id: master.id,
      master_id: master.id,
      status: "IN_STOCK",
      rfid_tag: null,
    },
    master,
  };
}

function observedFromLiveTray(liveTray: BambuLiveObservedTray): ObservedInventoryMatchInput | null {
  const material = liveTray.filament_type?.trim() ?? "";
  const filamentName = liveTray.filament_name?.trim() ?? "";
  const colorHex = liveTray.color_hex?.trim() ?? "";
  if (!material && !filamentName && !colorHex) {
    return null;
  }
  return {
    material: material || null,
    filamentName: filamentName || null,
    colorHex: colorHex || null,
  };
}

function sortCatalogCandidates(candidates: MasterCatalogRow[]): MasterCatalogRow[] {
  return [...candidates].sort(
    (left, right) =>
      Number(Boolean(left.is_discontinued)) - Number(Boolean(right.is_discontinued)),
  );
}

export function buildBambuLiveCatalogMatchResult(
  catalogRows: MasterCatalogRow[],
  liveTray: BambuLiveObservedTray | null | undefined,
): BambuLiveCatalogMatchResult {
  if (!liveTray?.loaded) {
    return { kind: "none", candidates: [] };
  }
  const observed = observedFromLiveTray(liveTray);
  if (!observed) {
    return { kind: "none", candidates: [] };
  }

  const rowsById = new Map(catalogRows.map((row) => [row.id, row]));
  const result = buildInventoryMetadataCandidateResult(
    catalogRows.map(fakeCatalogSpoolRow),
    observed,
    {
      includeBambuMetadataCandidates: true,
      onlyBambuMetadataCandidates: true,
      requireObservedMaterialFamily: true,
    },
  );
  const candidates = result.candidates
    .map((row) => rowsById.get(row.master.id))
    .filter((row): row is MasterCatalogRow => row != null);
  const sortedCandidates = sortCatalogCandidates(candidates);

  if (sortedCandidates.length === 1) {
    return { kind: "catalog_single", candidates: sortedCandidates };
  }
  if (sortedCandidates.length > 1) {
    return { kind: "catalog_multiple", candidates: sortedCandidates };
  }
  return { kind: "none", candidates: [] };
}
