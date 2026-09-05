import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DATABASE_MIGRATION_DIRECTORY,
  DATABASE_MIGRATION_MANIFEST_PATH,
  checkDatabaseMigrationIntegrity,
} from "./check-database-migrations.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function createMigrationTestDirectory() {
  const root = mkdtempSync(
    path.join(tmpdir(), "filament-manager-migration-integrity-"),
  );
  const databaseDirectory = path.join(root, "src", "database");
  const directory = path.join(databaseDirectory, "migrations");
  mkdirSync(directory, { recursive: true });
  const manifest = JSON.parse(
    readFileSync(DATABASE_MIGRATION_MANIFEST_PATH, "utf8"),
  );
  copyFileSync(
    path.join(DATABASE_MIGRATION_DIRECTORY, "..", manifest.baseline.file),
    path.join(databaseDirectory, manifest.baseline.file),
  );
  const lockedRustSources = [
    manifest.baseline.legacyEntrypoint.file,
    ...manifest.baseline.normalizationSources.map(({ file }) => file),
  ];
  for (const sourceFile of lockedRustSources) {
    const destination = path.join(root, ...sourceFile.split("/"));
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(
      path.join(REPOSITORY_ROOT, ...sourceFile.split("/")),
      destination,
    );
  }
  for (const { file } of manifest.migrations) {
    copyFileSync(
      path.join(DATABASE_MIGRATION_DIRECTORY, file),
      path.join(directory, file),
    );
  }
  const manifestPath = path.join(directory, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { directory, manifest, manifestPath, root };
}

function checkFixture({ currentSchemaVersion = 6, directory, manifestPath }) {
  return checkDatabaseMigrationIntegrity({
    currentSchemaVersion,
    manifestPath,
    migrationDirectory: directory,
    repositoryRoot: path.resolve(directory, "..", "..", ".."),
  });
}

function appendRuntimeMigration(
  fixture,
  { file, fromSchemaVersion, toSchemaVersion },
) {
  const setupFile = fixture.manifest.baseline.legacyEntrypoint.file;
  const setupPath = path.join(fixture.root, ...setupFile.split("/"));
  const source = readFileSync(setupPath, "utf8");
  const registryStart = source.indexOf("const STRUCTURAL_MIGRATIONS");
  const registryEnd = source.indexOf("];", registryStart);
  assert.notEqual(registryStart, -1, "fixture must contain the Rust registry");
  assert.notEqual(registryEnd, -1, "fixture Rust registry must be terminated");
  const row = `, StructuralMigration {
    from_version: ${fromSchemaVersion},
    name: "${file}",
    sql: include_str!("../database/migrations/${file}"),
    to_version: ${toSchemaVersion},
}`;
  writeFileSync(
    setupPath,
    `${source.slice(0, registryEnd)}${row}${source.slice(registryEnd)}`,
  );
}

test("checked-in database migration manifest is complete and current", () => {
  const manifest = checkDatabaseMigrationIntegrity();
  assert.equal(manifest.policy, "append-only");
  assert.equal(manifest.baselineSchemaVersion, 1);
  assert.equal(manifest.currentSchemaVersion, 6);
  assert.equal(manifest.publishedThroughSequence, 6);
  assert.deepEqual(manifest.publishedReference, {
    ref: "v0.28.0",
    commit: "76cba513eadd5137d6703f9abd1c0452531ef788",
  });
  assert.deepEqual(
    manifest.migrations.map(({ file }) => file),
    [
      "001_init.sql",
      "002_sync_queue.sql",
      "003_library_domain_revisions.sql",
      "004_inventory_location_objects.sql",
      "005_purchase_receipt_metadata.sql",
      "006_filament_price_standards.sql",
      "007_catalog_refresh_jobs.sql",
    ],
  );
});

test("published migration content cannot be changed", () => {
  const fixture = createMigrationTestDirectory();
  try {
    writeFileSync(
      path.join(fixture.directory, "003_library_domain_revisions.sql"),
      "SELECT 1;\n",
    );
    assert.throws(() => checkFixture(fixture), /changed: expected SHA-256/);
  } finally {
    rmSync(fixture.root, { force: true, recursive: true });
  }
});

