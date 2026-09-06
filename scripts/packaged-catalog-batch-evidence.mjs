import Database from "better-sqlite3";
import { isDeepStrictEqual } from "node:util";
import { currentSchemaVersion } from "./smoke-release-database-upgrade.mjs";
import { assertCatalogSpoolBatchSchema } from "./catalog-spool-batch-schema.mjs";

export const EXPECTED_PACKAGED_CATALOG_BATCH = Object.freeze({
  spools: 2, loans: 2, history_events: 4, receipts: 1, replayed: true,
  replay_revisions_unchanged: true, client_spools: 0, client_loans: 0, client_receipts: 0,
});
const LIBRARY_ID = "packaged_host_client_e2e_library";
const SPOOL_ID = "packaged_host_client_e2e_spool";

function matchesFields(row, fields) {
  return row && Object.entries(fields).every(([key, expected]) => isDeepStrictEqual(row[key], expected));
}
function exactKeys(value, keys) {
  return value && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
export function validatePackagedCatalogBatchSummary(value) {
  if (!exactKeys(value, Object.keys(EXPECTED_PACKAGED_CATALOG_BATCH)) ||
    Object.entries(EXPECTED_PACKAGED_CATALOG_BATCH).some(([key, expected]) => value[key] !== expected)) {
    throw new Error("Packaged catalog batch summary is invalid.");
  }
}
export function validatePackagedCatalogBatchReceipt(value, runId) {
  if (!exactKeys(value, ["batch_id", "spool_ids"]) || value.batch_id !== `${runId}-catalog-batch` ||
    !Array.isArray(value.spool_ids) || value.spool_ids.length !== 2 || new Set(value.spool_ids).size !== 2 ||
    value.spool_ids.some((id) => typeof id !== "string" || !/^spool_[a-f0-9]{32}$/.test(id))) {
    throw new Error("Packaged catalog batch receipt is invalid.");
  }
  return value;
}
export function requirePackagedBatchSchema(database) {
  if (database.pragma("user_version", { simple: true }) !== currentSchemaVersion()) {
    throw new Error("Packaged catalog batch requires the current application schema.");
  }
  return assertCatalogSpoolBatchSchema(database);
}

export function inspectPackagedCatalogBatch(host, client, runId, expectedReceipt) {
  requirePackagedBatchSchema(host);
  requirePackagedBatchSchema(client);
  validatePackagedCatalogBatchReceipt(expectedReceipt, runId);
  const receipts = host.prepare("SELECT * FROM catalog_spool_batches ORDER BY batch_id").all();
  if (receipts.length !== 1 || receipts[0].batch_id !== expectedReceipt.batch_id || receipts[0].library_id !== LIBRARY_ID) {
    throw new Error("Host catalog batch journal is invalid.");
  }
  let request; let receipt;
  try {
    request = JSON.parse(receipts[0].request_json);
    receipt = JSON.parse(receipts[0].receipt_json);
  } catch { throw new Error("Host catalog batch journal JSON is invalid."); }
  validatePackagedCatalogBatchReceipt(receipt, runId);
  if (JSON.stringify(receipt) !== JSON.stringify(expectedReceipt)) {
    throw new Error("Host catalog batch receipt differs from the paired Client receipt.");
  }
  const source = host.prepare("SELECT master_id FROM filament_spools WHERE id = ?").get(SPOOL_ID);
  const expectedRequest = {
    batch_id: `${runId}-catalog-batch`, master_ids: [source?.master_id, source?.master_id],
    initial_weight_g: 500, ownership_type: "BORROWED_IN", owner_name: "Packaged batch QA owner",
    owner_contact: null, ownership_note: "Isolated packaged Host-Client batch fixture", location: null,
  };
  if (!source?.master_id || !exactKeys(request, Object.keys(expectedRequest)) ||
    Object.entries(expectedRequest).some(([key, value]) => JSON.stringify(request[key]) !== JSON.stringify(value))) {
    throw new Error("Host catalog batch request did not preserve duplicate master IDs.");
  }
  const ids = receipt.spool_ids;
  const spools = host.prepare("SELECT * FROM filament_spools WHERE id IN (?, ?) ORDER BY id").all(...ids);
  const loans = host.prepare("SELECT * FROM spool_loans ORDER BY id").all();
  const history = host.prepare("SELECT * FROM spool_history_events WHERE spool_id IN (?, ?) ORDER BY id").all(...ids);
  if (spools.length !== 2 || loans.length !== 2 || history.length !== 4) {
    throw new Error("Host catalog batch physical rolls, loans or history are invalid.");
  }
  for (const id of ids) {
    const spool = spools.find((row) => row.id === id);
    const spoolLoans = loans.filter((row) => row.spool_id === id);
    const loan = spoolLoans[0];
    const events = history.filter((row) => row.spool_id === id);
    if (!matchesFields(spool, {
      master_id: source.master_id, status: "IN_STOCK", ownership_type: request.ownership_type,
      initial_weight_g: request.initial_weight_g, current_weight_g: request.initial_weight_g,
      remaining_g: request.initial_weight_g, owner_name: request.owner_name,
      owner_contact: request.owner_contact, ownership_note: request.ownership_note,
      location_id: null, home_location_id: null, deleted_at: null,
    }) || spoolLoans.length !== 1 || !matchesFields(loan, {
      loan_direction: "INBOUND", loan_status: "ACTIVE", grams_out: request.initial_weight_g,
      borrower_name: request.owner_name, counterparty_name: request.owner_name,
      counterparty_contact: request.owner_contact, counterparty_note: request.ownership_note,
      lent_note: request.ownership_note, expected_return_at: null, returned_at: null,
      returned_grams: null, consumed_grams: null, return_note: null,
    }) || !isDeepStrictEqual(events.map((event) => event.event_type).sort(),
      ["BORROWED_IN_REGISTERED", "CREATED"])) {
      throw new Error("Host catalog batch physical rolls, loans or history are invalid.");
    }
    let created; let registered;
    try {
      created = JSON.parse(events.find((event) => event.event_type === "CREATED").payload_json);
      registered = JSON.parse(events.find((event) => event.event_type === "BORROWED_IN_REGISTERED").payload_json);
    } catch { throw new Error("Host catalog batch history payload is invalid."); }
    if (!isDeepStrictEqual(created, { status: "IN_STOCK", ownership_type: request.ownership_type }) ||
      !isDeepStrictEqual(registered, {
        loan_id: loan.id, ownership_type: request.ownership_type, owner_name: request.owner_name,
        owner_contact: request.owner_contact, ownership_note: request.ownership_note,
        loan_direction: "INBOUND", counterparty_name: request.owner_name, grams_out: request.initial_weight_g,
      })) {
      throw new Error("Host catalog batch history payload does not match the original registration.");
    }
  }
  const clientState = Object.fromEntries(["filament_spools", "spool_loans", "spool_history_events", "catalog_spool_batches"]
    .map((table) => [table, client.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
  if (clientState.filament_spools.length !== 1 || clientState.filament_spools[0].id !== SPOOL_ID ||
    clientState.spool_loans.length !== 0 || clientState.catalog_spool_batches.length !== 0 ||
    clientState.spool_history_events.length !== 1) {
    throw new Error("Client local inventory was changed by a Host catalog batch.");
  }
  return { receipts, spools, loans, history, clientState };
}

// Capture only after both pair-phase processes have stopped. Keep row data in
// private process memory; sanitized manifests contain the fixed counts above.
export function capturePackagedCatalogBatch(context, receipt) {
  let host; let client;
  try {
    host = new Database(context.hostDatabasePath, { readonly: true, fileMustExist: true });
    client = new Database(context.clientDatabasePath, { readonly: true, fileMustExist: true });
    return inspectPackagedCatalogBatch(host, client, context.runId, receipt);
  } finally {
    try { client?.close(); } finally { host?.close(); }
  }
}

export function verifyPackagedCatalogBatchReplay(current, baseline) {
  if (!baseline || JSON.stringify(current) !== JSON.stringify(baseline)) {
    throw new Error("Host catalog batch or Client shadow changed across restart replay.");
  }
  return { ...EXPECTED_PACKAGED_CATALOG_BATCH };
}
