import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PREVIOUS_RELEASE_COMMIT,
  PREVIOUS_RELEASE_REF,
  PREVIOUS_RELEASE_SCHEMA_VERSION,
  preparePreviousReleaseUpgradeFixture,
  validatePreviousReleaseFixtureOptions,
  verifyPreviousReleaseUpgradeFixture,
} from "./prepare-previous-release-upgrade-fixture.mjs";

const SAME_SCHEMA_MIGRATIONS = [
  ["004_inventory_location_objects.sql", 2, 3],
  ["005_purchase_receipt_metadata.sql", 3, 4],
  ["006_filament_price_standards.sql", 4, 5],
].map(([file, fromSchemaVersion, toSchemaVersion]) => ({
  file,
  fromSchemaVersion,
  sql: readFileSync(path.resolve("src/database/migrations", file), "utf8"),
  toSchemaVersion,
}));

test("previous-release fixture paths are explicit, distinct and no-replace", () => {
  assert.throws(
    () =>
      validatePreviousReleaseFixtureOptions({
        databasePath: "",
        manifestPath: "fixture.json",
        sourcePath: ".",
      }),
    /database path is required/,
  );
  assert.throws(
    () =>
      validatePreviousReleaseFixtureOptions({
        databasePath: "fixture.db",
        manifestPath: "fixture.db",
        sourcePath: ".",
      }),
    /database and manifest paths must differ/,
  );
});

test(
  "v0.28 fixture is sanitized, provenance-bound and gates same-schema compatibility",
  { skip: process.platform === "win32" },
  async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "previous-release-fixture-test-"),
    );
    const databasePath = path.join(directory, "v0.28.0.db");
    const manifestPath = path.join(directory, "v0.28.0.json");
    try {
      const result = await preparePreviousReleaseUpgradeFixture(
        {
          databasePath,
          manifestPath,
          sourcePath: path.resolve("."),
        },
        {
          inspectSource: () => ({
            generatorPath: path.resolve("scripts/create-visual-qa-fixture.mjs"),
            schemaVersion: PREVIOUS_RELEASE_SCHEMA_VERSION,
            structuralMigrations: SAME_SCHEMA_MIGRATIONS,
          }),
          readCurrentSchemaVersion: () => 5,
        },
      );
      assert.equal(result.manifest.sourceRelease, PREVIOUS_RELEASE_REF);
      assert.equal(result.manifest.sourceCommit, PREVIOUS_RELEASE_COMMIT);
      assert.equal(
        result.manifest.sourceSchemaVersion,
        PREVIOUS_RELEASE_SCHEMA_VERSION,
      );
      assert.equal(result.manifest.currentSchemaVersion, 5);
      assert.equal(result.manifest.requiresSchemaMigration, false);
      assert.equal(result.manifest.gateMode, "same-schema-compatibility");
      assert.equal(result.manifest.sanitized, true);
      assert.equal(result.manifest.counts.filament_spools, 8);

      const verified = verifyPreviousReleaseUpgradeFixture({
        databasePath,
        manifestPath,
      });
      assert.deepEqual(verified, result.manifest);

      const tampered = JSON.parse(readFileSync(manifestPath, "utf8"));
      tampered.databaseSha256 = "0".repeat(64);
      writeFileSync(manifestPath, `${JSON.stringify(tampered)}\n`);
      assert.throws(
        () =>
          verifyPreviousReleaseUpgradeFixture({ databasePath, manifestPath }),
        /SHA-256 does not match/,
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  },
);
