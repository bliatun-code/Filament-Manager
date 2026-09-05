import {
  getLibrarySyncHostCatalogRefreshJob,
  startLibrarySyncHostCatalogRefreshJob,
  type CatalogRefreshJobSnapshot,
  type StartCatalogRefreshJobInput,
} from "./tauri_catalog_client";

export type PackagedCatalogJobDependencies = {
  getLibrarySyncHostCatalogRefreshJob: typeof getLibrarySyncHostCatalogRefreshJob;
  startLibrarySyncHostCatalogRefreshJob: typeof startLibrarySyncHostCatalogRefreshJob;
  delay: (milliseconds: number) => Promise<void>;
};

export const packagedCatalogJobTransport = {
  getLibrarySyncHostCatalogRefreshJob,
  startLibrarySyncHostCatalogRefreshJob,
};

type CatalogContext = { runId: string; libraryId: string; baseUrl: string };

export class PackagedCatalogJobScenarioError extends Error {
  readonly step: string;

  constructor(step: string, message: string) {
    super(message);
    this.name = "PackagedCatalogJobScenarioError";
    this.step = step;
  }
}

function fail(step: string, message: string): never {
  throw new PackagedCatalogJobScenarioError(step, message);
}

function requests(context: CatalogContext) {
  return {
    complete: { job_id: `${context.runId}-catalog-complete`, vendor: "Bambu", material: "PLA" },
    interrupt: { job_id: `${context.runId}-catalog-interrupt`, vendor: "eSUN", material: "PETG" },
    conflict: { job_id: `${context.runId}-catalog-conflict`, vendor: "Bambu", material: "PLA" },
  } satisfies Record<string, StartCatalogRefreshJobInput>;
}

function requireJob(
  value: CatalogRefreshJobSnapshot | null,
  request: StartCatalogRefreshJobInput,
  step: string,
): CatalogRefreshJobSnapshot {
  if (
    !value || value.job_id !== request.job_id || value.vendor !== request.vendor ||
    value.material !== request.material || !Number.isFinite(Date.parse(value.started_at))
  ) fail(step, "The packaged catalog job identity is invalid.");
  return value;
}

function requireSucceeded(value: CatalogRefreshJobSnapshot, step: string) {
  if (
    value.status !== "SUCCEEDED" || value.result?.imported !== 1 ||
    value.error !== null || value.finished_at === null ||
    !Number.isFinite(Date.parse(value.finished_at))
  ) fail(step, "The packaged catalog success receipt is invalid.");
}

function requireRunning(value: CatalogRefreshJobSnapshot, step: string) {
  if (
    value.status !== "RUNNING" || value.result !== null ||
    value.error !== null || value.finished_at !== null
  ) fail(step, "The held packaged catalog job is not running.");
}

function receipt(value: CatalogRefreshJobSnapshot) {
  return JSON.stringify([
    value.job_id, value.vendor, value.material, value.status,
    value.started_at, value.finished_at, value.result, value.error,
  ]);
}

async function getJob(
  context: CatalogContext,
  dependencies: PackagedCatalogJobDependencies,
  request: StartCatalogRefreshJobInput,
  step: string,
) {
  let result: CatalogRefreshJobSnapshot | null;
  try {
    result = await dependencies.getLibrarySyncHostCatalogRefreshJob(
      context.baseUrl, context.libraryId, request.job_id,
    );
  } catch {
    fail(step, "The packaged catalog job status request failed.");
  }
  return requireJob(result, request, step);
}

async function startJob(
  context: CatalogContext,
  dependencies: PackagedCatalogJobDependencies,
  request: StartCatalogRefreshJobInput,
  step: string,
) {
  let result: CatalogRefreshJobSnapshot;
  try {
    result = await dependencies.startLibrarySyncHostCatalogRefreshJob(
      context.baseUrl, context.libraryId, request,
    );
  } catch {
    fail(step, "The packaged catalog job start request failed.");
  }
  return requireJob(result, request, step);
}

export async function pairPackagedCatalogJobs(
  context: CatalogContext,
  dependencies: PackagedCatalogJobDependencies,
) {
  const request = requests(context);
  let completed = await startJob(context, dependencies, request.complete, "start-catalog-complete");
  for (let attempt = 0; completed.status === "RUNNING" && attempt < 200; attempt += 1) {
    await dependencies.delay(100);
    completed = await getJob(context, dependencies, request.complete, "poll-catalog-complete");
  }
  requireSucceeded(completed, "verify-catalog-complete");
  const replayed = await startJob(context, dependencies, request.complete, "replay-catalog-complete");
  if (receipt(replayed) !== receipt(completed)) {
    fail("replay-catalog-complete", "The completed catalog job receipt changed during replay.");
  }

  const running = await startJob(context, dependencies, request.interrupt, "start-catalog-interrupt");
  requireRunning(running, "start-catalog-interrupt");
  const observed = await getJob(context, dependencies, request.interrupt, "read-catalog-interrupt");
  requireRunning(observed, "read-catalog-interrupt");
  const runningReplay = await startJob(context, dependencies, request.interrupt, "replay-catalog-interrupt");
  if (receipt(runningReplay) !== receipt(running)) {
    fail("replay-catalog-interrupt", "The running catalog job receipt changed during replay.");
  }
  let rejected = false;
  try {
    await dependencies.startLibrarySyncHostCatalogRefreshJob(
      context.baseUrl, context.libraryId, request.conflict,
    );
  } catch { rejected = true; }
  if (!rejected) fail("reject-catalog-conflict", "A competing packaged catalog job was accepted.");
  // Prove the rejection did not merely coincide with losing the Host connection.
  const afterConflict = await getJob(context, dependencies, request.interrupt, "verify-catalog-single-flight");
  requireRunning(afterConflict, "verify-catalog-single-flight");
  if (receipt(afterConflict) !== receipt(running)) {
    fail("verify-catalog-single-flight", "The running catalog job changed after a competing start.");
  }
}

export async function verifyOfflinePackagedCatalogJobs(
  context: CatalogContext,
  dependencies: PackagedCatalogJobDependencies,
) {
  const request = requests(context);
  for (const input of [request.complete, request.interrupt]) {
    let failed = false;
    try {
      await dependencies.getLibrarySyncHostCatalogRefreshJob(
        context.baseUrl, context.libraryId, input.job_id,
      );
    } catch { failed = true; }
    if (!failed) fail("reject-offline-catalog-status", "An offline catalog job status request unexpectedly succeeded.");
  }
}

export async function recoverPackagedCatalogJobs(
  context: CatalogContext,
  dependencies: PackagedCatalogJobDependencies,
) {
  const request = requests(context);
  const completed = await getJob(context, dependencies, request.complete, "recover-catalog-complete");
  requireSucceeded(completed, "recover-catalog-complete");
  const interrupted = await getJob(context, dependencies, request.interrupt, "recover-catalog-interrupt");
  if (
    interrupted.status !== "INTERRUPTED" || interrupted.result !== null ||
    !interrupted.error?.trim() || interrupted.finished_at === null ||
    !Number.isFinite(Date.parse(interrupted.finished_at))
  ) fail("recover-catalog-interrupt", "The interrupted packaged catalog job receipt is invalid.");
  let active: CatalogRefreshJobSnapshot | null;
  try {
    active = await dependencies.getLibrarySyncHostCatalogRefreshJob(
      context.baseUrl, context.libraryId, null,
    );
  } catch {
    fail("recover-catalog-active", "The active catalog job status request failed after restart.");
  }
  if (active !== null) fail("recover-catalog-active", "A catalog job remained active after Host restart.");
}
