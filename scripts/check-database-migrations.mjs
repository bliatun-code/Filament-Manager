#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DATABASE_MIGRATION_DIRECTORY = fileURLToPath(
  new URL("../src/database/migrations", import.meta.url),
);
export const DATABASE_MIGRATION_MANIFEST_PATH = path.join(
  DATABASE_MIGRATION_DIRECTORY,
  "manifest.json",
);
const DATABASE_SCHEMA_SOURCE_PATH = fileURLToPath(
  new URL("../src/backend/database_schema.rs", import.meta.url),
);
const MIGRATION_FILE_PATTERN = /^(\d{3})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const RUST_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} keys must be exactly ${expected.join(", ")}; found ` +
        `${actual.join(", ") || "none"}.`,
    );
  }
}

function strictPositiveInteger(value, label, { allowZero = false } = {}) {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer of at least ${minimum}.`);
  }
  return value;
}

function repositoryFilePath(repositoryRoot, repositoryPath, label) {
  if (
    typeof repositoryPath !== "string" ||
    repositoryPath.length === 0 ||
    repositoryPath.includes("\\") ||
    path.posix.isAbsolute(repositoryPath) ||
    path.posix.normalize(repositoryPath) !== repositoryPath ||
    repositoryPath.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error(`${label} must be a normalized repository-relative path.`);
  }
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(root, ...repositoryPath.split("/"));
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} escapes the repository root.`);
  }
  return resolved;
}

function requireRegularFile(filePath, label) {
  if (
    !existsSync(filePath) ||
    !lstatSync(filePath).isFile() ||
    lstatSync(filePath).isSymbolicLink()
  ) {
    throw new Error(`${label} must be a regular non-symbolic-link file.`);
  }
}

export function extractRustFunctionSource(source, functionName) {
  if (!RUST_IDENTIFIER_PATTERN.test(functionName)) {
    throw new Error(`Invalid Rust function name: ${String(functionName)}.`);
  }
  const signature = new RegExp(`\\bfn\\s+${functionName}\\s*\\(`);
  const match = signature.exec(source);
  if (!match) {
    throw new Error(`Could not find Rust function ${functionName}.`);
  }
  const start = match.index;
  const openingBrace = source.indexOf("{", start);
  if (openingBrace === -1) {
    throw new Error(`Could not find the body of Rust function ${functionName}.`);
  }
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`Could not find the end of Rust function ${functionName}.`);
}

export function rustCurrentSchemaVersion(sourcePath = DATABASE_SCHEMA_SOURCE_PATH) {
  const source = readFileSync(sourcePath, "utf8");
  const match = source.match(
    /CURRENT_SCHEMA_VERSION\s*:\s*i64\s*=\s*(\d+)\s*;/,
  );
  if (!match?.[1]) {
    throw new Error("Could not read CURRENT_SCHEMA_VERSION from Rust.");
  }
  return Number.parseInt(match[1], 10);
}

export function parseRustStructuralMigrationRegistry(source) {
  const baselineMatch = source.match(
    /\bconst BASELINE_SCHEMA_VERSION\s*:\s*i64\s*=\s*(\d+)\s*;/,
  );
  if (!baselineMatch?.[1]) {
    throw new Error("Could not read BASELINE_SCHEMA_VERSION from Rust.");
  }
  const registryMatch = source.match(
    /\bconst STRUCTURAL_MIGRATIONS\s*:\s*&\[StructuralMigration\]\s*=\s*&\[([\s\S]*?)\];/,
  );
  if (!registryMatch?.[1]) {
    throw new Error("Could not read STRUCTURAL_MIGRATIONS from Rust.");
  }
  const entryPattern =
    /StructuralMigration\s*\{\s*from_version:\s*(\d+),\s*name:\s*"([^"]+)",\s*sql:\s*include_str!\("\.\.\/database\/migrations\/([^"]+)"\),\s*to_version:\s*(\d+),\s*\}/g;
  const migrations = [...registryMatch[1].matchAll(entryPattern)].map(
    (match) => {
      if (match[2] !== match[3]) {
        throw new Error(
          `Rust migration name ${match[2]} must match its included file ${match[3]}.`,
        );
      }
      return {
        file: match[2],
        fromSchemaVersion: Number.parseInt(match[1], 10),
        toSchemaVersion: Number.parseInt(match[4], 10),
      };
    },
  );
  if (
    migrations.length === 0 ||
    registryMatch[1].replace(entryPattern, "").replace(/[\s,]/g, "") !== ""
  ) {
    throw new Error(
      "STRUCTURAL_MIGRATIONS must contain only explicit StructuralMigration rows.",
    );
  }
  return {
    baselineSchemaVersion: Number.parseInt(baselineMatch[1], 10),
    migrations,
  };
}

function migrationFiles(migrationDirectory) {
  return readdirSync(migrationDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));
}

function parseManifest(manifestPath) {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read migration manifest: ${manifestPath}`, {
      cause: error,
    });
  }
}

