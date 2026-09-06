import { createCatalogSpoolBatch } from "./tauri_catalog_spool_batch_client";
import { listSpools } from "./tauri_inventory_client";
import { getLibrarySyncSettings } from "./tauri_library_sync_client";
import { listSpoolLoans } from "./tauri_loan_client";
import type { PackagedDesktopBatchEvidence } from "./tauri_packaged_desktop_e2e_client";

export type PackagedDesktopBatchDependencies = {
  createCatalogSpoolBatch: typeof createCatalogSpoolBatch;
  getLibrarySyncSettings: typeof getLibrarySyncSettings;
  listSpools: typeof listSpools;
  listSpoolLoans: typeof listSpoolLoans;
};

const BATCH_WEIGHT = 640;
const BATCH_OWNER = "Packaged desktop E2E lender";
const BATCH_CONTACT = "desktop-batch@example.invalid";
const BATCH_NOTE = "Isolated packaged desktop batch fixture";
const BATCH_LOCATION = "Private packaged desktop QA";

export function validatePackagedDesktopBatchEvidence(
  evidence: PackagedDesktopBatchEvidence | null | undefined,
  runId: string,
): asserts evidence is PackagedDesktopBatchEvidence {
  const request = evidence?.request;
  const receipt = evidence?.receipt;
  if (!request || !receipt || request.batch_id !== `${runId}-catalog-batch` ||
    !Array.isArray(request.master_ids) || request.master_ids.length !== 2 ||
    typeof request.master_ids[0] !== "string" || !request.master_ids[0].trim() ||
    request.master_ids[0] !== request.master_ids[1] ||
    request.initial_weight_g !== BATCH_WEIGHT || request.ownership_type !== "BORROWED_IN" ||
    request.owner_name !== BATCH_OWNER || request.owner_contact !== BATCH_CONTACT ||
    request.ownership_note !== BATCH_NOTE || request.location !== BATCH_LOCATION ||
    receipt.batch_id !== request.batch_id || !Array.isArray(receipt.spool_ids) ||
    receipt.spool_ids.length !== 2 || new Set(receipt.spool_ids).size !== 2 ||
    receipt.spool_ids.some(id => typeof id !== "string" || !/^spool_[0-9a-f]{32}$/.test(id))) {
    throw new Error("Packaged desktop catalog batch evidence is missing or invalid");
  }
}

async function localTarget(dependencies: PackagedDesktopBatchDependencies) {
  const settings = await dependencies.getLibrarySyncSettings();
  if (!settings || settings.mode === "CLIENT" || !settings.library_id?.trim() ||
    !Number.isSafeInteger(settings.target_generation) || (settings.target_generation ?? -1) < 0) {
    throw new Error("Packaged desktop batch requires the current local library identity");
  }
  return { clientReadOnly:false, clientHostBaseUrl:null,
    clientLibraryId:settings.library_id, clientTargetGeneration:settings.target_generation! };
}

export async function createPackagedDesktopBatch(
  runId: string,
  masterId: string,
  dependencies: PackagedDesktopBatchDependencies,
): Promise<PackagedDesktopBatchEvidence> {
  const request = {
    batch_id:`${runId}-catalog-batch`,master_ids:[masterId,masterId],
    initial_weight_g:BATCH_WEIGHT,ownership_type:"BORROWED_IN" as const,
    owner_name:BATCH_OWNER,owner_contact:BATCH_CONTACT,ownership_note:BATCH_NOTE,location:BATCH_LOCATION,
  };
  const receipt = await dependencies.createCatalogSpoolBatch(request, await localTarget(dependencies));
  const evidence = { request, receipt };
  validatePackagedDesktopBatchEvidence(evidence, runId);
  await validatePackagedDesktopBatchRows(evidence, dependencies);
  return evidence;
}

export async function replayPackagedDesktopBatch(
  evidence: PackagedDesktopBatchEvidence | null | undefined,
  runId: string,
  dependencies: PackagedDesktopBatchDependencies,
): Promise<PackagedDesktopBatchEvidence> {
  validatePackagedDesktopBatchEvidence(evidence, runId);
  // Clone the persisted request; do not reconstruct it from current catalog or form state.
  const original = structuredClone(evidence);
  const replay = await dependencies.createCatalogSpoolBatch(
    structuredClone(original.request), await localTarget(dependencies),
  );
  if (replay.batch_id !== original.receipt.batch_id ||
    JSON.stringify(replay.spool_ids) !== JSON.stringify(original.receipt.spool_ids)) {
    throw new Error("Catalog batch replay did not return the original ordered spool IDs");
  }
  await validatePackagedDesktopBatchRows(original, dependencies);
  return original;
}

async function validatePackagedDesktopBatchRows(
  {request,receipt}: PackagedDesktopBatchEvidence,
  dependencies: PackagedDesktopBatchDependencies,
) {
  const [spools,loans] = await Promise.all([
    dependencies.listSpools(500,0),dependencies.listSpoolLoans(500,true,"INBOUND"),
  ]);
  for (const [index,id] of receipt.spool_ids.entries()) {
    const matches = spools.filter(row => row.spool.id === id);
    const row = matches[0];
    const spool = row?.spool;
    if (matches.length !== 1 || !spool || spool.master_id !== request.master_ids[index] ||
      spool.status !== "IN_STOCK" || spool.ownership_type !== "BORROWED_IN" ||
      spool.owner_name !== request.owner_name || spool.owner_contact !== request.owner_contact ||
      spool.ownership_note !== request.ownership_note || spool.initial_weight_g !== BATCH_WEIGHT ||
      spool.current_weight_g !== BATCH_WEIGHT || spool.remaining_g !== BATCH_WEIGHT ||
      !spool.location_id || spool.home_location_id !== spool.location_id ||
      row.location_name !== request.location || row.home_location_name !== request.location) {
      throw new Error("The packaged borrowed batch spool state is invalid");
    }
    const matchingLoans = loans.filter(({loan}) => loan.spool_id === id);
    const loan = matchingLoans[0]?.loan;
    if (matchingLoans.length !== 1 || !loan?.id || loan.loan_direction !== "INBOUND" ||
      loan.loan_status !== "ACTIVE" || loan.counterparty_name !== request.owner_name ||
      loan.counterparty_contact !== request.owner_contact || loan.grams_out !== BATCH_WEIGHT ||
      loan.returned_at != null) {
      throw new Error("The packaged borrowed batch requires exactly one active inbound loan per roll");
    }
  }
}

export function validatePackagedDesktopBatchBackup(
  tables: Record<string, Record<string, unknown>[]>,
  evidence: PackagedDesktopBatchEvidence,
) {
  if (Object.hasOwn(tables,"catalog_spool_batches")) {
    throw new Error("Portable backup must not contain the installation-local batch journal");
  }
  for (const id of evidence.receipt.spool_ids) {
    const spools = tables.filament_spools?.filter(row => row.id === id);
    const loans = tables.spool_loans?.filter(row => row.spool_id === id);
    if (spools?.length !== 1 || spools[0]?.master_id !== evidence.request.master_ids[0] ||
      spools[0]?.ownership_type !== "BORROWED_IN" || spools[0]?.remaining_g !== BATCH_WEIGHT ||
      loans?.length !== 1 || loans[0]?.loan_direction !== "INBOUND" ||
      loans[0]?.loan_status !== "ACTIVE" || loans[0]?.grams_out !== BATCH_WEIGHT) {
      throw new Error("The full backup does not preserve the borrowed catalog batch");
    }
  }
}
