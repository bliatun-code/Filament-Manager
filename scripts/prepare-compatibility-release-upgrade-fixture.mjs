#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Database from "better-sqlite3";
import {
  assertPrivateFixturePlatform,
  hardenPrivateFixturePath,
  prepareReleaseUpgradeFixture,
  publishPrivateFixtureNoReplace,
} from "./prepare-release-upgrade-fixture.mjs";
import {
  assertReleaseUpgradeFixtureSanitized,
  RELEASE_UPGRADE_LIBRARY_ID,
} from "./release-upgrade-fixture-contract.mjs";

export const COMPATIBILITY_RELEASE = "v0.30.0";
export const COMPATIBILITY_COMMIT = "7d2eb3a45fc78a60ad31cb88e178ba266d044c5b";
export const COMPATIBILITY_SCHEMA = 7;
// Independently checked against the SQL blobs in the immutable release commit.
// Do not derive these pins from today's migration manifest.
export const COMPATIBILITY_SOURCE_HASHES = Object.freeze({
  "src/database/schema.sql": "0d4e28c83c7fcce7b4b57af537c7b5ad340d2ae1cd0f87900c2e629bef2db2b0",
  "src/database/migrations/003_library_domain_revisions.sql": "e5e0674e7a8ee6f0a186498340dce2e42ca3babc60bdc90c10b5da88a468423e",
  "src/database/migrations/004_inventory_location_objects.sql": "e13b115bfeb21acc9d0a5d4feafa3669bc666262a5d3a7e6500b4b705e6c9b81",
  "src/database/migrations/005_purchase_receipt_metadata.sql": "6cc624a43992226e881330069ac177014ef60a15df3110e8f380f6a3f0a74af5",
  "src/database/migrations/006_filament_price_standards.sql": "ff24cd05f8839ec7c851d1dd8d6c0cd0297c577d8b4119e5bfed068d929597a1",
  "src/database/migrations/007_catalog_refresh_jobs.sql": "a04e089f866e6e0db24eb478c43607aa8efdeffce0a898d989ac12521463a4d8",
  "src/database/migrations/008_catalog_spool_batches.sql": "9455858171841fe911ec6612cdc47c6c4d5884bcfe34f075847d7f0c79e79e2e",
});
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const START = "2026-01-31T10:00:00.000Z";
const FINISH = "2026-01-31T10:01:00.000Z";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function readCompatibilitySources(sourceRoot = ROOT) {
  return Object.entries(COMPATIBILITY_SOURCE_HASHES).map(([file, hash]) => {
    const bytes = readFileSync(path.resolve(sourceRoot, file));
    assert.equal(sha256(bytes), hash, `Published SQL hash mismatch: ${file}`);
    return bytes.toString("utf8");
  });
}

function fixturePaths(outputPath) {
  if (typeof outputPath !== "string" || !outputPath.trim()) {
    throw new Error("A fixture output path is required.");
  }
  const databasePath = path.resolve(outputPath);
  return { databasePath, manifestPath: `${databasePath}.json` };
}

