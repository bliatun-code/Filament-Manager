import { useCallback, useEffect, useRef } from "react";
import type { CatalogWriteTarget } from "../lib/catalog_writes";
import type { CatalogRefreshJobController } from "../lib/catalog_refresh_jobs";
import {
  catalogRefreshJobSessionIdentity,
  observeCatalogRefreshJobSession,
} from "../lib/catalog_refresh_job_session";
import {
  getActiveCatalogRefreshOperation,
  isCatalogRefreshOperationActive,
} from "../lib/catalog_refresh_operation";
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
  "setCatalogRefreshKind" | "setCatalogRefreshUnavailable" |
  "setCatalogRefreshMaterial" | "setCatalogRefreshStartedAt" |
  "setCatalogRefreshVendor" | "setError" | "setInfo" |
  "settingsCatalogRefreshMessageLabels" | "settingsCatalogRefreshSummaryLabels" |
  "tauri"
> & {
  target: CatalogWriteTarget;
};

export function useSettingsCatalogRefreshJobs(input: JobInput) {
  const callbacks = useRef(input);
  const controllerRef = useRef<CatalogRefreshJobController | null>(null);
  const seenRef = useRef<{
    identity: string | null;
    requestId: string | null | undefined;
    resultId: string | null;
    error: string | null;
    auditReceiptId: string | null;
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
      seenRef.current = { identity, requestId: undefined, resultId: null, error: null, auditReceiptId: null };
    }
    const seen = seenRef.current;
    const unlisten = controller?.subscribe((state) => {
      const current = callbacks.current;
      if (catalogRefreshJobSessionIdentity(current.target) !== identity) return;
      // Polling keeps its receipt and App-owned lock alive, but an active
      // source audit owns all Settings progress and feedback until it finishes.
      if (getActiveCatalogRefreshOperation()?.kind === "AUDIT") {
        if (state.job && state.job.status !== "RUNNING") {
          seen.auditReceiptId = state.job.job_id;
        }
        return;
      }
      const request = state.job ?? state.request;
      // Do not replay an older receipt over the audit's fresh result after it
      // releases the lease. This suppression belongs only to this mount;
      // another job or a later Settings visit recovers normal receipt behavior.
      if (seen.auditReceiptId === request?.job_id && state.job?.status !== "RUNNING") return;
      seen.auditReceiptId = null;
      if (seen.requestId !== (request?.job_id ?? null)) {
        seen.requestId = request?.job_id ?? null;
        current.beginCatalogRefreshResult();
        current.setError(null);
        current.setInfo(null);
        seen.error = null;
      }
      if (!request) return;
      current.setCatalogRefreshVendor(request.vendor);
      current.setCatalogRefreshKind("REFRESH");
      current.setCatalogRefreshMaterial(request.material);
      current.setCatalogRefreshUnavailable(state.uncertain);
      // Job receipts do not expose the Host's fetch/import subphase.
      current.setCatalogRefreshPhase(state.job?.status ?? "PREPARE");
      const startedAt = state.job ? Date.parse(state.job.started_at) : null;
      current.setCatalogRefreshStartedAt(
        state.busy && startedAt !== null && Number.isFinite(startedAt) ? startedAt : null,
      );
      if (state.busy) return;
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
