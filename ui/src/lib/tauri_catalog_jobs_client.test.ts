import assert from "node:assert/strict";
import test from "node:test";
import { appErrorCode } from "./error_text";
import { startManagedCatalogRefreshJob, type CatalogWriteTarget } from "./catalog_writes";
import { startLibrarySyncHostCatalogRefreshJob } from "./tauri_catalog_client";

const calls: Array<{ command: string; payload?: Record<string, unknown> }> = [];
const testWindow = {
  __TAURI__: {
    invoke: async <T>(command: string, payload?: Record<string, unknown>) => {
      calls.push({ command, payload });
      return null as T;
    },
  },
} as unknown as Window & typeof globalThis;
const request = { job_id: "captured-job", vendor: "Bambu", material: "PLA" } as const;

test("Host job invokes preserve the captured generation when the same URL and library return later", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = testWindow;
  calls.length = 0;
  const target: CatalogWriteTarget = {
    clientReadOnly: true,
    clientHostBaseUrl: " http://host-a ",
    clientLibraryId: " library-a ",
    clientTargetGeneration: 1,
  };
  try {
    const capturedStart = startManagedCatalogRefreshJob(request, target);
    target.clientHostBaseUrl = "http://host-b";
    target.clientTargetGeneration = 2;
    target.clientHostBaseUrl = "http://host-a";
    target.clientTargetGeneration = 3;
    await capturedStart;
    await startManagedCatalogRefreshJob({ ...request, job_id: "current-job" }, target);
    assert.deepEqual(calls, [
      {
        command: "start_library_sync_host_catalog_refresh_job",
        payload: { input: { base_url: "http://host-a", expected_library_id: "library-a",
          expected_target_generation: 1, ...request } },
      },
      {
        command: "start_library_sync_host_catalog_refresh_job",
        payload: { input: { base_url: "http://host-a", expected_library_id: "library-a",
          expected_target_generation: 3, ...request, job_id: "current-job" } },
      },
    ]);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("Host job starts reject missing and invalid generations before invoking, while zero remains valid", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = testWindow;
  calls.length = 0;
  try {
    for (const generation of [undefined, null, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(
        startManagedCatalogRefreshJob(request, {
          clientReadOnly: true, clientHostBaseUrl: "http://host-a",
          clientLibraryId: "library-a", clientTargetGeneration: generation,
        }),
        (error: unknown) => appErrorCode(error) === "common.forbidden",
      );
    }
    assert.deepEqual(calls, []);
    await startLibrarySyncHostCatalogRefreshJob("http://host-a", "library-a", request, 0);
    assert.equal(calls.length, 1);
    assert.equal((calls[0].payload?.input as { expected_target_generation: number }).expected_target_generation, 0);
  } finally {
    globalThis.window = previousWindow;
  }
});
