import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import Database from "better-sqlite3";
import {
  COMPATIBILITY_COMMIT, COMPATIBILITY_SOURCE_HASHES,
  parseCompatibilityFixtureOptions, prepareCompatibilityReleaseUpgradeFixture,
  readCompatibilitySources, verifyCompatibilityReleaseUpgradeFixture,
} from "./prepare-compatibility-release-upgrade-fixture.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SCRIPT = fileURLToPath(new URL("./prepare-compatibility-release-upgrade-fixture.mjs", import.meta.url));
const privatePreparation = { skip: !["darwin", "linux"].includes(process.platform) };
function directory(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "compatibility-fixture-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function copySources(dir) {
  for (const file of Object.keys(COMPATIBILITY_SOURCE_HASHES)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    copyFileSync(path.join(ROOT, file), path.join(dir, file));
  }
}
async function fixture(t) {
  const dir = directory(t);
  const outputPath = path.join(dir, "fixture.sqlite");
  const result = await prepareCompatibilityReleaseUpgradeFixture({ outputPath });
  return { dir, outputPath, ...result };
}
function updateManifest(result, change) {
  const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
  change(manifest);
  writeFileSync(result.manifestPath, JSON.stringify(manifest));
}
function mutateDatabase(result, sql) {
  const db = new Database(result.outputPath);
  try { db.pragma("foreign_keys = OFF"); db.exec(sql); } finally { db.close(); }
  updateManifest(result, (manifest) => {
    manifest.databaseSha256 = createHash("sha256").update(readFileSync(result.outputPath)).digest("hex");
  });
}

test("published SQL pins are independent of current manifest and Git history", (t) => {
  const dir = directory(t);
  copySources(dir);
  writeFileSync(path.join(dir, "src/database/migrations/manifest.json"), JSON.stringify({ currentSchemaVersion: 99 }));
  assert.equal(readCompatibilitySources(dir).length, 7);
  const source = path.join(dir, "src/database/schema.sql");
  writeFileSync(source, `${readFileSync(source, "utf8")}\n-- changed\n`);
  assert.throws(() => readCompatibilitySources(dir), /Published SQL hash mismatch/);
  rmSync(source);
  assert.throws(() => readCompatibilitySources(dir), /ENOENT/);
});

test("CLI rejects missing, unknown, duplicate and conflicting options", () => {
  for (const args of [[], ["--output="], ["--output=a", "--unknown"], ["--output=a", "--output=b"],
    ["--output=a", "--verify", "--verify"], ["--output=a", "--verify", "--source-root=b"], ["a"]]) {
    assert.throws(() => parseCompatibilityFixtureOptions(args));
  }
  assert.deepEqual(parseCompatibilityFixtureOptions(["--output=a", "--verify"]), {
    outputPath: "a", sourceRoot: undefined, verify: true,
  });
  const child = spawnSync(process.execPath, [SCRIPT, "--output=a", "--bogus"], { encoding: "utf8" });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Unknown option/);
});

