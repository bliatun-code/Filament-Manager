import assert from "node:assert/strict";
import test from "node:test";
import {
  PackagedCatalogJobScenarioError,
  pairPackagedCatalogJobs,
  recoverPackagedCatalogJobs,
  verifyOfflinePackagedCatalogJobs,
  type PackagedCatalogJobDependencies,
} from "./packaged_catalog_refresh_e2e_scenario";
import type { CatalogRefreshJobSnapshot, StartCatalogRefreshJobInput } from "./tauri_catalog_client";

const context = { runId: "packaged-run", libraryId: "qa-library", baseUrl: "http://127.0.0.1:42780" };
const completeRequest = { job_id: `${context.runId}-catalog-complete`, vendor: "Bambu", material: "PLA" } as const;
const interruptRequest = { job_id: `${context.runId}-catalog-interrupt`, vendor: "eSUN", material: "PETG" } as const;

function snapshot(input: StartCatalogRefreshJobInput, status: CatalogRefreshJobSnapshot["status"]): CatalogRefreshJobSnapshot {
  return {
    ...input, status, started_at: "2026-09-05T10:00:00Z",
    finished_at: status === "RUNNING" ? null : "2026-09-05T10:00:01Z",
    result: status === "SUCCEEDED" ? { imported: 1, reactivated_count: 0, discontinued_count: 0, output: "Synthetic catalog import" } : null,
    error: status === "INTERRUPTED" ? "The Host process stopped." : null,
  };
}

function recoveredDependencies(overrides: Partial<PackagedCatalogJobDependencies> = {}): PackagedCatalogJobDependencies {
  return {
    async startLibrarySyncHostCatalogRefreshJob() { assert.fail("Recovery must not submit a POST"); },
    async getLibrarySyncHostCatalogRefreshJob(baseUrl, libraryId, jobId) {
      assert.equal(baseUrl, context.baseUrl);
      assert.equal(libraryId, context.libraryId);
      if (jobId === completeRequest.job_id) return snapshot(completeRequest, "SUCCEEDED");
      if (jobId === interruptRequest.job_id) return snapshot(interruptRequest, "INTERRUPTED");
      assert.equal(jobId, null);
      return null;
    },
    async delay() { assert.fail("Recovery should read final receipts directly"); },
    ...overrides,
  };
}

test("packaged pair polls a real start, replays identical receipts, and rejects competing jobs", async () => {
  const jobs = new Map<string, CatalogRefreshJobSnapshot>();
  const posts: string[] = [];
  const gets: Array<string | null> = [];
  let delays = 0;
  await pairPackagedCatalogJobs(context, {
    async startLibrarySyncHostCatalogRefreshJob(baseUrl, libraryId, input) {
      assert.equal(baseUrl, context.baseUrl);
      assert.equal(libraryId, context.libraryId);
      posts.push(input.job_id);
      const existing = jobs.get(input.job_id);
      if (existing) return structuredClone(existing);
      if ([...jobs.values()].some((job) => job.status === "RUNNING")) throw new Error("409");
      const job = snapshot(input, "RUNNING");
      jobs.set(input.job_id, job);
      return structuredClone(job);
    },
    async getLibrarySyncHostCatalogRefreshJob(_baseUrl, _libraryId, jobId) {
      gets.push(jobId);
      if (jobId === completeRequest.job_id) jobs.set(jobId, snapshot(completeRequest, "SUCCEEDED"));
      return structuredClone(jobs.get(jobId!) ?? null);
    },
    async delay(milliseconds) { assert.equal(milliseconds, 100); delays += 1; },
  });
  assert.equal(delays, 1);
  assert.equal(jobs.size, 2);
  assert.deepEqual(posts, [completeRequest.job_id, completeRequest.job_id, interruptRequest.job_id, interruptRequest.job_id, `${context.runId}-catalog-conflict`]);
  assert.deepEqual(gets, [completeRequest.job_id, interruptRequest.job_id, interruptRequest.job_id]);
});

test("packaged recovery reads both persisted receipts and active status without any POST", async () => {
  await recoverPackagedCatalogJobs(context, recoveredDependencies());
});

