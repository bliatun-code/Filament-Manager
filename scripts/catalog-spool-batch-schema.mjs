import Database from "better-sqlite3";

const JOURNAL_COLUMNS = Object.freeze([
  "batch_id",
  "library_id",
  "request_json",
  "receipt_json",
  "created_at",
]);

/** The inspected database is read-only; constraint probes use an in-memory clone. */
export function assertCatalogSpoolBatchSchema(database) {
  const definition = database
    .prepare("SELECT type, sql FROM sqlite_master WHERE name = 'catalog_spool_batches'")
    .get();
  if (definition?.type !== "table") {
    throw new Error("Schema 7 requires the catalog_spool_batches table.");
  }
  const columns = database.pragma("table_info(catalog_spool_batches)");
  if (
    columns.length !== JOURNAL_COLUMNS.length ||
    columns.some((column, index) =>
      column.name !== JOURNAL_COLUMNS[index] ||
      String(column.type).toUpperCase() !== "TEXT" ||
      column.notnull !== 1 ||
      column.pk !== (index === 0 ? 1 : 0)
    )
  ) {
    throw new Error(
      "catalog_spool_batches must have its five TEXT NOT NULL columns and sole batch_id primary key.",
    );
  }
  const createdAtDefault = String(columns[4].dflt_value ?? "")
    .replaceAll(/\s/g, "");
  if (createdAtDefault !== "strftime('%Y-%m-%dT%H:%M:%SZ','now')") {
    throw new Error("catalog_spool_batches.created_at must retain its UTC timestamp default.");
  }
  for (const column of ["request_json", "receipt_json"]) {
    const constraint = new RegExp(
      `CHECK\\s*\\(\\s*json_valid\\s*\\(\\s*${column}\\s*\\)\\s*\\)`,
      "i",
    );
    if (!constraint.test(String(definition.sql))) {
      throw new Error(`catalog_spool_batches.${column} must enforce JSON validity.`);
    }
  }
  if (database.pragma("foreign_key_list(catalog_spool_batches)").length !== 0) {
    throw new Error("catalog_spool_batches must not have foreign keys that can invalidate replay receipts.");
  }
  const probe = new Database(":memory:");
  try {
    probe.exec(definition.sql);
    const insert = probe.prepare(
      "INSERT INTO catalog_spool_batches (batch_id, library_id, request_json, receipt_json) VALUES (?, 'probe', ?, ?)",
    );
    insert.run("valid", "{}", "{}");
    for (const [batchId, request, receipt] of [
      ["bad-request", "{", "{}"], ["bad-receipt", "{}", "{"],
    ]) {
      let rejected = false;
      try {
        insert.run(batchId, request, receipt);
      } catch (error) {
        if (error.code !== "SQLITE_CONSTRAINT_CHECK") throw error;
        rejected = true;
      }
      if (!rejected) {
        throw new Error("catalog_spool_batches must enforce both JSON checks, not merely mention them in SQL.");
      }
    }
  } finally {
    probe.close();
  }
  const receiptCount = Number(
    database.prepare("SELECT COUNT(*) AS count FROM catalog_spool_batches").get().count,
  );
  return { columns: [...JOURNAL_COLUMNS], receiptCount };
}
