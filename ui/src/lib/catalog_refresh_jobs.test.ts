import assert from "node:assert/strict";
import test from "node:test";
import {
  CatalogRefreshJobController,
  catalogRefreshJobStorageKey,
  catalogRefreshJobTargetKey,
} from "./catalog_refresh_jobs";
import type { CatalogRefreshJobSnapshot, StartCatalogRefreshJobInput } from "./tauri_catalog_client";
import { catalogRefreshJobSessionIdentity } from "./catalog_refresh_job_session";
import { createAppError } from "./error_text";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function job(input: StartCatalogRefreshJobInput, status: CatalogRefreshJobSnapshot["status"] = "RUNNING"): CatalogRefreshJobSnapshot {
  return {
    ...input, status, started_at: "2026-09-05T10:00:00Z",
    finished_at: status === "RUNNING" ? null : "2026-09-05T10:02:00Z",
    result: status === "SUCCEEDED" ? {
      imported: 7, reactivated_count: 0, discontinued_count: 0, output: "Imported seven rows",
    } : null,
    error: status === "FAILED" || status === "INTERRUPTED" ? "Worker interrupted" : null,
  };
}

function fixture(overrides: Partial<ConstructorParameters<typeof CatalogRefreshJobController>[1]> = {}, targetKey = "host-a") {
  const storage = memoryStorage();
  const timers = new Set<() => void>();
  const dependencies: ConstructorParameters<typeof CatalogRefreshJobController>[1] = {
    start: async (input) => job(input),
    get: async () => null,
    storage,
    uuid: () => "request-a",
    schedule: (callback) => { timers.add(callback); return callback; },
    cancel: (timer) => { timers.delete(timer as () => void); },
    ...overrides,
  };
  const controller = new CatalogRefreshJobController(targetKey, dependencies);
  return { controller, dependencies, storage: dependencies.storage, timers };
}

test("persist before POST, reject synchronous double clicks, and keep polling across route unmount", async () => {
  const submitted = deferred<CatalogRefreshJobSnapshot>();
  const completed = deferred<CatalogRefreshJobSnapshot | null>();
  const requests: StartCatalogRefreshJobInput[] = [];
  let status: CatalogRefreshJobSnapshot | null = null;
  const f = fixture({
    start: (input) => {
      assert.equal(JSON.parse(f.storage.getItem(catalogRefreshJobStorageKey("host-a"))!).job_id, input.job_id);
      requests.push(input);
      return submitted.promise;
    },
    get: (id) => id ? completed.promise : Promise.resolve(status),
  });
  await f.controller.checkNow();
  const first = f.controller.start("Bambu", "PLA");
  assert.equal(await f.controller.start("eSUN", "PETG"), false);
  assert.equal(f.controller.snapshot().busy, true);
  status = job(requests[0]);
  submitted.resolve(status);
  await first;
  f.controller.pause();
  assert.equal(f.timers.size, 1);
  const finalStatus = f.controller.checkNow();
  completed.resolve(job(requests[0], "SUCCEEDED"));
  await finalStatus;
  assert.equal(f.controller.snapshot().busy, false);
  assert.equal(f.controller.snapshot().job?.result?.imported, 7);
  assert.equal(f.timers.size, 0);
  assert.equal(requests.length, 1);
  assert.ok(f.storage.getItem(catalogRefreshJobStorageKey("host-a")), "retain completed ID for reload recovery");
});

test("dropped start and status responses retain the pending ID and only retry reads", async () => {
  let posts = 0;
  let online = true;
  let accepted: CatalogRefreshJobSnapshot | null = null;
  const ids: Array<string | null> = [];
  const f = fixture({
    start: async (input) => {
      posts += 1;
      accepted = job(input);
      online = false;
      throw new Error("Response lost");
    },
    get: async (id) => {
      ids.push(id);
      if (!online) throw new Error("Offline");
      return accepted;
    },
  });
  await f.controller.checkNow();
  await f.controller.start("Bambu", "PLA");
  assert.equal(f.controller.snapshot().busy, true);
  assert.equal(f.controller.snapshot().uncertain, true);
  assert.equal(await f.controller.start("Bambu", "PLA"), false);
  await f.controller.checkNow();
  online = true;
  await f.controller.checkNow();
  assert.equal(f.controller.snapshot().job?.job_id, "request-a");
  assert.equal(f.controller.snapshot().uncertain, false);
  assert.equal(posts, 1);
  assert.deepEqual(ids, [null, "request-a", "request-a", "request-a"]);
  f.controller.dispose();
});

test("a new webview recovers the saved job result without submitting another request", async () => {
  const request = { job_id: "saved-job", vendor: "eSUN", material: "PETG" } as const;
  const storage = memoryStorage();
  storage.setItem(catalogRefreshJobStorageKey("host-a"), JSON.stringify(request));
  const ids: Array<string | null> = [];
  const f = fixture({ storage,
    start: async () => { throw new Error("Must never resubmit a restored job"); },
    get: async (id) => { ids.push(id); return job(request, "SUCCEEDED"); },
  });
  assert.equal(f.controller.snapshot().busy, true);
  await f.controller.checkNow();
  assert.deepEqual(ids, ["saved-job"]);
  assert.equal(f.controller.snapshot().job?.vendor, "eSUN");
  assert.equal(f.controller.snapshot().job?.result?.imported, 7);
  assert.equal(f.controller.snapshot().busy, false);
});