export function validateDatabaseMigrationManifest({
  currentSchemaVersion,
  manifest,
  migrationDirectory,
  repositoryRoot = REPOSITORY_ROOT,
}) {
  assertExactKeys(
    manifest,
    [
      "baselineSchemaVersion",
      "baseline",
      "currentSchemaVersion",
      "formatVersion",
      "migrations",
      "policy",
      "publishedReference",
      "publishedThroughSequence",
    ],
    "Migration manifest",
  );
  if (manifest.formatVersion !== 1 || manifest.policy !== "append-only") {
    throw new Error("Migration manifest must use append-only format version 1.");
  }
  strictPositiveInteger(
    manifest.baselineSchemaVersion,
    "Baseline schema version",
    { allowZero: true },
  );
  assertExactKeys(
    manifest.baseline,
    ["file", "legacyEntrypoint", "normalizationSources", "sha256"],
    "Schema baseline",
  );
  if (manifest.baseline.file !== "schema.sql") {
    throw new Error("Schema baseline file must remain schema.sql.");
  }
  if (!SHA256_PATTERN.test(manifest.baseline.sha256)) {
    throw new Error("Schema baseline must contain a lowercase SHA-256.");
  }
  const baselinePath = path.join(
    migrationDirectory,
    "..",
    manifest.baseline.file,
  );
  requireRegularFile(baselinePath, "Schema baseline");
  const baselineHash = sha256(readFileSync(baselinePath));
  if (baselineHash !== manifest.baseline.sha256) {
    throw new Error(
      `Schema baseline changed: expected SHA-256 ${manifest.baseline.sha256}, ` +
      `found ${baselineHash}. Append a migration instead.`,
    );
  }
  assertExactKeys(
    manifest.baseline.legacyEntrypoint,
    ["file", "function", "sha256"],
    "Legacy baseline entrypoint",
  );
  const entrypoint = manifest.baseline.legacyEntrypoint;
  if (
    entrypoint.file !== "src/backend/database_schema_setup.rs" ||
    entrypoint.function !== "apply_structural_baseline" ||
    !SHA256_PATTERN.test(entrypoint.sha256)
  ) {
    throw new Error(
      "Legacy baseline entrypoint must lock apply_structural_baseline in " +
        "src/backend/database_schema_setup.rs with a lowercase SHA-256.",
    );
  }
  const entrypointPath = repositoryFilePath(
    repositoryRoot,
    entrypoint.file,
    "Legacy baseline entrypoint file",
  );
  requireRegularFile(entrypointPath, "Legacy baseline entrypoint file");
  const setupSource = readFileSync(entrypointPath, "utf8");
  const entrypointSource = extractRustFunctionSource(
    setupSource,
    entrypoint.function,
  );
  const entrypointHash = sha256(entrypointSource);
  if (entrypointHash !== entrypoint.sha256) {
    throw new Error(
      `Legacy baseline entrypoint changed: expected SHA-256 ${entrypoint.sha256}, ` +
        `found ${entrypointHash}. Append a migration instead.`,
    );
  }
  if (
    !Array.isArray(manifest.baseline.normalizationSources) ||
    manifest.baseline.normalizationSources.length === 0
  ) {
    throw new Error("Legacy normalization sources must be a non-empty array.");
  }
  const normalizationFiles = [];
  const normalizationFunctions = [];
  for (const [index, source] of manifest.baseline.normalizationSources.entries()) {
    const label = `Legacy normalization source ${index + 1}`;
    assertExactKeys(source, ["file", "functions", "sha256"], label);
    if (
      !source.file.startsWith("src/backend/database_") ||
      !source.file.endsWith("_schema.rs")
    ) {
      throw new Error(`${label} must be a database schema source file.`);
    }
    if (
      normalizationFiles.length > 0 &&
      source.file <= normalizationFiles.at(-1)
    ) {
      throw new Error(
        "Legacy normalization source files must be unique and sorted.",
      );
    }
    if (!SHA256_PATTERN.test(source.sha256)) {
      throw new Error(`${label} must contain a lowercase SHA-256.`);
    }
    if (!Array.isArray(source.functions) || source.functions.length === 0) {
      throw new Error(`${label} must list at least one function.`);
    }
    const sourcePath = repositoryFilePath(
      repositoryRoot,
      source.file,
      `${label} file`,
    );
    requireRegularFile(sourcePath, `${label} file`);
    const sourceContents = readFileSync(sourcePath, "utf8");
    const sourceHash = sha256(sourceContents);
    if (sourceHash !== source.sha256) {
      throw new Error(
        `${label} changed: expected SHA-256 ${source.sha256}, found ` +
          `${sourceHash}. Append a migration instead.`,
      );
    }
    const uniqueFunctions = new Set(source.functions);
    if (
      uniqueFunctions.size !== source.functions.length ||
      source.functions.some(
        (functionName) => !RUST_IDENTIFIER_PATTERN.test(functionName),
      )
    ) {
      throw new Error(`${label} functions must be unique Rust identifiers.`);
    }
    for (const functionName of source.functions) {
      extractRustFunctionSource(sourceContents, functionName);
      normalizationFunctions.push(functionName);
    }
    normalizationFiles.push(source.file);
  }
  const entrypointCalls = [
    ...entrypointSource.matchAll(/\b(ensure_[a-z0-9_]+)\s*\(/g),
  ].map((match) => match[1]);
  const sortedEntrypointCalls = [...entrypointCalls].sort();
  const sortedNormalizationFunctions = [...normalizationFunctions].sort();
  if (
    new Set(entrypointCalls).size !== entrypointCalls.length ||
    JSON.stringify(sortedEntrypointCalls) !==
      JSON.stringify(sortedNormalizationFunctions)
  ) {
    throw new Error(
      "Legacy baseline entrypoint calls must exactly match the locked " +
        "normalization functions.",
    );
  }
  const runtimeRegistry = parseRustStructuralMigrationRegistry(setupSource);
  if (runtimeRegistry.baselineSchemaVersion !== manifest.baselineSchemaVersion) {
    throw new Error(
      `Rust baseline schema ${runtimeRegistry.baselineSchemaVersion} does not ` +
        `match manifest baseline ${manifest.baselineSchemaVersion}.`,
    );
  }
  strictPositiveInteger(manifest.currentSchemaVersion, "Current schema version");
  if (manifest.currentSchemaVersion !== currentSchemaVersion) {
    throw new Error(
      `Migration manifest ends at schema ${manifest.currentSchemaVersion}, ` +
        `but Rust supports schema ${currentSchemaVersion}.`,
    );
  }
  assertExactKeys(
    manifest.publishedReference,
    ["commit", "ref"],
    "Published migration reference",
  );
  if (!/^v\d+\.\d+\.\d+$/.test(manifest.publishedReference.ref)) {
    throw new Error("Published migration reference must be an exact release tag.");
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.publishedReference.commit)) {
    throw new Error("Published migration reference must pin a full commit SHA.");
  }
  if (!Array.isArray(manifest.migrations) || manifest.migrations.length === 0) {
    throw new Error("Migration manifest must contain at least one migration file.");
  }
  strictPositiveInteger(
    manifest.publishedThroughSequence,
    "Published-through sequence",
  );
  if (manifest.publishedThroughSequence > manifest.migrations.length) {
    throw new Error("Published-through sequence exceeds the migration list.");
  }

  const actualFiles = migrationFiles(migrationDirectory);
  const manifestFiles = [];
  let expectedSchemaVersion = manifest.baselineSchemaVersion;
  let sawSchemaMigration = false;
  for (const [index, migration] of manifest.migrations.entries()) {
    const sequence = index + 1;
    const baseKeys = ["file", "role", "sequence", "sha256"];
    const isSchemaMigration = migration?.role === "schema-migration";
    assertExactKeys(
      migration,
      isSchemaMigration
        ? [...baseKeys, "fromSchemaVersion", "toSchemaVersion"]
        : baseKeys,
      `Migration ${sequence}`,
    );
    if (migration.sequence !== sequence) {
      throw new Error(
        `Migration list must be contiguous: expected sequence ${sequence}, ` +
          `found ${String(migration.sequence)}.`,
      );
    }
    const filenameMatch = String(migration.file).match(MIGRATION_FILE_PATTERN);
    if (!filenameMatch || Number.parseInt(filenameMatch[1], 10) !== sequence) {
      throw new Error(
        `Migration ${sequence} filename must start with ` +
          `${String(sequence).padStart(3, "0")}_ and use a portable SQL name.`,
      );
    }
    if (path.basename(migration.file) !== migration.file) {
      throw new Error(`Migration ${sequence} file must not contain a path.`);
    }
    if (!SHA256_PATTERN.test(migration.sha256)) {
      throw new Error(`Migration ${sequence} must contain a lowercase SHA-256.`);
    }
    if (
      migration.role !== "legacy-unversioned-fixture" &&
      migration.role !== "schema-migration"
    ) {
      throw new Error(`Migration ${sequence} has an unsupported role.`);
    }
    if (migration.role === "legacy-unversioned-fixture") {
      if (sawSchemaMigration) {
        throw new Error("Legacy fixture files must precede schema migrations.");
      }
    } else {
      sawSchemaMigration = true;
      if (
        migration.fromSchemaVersion !== expectedSchemaVersion ||
        migration.toSchemaVersion !== migration.fromSchemaVersion + 1
      ) {
        throw new Error(
          `Schema migration ${migration.file} must advance contiguously from ` +
            `${expectedSchemaVersion} to ${expectedSchemaVersion + 1}.`,
        );
      }
      expectedSchemaVersion = migration.toSchemaVersion;
    }

    const migrationPath = path.join(migrationDirectory, migration.file);
    requireRegularFile(migrationPath, `Migration ${migration.file}`);
    const actualHash = sha256(readFileSync(migrationPath));
    if (actualHash !== migration.sha256) {
      throw new Error(
        `Migration ${migration.file} changed: expected SHA-256 ` +
          `${migration.sha256}, found ${actualHash}. Published migrations ` +
          "are append-only.",
      );
    }
    manifestFiles.push(migration.file);
  }
  if (JSON.stringify(actualFiles) !== JSON.stringify(manifestFiles)) {
    throw new Error(
      `Migration files must match the manifest exactly. Files: ` +
        `${actualFiles.join(", ")}; manifest: ${manifestFiles.join(", ")}.`,
    );
  }
  if (
    !sawSchemaMigration ||
    expectedSchemaVersion !== manifest.currentSchemaVersion
  ) {
    throw new Error(
      `Schema migration sequence ends at ${expectedSchemaVersion}, expected ` +
      `${manifest.currentSchemaVersion}.`,
    );
  }
  const manifestRuntimeMigrations = manifest.migrations
    .filter(({ role }) => role === "schema-migration")
    .map(({ file, fromSchemaVersion, toSchemaVersion }) => ({
      file,
      fromSchemaVersion,
      toSchemaVersion,
    }));
  if (
    JSON.stringify(runtimeRegistry.migrations) !==
    JSON.stringify(manifestRuntimeMigrations)
  ) {
    throw new Error(
      "Rust STRUCTURAL_MIGRATIONS must exactly match schema-migration entries " +
        "in the manifest.",
    );
  }
  return manifest;
}