function assertAbsent(file) {
  try {
    lstatSync(file); // Includes broken symlinks; publishing must never replace them.
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Output already exists: ${file}`);
}

function seedSource(database, sources) {
  sources.forEach((sql, index) => {
    database.exec(sql);
    database.pragma(`user_version = ${index + 1}`);
  });
  database.prepare(`INSERT INTO filament_master_list
    (id, material, filament_name, color_name, catalog_source, created_at, updated_at)
    VALUES (?, 'PLA', 'Compatibility PLA', 'Blue', 'manual', ?, ?)`)
    .run("compat-master", START, START);
  const spool = database.prepare(`INSERT INTO filament_spools
    (id, master_id, status, ownership_type, initial_weight_g, current_weight_g,
     remaining_g, created_at, updated_at)
    VALUES (?, 'compat-master', 'IN_STOCK', 'OWNED', 1200, 1200, 1200, ?, ?)`);
  for (const id of ["compat-spool-1", "compat-spool-2"]) spool.run(id, START, START);
  database.prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
    .run("library_sync_library_id", "compat-library-origin");
  database.prepare(`INSERT INTO catalog_spool_batches
    (batch_id, library_id, request_json, receipt_json, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run("compat-batch-1", "compat-library-origin", JSON.stringify({
      batch_id: "compat-batch-1", master_ids: ["compat-master", "compat-master"],
      initial_weight_g: 1200, ownership_type: "OWNED", owner_name: null,
      owner_contact: null, ownership_note: null, location: null,
    }), JSON.stringify({ batch_id: "compat-batch-1", spool_ids: ["compat-spool-1", "compat-spool-2"] }), START);
  const job = database.prepare(`INSERT INTO catalog_refresh_jobs
    (job_id, authority_key, owner_id, vendor, material, status, started_at, finished_at, result_json, error)
    VALUES (?, ?, ?, 'Bambu', 'PLA', ?, ?, ?, ?, ?)`);
  for (const status of ["RUNNING", "SUCCEEDED", "FAILED"]) {
    job.run(`compat-job-${status.toLowerCase()}`,
      JSON.stringify(["compat-library-origin", 0, "compat-credential-profile"]),
      "compat-process-owner", status, START, status === "RUNNING" ? null : FINISH,
      status === "SUCCEEDED" ? JSON.stringify({
        imported: 2, detected_store: "https://example.invalid/private-store",
        detected_collection: "compat-private-collection", discovered_materials: ["compat-private-material"],
        reactivated_count: 1, discontinued_count: 0, reused_cached_products: null,
        detail_fetches: 2, output: "compat-private-output",
      }) : null, status === "FAILED" ? "compat-private-error" : null);
  }
}

function inspectFixture(databasePath) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    assert.equal(database.pragma("user_version", { simple: true }), COMPATIBILITY_SCHEMA);
    assert.equal(database.pragma("quick_check", { simple: true }), "ok");
    assert.deepEqual(database.pragma("foreign_key_check"), []);
    assertReleaseUpgradeFixtureSanitized(database);
    const counts = {};
    for (const table of ["filament_master_list", "filament_spools", "catalog_refresh_jobs", "catalog_spool_batches"]) {
      counts[table] = database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count;
    }
    assert.deepEqual(Object.values(counts), [1, 2, 3, 1], "Representative fixture counts changed");
    const batch = database.prepare("SELECT * FROM catalog_spool_batches").get();
    assert.equal(batch.batch_id, "compat-batch-1");
    assert.equal(batch.library_id, RELEASE_UPGRADE_LIBRARY_ID);
    const request = JSON.parse(batch.request_json);
    const receipt = JSON.parse(batch.receipt_json);
    assert.deepEqual(request.master_ids, ["compat-master", "compat-master"]);
    assert.deepEqual(receipt.spool_ids, ["compat-spool-1", "compat-spool-2"]);
    assert.equal(request.initial_weight_g, 1200);
    assert.equal(request.ownership_type, "OWNED");
    for (const field of ["owner_name", "owner_contact", "ownership_note", "location"]) {
      assert.equal(request[field], null);
    }
    for (const [index, id] of receipt.spool_ids.entries()) {
      const spool = database.prepare("SELECT * FROM filament_spools WHERE id = ?").get(id);
      assert.ok(spool, `Receipt spool missing: ${id}`);
      assert.equal(spool.master_id, request.master_ids[index]);
      assert.equal(spool.ownership_type, request.ownership_type);
      assert.equal(spool.status, "IN_STOCK");
      for (const field of ["owner_name", "owner_contact", "ownership_note", "location_id", "home_location_id"]) {
        assert.equal(spool[field], null);
      }
      for (const field of ["initial_weight_g", "current_weight_g", "remaining_g"]) {
        assert.equal(spool[field], request.initial_weight_g, `Receipt weight mismatch: ${field}`);
      }
    }
    assert.deepEqual(database.prepare("SELECT job_id, status FROM catalog_refresh_jobs ORDER BY job_id").all(), [
      { job_id: "compat-job-failed", status: "FAILED" },
      { job_id: "compat-job-running", status: "INTERRUPTED" },
      { job_id: "compat-job-succeeded", status: "SUCCEEDED" },
    ]);
    return counts;
  } finally {
    database.close();
  }
}

