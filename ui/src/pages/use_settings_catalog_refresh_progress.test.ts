import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as flush } from "node:timers/promises";
import type { SetStateAction } from "react";
import {
  completeCatalogRefreshOperation,
  getActiveCatalogRefreshOperation,
  tryBeginCatalogRefreshOperation,
} from "../lib/catalog_refresh_operation";
import type { CatalogRefreshProgressPayload } from "../lib/tauri_client";
import { useSettingsCatalogRefreshProgress } from "./use_settings_catalog_refresh_progress";

const reactInternals = (await import("react"))
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE as unknown as { H: unknown };

function SettingsProgressMount() {
  return useSettingsCatalogRefreshProgress({ tauri: true });
}

function mountProgress() {
  const states: unknown[] = [];
  const effects: Array<{ dependencies?: readonly unknown[]; cleanup?: void | (() => void) }> = [];
  function render() {
    let stateIndex = 0;
    let effectIndex = 0;
    const pending: Array<() => void> = [];
    const previous = reactInternals.H;
    reactInternals.H = {
      useState: <T>(initial: T) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index] as T, (next: SetStateAction<T>) => {
          states[index] = typeof next === "function" ? (next as (value: T) => T)(states[index] as T) : next;
        }];
      },
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
    let output: ReturnType<typeof useSettingsCatalogRefreshProgress>;
    try { output = SettingsProgressMount(); }
    finally { reactInternals.H = previous; }
    for (const effect of pending) effect();
    return output;
  }
  return { render, unmount: () => { for (const effect of effects) effect.cleanup?.(); } };
}

test("progress events keep their audit/vendor ownership and remount from structured phase, not backend sentences", async () => {
  const previousWindow = globalThis.window;
  let handler: ((event: { payload: CatalogRefreshProgressPayload }) => void) | null = null;
  let notifyReady!: () => void;
  const ready = new Promise<void>((resolve) => { notifyReady = resolve; });
  let unlistens = 0;
  globalThis.window = {
    __TAURI_INTERNALS__: {
      transformCallback: (callback: typeof handler) => { handler = callback; return 1; },
      invoke: async (command: string) => {
        if (command === "plugin:event|listen") notifyReady();
        else if (command === "plugin:event|unlisten") unlistens += 1;
        else assert.fail(`Unexpected IPC: ${command}`);
        return 1;
      },
    },
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => undefined },
    setInterval: () => 1,
    clearInterval: () => undefined,
  } as unknown as Window & typeof globalThis;
  const audit = tryBeginCatalogRefreshOperation({
    kind: "AUDIT", vendor: "Bambu", phase: "PREPARE",
    message: "Raw English setup message must never be restored as primary UI copy",
  });
  assert.ok(audit);
  let mounted: ReturnType<typeof mountProgress> | null = null;
  let refreshId: number | null = null;
  try {
    mounted = mountProgress();
    assert.equal(mounted.render().catalogRefreshKind, "AUDIT");
    assert.equal(mounted.render().catalogRefreshPhase, "PREPARE");
    await ready;
    await flush();
    assert.ok(handler);
    const emit = (vendor: string, phase: string) => {
      assert.ok(handler);
      handler({ payload: { vendor, phase, message: "Checking which Bambu material types are available..." } });
    };
    emit("eSUN", "IMPORT");
    assert.equal(mounted.render().catalogRefreshPhase, "PREPARE", "another vendor cannot relabel the active audit");
    emit("Bambu", "DISCOVER");
    assert.equal(mounted.render().catalogRefreshPhase, "DISCOVER");
    assert.equal(getActiveCatalogRefreshOperation()?.phase, "DISCOVER");
    assert.equal("catalogRefreshProgressMessage" in mounted.render(), false, "the hook must not cache a backend sentence");
    mounted.unmount();
    mounted = mountProgress();
    assert.equal(mounted.render().catalogRefreshPhase, "DISCOVER", "navigation restores the last structured progress");
    assert.equal(mounted.render().catalogRefreshKind, "AUDIT");
    await flush();
    completeCatalogRefreshOperation(audit.id);
    const refresh = tryBeginCatalogRefreshOperation({ kind: "REFRESH", vendor: "Bambu", phase: "PREPARE", message: "Refresh" });
    assert.ok(refresh);
    refreshId = refresh.id;
    emit("Bambu", "IMPORT");
    assert.equal(mounted.render().catalogRefreshPhase, "DISCOVER", "unscoped events cannot override an authoritative refresh job receipt");
    mounted.unmount();
    mounted = null;
    await flush();
    assert.ok(unlistens >= 1);
  } finally {
    mounted?.unmount();
    completeCatalogRefreshOperation(audit.id);
    if (refreshId !== null) completeCatalogRefreshOperation(refreshId);
    await flush();
    globalThis.window = previousWindow;
  }
});