function runGit(args, { encoding = "utf8", repositoryRoot = REPOSITORY_ROOT } = {}) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding,
    maxBuffer: 10 * 1024 * 1024,
    shell: false,
  });
  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message ||
      String(result.stderr ?? "").trim() ||
      `exit ${String(result.status)}`;
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
  return result.stdout;
}

export function verifyPublishedMigrationReference(
  manifest,
  { repositoryRoot = REPOSITORY_ROOT } = {},
) {
  const { commit, ref } = manifest.publishedReference;
  const resolvedCommit = String(
    runGit(["rev-parse", `${ref}^{commit}`], { repositoryRoot }),
  ).trim();
  if (resolvedCommit !== commit) {
    throw new Error(
      `Published migration tag ${ref} resolves to ${resolvedCommit}, expected ${commit}.`,
    );
  }
  runGit(["merge-base", "--is-ancestor", commit, "HEAD"], { repositoryRoot });
  const baselineRepositoryPath = `src/database/${manifest.baseline.file}`;
  const baselineContents = runGit(
    ["show", `${commit}:${baselineRepositoryPath}`],
    { encoding: null, repositoryRoot },
  );
  if (sha256(baselineContents) !== manifest.baseline.sha256) {
    throw new Error(
      `Schema baseline does not match ${ref} (${commit}). Append a migration instead.`,
    );
  }
  const entrypoint = manifest.baseline.legacyEntrypoint;
  const publishedEntrypointFile = String(
    runGit(["show", `${commit}:${entrypoint.file}`], { repositoryRoot }),
  );
  const publishedEntrypoint = extractRustFunctionSource(
    publishedEntrypointFile,
    entrypoint.function,
  );
  if (sha256(publishedEntrypoint) !== entrypoint.sha256) {
    throw new Error(
      `Legacy baseline entrypoint does not match ${ref} (${commit}). ` +
        "Append a migration instead.",
    );
  }
  for (const source of manifest.baseline.normalizationSources) {
    const publishedSource = runGit(["show", `${commit}:${source.file}`], {
      encoding: null,
      repositoryRoot,
    });
    if (sha256(publishedSource) !== source.sha256) {
      throw new Error(
        `Legacy normalization source ${source.file} does not match ${ref} ` +
          `(${commit}). Append a migration instead.`,
      );
    }
  }
  const referencePrefix = "src/database/migrations/";
  const referenceFiles = String(
    runGit(
      ["ls-tree", "-r", "--name-only", commit, "--", referencePrefix],
      { repositoryRoot },
    ),
  )
    .split(/\r?\n/)
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));
  const publishedMigrations = manifest.migrations.slice(
    0,
    manifest.publishedThroughSequence,
  );
  const expectedReferenceFiles = publishedMigrations.map(
    ({ file }) => `${referencePrefix}${file}`,
  );
  if (
    JSON.stringify(referenceFiles) !== JSON.stringify(expectedReferenceFiles)
  ) {
    throw new Error(
      `Published migration files differ from ${ref}. Reference: ` +
        `${referenceFiles.join(", ")}; manifest: ` +
        `${expectedReferenceFiles.join(", ")}.`,
    );
  }
  for (const migration of publishedMigrations) {
    const repositoryPath = `${referencePrefix}${migration.file}`;
    const contents = runGit(["show", `${commit}:${repositoryPath}`], {
      encoding: null,
      repositoryRoot,
    });
    const referenceHash = sha256(contents);
    if (referenceHash !== migration.sha256) {
      throw new Error(
        `Published migration ${migration.file} does not match ${ref} ` +
          `(${commit}).`,
      );
    }
  }
}

