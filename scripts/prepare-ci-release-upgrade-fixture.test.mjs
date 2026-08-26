import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { VISUAL_QA_BASELINE_SCHEMA_VERSION } from "./create-visual-qa-fixture.mjs";
import {
  prepareCiReleaseUpgradeFixture,
  validateCiReleaseUpgradeFixtureOptions,
} from "./prepare-ci-release-upgrade-fixture.mjs";
import {
  RELEASE_UPGRADE_FIXTURE_MARKER_KEY,
  RELEASE_UPGRADE_FIXTURE_MARKER_VALUE,
  assertReleaseUpgradeFixtureSanitized,
} from "./release-upgrade-fixture-contract.mjs";

test("CI upgrade fixture requires an explicit output path", () => {
  assert.throws(
    () => validateCiReleaseUpgradeFixtureOptions({ outputPath: "" }),
    /output path is required/,
  );
  assert.equal(
    validateCiReleaseUpgradeFixtureOptions({ outputPath: "fixture.db" })
      .outputPath,
    path.resolve("fixture.db"),
  );
});

test(
  "CI upgrade fixture reproduces and sanitizes the historical visual-QA baseline",
  { skip: process.platform === "win32" },
  async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "filament-manager-ci-upgrade-test-"),
    );
    const outputPath = path.join(directory, "upgrade-fixture.db");
    try {
      const result = await prepareCiReleaseUpgradeFixture({ outputPath });
      assert.equal(result.outputPath, outputPath);
      assert.equal(
        result.fixture.schemaVersion,
        VISUAL_QA_BASELINE_SCHEMA_VERSION,
      );
      assert.equal(
        result.expectedCurrentSchemaVersion > result.fixture.schemaVersion,
        true,
      );
      assert.equal(
        result.fixture.counts.filament_spools,
        result.expectedCounts.filament_spools,
      );
      assert.equal(statSync(outputPath).mode & 0o777, 0o600);

      const database = new Database(outputPath, {
        fileMustExist: true,
        readonly: true,
      });
      try {
        assertReleaseUpgradeFixtureSanitized(database);
        assert.equal(database.pragma("quick_check", { simple: true }), "ok");
        assert.deepEqual(database.pragma("foreign_key_check"), []);
        assert.equal(
          database.pragma("user_version", { simple: true }),
          VISUAL_QA_BASELINE_SCHEMA_VERSION,
        );
        assert.equal(
          database
            .prepare(
              "SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'library_domain_revisions'",
            )
            .get().count,
          0,
        );
        assert.equal(
          database
            .prepare("SELECT value FROM settings WHERE key = ?")
            .get(RELEASE_UPGRADE_FIXTURE_MARKER_KEY).value,
          RELEASE_UPGRADE_FIXTURE_MARKER_VALUE,
        );
        assert.equal(
          database
            .prepare(
              "SELECT COUNT(*) AS count FROM filament_spools WHERE qr_code IS NOT NULL",
            )
            .get().count,
          0,
        );
      } finally {
        database.close();
      }
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  },
);
