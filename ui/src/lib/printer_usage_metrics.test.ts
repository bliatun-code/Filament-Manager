import test from "node:test";
import assert from "node:assert/strict";
import { buildPrinterUsageMetrics } from "./printer_usage_metrics";

const t = (_key: string, fallback = "") => fallback;

test("buildPrinterUsageMetrics keeps printer metric order and formatting stable", () => {
  const metrics = buildPrinterUsageMetrics(
    {
      total_jobs: 12,
      successful_jobs: 10,
      failed_jobs: 2,
      total_used_g: 3456,
      last_job_at: null,
    },
    t,
  );

  assert.deepEqual(
    metrics.map((metric) => [metric.key, metric.label, metric.value]),
    [
      ["jobs", "Jobs", "12"],
      ["success", "Success", "10"],
      ["failed", "Failed", "2"],
      ["used", "Used", "3,456 g"],
    ],
  );

  assert.equal(
    buildPrinterUsageMetrics(
      {
        total_jobs: 1234,
        successful_jobs: 1200,
        failed_jobs: 34,
        total_used_g: 3456.5,
        last_job_at: null,
      },
      t,
      "nb",
    )[3]?.value,
    "3\u00a0456,5 g",
  );
});
