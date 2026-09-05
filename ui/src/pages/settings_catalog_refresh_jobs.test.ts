import assert from "node:assert/strict";
import test from "node:test";
import { useSettingsCatalogRefreshJobs } from "./use_settings_catalog_refresh_jobs";
import { observeCatalogRefreshJobSession } from "../lib/catalog_refresh_job_session";
import type { CatalogRefreshJobSnapshot, StartCatalogRefreshJobInput } from "../lib/tauri_catalog_client";
import { catalogRefreshJobStorageKey, catalogRefreshJobTargetKey } from "../lib/catalog_refresh_jobs";

type Input = Parameters<typeof useSettingsCatalogRefreshJobs>[0];
const reactInternals = (await import("react"))
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE as unknown as { H: unknown };

function SettingsCatalogJobsMount(input: Input) {
  return useSettingsCatalogRefreshJobs(input);
}

function MountCatalogJobs(input: Input) {
  const refs: Array<{ current: unknown }> = [];
  const effects: Array<{ dependencies?: readonly unknown[]; cleanup?: void | (() => void) }> = [];
  function renderCatalogJobs(current: Input) {
    let refIndex = 0;
    let effectIndex = 0;
    const pending: Array<() => void> = [];
    const previous = reactInternals.H;
    reactInternals.H = {
      useRef: <T>(value: T) => {
        const index = refIndex++;
        refs[index] ??= { current: value };
        return refs[index] as { current: T };
      },
      useCallback: <T>(value: T) => value,
      useEffect: (effect: () => void | (() => void), dependencies?: readonly unknown[]) => {
        const index = effectIndex++;
        const existing = effects[index];
        if (!dependencies || !existing?.dependencies || dependencies.some((value, item) => !Object.is(value, existing.dependencies?.[item]))) {
          pending.push(() => {
            existing?.cleanup?.();
            effects[index] = { dependencies, cleanup: effect() };
          });
        }
      },
    };
    let actions: ReturnType<typeof useSettingsCatalogRefreshJobs>;
    try { actions = SettingsCatalogJobsMount(current); }
    finally { reactInternals.H = previous; }
    for (const effect of pending) effect();
    return actions;
  }
  return {
    ...renderCatalogJobs(input),
    rerender: renderCatalogJobs,
    unmount: () => { for (const effect of effects) effect.cleanup?.(); },
  };
}

let invokeHandler: (command: string, payload?: Record<string, unknown>) => Promise<unknown>;
const testInvoke = <T>(command: string, payload?: Record<string, unknown>) => invokeHandler(command, payload) as Promise<T>;

function baseInput(): Input {
  return {
    target: { clientReadOnly: true, clientHostBaseUrl: "http://host-a", clientLibraryId: "library-a", clientTargetGeneration: 1 },
    beginCatalogRefreshResult: () => undefined,
    completeCatalogRefreshResult: () => undefined,
    failCatalogRefreshResult: () => undefined,
    locale: "en",
    reloadSettings: async () => undefined,
    setCatalogRefreshBusy: () => undefined,
    setCatalogRefreshPhase: () => undefined,
    setCatalogRefreshProgressMessage: () => undefined,
    setCatalogRefreshStartedAt: () => undefined,
    setCatalogRefreshVendor: () => undefined,
    setError: () => undefined,
    setInfo: () => undefined,
    settingsCatalogRefreshMessageLabels: () => ({
      auditBambuFailed: "Bambu audit failed", auditEsunFailed: "eSUN audit failed",
      catalogDiscoverySuccess: "Discovered", discoveringCatalogMaterials: "Discovering",
      refreshBambuFailed: "Bambu refresh failed", refreshEsunFailed: "eSUN refresh failed",
      refreshPreparingBambu: "Preparing Bambu", refreshPreparingEsun: "Preparing eSUN",
      zeroBambu: "No Bambu rows", zeroEsun: "No eSUN rows",
    }),
    settingsCatalogRefreshSummaryLabels: () => ({ imported: "Imported", reactivated: "Reactivated", discontinued: "Discontinued" }),
    tauri: true,
    refreshingMessage: "Refreshing",
    unavailableMessage: "Temporarily unavailable",
  };
}

