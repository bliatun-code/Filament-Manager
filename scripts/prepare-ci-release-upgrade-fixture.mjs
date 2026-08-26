#!/usr/bin/env node

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  VISUAL_QA_BASELINE_SCHEMA_VERSION,
  createVisualQaFixture,
} from "./create-visual-qa-fixture.mjs";
import { prepareReleaseUpgradeFixture } from "./prepare-release-upgrade-fixture.mjs";
import { currentSchemaVersion } from "./smoke-release-database-upgrade.mjs";

export function validateCiReleaseUpgradeFixtureOptions({ outputPath }) {
  if (typeof outputPath !== "string" || !outputPath.trim()) {
    throw new Error("A CI upgrade fixture output path is required.");
  }
  return { outputPath: path.resolve(outputPath) };
}

export async function prepareCiReleaseUpgradeFixture(options) {
  const { outputPath } = validateCiReleaseUpgradeFixtureOptions(options);
  const expectedCurrentSchemaVersion = currentSchemaVersion();
  if (VISUAL_QA_BASELINE_SCHEMA_VERSION >= expectedCurrentSchemaVersion) {
    throw new Error(
      `CI upgrade fixture schema ${VISUAL_QA_BASELINE_SCHEMA_VERSION} must be older than current schema ${expectedCurrentSchemaVersion}.`,
    );
  }

  mkdirSync(path.dirname(outputPath), { recursive: true });
  const sourceDirectory = mkdtempSync(
    path.join(tmpdir(), "filament-manager-ci-upgrade-source-"),
  );
  const sourcePath = path.join(sourceDirectory, "visual-qa-baseline.db");
  try {
    const sourceFixture = createVisualQaFixture({
      outputPath: sourcePath,
      schemaVersion: VISUAL_QA_BASELINE_SCHEMA_VERSION,
    });
    const preparedFixture = await prepareReleaseUpgradeFixture({
      outputPath,
      sourcePath,
    });
    if (
      preparedFixture.fixture.schemaVersion !==
      VISUAL_QA_BASELINE_SCHEMA_VERSION
    ) {
      throw new Error(
        `Prepared CI upgrade fixture schema ${preparedFixture.fixture.schemaVersion} does not match baseline schema ${VISUAL_QA_BASELINE_SCHEMA_VERSION}.`,
      );
    }
    return {
      ...preparedFixture,
      expectedCounts: sourceFixture.expectedCounts,
      expectedCurrentSchemaVersion,
    };
  } finally {
    rmSync(sourceDirectory, { force: true, recursive: true });
  }
}

function cliOptions(argv) {
  const outputPath = argv
    .find((argument) => argument.startsWith("--output="))
    ?.slice("--output=".length);
  if (argv.some((argument) => !argument.startsWith("--output="))) {
    throw new Error(
      "Usage: node scripts/prepare-ci-release-upgrade-fixture.mjs " +
        "--output=<private-copy>",
    );
  }
  return { outputPath };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await prepareCiReleaseUpgradeFixture(
      cliOptions(process.argv.slice(2)),
    );
    console.log(
      `Prepared sanitized CI upgrade fixture: schema ${result.fixture.schemaVersion}, ` +
        `${result.fixture.counts.filament_spools ?? 0} spool(s), ` +
        `${result.fixture.counts.printers ?? 0} printer(s).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
