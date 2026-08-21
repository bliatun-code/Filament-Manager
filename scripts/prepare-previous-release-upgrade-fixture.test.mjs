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

test("v0.27 fixture is sanitized, provenance-bound and explicitly migrates schema 2 to 3", async () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "previous-release-fixture-test-"),
  );
  const databasePath = path.join(directory, "v0.27.0.db");
  const manifestPath = path.join(directory, "v0.27.0.json");
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
        }),
        readCurrentSchemaVersion: () => 3,
      },
    );
    assert.equal(result.manifest.sourceRelease, PREVIOUS_RELEASE_REF);
    assert.equal(result.manifest.sourceCommit, PREVIOUS_RELEASE_COMMIT);
    assert.equal(
      result.manifest.sourceSchemaVersion,
      PREVIOUS_RELEASE_SCHEMA_VERSION,
    );
    assert.equal(result.manifest.currentSchemaVersion, 3);
    assert.equal(result.manifest.requiresSchemaMigration, true);
    assert.equal(result.manifest.gateMode, "schema-migration");
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
});
