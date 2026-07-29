import assert from "node:assert/strict";
import test from "node:test";

import {
  parseUiPerformanceProbeOptions,
} from "./ui-performance-probe";

test("UI performance probe options have conservative non-CI defaults", () => {
  assert.deepEqual(parseUiPerformanceProbeOptions([]), {
    json: false,
    maxGrowthRatio: 3,
    pipelineBudgetMs: 1_000,
    samples: 11,
    snapshotCloneBudgetMs: 250,
    spoolCount: 10_000,
    warmupRuns: 2,
  });
});

test("UI performance probe parses explicit equals and split arguments", () => {
  assert.deepEqual(
    parseUiPerformanceProbeOptions([
      "--json",
      "--spools=12000",
      "--samples",
      "3",
      "--warmup-runs=1",
      "--pipeline-budget-ms",
      "2500",
      "--snapshot-clone-budget-ms=500",
      "--max-growth-ratio",
      "6.5",
    ]),
    {
      json: true,
      maxGrowthRatio: 6.5,
      pipelineBudgetMs: 2_500,
      samples: 3,
      snapshotCloneBudgetMs: 500,
      spoolCount: 12_000,
      warmupRuns: 1,
    },
  );
});

test("UI performance probe rejects invalid numeric options", () => {
  assert.throws(
    () => parseUiPerformanceProbeOptions(["--samples=1.5"]),
    /--samples must be an integer/,
  );
  assert.throws(
    () => parseUiPerformanceProbeOptions(["--spools=0"]),
    /--spools must be a positive number/,
  );
  assert.throws(
    () => parseUiPerformanceProbeOptions(["--max-growth-ratio=not-a-number"]),
    /--max-growth-ratio must be a positive number/,
  );
});