function fakeWindow(storage = new Map<string, string>()) {
  return {
    __TAURI__: { invoke: testInvoke },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    },
    setTimeout: () => 1,
    clearTimeout: () => undefined,
  } as unknown as Window & typeof globalThis;
}

test("Settings renders the authoritative vendor/material and recovers a completion after navigation", async () => {
  const previousWindow = globalThis.window;
  const storage = new Map<string, string>();
  let active: CatalogRefreshJobSnapshot = {
    job_id: "other-client", vendor: "eSUN", material: "PETG", status: "RUNNING",
    started_at: "2026-09-05T10:00:00Z", finished_at: null, result: null, error: null,
  };
  const invokes: string[] = [];
  invokeHandler = async (command) => { invokes.push(command); return active; };
  globalThis.window = fakeWindow(storage);
  let busy = false;
  let vendor = "";
  let progress = "";
  let info: string | null = null;
  let imported: number | null = null;
  let reloads = 0;
  const input: Input = {
    ...baseInput(),
    beginCatalogRefreshResult: () => { imported = null; },
    completeCatalogRefreshResult: (result) => { imported = result.imported; },
    failCatalogRefreshResult: () => undefined,
    locale: "en",
    reloadSettings: async () => { reloads += 1; },
    setCatalogRefreshBusy: (value) => { busy = typeof value === "function" ? value(busy) : value; },
    setCatalogRefreshPhase: () => undefined,
    setCatalogRefreshProgressMessage: (value) => { progress = typeof value === "function" ? value(progress) : value; },
    setCatalogRefreshStartedAt: () => undefined,
    setCatalogRefreshVendor: (value) => { vendor = typeof value === "function" ? value("Bambu") : value; },
    setError: () => undefined,
    setInfo: (value) => { info = typeof value === "function" ? value(info) : value; },
  };
  let first: ReturnType<typeof MountCatalogJobs> | null = null;
  let second: ReturnType<typeof MountCatalogJobs> | null = null;
  try {
    first = MountCatalogJobs(input);
    const controller = observeCatalogRefreshJobSession(input.target, (value) => { busy = value; })!;
    await controller.checkNow();
    assert.equal(busy, true);
    assert.equal(vendor, "eSUN");
    assert.equal(progress, "eSUN PETG: Refreshing");
    await first.startCatalogRefreshJob("Bambu", "PLA");
    assert.deepEqual(invokes, ["get_library_sync_host_catalog_refresh_job"]);
    first.unmount();
    first = null;
    active = {
      ...active, status: "SUCCEEDED", finished_at: "2026-09-05T10:02:00Z",
      result: { imported: 9, reactivated_count: 0, discontinued_count: 0, output: "Complete" },
    };
    await controller.checkNow();
    assert.equal(busy, false, "App lock clears while Settings is unmounted");
    assert.equal(imported, null, "unmounted Settings receives no result");
    second = MountCatalogJobs(input);
    assert.equal(imported, 9);
    assert.match(info!, /^eSUN PETG:/);
    assert.equal(reloads, 1);
  } finally {
    first?.unmount();
    second?.unmount();
    observeCatalogRefreshJobSession({ clientReadOnly: true }, () => undefined);
    globalThis.window = previousWindow;
  }
});