export function verifyCompatibilityReleaseUpgradeFixture({ outputPath }) {
  const { databasePath, manifestPath } = fixturePaths(outputPath);
  for (const file of [databasePath, manifestPath]) {
    assert.ok(lstatSync(file).isFile(), `Expected regular fixture file: ${file}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.format, "synthetic-release-compatibility-v1");
  assert.equal(manifest.sourceRelease, COMPATIBILITY_RELEASE);
  assert.equal(manifest.sourceCommit, COMPATIBILITY_COMMIT);
  assert.equal(manifest.sourceSchemaVersion, COMPATIBILITY_SCHEMA);
  assert.equal(manifest.sanitized, true);
  assert.deepEqual(manifest.sourceHashes, COMPATIBILITY_SOURCE_HASHES);
  assert.equal(manifest.databaseSha256, sha256(readFileSync(databasePath)), "Fixture database hash mismatch");
  assert.deepEqual(manifest.counts, inspectFixture(databasePath));
  return { databasePath, manifestPath, manifest };
}

export async function prepareCompatibilityReleaseUpgradeFixture({ outputPath, sourceRoot = ROOT }) {
  const { databasePath, manifestPath } = fixturePaths(outputPath);
  assertAbsent(databasePath);
  assertAbsent(manifestPath);
  const sources = readCompatibilitySources(sourceRoot);
  assertPrivateFixturePlatform();
  mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  const staging = mkdtempSync(path.join(path.dirname(databasePath), ".compatibility-fixture-"));
  const published = [];
  try {
    hardenPrivateFixturePath(staging, 0o700);
    const sourcePath = path.join(staging, "source.sqlite");
    writeFileSync(sourcePath, "", { flag: "wx", mode: 0o600 });
    hardenPrivateFixturePath(sourcePath, 0o600);
    const source = new Database(sourcePath, { fileMustExist: true });
    try {
      source.transaction(() => seedSource(source, sources))();
    } finally {
      source.close();
    }
    const stagedOutput = path.join(staging, "fixture.sqlite");
    const prepared = await prepareReleaseUpgradeFixture({ sourcePath, outputPath: stagedOutput });
    const manifest = {
      format: "synthetic-release-compatibility-v1",
      sourceRelease: COMPATIBILITY_RELEASE, sourceCommit: COMPATIBILITY_COMMIT,
      sourceSchemaVersion: COMPATIBILITY_SCHEMA, sourceHashes: COMPATIBILITY_SOURCE_HASHES,
      sanitized: true, counts: inspectFixture(stagedOutput),
      databaseSha256: sha256(readFileSync(stagedOutput)),
    };
    const stagedManifest = `${stagedOutput}.json`;
    writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    hardenPrivateFixturePath(stagedManifest, 0o600);
    verifyCompatibilityReleaseUpgradeFixture({ outputPath: stagedOutput });
    for (const [from, to] of [[stagedOutput, databasePath], [stagedManifest, manifestPath]]) {
      const identity = lstatSync(from);
      publishPrivateFixtureNoReplace(from, to);
      published.push({ file: to, identity });
    }
    return { ...verifyCompatibilityReleaseUpgradeFixture({ outputPath: databasePath }), sanitization: prepared.sanitization };
  } catch (error) {
    for (const { file, identity } of published.reverse()) {
      try {
        const current = lstatSync(file);
        if (current.dev === identity.dev && current.ino === identity.ino) rmSync(file);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") throw new AggregateError([error, cleanupError], "Fixture preparation and cleanup failed");
      }
    }
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export function parseCompatibilityFixtureOptions(args) {
  const { values, tokens } = parseArgs({ args, strict: true, allowPositionals: false, tokens: true,
    options: { output: { type: "string" }, "source-root": { type: "string" }, verify: { type: "boolean" } } });
  const names = tokens.map((token) => token.name);
  if (new Set(names).size !== names.length) throw new Error("Duplicate fixture option");
  fixturePaths(values.output);
  if (values.verify && values["source-root"] !== undefined) throw new Error("--source-root is only used when preparing a fixture");
  return { outputPath: values.output, sourceRoot: values["source-root"], verify: values.verify ?? false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCompatibilityFixtureOptions(process.argv.slice(2));
    const result = options.verify ? verifyCompatibilityReleaseUpgradeFixture(options)
      : await prepareCompatibilityReleaseUpgradeFixture(options);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
