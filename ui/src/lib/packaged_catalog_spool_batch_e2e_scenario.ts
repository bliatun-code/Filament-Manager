import { createCatalogSpoolBatch, type CatalogSpoolBatchReceipt } from "./tauri_catalog_spool_batch_client";
import { fetchLibrarySyncDomainRevisions, getLibraryDomainRevisions } from "./tauri_library_sync_client";
import type { SpoolWithMasterRow } from "./tauri_inventory_client";

export const packagedCatalogBatchTransport = {
  createCatalogSpoolBatch, fetchLibrarySyncDomainRevisions, getLibraryDomainRevisions,
};
export type PackagedCatalogBatchDependencies = typeof packagedCatalogBatchTransport;

export function requirePackagedBatchReceipt(value: CatalogSpoolBatchReceipt | null | undefined, runId: string) {
  if (!value || value.batch_id !== `${runId}-catalog-batch` ||
    value.spool_ids.length !== 2 || new Set(value.spool_ids).size !== 2 ||
    value.spool_ids.some((id) => !/^spool_[a-f0-9]{32}$/.test(id))) {
    throw new Error("The packaged catalog batch receipt is invalid.");
  }
  return value;
}

export async function runPackagedCatalogBatch(input: {
  runId: string; libraryId: string; spoolId: string; baseUrl: string;
  targetGeneration: number; hostRows: SpoolWithMasterRow[];
  priorReceipt?: CatalogSpoolBatchReceipt | null;
}, dependencies: PackagedCatalogBatchDependencies) {
  const masterId = input.hostRows.find(({ spool }) => spool.id === input.spoolId)?.spool.master_id;
  if (!masterId) throw new Error("The packaged batch source is missing.");
  const request = {
    batch_id: `${input.runId}-catalog-batch`, master_ids: [masterId, masterId],
    initial_weight_g: 500, ownership_type: "BORROWED_IN" as const,
    owner_name: "Packaged batch QA owner", owner_contact: null,
    ownership_note: "Isolated packaged Host-Client batch fixture", location: null,
  };
  const clientBefore = await dependencies.getLibraryDomainRevisions();
  const hostBefore = input.priorReceipt
    ? await dependencies.fetchLibrarySyncDomainRevisions(input.baseUrl, input.libraryId) : null;
  const receipt = requirePackagedBatchReceipt(await dependencies.createCatalogSpoolBatch(request, {
    clientReadOnly: true, clientHostBaseUrl: input.baseUrl,
    clientLibraryId: input.libraryId, clientTargetGeneration: input.targetGeneration,
  }), input.runId);
  if (input.priorReceipt) {
    requirePackagedBatchReceipt(input.priorReceipt, input.runId);
    if (JSON.stringify(receipt) !== JSON.stringify(input.priorReceipt)) {
      throw new Error("The packaged batch replay changed its receipt.");
    }
    const after = await dependencies.fetchLibrarySyncDomainRevisions(input.baseUrl, input.libraryId);
    if (JSON.stringify(after) !== JSON.stringify(hostBefore)) {
      throw new Error("The packaged batch replay changed Host revisions.");
    }
  }
  if (JSON.stringify(await dependencies.getLibraryDomainRevisions()) !== JSON.stringify(clientBefore)) {
    throw new Error("The packaged batch changed Client library revisions.");
  }
  return receipt;
}

export function requirePackagedBatchRows(rows: SpoolWithMasterRow[], receipt: CatalogSpoolBatchReceipt) {
  const batchRows = receipt.spool_ids.map((id) => rows.filter(({ spool }) => spool.id === id));
  if (batchRows.some((matches) => matches.length !== 1 ||
    matches[0]?.spool.initial_weight_g !== 500 || matches[0]?.spool.current_weight_g !== 500 ||
    matches[0]?.spool.ownership_type !== "BORROWED_IN") ||
    batchRows[0]?.[0]?.spool.master_id !== batchRows[1]?.[0]?.spool.master_id) {
    throw new Error("The packaged batch physical rows are invalid.");
  }
}