test("two clients racing a start adopt the one authoritative job and its actual vendor/material", async () => {
  let active: CatalogRefreshJobSnapshot | null = null;
  let jobsStarted = 0;
  const transport = {
    start: async (input: StartCatalogRefreshJobInput) => {
      if (active) throw new Error("409: catalog refresh already running");
      jobsStarted += 1;
      active = job(input);
      return active;
    },
    get: async (id: string | null) => id && id !== active?.job_id ? null : active,
  };
  const first = fixture({ ...transport, uuid: () => "first" });
  const second = fixture({ ...transport, uuid: () => "second" });
  await Promise.all([first.controller.checkNow(), second.controller.checkNow()]);
  await Promise.all([
    first.controller.start("eSUN", "PETG"),
    second.controller.start("Bambu", "PLA"),
  ]);
  assert.equal(jobsStarted, 1);
  assert.equal(second.controller.snapshot().busy, true);
  assert.deepEqual(second.controller.snapshot().request, { job_id: "first", vendor: "eSUN", material: "PETG" });
  first.controller.dispose();
  second.controller.dispose();
});

test("an idle window discovers another client's active job with read-only polling", async () => {
  const active = job({ job_id: "other", vendor: "eSUN", material: "ABS" });
  const f = fixture({ get: async () => active });
  await f.controller.checkNow();
  assert.equal(f.controller.snapshot().busy, true);
  assert.equal(f.controller.snapshot().job?.job_id, "other");
  assert.equal(await f.controller.start("Bambu", "PLA"), false);
  f.controller.dispose();
});

test("known missing job plus no active job releases the lock without an automatic POST", async () => {
  const f = fixture({ start: async () => { throw new Error("Rejected before acceptance"); } });
  await f.controller.checkNow();
  await f.controller.start("Bambu", "PLA");
  assert.equal(f.controller.snapshot().busy, false);
  assert.match(f.controller.snapshot().error!, /Rejected before acceptance/);
  assert.equal(f.storage.getItem(catalogRefreshJobStorageKey("host-a")), null);
});

test("Host target keys include both URL and library identity but exclude session generation", () => {
  const target = { clientReadOnly: true, clientHostBaseUrl: "http://host-a/", clientLibraryId: "library-a", clientTargetGeneration: 1 };
  assert.equal(catalogRefreshJobTargetKey(target), catalogRefreshJobTargetKey({ ...target, clientHostBaseUrl: "http://host-a", clientTargetGeneration: 3 }));
  assert.notEqual(catalogRefreshJobTargetKey(target), catalogRefreshJobTargetKey({ ...target, clientHostBaseUrl: "http://host-b" }));
  assert.notEqual(catalogRefreshJobTargetKey(target), catalogRefreshJobTargetKey({ ...target, clientLibraryId: "library-b" }));
  assert.equal(catalogRefreshJobTargetKey({ ...target, clientLibraryId: null }), null);
});

test("local job persistence requires library identity and observation waits for a resolved generation", () => {
  const local = { clientReadOnly: false, clientLibraryId: "local-a", clientTargetGeneration: 1 };
  assert.notEqual(catalogRefreshJobTargetKey(local), catalogRefreshJobTargetKey({ ...local, clientLibraryId: "local-b" }));
  assert.equal(catalogRefreshJobTargetKey({ clientReadOnly: false }), null);
  assert.equal(catalogRefreshJobSessionIdentity({ ...local, clientTargetGeneration: null }), null);
  assert.notEqual(catalogRefreshJobSessionIdentity(local), catalogRefreshJobSessionIdentity({ ...local, clientTargetGeneration: 2 }));
  assert.notEqual(catalogRefreshJobTargetKey(local), catalogRefreshJobTargetKey({ ...local, clientTargetGeneration: 2 }));
});

test("an explicit unsupported-Host preflight rejection releases a newly attempted start without polling its ID", async () => {
  const ids: Array<string | null> = [];
  const f = fixture({
    start: async () => { throw createAppError("catalog.refresh.host_unsupported"); },
    get: async (id) => { ids.push(id); throw createAppError("catalog.refresh.host_unsupported"); },
  });
  await f.controller.checkNow();
  assert.equal(f.controller.snapshot().busy, false);
  await f.controller.start("Bambu", "PLA");
  assert.equal(f.controller.snapshot().busy, false);
  assert.equal(f.controller.snapshot().uncertain, false);
  assert.equal(f.storage.getItem(catalogRefreshJobStorageKey("host-a")), null);
  assert.deepEqual(ids, [null]);
});

