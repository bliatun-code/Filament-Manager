import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

// Markers (1 min), cleanup (1 min), save (5 min), and time for job teardown.
export const cacheSaveReserveMinutes = 10;

export function planRustCacheSave({ startedAtSeconds, jobTimeoutMinutes, nowMs }) {
  if (!Number.isSafeInteger(startedAtSeconds) || startedAtSeconds <= 0 ||
      !Number.isSafeInteger(jobTimeoutMinutes) || jobTimeoutMinutes <= 0 ||
      !Number.isSafeInteger(nowMs) || nowMs < startedAtSeconds * 1000) {
    throw new Error("Invalid CI job clock or timeout; cache saving is disabled.");
  }
  const remainingMs = startedAtSeconds * 1000 + jobTimeoutMinutes * 60_000 - nowMs;
  return {
    canSave: remainingMs >= cacheSaveReserveMinutes * 60_000,
    remainingMinutes: Math.max(0, remainingMs / 60_000),
  };
}

export function runRustCacheSavePlan(args, {
  environment = process.env,
  nowMs = Date.now(),
  writeOutput = console.log,
} = {}) {
  const { values } = parseArgs({
    args,
    options: {
      "job-timeout-minutes": { type: "string" },
      "github-output": { type: "boolean" },
    },
    allowPositionals: false,
  });
  if (values["github-output"] && !environment.GITHUB_OUTPUT?.trim()) {
    throw new Error("GITHUB_OUTPUT is required for GitHub output mode.");
  }
  const plan = planRustCacheSave({
    startedAtSeconds: Number(environment.CI_JOB_STARTED_AT),
    jobTimeoutMinutes: Number(values["job-timeout-minutes"]),
    nowMs,
  });
  if (values["github-output"]) {
    appendFileSync(environment.GITHUB_OUTPUT, `can-save=${plan.canSave}\n`, "utf8");
  }
  writeOutput(`Rust cache: ${plan.remainingMinutes.toFixed(1)} min remaining; ` +
    `${cacheSaveReserveMinutes} min reserved; ${plan.canSave ? "save allowed" : "save skipped"}.`);
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runRustCacheSavePlan(process.argv.slice(2));
  } catch {
    console.error("::warning::Unable to establish the Rust cache save budget; cache saving is disabled.");
    process.exitCode = 1;
  }
}
