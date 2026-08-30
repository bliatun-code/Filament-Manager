#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { prepareReleaseUpgradeFixture } from "./prepare-release-upgrade-fixture.mjs";
import {
  assertReleaseUpgradeFixtureSanitized,
  RELEASE_UPGRADE_FIXTURE_MARKER_KEY,
  RELEASE_UPGRADE_FIXTURE_MARKER_VALUE,
} from "./release-upgrade-fixture-contract.mjs";
import { currentSchemaVersion } from "./smoke-release-database-upgrade.mjs";

export const PREVIOUS_RELEASE_VERSION = "0.28.0";
export const PREVIOUS_RELEASE_REF = `v${PREVIOUS_RELEASE_VERSION}`;
export const PREVIOUS_RELEASE_COMMIT =
  "76cba513eadd5137d6703f9abd1c0452531ef788";
export const PREVIOUS_RELEASE_SCHEMA_VERSION = 5;

const MANIFEST_FORMAT_VERSION = 1;

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label}: ${filePath}`, { cause: error });
  }
}

function schemaVersionFromRustSource(sourcePath) {
  const source = readFileSync(sourcePath, "utf8");
  const match = source.match(
    /CURRENT_SCHEMA_VERSION\s*:\s*i64\s*=\s*(\d+)\s*;/,
  );
  if (!match?.[1]) {
    throw new Error(`Could not read CURRENT_SCHEMA_VERSION from ${sourcePath}.`);
  }
  return Number.parseInt(match[1], 10);
}

function assertRegularFile(filePath, label) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new Error(`${label} is missing: ${filePath}`);
  }
}

export function validatePreviousReleaseFixtureOptions({
  databasePath,
  manifestPath,
  sourcePath,
}) {
  for (const [label, value] of [
    ["database", databasePath],
    ["manifest", manifestPath],
    ["previous-release source", sourcePath],
  ]) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`A ${label} path is required.`);
    }
  }
  const resolved = {
    databasePath: path.resolve(databasePath),
    manifestPath: path.resolve(manifestPath),
    sourcePath: path.resolve(sourcePath),
  };
  if (resolved.databasePath === resolved.manifestPath) {
    throw new Error("Previous-release fixture database and manifest paths must differ.");
  }
  if (existsSync(resolved.databasePath) || existsSync(resolved.manifestPath)) {
    throw new Error("Previous-release fixture outputs must not already exist.");
  }
  return resolved;
}

function inspectPreviousReleaseSource(sourcePath) {
  const packagePath = path.join(sourcePath, "package.json");
  const schemaPath = path.join(
    sourcePath,
    "src",
    "backend",
    "database_schema.rs",
  );
  const generatorPath = path.join(
    sourcePath,
    "scripts",
    "create-visual-qa-fixture.mjs",
  );
  const migrationManifestPath = path.join(
    sourcePath,
    "src",
    "database",
    "migrations",
    "manifest.json",
  );
  for (const [filePath, label] of [
    [packagePath, "Previous-release package manifest"],
    [schemaPath, "Previous-release Rust database schema"],
    [generatorPath, "Previous-release fixture generator"],
    [migrationManifestPath, "Previous-release migration manifest"],
  ]) {
    assertRegularFile(filePath, label);
  }
  const packageManifest = readJson(packagePath, "previous-release package manifest");
  if (packageManifest.version !== PREVIOUS_RELEASE_VERSION) {
    throw new Error(
      `Expected previous release ${PREVIOUS_RELEASE_VERSION}, found ` +
        `${String(packageManifest.version)}.`,
    );
  }
  const schemaVersion = schemaVersionFromRustSource(schemaPath);
  if (schemaVersion !== PREVIOUS_RELEASE_SCHEMA_VERSION) {
    throw new Error(
      `${PREVIOUS_RELEASE_REF} schema contract changed: expected ` +
      `${PREVIOUS_RELEASE_SCHEMA_VERSION}, found ${schemaVersion}.`,
    );
  }
  const migrationManifest = readJson(
    migrationManifestPath,
    "previous-release migration manifest",
  );
  if (
    migrationManifest.currentSchemaVersion !== schemaVersion ||
    !Array.isArray(migrationManifest.migrations)
  ) {
    throw new Error(
      `${PREVIOUS_RELEASE_REF} migration manifest must end at schema ` +
        `${schemaVersion}.`,
    );
  }
  const structuralMigrations = migrationManifest.migrations
    .filter((migration) => migration?.role === "schema-migration")
    .map((migration) => {
      const migrationPath = path.join(
        sourcePath,
        "src",
        "database",
        "migrations",
        String(migration.file),
      );
      assertRegularFile(
        migrationPath,
        `Previous-release migration ${String(migration.file)}`,
      );
      const sql = readFileSync(migrationPath, "utf8");
      if (
        !Number.isSafeInteger(migration.fromSchemaVersion) ||
        !Number.isSafeInteger(migration.toSchemaVersion) ||
        migration.toSchemaVersion !== migration.fromSchemaVersion + 1 ||
        !/^[0-9a-f]{64}$/.test(String(migration.sha256)) ||
        sha256File(migrationPath) !== migration.sha256
      ) {
        throw new Error(
          `${PREVIOUS_RELEASE_REF} migration ${String(
            migration.file,
          )} failed its sequence or SHA-256 contract.`,
        );
      }
      return {
        file: String(migration.file),
        fromSchemaVersion: migration.fromSchemaVersion,
        sql,
        toSchemaVersion: migration.toSchemaVersion,
      };
    });
  return { generatorPath, schemaVersion, structuralMigrations };
}

function runPreviousReleaseFixtureGenerator({ generatorPath, outputPath, sourcePath }) {
  const result = spawnSync(
    process.execPath,
    [generatorPath, "--out", outputPath],
    {
      cwd: sourcePath,
      encoding: "utf8",
      env: process.env,
      shell: false,
    },
  );
  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message ||
      String(result.stderr ?? "").trim() ||
      String(result.stdout ?? "").trim() ||
      `exit ${String(result.status)}`;
    throw new Error(`Could not generate ${PREVIOUS_RELEASE_REF} fixture: ${detail}`);
  }
  assertRegularFile(
    outputPath,
    `${PREVIOUS_RELEASE_REF} generated fixture database`,
  );
}

function inspectFixtureSchema(databasePath) {
  const database = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  });
  try {
    return Number(database.pragma("user_version", { simple: true }));
  } finally {
    database.close();
  }
}

function upgradeGeneratedFixtureToPreviousReleaseSchema(
  databasePath,
  { schemaVersion, structuralMigrations },
) {
  const database = new Database(databasePath, { fileMustExist: true });
  try {
    const migrate = database.transaction(() => {
      let generatedSchemaVersion = Number(
        database.pragma("user_version", { simple: true }),
      );
      if (generatedSchemaVersion > schemaVersion) {
        throw new Error(
          `${PREVIOUS_RELEASE_REF} generated fixture schema ` +
            `${generatedSchemaVersion} is newer than its code schema ` +
            `${schemaVersion}.`,
        );
      }
      for (const migration of structuralMigrations ?? []) {
        if (migration.toSchemaVersion <= generatedSchemaVersion) {
          continue;
        }
        if (migration.fromSchemaVersion !== generatedSchemaVersion) {
          throw new Error(
            `No ${PREVIOUS_RELEASE_REF} fixture migration path from schema ` +
              `${generatedSchemaVersion} before ${migration.file}.`,
          );
        }
        database.exec(migration.sql);
        generatedSchemaVersion = migration.toSchemaVersion;
        database.pragma(`user_version = ${generatedSchemaVersion}`);
      }
      if (generatedSchemaVersion !== schemaVersion) {
        throw new Error(
          `${PREVIOUS_RELEASE_REF} generated fixture schema ` +
            `${generatedSchemaVersion} does not match its code schema ` +
            `${schemaVersion}.`,
        );
      }
    });
    migrate();
    const quickCheck = database.pragma("quick_check", { simple: true });
    if (quickCheck !== "ok") {
      throw new Error(
        `${PREVIOUS_RELEASE_REF} generated fixture failed SQLite quick_check.`,
      );
    }
  } finally {
    database.close();
  }
}

function writeManifestNoReplace(manifestPath, manifest) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  chmodSync(manifestPath, 0o600);
}

export async function preparePreviousReleaseUpgradeFixture(
  options,
  {
    inspectSource = inspectPreviousReleaseSource,
    readCurrentSchemaVersion = currentSchemaVersion,
  } = {},
) {
  const { databasePath, manifestPath, sourcePath } =
    validatePreviousReleaseFixtureOptions(options);
  const source = inspectSource(sourcePath);
  const expectedCurrentSchemaVersion = readCurrentSchemaVersion();
  if (source.schemaVersion > expectedCurrentSchemaVersion) {
    throw new Error(
      `${PREVIOUS_RELEASE_REF} schema ${source.schemaVersion} is newer than ` +
        `current schema ${expectedCurrentSchemaVersion}.`,
    );
  }

  const workingDirectory = mkdtempSync(
    path.join(tmpdir(), "filament-manager-previous-release-fixture-"),
  );
  const sourceFixturePath = path.join(workingDirectory, "previous-release.db");
  try {
    runPreviousReleaseFixtureGenerator({
      generatorPath: source.generatorPath,
      outputPath: sourceFixturePath,
      sourcePath,
    });
    upgradeGeneratedFixtureToPreviousReleaseSchema(sourceFixturePath, source);
    const generatedSchemaVersion = inspectFixtureSchema(sourceFixturePath);
    if (generatedSchemaVersion !== source.schemaVersion) {
      throw new Error(
        `${PREVIOUS_RELEASE_REF} generated fixture schema ` +
          `${generatedSchemaVersion} does not match its code schema ` +
          `${source.schemaVersion}.`,
      );
    }
    const prepared = await prepareReleaseUpgradeFixture({
      outputPath: databasePath,
      sourcePath: sourceFixturePath,
    });
    const database = new Database(databasePath, {
      fileMustExist: true,
      readonly: true,
    });
    try {
      assertReleaseUpgradeFixtureSanitized(database);
      const marker = database
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get(RELEASE_UPGRADE_FIXTURE_MARKER_KEY)?.value;
      if (marker !== RELEASE_UPGRADE_FIXTURE_MARKER_VALUE) {
        throw new Error("Prepared previous-release fixture marker is missing.");
      }
    } finally {
      database.close();
    }

    const manifest = {
      formatVersion: MANIFEST_FORMAT_VERSION,
      sourceCommit: PREVIOUS_RELEASE_COMMIT,
      sourceRelease: PREVIOUS_RELEASE_REF,
      sourceSchemaVersion: source.schemaVersion,
      currentSchemaVersion: expectedCurrentSchemaVersion,
      requiresSchemaMigration:
        source.schemaVersion < expectedCurrentSchemaVersion,
      gateMode:
        source.schemaVersion < expectedCurrentSchemaVersion
          ? "schema-migration"
          : "same-schema-compatibility",
      databaseSha256: sha256File(databasePath),
      counts: prepared.fixture.counts,
      sanitized: true,
    };
    writeManifestNoReplace(manifestPath, manifest);
    return { databasePath, manifest, manifestPath };
  } catch (error) {
    rmSync(databasePath, { force: true });
    rmSync(manifestPath, { force: true });
    throw error;
  } finally {
    rmSync(workingDirectory, { force: true, recursive: true });
  }
}

export function verifyPreviousReleaseUpgradeFixture({ databasePath, manifestPath }) {
  const resolvedDatabasePath = path.resolve(databasePath);
  const resolvedManifestPath = path.resolve(manifestPath);
  assertRegularFile(resolvedDatabasePath, "Previous-release fixture database");
  assertRegularFile(resolvedManifestPath, "Previous-release fixture manifest");
  const manifest = readJson(
    resolvedManifestPath,
    "previous-release fixture manifest",
  );
  const expected = {
    formatVersion: MANIFEST_FORMAT_VERSION,
    sourceCommit: PREVIOUS_RELEASE_COMMIT,
    sourceRelease: PREVIOUS_RELEASE_REF,
    sourceSchemaVersion: PREVIOUS_RELEASE_SCHEMA_VERSION,
    sanitized: true,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (manifest[key] !== value) {
      throw new Error(
        `Previous-release fixture manifest ${key} must be ${String(value)}.`,
      );
    }
  }
  const expectedCurrentSchemaVersion = currentSchemaVersion();
  if (manifest.currentSchemaVersion !== expectedCurrentSchemaVersion) {
    throw new Error(
      `Previous-release fixture targets schema ${String(
        manifest.currentSchemaVersion,
      )}, but this release targets schema ${expectedCurrentSchemaVersion}.`,
    );
  }
  const requiresSchemaMigration =
    PREVIOUS_RELEASE_SCHEMA_VERSION < expectedCurrentSchemaVersion;
  const gateMode = requiresSchemaMigration
    ? "schema-migration"
    : "same-schema-compatibility";
  if (
    manifest.requiresSchemaMigration !== requiresSchemaMigration ||
    manifest.gateMode !== gateMode
  ) {
    throw new Error(
      "Previous-release fixture migration mode does not match the release schemas.",
    );
  }
  const actualHash = sha256File(resolvedDatabasePath);
  if (manifest.databaseSha256 !== actualHash) {
    throw new Error("Previous-release fixture database SHA-256 does not match its manifest.");
  }
  if (inspectFixtureSchema(resolvedDatabasePath) !== manifest.sourceSchemaVersion) {
    throw new Error("Previous-release fixture database schema does not match its manifest.");
  }
  const database = new Database(resolvedDatabasePath, {
    fileMustExist: true,
    readonly: true,
  });
  try {
    assertReleaseUpgradeFixtureSanitized(database);
  } finally {
    database.close();
  }
  return manifest;
}

function optionValue(argv, name) {
  return argv
    .find((argument) => argument.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function parseCliOptions(argv) {
  const verify = argv.includes("--verify");
  const allowedPrefixes = ["--database=", "--manifest=", "--source="];
  if (
    argv.some(
      (argument) =>
        argument !== "--verify" &&
        !allowedPrefixes.some((prefix) => argument.startsWith(prefix)),
    )
  ) {
    throw new Error(
      "Usage: node scripts/prepare-previous-release-upgrade-fixture.mjs " +
        "--database=<output> --manifest=<output> " +
        "[--source=<v0.28.0-checkout> | --verify]",
    );
  }
  return {
    databasePath: optionValue(argv, "--database"),
    manifestPath: optionValue(argv, "--manifest"),
    sourcePath: optionValue(argv, "--source"),
    verify,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const options = parseCliOptions(process.argv.slice(2));
    if (options.verify) {
      const manifest = verifyPreviousReleaseUpgradeFixture(options);
      console.log(
        `Verified sanitized ${manifest.sourceRelease} fixture: schema ` +
          `${manifest.sourceSchemaVersion}, mode ${manifest.gateMode}.`,
      );
    } else {
      const result = await preparePreviousReleaseUpgradeFixture(options);
      console.log(
        `Prepared sanitized ${result.manifest.sourceRelease} fixture: schema ` +
          `${result.manifest.sourceSchemaVersion}, current schema ` +
          `${result.manifest.currentSchemaVersion}, mode ` +
          `${result.manifest.gateMode}.`,
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
