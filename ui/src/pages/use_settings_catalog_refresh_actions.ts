import { type Dispatch, type SetStateAction } from "react";
import {
  auditManagedVendorCatalog,
  refreshManagedVendorCatalog,
} from "../lib/catalog_writes";
import {
  completeCatalogRefreshOperation,
  tryBeginCatalogRefreshOperation,
} from "../lib/catalog_refresh_operation";
import { diagnosticErrorText } from "../lib/error_text";
import type {
  CatalogRefreshResult,
  CatalogSourceAuditResult,
} from "../lib/tauri_client";
import type { NumberDisplayLocale } from "../lib/number_display";
import {
  buildSettingsCatalogRefreshFallbackErrorMessage,
  buildSettingsCatalogAuditFallbackErrorMessage,
  buildSettingsCatalogRefreshPreparingMessage,
  buildSettingsCatalogRefreshSuccessMessage,
  buildSettingsCatalogRefreshZeroImportMessage,
  type SettingsCatalogRefreshMessageLabels,
  type SettingsCatalogRefreshSummaryLabels,
  type SettingsCatalogVendor,
} from "./settings_catalog_model";

type UseSettingsCatalogRefreshActionsInput = {
  beginCatalogRefreshResult: () => void;
  busy: boolean;
  catalogRefreshBusy: boolean;
  completeCatalogRefreshResult: (summary: CatalogRefreshResult) => void;
  completeCatalogSourceAuditResult: (summary: CatalogSourceAuditResult) => void;
  failCatalogRefreshResult: (message: string) => void;
  getCatalogRefreshMaterial: (vendor: SettingsCatalogVendor) => string | null;
  locale: NumberDisplayLocale;
  reloadSettings: () => Promise<void>;
  setCatalogRefreshBusy: Dispatch<SetStateAction<boolean>>;
  setCatalogRefreshPhase: Dispatch<SetStateAction<string>>;
  setCatalogRefreshProgressMessage: Dispatch<SetStateAction<string>>;
  setCatalogRefreshStartedAt: Dispatch<SetStateAction<number | null>>;
  setCatalogRefreshVendor: Dispatch<SetStateAction<SettingsCatalogVendor>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  saveDiscoveredCatalogMaterials: (
    vendor: SettingsCatalogVendor,
    materials: string[],
  ) => boolean;
  settingsCatalogRefreshMessageLabels: (
    params?: { count?: number },
  ) => SettingsCatalogRefreshMessageLabels;
  settingsCatalogRefreshSummaryLabels: () => SettingsCatalogRefreshSummaryLabels;
  settingsClientHostBaseUrl: string | null;
  settingsClientLibraryId: string | null;
  settingsClientReadOnly: boolean;
  swatchBusy: boolean;
  tauri: boolean;
};