test("unsupported status cannot discard a restored request that might have been accepted before a Host downgrade", async () => {
  const storage = memoryStorage();
  storage.setItem(catalogRefreshJobStorageKey("host-a"), JSON.stringify({ job_id: "accepted-before-downgrade", vendor: "Bambu", material: "PLA" }));
  const f = fixture({ storage, get: async () => { throw createAppError("catalog.refresh.host_unsupported"); } });
  await f.controller.checkNow();
  assert.equal(f.controller.snapshot().busy, true);
  assert.equal(f.controller.snapshot().uncertain, true);
  assert.ok(storage.getItem(catalogRefreshJobStorageKey("host-a")));
  f.controller.dispose();
});

test("disposed A generation cannot publish or overwrite persisted state after A to B to A", async () => {
  const late = deferred<CatalogRefreshJobSnapshot>();
  const storage = memoryStorage();
  const old = fixture({ storage, start: () => late.promise, uuid: () => "old-a" });
  await old.controller.checkNow();
  const oldStart = old.controller.start("Bambu", "PLA");
  let staleNotifications = 0;
  old.controller.subscribe(() => { staleNotifications += 1; });
  old.controller.dispose();
  const other = fixture({}, "host-b");
  await other.controller.checkNow();
  const current = fixture({ storage, uuid: () => "new-a" });
  await current.controller.checkNow();
  await current.controller.start("eSUN", "PETG");
  late.resolve(job({ job_id: "old-a", vendor: "Bambu", material: "PLA" }, "SUCCEEDED"));
  await oldStart;
  assert.equal(staleNotifications, 1);
  assert.equal(JSON.parse(storage.getItem(catalogRefreshJobStorageKey("host-a"))!).job_id, "new-a");
  assert.equal(current.controller.snapshot().job?.job_id, "new-a");
  current.controller.dispose();
  other.controller.dispose();
});

test("late completion in one window cannot replace a newer request persisted by another", async () => {
  const oldRequest = { job_id: "old", vendor: "Bambu", material: "PLA" } as const;
  const newerRequest = { job_id: "new", vendor: "eSUN", material: "PETG" } as const;
  const storage = memoryStorage();
  storage.setItem(catalogRefreshJobStorageKey("host-a"), JSON.stringify(oldRequest));
  const late = deferred<CatalogRefreshJobSnapshot | null>();
  const f = fixture({ storage, get: () => late.promise });
  const poll = f.controller.checkNow();
  storage.setItem(catalogRefreshJobStorageKey("host-a"), JSON.stringify(newerRequest));
  late.resolve(job(oldRequest, "SUCCEEDED"));
  await poll;
  assert.equal(JSON.parse(storage.getItem(catalogRefreshJobStorageKey("host-a"))!).job_id, "new");
});

test("a later observed job replaces the saved terminal ID and survives reload after completion", async () => {
  const firstRequest = { job_id: "completed-a", vendor: "Bambu", material: "PLA" } as const;
  const nextRequest = { job_id: "observed-b", vendor: "eSUN", material: "PETG" } as const;
  const storage = memoryStorage();
  storage.setItem(catalogRefreshJobStorageKey("host-a"), JSON.stringify(firstRequest));
  let response = job(firstRequest, "SUCCEEDED");
  const original = fixture({ storage, get: async () => response });
  await original.controller.checkNow();
  assert.equal(original.controller.snapshot().busy, false);
  response = job(nextRequest);
  await original.controller.checkNow();
  assert.equal(original.controller.snapshot().busy, true);
  assert.equal(JSON.parse(storage.getItem(catalogRefreshJobStorageKey("host-a"))!).job_id, "observed-b");
  original.controller.dispose();
  const ids: Array<string | null> = [];
  const restored = fixture({
    storage,
    get: async (id) => { ids.push(id); return job(nextRequest, "SUCCEEDED"); },
  });
  await restored.controller.checkNow();
  assert.deepEqual(ids, ["observed-b"]);
  assert.equal(restored.controller.snapshot().job?.job_id, "observed-b");
  assert.equal(restored.controller.snapshot().job?.status, "SUCCEEDED");
  assert.equal(restored.controller.snapshot().job?.result?.imported, 7);
});

test("interrupted jobs return their recorded error and release the lock", async () => {
  const f = fixture({ start: async (input) => job(input, "INTERRUPTED") });
  await f.controller.checkNow();
  await f.controller.start("eSUN", "PLA");
  assert.equal(f.controller.snapshot().busy, false);
  assert.equal(f.controller.snapshot().job?.status, "INTERRUPTED");
  assert.equal(f.controller.snapshot().error, "Worker interrupted");
});

test("a persistence error fails before submitting a request", async () => {
  let posts = 0;
  const f = fixture({
    storage: { ...memoryStorage(), setItem: () => { throw new Error("Storage unavailable"); } },
    start: async (input) => { posts += 1; return job(input); },
  });
  await f.controller.checkNow();
  assert.equal(await f.controller.start("Bambu", "PLA"), false);
  assert.equal(posts, 0);
  assert.equal(f.controller.snapshot().busy, false);
  assert.match(f.controller.snapshot().error!, /Storage unavailable/);
});
