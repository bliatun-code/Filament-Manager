import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Dispatch, SetStateAction } from "react";

import type {
  CatalogRefreshJobSnapshot,
  CatalogRefreshResult,
  LibrarySyncSettings,
} from "../lib/tauri_client";
import { observeCatalogRefreshJobSession } from "../lib/catalog_refresh_job_session";
import { useSettingsCatalogRefreshActions } from "./use_settings_catalog_refresh_actions";
import { useSettingsCatalogRefreshState } from "./use_settings_catalog_refresh_state";
import { useSettingsLibrarySyncActions } from "./use_settings_library_sync_actions";

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("./settings.tsx", import.meta.url), "utf8");
const refreshStateSource = readFileSync(
  new URL("./use_settings_catalog_refresh_state.ts", import.meta.url),
  "utf8",
);

type CatalogRefreshStateInput = Parameters<
  typeof useSettingsCatalogRefreshState
>[0];
type CatalogRefreshActionsInput = Parameters<
  typeof useSettingsCatalogRefreshActions
>[0];
type LibrarySyncActionsInput = Parameters<
  typeof useSettingsLibrarySyncActions
>[0];

type ReactClientInternals = {
  H: unknown;
};

const reactClientInternals = (
  await import("react")
).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE as unknown as ReactClientInternals;

function SettingsCatalogRefreshStateMount(input: CatalogRefreshStateInput) {
  return useSettingsCatalogRefreshState(input);
}

function SettingsCatalogRefreshActionsMount(input: CatalogRefreshActionsInput) {
  return useSettingsCatalogRefreshActions(input);
}

function SettingsLibrarySyncActionsMount(input: LibrarySyncActionsInput) {
  return useSettingsLibrarySyncActions(input);
}