export function checkDatabaseMigrationIntegrity({
  currentSchemaVersion = rustCurrentSchemaVersion(),
  manifestPath = DATABASE_MIGRATION_MANIFEST_PATH,
  migrationDirectory = DATABASE_MIGRATION_DIRECTORY,
  repositoryRoot = REPOSITORY_ROOT,
  verifyPublishedReference = false,
} = {}) {
  const manifest = validateDatabaseMigrationManifest({
    currentSchemaVersion,
    manifest: parseManifest(manifestPath),
    migrationDirectory,
    repositoryRoot,
  });
  if (verifyPublishedReference) {
    verifyPublishedMigrationReference(manifest, { repositoryRoot });
  }
  return manifest;
}

function parseCliOptions(argv) {
  if (
    argv.some((argument) => argument !== "--verify-published-reference")
  ) {
    throw new Error(
      "Usage: node scripts/check-database-migrations.mjs " +
        "[--verify-published-reference]",
    );
  }
  return {
    verifyPublishedReference: argv.includes("--verify-published-reference"),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = checkDatabaseMigrationIntegrity(
      parseCliOptions(process.argv.slice(2)),
    );
    console.log(
      `Database migration integrity ok (${result.migrations.length} files, ` +
        `schema ${result.baselineSchemaVersion} -> ` +
        `${result.currentSchemaVersion}, published through ` +
        `${result.publishedReference.ref}).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
