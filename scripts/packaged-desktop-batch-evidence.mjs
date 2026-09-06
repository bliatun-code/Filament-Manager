import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { assertCatalogSpoolBatchSchema } from "./catalog-spool-batch-schema.mjs";

function requireEvidence(condition, message) {
  if (!condition) throw new Error(`Packaged desktop catalog batch ${message}.`);
}

export function validateDesktopBatchEvidence(evidence, runId) {
  const request = evidence?.request;
  const receipt = evidence?.receipt;
  requireEvidence(request && receipt, "evidence is missing");
  requireEvidence(isDeepStrictEqual(Object.keys(evidence).sort(), ["receipt", "request"]), "evidence fields are invalid");
  requireEvidence(isDeepStrictEqual(Object.keys(request).sort(), [
    "batch_id", "initial_weight_g", "location", "master_ids", "owner_contact", "owner_name", "ownership_note", "ownership_type",
  ]), "request fields are invalid");
  requireEvidence(request.batch_id === `${runId}-catalog-batch`
    && Array.isArray(request.master_ids) && request.master_ids.length === 2
    && typeof request.master_ids[0] === "string" && request.master_ids[0].trim().length > 0
    && request.master_ids[0] === request.master_ids[1]
    && request.initial_weight_g === 640 && request.ownership_type === "BORROWED_IN"
    && request.owner_name === "Packaged desktop E2E lender"
    && request.owner_contact === "desktop-batch@example.invalid"
    && request.ownership_note === "Isolated packaged desktop batch fixture"
    && request.location === "Private packaged desktop QA", "original request is invalid");
  requireEvidence(isDeepStrictEqual(Object.keys(receipt).sort(), ["batch_id", "spool_ids"])
    && receipt.batch_id === request.batch_id && Array.isArray(receipt.spool_ids)
    && receipt.spool_ids.length === 2 && new Set(receipt.spool_ids).size === 2
    && receipt.spool_ids.every(id => typeof id === "string" && /^spool_[0-9a-f]{32}$/.test(id)), "receipt is invalid");
  return evidence;
}

function fullBusinessSnapshot(database) {
  // Only seed-managed catalog metadata is excluded. Keep complete settings,
  // business, history, revision and journal rows so a replay cannot hide writes.
  const names = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map(row => row.name).filter(name => name !== "filament_master_list");
  for (const required of ["settings", "filament_spools", "spool_loans", "spool_history_events", "library_domain_revisions", "catalog_spool_batches"]) {
    requireEvidence(names.includes(required), `snapshot is missing ${required}`);
  }
  const tables = names.map(name => {
    const rows = database.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all();
    const normalized = rows.map(row => JSON.stringify(Object.fromEntries(Object.entries(row)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, Buffer.isBuffer(value) ? { blob: value.toString("base64") } : value])))).sort();
    return [name, normalized];
  });
  return createHash("sha256").update(JSON.stringify(tables)).digest("hex");
}

export function inspectDesktopBatchEvidence(database, evidence, runId) {
  validateDesktopBatchEvidence(evidence, runId);
  const {request, receipt} = evidence;
  const schema = assertCatalogSpoolBatchSchema(database);
  requireEvidence(schema.receiptCount === 1, "must have exactly one durable journal receipt");
  const journal = database.prepare("SELECT * FROM catalog_spool_batches WHERE batch_id = ?").get(request.batch_id);
  const libraryId = database.prepare("SELECT value FROM settings WHERE key = 'library_sync_library_id'").get()?.value;
  requireEvidence(journal && typeof libraryId === "string" && libraryId.length > 0
    && journal.library_id === libraryId, "journal library binding is invalid");
  requireEvidence(isDeepStrictEqual(JSON.parse(journal.request_json), request)
    && isDeepStrictEqual(JSON.parse(journal.receipt_json), receipt)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(journal.created_at), "journal contents do not match the original evidence");
  const original = database.prepare("SELECT master_id FROM filament_spools WHERE id = 'packaged_e2e_spool'").get();
  requireEvidence(original?.master_id === request.master_ids[0], "did not use the existing QA master twice");
  requireEvidence(database.prepare("SELECT COUNT(*) AS count FROM filament_spools").get().count === 3
    && database.prepare("SELECT COUNT(*) AS count FROM spool_loans").get().count === 3,
  "added unexpected spool or loan rows");

  for (const [index, id] of receipt.spool_ids.entries()) {
    const spool = database.prepare("SELECT * FROM filament_spools WHERE id = ?").get(id);
    requireEvidence(spool && spool.master_id === request.master_ids[index] && spool.status === "IN_STOCK"
      && spool.ownership_type === "BORROWED_IN" && spool.owner_name === request.owner_name
      && spool.owner_contact === request.owner_contact && spool.ownership_note === request.ownership_note
      && spool.initial_weight_g === 640 && spool.current_weight_g === 640 && spool.remaining_g === 640
      && spool.deleted_at === null && typeof spool.location_id === "string"
      && spool.location_id === spool.home_location_id, "borrowed spool fields are invalid");
    const location = database.prepare("SELECT name, type FROM inventory_locations WHERE id = ?").get(spool.location_id);
    requireEvidence(location?.name === request.location && ["GENERIC", "SHELF"].includes(location.type), "borrowed spool home/current location is invalid");
    const loans = database.prepare("SELECT * FROM spool_loans WHERE spool_id = ?").all(id);
    const loan = loans[0];
    requireEvidence(loans.length === 1 && loan.loan_direction === "INBOUND" && loan.loan_status === "ACTIVE"
      && loan.counterparty_name === request.owner_name && loan.counterparty_contact === request.owner_contact
      && loan.counterparty_note === request.ownership_note && loan.grams_out === 640
      && loan.returned_at === null && loan.returned_grams === null && loan.consumed_grams === null,
    "requires exactly one original active inbound loan per roll");
    const history = database.prepare("SELECT * FROM spool_history_events WHERE spool_id = ? ORDER BY event_type").all(id);
    requireEvidence(history.length === 2
      && isDeepStrictEqual(history.map(row => row.event_type), ["BORROWED_IN_REGISTERED", "CREATED"]),
    "requires exactly one creation and inbound-loan history event per roll");
    requireEvidence(isDeepStrictEqual(JSON.parse(history[0].payload_json), {
      loan_id:loan.id,ownership_type:"BORROWED_IN",owner_name:request.owner_name,
      owner_contact:request.owner_contact,ownership_note:request.ownership_note,
      loan_direction:"INBOUND",counterparty_name:request.owner_name,grams_out:640,
    }) && isDeepStrictEqual(JSON.parse(history[1].payload_json), {status:"IN_STOCK",ownership_type:"BORROWED_IN"}),
    "history payload does not preserve the original loan and registration");
  }
  return {spools:2,loans:2,state_snapshot_sha256:fullBusinessSnapshot(database)};
}