function renderLibrarySyncActions(input: LibrarySyncActionsInput) {
  const previousDispatcher = reactClientInternals.H;
  reactClientInternals.H = {
    useCallback: <Value>(callback: Value) => callback,
  };
  try {
    return SettingsLibrarySyncActionsMount(input);
  } finally {
    reactClientInternals.H = previousDispatcher;
  }
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function catalogRefreshResult(): CatalogRefreshResult {
  return {
    imported: 0,
    detected_store: null,
    detected_collection: null,
    discovered_materials: null,
    reactivated_count: 0,
    discontinued_count: 0,
    reused_cached_products: null,
    detail_fetches: null,
    output: "ok",
  };
}

function updateBooleanState(
  current: boolean,
  update: SetStateAction<boolean>,
): boolean {
  return typeof update === "function" ? update(current) : update;
}

test("the catalog refresh safety lock is owned above the Settings route", () => {
  assert.match(
    appSource,
    /const \[settingsCatalogRefreshBusy, setSettingsCatalogRefreshBusy\] =\s*useState\(\(\) => isCatalogRefreshOperationActive\(\)\)/,
  );
  assert.match(
    appSource,
    /<SettingsPage[\s\S]*?catalogRefreshBusy=\{settingsCatalogRefreshBusy\}[\s\S]*?onCatalogRefreshBusyChange=\{setSettingsCatalogRefreshBusy\}/,
  );
  assert.match(settingsSource, /catalogRefreshBusy: appCatalogRefreshBusy/);
  assert.match(
    settingsSource,
    /setCatalogRefreshBusy: onCatalogRefreshBusyChange/,
  );
  assert.doesNotMatch(refreshStateSource, /useState/);
});

test("an App-owned long catalog refresh survives a Settings remount and blocks competing writes", async () => {
  let appCatalogRefreshBusy = false;
  const setAppCatalogRefreshBusy: Dispatch<SetStateAction<boolean>> = (update) => {
    appCatalogRefreshBusy = updateBooleanState(appCatalogRefreshBusy, update);
  };
  const longRefresh = deferred<CatalogRefreshResult>();
  const invokeCommands: string[] = [];
  let refreshStarts = 0;
  let reloads = 0;
  let libraryBusyWrites = 0;
  const storage = new Map<string, string>();
  const runningJob: CatalogRefreshJobSnapshot = {
    job_id: "job-a", vendor: "Bambu", material: "PLA", status: "RUNNING",
    started_at: "2026-09-05T10:00:00Z", finished_at: null, result: null, error: null,
  };
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    },
    setTimeout: () => 1,
    clearTimeout: () => undefined,
    __TAURI__: {
      invoke: <Value>(command: string, args?: { input?: { job_id?: string | null } }) => {
        invokeCommands.push(command);
        if (command === "start_library_sync_host_catalog_refresh_job") {
          runningJob.job_id = args!.input!.job_id!;
          return Promise.resolve(runningJob) as Promise<Value>;
        }
        if (command === "get_library_sync_host_catalog_refresh_job") {
          return (args?.input?.job_id
            ? longRefresh.promise.then((result) => ({ ...runningJob, result, status: "SUCCEEDED" }))
            : Promise.resolve(null)) as Promise<Value>;
        }
        return Promise.reject(new Error(`Unexpected Tauri command: ${command}`));
      },
    },
  } as unknown as Window & typeof globalThis;

  const controller = observeCatalogRefreshJobSession({
    clientReadOnly: true,
    clientHostBaseUrl: "http://host-a.local",
    clientLibraryId: "library-a",
    clientTargetGeneration: 1,
  }, (busy) => setAppCatalogRefreshBusy(busy))!;
  controller.subscribe((state) => {
    if (state.job?.status === "SUCCEEDED") reloads += 1;
  });

  const catalogActionInput = (
    catalogRefreshBusy: boolean,
  ): CatalogRefreshActionsInput => ({
    beginCatalogRefreshResult: () => {
      refreshStarts += 1;
    },
    busy: false,
    catalogRefreshBusy,
    completeCatalogRefreshResult: () => undefined,
    completeCatalogSourceAuditResult: () => undefined,
    failCatalogRefreshResult: () => undefined,
    getCatalogRefreshMaterial: () => "PLA",
    locale: "en",
    reloadSettings: async () => {
      reloads += 1;
    },
    setCatalogRefreshBusy: setAppCatalogRefreshBusy,
    setCatalogRefreshPhase: () => undefined,
    setCatalogRefreshProgressMessage: () => undefined,
    setCatalogRefreshStartedAt: () => undefined,
    setCatalogRefreshVendor: () => undefined,
    setError: () => undefined,
    setInfo: () => undefined,
    saveDiscoveredCatalogMaterials: () => true,
    settingsCatalogRefreshMessageLabels: () => ({
      auditBambuFailed: "Bambu audit failed",
      auditEsunFailed: "eSUN audit failed",
      catalogDiscoverySuccess: "Catalog discovered",
      discoveringCatalogMaterials: "Discovering catalog",
      refreshBambuFailed: "Bambu refresh failed",
      refreshEsunFailed: "eSUN refresh failed",
      refreshPreparingBambu: "Preparing Bambu refresh",
      refreshPreparingEsun: "Preparing eSUN refresh",
      zeroBambu: "No Bambu rows imported",
      zeroEsun: "No eSUN rows imported",
    }),
    settingsCatalogRefreshSummaryLabels: () => ({
      discontinued: "Discontinued",
      imported: "Imported",
      reactivated: "Reactivated",
    }),
    settingsClientHostBaseUrl: "http://host-a.local",
    settingsClientLibraryId: "library-a",
    settingsClientReadOnly: true,
    startCatalogRefreshJob: async (vendor, material) => {
      refreshStarts += 1;
      await controller.start(vendor, material);
    },
    swatchBusy: false,
    tauri: true,
  });

  try {
    await controller.checkNow();
    const firstSettingsMount = SettingsCatalogRefreshStateMount({
      catalogRefreshBusy: appCatalogRefreshBusy,
      setCatalogRefreshBusy: setAppCatalogRefreshBusy,
    });
    const firstCatalogActions = SettingsCatalogRefreshActionsMount(
      catalogActionInput(firstSettingsMount.catalogRefreshBusy),
    );
    const pendingRefresh = firstCatalogActions.handleRefreshVendorCatalog("Bambu");
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(appCatalogRefreshBusy, true);
    assert.equal(refreshStarts, 1);
    assert.deepEqual(invokeCommands, [
      "get_library_sync_host_catalog_refresh_job",
      "start_library_sync_host_catalog_refresh_job",
    ]);

    // The first Settings instance is now conceptually unmounted. A fresh
    // instance receives the App-owned lock instead of resetting it locally.
    const remountedSettings = SettingsCatalogRefreshStateMount({
      catalogRefreshBusy: appCatalogRefreshBusy,
      setCatalogRefreshBusy: setAppCatalogRefreshBusy,
    });
    assert.equal(remountedSettings.catalogRefreshBusy, true);

    const remountedCatalogActions = SettingsCatalogRefreshActionsMount(
      catalogActionInput(remountedSettings.catalogRefreshBusy),
    );
    await remountedCatalogActions.handleRefreshVendorCatalog("Bambu");

    const libraryActions = renderLibrarySyncActions({
      librarySyncActionMessageLabels: () =>
        ({}) as ReturnType<
          LibrarySyncActionsInput["librarySyncActionMessageLabels"]
        >,
      librarySyncBusy: remountedSettings.catalogRefreshBusy,
      librarySyncDeviceNameDraft: "Client",
      librarySyncErrorMessageLabels: () =>
        ({}) as ReturnType<
          LibrarySyncActionsInput["librarySyncErrorMessageLabels"]
        >,
      librarySyncHostBaseUrlDraft: "http://host-b.local",
      librarySyncModeDraft: "CLIENT",
      librarySyncPairingDraft: "",
      librarySyncPairingMessageLabels: () =>
        ({}) as ReturnType<
          LibrarySyncActionsInput["librarySyncPairingMessageLabels"]
        >,
      librarySyncSettings: {
        mode: "CLIENT",
        host_base_url: "http://host-a.local",
      } as LibrarySyncSettings,
      persistTrustedLanConfig: async () => true,
      setError: () => undefined,
      setInfo: () => undefined,
      setLibrarySyncBusy: () => {
        libraryBusyWrites += 1;
      },
      setLibrarySyncDeviceNameDraft: () => undefined,
      setLibrarySyncDeviceNameSaveBusy: () => undefined,
      setLibrarySyncHostBaseUrlDraft: () => undefined,
      setLibrarySyncModeDraft: () => undefined,
      setLibrarySyncPairingDraft: () => undefined,
      setLibrarySyncSettings: () => undefined,
      setLibrarySyncSnapshot: () => undefined,
      setLibrarySyncSnapshotBusy: () => undefined,
      setLibrarySyncValidation: () => undefined,
      setLibrarySyncValidationBusy: () => undefined,
      setTrustedLanEnabledDraft: () => undefined,
      setTrustedLanInterfaceAddressDraft: () => undefined,
      settingsClientHostBaseUrl: "http://host-a.local",
      showTransientInfo: () => undefined,
      tauri: true,
      trustedLanConfigMessageLabels: () =>
        ({}) as ReturnType<
          LibrarySyncActionsInput["trustedLanConfigMessageLabels"]
        >,
      trustedLanInterfaces: [],
      trustedLanSelectedInterfaceOption: null,
      trustedLanStatus: null,
      trustedLanValidationMessageLabels: () =>
        ({}) as ReturnType<
          LibrarySyncActionsInput["trustedLanValidationMessageLabels"]
        >,
    });
    const hostChanged = await libraryActions.handleSaveLibrarySyncSettings("CLIENT");

    assert.equal(hostChanged, false);
    assert.equal(libraryBusyWrites, 0);
    assert.equal(refreshStarts, 1);
    assert.deepEqual(invokeCommands, [
      "get_library_sync_host_catalog_refresh_job",
      "start_library_sync_host_catalog_refresh_job",
    ]);

    await pendingRefresh;
    controller.pause();
    const completion = controller.checkNow();
    longRefresh.resolve(catalogRefreshResult());
    await completion;

    assert.equal(reloads, 1);
    assert.equal(appCatalogRefreshBusy, false);
  } finally {
    observeCatalogRefreshJobSession({ clientReadOnly: true }, () => undefined);
    globalThis.window = previousWindow;
  }
});