test("an unresolved Settings remount preserves the active start and its pending ID until target loading finishes", async () => {
  const previousWindow = globalThis.window;
  const storage = new Map<string, string>();
  globalThis.window = fakeWindow(storage);
  let accepted: CatalogRefreshJobSnapshot | null = null;
  let submitted: StartCatalogRefreshJobInput | null = null;
  let posts = 0;
  let resolveStart!: (job: CatalogRefreshJobSnapshot) => void;
  const startResponse = new Promise<CatalogRefreshJobSnapshot>((resolve) => { resolveStart = resolve; });
  invokeHandler = async (command, payload) => {
    if (command === "start_library_sync_host_catalog_refresh_job") {
      posts += 1;
      submitted = (payload as { input: StartCatalogRefreshJobInput }).input;
      return startResponse;
    }
    assert.equal(command, "get_library_sync_host_catalog_refresh_job");
    return accepted;
  };
  let busy = false;
  const input = { ...baseInput(), setCatalogRefreshBusy: (value: Parameters<Input["setCatalogRefreshBusy"]>[0]) => { busy = typeof value === "function" ? value(busy) : value; } };
  let first: ReturnType<typeof MountCatalogJobs> | null = null;
  let remounted: ReturnType<typeof MountCatalogJobs> | null = null;
  try {
    first = MountCatalogJobs(input);
    const controller = observeCatalogRefreshJobSession(input.target, (value) => { busy = value; })!;
    await controller.checkNow();
    const pendingStart = first.startCatalogRefreshJob("Bambu", "PLA");
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(submitted);
    assert.equal(busy, true);
    first.unmount();
    first = null;
    remounted = MountCatalogJobs({ ...input, target: { clientReadOnly: true, clientHostBaseUrl: null, clientLibraryId: null, clientTargetGeneration: null } });
    const busyWhileUnresolved = busy;
    remounted.rerender(input);
    const afterReload = observeCatalogRefreshJobSession(input.target, (value) => { busy = value; })!;
    await afterReload.checkNow();
    accepted = {
      ...(submitted as StartCatalogRefreshJobInput), status: "RUNNING",
      started_at: "2026-09-05T10:00:00Z", finished_at: null, result: null, error: null,
    };
    resolveStart(accepted);
    await pendingStart;
    assert.equal(busyWhileUnresolved, true, "transient unresolved Settings state must not release App's active-job lock");
    assert.equal(afterReload, controller, "the same resolved target must retain the live controller");
    const saved = JSON.parse(storage.get(catalogRefreshJobStorageKey(catalogRefreshJobTargetKey(input.target)!)) ?? "null");
    assert.equal(saved?.job_id, accepted.job_id, "a late accepted start must retain its recoverable ID");
    assert.equal(busy, true);
    assert.equal(posts, 1, "Settings remount must never resubmit the pending start");
  } finally {
    first?.unmount();
    remounted?.unmount();
    observeCatalogRefreshJobSession({ clientReadOnly: true }, () => undefined);
    globalThis.window = previousWindow;
  }
});

test("resolved invalid target still retires the old session after an unresolved Settings render", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = fakeWindow();
  const running: CatalogRefreshJobSnapshot = {
    job_id: "running-a", vendor: "Bambu", material: "PLA", status: "RUNNING",
    started_at: "2026-09-05T10:00:00Z", finished_at: null, result: null, error: null,
  };
  invokeHandler = async () => running;
  let busy = false;
  const input = { ...baseInput(), setCatalogRefreshBusy: (value: Parameters<Input["setCatalogRefreshBusy"]>[0]) => { busy = typeof value === "function" ? value(busy) : value; } };
  let mounted: ReturnType<typeof MountCatalogJobs> | null = null;
  try {
    mounted = MountCatalogJobs(input);
    await observeCatalogRefreshJobSession(input.target, (value) => { busy = value; })!.checkNow();
    assert.equal(busy, true);
    const unresolved = { ...input, target: { clientReadOnly: true, clientHostBaseUrl: null, clientLibraryId: null, clientTargetGeneration: null } };
    mounted.rerender(unresolved);
    const busyWhileUnresolved = busy;
    mounted.rerender({ ...unresolved, target: { ...unresolved.target, clientLibraryId: "library-b", clientTargetGeneration: 2 } });
    assert.equal(busyWhileUnresolved, true);
    assert.equal(busy, false, "confirmed invalid destination must release the retired source's lock");
  } finally {
    mounted?.unmount();
    observeCatalogRefreshJobSession({ clientReadOnly: true }, () => undefined);
    globalThis.window = previousWindow;
  }
});

