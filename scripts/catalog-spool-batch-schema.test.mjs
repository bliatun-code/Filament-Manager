import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import Database from "better-sqlite3";

import { assertCatalogSpoolBatchSchema } from "./catalog-spool-batch-schema.mjs";

const migration = readFileSync(
  new URL("../src/database/migrations/008_catalog_spool_batches.sql", import.meta.url),
  "utf8",
);

test("schema-7 batch gate accepts the published migration without modifying the database", () => {
  const database = new Database(":memory:");
  try {
    database.exec(migration);
    database.pragma("query_only = ON");
    assert.deepEqual(assertCatalogSpoolBatchSchema(database), {
      columns: ["batch_id", "library_id", "request_json", "receipt_json", "created_at"],
      receiptCount: 0,
    });
  } finally {
    database.close();
  }
});

test("schema-7 marker cannot replace a real batch journal", () => {
  for (const sql of ["", "CREATE VIEW catalog_spool_batches AS SELECT 1 AS batch_id"] ) {
    const database = new Database(":memory:");
    try {
      database.exec(`PRAGMA user_version = 7; ${sql}`);
      assert.throws(() => assertCatalogSpoolBatchSchema(database), /requires the catalog_spool_batches table/);
    } finally {
      database.close();
    }
  }
});

test("schema-7 batch gate rejects missing or weakened journal constraints", () => {
  for (const [label, sql, error] of [
    ["missing column", migration.replace("library_id TEXT NOT NULL,", ""), /five TEXT NOT NULL/],
    ["nullable request", migration.replace("request_json TEXT NOT NULL", "request_json TEXT"), /five TEXT NOT NULL/],
    ["wrong type", migration.replace("receipt_json TEXT", "receipt_json BLOB"), /five TEXT NOT NULL/],
    ["no primary key", migration.replace("PRIMARY KEY ", ""), /sole batch_id primary key/],
    ["no JSON check", migration.replace(" CHECK (json_valid(request_json))", ""), /request_json must enforce JSON validity/],
    ["no receipt JSON check", migration.replace(" CHECK (json_valid(receipt_json))", ""), /receipt_json must enforce JSON validity/],
    ["comment pretending to check JSON", migration.replace("CHECK (json_valid(request_json))", "/* CHECK (json_valid(request_json)) */"), /must enforce both JSON checks/],
    ["wrong timestamp default", migration.replace("strftime('%Y-%m-%dT%H:%M:%SZ', 'now')", "'old'"), /UTC timestamp default/],
    ["cascade foreign key", migration.replace("library_id TEXT NOT NULL", "library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE"), /must not have foreign keys/],
  ]) {
    const database = new Database(":memory:");
    try {
      database.exec(sql);
      assert.throws(() => assertCatalogSpoolBatchSchema(database), error, label);
    } finally {
      database.close();
    }
  }
});
