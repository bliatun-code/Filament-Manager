import { useCallback, useEffect, useRef } from "react";
import type { CatalogWriteTarget } from "../lib/catalog_writes";
import type { CatalogRefreshJobController } from "../lib/catalog_refresh_jobs";
import {
  catalogRefreshJobSessionIdentity,
  observeCatalogRefreshJobSession,
} from "../lib/catalog_refresh_job_session";
import { isCatalogRefreshOperationActive } from "../lib/catalog_refresh_operation";
import type { useSettingsCatalogRefreshActions } from "./use_settings_catalog_refresh_actions";
import {
  buildSettingsCatalogRefreshFallbackErrorMessage,
  buildSettingsCatalogRefreshSuccessMessage,
  buildSettingsCatalogRefreshZeroImportMessage,
  type SettingsCatalogVendor,
} from "./settings_catalog_model";

type ActionsInput = Parameters<typeof useSettingsCatalogRefreshActions>[0];
type JobInput = Pick<ActionsInput,
  "beginCatalogRefreshResult" | "completeCatalogRefreshResult" |
  "failCatalogRefreshResult" | "locale" | "reloadSettings" |
  "setCatalogRefreshBusy" | "setCatalogRefreshPhase" |
  "setCatalogRefreshProgressMessage" | "setCatalogRefreshStartedAt" |
  "setCatalogRefreshVendor" | "setError" | "setInfo" |
  "settingsCatalogRefreshMessageLabels" | "settingsCatalogRefreshSummaryLabels" |
  "tauri"
> & {
  target: CatalogWriteTarget;
  refreshingMessage: string;
  unavailableMessage: string;
};

export function useSettingsCatalogRefreshJobs(input: JobInput) {
  const callbacks = useRef(input);
  const controllerRef = useRef<CatalogRefreshJobController | null>(null);
  const seenRef = useRef<{
    identity: string | null;
    requestId: string | null | undefined;
    resultId: string | null;
    error: string | null;
  } | null>(null);
  const identity = catalogRefreshJobSessionIdentity(input.target);
  const targetResolved = input.target.clientTargetGeneration != null;
  useEffect(() => { callbacks.current = input; });

  useEffect(() => {
    // Settings starts with no target while its saved role loads on every mount.
    // Keep the app-owned session and any in-flight start until that load resolves.
    if (!input.tauri || !targetResolved) return;
    const controller = observeCatalogRefreshJobSession(
      input.target,
      (busy) => input.setCatalogRefreshBusy(busy),
    );
    controllerRef.current = controller;
    // React may replay effects for the same mount. Preserve its feedback then,
    // while a new mount still restores the receipt and a new target resets it.
    if (seenRef.current?.identity !== identity) {
      seenRef.current = { identity, requestId: undefined, resultId: null, error: null };
    }
    const seen = seenRef.current;
    const unlisten = controller?.subscribe((state) => {
      const current = callbacks.current;
      if (catalogRefreshJobSessionIdentity(current.target) !== identity) return;
      const request = state.job ?? state.request;
      if (seen.requestId !== (request?.job_id ?? null)) {
        seen.requestId = request?.job_id ?? null;
        current.beginCatalogRefreshResult();
        current.setError(null);
        current.setInfo(null);
        seen.error = null;
      }
      if (request) {
        current.setCatalogRefreshVendor(request.vendor);
        current.setCatalogRefreshProgressMessage(
          `${request.vendor} ${request.material}: ${state.uncertain ? current.unavailableMessage : current.refreshingMessage}`,
        );
      }
      current.setCatalogRefreshPhase(state.job?.status === "RUNNING" ? "FETCH" : "PREPARE");
      const startedAt = state.job ? Date.parse(state.job.started_at) : null;
      current.setCatalogRefreshStartedAt(
        state.busy && startedAt !== null && Number.isFinite(startedAt) ? startedAt : null,
      );
      if (state.busy || !request) return;
      const job = state.job;
      if (job && job.status !== "RUNNING" && seen.resultId !== job.job_id) {
        seen.resultId = job.job_id;
        if (job.status === "SUCCEEDED" && job.result) {
          current.completeCatalogRefreshResult(job.result);
          void current.reloadSettings().catch(() => {});
          if (job.result.imported === 0) {
            current.setError(buildSettingsCatalogRefreshZeroImportMessage(
              job.vendor, current.settingsCatalogRefreshMessageLabels(),
            ));
          } else if (controller.claimSuccessNotification(job.job_id)) {
            current.setInfo(`${job.vendor} ${job.material}: ${buildSettingsCatalogRefreshSuccessMessage(
              job.result, current.settingsCatalogRefreshSummaryLabels(), current.locale,
            )}`);
          }
          return;
        }
      }
      // A later idle poll can fail after this job already has a receipt.
      // That transport error cannot change the recorded outcome of the job.
      const error = job && job.status !== "RUNNING" ? job.error : state.error;
      if (error && error !== seen.error) {
        seen.error = error;
        current.failCatalogRefreshResult(error);
        current.setError(buildSettingsCatalogRefreshFallbackErrorMessage(
          request.vendor, current.settingsCatalogRefreshMessageLabels(),
        ));
      }
    });
    controller?.resume();
    return () => {
      unlisten?.();
      controller?.pause();
      controllerRef.current = null;
    };
    // A session is bound to the exact Host generation. Other callbacks are
    // read through the ref so routine settings reloads do not restart polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, targetResolved, input.tauri]);

  const startCatalogRefreshJob = useCallback(async (
    vendor: SettingsCatalogVendor,
    material: string,
  ) => {
    if (isCatalogRefreshOperationActive()) return;
    await controllerRef.current?.start(vendor, material);
  }, []);

  return { startCatalogRefreshJob };
}