test("idle status failures preserve a successful receipt and later active work is still discovered", async () => {
  const previousWindow = globalThis.window;
  const storage = new Map<string, string>();
  const initial = baseInput();
  const completed: CatalogRefreshJobSnapshot = {
    job_id: "completed-a", vendor: "Bambu", material: "PLA", status: "SUCCEEDED",
    started_at: "2026-09-05T10:00:00Z", finished_at: "2026-09-05T10:01:00Z",
    result: { imported: 9, reactivated_count: 0, discontinued_count: 0, output: "Completed import" },
    error: null,
  };
  storage.set(catalogRefreshJobStorageKey(catalogRefreshJobTargetKey(initial.target)!), JSON.stringify({ job_id: completed.job_id, vendor: completed.vendor, material: completed.material }));
  globalThis.window = fakeWindow(storage);
  let response: CatalogRefreshJobSnapshot | Error = completed;
  invokeHandler = async () => {
    if (response instanceof Error) throw response;
    return response;
  };
  let imported: number | null = null;
  let busy = false;
  let vendor = "";
  let progress = "";
  const failures: string[] = [];
  const displayedErrors: string[] = [];
  const input: Input = {
    ...initial,
    beginCatalogRefreshResult: () => { imported = null; },
    completeCatalogRefreshResult: (result) => { imported = result.imported; },
    failCatalogRefreshResult: (error) => { failures.push(error); },
    setError: (value) => { if (typeof value === "string") displayedErrors.push(value); },
    setCatalogRefreshBusy: (value) => { busy = typeof value === "function" ? value(busy) : value; },
    setCatalogRefreshVendor: (value) => { vendor = typeof value === "function" ? value("Bambu") : value; },
    setCatalogRefreshProgressMessage: (value) => { progress = typeof value === "function" ? value(progress) : value; },
  };
  let mounted: ReturnType<typeof MountCatalogJobs> | null = null;
  try {
    mounted = MountCatalogJobs(input);
    const controller = observeCatalogRefreshJobSession(input.target, (value) => { busy = value; })!;
    await controller.checkNow();
    assert.equal(imported, 9);
    response = new Error("The Host went offline after completion");
    await controller.checkNow();
    const importedAfterIdleFailure = imported;
    const receiptAfterIdleFailure = controller.snapshot().job;
    response = {
      job_id: "later-job-b", vendor: "eSUN", material: "PETG", status: "RUNNING",
      started_at: "2026-09-05T10:02:00Z", finished_at: null, result: null, error: null,
    };
    await controller.checkNow();
    assert.deepEqual(failures, [], "a later idle GET error must not turn a committed import into a failed job");
    assert.deepEqual(displayedErrors, []);
    assert.equal(importedAfterIdleFailure, 9);
    assert.deepEqual(receiptAfterIdleFailure, completed);
    assert.equal(busy, true);
    assert.equal(vendor, "eSUN");
    assert.equal(progress, "eSUN PETG: Refreshing");
    assert.equal(imported, null, "the previous summary clears when the new job is adopted");
  } finally {
    mounted?.unmount();
    observeCatalogRefreshJobSession({ clientReadOnly: true }, () => undefined);
    globalThis.window = previousWindow;
  }
});

