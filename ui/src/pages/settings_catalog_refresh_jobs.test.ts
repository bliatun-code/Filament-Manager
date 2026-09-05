import assert from "node:assert/strict";
import test from "node:test";
import { useSettingsCatalogRefreshJobs } from "./use_settings_catalog_refresh_jobs";
import { observeCatalogRefreshJobSession } from "../lib/catalog_refresh_job_session";
import type { CatalogRefreshJobSnapshot } from "../lib/tauri_catalog_client";

type Input = Parameters<typeof useSettingsCatalogRefreshJobs>[0];
const reactInternals = (await import("react"))
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE as unknown as { H: unknown };

function MountCatalogJobs(input: Input) {
  const effects: Array<() => void | (() => void)> = [];
  const previous = reactInternals.H;
  reactInternals.H = {
    useRef: <T>(value: T) => ({ current: value }),
    useCallback: <T>(value: T) => value,
    useEffect: (effect: () => void | (() => void)) => { effects.push(effect); },
  };
  let actions: ReturnType<typeof useSettingsCatalogRefreshJobs>;
  try { actions = useSettingsCatalogRefreshJobs(input); }
  finally { reactInternals.H = previous; }
  const cleanups = effects.map((effect) => effect());
  return { ...actions, unmount: () => { for (const cleanup of cleanups) cleanup?.(); } };
}

test("Settings renders the authoritative vendor/material and recovers a completion after navigation", async () => {
  const previousWindow = globalThis.window;
  const storage = new Map<string, string>();
  let active: CatalogRefreshJobSnapshot = {
    job_id: "other-client", vendor: "eSUN", material: "PETG", status: "RUNNING",
    started_at: "2026-09-05T10:00:00Z", finished_at: null, result: null, error: null,
  };
  const invokes: string[] = [];
  globalThis.window = {
    __TAURI__: { invoke: async <T>(command: string) => { invokes.push(command); return active as T; } },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    },
    setTimeout: () => 1,
    clearTimeout: () => undefined,
  } as unknown as Window & typeof globalThis;
  let busy = false;
  let vendor = "";
  let progress = "";
  let info: string | null = null;
  let imported: number | null = null;
  let reloads = 0;
  const input: Input = {
    target: { clientReadOnly: true, clientHostBaseUrl: "http://host-a", clientLibraryId: "library-a", clientTargetGeneration: 1 },
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
