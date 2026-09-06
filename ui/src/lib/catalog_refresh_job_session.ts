import {
  CatalogRefreshJobController,
  catalogRefreshJobTargetKey,
} from "./catalog_refresh_jobs";
import {
  getManagedCatalogRefreshJob,
  startManagedCatalogRefreshJob,
  type CatalogWriteTarget,
} from "./catalog_writes";
import {
  completeCatalogRefreshOperation,
  isCatalogRefreshOperationActive,
  tryBeginCatalogRefreshOperation,
  updateCatalogRefreshOperation,
} from "./catalog_refresh_operation";

let session: {
  identity: string;
  controller: CatalogRefreshJobController;
  release: () => void;
} | null = null;

export function catalogRefreshJobSessionIdentity(target: CatalogWriteTarget): string | null {
  const key = catalogRefreshJobTargetKey(target);
  const generation = target.clientTargetGeneration;
  if (key === null || !Number.isSafeInteger(generation) || (generation ?? -1) < 0) return null;
  return JSON.stringify([key, generation]);
}

export function isObservedCatalogRefreshJobBusy(): boolean {
  return session?.controller.snapshot().busy ?? false;
}

export function observeCatalogRefreshJobSession(
  target: CatalogWriteTarget,
  setAppBusy: (busy: boolean) => void,
): CatalogRefreshJobController | null {
  const identity = catalogRefreshJobSessionIdentity(target);
  if (session?.identity === identity) return session.controller;
  session?.controller.dispose();
  session?.release();
  session = null;
  const targetKey = catalogRefreshJobTargetKey(target);
  if (identity === null || targetKey === null) {
    setAppBusy(isCatalogRefreshOperationActive());
    return null;
  }
  // Snapshot the target: no pending operation may silently follow edited
  // connection settings, even if the user returns to the same Host later.
  const boundTarget = { ...target };
  const controller = new CatalogRefreshJobController(targetKey, {
    start: (input) => startManagedCatalogRefreshJob(input, boundTarget),
    get: (jobId) => getManagedCatalogRefreshJob(jobId, boundTarget),
    storage: {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
      removeItem: (key) => window.localStorage.removeItem(key),
    },
    uuid: () => crypto.randomUUID(),
    schedule: (callback) => window.setTimeout(callback, 2_000),
    cancel: (timer) => window.clearTimeout(timer as number),
  });
  let operationId: number | null = null;
  const release = () => {
    if (operationId !== null) completeCatalogRefreshOperation(operationId);
    operationId = null;
  };
  // This observer stays attached across route unmounts. App's safety lock must
  // clear when a job finishes even if Settings is no longer mounted.
  controller.subscribe((state) => {
    if (state.busy) {
      const vendor = state.job?.vendor ?? state.request?.vendor ?? "Bambu";
      if (operationId === null) {
        operationId = tryBeginCatalogRefreshOperation({
          kind: "REFRESH", vendor, phase: "PREPARE", message: "",
        })?.id ?? null;
      }
      if (operationId !== null) {
        const startedAt = state.job ? Date.parse(state.job.started_at) : Date.now();
        updateCatalogRefreshOperation(operationId, {
          vendor,
          phase: state.job?.status === "RUNNING" ? "FETCH" : "PREPARE",
          startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
        });
      }
    } else {
      release();
    }
    setAppBusy(state.busy || isCatalogRefreshOperationActive());
  });
  session = { identity, controller, release };
  return controller;
}
