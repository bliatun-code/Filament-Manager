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
  const identity = catalogRefreshJobSessionIdentity(input.target);
  useEffect(() => { callbacks.current = input; });

  useEffect(() => {
    if (!input.tauri) return;
    const controller = observeCatalogRefreshJobSession(
      input.target,
      (busy) => input.setCatalogRefreshBusy(busy),
    );
    controllerRef.current = controller;
    let seenRequestId: string | null | undefined;
    let seenResultId: string | null = null;
    let seenError: string | null = null;
    const unlisten = controller?.subscribe((state) => {
      const current = callbacks.current;
      if (catalogRefreshJobSessionIdentity(current.target) !== identity) return;
      const request = state.job ?? state.request;
      if (seenRequestId !== (request?.job_id ?? null)) {
        seenRequestId = request?.job_id ?? null;
        current.beginCatalogRefreshResult();
        current.setError(null);
        current.setInfo(null);
        seenError = null;
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
      if (job && job.status !== "RUNNING" && seenResultId !== job.job_id) {
        seenResultId = job.job_id;
        if (job.status === "SUCCEEDED" && job.result) {
          current.completeCatalogRefreshResult(job.result);
          void current.reloadSettings().catch(() => {});
          if (job.result.imported === 0) {
            current.setError(buildSettingsCatalogRefreshZeroImportMessage(
              job.vendor, current.settingsCatalogRefreshMessageLabels(),
            ));
          } else {
            current.setInfo(`${job.vendor} ${job.material}: ${buildSettingsCatalogRefreshSuccessMessage(
              job.result, current.settingsCatalogRefreshSummaryLabels(), current.locale,
            )}`);
          }
          return;
        }
      }
      if (state.error && state.error !== seenError) {
        seenError = state.error;
        current.failCatalogRefreshResult(state.error);
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
  }, [identity, input.tauri]);

  const startCatalogRefreshJob = useCallback(async (
    vendor: SettingsCatalogVendor,
    material: string,
  ) => {
    if (isCatalogRefreshOperationActive()) return;
    await controllerRef.current?.start(vendor, material);
  }, []);

  return { startCatalogRefreshJob };
}