export function useSettingsCatalogRefreshActions({
  beginCatalogRefreshResult,
  busy,
  catalogRefreshBusy,
  completeCatalogRefreshResult,
  completeCatalogSourceAuditResult,
  failCatalogRefreshResult,
  getCatalogRefreshMaterial,
  locale,
  reloadSettings,
  setCatalogRefreshBusy,
  setCatalogRefreshPhase,
  setCatalogRefreshProgressMessage,
  setCatalogRefreshStartedAt,
  setCatalogRefreshVendor,
  setError,
  setInfo,
  saveDiscoveredCatalogMaterials,
  settingsCatalogRefreshMessageLabels,
  settingsCatalogRefreshSummaryLabels,
  settingsClientHostBaseUrl,
  settingsClientLibraryId,
  settingsClientReadOnly,
  swatchBusy,
  tauri,
}: UseSettingsCatalogRefreshActionsInput) {
  function beginCatalogOperation(
    vendor: SettingsCatalogVendor,
    phase: string,
    message: string,
    startedAt: number,
  ) {
    setCatalogRefreshVendor(vendor);
    setCatalogRefreshPhase(phase);
    setCatalogRefreshProgressMessage(message);
    setCatalogRefreshStartedAt(startedAt);
    setCatalogRefreshBusy(true);
    beginCatalogRefreshResult();
    setError(null);
    setInfo(null);
  }

  async function handleAuditVendorCatalog(vendor: SettingsCatalogVendor) {
    if (!tauri || busy || swatchBusy || catalogRefreshBusy) {
      return;
    }
    const labels = settingsCatalogRefreshMessageLabels();
    const operation = tryBeginCatalogRefreshOperation({
      kind: "AUDIT",
      message: labels.discoveringCatalogMaterials,
      phase: "DISCOVER",
      vendor,
    });
    if (!operation) {
      return;
    }
    beginCatalogOperation(
      vendor,
      operation.phase,
      operation.message,
      operation.startedAt,
    );
    try {
      const summary = await auditManagedVendorCatalog(vendor, {
        clientReadOnly: settingsClientReadOnly,
        clientHostBaseUrl: settingsClientHostBaseUrl,
        clientLibraryId: settingsClientLibraryId,
      });
      if (summary.discovered_materials.length === 0) {
        throw new Error(
          buildSettingsCatalogAuditFallbackErrorMessage(vendor, labels),
        );
      }
      if (!saveDiscoveredCatalogMaterials(vendor, summary.discovered_materials)) {
        throw new Error("The catalog target changed while source discovery was running.");
      }
      completeCatalogSourceAuditResult(summary);
      setInfo(
        settingsCatalogRefreshMessageLabels({
          count: summary.discovered_materials.length,
        }).catalogDiscoverySuccess,
      );
    } catch (auditError) {
      console.error(auditError);
      const fallbackMessage = buildSettingsCatalogAuditFallbackErrorMessage(vendor, labels);
      const technicalMessage = diagnosticErrorText(auditError) || fallbackMessage;
      failCatalogRefreshResult(technicalMessage);
      setError(fallbackMessage);
    } finally {
      completeCatalogRefreshOperation(operation.id);
      setCatalogRefreshBusy(false);
      setCatalogRefreshStartedAt(null);
    }
  }

  async function handleRefreshVendorCatalog(vendor: SettingsCatalogVendor) {
    if (!tauri || busy || swatchBusy || catalogRefreshBusy) {
      return;
    }
    const materialType = getCatalogRefreshMaterial(vendor);
    if (!materialType) {
      return;
    }
    const preparingMessage = buildSettingsCatalogRefreshPreparingMessage(
      vendor,
      settingsCatalogRefreshMessageLabels(),
    );
    const operation = tryBeginCatalogRefreshOperation({
      kind: "REFRESH",
      message: preparingMessage,
      phase: "PREPARE",
      vendor,
    });
    if (!operation) {
      return;
    }
    beginCatalogOperation(
      vendor,
      operation.phase,
      operation.message,
      operation.startedAt,
    );
    try {
      const summary = await refreshManagedVendorCatalog(
        vendor,
        materialType,
        {
          clientReadOnly: settingsClientReadOnly,
          clientHostBaseUrl: settingsClientHostBaseUrl,
          clientLibraryId: settingsClientLibraryId,
        },
      );
      completeCatalogRefreshResult(summary);
      await reloadSettings();
      if (summary.imported === 0) {
        setError(
          buildSettingsCatalogRefreshZeroImportMessage(
            vendor,
            settingsCatalogRefreshMessageLabels(),
          ),
        );
      } else {
        setInfo(
          buildSettingsCatalogRefreshSuccessMessage(
            summary,
            settingsCatalogRefreshSummaryLabels(),
            locale,
          ),
        );
      }
    } catch (refreshError) {
      console.error(refreshError);
      const fallbackMessage = buildSettingsCatalogRefreshFallbackErrorMessage(
        vendor,
        settingsCatalogRefreshMessageLabels(),
      );
      failCatalogRefreshResult(diagnosticErrorText(refreshError) || fallbackMessage);
      setError(fallbackMessage);
    } finally {
      completeCatalogRefreshOperation(operation.id);
      setCatalogRefreshBusy(false);
      setCatalogRefreshStartedAt(null);
    }
  }

  return { handleAuditVendorCatalog, handleRefreshVendorCatalog };
}