test("the published schema baseline cannot absorb new changes", () => {
  const fixture = createMigrationTestDirectory();
  try {
    writeFileSync(
      path.join(fixture.directory, "..", fixture.manifest.baseline.file),
      "CREATE TABLE rewritten_baseline (id INTEGER PRIMARY KEY);\n",
    );
    assert.throws(() => checkFixture(fixture), /Schema baseline changed/);
  } finally {
    rmSync(fixture.root, { force: true, recursive: true });
  }
});

test("legacy baseline DDL helpers cannot absorb new structural changes", () => {
  const fixture = createMigrationTestDirectory();
  try {
    const source = fixture.manifest.baseline.normalizationSources[0];
    const sourcePath = path.join(fixture.root, ...source.file.split("/"));
    writeFileSync(sourcePath, `${readFileSync(sourcePath, "utf8")}\n// drift\n`);
    assert.throws(
      () => checkFixture(fixture),
      /Legacy normalization source 1 changed/,
    );
  } finally {
    rmSync(fixture.root, { force: true, recursive: true });
  }
});

test("legacy baseline entrypoint cannot call new unversioned DDL helpers", () => {
  const fixture = createMigrationTestDirectory();
  try {
    const { file } = fixture.manifest.baseline.legacyEntrypoint;
    const entrypointPath = path.join(fixture.root, ...file.split("/"));
    const contents = readFileSync(entrypointPath, "utf8").replace(
      "    ensure_trusted_lan_schema(conn)?;",
      "    ensure_unversioned_drift_schema(conn)?;\n    ensure_trusted_lan_schema(conn)?;",
    );
    writeFileSync(entrypointPath, contents);
    assert.throws(
      () => checkFixture(fixture),
      /Legacy baseline entrypoint changed/,
    );
  } finally {
    rmSync(fixture.root, { force: true, recursive: true });
  }
});

test("published migrations cannot be deleted or renumbered", () => {
  const deleted = createMigrationTestDirectory();
  try {
    unlinkSync(path.join(deleted.directory, "002_sync_queue.sql"));
    assert.throws(
      () => checkFixture(deleted),
      /Migration .* must be a regular|match the manifest/,
    );
  } finally {
    rmSync(deleted.root, { force: true, recursive: true });
  }

  const renumbered = createMigrationTestDirectory();
  try {
    renameSync(
      path.join(renumbered.directory, "003_library_domain_revisions.sql"),
      path.join(renumbered.directory, "004_library_domain_revisions.sql"),
    );
    assert.throws(
      () => checkFixture(renumbered),
      /Migration .* must be a regular|match the manifest/,
    );
  } finally {
    rmSync(renumbered.root, { force: true, recursive: true });
  }
});

test("a contiguous unpublished migration can be appended", () => {
  const fixture = createMigrationTestDirectory();
  try {
    const filename = "008_test_append.sql";
    const contents = "CREATE TABLE append_only_test (id INTEGER PRIMARY KEY);\n";
    writeFileSync(path.join(fixture.directory, filename), contents);
    fixture.manifest.currentSchemaVersion = 7;
    fixture.manifest.migrations.push({
      sequence: 8,
      file: filename,
      sha256: sha256(contents),
      role: "schema-migration",
      fromSchemaVersion: 6,
      toSchemaVersion: 7,
    });
    appendRuntimeMigration(fixture, {
      file: filename,
      fromSchemaVersion: 6,
      toSchemaVersion: 7,
    });
    writeFileSync(
      fixture.manifestPath,
      `${JSON.stringify(fixture.manifest, null, 2)}\n`,
    );

    const validated = checkFixture({ ...fixture, currentSchemaVersion: 7 });
    assert.equal(validated.migrations.at(-1).file, filename);
    assert.equal(validated.publishedThroughSequence, 6);
  } finally {
    rmSync(fixture.root, { force: true, recursive: true });
  }
});