test("packaged recovery rejects missing, stale, wrong-result, and wrongly running receipts", async () => {
  const invalid: Array<{ name: string; complete: CatalogRefreshJobSnapshot | null; interrupt: CatalogRefreshJobSnapshot | null; active?: CatalogRefreshJobSnapshot | null }> = [
    { name: "missing success", complete: null, interrupt: snapshot(interruptRequest, "INTERRUPTED") },
    { name: "stale job", complete: { ...snapshot(completeRequest, "SUCCEEDED"), job_id: "different-run" }, interrupt: snapshot(interruptRequest, "INTERRUPTED") },
    { name: "wrong vendor", complete: { ...snapshot(completeRequest, "SUCCEEDED"), vendor: "eSUN" }, interrupt: snapshot(interruptRequest, "INTERRUPTED") },
    { name: "wrong material", complete: { ...snapshot(completeRequest, "SUCCEEDED"), material: "ABS" }, interrupt: snapshot(interruptRequest, "INTERRUPTED") },
    { name: "wrong import count", complete: { ...snapshot(completeRequest, "SUCCEEDED"), result: { imported: 2, reactivated_count: 0, discontinued_count: 0, output: "wrong" } }, interrupt: snapshot(interruptRequest, "INTERRUPTED") },
    { name: "missing interrupt", complete: snapshot(completeRequest, "SUCCEEDED"), interrupt: null },
    { name: "still running", complete: snapshot(completeRequest, "SUCCEEDED"), interrupt: snapshot(interruptRequest, "RUNNING") },
    { name: "wrongly succeeded", complete: snapshot(completeRequest, "SUCCEEDED"), interrupt: snapshot(interruptRequest, "SUCCEEDED") },
    { name: "missing error", complete: snapshot(completeRequest, "SUCCEEDED"), interrupt: { ...snapshot(interruptRequest, "INTERRUPTED"), error: null } },
    { name: "active job", complete: snapshot(completeRequest, "SUCCEEDED"), interrupt: snapshot(interruptRequest, "INTERRUPTED"), active: snapshot(interruptRequest, "RUNNING") },
  ];
  for (const entry of invalid) {
    await assert.rejects(() => recoverPackagedCatalogJobs(context, recoveredDependencies({
      async getLibrarySyncHostCatalogRefreshJob(_baseUrl, _libraryId, jobId) {
        return jobId === completeRequest.job_id ? entry.complete : jobId === interruptRequest.job_id ? entry.interrupt : entry.active ?? null;
      },
    })), PackagedCatalogJobScenarioError, entry.name);
  }
});

test("packaged offline proof requires both status requests to fail and never starts a job", async () => {
  const ids: Array<string | null> = [];
  await verifyOfflinePackagedCatalogJobs(context, recoveredDependencies({
    async getLibrarySyncHostCatalogRefreshJob(_baseUrl, _libraryId, jobId) {
      ids.push(jobId);
      throw new Error("Host offline");
    },
  }));
  assert.deepEqual(ids, [completeRequest.job_id, interruptRequest.job_id]);
  await assert.rejects(() => verifyOfflinePackagedCatalogJobs(context, recoveredDependencies({
    async getLibrarySyncHostCatalogRefreshJob() { return null; },
  })), /offline catalog job status request unexpectedly succeeded/);
});

test("packaged pair fails when same-ID replay changes a terminal receipt", async () => {
  let starts = 0;
  await assert.rejects(() => pairPackagedCatalogJobs(context, recoveredDependencies({
    async startLibrarySyncHostCatalogRefreshJob(_baseUrl, _libraryId, input) {
      starts += 1;
      return { ...snapshot(input, "SUCCEEDED"), finished_at: starts === 1 ? "2026-09-05T10:00:01Z" : "2026-09-05T10:00:02Z" };
    },
  })), /receipt changed during replay/);
  assert.equal(starts, 2);
});

test("packaged pair bounds status polling and never resubmits a slow job", async () => {
  let starts = 0;
  let polls = 0;
  await assert.rejects(() => pairPackagedCatalogJobs(context, recoveredDependencies({
    async startLibrarySyncHostCatalogRefreshJob(_baseUrl, _libraryId, input) { starts += 1; return snapshot(input, "RUNNING"); },
    async getLibrarySyncHostCatalogRefreshJob() { polls += 1; return snapshot(completeRequest, "RUNNING"); },
    async delay() {},
  })), /success receipt is invalid/);
  assert.equal(starts, 1);
  assert.equal(polls, 200);
});

test("packaged catalog failures replace transport details with a static safe message", async () => {
  await assert.rejects(() => recoverPackagedCatalogJobs(context, recoveredDependencies({
    async getLibrarySyncHostCatalogRefreshJob() { throw new Error("secret pairing=http://host.local/opaque-token"); },
  })), (error: unknown) => {
    assert.ok(error instanceof PackagedCatalogJobScenarioError);
    assert.equal(error.step, "recover-catalog-complete");
    assert.equal(error.message, "The packaged catalog job status request failed.");
    assert.doesNotMatch(error.message, /secret|opaque-token|host\.local/);
    return true;
  });
});