test("schema-7 fixture retains representative journals and removes private synthetic metadata", privatePreparation, async (t) => {
  const result = await fixture(t);
  assert.equal(result.manifest.sourceCommit, COMPATIBILITY_COMMIT);
  assert.equal(result.manifest.sourceSchemaVersion, 7);
  assert.deepEqual(result.manifest.counts, {
    filament_master_list: 1, filament_spools: 2, catalog_refresh_jobs: 3, catalog_spool_batches: 1,
  });
  assert.equal(result.sanitization.sanitizedCatalogJobs, 3);
  assert.equal(result.sanitization.interruptedCatalogJobs, 1);
  assert.equal(result.sanitization.sanitizedBatchReceipts, 1);
  for (const file of [result.outputPath, result.manifestPath]) assert.equal(lstatSync(file).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(result.dir).sort(), ["fixture.sqlite", "fixture.sqlite.json"]);
  const bytes = readFileSync(result.outputPath);
  for (const privateText of ["compat-library-origin", "compat-credential-profile", "compat-process-owner",
    "compat-private-", "example.invalid/private-store"]) assert.equal(bytes.includes(Buffer.from(privateText)), false);
  const db = new Database(result.outputPath, { readonly: true });
  try {
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    const running = db.prepare("SELECT * FROM catalog_refresh_jobs WHERE job_id = 'compat-job-running'").get();
    assert.equal(running.status, "INTERRUPTED");
    assert.equal(running.started_at, running.finished_at);
    const success = JSON.parse(db.prepare("SELECT result_json FROM catalog_refresh_jobs WHERE status = 'SUCCEEDED'").get().result_json);
    assert.equal(success.imported, 2);
    assert.equal(success.reactivated_count, 1);
    assert.equal(success.reused_cached_products, null);
    assert.equal(success.detail_fetches, 2);
    const batch = db.prepare("SELECT * FROM catalog_spool_batches").get();
    assert.deepEqual(JSON.parse(batch.request_json).master_ids, ["compat-master", "compat-master"]);
    assert.deepEqual(JSON.parse(batch.receipt_json).spool_ids, ["compat-spool-1", "compat-spool-2"]);
  } finally { db.close(); }
  const before = readFileSync(result.outputPath);
  assert.deepEqual(verifyCompatibilityReleaseUpgradeFixture(result).manifest, result.manifest);
  const child = spawnSync(process.execPath, [SCRIPT, `--output=${result.outputPath}`, "--verify"], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(readFileSync(result.outputPath), before);
});

test("no replacement of database, sidecar or broken symlinks", privatePreparation, async (t) => {
  const dir = directory(t);
  for (const suffix of ["", ".json"]) {
    for (const symlink of [false, true]) {
      const outputPath = path.join(dir, `fixture-${suffix.length}-${symlink}.sqlite`);
      const occupied = `${outputPath}${suffix}`;
      if (symlink) symlinkSync(path.join(dir, "missing"), occupied);
      else writeFileSync(occupied, "existing bytes");
      await assert.rejects(prepareCompatibilityReleaseUpgradeFixture({ outputPath }), /already exists/);
      if (symlink) assert.equal(lstatSync(occupied).isSymbolicLink(), true);
      else assert.equal(readFileSync(occupied, "utf8"), "existing bytes");
      assert.equal(existsSync(`${outputPath}${suffix ? "" : ".json"}`), false);
    }
  }
  assert.equal(readdirSync(dir).some((name) => name.startsWith(".compatibility")), false);
});

test("invalid sources publish nothing", privatePreparation, async (t) => {
  const dir = directory(t);
  copySources(dir);
  writeFileSync(path.join(dir, "src/database/schema.sql"), "invalid SQL");
  const outputPath = path.join(dir, "fixture.sqlite");
  await assert.rejects(prepareCompatibilityReleaseUpgradeFixture({ outputPath, sourceRoot: dir }), /hash mismatch/);
  assert.deepEqual(readdirSync(dir), ["src"]);
});

for (const [name, change] of [
  ["release", (m) => { m.sourceRelease = "v0.28.0"; }],
  ["commit", (m) => { m.sourceCommit = "0".repeat(40); }],
  ["schema", (m) => { m.sourceSchemaVersion = 5; }],
  ["source hashes", (m) => { m.sourceHashes["src/database/schema.sql"] = "0".repeat(64); }],
  ["database hash", (m) => { m.databaseSha256 = "0".repeat(64); }],
  ["counts", (m) => { m.counts.filament_spools = 1; }],
  ["sanitized flag", (m) => { m.sanitized = false; }],
]) {
  test(`verifier rejects altered ${name}`, privatePreparation, async (t) => {
    const result = await fixture(t);
    updateManifest(result, change);
    assert.throws(() => verifyCompatibilityReleaseUpgradeFixture(result));
  });
}

for (const [name, sql] of [
  ["schema", "PRAGMA user_version = 8"],
  ["job identity", "UPDATE catalog_refresh_jobs SET owner_id = 'unsanitized-owner'"],
  ["spool weight", "UPDATE filament_spools SET remaining_g = 100 WHERE id = 'compat-spool-1'"],
  ["receipt spool", `UPDATE catalog_spool_batches SET receipt_json = '{"batch_id":"compat-batch-1","spool_ids":["missing","compat-spool-2"]}'`],
  ["missing job", "DELETE FROM catalog_refresh_jobs WHERE status = 'FAILED'"],
  ["foreign key", "UPDATE filament_spools SET master_id = 'missing'"],
]) {
  test(`updated file hash does not bypass ${name} validation`, privatePreparation, async (t) => {
    const result = await fixture(t);
    mutateDatabase(result, sql);
    const before = readFileSync(result.outputPath);
    assert.throws(() => verifyCompatibilityReleaseUpgradeFixture(result));
    assert.deepEqual(readFileSync(result.outputPath), before);
  });
}


test("a racing sidecar publication preserves its bytes and removes only our database", privatePreparation, async (t) => {
  const dir = directory(t);
  const outputPath = path.join(dir, "fixture.sqlite");
  const preparation = prepareCompatibilityReleaseUpgradeFixture({ outputPath });
  // The shared SQLite backup yields before publishing either final artifact.
  writeFileSync(`${outputPath}.json`, "other publisher", { flag: "wx" });
  await assert.rejects(preparation, /EEXIST/);
  assert.equal(existsSync(outputPath), false);
  assert.equal(readFileSync(`${outputPath}.json`, "utf8"), "other publisher");
  assert.deepEqual(readdirSync(dir), ["fixture.sqlite.json"]);
});