test("idle status failures do not replace a terminal job's authoritative error", async () => {
  const previousWindow = globalThis.window;
  const storage = new Map<string, string>();
  const initial = baseInput();
  const interrupted: CatalogRefreshJobSnapshot = {
    job_id: "interrupted-a", vendor: "Bambu", material: "PLA", status: "INTERRUPTED",
    started_at: "2026-09-05T10:00:00Z", finished_at: "2026-09-05T10:01:00Z",
    result: null, error: "The Host process stopped before import completed.",
  };
  storage.set(catalogRefreshJobStorageKey(catalogRefreshJobTargetKey(initial.target)!), JSON.stringify({ job_id: interrupted.job_id, vendor: interrupted.vendor, material: interrupted.material }));
  globalThis.window = fakeWindow(storage);
  let offline = false;
  invokeHandler = async () => {
    if (offline) throw new Error("Status connection lost later");
    return interrupted;
  };
  const failures: string[] = [];
  let mounted: ReturnType<typeof MountCatalogJobs> | null = null;
  try {
    mounted = MountCatalogJobs({ ...initial, failCatalogRefreshResult: (error) => { failures.push(error); } });
    const controller = observeCatalogRefreshJobSession(initial.target, () => undefined)!;
    await controller.checkNow();
    offline = true;
    await controller.checkNow();
    assert.deepEqual(failures, [interrupted.error], "the receipt's original error must stay authoritative");
  } finally {
    mounted?.unmount();
    observeCatalogRefreshJobSession({ clientReadOnly: true }, () => undefined);
    globalThis.window = previousWindow;
  }
});

test("a new request's pre-POST persistence failure clears the old receipt and reports the new vendor", async () => {
  const previousWindow = globalThis.window;
  const storage = new Map<string, string>();
  const initial = baseInput();
  const completed: CatalogRefreshJobSnapshot = {
    job_id: "completed-before-storage-failure", vendor: "Bambu", material: "PLA", status: "SUCCEEDED",
    started_at: "2026-09-05T10:00:00Z", finished_at: "2026-09-05T10:01:00Z",
    result: { imported: 9, reactivated_count: 0, discontinued_count: 0, output: "Completed import" },
    error: null,
  };
  storage.set(catalogRefreshJobStorageKey(catalogRefreshJobTargetKey(initial.target)!), JSON.stringify({ job_id: completed.job_id, vendor: completed.vendor, material: completed.material }));
  globalThis.window = fakeWindow(storage);
  let posts = 0;
  invokeHandler = async (command) => {
    if (command === "start_library_sync_host_catalog_refresh_job") posts += 1;
    return completed;
  };
  let imported: number | null = null;
  let vendor = "";
  const failures: string[] = [];
  const errors: string[] = [];
  const input: Input = {
    ...initial,
    beginCatalogRefreshResult: () => { imported = null; },
    completeCatalogRefreshResult: (result) => { imported = result.imported; },
    failCatalogRefreshResult: (error) => { failures.push(error); },
    setCatalogRefreshVendor: (value) => { vendor = typeof value === "function" ? value("Bambu") : value; },
    setError: (value) => { if (typeof value === "string") errors.push(value); },
  };
  let mounted: ReturnType<typeof MountCatalogJobs> | null = null;
  try {
    mounted = MountCatalogJobs(input);
    const controller = observeCatalogRefreshJobSession(input.target, () => undefined)!;
    await controller.checkNow();
    assert.equal(imported, 9);
    window.localStorage.setItem = () => { throw new Error("Storage quota exceeded"); };
    await mounted.startCatalogRefreshJob("eSUN", "PETG");
    assert.equal(posts, 0, "failed persistence must prevent the new start POST");
    assert.equal(controller.snapshot().job, null);
    assert.equal(controller.snapshot().request?.vendor, "eSUN");
    assert.equal(controller.snapshot().request?.material, "PETG");
    assert.equal(controller.snapshot().busy, false);
    assert.equal(controller.snapshot().uncertain, false);
    assert.equal(vendor, "eSUN");
    assert.equal(imported, null, "an old success receipt must not mask the failed new request");
    assert.equal(failures.length, 1);
    assert.match(failures[0], /Storage quota exceeded/);
    assert.deepEqual(errors, ["eSUN refresh failed"]);
  } finally {
    mounted?.unmount();
    observeCatalogRefreshJobSession({ clientReadOnly: true }, () => undefined);
    globalThis.window = previousWindow;
  }
});
